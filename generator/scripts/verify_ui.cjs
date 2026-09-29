// Event-level regression checks; no claim of browser rendering or visual QA.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
// Self-contained: TypeScript's parser and postcss come from this project's own node_modules.
const ts=require('typescript'),postcss=require('postcss');
function functionsIn(code){const out=new Map(),sf=ts.createSourceFile('inline.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);(function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)out.set(n.name.text,code.slice(n.getStart(sf),n.end));ts.forEachChild(n,visit);})(sf);return out;}
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
// Parse real <style> elements only: script text can mention "<style>" in comments or strings.
const markupOnly=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
for(const style of markupOnly.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) postcss.parse(style[1]);
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function mountCoverflow'));
const funcs=functionsIn(script);
class Element{
  constructor(tag='div'){
    this.tag=tag;this.children=[];this.attrs={};this.events={};this.hidden=false;this.offsetLeft=0;this.offsetWidth=100;this.clientWidth=390;this.style={setProperty(){}};
    const values=new Set();this.classList={add:(...a)=>a.forEach(v=>values.add(v)),remove:(...a)=>a.forEach(v=>values.delete(v)),contains:v=>values.has(v),toggle:(v,force)=>{const on=force??!values.has(v);on?values.add(v):values.delete(v);return on;}};
  }
  set innerHTML(v){this.children=[];} get innerHTML(){return '';}
  appendChild(e){this.children.push(e);e.parent=this;return e;} append(...elements){elements.forEach(e=>this.appendChild(e));}
  insertBefore(e,b){this.children.splice(this.children.indexOf(b),0,e);e.parent=this;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}hasAttribute(k){return k in this.attrs;}
  toggleAttribute(k,on){if(on)this.setAttribute(k,'');else this.removeAttribute(k);}
  addEventListener(k,fn,capture=false){(this.events[k]??=[]).push({fn,capture});}removeEventListener(k,fn){this.events[k]=(this.events[k]||[]).filter(x=>x.fn!==fn);}
  emit(k,e={}){const event={target:this,isPrimary:true,button:0,pointerId:1,pointerType:'touch',clientX:0,clientY:0,detail:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...e};for(const {fn} of [...(this.events[k]||[])].sort((a,b)=>b.capture-a.capture)){fn(event);if(event.stopped)break;}return event;}
  closest(s){return s==='.nav-item'&&this.className==='nav-item'?this:this.parent?.closest(s);}
  querySelectorAll(s){return s==='.nav-item'?this.children.filter(e=>e.className==='nav-item'):[];}
  getBoundingClientRect(){return {left:0,top:0,width:390,height:300};}
  setPointerCapture(id){this.capture=id;}hasPointerCapture(id){return this.capture===id;}releasePointerCapture(){this.capture=null;}
  focus(){this.focused=true;}scrollTo(options){this.scroll=options;}
  querySelector(s){return s==='h1, h2'?this.heading||null:null;}
}
let time=0,id=0;const timers=new Map(),rafs=new Map();
const window=new Element();window.innerWidth=390;
const nav=new Element(),pill=new Element();
// Nav pages: Contact, About (which also shows the Portfolio section), Store. Portfolio is a section, not a nav item.
const items=['contact','about','store'].map((name,i)=>{const e=new Element('button');e.className='nav-item';e.setAttribute('data-section',name);e.offsetLeft=6+i*100;nav.appendChild(e);return e;});
const sections=Object.fromEntries(['contact','about','portfolio','store','gallery'].map(name=>{const s=new Element();s.name=name;s.hidden=!(name==='about'||name==='portfolio');s.heading=new Element('h2');return [name,s];}));
const visible=()=>Object.values(sections).filter(s=>!s.hidden).map(s=>s.name).sort().join(',');
window.playAboutIntro=()=>{c.intros=(c.intros||0)+1;};
const c=vm.createContext({console,window,document:{createElement:t=>new Element(t),getElementById:()=>new Element()},nav,navItemsContainer:nav,navPill:pill,navItems:items,sections,
  PAGE_SECTIONS:{about:['about','portfolio'],contact:['contact'],gallery:['gallery'],store:['store'],tips:['tips']},
  activeSection:'about',reducedMotion:false,pillX:106,pillW:100,pillRAF:0,NAV_MS:300,sectionTimer:null,sectionSwitching:false,pendingScroll:null,galleryTeardown:()=>{},galleryCoverflowEl:new Element(),
  performance:{now:()=>time},requestAnimationFrame:fn=>{rafs.set(++id,fn);return id;},cancelAnimationFrame:i=>rafs.delete(i),
  setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:i=>timers.delete(i),
  ResizeObserver:class{observe(){}disconnect(){}},POSTERS:[],IMG_BASE:'images/',
  loadStorePage(page){c.shopLoads=(c.shopLoads||[]).concat(page);},
  buildPicture:()=>new Element('picture'),isPinned:()=>false,setPinned(){},sampleDominantColor:(p,cb)=>cb('#c88'),openLightbox:(p,i)=>{c.opened=i;}});
function timersOnce(){const tasks=[...timers.values()];timers.clear();tasks.forEach(f=>f());}
function frames(){for(let n=0;n<100&&rafs.size;n++){time+=16.667;const callbacks=[...rafs.values()];rafs.clear();callbacks.forEach(f=>f(time));}}
for(const name of ['clamp','cubicBezier','movePill','navPage','pageSections','focusSectionHeading','switchSection','mountCoverflow','refreshNavItemRefs']) vm.runInContext(funcs.get(name),c);
vm.runInContext('var navEase=cubicBezier(.22,.8,.24,1);',c);
const start=script.indexOf('// Pointer capture keeps a held selection');
vm.runInContext(script.slice(start,script.indexOf('var sectionTimer',start)),c);
// One easing curve, pinned at both ends and never going backwards.
assert.equal(c.navEase(0),0);assert.equal(c.navEase(1),1);
for(let t=0,prev=0;t<=1;t+=.05){const v=c.navEase(t);assert(v>=prev-1e-9,'ease must not reverse');prev=v;}
// Press on About, slide to Store, release before the next paint: Store opens, About + Portfolio close.
nav.emit('pointerdown',{target:items[1],clientX:150});timersOnce();assert(nav.classList.contains('is-holding'));
nav.emit('pointermove',{target:items[1],clientX:250});
nav.emit('pointerup',{target:items[1],clientX:250});timersOnce();frames();
assert.equal(c.activeSection,'store');assert.equal(visible(),'store');assert.equal(c.navDrag,null);
assert.deepEqual(c.shopLoads,['store'],'opening Store mounts the store bundle');
assert.equal(items[2].getAttribute('aria-current'),'page');assert.equal(items[1].getAttribute('aria-current'),null);
// The pill finishes exactly on the selected item.
assert.equal(parseFloat(pill.style.width),items[2].offsetWidth);assert(pill.style.transform.startsWith('translateX('+items[2].offsetLeft.toFixed(2)+'px)'));
// Rapid changes: only the last page is shown, and About always brings Portfolio with it.
c.switchSection('contact');c.switchSection('about');timersOnce();timersOnce();frames();
assert.equal(c.activeSection,'about');assert.equal(visible(),'about,portfolio');
// Portfolio from another page: About opens, the poster-wall intro is skipped, the view lands on Portfolio.
c.switchSection('contact');timersOnce();timersOnce();assert.equal(visible(),'contact');
const introsBefore=c.intros||0;
sections.portfolio.scrolled=0;sections.portfolio.scrollIntoView=function(){this.scrolled++;};
c.switchSection('portfolio',true);timersOnce();frames();
assert.equal(c.activeSection,'about');assert.equal(visible(),'about,portfolio');assert.equal(sections.portfolio.scrolled,1);
assert.equal(c.intros||0,introsBefore,'no poster-wall flash when jumping to Portfolio');
assert(sections.about.classList.contains('about-intro-done'));
assert(sections.portfolio.heading.focused,'focus moves to the Portfolio heading');
// Portfolio while already on About: scroll only, no page switch.
c.switchSection('portfolio');assert.equal(sections.portfolio.scrolled,2);assert.equal(c.activeSection,'about');timersOnce();
// Cancelled drag keeps the current page.
nav.emit('pointerdown',{target:items[1],clientX:150});nav.emit('pointermove',{target:items[1],clientX:20});nav.emit('pointercancel');frames();assert.equal(c.activeSection,'about');assert.equal(c.navDrag,null);
assert(nav.emit('click',{target:items[0]}).stopped);assert(!nav.emit('click',{target:items[0],detail:0}).stopped,'keyboard click suppressed');
nav.emit('pointerdown',{target:items[1],clientX:150});nav.emit('pointermove',{target:items[1],clientX:225});frames();
assert(pill.style.transform.includes('scale('));assert.notEqual(pill.style.borderRadius,'999px');
nav.emit('pointerup',{target:items[1],clientX:225});timersOnce();frames();
assert(pill.classList.contains('is-releasing'));assert.equal(pill.style.borderRadius,'999px');
const container=new Element();
const posters=Array.from({length:8},(_,i)=>({slug:'art'+i,title:'Artwork '+i,cat:'Design'}));
const teardown=c.mountCoverflow(container,posters,{});
function find(e,cls){if(e.className===cls)return e;for(const child of e.children){const r=find(child,cls);if(r)return r;}}
const controls=find(container,'cf-controls'),viewport=find(container,'coverflow-viewport'),track=find(container,'coverflow-track');
assert.equal(controls.children[1].textContent,'1 / 8');controls.children[2].emit('click');assert.equal(controls.children[1].textContent,'2 / 8');
viewport.emit('pointerdown',{clientX:280});viewport.emit('pointermove',{clientX:110});viewport.emit('pointerup',{clientX:100});
assert.equal(controls.children[1].textContent,'3 / 8');assert(viewport.emit('click').stopped);
viewport.emit('pointerdown',{clientX:280});viewport.emit('pointermove',{clientX:100});viewport.emit('pointercancel',{clientX:100});assert.equal(controls.children[1].textContent,'3 / 8');
assert.equal(track.children.filter(e=>e.tabIndex===0).length,1);assert(track.children[7].inert);
teardown();assert.equal(container.children.length,0);
console.log('PASS: CSS parses; nav hold/drag/release-before-paint; cancellation; keyboard click fallback; rapid section changes; gallery buttons/swipe/cancel; click suppression; focusability; teardown.');
// Exercise actual chat functions with a mocked SSE response, without an API call.
Object.defineProperty(Element.prototype,'parentNode',{get(){return this.parent||null;}});
Element.prototype.remove=function(){if(this.parent){this.parent.children=this.parent.children.filter(e=>e!==this);this.parent=null;}};
const chatScript=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function sendMessage(text)'));
const chatFuncs=functionsIn(chatScript);
const messagesEl=new Element(),panel=new Element(),launcher=new Element(),input=new Element(),sendBtn=new Element();
let reads=0;const chatEvents=[];
const packets=['data: {"text":"Hello"}\n\n','data: [DONE]\n\n'];
const chat=vm.createContext({console,window,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},navigator:{language:'en'},TextDecoder,history:[],opened:false,streaming:false,followChat:true,closeTimer:null,reducedMotion:false,
  kaApiUrl:path=>path, // mirrors the real KA_API_BASE=''-by-default helper at the top of index.html (see the "API BASE CONFIG" script block)
  messagesEl,panel,launcher,input,sendBtn,chipsEl:new Element(),QUICK_REPLIES:[],pickGreeting:()=>"Welcome",
  // returning visitor with no saved conversation: greeted by name, nothing restored, nothing persisted
  getVisitorName:()=>"Tester",loadStoredChatHistory:()=>[],saveChatHistory(){},addQuickReplies(){},
  document:{createElement:t=>new Element(t),dispatchEvent:event=>chatEvents.push(event)},requestAnimationFrame:c.requestAnimationFrame,setTimeout:c.setTimeout,clearTimeout:c.clearTimeout,
  fetch:()=>Promise.resolve({ok:true,headers:{get:name=>name.toLowerCase()==='content-type'?'text/event-stream':null},body:{getReader:()=>({read:()=>Promise.resolve(reads<packets.length?{done:false,value:new TextEncoder().encode(packets[reads++])}:{done:true})})}})});
for(const name of ['addMessage','addTypingIndicator','removeChips','openPanel','closePanel','sendMessage']) vm.runInContext(chatFuncs.get(name),chat);
(async()=>{
  chat.openPanel();chat.closePanel();chat.openPanel();timersOnce();frames();
  assert.deepEqual(chatEvents.map(event=>event.detail.open),[true,false,true]);
  assert(!panel.hidden && panel.classList.contains('open'),'quick reopen was hidden by old close timer');
  chat.sendMessage('A test question');chat.sendMessage('Must not send twice');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(chat.history.length,2);assert.equal(chat.history[1].content,'Hello');assert.equal(reads,2);
  assert(!chat.streaming && !sendBtn.disabled);assert.equal(messagesEl.attrs['aria-busy'],'false');
  chat.fetch=()=>Promise.reject(new Error('fixture network error'));
  chat.sendMessage('Another test');await new Promise(resolve=>setImmediate(resolve));
  assert(!chat.streaming && !sendBtn.disabled);assert.equal(panel.attrs['aria-busy'],'false');
  console.log('PASS: chat quick reopen; duplicate-send protection; one SSE completion/history entry; busy-state cleanup after success and failure.');
})().catch(error=>{console.error(error);process.exitCode=1;});
