import { createDevServer } from '../server/platform/node-dev.js';

async function test() {
  console.log('--- Starting dev server on port 9988 ---');
  const srv = await createDevServer({ port: 9988 });
  const base = 'http://127.0.0.1:9988';
  
  const endpoints = [
    { name: 'Root Homepage', path: '/' },
    { name: 'Health Endpoint', path: '/api/health' },
    { name: 'Live Site Data', path: '/api/live' },
    { name: 'Public Config', path: '/api/public-config' },
    { name: 'Store Catalog', path: '/api/store/catalog' },
    { name: 'Tips Listing', path: '/api/tips' },
    { name: 'Creator Portal', path: '/portal/' }
  ];

  let allOk = true;
  for (const ep of endpoints) {
    const t0 = Date.now();
    try {
      const res = await fetch(base + ep.path);
      const dt = Date.now() - t0;
      const pass = res.status === 200 || res.status === 304;
      console.log(`[${pass ? 'PASS' : 'WARN'}] ${ep.name} (${ep.path}): HTTP ${res.status} (${dt}ms)`);
      if (!pass) allOk = false;
    } catch (err) {
      console.error(`[FAIL] ${ep.name} (${ep.path}): ${err.message}`);
      allOk = false;
    }
  }

  srv.close();
  console.log(allOk ? '\n=== ALL LOCAL ENDPOINTS RESPONDING PERFECTLY ===' : '\n=== SOME ENDPOINTS FAILED ===');
}

test().catch(e => { console.error(e); process.exit(1); });
