// The single Vercel Function behind every /api/* URL (vercel.json rewrites /api/:path* here and
// passes the original path as ?__path=). Standard Web Request -> Response; all routing and logic
// is host-neutral and lives in server/.
import { vercelFetch } from '../server/platform/vercel.js';

export const GET = vercelFetch;
export const HEAD = vercelFetch;
export const POST = vercelFetch;
export const PUT = vercelFetch;
export const PATCH = vercelFetch;
export const DELETE = vercelFetch;
export const OPTIONS = vercelFetch;
