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
  if (method !== 'GET' && !/^\/(login|logout|setup|markdown|search|uploads$)/.test(path)) window.dispatchEvent(new CustomEvent(CHANGED, { detail: path }));
  return data as T;
}

export const get = <T = any>(path: string, signal?: AbortSignal) => api<T>('GET', path, undefined, { signal });
export const post = <T = any>(path: string, body: unknown = {}) => api<T>('POST', path, body);
export const put = <T = any>(path: string, body: unknown = {}) => api<T>('PUT', path, body);
export const patch = <T = any>(path: string, body: unknown = {}) => api<T>('PATCH', path, body);
export const del = <T = any>(path: string) => api<T>('DELETE', path);

// Uploads go straight to storage with a short-lived signed URL; the file never passes through our API.
export async function upload(file: File, kind: 'image' | 'font' | 'deliverable', onProgress?: (p: number) => void){
  const type = file.type || guessType(file.name);
  const sig = await post<{ bucket: string; path: string; uploadUrl: string; method?: string; publicUrl: string | null }>('/uploads', { kind, contentType: type, bytes: file.size, filename: file.name });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(sig.method || 'PUT', sig.uploadUrl);
    xhr.setRequestHeader('Content-Type', type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError('The upload was refused by storage.', xhr.status, 'upload')));
    xhr.onerror = () => reject(new ApiError('The upload failed. Check your connection and try again.', 0, 'upload'));
    xhr.send(file);
  });
  return sig;
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
