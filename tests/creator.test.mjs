import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../server/app.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('older saved artwork receives missing metadata without losing edits',async()=>{
  const dataDir=await mkdtemp(resolve(root,'tests/.creator-'));
  try{
    const old=JSON.parse(await readFile(resolve(root,'server/legacy-portfolio-seed.json'),'utf8'));
    old.details.portfolioTitle='Existing edited title';
    await writeFile(resolve(dataDir,'portfolio.json'),JSON.stringify(old));
    await createApp({root,dataDir,password:'isolated-migration-test',startServices:false});
    const migrated=JSON.parse(await readFile(resolve(dataDir,'portfolio.json'),'utf8'));
    assert.equal(migrated.details.portfolioTitle,old.details.portfolioTitle);
    assert.equal(migrated.images.length,old.images.length);
    assert.deepEqual(migrated.images.map(p=>p.slug),old.images.map(p=>p.slug));
    assert(migrated.images.every(p=>p.id&&Array.isArray(p.technologies)));
    assert(migrated.details.openLabel);
  }finally{if(dataDir.startsWith(resolve(root,'tests/.creator-')))await rm(dataDir,{recursive:true,force:true});}
});
test('private creator workflow, persistent portfolio/images/inbox, and public isolation',async()=>{
  const dataDir=await mkdtemp(resolve(root,'tests/.creator-'));
  let server,base,cookie='',csrf='';
  const password='fixture-passcode-'+Date.now();
  async function start(){const app=await createApp({root,dataDir,password,startServices:false});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
  async function request(path,{method='GET',body,headers={}}={}){
    const response=await fetch(base+path,{method,headers:{...(body instanceof Buffer?{}:{'Content-Type':'application/json'}),Cookie:cookie,'X-CSRF-Token':csrf,...headers},body:body===undefined?undefined:body instanceof Buffer?body:JSON.stringify(body)});
    return response;
  }
  async function login(pass=password){const response=await request('/api/creator/login',{method:'POST',body:{password:pass}});assert.equal(response.status,200);cookie=response.headers.get('set-cookie').split(';')[0];assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/SameSite=Strict/);csrf=(await response.json()).csrf;}
  try{
    await start();assert.equal((await request('/api/creator/messages')).status,401);
    assert.equal((await request('/api/creator/login',{method:'POST',body:{password:'wrong'}})).status,401);
    for(const path of ['/server/data/auth.json','/server/data/inbox.json','/server/knowledge.json','/.env','/generator/build_cinematic.py','/assets/creator.html'])assert.equal((await request(path)).status,404,path);
    const homepage=await (await request('/')).text();
    assert(!/<(?:a|form)\b[^>]*(?:href|action)\s*=\s*["'][^"']*\/creator\b/i.test(homepage),'public navigation must not expose creator access');
    assert.equal(homepage,await readFile(resolve(root,'index.html'),'utf8'),'serve the original KA homepage');
    assert.equal((await request('/creator')).status,200);
    assert.equal((await request('/api/contact',{method:'POST',body:{name:'A'}})).status,400);
    assert.equal((await request('/api/contact',{method:'POST',headers:{Origin:'https://another.example'},body:{}})).status,403);
    const message={name:'Sample Person',email:'sample@example.test',subject:'A test collaboration',message:'Private fixture message'};
    assert.equal((await request('/api/contact',{method:'POST',body:message})).status,201);
    const publicSite=await (await request('/api/portfolio')).json();assert.equal(publicSite.images.length,5);assert(!JSON.stringify(publicSite).includes(message.email));
    await login();let inbox=await (await request('/api/creator/messages')).json();assert.equal(inbox.length,1);assert.equal(inbox[0].message,message.message);
    assert.equal((await request('/api/creator/messages/'+inbox[0].id,{method:'PATCH',headers:{'X-CSRF-Token':''},body:{status:'read'}})).status,403);
    assert.equal((await request('/api/creator/messages/'+inbox[0].id,{method:'PATCH',body:{status:'read'}})).status,200);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFZkAAAAASUVORK5CYII=','base64');
    const upload=await request('/api/creator/upload',{method:'POST',headers:{'Content-Type':'image/png'},body:png});assert.equal(upload.status,201);const {src}=await upload.json();
    assert.equal((await request('/api/creator/upload',{method:'POST',headers:{'Content-Type':'image/png'},body:Buffer.from('<svg onload=alert(1)>not raster</svg>')})).status,400);
    publicSite.details.portfolioTitle='Persistent edited heading';publicSite.folders.reverse();publicSite.images.reverse();publicSite.images[0].src=src;publicSite.images[0].description='Edited project description';publicSite.images[0].technologies=['Three.js','GSAP'];publicSite.images[0].cat=publicSite.folders[0];
    let update=await request('/api/creator/portfolio',{method:'PUT',body:publicSite});assert.equal(update.status,200);let saved=await update.json();
    assert.equal((await request('/api/creator/portfolio',{method:'PUT',body:publicSite})).status,409);
    assert.equal((await request('/api/creator/assets/'+src.split('/').pop(),{method:'DELETE'})).status,409);
    const unsafe=structuredClone(saved);unsafe.images[0].link='javascript:alert(1)';assert.equal((await request('/api/creator/portfolio',{method:'PUT',body:unsafe})).status,400);
    const hashFile=await readFile(resolve(dataDir,'auth.json'),'utf8');assert(!hashFile.includes(password));
    await new Promise(r=>server.close(r));cookie='';csrf='';await start();
    saved=await (await request('/api/portfolio')).json();assert.equal(saved.details.portfolioTitle,'Persistent edited heading');assert.equal(saved.images[0].description,'Edited project description');assert.equal((await request(src)).status,200);
    await login();inbox=await (await request('/api/creator/messages')).json();assert.equal(inbox[0].status,'read');
    saved.images.shift();assert.equal((await request('/api/creator/portfolio',{method:'PUT',body:saved})).status,200);assert.equal((await request('/api/creator/assets/'+src.split('/').pop(),{method:'DELETE'})).status,200);
    assert.equal((await request('/api/creator/messages/'+inbox[0].id,{method:'DELETE'})).status,200);
    const newPassword=password+'-changed';assert.equal((await request('/api/creator/password',{method:'PUT',body:{password:newPassword}})).status,200);assert.equal((await request('/api/creator/messages')).status,401);await login(newPassword);
    assert.equal((await request('/api/creator/logout',{method:'POST'})).status,200);assert.equal((await request('/api/creator/messages')).status,401);
  }finally{
    if(server?.listening)await new Promise(r=>server.close(r));
    assert(dataDir.startsWith(resolve(root,'tests/.creator-')));await rm(dataDir,{recursive:true,force:true});
  }
});
