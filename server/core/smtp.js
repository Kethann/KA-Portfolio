// Minimal SMTP client for Gmail (implicit TLS on port 465, AUTH LOGIN with a Google App Password).
// On Cloudflare Workers it uses the `cloudflare:sockets` API; in Node (local testing) it uses node:tls.
// Only what sending a transactional email needs: one recipient, text + HTML, attachments.

const isWorker = () => typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

async function openTls(host, port){
  if (isWorker()){
    const { connect } = await import('cloudflare:sockets');
    const sock = connect({ hostname: host, port }, { secureTransport: 'on' });
    return { readable: sock.readable, writable: sock.writable, close: () => sock.close().catch(() => {}) };
  }
  const tls = await import('node:tls');
  const { Duplex } = await import('node:stream');
  const s = tls.connect({ host, port, servername: host });
  await new Promise((resolve, reject) => { s.once('secureConnect', resolve); s.once('error', reject); });
  const web = Duplex.toWeb(s);
  return { readable: web.readable, writable: web.writable, close: async () => { s.end(); } };
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const wrap = (s) => s.replace(/.{1,76}/g, '$&\r\n');
const encodeHeader = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
const addr = (name, email) => name ? `${encodeHeader(String(name).replace(/["\r\n]/g, ''))} <${email}>` : `<${email}>`;
const clean = (s) => String(s || '').replace(/[\r\n]/g, ' ');

// RFC 5322 message with text + HTML alternatives and optional attachments.
export function buildMime({ from, to, replyTo, subject, text, html, attachments = [] }){
  const rand = () => Math.random().toString(36).slice(2);
  const mixed = `m_${rand()}`, alt = `a_${rand()}`;
  const domain = String(from.email).split('@')[1] || 'localhost';
  const head = [
    `From: ${addr(from.name, from.email)}`, `To: ${addr('', to)}`, ...(replyTo ? [`Reply-To: ${addr('', replyTo)}`] : []),
    `Subject: ${encodeHeader(clean(subject))}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${rand()}@${domain}>`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${mixed}"`, ''
  ];
  const body = [
    `--${mixed}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '',
    `--${alt}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(text || '')),
    `--${alt}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(html || '')),
    `--${alt}--`,
    ...attachments.flatMap(a => [
      `--${mixed}`, `Content-Type: application/octet-stream; name="${clean(a.name).replace(/"/g, '')}"`, 'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${clean(a.name).replace(/"/g, '')}"`, '', wrap(Buffer.from(a.content).toString('base64'))
    ]),
    `--${mixed}--`, ''
  ];
  return [...head, ...body].join('\r\n').replace(/^\./gm, '..');   // dot-stuffing
}

export async function smtpSend({ host = 'smtp.gmail.com', port = 465, user, pass, message, envelopeTo, timeoutMs = 20000 }){
  const conn = await openTls(host, port);
  const reader = conn.readable.getReader(), writer = conn.writable.getWriter();
  const dec = new TextDecoder(), enc = new TextEncoder();
  let buf = '';
  const deadline = Date.now() + timeoutMs;
  async function reply(){
    for (;;){
      const lines = buf.split('\r\n');
      // a complete reply ends with a line "NNN text" (a space after the code, not a dash)
      const end = lines.findIndex(l => /^\d{3} /.test(l));
      if (end >= 0){
        const code = Number(lines[end].slice(0, 3)), text = lines.slice(0, end + 1).join('\n');
        buf = lines.slice(end + 1).join('\r\n');
        return { code, text };
      }
      if (Date.now() > deadline) throw new Error('The mail server did not answer in time.');
      const { value, done } = await reader.read();
      if (done) throw new Error('The mail server closed the connection.');
      buf += dec.decode(value, { stream: true });
    }
  }
  const send = (line) => writer.write(enc.encode(line + '\r\n'));
  async function step(line, ok){
    if (line !== null) await send(line);
    const r = await reply();
    if (!ok.includes(r.code)){
      const e = new Error(`Mail server refused (${r.code}).`); e.status = r.code; e.detail = r.text.slice(0, 200); throw e;
    }
    return r;
  }
  try {
    await step(null, [220]);
    await step(`EHLO ${String(user).split('@')[1] || 'localhost'}`, [250]);
    await step('AUTH LOGIN', [334]);
    await step(b64(user), [334]);
    await step(b64(pass), [235]);
    await step(`MAIL FROM:<${user}>`, [250]);
    await step(`RCPT TO:<${envelopeTo}>`, [250, 251]);
    await step('DATA', [354]);
    await writer.write(enc.encode(message + '\r\n.\r\n'));
    const done = await step(null, [250]);
    await send('QUIT').catch(() => {});
    return { id: (/\b[\w.-]+ - gsmtp/.exec(done.text) || [''])[0] };
  } finally {
    try { reader.releaseLock(); writer.releaseLock(); } catch { /* already closed */ }
    await conn.close();
  }
}
