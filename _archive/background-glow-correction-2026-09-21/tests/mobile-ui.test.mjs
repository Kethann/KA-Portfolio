import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as Three from 'three';
import ts from 'typescript';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function harness(){
  const listeners=new Map(),media=new Map(),frames=new Map();let now=1,id=0,strokes=0,stars=0;
  const listen=(type,fn)=>{const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);};
  const context2d=new Proxy({drawImage(){stars++;},stroke(){strokes++;},createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]||(()=>{})});
  const element=()=>({style:{},appendChild(){},getContext:()=>context2d,addEventListener:listen});
  const canvas=element(),document={hidden:false,body:{style:{}},getElementById:()=>canvas,createElement:element,addEventListener:listen};
  const window={devicePixelRatio:3,addEventListener:listen,matchMedia:query=>{
    if(!media.has(query))media.set(query,{matches:query.includes('max-width'),addEventListener:(_type,fn)=>media.get(query).change=fn});
    return media.get(query);
  }};
  const context=vm.createContext({document,window,navigator:{hardwareConcurrency:4},performance:{now:()=>now},kaLayoutW:()=>390,kaLayoutH:()=>844,
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
  return {context,canvas,document,media,frames,get strokes(){return strokes;},get stars(){return stars;},emit(type,event={}){for(const fn of listeners.get(type)||[])fn(event);},step(ms=17){now+=ms;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(now));}};
}
const touch=(x=10)=>({pointerType:'touch',pointerId:1,isPrimary:true,clientX:x,clientY:100,composedPath:()=>[]});

test('touch-only phones draw the desktop trail and drain their animation after release',()=>{
  const h=harness();vm.runInContext(scripts.find(s=>s.includes('function trackTrailPointer')),h.context);
  assert(h.canvas.width>0,'coarse devices must initialize the canvas');
  h.emit('pointerdown',touch());h.step();h.emit('pointermove',touch(60));h.step();assert(h.strokes>0);
  h.emit('pointerup',touch(60));for(let i=0;i<60;i++)h.step();assert.equal(h.frames.size,0,'no idle animation loop');
});
test('native scrolling retains the touch trail, while pinch and cancelled gestures clear it',()=>{
  const h=harness();vm.runInContext(scripts.find(s=>s.includes('function trackTrailPointer')),h.context);
  h.emit('pointerdown',touch());h.emit('pointercancel',touch());
  h.emit('touchmove',{touches:[{clientX:10,clientY:100}],composedPath:()=>[]});h.step();
  h.emit('touchmove',{touches:[{clientX:70,clientY:100}],composedPath:()=>[]});h.step();assert(h.strokes>0);
  h.emit('touchmove',{touches:[{},{}]});assert.equal(h.frames.size,0);
  h.emit('pointerdown',touch());h.media.get('(prefers-reduced-motion: reduce)').change({matches:true});assert.equal(h.frames.size,0);
  h.emit('pointermove',touch(100));assert.equal(h.frames.size,0);
});
test('touch gestures over form controls never draw a trail',()=>{
  const h=harness();vm.runInContext(scripts.find(s=>s.includes('function trackTrailPointer')),h.context);
  const event={...touch(),composedPath:()=>[{matches:()=>true}]};h.emit('pointerdown',event);h.step();h.emit('pointermove',event);h.step();assert.equal(h.strokes,0);
});
test('background bounds pixel cost, throttles rendering, and cancels hidden/reduced-motion frames',()=>{
  const h=harness();let renderer;
  class Renderer{
    constructor(){renderer=this;this.domElement={style:{},addEventListener(){}};this.renders=0;}
    setClearColor(){}setPixelRatio(value){this.ratio=value;}getPixelRatio(){return this.ratio;}
    setSize(w,height){this.pixels=w*height*this.ratio**2;}
    render(scene){this.scene=scene;this.renders++;}
  }
  h.context.THREE={...Three,WebGLRenderer:Renderer};
  vm.runInContext(scripts.find(s=>s.includes('// Procedural deep-space nebula backdrop')),h.context);
  assert(renderer.pixels<=900000);const initial=renderer.renders;
  for(let i=0;i<60;i++)h.step(1000/60);assert(renderer.renders-initial<=31);
  h.document.hidden=true;h.emit('visibilitychange');assert.equal(h.frames.size,0);
  h.document.hidden=false;h.emit('visibilitychange');assert.equal(h.frames.size,1);
  h.media.get('(prefers-reduced-motion: reduce)').change({matches:true});assert.equal(h.frames.size,0);
  let analytic=0;renderer.scene.traverse(object=>{if(object.material?.onBeforeCompile&&object.isSprite){const shader={fragmentShader:'#include <map_fragment>\n#include <fog_fragment>'};object.material.onBeforeCompile(shader);if(shader.fragmentShader.includes('float radius=')){analytic++;assert(object.material.opacity<0.04);assert(shader.fragmentShader.includes('1.0-smoothstep(0.55,1.0,radius)'));}}});
  assert(analytic>0,'galaxy glows must use continuous shader falloff');
});

test('the mobile chat viewport follows the keyboard without resizing during pinch zoom',()=>{
  const h=harness(),properties={};
  h.context.document.documentElement={style:{setProperty:(key,value)=>properties[key]=value}};
  const viewport={height:780,offsetTop:0,scale:1,addEventListener:(name,fn)=>h.context.window.addEventListener(name,fn)};
  h.context.window.visualViewport=viewport;
  vm.runInContext(scripts.find(s=>s.includes('var viewport=window.visualViewport,frame=0')),h.context);
  assert.equal(properties['--ka-visible-height'],'780px');
  viewport.height=420;viewport.offsetTop=30;h.emit('resize');h.step();assert.equal(properties['--ka-visible-height'],'420px');assert.equal(properties['--ka-visible-top'],'30px');
  viewport.scale=2;viewport.height=210;h.emit('resize');h.step();assert.equal(properties['--ka-visible-height'],'420px');
});

test('carousel leaves vertical scrolling native and cancels horizontal gestures without a flick',async()=>{
  const code=await readFile(new URL('../client/src/WorkStacks.tsx',import.meta.url),'utf8');
  const source=ts.createSourceFile('stacks.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions=new Map();
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node.getText(source));ts.forEachChild(node,visit);}visit(source);
  const s={pointerId:-1,pos:0,vel:0,target:0,dragging:false,moved:false,cw:200};
  const context=vm.createContext({st:{current:s},startY:{current:0},cfg:{current:{loop:false,n:5,canHover:false}},performance:{now:()=>10},unit:()=>100,
    stageRef:{current:{setPointerCapture(){},releasePointerCapture(){},classList:{add(){},remove(){}}}},clamp:(v,lo,hi)=>Math.min(hi,Math.max(lo,v)),clampTarget:v=>v,report(){},kick(){}});
  for(const name of ['down','move','cancel'])vm.runInContext(ts.transpileModule(functions.get(name),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const event={pointerId:1,pointerType:'touch',isPrimary:true,clientX:100,clientY:100};
  context.down(event);context.move({...event,clientX:109,clientY:145});assert.equal(s.pointerId,-1);assert.equal(s.dragging,false);
  context.down(event);context.move({...event,clientX:40,clientY:102});assert.equal(s.dragging,true);
  context.cancel(event);assert.equal(s.dragging,false);assert.equal(s.vel,0);assert.equal(s.pointerId,-1);assert.equal(s.target,Math.round(s.pos));
});


test('cursor stars survive a delayed first frame and remain visible over navigation',()=>{
  const h=harness();vm.runInContext(scripts.find(s=>s.includes('function trackTrailPointer')),h.context);
  const pointer={...touch(80),pointerType:'mouse',composedPath:()=>[{id:'site-nav',matches:()=>false,closest:()=>true}]};
  h.emit('pointermove',pointer);h.step(120);
  assert(h.stars>0,'latest input must render even after a busy frame');
  const before=h.stars;h.emit('pointermove',{...pointer,clientX:130});h.step();
  assert(h.stars>before,'navigation must not silently clear the cursor stars');
  h.emit('pointerout',{relatedTarget:null});for(let i=0;i<60;i++)h.step();
  assert.equal(h.frames.size,0,'leaving the window drains the effect');
});

test('cursor star draw cost stays bounded and blur clears pending work',()=>{
  const h=harness();vm.runInContext(scripts.find(s=>s.includes('function trackTrailPointer')),h.context);
  for(let i=0;i<180;i++){
    h.emit('pointermove',{...touch((i*45)%350),pointerType:'mouse'});
    const before=h.stars;h.step();assert(h.stars-before<=48);
  }
  h.emit('blur');assert.equal(h.frames.size,0);
  h.emit('pointermove',{...touch(200),pointerType:'mouse'});h.step();assert(h.frames.size>0,'can resume after blur');
});
