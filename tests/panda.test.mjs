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
  const exported={},context={exports:exported,require:name=>name==='three'?{...THREE,WebGLRenderer:Renderer}:name==='./panda-activity'?activity:{
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
