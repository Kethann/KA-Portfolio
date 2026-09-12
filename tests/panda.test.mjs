import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
const compile=async name=>ts.transpileModule(await readFile(new URL(`../client/src/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const activity={};vm.runInNewContext(await compile('panda-activity'),{exports:activity});
const geometry={};vm.runInNewContext(await compile('panda-character'),{exports:geometry,require:name=>name==='three'?THREE:activity});

test('one-minute active clock is deterministic, varied, and never repeats consecutively',()=>{
  const a=activity.createActivityClock(37),b=activity.createActivityClock(37),seen=new Set();
  let previous=a.advance(0).activity;b.advance(0);
  assert.equal(a.advance(59.999).activity,previous);b.advance(59.999);
  for(let i=0;i<500;i++){
    const next=a.advance(i?60:.001),same=b.advance(i?60:.001);
    assert.equal(next.activity,same.activity);assert.notEqual(next.activity,previous);
    assert(next.weight<.0001,'transition returns through idle');previous=next.activity;seen.add(previous);
  }
  assert.equal(seen.size,7);
  const single=activity.createActivityClock(5,['relaxing']);assert.equal(single.advance(600).activity,'relaxing');
});

test('the real character stays finite and inside its camera through every activity',()=>{
  const character=geometry.createPanda(false),camera=new THREE.PerspectiveCamera(32,104/112,.1,30);
  camera.position.set(.2,1.4,5.2);camera.lookAt(0,1.02,0);camera.updateMatrixWorld(true);
  let meshes=0,fur=0;character.root.traverse(object=>{if(object.isMesh)meshes++;if(object.isLineSegments)fur++;});
  assert(meshes>20&&fur>10,'actual dimensional geometry and fur required');
  for(const state of activity.activities)for(let second=0;second<60;second+=.5){
    character.update(state,second,Math.min(1,second/2.4,(60-second)/2.4),second,new THREE.Vector2(.4,.3),.05);
    character.root.updateMatrixWorld(true);
    character.root.traverse(object=>{
      if(!object.visible||!object.geometry)return;
      let parent=object.parent;while(parent){if(!parent.visible)return;parent=parent.parent;}
      const positions=object.geometry.attributes.position;
      for(let i=0;i<positions.count;i+=17){
        const point=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld).project(camera);
        assert(point.toArray().every(Number.isFinite));assert(Math.abs(point.x)<1&&Math.abs(point.y)<1,`${state} clips the character canvas`);
      }
    });
  }
  const geometries=new Set(),materials=new Set();character.root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material);});
  let released=0;[...geometries,...materials].forEach(resource=>resource.addEventListener('dispose',()=>released++));
  character.dispose();assert.equal(released,geometries.size+materials.size,'GPU allocations released exactly once');
});

const travel={};vm.runInNewContext(await compile('panda-travel'),{exports:travel});
const controllerCode=await compile('panda');
test('controller pauses hidden/reduced/detached rendering, resumes, and cleans up on remount',async()=>{
  class Element extends EventTarget{
    dataset={};isConnected=true;children=[];classList={add(){},remove(){}};
    appendChild(child){this.children.push(child);}setAttribute(){}remove(){this.removed=true;}
    getBoundingClientRect(){return {left:0,top:0,width:104,height:112};}
  }
  const host=new Element(),launcher=new Element(),document=new Element();document.hidden=false;
  const media=new Element();media.matches=false;
  const rafs=new Map();let id=0,renders=0,disposed=0,updates=[],observer;
  class Renderer {domElement=new Element();setClearColor(){}setPixelRatio(){}setSize(){}render(){renders++;}dispose(){disposed++;}}
  class Observer{constructor(fn){this.fn=fn;observer=this;}observe(){}disconnect(){this.disconnected=true;}}
  const exported={},context={exports:exported,require:name=>name==='three'?{...THREE,WebGLRenderer:Renderer}:name==='./panda-activity'?activity:name==='./panda-travel'?travel:{
    createPanda:()=>({root:new THREE.Group(),activities:activity.activities,update:(...args)=>updates.push(args),dispose(){}})
  },document,matchMedia:()=>media,navigator:{hardwareConcurrency:8},devicePixelRatio:2,crypto:{getRandomValues:array=>{array[0]=12;return array;}},
    AbortController,ResizeObserver:Observer,IntersectionObserver:Observer,
    requestAnimationFrame:fn=>{rafs.set(++id,fn);return id;},cancelAnimationFrame:key=>rafs.delete(key)};
  vm.runInNewContext(controllerCode,context);
  const tick=now=>{const callbacks=[...rafs.values()];rafs.clear();callbacks.forEach(fn=>fn(now));};
  const dispose=await exported.mountPanda(host,launcher);assert.equal(rafs.size,1);
  tick(100);tick(116);assert.equal(rafs.size,1);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(rafs.size,0);
  const before=renders;tick(60000);assert.equal(renders,before);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));tick(60000);
  assert.equal(updates.at(-1)[5],0,'returning from hidden must not jump the activity clock');
  media.matches=true;media.dispatchEvent(new Event('change'));assert.equal(rafs.size,0);assert.equal(updates.at(-1)[0],'relaxing');
  media.matches=false;media.dispatchEvent(new Event('change'));assert.equal(rafs.size,1);
  observer.fn([{isIntersecting:false}]);assert.equal(rafs.size,0);
  observer.fn([{isIntersecting:true}]);assert.equal(rafs.size,1);
  host.isConnected=false;tick(60016);assert.equal(rafs.size,0);host.isConnected=true;
  const again=await exported.mountPanda(host,launcher);assert.equal(disposed,1);assert.equal(rafs.size,1);
  dispose();assert.equal(disposed,1);again();assert.equal(disposed,2);assert.equal(rafs.size,0);
  document.dispatchEvent(new Event('visibilitychange'));media.dispatchEvent(new Event('change'));assert.equal(rafs.size,0);
});

test('spider-panda remains above chat, waits for closure, falls, then returns at 30/60/144 Hz',()=>{
 for(const hz of [30,60,144]){
  const state=travel.createTravel(),perch={x:200,y:22},home={x:360,y:510};
  travel.setTravelOpen(state,true);
  for(let i=0;i<hz*3;i++){
   travel.advanceTravel(state,1/hz,false);const pose=travel.travelPose(state,perch,home,640,73);
   assert(pose.y+73<=95.001,'panda must stay above the chat header at y=103');
   assert(Object.values(pose).every(Number.isFinite));
  }
  assert.equal(state.stage,'perched');
  travel.setTravelOpen(state,false);
  travel.advanceTravel(state,.1,false);travel.advanceTravel(state,.1,false);travel.advanceTravel(state,.1,false);
  assert.equal(state.stage,'release','must not fall through the closing panel');
  let fell=false,returned=false;
  for(let i=0;i<hz*4;i++){travel.advanceTravel(state,1/hz,false);fell ||= state.stage==='fall';returned ||= state.stage==='return';}
  assert(fell&&returned);assert.equal(state.stage,'idle');
  const pose=travel.travelPose(state,perch,home,640,73);assert.equal(pose.x,home.x);assert.equal(pose.y,home.y);
  travel.setTravelOpen(state,true);travel.advanceTravel(state,0,true);assert.equal(state.stage,'perched');
  travel.setTravelOpen(state,false);travel.advanceTravel(state,0,true);assert.equal(state.stage,'idle');
 }
});

test('climbing and bottom-web return arms stay inside the panda camera',()=>{
 const character=geometry.createPanda(true),camera=new THREE.PerspectiveCamera(32,68/73,.1,30);
 camera.position.set(.2,1.4,5.2);camera.lookAt(0,1.02,0);camera.updateMatrixWorld(true);
 for(const weight of [-1,-.5,1])for(let time=0;time<3;time+=.15){
  character.update('relaxing',time,1,time,new THREE.Vector2(),.05);character.climb(time,weight);character.root.updateMatrixWorld(true);
  character.root.traverse(object=>{
   if(!object.visible||!object.geometry)return;
   let parent=object.parent;while(parent){if(!parent.visible)return;parent=parent.parent;}
   const vertices=object.geometry.attributes.position;
   for(let i=0;i<vertices.count;i+=17){const point=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(object.matrixWorld).project(camera);assert(Math.abs(point.x)<1&&Math.abs(point.y)<1,'climbing pose clips its canvas');}
  });
 }
 character.dispose();
});

test('thread spring damps consistently and torn ends separate before fading',()=>{
 const results=[];
 for(const hz of [30,60,144]){
  const spring={x:0,v:65};let peak=0;
  for(let i=0;i<hz*2;i++){travel.stepThreadSpring(spring,1/hz);peak=Math.max(peak,Math.abs(spring.x));}
  assert(peak>1&&peak<6);assert(Math.abs(spring.x)<.001);assert(Math.abs(spring.v)<.01);results.push(spring.x);
 }
 assert(Math.max(...results)-Math.min(...results)<1e-8);
 const intact=travel.threadPaths(200,120,0,.5,0,null);assert.equal(intact.lower,'');assert.equal(intact.opacity,1);
 const torn=travel.threadPaths(200,120,0,.5,0,0);assert(torn.lower.startsWith('M '));
 const upper=torn.upper.match(/[-\d.]+/g).map(Number),lower=torn.lower.match(/[-\d.]+/g).map(Number);
 assert(lower[1]>upper.at(-1),'tear must leave a visible gap immediately');
 assert.equal(travel.threadPaths(200,120,0,.5,0,.6).opacity,0);
 for(const age of [0,.1,.3,.5])assert(!travel.threadPaths(200,120,0,.5,0,age).upper.includes('NaN'));
 const state=travel.createTravel();travel.setTravelOpen(state,true);travel.advanceTravel(state,0,true);
 travel.setTravelOpen(state,false);
 for(let i=0;i<33;i++)travel.advanceTravel(state,.01,false);
 assert.equal(state.stage,'release');assert.equal(travel.travelPose(state,{x:0,y:10},{x:0,y:500},640,73).thread,1);
 travel.advanceTravel(state,.02,false);assert.equal(state.stage,'fall');
});

test('return greeting wave remains within the character camera',()=>{
 const character=geometry.createPanda(true),camera=new THREE.PerspectiveCamera(32,68/73,.1,30);
 camera.position.set(.2,1.4,5.2);camera.lookAt(0,1.02,0);camera.updateMatrixWorld(true);
 for(let time=0;time<2.8;time+=.12){
  character.update('relaxing',time,1,time,new THREE.Vector2(),.05);character.wave(time);character.root.updateMatrixWorld(true);
  character.root.traverse(object=>{
   if(!object.visible||!object.geometry)return;let parent=object.parent;while(parent){if(!parent.visible)return;parent=parent.parent;}
   const vertices=object.geometry.attributes.position;
   for(let i=0;i<vertices.count;i+=17){const p=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(object.matrixWorld).project(camera);assert(Math.abs(p.x)<1&&Math.abs(p.y)<1);}
  });
 }
 character.dispose();
});

test('live panda controller tears, casts a fresh thread, greets once, and cancels on reopen',async()=>{
 class Element extends EventTarget{
  dataset={};style={};attrs={};children=[];isConnected=true;hidden=false;offsetWidth=68;offsetHeight=73;textContent='';
  classes=new Set();classList={add:(v)=>this.classes.add(v),remove:(v)=>this.classes.delete(v),toggle:(v,on)=>on?this.classes.add(v):this.classes.delete(v)};
  setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
  appendChild(child){child.parentElement=this;this.children.push(child);}remove(){this.isConnected=false;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);}
  querySelector(){return null;}
  getBoundingClientRect(){return this.rect||{left:0,top:0,width:68,height:73,bottom:73};}
 }
 const host=new Element(),launcher=new Element(),panel=new Element(),document=new Element(),media=new Element();
 launcher.rect={left:400,top:560,width:60,height:60,bottom:620};panel.rect={left:120,top:120,width:350,height:430,bottom:550};panel.hidden=true;
 launcher.appendChild(host);document.body=new Element();document.getElementById=()=>panel;document.createElement=document.createElementNS=()=>new Element();document.hidden=false;media.matches=false;
 let id=0,now=0;const frames=new Map(),exported={},waves=[];
 class Observer{observe(){}disconnect(){}}
 class Renderer{domElement=new Element();setClearColor(){}setPixelRatio(){}setSize(){}render(){}dispose(){}}
 vm.runInNewContext(controllerCode,{exports:exported,require:name=>name==='three'?{...THREE,WebGLRenderer:Renderer}:name==='./panda-activity'?activity:name==='./panda-travel'?travel:{createPanda:()=>({root:new THREE.Group(),activities:activity.activities,update(){},climb(){},wave:t=>waves.push(t),dispose(){}})},
  document,window:{visualViewport:{height:640}},matchMedia:()=>media,navigator:{hardwareConcurrency:8},devicePixelRatio:1,crypto:{getRandomValues:a=>a.fill(12)},AbortController,ResizeObserver:Observer,IntersectionObserver:Observer,
  requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
 const dispose=await exported.mountPanda(host,launcher);
 const step=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++){now+=1000/60;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));}};
 const change=open=>{panel.hidden=!open;const event=new Event('ka-chat-state');event.detail={open};document.dispatchEvent(event);};
 change(true);step(2.4);assert.equal(host.dataset.travel,'perched');
 const svg=document.body.children.find(el=>el.classes.has('panda-thread')),upper=svg.children[0],lower=svg.children[1];
 const move=new Event('pointermove');move.clientX=295;move.clientY=20;document.dispatchEvent(move);step(.1);
 assert(upper.attrs.d.includes(' L '));
 change(false);step(.38);assert.equal(host.dataset.travel,'fall');assert(lower.attrs.d.startsWith('M '));
 step(.8);assert.equal(host.dataset.travel,'return');assert.equal(lower.attrs.d,'');assert.equal(upper.style.strokeDasharray,'1');
 const points=upper.attrs.d.match(/[-\d.]+/g).map(Number);
 assert.equal(points[1],786,'comeback web starts below the viewport and panda');
 assert(points.at(-1)<points[1],'comeback web extends upward toward panda');
 step(2.2);assert.equal(host.dataset.travel,'idle');
 const greeting=launcher.children.find(el=>el.className?.includes('panda-return-greeting'));
 assert.equal(greeting.textContent,"Hi, I'm back!");assert(greeting.classes.has('show'));assert(waves.some(t=>t>=0));
 step(3);assert(!greeting.classes.has('show'));step(2);assert(!greeting.classes.has('show'),'greeting repeats while idle');
 change(true);step(.2);change(false);step(.1);change(true);step(2.4);assert.equal(host.dataset.travel,'perched');assert(!greeting.classes.has('show'));
 dispose();assert(!svg.isConnected&&!greeting.isConnected);assert.equal(frames.size,0);
});

test('bottom web settles and disappears smoothly at home at multiple refresh rates',()=>{
 for(const hz of [30,60,120,144]){
  const state={stage:'return',elapsed:0,open:false},home={x:360,y:510};
  let previous=Infinity;
  for(let i=0;i<hz*2.2;i++){
   const pose=travel.travelPose(state,{x:200,y:22},home,640,73);
   assert(pose.y<=previous+.00001,'return moves upward without a landing jump');previous=pose.y;
   if(state.stage==='return')assert(pose.climb<=0,'return uses the bottom-web gesture');
   travel.advanceTravel(state,1/hz,false);
  }
  assert.equal(state.stage,'idle');
  const settled=travel.travelPose({stage:'return',elapsed:2.1,open:false},{x:200,y:22},home,640,73);
  assert.equal(settled.y,home.y);assert.equal(settled.thread,0);assert.equal(Math.abs(settled.climb),0);
 }
});
