// The local server delivers the homepage, every built asset and the public APIs the page needs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDevServer} from '../server/platform/node-dev.js';

test('the running site serves the homepage, lazy bundles and all built assets', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url)), testRoot = resolve(root, 'tests');
  const dataDir = await mkdtemp(resolve(testRoot, '.delivery-'));
  let server;
  try {
    server = await createDevServer({ port: 0, dataDir });
    const base = 'http://127.0.0.1:' + server.address().port;
    const page = await fetch(base); assert.equal(page.status, 200);
    const html = await page.text();
    assert(html.includes("import('./dist/assets/panda.js')")); assert(html.includes('assistant-launcher'));
    assert(html.includes('import("./dist/assets/studio.js")'), 'the Typography studio bundle is wired to the menu');
    for (const asset of ['/dist/assets/panda.js', '/dist/assets/three-r128.min.js', '/dist/assets/studio.js']){
      const response = await fetch(base + asset); assert.equal(response.status, 200, asset); await response.arrayBuffer();
    }
    for (const name of await readdir(resolve(root, 'dist/assets'))){
      const response = await fetch(base + '/assets/' + name);
      assert.equal(response.status, 200, name); assert((await response.arrayBuffer()).byteLength > 0, name);
    }
    const portfolio = await fetch(base + '/api/portfolio'); assert.equal(portfolio.status, 200);
    const doc = await portfolio.json();
    assert(Array.isArray(doc.images) && doc.images.length > 0); assert(Array.isArray(doc.folders)); assert.equal(typeof doc.revision, 'number');
    const missing = await fetch(base + '/api/not-a-route'); assert.equal(missing.status, 404); assert.equal(typeof (await missing.json()).error, 'string');
    for (const messages of [null, [], [{role:'user', content:' '}], [{role:'user', content:'x'.repeat(4001)}], [{role:'user', content:'Hello'}, {role:'assistant', content:'Hi'}]]){
      const response = await fetch(base + '/api/assistant', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({messages}) });
      assert.equal(response.status, 400); assert.equal(typeof (await response.json()).error, 'string');
    }
    const unsupported = await fetch(base + '/api/contact', { method:'POST', headers:{'Content-Type':'application/json; charset=invalid'}, body:'{}' });
    assert.equal(unsupported.status, 415); assert.equal(typeof (await unsupported.json()).error, 'string');
    const malformed = await fetch(base + '/api/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{' });
    assert.equal(malformed.status, 400);
    const traversal = await fetch(base + '/images/..%2F..%2Fpackage.json'); assert.equal(traversal.status, 404);
    const privateStore = await fetch(base + '/__storage/deliverables/x.zip'); assert.equal(privateStore.status, 403);
  } finally {
    if (server) await server.shutdown();
    assert(dataDir.startsWith(testRoot + sep)); await rm(dataDir, { recursive: true, force: true });
  }
});
