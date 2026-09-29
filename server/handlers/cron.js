// Scheduled jobs (vercel.json "crons"). Each is safe to run twice.
//   daily  (01:00 UTC): keep-alive query, expire unpaid orders, daily report when enabled
//   weekly (Mon 02:00 UTC): backup export, weekly report when enabled
import { json } from '../core/http.js';
import { getDb } from '../core/db.js';
import { getSetting, setSetting } from '../core/settings.js';
import { runBackup } from '../jobs/backup.js';
import { jobHooks } from '../jobs/hooks.js';

export async function daily(){
  const db = await getDb();
  const results = {};
  // A real read and write every day: Supabase pauses free projects after 7 days without activity.
  await db.query('select 1');
  const system = await getSetting('system');
  await setSetting('system', { ...system, lastHeartbeat: new Date().toISOString() });
  results.heartbeat = 'ok';
  for (const [name, fn] of Object.entries(jobHooks.daily)){
    try { results[name] = await fn(); } catch (err){ results[name] = 'failed'; console.error(`[cron] daily ${name} failed: ${err && err.name}`); }
  }
  return json({ ok: true, results });
}

export async function weekly(){
  const results = {};
  try {
    const b = await runBackup();
    const system = await getSetting('system');
    await setSetting('system', { ...system, lastBackup: new Date().toISOString() });
    results.backup = { bytes: b.bytes };
  } catch (err){
    results.backup = 'failed';
    console.error(`[cron] backup failed: ${err && err.name}`);
  }
  for (const [name, fn] of Object.entries(jobHooks.weekly)){
    try { results[name] = await fn(); } catch (err){ results[name] = 'failed'; console.error(`[cron] weekly ${name} failed: ${err && err.name}`); }
  }
  return json({ ok: true, results });
}
