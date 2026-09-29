// In-process test harness: real handler + real Postgres (PGlite) + in-memory email + temp storage.
// call(method, path, {body, headers, ip, country}) -> {status, headers, json, text}
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setEnvSource } from '../../server/core/env.js';
import { setDatabase, wrapPglite } from '../../server/core/db.js';
import { setEmailTransport } from '../../server/core/email.js';
import { setStorage, localStorage } from '../../server/core/storage.js';
import { openPglite } from '../../server/dev/pglite.js';

export async function createTestApp(envVars = {}){
  const dataDir = await mkdtemp(resolve(tmpdir(), 'ka-test-'));
  const vars = { KA_DATA_DIR: dataDir, OWNER_EMAIL: 'owner@example.com', MAIL_FROM: 'shop@example.com', DOWNLOAD_TOKEN_SECRET: 'test-download-secret', CRON_SECRET: 'test-cron-secret', ...envVars };
  setEnvSource(vars);
  const pg = await openPglite();
  setDatabase(wrapPglite(pg));
  const mail = { sent: [], async send(msg){ this.sent.push(msg); return { id: 'm' + this.sent.length }; } };
  setEmailTransport(mail);
  const storage = localStorage(dataDir);
  setStorage(storage);
  const { handle } = await import('../../server/handler.js');
  const platform = { name: 'test', clientIp: (r) => r.__ip || '203.0.113.7', geo: (r) => r.__country ? { country: r.__country, region: null, city: null, timezone: null, provider: 'test' } : null };
  async function call(method, path, { body, headers = {}, ip, country, raw } = {}){
    const init = { method, headers: { ...headers } };
    if (body !== undefined){ init.body = raw ? body : JSON.stringify(body); if (!raw) init.headers['content-type'] ??= 'application/json'; }
    const request = new Request('http://shop.test' + path, init);
    if (ip) request.__ip = ip;
    if (country) request.__country = country;
    const res = await handle(request, platform);
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, json, text };
  }
  return { call, pg, mail, storage, vars, dataDir, async close(){ await pg.close(); await rm(dataDir, { recursive: true, force: true }); } };
}
