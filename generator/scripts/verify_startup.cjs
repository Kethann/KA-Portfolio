// Execute the complete hero script, including asset callbacks and frame scheduling.
// Renderer/canvas are stubs: this catches integration exceptions, not shader/visual errors.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require(path.resolve(__dirname,'../../../Portfolio-main/node_modules/three/build/three.cjs'));
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const MANIFEST'));
const noop=()=>{},gradient={addColorStop:noop};
const canvasContext=new Proxy({createRadialGradient:()=>gradient,createLinearGradient:()=>gradient,measureText:()=>({width:60})},{get:(target,name)=>target[name]||noop});
class Element extends EventTarget{
  style={};children=[];attrs={};classList={add:noop,remove:noop,contains:()=>false};
  getContext(){return canvasContext;}appendChild(el){this.children.push(el);return el;}setAttribute(k,v){this.attrs[k]=v;}
  getBoundingClientRect(){return {left:0,top:0,width:1440,height:900};}
}
const elements=new Map(),document=new Element();document.hidden=false;document.body=new Element();
document.getElementById=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
document.querySelector=()=>new Element();document.createElement=()=>new Element();document.createElementNS=()=>new Element();
const callbacks=[],rafs=new Map();let now=0,id=0,renders=0,completed=0;
class TextureLoader{load(_url,cb){const texture=new THREE.Texture({width:1120,height:1576});callbacks.push(cb);return texture;}}
class Renderer{domElement=new Element();capabilities={getMaxAnisotropy:()=>8};setPixelRatio(){}setSize(){}setClearColor(){}render(scene,camera){scene.updateMatrixWorld();camera.updateMatrixWorld();renders++;}}
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
vm.runInContext(source,context,{filename:'live-hero.js'});
callbacks.forEach(cb=>cb());assert.equal(rafs.size,1,'startup must schedule exactly one frame');
for(now=16;now<30000;now+=16){const pending=[...rafs.values()];rafs.clear();pending.forEach(fn=>fn(now));}
assert.equal(elements.get('boot-veil').style.opacity,'0');assert.equal(completed,1,'animation must reach its final reveal');assert(renders>100);
console.log('PASS: complete hero startup, first paint, fragment assembly and final reveal execute without exceptions.');
