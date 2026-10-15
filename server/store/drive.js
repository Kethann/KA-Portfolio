// Google Drive as the source of a product's file.
//
// The owner pastes a normal Drive share link in the portal. Only the file's id is kept (server side, never sent to the
// browser, never put in an email or a page). A buyer gets a link of this site's own — /api/download/<token> — and when they
// press Download, a short-lived signed link of ours (/api/file/<id>?exp&sig, 60 seconds) streams the file from Drive through
// this server. The Drive link never leaves the server, the buyer's link expires on the owner's rules, and the file can't be
// shared on from a permanent address.
//
// The file must be shared as "Anyone with the link". With GOOGLE_API_KEY set the official Drive API is used (reliable for big
// files); without it the public download endpoint is used.
import { env } from '../core/env.js';
import { HttpError } from '../core/http.js';
import { hmacHex, safeEqual, randomToken } from '../core/crypto.js';

let driveFetch = (url, init) => fetch(url, init);
/** tests (and nothing else) swap the network out */
export function setDriveFetch(fn){ driveFetch = fn; }

const ID_RE = /^[A-Za-z0-9_-]{20,90}$/;
const HOSTS = new Set(['drive.google.com', 'drive.usercontent.google.com']);

/** the file id inside any Drive file link (or a bare id); '' for folders, Google Docs, other sites and anything else */
export function parseDriveId(input){
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (ID_RE.test(raw)) return raw;
  let u;
  try { u = new URL(raw); } catch { return ''; }
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) return '';
  if (/\/folders\//.test(u.pathname) || /\/drive\/(u\/\d+\/)?folders/.test(u.pathname)) return '';
  const m = /\/file\/d\/([A-Za-z0-9_-]+)/.exec(u.pathname) || null;
  const id = m ? m[1] : (u.searchParams.get('id') || '');
  return ID_RE.test(id) ? id : '';
}

function sourceUrl(id){
  const key = env('GOOGLE_API_KEY');
  return key
    ? `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(key)}`
    : `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
}

/** the file name inside a Content-Disposition header */
export function dispositionName(header){
  const h = String(header || '');
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(h);
  if (star){ try { return decodeURIComponent(star[1].trim()); } catch { /* fall through */ } }
  const plain = /filename\s*=\s*"([^"]+)"/.exec(h) || /filename\s*=\s*([^;]+)/.exec(h);
  return plain ? plain[1].trim() : '';
}

/** opens the file on Drive (optionally a byte range). Throws an HttpError the owner/buyer can understand. */
export async function openDrive(id, { range } = {}){
  const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; KA-Delivery/1.0)' };
  if (range && /^bytes=\d*-\d*$/.test(range)) headers.Range = range;
  let res;
  try { res = await driveFetch(sourceUrl(id), { headers, redirect: 'follow' }); }
  catch { throw new HttpError(502, 'The file could not be reached right now. Please try again in a moment.'); }
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (res.status === 404) { await res.body?.cancel?.(); throw new HttpError(404, 'That Drive file was not found. Check the link, and that it is shared as “Anyone with the link”.'); }
  if ((res.status === 401 || res.status === 403) && !env('GOOGLE_API_KEY')) { await res.body?.cancel?.(); throw new HttpError(502, 'Drive refused the file. Set sharing to “Anyone with the link”.'); }
  if (!res.ok && res.status !== 206) { await res.body?.cancel?.(); throw new HttpError(502, 'Drive could not provide the file right now. Please try again in a moment.'); }
  if (type.startsWith('text/html')) { await res.body?.cancel?.(); throw new HttpError(502, 'Drive did not give the file itself (it is not shared as “Anyone with the link”, or its download quota is used up).'); }
  return res;
}

/** checks a file is reachable and says what it is: { filename, bytes }  (used when the owner saves a link) */
export async function probeDrive(id){
  const key = env('GOOGLE_API_KEY');
  if (key){
    let meta;
    try {
      const r = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,size,mimeType&supportsAllDrives=true&key=${encodeURIComponent(key)}`, { headers: { Accept: 'application/json' } });
      if (r.status === 404 || r.status === 403 || r.status === 401) throw new HttpError(400, 'Drive can’t open that file. Share it as “Anyone with the link” and check the link.');
      if (!r.ok) throw new HttpError(502, 'Drive could not be reached. Try again in a moment.');
      meta = await r.json();
    } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(502, 'Drive could not be reached. Try again in a moment.'); }
    if (String(meta.mimeType || '').startsWith('application/vnd.google-apps')) throw new HttpError(400, 'That is a Google Docs/Sheets/Slides file, not a downloadable file. Upload it as a PDF or ZIP to Drive and use that link.');
    return { filename: String(meta.name || 'download'), bytes: Number(meta.size) || 0 };
  }
  let res;
  try { res = await openDrive(id, { range: 'bytes=0-0' }); }
  catch (e) { throw e instanceof HttpError && e.status === 502 && /not shared|refused|quota/.test(e.message) ? new HttpError(400, e.message) : e; }
  const range = /\/(\d+)\s*$/.exec(res.headers.get('content-range') || '');
  const length = Number(res.headers.get('content-length')) || 0;
  const bytes = range ? Number(range[1]) : (res.status === 200 ? length : 0);
  const filename = dispositionName(res.headers.get('content-disposition')) || 'download';
  await res.body?.cancel?.();
  return { filename, bytes };
}

// ---- a private copy: the file is fetched from Drive once and kept in this site's private storage --------------------
// After that, downloads never touch Google Drive (the owner can even stop sharing it on Drive).
export function storageName(filename){
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 10) : '';
  const base = (dot > 0 ? filename.slice(0, dot) : filename).normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'download';
  return ext ? `${base}.${ext}` : base;
}
export async function importDrive(id, storage, { filename } = {}){
  const res = await openDrive(id);
  const name = String(filename || dispositionName(res.headers.get('content-disposition')) || 'download').replace(/[\r\n"\\]/g, '').slice(0, 160) || 'download';
  const length = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length')) || 0;
  const path = `files/${randomToken(12)}/${storageName(name)}`;
  const bytes = await storage.putStream('deliverables', path, res.body, length, res.headers.get('content-type') || 'application/octet-stream');
  if (!bytes) throw new HttpError(502, 'Drive sent an empty file. Check the link and try again.');
  return { path, filename: name, bytes };
}

// ---- our own short-lived link to the streamed file ----------------------------------------------------------
const secret = () => env('DOWNLOAD_TOKEN_SECRET', 'local-development-only');
const sign = (fileId, exp) => hmacHex(secret(), `drivefile:${fileId}:${exp}`);

/** a link of ours that streams the file for the next `seconds` seconds */
export function signedFileUrl(fileId, seconds = 60){
  const exp = Math.floor(Date.now() / 1000) + seconds;
  return `/api/file/${fileId}?exp=${exp}&sig=${sign(fileId, exp)}`;
}
export function verifyFileUrl(fileId, exp, sig){
  return Number(exp) >= Math.floor(Date.now() / 1000) && /^[0-9a-f]{64}$/.test(String(sig || '')) && safeEqual(sign(fileId, exp), String(sig));
}

/** the Response that streams a Drive file to the buyer */
export async function streamDriveFile({ driveId, filename, request }){
  const upstream = await openDrive(driveId, { range: request.headers.get('range') || '' });
  const safeName = String(filename || 'download').replace(/[\r\n"\\]/g, '').slice(0, 160) || 'download';
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Accept-Ranges': 'bytes'
  });
  // a compressed upstream body is decoded for us, so its length no longer matches: only pass the length on when it does
  if (!upstream.headers.get('content-encoding')){
    const len = upstream.headers.get('content-length'); if (len) headers.set('Content-Length', len);
    const cr = upstream.headers.get('content-range'); if (cr && upstream.status === 206) headers.set('Content-Range', cr);
  }
  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
