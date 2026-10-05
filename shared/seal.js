// The KA license seal: a round seal (two rings, the code set in micro-type around them) holding a styled
// matrix that any phone camera reads as a link to /license/<code>. Inside it is a standard QR symbol (byte
// mode, error correction M, versions 1-15, ISO/IEC 18004, after Project Nayuki's reference), drawn with
// rounded modules and seal-shaped finder eyes on a light plate, because cameras only read dark-on-light
// codes with a quiet zone. Shared by the server (download + license pages) and the checkout pass.
// Plain JS with no dependencies, so the Worker, Node and the browser bundles can all import it.

const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24];
const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10];

function rawModules(ver){
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2){ const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
  return r;
}
const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
function gfMul(x, y){ let z = 0; for (let i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; }
function rsDivisor(degree){
  const r = new Array(degree).fill(0); r[degree - 1] = 1; let root = 1;
  for (let i = 0; i < degree; i++){ for (let j = 0; j < r.length; j++){ r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
  return r;
}
function rsRemainder(data, div){
  const r = new Array(div.length).fill(0);
  for (const b of data){ const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
  return r;
}
function alignPositions(ver, size){
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}
function penalty(m){
  const n = m.length; let s = 0, dark = 0;
  for (let a = 0; a < n; a++){
    let runR = 1, runC = 1;
    for (let b = 1; b < n; b++){
      if (m[a][b] === m[a][b - 1]){ runR++; if (runR === 5) s += 3; else if (runR > 5) s++; } else runR = 1;
      if (m[b][a] === m[b - 1][a]){ runC++; if (runC === 5) s += 3; else if (runC > 5) s++; } else runC = 1;
    }
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++){ const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) s += 3; }
  for (const row of m) for (const c of row) if (c) dark++;
  return s + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
}

// The module grid (true = dark) for a text, smallest version that fits.
export function qrMatrix(text){
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  for (; ver <= 15; ver++) if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  if (ver > 15) throw new Error('Text too long for the seal.');
  const size = ver * 4 + 17, cap = dataCodewords(ver) * 8;
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, cap - bits.length)); put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  const nb = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++){
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1)); k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const words = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) words.push(b[i]); });
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setF = (x, y, v) => { m[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < size; i++){ setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]){
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++){
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
    }
  }
  const al = alignPositions(ver, size), last = al.length - 1;
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = (mask) => {
    const d = (0 << 3) | mask;   // level M = 0b00
    let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412, bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) setF(8, i, bit(i));
    setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
    setF(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7){
    let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++){ const v = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); setF(a, c, v); setF(c, a, v); }
  }
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2){
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++){
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && i < words.length * 8){ m[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (_, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
  const apply = (k) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x]; };
  let best = 0, bestScore = Infinity;
  for (let k = 0; k < 8; k++){
    apply(k); drawFormat(k);
    const s = penalty(m); if (s < bestScore){ bestScore = s; best = k; }
    apply(k);
  }
  apply(best); drawFormat(best);
  return m;
}

// ---- license codes: KA-XXXXX-XXXXX, Crockford base32 (no I, L, O, U), 50 random bits
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// Accepts what people type or read aloud: any case, spaces or dashes, O for 0, I or L for 1.
export function normalizeLicenseCode(input){
  const t = String(input || '').toUpperCase().trim().replace(/^KA[\s-]*/, '').replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(t) ? `KA-${t.slice(0, 5)}-${t.slice(5)}` : null;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The seal as an SVG string (viewBox 0 0 240 240). `url` is what the camera opens; `code` and `issuer` are
// set around the ring. `id` keeps the ring's text path unique when several seals share one page.
export function sealSvg({ url, code, issuer = 'Kethan Artzz', id = 'ka-seal', title = 'License seal' }){
  const m = qrMatrix(url), n = m.length, quiet = 3;
  const plate = 136, cell = plate / (n + quiet * 2), off = (240 - plate) / 2, o = off + quiet * cell;
  const isEye = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  let dots = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){
    if (!m[y][x] || isEye(x, y)) continue;
    dots += `<rect x="${(o + x * cell + cell * 0.07).toFixed(2)}" y="${(o + y * cell + cell * 0.07).toFixed(2)}" width="${(cell * 0.86).toFixed(2)}" height="${(cell * 0.86).toFixed(2)}" rx="${(cell * 0.32).toFixed(2)}"/>`;
  }
  // finder eyes: a rounded 7x7 ring with a rounded 3x3 core (exactly the QR geometry, softer corners)
  const eye = (ex, ey) => {
    const x = o + ex * cell, y = o + ey * cell;
    return `<path fill-rule="evenodd" d="${roundRect(x, y, 7 * cell, 7 * cell, cell * 1.9)}${roundRect(x + cell, y + cell, 5 * cell, 5 * cell, cell * 1.3)}"/>` +
      `<rect class="eye-core" x="${(x + 2 * cell).toFixed(2)}" y="${(y + 2 * cell).toFixed(2)}" width="${(3 * cell).toFixed(2)}" height="${(3 * cell).toFixed(2)}" rx="${(cell * 0.9).toFixed(2)}"/>`;
  };
  const ring = `${esc(code)} • VERIFIED LICENSE • ${esc(String(issuer).toUpperCase())} • `;
  const pid = esc(id) + '-arc';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="${esc(title)} ${esc(code)}" class="ka-seal">` +
    `<title>${esc(title)} ${esc(code)}</title>` +
    `<defs><radialGradient id="${esc(id)}-g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#3a2416"/><stop offset="1" stop-color="#140d09"/></radialGradient>` +
    `<path id="${pid}" d="M120 120m-103 0a103 103 0 1 1 206 0a103 103 0 1 1-206 0"/></defs>` +
    `<circle cx="120" cy="120" r="118" fill="url(#${esc(id)}-g)"/>` +
    `<circle cx="120" cy="120" r="115" fill="none" stroke="#e8aa6a" stroke-width="1.6"/>` +
    `<circle cx="120" cy="120" r="92" fill="none" stroke="#e8aa6a" stroke-width=".9" stroke-dasharray="1.2 3.2" opacity=".85"/>` +
    `<text font-family="ui-monospace, 'JetBrains Mono', Menlo, monospace" font-size="9.6" font-weight="700" letter-spacing="1.9" fill="#ffd9b0">` +
    `<textPath href="#${pid}" textLength="636" lengthAdjust="spacing">${ring}</textPath></text>` +
    `<rect x="${off}" y="${off}" width="${plate}" height="${plate}" rx="16" fill="#fff6ea"/>` +
    `<g fill="#1c120c">${dots}${eye(0, 0)}${eye(n - 7, 0)}${eye(0, n - 7)}</g>` +
    `<style>.ka-seal .eye-core{fill:#7a3410}</style>` +
    `</svg>`;
}
function roundRect(x, y, w, h, r){
  const f = (v) => v.toFixed(2);
  return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}` +
    `H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
}
