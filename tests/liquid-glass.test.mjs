import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('(function kaLiquidGlass(){');
const source=html.slice(start,html.indexOf('</script>',start));
function setup(reduced=false){
  const listeners={},frames=new Map(),media=[];let id=0;
  function element(){const classes=new Set();return {style:{},children:[],isConnected:true,
    classList:{add(...v){v.forEach(x=>classes.add(x));},remove(...v){v.forEach(x=>classes.delete(x));},toggle(v,on){on?classes.add(v):classes.delete(v);}},
    appendChild(el){this.children.push(el);},setAttribute(){},closest(){return this;},contains(el){return el===this;},
    getBoundingClientRect(){return {left:0,top:0,right:200,bottom:60,width:200,height:60};}};}
  const surface=element(),document={hidden:false,querySelectorAll:()=>[surface],createElement:element,addEventListener:(n,fn)=>listeners[n]=fn};
  vm.runInNewContext(source,{document,window:{addEventListener(){}},navigator:{deviceMemory:4,hardwareConcurrency:4},
    matchMedia:q=>{const m={matches:reduced&&q.includes('reduced-motion'),addEventListener(n,fn){this.change=fn;}};media.push(m);return m;},
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:i=>frames.delete(i)});
  return {surface,document,frames,media,light:surface.children[0].children[0],
    fire(type,extra={}){listeners[type]({type,target:surface,clientX:190,clientY:20,pointerType:'mouse',...extra});},
    tick(t){const f=[...frames.values()];frames.clear();f.forEach(fn=>fn(t));}};
}
test('liquid reflection coalesces events, settles, and releases its animation',()=>{
  const h=setup();for(let i=0;i<100;i++)h.fire('pointermove');
  assert.equal(h.frames.size,1);
  for(let t=1;t<1600;t+=16)h.tick(t);
  assert.equal(h.frames.size,0);assert.match(h.light.style.transform,/translate3d/);
  h.fire('pointerout',{relatedTarget:null});assert.equal(h.light.style.transform,'');
});
test('touch press works without hijacking scroll and cancellation clears state',()=>{
  const h=setup();h.fire('pointermove',{pointerType:'touch'});assert.equal(h.frames.size,0);
  h.fire('pointerdown',{pointerType:'touch'});h.tick(1);assert.equal(h.light.style.opacity,'.34');
  h.fire('pointercancel');assert.equal(h.frames.size,0);assert.equal(h.light.style.opacity,'');
});
test('reduced motion and hidden pages never keep a reflection loop alive',()=>{
  const h=setup(true);h.fire('pointerdown');assert.equal(h.frames.size,0);
  h.media[0].matches=false;h.fire('pointermove');assert.equal(h.frames.size,1);
  h.document.hidden=true;h.fire('visibilitychange');assert.equal(h.frames.size,0);
  h.fire('pointermove');assert.equal(h.frames.size,0);
});
