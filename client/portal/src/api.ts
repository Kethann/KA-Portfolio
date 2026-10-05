// Portal API client. The session cookie is HttpOnly (JS never sees it); the CSRF token lives only in
// memory and is sent on every write. A 401 from any call means the session ended: the app shows the
// sign-in screen over the desktop, and nothing is retried automatically.
let csrf = '';
export function setCsrf(token: string){ csrf = token; }

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public data?: any){ super(message); }
}

const SIGNED_OUT = 'ka:signed-out';
// Every successful write announces itself, so all open windows refresh (Overview after an order is
// refunded, Products after a coupon changes a price…) instead of waiting for their next poll.
const CHANGED = 'ka:changed';
export function onDataChanged(fn: (path: string) => void){
  const h = (e: Event) => fn((e as CustomEvent<string>).detail);
  window.addEventListener(CHANGED, h); return () => window.removeEventListener(CHANGED, h);
}
// Site tabs open in this browser pick up a publish at once (others notice within 15 seconds).
let live: BroadcastChannel | null = null;
function tellSiteTabs(){
  try { (live ||= new BroadcastChannel('ka-live')).postMessage('changed'); } catch { /* old browser: they still poll */ }
}
export function onSignedOut(fn: () => void){ window.addEventListener(SIGNED_OUT, fn); return () => window.removeEventListener(SIGNED_OUT, fn); }

export async function api<T = any>(method: string, path: string, body?: unknown, opts: { signal?: AbortSignal; raw?: boolean } = {}): Promise<T>{
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  let res: Response;
  try {
    res = await fetch('/api/admin' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', signal: opts.signal, cache: 'no-store' });
  } catch (err){
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(navigator.onLine ? 'Couldn’t reach the server. Try again in a moment.' : 'You’re offline. Check your connection.', 0, 'network');
  }
  if (opts.raw && res.ok) return res as unknown as T;
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON (e.g. a proxy error page) */ }
  if (!res.ok){
    const message = (data && data.error) || (res.status >= 500 ? 'The server had a problem. Try again.' : `Request failed (${res.status}).`);
    const code = data && data.code;
    if (res.status === 401 && (code === 'signed_out' || !code) && !path.startsWith('/login') && !path.startsWith('/setup')) window.dispatchEvent(new Event(SIGNED_OUT));
    throw new ApiError(message, res.status, code, data);
  }
  if (method !== 'GET' && !/^\/(login|logout|setup|markdown|search|uploads$)/.test(path)){
    window.dispatchEvent(new CustomEvent(CHANGED, { detail: path }));
    tellSiteTabs();
  }
  return data as T;
}

export const get = <T = any>(path: string, signal?: AbortSignal) => api<T>('GET', path, undefined, { signal });
export const post = <T = any>(path: string, body: unknown = {}) => api<T>('POST', path, body);
export const put = <T = any>(path: string, body: unknown = {}) => api<T>('PUT', path, body);
export const patch = <T = any>(path: string, body: unknown = {}) => api<T>('PATCH', path, body);
export const del = <T = any>(path: string) => api<T>('DELETE', path);

// Uploads go straight to storage with a signed URL; the file never passes through our API. Small files go up in one
// request; big ones (the server says `chunked`) in parts, 3 at a time, each retried, so any size works.
type UploadSig = { bucket: string; path: string; uploadUrl: string; method?: string; publicUrl: string | null; chunked?: boolean; partSize?: number };
export async function upload(file: File, kind: 'image' | 'font' | 'deliverable', onProgress?: (p: number) => void){
  // browsers report fonts as application/x-font-ttf, application/font-woff or nothing at all: for images and fonts the file's extension decides
  const type = (kind !== 'deliverable' && guessType(file.name)) || file.type || guessType(file.name);
  const sig = await post<UploadSig>('/uploads', { kind, contentType: type, bytes: file.size, filename: file.name });
  if (sig.chunked) await uploadInParts(file, sig, type, onProgress);
  else await sendBlob(sig.method || 'PUT', sig.uploadUrl, file, type, (n) => onProgress?.(n / file.size));
  return sig;
}

function sendBlob(method: string, url: string, body: Blob, type: string, onLoaded?: (bytes: number) => void){
  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader('Content-Type', type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onLoaded?.(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300){ try { resolve(JSON.parse(xhr.responseText || '{}')); } catch { resolve({}); } }
      else reject(new ApiError(xhr.status === 403 ? 'The upload link expired. Try again.' : 'The upload was refused by storage.', xhr.status, 'upload'));
    };
    xhr.onerror = () => reject(new ApiError('The upload failed. Check your connection and try again.', 0, 'upload'));
    xhr.send(body);
  });
}

async function uploadInParts(file: File, sig: UploadSig, type: string, onProgress?: (p: number) => void){
  const size = sig.partSize || 50 * 1024 * 1024, count = Math.ceil(file.size / size);
  const at = (q: string) => sig.uploadUrl + (sig.uploadUrl.includes('?') ? '&' : '?') + q;
  const start = await fetch(at(`mpu=start&type=${encodeURIComponent(type || 'application/octet-stream')}`), { method: 'POST' });
  if (!start.ok) throw new ApiError('The upload could not start. Try again.', start.status, 'upload');
  const { uploadId } = await start.json();
  const done: { part: number; etag: string }[] = [], loaded = new Array(count).fill(0);
  const report = () => onProgress?.(loaded.reduce((a, b) => a + b, 0) / file.size);
  let next = 0;
  const worker = async () => {
    while (next < count){
      const i = next++, blob = file.slice(i * size, Math.min(file.size, (i + 1) * size));
      for (let attempt = 1; ; attempt++){
        try {
          const r = await sendBlob('PUT', at(`uploadId=${encodeURIComponent(uploadId)}&part=${i + 1}`), blob, 'application/octet-stream', (n) => { loaded[i] = n; report(); });
          done.push({ part: r.part, etag: r.etag }); loaded[i] = blob.size; report();
          break;
        } catch (err){
          if (attempt >= 3) throw err;
          loaded[i] = 0; report();
          await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(3, count) }, worker));
    const fin = await fetch(at(`uploadId=${encodeURIComponent(uploadId)}&mpu=complete`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parts: done }) });
    if (!fin.ok) throw new ApiError('The upload could not be finished. Try again.', fin.status, 'upload');
  } catch (err){
    fetch(at(`uploadId=${encodeURIComponent(uploadId)}`), { method: 'DELETE' }).catch(() => {});   // don't leave half an upload in storage
    throw err;
  }
}
function guessType(name: string){
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', zip: 'application/zip' } as Record<string, string>)[ext] || 'application/octet-stream';
}

// Files served by our API (CSV, invoices): opened through a same-origin fetch so the cookie applies.
export async function downloadFile(path: string, filename: string){
  const res = await api<Response>('GET', path, undefined, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
