// Applies supabase/migrations/*.sql to the database in DATABASE_URL, in order, once each.
// Usage (from your PC, with DATABASE_URL in .env): npm run db:migrate
import { config } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const root = fileURLToPath(new URL('..', import.meta.url));
config({ path: resolve(root, '.env') });
const url = process.env.DATABASE_URL;
if (!url){ console.error('Set DATABASE_URL in .env first (Supabase -> Connect -> Transaction pooler).'); process.exit(1); }

const sql = postgres(url, { max: 1, prepare: false, ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require', onnotice: () => {} });
try {
  await sql.unsafe(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now());
    alter table _migrations enable row level security;
    revoke all on _migrations from anon, authenticated;`);
  const done = new Set((await sql`select name from _migrations`).map(r => r.name));
  const dir = resolve(root, 'supabase/migrations');
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const name of files){
    if (done.has(name)) continue;
    process.stdout.write(`Applying ${name}... `);
    await sql.unsafe(await readFile(resolve(dir, name), 'utf8'));
    await sql`insert into _migrations (name) values (${name})`;
    applied++; console.log('done');
  }
  console.log(applied ? `${applied} migration(s) applied.` : 'Database is up to date.');
} catch (err){
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
