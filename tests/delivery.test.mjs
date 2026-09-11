import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../server/app.js';

test('the running portfolio serves the homepage, lazy panda and all built assets',async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url)),testRoot=resolve(root,'tests');
  const dataDir=await mkdtemp(resolve(testRoot,'.delivery-'));
  let server;
  try{
    const app=await createApp({root,dataDir,password:'isolated-delivery-fixture',startServices:false});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const page=await fetch(base);assert.equal(page.status,200);
    const html=await page.text();assert(html.includes("import('./dist/assets/panda.js')"));assert(html.includes('assistant-launcher'));
    for(const asset of ['/dist/assets/panda.js','/dist/assets/three-r128.min.js']){
      const response=await fetch(base+asset);assert.equal(response.status,200,asset);
      await response.arrayBuffer();
    }
    for(const name of await readdir(resolve(root,'dist/assets'))){
      const response=await fetch(base+'/assets/'+name);assert.equal(response.status,200,name);assert((await response.arrayBuffer()).byteLength>0,name);
      if(['gallery.js','poster.js','panda.js'].includes(name))assert.equal(response.headers.get('cache-control'),'no-cache');
      else assert.match(response.headers.get('cache-control'),/immutable/);
    }
    const portfolio=await fetch(base+'/api/portfolio');assert.equal(portfolio.status,200);assert(Array.isArray((await portfolio.json()).images));
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    assert(dataDir.startsWith(testRoot+sep));await rm(dataDir,{recursive:true,force:true});
  }
});
