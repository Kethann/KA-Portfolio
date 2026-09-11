// Execute the complete hero script, including asset callbacks and frame scheduling.
// Renderer/canvas are stubs: this catches integration exceptions, not shader/visual errors.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require(path.resolve(__dirname,'../../../Portfolio-main/node_modules/three/build/three.cjs'));
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const MANIFEST'));
const noop=()=>{},gradient={addColorStop:noop};
const canvasContext=new Proxy({createRadialGradient:()=>gradient,createLinearGradient:()=>gradient,measureText:()=>({width:60}),getImageData:(_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4).fill(255)})},{get:(target,name)=>target[name]||noop});
class Element extends EventTarget{
  style={};children=[];attrs={};classList={add:noop,remove:noop,contains:()=>false};
  getContext(){return canvasContext;}appendChild(el){this.children.push(el);return el;}setAttribute(k,v){this.attrs[k]=v;}
  getBoundingClientRect(){return {left:0,top:0,width:1440,height:900};}
}
const elements=new Map(),document=new Element();document.hidden=false;document.body=new Element();
document.getElementById=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
document.querySelector=()=>new Element();document.createElement=()=>new Element();document.createElementNS=()=>new Element();
const callbacks=[],rafs=new Map();let now=0,id=0,renders=0,completed=0,seenReveal=false;
class TextureLoader{load(_url,cb){const texture=new THREE.Texture({width:1120,height:1576});callbacks.push(cb);return texture;}}
class Renderer{domElement=new Element();capabilities={getMaxAnisotropy:()=>8};getPixelRatio(){return 1;}setPixelRatio(){}setSize(){}setClearColor(){}render(scene,camera){
  scene.updateMatrixWorld();camera.updateMatrixWorld();renders++;
  const logo=scene.children.find(object=>object.userData.kaKind==='resolvedLogo');
  if(logo?.material.uniforms.uWipeY.value>=1.19)seenReveal=true;
  if(seenReveal){assert.equal(logo.material.uniforms.uAlpha.value,1,'post-reveal opacity dip');assert.equal(logo.material.uniforms.uSweepPos.value,-1,'post-reveal sweep');}
  assert(!scene.children.some(object=>/logoGlass|logoParticles/.test(object.userData.kaKind||'')),'removed logo states must not be allocated');
}}
const window=new Element();Object.assign(window,{innerWidth:1440,innerHeight:900,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener:noop})});
window.addEventListener('ka-sequence-complete',()=>completed++);
const context=vm.createContext({THREE:{...THREE,TextureLoader,WebGLRenderer:Renderer},document,window,console,navigator:{userAgent:'test'},
  performance:{now:()=>now},requestAnimationFrame:fn=>{rafs.set(++id,fn);return id;},cancelAnimationFrame:id=>rafs.delete(id),
  IntersectionObserver:class{observe(){}},CustomEvent:class extends Event{},HTMLImageElement:class{},setTimeout,clearTimeout});
const vendor=path.resolve(__dirname,'../../public/three-r128.min.js');
if(fs.existsSync(vendor)){
  vm.runInContext(fs.readFileSync(vendor,'utf8'),context);
  context.THREE.WebGLRenderer=Renderer;context.THREE.TextureLoader=TextureLoader;
}
const end=source.lastIndexOf('})();');
const inspect=`globalThis.heroTest={scene,camera,shards,advanceFinalGlow,finalGlowCycle,get shardGlow(){return shardGlow;},get resolvedEmission(){return resolvedEmission;},updateCrystalEmission,get phase(){return phase;},get logo(){return logoMesh;},get particles(){return surfaceParticles;},get trails(){return cometTrails;},
  sampleCutoutAlpha,queueSurfacePointer,updateSurfaceParticles,emitSurfaceParticles,clearSurfaceParticles,updateCometTrails,
  setPhase(value){phase=value;},setReduced(value){reducedMotion=value;},setMask(value){logoAlphaMap=value;}};`;
vm.runInContext(source.slice(0,end)+inspect+source.slice(end),context,{filename:'live-hero.js'});
callbacks.forEach(cb=>cb());assert.equal(rafs.size,1,'startup must schedule exactly one frame');
for(now=16;now<30000;now+=16){const pending=[...rafs.values()];rafs.clear();pending.forEach(fn=>fn(now));}
assert.equal(elements.get('boot-veil').style.opacity,'0');assert.equal(completed,1,'animation must reach its final reveal');assert(renders>100);
console.log('PASS: complete hero startup, first paint, fragment assembly and final reveal execute without exceptions.');
const hero=context.heroTest;
assert.equal(hero.phase,'held');assert(seenReveal);
assert(!/buildLogoGlass|createLogoParticleSystem|DISSOLVE_IDLE_MS|pDissolved|uBlast/.test(source));
assert.match(hero.particles.mesh.material.fragmentShader,/vec3\(0\.0\)/);
assert.equal(hero.particles.mesh.material.blending,context.THREE.NormalBlending);
assert(hero.trails.slots.length>0&&hero.trails.slots.length<=6);
assert(hero.trails.slots.every(slot=>slot.shard.glowTier>=2));
assert(!/attribute vec3 instanceColor/.test(hero.trails.mesh.material.vertexShader),'r128 injects this attribute; duplicate declarations break WebGL');
const emission=hero.shardGlow.inst;
assert.equal(emission.count,hero.shards.length,'every crystal must have local emission');
assert(!hero.scene.children.some(object=>object.userData.kaKind==='logoGlow'),'no whole-logo bloom plane');
assert(emission.instanceMatrix.array.every(Number.isFinite),'emission matrices must remain finite');
assert(emission.instanceColor.array.every(value=>value===0),'raw shard contours must not remain after reveal');
const finished=hero.resolvedEmission;
assert(finished.visible,'resolved surface emission must remain visible after reveal');
assert(finished.material.uniforms.uBloom.value.isTexture,'finished logo must have a soft bloom texture');
assert.equal(finished.material.uniforms.map.value,hero.logo.material.uniforms.map.value,'post-reveal light must use the finished artwork');
assert.equal(finished.material.uniforms.uOpacity.value,1);
for(const material of [emission.material,finished.material]){
  assert.equal(material.blending,context.THREE.CustomBlending);
  assert.equal(material.blendSrc,context.THREE.OneFactor);
  assert.equal(material.blendDst,context.THREE.OneFactor);
  assert.equal(material.blendSrcAlpha,context.THREE.ZeroFactor,'glow tiles must not add opaque alpha');
  assert.equal(material.blendDstAlpha,context.THREE.OneFactor,'background coverage must be preserved');
}
// The configured blend must leave black/empty texels neutral and only add light.
for(const backgroundAlpha of [0,.2,1])for(const glowAlpha of [0,.5,1]){
  assert.equal(glowAlpha*0+backgroundAlpha*1,backgroundAlpha);
}
assert(finished.material.uniforms.uOwners.value.image.data.length>1000,'resolved light retains local piece timing');
assert.equal(emission.geometry.attributes.aRect.count,hero.shards.length);
assert(new Set(emission.geometry.attributes.aEmission.array).size>20,'independent intensity and timing');
hero.updateCrystalEmission(31000);assert.equal(emission.material.uniforms.uTime.value,31);
hero.setReduced(true);hero.updateCrystalEmission(0,true);assert.equal(emission.material.uniforms.uMotion.value,0);hero.setReduced(false);
assert.match(emission.material.fragmentShader,/mask\.r/);assert.match(emission.material.fragmentShader,/mask\.g/);assert.match(emission.material.fragmentShader,/mask\.b/);
console.log('PASS: finite per-piece emission; alpha-preserving additive blend; no raw-shard ghosts after reveal; finished-artwork emission stays visible; reduced-motion lighting is static.');
const objectCount=hero.scene.children.length;
hero.clearSurfaceParticles();hero.emitSurfaceParticles(hero.logo.userData.dw*.47,0,10,0,6);
const initial=hero.particles.slots.find(slot=>slot.life);assert(initial);
const x=initial.x;
for(let i=0;i<20;i++)hero.updateSurfaceParticles(16.667);
assert(initial.x>x+10,'particles must travel outward, not fade in place');
assert(initial.x>hero.logo.userData.dw/2,'edge particles must escape the logo footprint');
for(let i=0;i<100;i++)hero.updateSurfaceParticles(16.667);
assert(!hero.particles.mesh.visible,'short-lived particles must drain to an empty scene');
assert.equal(hero.scene.children.length,objectCount,'no per-frame particle objects');
// Mouse, pen and touch use the same passive Pointer Events path.
hero.camera.updateMatrixWorld();
const center=new context.THREE.Vector3(0,0,0).project(hero.camera);
for(const pointerType of ['mouse','touch','pen']){
  hero.clearSurfaceParticles();
  hero.queueSurfacePointer({type:'pointerdown',pointerType,clientX:(center.x+1)*720,clientY:(1-center.y)*450,composedPath:()=>[]});
  hero.updateSurfaceParticles(16.667);assert(hero.particles.mesh.visible,pointerType+' does not emit');
}
hero.clearSurfaceParticles();hero.queueSurfacePointer({type:'pointermove',clientX:720,clientY:450,composedPath:()=>[{matches:()=>true}]});
hero.updateSurfaceParticles(16.667);assert(!hero.particles.mesh.visible,'UI interactions must not emit');
hero.setReduced(true);hero.emitSurfaceParticles(0,0,0,0,3);hero.updateSurfaceParticles(16);assert(!hero.particles.mesh.visible);hero.setReduced(false);
hero.setMask({w:2,h:2,data:new Uint8Array(16)});assert.equal(hero.sampleCutoutAlpha(.5,.5),0);assert.equal(hero.sampleCutoutAlpha(-.1,.5),0);
// Compare trail length and strength under the same physical motion at 30/60/120/144 Hz.
const matrices=[];
hero.setPhase('assembling');
for(const hz of [30,60,120,144]){
  const slot=hero.trails.slots[0],shard=slot.shard,dt=1000/hz;
  slot.last=1000;slot.x=100;slot.y=0;shard.mesh.position.set(100-300/hz,0,0);shard.lt=.5;shard.mesh.visible=true;shard.mesh.material.uniforms.uOpacity.value=1;
  hero.updateCometTrails(1000+dt);
  const matrix=new context.THREE.Matrix4();hero.trails.mesh.getMatrixAt(0,matrix);
  const scale=new context.THREE.Vector3();matrix.decompose(new context.THREE.Vector3(),new context.THREE.Quaternion(),scale);matrices.push(scale.x);
  assert(matrix.elements[12]>shard.mesh.position.x,'comet tail must sit behind the approaching shard');
  assert(hero.trails.mesh.visible);
}
assert(Math.max(...matrices)-Math.min(...matrices)<.001,'refresh rate changes trail length');
hero.trails.slots.forEach(slot=>slot.shard.lt=1);hero.updateCometTrails(2000);assert(!hero.trails.mesh.visible,'landed shards must have no trails');
hero.setReduced(true);hero.updateCometTrails(2100);assert(!hero.trails.mesh.visible);
console.log('PASS: solid logo stays opaque for 30s; no old states or post-reveal sweep; black outward particles; mouse/touch/pen; UI exclusion; reduced motion; bounded Tier 2/3 tails and refresh-rate parity.');

hero.advanceFinalGlow(0,false,false);
let level=1;
for(let i=0;i<50;i++){const next=hero.advanceFinalGlow(100,true,false);assert(next<=level);level=next;}
assert.equal(level,0,'initial glow eases fully out in five seconds');
assert.equal(hero.finalGlowCycle.stage,'wait');
assert(hero.finalGlowCycle.duration>=3000&&hero.finalGlowCycle.duration<=8000);
hero.finalGlowCycle.elapsed=hero.finalGlowCycle.duration;
assert.equal(hero.advanceFinalGlow(0,true,false),0);
for(let i=0;i<14;i++)level=hero.advanceFinalGlow(100,true,false);
assert.equal(level,1,'glow eases up to its peak');
for(let i=0;i<36;i++)level=hero.advanceFinalGlow(100,true,false);
assert.equal(level,0,'returning glow completes its fade within five seconds');
assert.equal(hero.advanceFinalGlow(100,true,true),1,'reduced motion uses steady light');
console.log('PASS: smooth five-second glow envelope, random 3?8s intervals, and steady reduced-motion light.');
