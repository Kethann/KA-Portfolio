// Free-plan usage warning (portal only): levels, the report, and the once-a-month email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { levelOf, usageReport, LIMITS } from '../server/admin/usage.js';
import { getStorage, setStorage } from '../server/core/storage.js';
import { jobHooks } from '../server/jobs/hooks.js';

const app = await createTestApp({ ADMIN_SETUP_TOKEN: 'setup-code-123', PUBLIC_SITE_URL: 'http://shop.test' });
test.after(() => app.close());

test('levels: under 80% ok, 80% warn, 95% critical', () => {
  assert.equal(levelOf([{ ratio: 0.1 }, { ratio: 0.79 }]), 'ok');
  assert.equal(levelOf([{ ratio: 0.8 }, { ratio: 0.1 }]), 'warn');
  assert.equal(levelOf([{ ratio: 0.2 }, { ratio: 0.96 }]), 'critical');
  assert.equal(levelOf([{ ratio: null }]), 'ok');
});

test('the report measures storage and database, and the portal endpoint is admin-only', async () => {
  const r = await usageReport({ fresh: true });
  assert.equal(r.level, 'ok');
  assert.deepEqual(r.items.map(i => i.key), ['files', 'database']);
  assert.equal(r.items[0].limit, LIMITS.files);
  assert.ok(r.items[1].used > 0, 'database size is measured');
  assert.equal((await app.call('GET', '/api/admin/usage')).status, 401);
});

test('near the limit: the portal report says warn, and the daily job emails the owner once a month', async () => {
  const real = getStorage();
  const fake = { ...real, usage: async () => ({ bytes: Math.round(LIMITS.files * 0.9 / 3), count: 1 }) };   // 3 folders -> 90% in total
  setStorage(fake);
  try {
    const r = await usageReport({ fresh: true });
    assert.equal(r.level, 'warn'); assert.equal(Math.round(r.items[0].ratio * 100), 90);
    const before = app.mail.sent.length;
    const first = await jobHooks.daily.usageAlert();
    assert.equal(first.emailed, true);
    assert.equal(app.mail.sent.length, before + 1);
    assert.match(app.mail.sent.at(-1).subject, /getting full/);
    assert.match(app.mail.sent.at(-1).text, /90%/);
    const second = await jobHooks.daily.usageAlert();
    assert.equal(second.emailed, false, 'not again the next day');
    assert.equal(app.mail.sent.length, before + 1);
  } finally { setStorage(real); }
});
