// Local/test Postgres: PGlite (Postgres compiled to WebAssembly) with the Supabase client roles
// and every migration in supabase/migrations applied in order. Never used in production.
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));

export async function migrate(pg){
  await pg.exec(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
  grant usage on schema public to anon, authenticated;`);
  await pg.exec(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await pg.query('select name from _migrations')).rows.map(r => r.name));
  for (const name of (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort()){
    if (done.has(name)) continue;
    await pg.exec(await readFile(resolve(migrationsDir, name), 'utf8'));
    await pg.query('insert into _migrations (name) values ($1)', [name]);
  }
}

export async function openPglite(dataDir){
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) await mkdir(dirname(resolve(dataDir)), { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  await migrate(pg);
  return pg;
}
