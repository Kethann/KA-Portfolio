import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
const source=await readFile(new URL('../client/src/poster-background.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const logic={};vm.runInNewContext(code,{exports:logic,require:p=>p==='three'?THREE:{default:p}});

test('paint transitions hand the incoming surface to the next shot without a blank reset',()=>{
  for(let i=1;i<100;i++){
    const before=logic.transitionState(i*26-.00001),after=logic.transitionState(i*26);
    assert.equal(before.to,after.from);assert(before.progress>.99999);assert.equal(after.progress,0);
    assert.equal(before.index+1,after.index);
  }
  for(let t=0;t<140;t+=.03){const s=logic.transitionState(t);assert(s.progress>=0&&s.progress<=1);assert.notEqual(s.from,s.to);}
});
test('full viewport paint obeys framebuffer limits at desktop, tablet, mobile and zoom',()=>{
  for(const [w,h] of [[1920,1080],[1440,900],[1366,768],[768,1024],[390,844]]){
    for(const zoom of [1,1.25,1.5,2]){
      const ratio=logic.renderBudget(w,h,2*zoom);
      assert(w*h*ratio*ratio<=(w<600?1500000:4000000)+.01);
    }
  }
});
test('background pauses, preserves transition time, handles reduced motion and releases GPU resources',async()=>{
  const rafs=new Map(),events=new Map(),listeners=new Map(),canvasEvents=new Map();let id=0,removed=false,renders=0,disposed=false,lastUniforms;
  const document={hidden:false,getElementById:()=>null,body:{appendChild(){}},createElement:()=>({style:{},appendChild(){},setAttribute(){},remove(){removed=true;}}),addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
  const media={matches:false,addEventListener:(k,fn)=>listeners.set('motion',fn),removeEventListener:()=>listeners.delete('motion')};
  class Renderer{
    domElement={addEventListener:(k,fn)=>canvasEvents.set(k,fn),removeEventListener:k=>canvasEvents.delete(k)};
    setClearColor(){}setPixelRatio(){}setSize(){}
    render(scene){renders++;lastUniforms=scene.children[0].material.uniforms;}
    dispose(){disposed=true;}
  }
  class Loader{load(url,onLoad){onLoad(new THREE.Texture());}}
  const context={exports:{},require:p=>p==='three'?{...THREE,WebGLRenderer:Renderer,TextureLoader:Loader}:{default:p},document,innerWidth:390,innerHeight:844,matchMedia:()=>media,requestAnimationFrame:fn=>{rafs.set(++id,fn);return id;},cancelAnimationFrame:key=>rafs.delete(key),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},window:{devicePixelRatio:2,addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:k=>events.delete(k),dispatchEvent(){}}};
  vm.runInNewContext(code,context);const dispose=context.exports.startPosterBackground();
  await new Promise(resolve=>setImmediate(resolve));
  function advance(time){const tasks=[...rafs.values()];rafs.clear();tasks.forEach(fn=>fn(time));}
  for(let t=0;t<60000;t+=34)advance(t);
  assert(renders>100);assert(lastUniforms.uIndex.value>=2);
  const held=lastUniforms.uTime.value;
  document.hidden=true;listeners.get('visibilitychange')();assert.equal(rafs.size,0);
  advance(100000);assert.equal(lastUniforms.uTime.value,held);
  document.hidden=false;listeners.get('visibilitychange')();advance(100034);
  assert(lastUniforms.uTime.value-held<.1);
  media.matches=true;listeners.get('motion')();assert.equal(rafs.size,0);assert.equal(lastUniforms.uIntro.value,1);
  dispose();assert(removed&&disposed);assert.equal(events.size,0);assert.equal(listeners.size,0);assert.equal(canvasEvents.size,0);assert.equal(rafs.size,0);
});
