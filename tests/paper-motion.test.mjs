import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('var KaRocket = (function(){'), html.indexOf('// ==================================================================== CONTACT FORM'))
  .replace('return { send: send,', 'return { fly: fly, send: send,')
  .replace('var scale = cfg.scale.start', 'window.record({phase,zN,returnDepth,elapsed:now-phaseStart,bank}); var scale = cfg.scale.start');

function harness({width = 390, height = 844, dpr = 3, memory = 4} = {}) {
  const frames = new Map(), timers = new Map(), nodes = [], samples = [];
  let id = 0, failDraw = false;
  const ctx = {setTransform(){}, clearRect(){}, fillRect(){}, createRadialGradient(){return {addColorStop(){}};}, drawImage(){if(failDraw) throw Error('Renderer lost');}};
  function node(tag) {
    const n = {tag, style:{}, dataset:{}, children:[], attrs:{}, inert:false,
      classList:{add(){}, remove(){}, toggle(){}, contains(){return false;}},
      setAttribute(k,v){this.attrs[k]=v;}, removeAttribute(k){delete this.attrs[k];},
      appendChild(c){this.children.push(c);c.parentNode=this;},
      removeChild(c){this.children=this.children.filter(x=>x!==c);c.parentNode=null;},
      remove(){this.parentNode?.removeChild(this);}, getContext(){return ctx;},
      animate(keys,options){this.animation={keys,options,cancel(){}};return this.animation;},
      focus(options){this.focused=options;},
      getBoundingClientRect(){return {left:24,top:200,right:width-24,bottom:650,width:width-48,height:450};}
    };
    nodes.push(n);return n;
  }
  const body=node('body'), button=node('button'), card=node('card');
  button.getBoundingClientRect=()=>({left:30,top:580,width:140,height:44});
  const selectors = Object.fromEntries(['.cc-front','.cc-back','.cc-flip','.cc-result-title','.cc-result-text','.cc-action','.contact-form'].map(s=>[s,node(s)]));
  card.querySelector=selectors['.cc-back'].querySelector=s=>selectors[s];
  const window={innerWidth:width,innerHeight:height,devicePixelRatio:dpr,record:s=>samples.push(s),matchMedia:()=>({matches:false})};
  const context={window,navigator:{deviceMemory:memory}, document:{body,createElement:node,createElementNS:(_,tag)=>node(tag)},
    getComputedStyle:()=>({backgroundImage:'',borderTopColor:''}),
    setTimeout(fn){timers.set(++id,fn);return id;}, clearTimeout(i){timers.delete(i);},
    requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(i){frames.delete(i);}};
  window.requestAnimationFrame=context.requestAnimationFrame;
  vm.createContext(context);vm.runInContext(source,context);
  return {api:context.KaRocket,window,button,card,nodes,frames,samples,selectors,
    fail(){failDraw=true;}, flush(){for(const fn of timers.values())fn();timers.clear();},
    step(t){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(t));}};
}

for(const hz of [30,60,144]) test(`flight at ${hz} Hz preserves response and uses time-based landing depth`,async()=>{
  const h=harness(), outcome={ok:false,message:'Service unavailable'};
  const flight=h.api.fly(h.button,h.card,Promise.resolve(outcome));
  await Promise.resolve();
  for(let t=1;t<2200;t+=1000/hz) h.step(t);
  assert.equal(await flight,outcome);
  const landing=h.samples.filter(s=>s.phase==='return');
  assert.ok(landing.length>5);
  for(const s of landing){
    const expected=s.returnDepth*(1+Math.cos(Math.PI*s.elapsed/h.api.defaults.returnMs))/2;
    assert.ok(Math.abs(s.zN-expected)<1e-10);
    assert.ok(Math.abs(s.bank)<=12*Math.PI/180);
  }
  const rocket=h.nodes.find(n=>n.className==='rk-rocket');
  assert.match(rocket.style.transform,/scale\(0\.850\)/);
  assert.doesNotMatch(rocket.style.transform,/NaN|Infinity/);
  assert.equal(h.frames.size,0);
  h.flush();assert.equal(rocket.parentNode.parentNode,null);
});

test('retina trail resolution adapts to screen and memory budget',async()=>{
  for(const settings of [{width:390,height:844,dpr:3,memory:4},{width:2560,height:1440,dpr:3,memory:2}]){
    const h=harness(settings), result={ok:true};
    const flight=h.api.fly(h.button,h.card,Promise.resolve(result));
    const canvas=h.nodes.find(n=>n.className==='rk-trail');
    const budget=settings.memory<=2?1500000:4000000;
    assert.ok(canvas.width*canvas.height<=budget+5000);
    if(settings.width===390) assert.equal(canvas.width,1170);
    h.window.innerWidth+=1;h.step(1);
    assert.equal(await flight,result);assert.equal(h.frames.size,0);h.flush();
  }
});

test('frame rendering failure rejects and removes the flight overlay',async()=>{
  const h=harness(), flight=h.api.fly(h.button,h.card,Promise.resolve({ok:true}));
  const rejected=assert.rejects(flight,/Renderer lost/);
  await Promise.resolve();h.fail();
  for(let t=1;t<600;t+=16)h.step(t);
  await rejected;h.flush();
  assert.equal(h.frames.size,0);
  assert.equal(h.nodes.find(n=>n.className==='rk-layer').parentNode,null);
});

test('card turns directly to accessible error result without a backward kick',async()=>{
  const h=harness(), flip=h.api.flip(h.card,{ok:false,message:'Please retry'});
  const animation=h.selectors['.cc-flip'].animation;
  assert.equal(animation.keys.length,2);
  assert.equal(animation.keys[0].transform,'rotateY(0deg) scale(1)');
  assert.equal(animation.keys[1].transform,'rotateY(180deg) scale(1)');
  animation.onfinish();await flip;
  assert.equal(h.card.dataset.state,'error');
  assert.equal(h.selectors['.cc-result-text'].textContent,'Please retry');
  assert.equal(h.selectors['.cc-front'].inert,true);
  assert.equal(h.selectors['.cc-back'].inert,false);
  assert.equal(h.selectors['.cc-result-title'].focused.preventScroll,true);
});
