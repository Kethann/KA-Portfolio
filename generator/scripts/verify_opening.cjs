// Uses actual deployed animation functions and Three.js geometry without WebGL.
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const THREE=require(path.join(root,'Portfolio-main/node_modules/three/build/three.cjs'));
const acorn=require(path.join(root,'Portfolio-main/node_modules/acorn/dist/acorn.js'));
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
scripts.forEach(s=>new vm.Script(s));
const demo=fs.readFileSync(path.join(__dirname,'../ka-cinematic-demo.html'),'latin1');
for(const m of demo.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
const main=scripts.find(s=>s.includes('const MANIFEST'));
const tree=acorn.parse(main,{ecmaVersion:'latest'}), functions=new Map();
function walk(node){
  if (!node || typeof node!=='object') return;
  if (node.type==='FunctionDeclaration') functions.set(node.id.name,main.slice(node.start,node.end));
  Object.values(node).forEach(v=>Array.isArray(v)?v.forEach(walk):walk(v));
}
walk(tree);
const original=JSON.parse(main.match(/const MANIFEST = (.*);/)[1]);
const context=vm.createContext({THREE, console, MANIFEST:structuredClone(original),
  SCALE_X:0.2,SCALE_Y:0.2,centerMx:original.logoCenter.x,centerMy:original.logoCenter.y,
  ATLAS_W:2600, ATLAS_H:2400, atlasTex:new THREE.Texture(), shards:[], scene:new THREE.Scene(),
  camera:{position:{z:800},fov:45,aspect:1.5}, cutDiagHalf:190,
  RAW_TINT:new THREE.Vector3(.58,.3,.27),RESOLVED_TINT:new THREE.Vector3(1,1,1),
  WIPE_BAND:.11,ASSEMBLE_DELAY:900,ASSEMBLE_SPAN:3600,BLAST_DUR:400,
  shardVertex:'',shardFragment:'',wipeYGlobal:-2,regionGlowFired:new Set(),
  spawnSpark(){},spawnGlitterBurst(){},updateSparks(){},updateSkillCallouts(){}});
const names=['fractureOpeningCore','fractureGeometry','openingDrift','clamp01','lerp','lerp3',
  'easeInCubic','easeOutCubic','easeSlowSnap','smootherStep','toWorld','screenEdgeSpawnPoint',
  'buildShards','updateShardsIdle','updateShardsAssembling','assertSharedCoreOrigin'];
names.forEach(n=>{assert(functions.has(n),n);vm.runInContext(functions.get(n),context)});
vm.runInContext('fractureOpeningCore()',context);
const cells=context.MANIFEST.shards.filter(s=>s.openingCore);
assert.equal(cells.length,20);
assert.equal(context.MANIFEST.shards.length,original.shards.length+19);
assert(!context.MANIFEST.shards.some(s=>s.id===0));
for (const s of original.shards.filter(s=>s.id!==0)){
  assert.deepEqual(JSON.parse(JSON.stringify(context.MANIFEST.shards.find(c=>c.id===s.id))),s);
}
let area=0;
for(const s of cells){
  const poly=s.fracturePolygon;
  let localArea=0;
  poly.forEach((a,i)=>{const b=poly[(i+1)%poly.length];localArea+=a.x*b.y-b.x*a.y});
  area+=Math.abs(localArea)/2*s.atlas.w*s.atlas.h;
  const geo=context.fractureGeometry(s,new THREE.PlaneGeometry(1,1));
  assert(geo.index.count>=3);
  assert([...geo.attributes.position.array,...geo.attributes.uv.array].every(Number.isFinite));
}
assert(Math.abs(area-original.shards[0].atlas.w*original.shards[0].atlas.h)<1e-5);
vm.runInContext('buildShards(); assertSharedCoreOrigin(); updateShardsIdle(2000,0);',context);
for(const cell of cells){
  const s=context.shards.find(s=>s.id===cell.id);
  assert(s.mesh.visible && !s.isInitiallyMissing);
  assert(Math.hypot(s.startPos.x-s.landedPos.x,s.startPos.y-s.landedPos.y)>30);
}
// Compare both sides of the flight boundary at exactly the same clock time.
for (const s of context.shards){
  if(s.isInitiallyMissing) continue;
  context.updateShardsIdle(2000,0);
  const before=s.mesh.position.clone(), roll=s.mesh.rotation.z;
  context.updateShardsAssembling(2000,s.repairDelay);
  assert(before.distanceTo(s.mesh.position)<1e-7,'position jumps at flight start');
  assert(Math.abs(roll-s.mesh.rotation.z)<1e-7,'rotation jumps at flight start');
}
const finish=Math.max(...context.shards.map(s=>s.repairDelay+s.repairDur));
for (const hz of [30,60,120]){
  for(let t=0;t<finish+100;t+=1000/hz){
    context.updateShardsAssembling(2000+t,t);
    for(const s of context.shards){
      assert([...s.mesh.position.toArray(),...s.mesh.scale.toArray(),s.mesh.rotation.z,
        s.mesh.material.uniforms.uOpacity.value].every(Number.isFinite));
    }
  }
  // Sample just beyond the last endpoint, as RAF does. Subtracting randomized
  // floating-point delays at the exact sum can leave lt one ULP below 1.
  assert(context.updateShardsAssembling(2001+finish,finish+1));
  for(const s of context.shards){
    assert(s.mesh.position.distanceTo(new THREE.Vector3(s.landedPos.x,s.landedPos.y,s.landedPos.z))<1e-7);
  }
}
console.log('PASS: all inline scripts parse; 20 core cells tile the original exactly; 178 original fragments unchanged; first-frame visibility; continuous flight handoff; finite motion and exact landing at 30/60/120 Hz.');
assert(!html.includes('TEST-123'));
assert(!html.includes('<button id="replay"'));
// Include full plane footprints, all angles, and narrow/ultrawide screens.
for (const aspect of [.25,.45,.75,1,1.78,3.6]){
  context.camera.aspect=aspect;
  for(let i=0;i<600;i++){
    const p=context.screenEdgeSpawnPoint(120);
    const halfH=Math.tan(THREE.MathUtils.degToRad(context.camera.fov)/2)*(context.camera.position.z-p.z);
    assert(Math.abs(p.x)>halfH*aspect+120 || Math.abs(p.y)>halfH+120);
  }
}
Object.assign(context,{window:{innerWidth:1440,innerHeight:900,devicePixelRatio:2,visualViewport:{scale:1}},
  isMobile:false,CAM_Z_FAR:980,CAM_Z_NEAR:660,LOGO_BOX_W:232,ICON_SIZE:46,
  mouseSmoothed:{x:0,y:0},CAM_HALF_H_REF:457});
for(const name of ['renderPixelRatio','computeResponsiveFovBase','easeInOutCubic','updateCamera','onResize']) vm.runInContext(functions.get(name),context);
const endpoints=[];
for (const hz of [30,60,120]){
  context.camera=new THREE.PerspectiveCamera(50,1.6,1,8000);
  context.camera.position.set(0,0,980);
  for(let i=1;i<=hz*12;i++) context.updateCamera(1,i*1000/hz,1000/hz);
  endpoints.push(context.camera.position.clone());
}
assert(endpoints[0].distanceTo(endpoints[2])<.02,'refresh-rate-dependent camera drift');
for(const [width,height] of [[320,932],[390,844],[768,1024],[1440,900],[3840,2160],[7680,4320]]){
  context.window.innerWidth=width;context.window.innerHeight=height;
  const fov=context.computeResponsiveFovBase(width/height);
  const halfHeight=980*Math.tan(THREE.MathUtils.degToRad(fov)/2);
  assert(halfHeight*width/height>=232/2+46*2.1-1e-7);
  assert(width*height*context.renderPixelRatio()**2<=6000001);
}
Object.assign(context,{icons:[],renderer:{setPixelRatio(){},setSize(){},render(){}},layoutIcons(){}});
// Desktop framing enlarges the entire reconstruction; phones retain the original framing.
for(const [width,height,gain] of [[390,844,1],[768,1024,1],[1024,768,1],[1366,768,1+.5*342/416],[1440,900,1.5],[1920,1080,1.5]]){
  context.window.innerWidth=width;context.window.innerHeight=height;
  const fov=context.computeResponsiveFovBase(width/height);
  const oldHalfH=Math.max(980*Math.tan(THREE.MathUtils.degToRad(50)/2),(232/2+46*2.1)/(width/height));
  const actualGain=oldHalfH/(980*Math.tan(THREE.MathUtils.degToRad(fov)/2));
  assert(Math.abs(actualGain-gain)<1e-8,`incorrect logo scale at ${width}x${height}`);
}
context.window.innerWidth=1440;context.window.innerHeight=900;
context.onResize();
const beforeResize=context.camera.fov;
context.updateCamera(1,12000,0);
assert(Math.abs(context.camera.fov-beforeResize)<1e-8,'resize creates a zoom jump');
console.log('PASS: debug button absent; 3600 offscreen spawn samples; phone-to-8K bounds; framebuffer budget; camera parity at 30/60/120 Hz; resize FOV continuity.');
// Actual annotation layout, reveal gates, and WebGL-to-SVG projection.
Object.assign(context,{skillOverlay:null,reducedMotion:false,REVEAL_START:100,REVEAL_DUR:2000,
  ICONS_START_GAP:500,ICON_STAGGER:90,ICON_DUR:820,makeIconTexture:()=>new THREE.Texture(),
  logoMesh:{userData:{dw:225,dh:302}},document:{body:{appendChild(){}},createElementNS:()=>({
    attrs:{},style:{},children:[],setAttribute(k,v){this.attrs[k]=String(v);},appendChild(el){this.children.push(el);}})}});
vm.runInContext('TOOLKIT = '+main.match(/const TOOLKIT = (\[[\s\S]*?\]);/)[1],context);
for(const name of ['buildSkillCallouts','skillLabelLayout','updateSkillCallouts','buildIcons','ringRadii','updateIcons','easeOutBackBig']) vm.runInContext(functions.get(name),context);
for(const [w,h] of [[320,568],[390,844],[600,800],[844,390],[1440,900],[2560,1440]]){
  context.window.innerWidth=w;context.window.innerHeight=h;
  context.camera=new THREE.PerspectiveCamera(50,w/h,1,8000);context.camera.position.z=660;
  const base=context.computeResponsiveFovBase(w/h);
  context.CAM_HALF_H_REF=980*Math.tan(THREE.MathUtils.degToRad(base)/2);
  context.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(context.CAM_HALF_H_REF/660));context.camera.updateProjectionMatrix();
  context.icons=[];context.buildIcons();context.buildSkillCallouts();
  context.updateIcons(0,0);context.updateSkillCallouts();
  assert(context.icons.every(i=>i.callout.group.attrs.opacity==='0.000'),'labels reveal before bubbles');
  context.updateIcons(10000,10000);context.updateSkillCallouts();
  const labels=context.icons.map((ic,i)=>{
    assert.equal(ic.callout.label.textContent,context.TOOLKIT[i].label);
    assert.equal(ic.callout.group.attrs.opacity,'1.000');
    assert(!/NaN|Infinity/.test(ic.callout.path.attrs.d));
    const el=ic.callout.label,x=Number(el.attrs.x),y=Number(el.attrs.y),width=el.textContent.length*6.3;
    const anchor=el.attrs['text-anchor'];
    const left=anchor==='end'?x-width:anchor==='middle'?x-width/2:x;
    assert(left>=0 && left+width<=w && y>=70 && y<h,`label outside viewport ${w}x${h}`);
    return {left,right:left+width,top:y-12,bottom:y+4};
  });
  labels.forEach((a,i)=>labels.slice(i+1).forEach(b=>{
    assert(a.right<=b.left || a.left>=b.right || a.bottom<=b.top || a.top>=b.bottom,`overlapping labels ${w}x${h}`);
  }));
}
console.log('PASS: eight skill bubbles and labels; labels hidden before reveal; finite curved paths; no text overlap at phone, tablet, landscape, and desktop sizes.');

Object.assign(context,{joinSeams:null,CUT_W:1000,CUT_H:800,LOGO_BOX_W:500,LOGO_BOX_H:400,cutoutTex:new THREE.Texture(),ASSEMBLY_FULL_T:5000,reducedMotion:false});
for(const name of ['fitContain','buildJoinSeams','updateJoinSeams'])vm.runInContext(functions.get(name),context);
context.buildJoinSeams();
assert(context.joinSeams.geometry.attributes.position.count>40);
assert([...context.joinSeams.geometry.attributes.position.array].every(Number.isFinite));
context.updateJoinSeams(4999);assert(!context.joinSeams.visible);
context.updateJoinSeams(5219);assert(!context.joinSeams.visible,'allow the fragments to settle first');
context.updateJoinSeams(5300);assert(context.joinSeams.visible);
const earlyFront=context.joinSeams.material.uniforms.uFront.value;
context.updateJoinSeams(5900);assert(context.joinSeams.material.uniforms.uFront.value>earlyFront);
context.updateJoinSeams(6720);assert(!context.joinSeams.visible);
context.reducedMotion=true;context.updateJoinSeams(5300);assert(!context.joinSeams.visible);
console.log('PASS: real fracture seams charge only after joining, travel outward, expire completely, and honor reduced motion.');

assert(!functions.has('spawnSpark')&&!functions.has('spawnGlitterBurst'),'no free-floating or center spark overlays');
assert(functions.get('makeBlurredGlowTexture').includes("'destination-in'"),'bloom must follow the original crystal alpha');
// Exercise the lifecycle controller with the same functions shipped in the homepage.
const heroRafs=new Map();let heroId=0,heroNow=1000;
const heroContext=vm.createContext({assetsLoaded:0,logoMesh:null,heroFrame:0,motionLoopActive:true,document:{hidden:false},
  phase:'assembling',heroVisible:true,heroPausedAt:0,phaseStart:100,lastFrameT:100,performance:{now:()=>heroNow},
  frame(){},requestAnimationFrame:fn=>{heroRafs.set(++heroId,fn);return heroId;},cancelAnimationFrame:key=>heroRafs.delete(key)});
for(const name of ['scheduleHero','syncHero'])vm.runInContext(functions.get(name),heroContext);
heroContext.scheduleHero();assert.equal(heroRafs.size,0,'do not render before assets initialize');
heroContext.assetsLoaded=2;heroContext.logoMesh={};heroContext.scheduleHero();heroContext.scheduleHero();assert.equal(heroRafs.size,1);
heroContext.document.hidden=true;heroContext.syncHero();assert.equal(heroRafs.size,0);
heroNow=61000;heroContext.document.hidden=false;heroContext.syncHero();assert.equal(heroContext.phaseStart,60100);assert.equal(heroRafs.size,1);
heroContext.phase='held';heroContext.heroVisible=false;heroContext.syncHero();assert.equal(heroRafs.size,0);
console.log('PASS: no sprite sparks; alpha-constrained bloom; one hero RAF; load/visibility gates; no hidden-time jump.');

// Exercise the actual background-to-logo bridge, including one-time image upload reuse.
let ambientCall;
(function findAmbient(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.arguments[0]?.value==='ka-ambient-light')ambientCall=node;
  Object.values(node).forEach(value=>Array.isArray(value)?value.forEach(findAmbient):findAmbient(value));
})(tree);
assert(ambientCall,'ambient event listener exists');
const callback=ambientCall.arguments[1];
class ReflectionImage{complete=true;naturalWidth=1254;}
const envUniforms={uAmbientTint:{value:new THREE.Vector3()},uAmbientStrength:{value:0}};
for(const name of ['uEnvFrom','uEnvTo','uEnvBlend','uEnvTime','uEnvIndex','uEnvAspect','uEnvReady'])envUniforms[name]={value:0};
Object.assign(context,{HTMLImageElement:ReflectionImage,reflectionTextures:new WeakMap(),ambientLightTint:new THREE.Vector3(),ambientLightStrength:0,logoMesh:{material:{uniforms:envUniforms}},reducedMotion:false});
vm.runInContext(functions.get('reflectionTexture'),context);
const applyAmbient=vm.runInContext('('+main.slice(callback.start,callback.end)+')',context);
const fromImage=new ReflectionImage(),toImage=new ReflectionImage();
const detail={color:[.2,.4,.7],strength:.06,reflection:{from:fromImage,to:toImage,blend:.4,time:12,index:0,aspect:1.6}};
applyAmbient({detail});
assert.equal(envUniforms.uEnvFrom.value.image,fromImage);
assert.equal(envUniforms.uEnvTo.value.image,toImage);
assert.equal(envUniforms.uEnvBlend.value,.4);assert.equal(envUniforms.uEnvReady.value,1);
const cached=envUniforms.uEnvFrom.value;
applyAmbient({detail});assert.equal(envUniforms.uEnvFrom.value,cached);
assert.equal(context.reflectionTexture({complete:true,naturalWidth:1254}),null);
console.log('PASS: live artwork images, blend and projection reach the KA shader; repeated frames reuse uploaded textures.');
