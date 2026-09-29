// Minimal ZIP writer for the browser (no dependency): builds a "stored" (uncompressed) ZIP, or copies an
// existing ZIP's entries byte-for-byte and appends new ones (used to add LICENSE.txt to a deliverable).
// ZIP64 is not needed: deliverables are capped at 50 MB.
const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(data: Uint8Array){ let c = 0xffffffff; for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function dosTime(d: Date){
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
type Entry = { name: Uint8Array; local: Uint8Array; data: Uint8Array; cd: Uint8Array };

function newEntry(name: string, data: Uint8Array, now = new Date()): Omit<Entry, 'cd'> & { meta: { crc: number; size: number; time: number; date: number; flags: number; method: number; csize: number } }{
  const n = new TextEncoder().encode(name), crc = crc32(data), { time, date } = dosTime(now);
  const h = new DataView(new ArrayBuffer(30));
  h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
  h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
  h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
  return { name: n, local: new Uint8Array(h.buffer), data, meta: { crc, size: data.length, csize: data.length, time, date, flags: 0x0800, method: 0 } };
}
function cdRecord(name: Uint8Array, m: { crc: number; size: number; csize: number; time: number; date: number; flags: number; method: number }, offset: number, extra = new Uint8Array(0), comment = new Uint8Array(0), attrs = 0){
  const h = new DataView(new ArrayBuffer(46));
  h.setUint32(0, 0x02014b50, true); h.setUint16(4, 20, true); h.setUint16(6, 20, true); h.setUint16(8, m.flags, true); h.setUint16(10, m.method, true);
  h.setUint16(12, m.time, true); h.setUint16(14, m.date, true); h.setUint32(16, m.crc, true); h.setUint32(20, m.csize, true); h.setUint32(24, m.size, true);
  h.setUint16(28, name.length, true); h.setUint16(30, extra.length, true); h.setUint16(32, comment.length, true); h.setUint32(38, attrs, true); h.setUint32(42, offset, true);
  return concat([new Uint8Array(h.buffer), name, extra, comment]);
}
function eocd(count: number, cdSize: number, cdOffset: number){
  const h = new DataView(new ArrayBuffer(22));
  h.setUint32(0, 0x06054b50, true); h.setUint16(8, count, true); h.setUint16(10, count, true); h.setUint32(12, cdSize, true); h.setUint32(16, cdOffset, true);
  return new Uint8Array(h.buffer);
}
function concat(parts: Uint8Array[]){ const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts){ out.set(p, o); o += p.length; } return out; }

export function zipFiles(files: { name: string; data: Uint8Array }[]): Blob{
  const parts: Uint8Array[] = [], cds: Uint8Array[] = []; let offset = 0;
  for (const f of files){
    const e = newEntry(f.name, f.data);
    cds.push(cdRecord(e.name, e.meta, offset));
    parts.push(e.local, e.name, e.data); offset += e.local.length + e.name.length + e.data.length;
  }
  const cd = concat(cds);
  return new Blob([concat([...parts, cd, eocd(files.length, cd.length, offset)])], { type: 'application/zip' });
}

// Copies every entry of `zip` unchanged and appends `extra` files (replacing same-named ones).
export function appendToZip(zip: Uint8Array, extra: { name: string; data: Uint8Array }[]): Blob{
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let e = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50){ e = i; break; }
  if (e < 0) throw new Error('This file isn’t a readable ZIP.');
  const count = v.getUint16(e + 10, true), cdOffset = v.getUint32(e + 16, true);
  if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('Large (ZIP64) archives aren’t supported here.');
  const replace = new Set(extra.map(x => x.name));
  const parts: Uint8Array[] = [], cds: Uint8Array[] = []; let offset = 0, p = cdOffset, kept = 0;
  for (let i = 0; i < count; i++){
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('This ZIP looks damaged.');
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), time = v.getUint16(p + 12, true), date = v.getUint16(p + 14, true);
    const crc = v.getUint32(p + 16, true), csize = v.getUint32(p + 20, true), size = v.getUint32(p + 24, true);
    const nLen = v.getUint16(p + 28, true), xLen = v.getUint16(p + 30, true), cLen = v.getUint16(p + 32, true), attrs = v.getUint32(p + 38, true), lho = v.getUint32(p + 42, true);
    const name = zip.subarray(p + 46, p + 46 + nLen), cdExtra = zip.subarray(p + 46 + nLen, p + 46 + nLen + xLen), comment = zip.subarray(p + 46 + nLen + xLen, p + 46 + nLen + xLen + cLen);
    p += 46 + nLen + xLen + cLen;
    if (replace.has(new TextDecoder().decode(name))) continue;
    // the local record: header + name + extra + data (+ data descriptor when flag bit 3 is set)
    const lnLen = v.getUint16(lho + 26, true), lxLen = v.getUint16(lho + 28, true);
    let end = lho + 30 + lnLen + lxLen + csize;
    if (flags & 8) end += v.getUint32(end, true) === 0x08074b50 ? 16 : 12;
    parts.push(zip.subarray(lho, end));
    cds.push(cdRecord(name, { crc, size, csize, time, date, flags, method }, offset, cdExtra, comment, attrs));
    offset += end - lho; kept++;
  }
  for (const f of extra){
    const x = newEntry(f.name, f.data);
    cds.push(cdRecord(x.name, x.meta, offset));
    parts.push(x.local, x.name, x.data); offset += x.local.length + x.name.length + x.data.length;
  }
  const cd = concat(cds);
  return new Blob([concat([...parts, cd, eocd(kept + extra.length, cd.length, offset)])], { type: 'application/zip' });
}

// LICENSE.txt for a product, packaged inside its download.
export function licenseText(o: { product: string; license: string; summary?: string; body?: string; version?: number; seller?: string }){
  return [`${o.product}`, `License: ${o.license}${o.version ? ` (version ${o.version})` : ''}`, o.seller ? `Licensor: ${o.seller}` : '', '', o.summary || '', '', (o.body || '').replace(/\r\n/g, '\n'), '',
    'This license applies to the buyer named on the purchase receipt.', ''].join('\n').replace(/\n{3,}/g, '\n\n');
}
