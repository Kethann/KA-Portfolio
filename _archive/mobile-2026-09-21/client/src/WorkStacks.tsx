import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent,MouseEvent as ReactMouseEvent,PointerEvent as ReactPointerEvent} from 'react';
import type {Project} from './types';

export type StacksSettings={loop?:boolean;covers?:Record<string,string>};
export type WorkStacksProps={folders:string[];images:Project[];stacks?:StacksSettings;/** Distinguishes panels (Portfolio, About) so each plays its own entrance once. */id?:string};
type Stack={name:string;items:Project[];cover:Project};

/** The scatter-to-organize entrance plays once per panel per page load, however often it re-renders or remounts. */
const entrancePlayed=new Set<string>();

const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));
const mod=(v:number,n:number)=>((v%n)+n)%n;
/** Smallest exported width that is at least `min`, else the largest available. Uploaded images carry their own src. */
function sized(p:Project,min:number){
  if(p.src)return p.src;
  const widths=[...p.widths].sort((a,b)=>a-b),w=widths.find(x=>x>=min)||widths[widths.length-1];
  return w?`/images/${p.slug}-${w}.webp`:`/images/${p.slug}-full.webp`;
}
function useMedia(query:string){
  const [matches,setMatches]=useState(()=>typeof matchMedia==='function'&&matchMedia(query).matches);
  useEffect(()=>{
    if(typeof matchMedia!=='function')return;
    const mq=matchMedia(query),on=()=>setMatches(mq.matches);on();
    if(mq.addEventListener)mq.addEventListener('change',on);else mq.addListener(on);
    return()=>{if(mq.removeEventListener)mq.removeEventListener('change',on);else mq.removeListener(on);};
  },[query]);
  return matches;
}

/* ============================================================ organized stacks ===== */
function StackGrid({id,stacks,reduced,onOpen}:{id:string;stacks:Stack[];reduced:boolean;onOpen:(name:string,opener:HTMLElement)=>void}){
  const rootRef=useRef<HTMLDivElement>(null);
  const [entered,setEntered]=useState(reduced||entrancePlayed.has(id));
  const keys=stacks.map(s=>s.name).join('|');
  useEffect(()=>{
    if(entered||!stacks.length)return;
    const root=rootRef.current;if(!root)return;
    let started=false,timer=0;
    function play(){
      if(started||entrancePlayed.has(id))return;started=true;entrancePlayed.add(id);
      const box=root!.getBoundingClientRect(),els=Array.from(root!.querySelectorAll<HTMLElement>('.stack'));
      const anims=els.map((el,i)=>{
        const r=el.getBoundingClientRect(),padX=Math.min(80,box.width*.08),padY=Math.min(60,box.height*.1);
        // Scattered start: a random spot inside the panel bounds with a random tilt.
        const tx=box.left+padX+Math.random()*Math.max(1,box.width-2*padX),ty=box.top+padY+Math.random()*Math.max(1,box.height-2*padY);
        const dx=tx-(r.left+r.width/2),dy=ty-(r.top+r.height/2),rot=(Math.random()*40-20).toFixed(1);
        return el.animate([
          {transform:`translate3d(${dx}px,${dy}px,0) rotate(${rot}deg) scale(.9)`,opacity:0},
          {transform:'translate3d(0,0,0) rotate(0deg) scale(1)',opacity:1}
        ],{duration:1000,delay:i*110,easing:'cubic-bezier(.34,1.32,.64,1)',fill:'both'});
      });
      Promise.all(anims.map(a=>a.finished.catch(()=>undefined))).then(()=>{setEntered(true);anims.forEach(a=>{try{a.commitStyles();a.cancel();}catch{/* element already gone */}});});
    }
    if(typeof IntersectionObserver!=='function'){play();return;}
    const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){io.disconnect();play();}},{threshold:.2});
    io.observe(root);
    // If the panel is never observed as visible (hidden tab, odd layout), still reveal the stacks.
    timer=window.setTimeout(()=>{io.disconnect();play();},4000);
    return()=>{io.disconnect();clearTimeout(timer);};
  },[entered,keys]);
  return <div className={'stack-grid'+(entered?' is-entered':' is-pending')} ref={rootRef}>
    {stacks.map(s=>{
      const count=s.items.length,others=s.items.filter(i=>i.slug!==s.cover.slug);
      return <button type="button" className="stack" key={s.name} onClick={e=>onOpen(s.name,e.currentTarget)} aria-label={`${s.name}, ${count} ${count===1?'image':'images'}. Open`}>
        <span className="deck">
          {count>2&&<span className="layer l2" aria-hidden="true"><img src={sized(others[1]||s.cover,480)} alt="" loading="lazy" decoding="async" draggable={false}/></span>}
          {count>1&&<span className="layer l1" aria-hidden="true"><img src={sized(others[0]||s.cover,480)} alt="" loading="lazy" decoding="async" draggable={false}/></span>}
          <span className="front"><img src={sized(s.cover,768)} alt={s.cover.title} loading="lazy" decoding="async" draggable={false}/></span>
        </span>
        <span className="meta"><strong>{s.name}</strong><small>{count} {count===1?'image':'images'}</small></span>
      </button>;
    })}
  </div>;
}

/* ============================================================ magnetic coverflow ===== */
const VISIBLE=3;
function Coverflow({stack,loop,reduced,canHover,onClose}:{stack:Stack;loop:boolean;reduced:boolean;canHover:boolean;onClose:()=>void}){
  const items=stack.items,n=items.length;
  // Loop by modulo on the position. Short stacks are repeated (virtual slots) so the wrap point
  // always sits beyond the visible range and can never be seen as a seam.
  const slots=loop&&n>1?(n<7?n*Math.ceil(7/n):n):n;
  const stageRef=useRef<HTMLDivElement>(null),cardRefs=useRef<(HTMLDivElement|null)[]>([]),magRefs=useRef<(HTMLDivElement|null)[]>([]),shadowRefs=useRef<(HTMLSpanElement|null)[]>([]);
  const st=useRef({pos:0,vel:0,target:0,dragging:false,moved:false,raf:0,last:0,cw:280,px:0,py:0,inside:false,startX:0,startPos:0,samples:[] as {t:number,p:number}[],pointerId:-1,mags:[] as {x:number,y:number,s:number,o:number}[]});
  const [active,setActive]=useState(0);
  const activeRef=useRef(0);
  const cfg=useRef({loop,reduced,canHover,n,slots});cfg.current={loop,reduced,canHover,n,slots};

  const wrapD=(d:number)=>cfg.current.loop?mod(d+cfg.current.slots/2,cfg.current.slots)-cfg.current.slots/2:d;
  const clampTarget=(t:number)=>cfg.current.loop?t:clamp(t,0,cfg.current.n-1);
  const report=()=>{const a=mod(Math.round(st.current.target),cfg.current.n);if(a!==activeRef.current){activeRef.current=a;setActive(a);}};

  const layout=useCallback(()=>{
    const s=st.current,{loop:lp,reduced:rd,slots:sl}=cfg.current,cw=s.cw;
    for(let i=0;i<sl;i++){
      const el=cardRefs.current[i];if(!el)continue;
      let d=i-s.pos;if(lp)d=mod(d+sl/2,sl)-sl/2;
      const ad=Math.abs(d),sg=Math.sign(d);
      if(ad>VISIBLE){if(el.dataset.v!=='0'){el.style.visibility='hidden';el.dataset.v='0';el.tabIndex=-1;}continue;}
      if(el.dataset.v!=='1'){el.style.visibility='visible';el.dataset.v='1';}
      if(ad<=VISIBLE+1){const img=el.querySelector('img');if(img&&!img.getAttribute('src'))img.setAttribute('src',img.dataset.src||'');}
      const gap=cw*(rd?.7:.5),x=sg*(ad<=1?ad*gap:gap+(ad-1)*gap*.55);
      const z=rd?0:-(ad<=1?ad*130:130+(ad-1)*90),rot=rd?0:-sg*Math.min(ad,1)*46,sc=1-Math.min(ad,VISIBLE)*(rd?.05:.075);
      el.style.transform=`translate3d(${x.toFixed(2)}px,0,${z.toFixed(2)}px) rotateY(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
      el.style.opacity=String(clamp(VISIBLE+.4-ad,0,1));
      el.style.zIndex=String(100-Math.round(ad*10));
      el.tabIndex=el.dataset.dup==='1'?-1:0;
    }
  },[]);

  const magnet=useCallback(()=>{
    const s=st.current,{canHover:hv,reduced:rd,slots:sl,loop:lp}=cfg.current;let busy=false;
    const on=hv&&!rd&&s.inside&&!s.dragging;
    for(let i=0;i<sl;i++){
      const mag=magRefs.current[i],shadow=shadowRefs.current[i],el=cardRefs.current[i];if(!mag||!shadow||!el)continue;
      let d=i-s.pos;if(lp)d=mod(d+sl/2,sl)-sl/2;
      const m=s.mags[i]||(s.mags[i]={x:0,y:0,s:1,o:0});
      let tx=0,ty=0,ts=1,to=0;
      if(on&&Math.abs(d)<=VISIBLE){
        // Only cards inside the visible range are measured; the pull layers on top of the coverflow transform.
        const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=s.px-cx,dy=s.py-cy,R=s.cw*.8;
        const prox=clamp(1-Math.hypot(dx,dy)/R,0,1);
        if(prox>0){tx=dx*prox*.22;ty=dy*prox*.22;ts=1+.07*prox;to=prox;}
      }
      const k=on?.2:.14;
      m.x+=(tx-m.x)*k;m.y+=(ty-m.y)*k;m.s+=(ts-m.s)*k;m.o+=(to-m.o)*k;
      if(Math.abs(tx-m.x)>.05||Math.abs(ty-m.y)>.05||Math.abs(ts-m.s)>.0005||Math.abs(to-m.o)>.005)busy=true;
      else{m.x=tx;m.y=ty;m.s=ts;m.o=to;}
      mag.style.transform=`translate3d(${m.x.toFixed(2)}px,${m.y.toFixed(2)}px,0) scale(${m.s.toFixed(4)})`;
      shadow.style.opacity=(m.o*.85).toFixed(3);
      shadow.style.transform=`translate3d(${(m.x*.5).toFixed(2)}px,${(14+m.o*12).toFixed(2)}px,0) scale(${(.92+m.o*.16).toFixed(3)})`;
    }
    return busy||on;
  },[]);

  const frame=useCallback((t:number)=>{
    const s=st.current;s.raf=0;
    const dt=Math.min(.05,s.last?(t-s.last)/1000:.016);s.last=t;
    let moving=false;
    if(!s.dragging){
      const err=s.target-s.pos;
      if(cfg.current.reduced){s.pos=s.target;s.vel=0;}
      else{
        // Slightly under-damped spring: soft settle with a hint of overshoot, not an abrupt stop.
        const k=150,c=2*Math.sqrt(k)*.85,steps=Math.max(1,Math.ceil(dt/(1/120)));const h=dt/steps;
        for(let i=0;i<steps;i++){s.vel+=(k*(s.target-s.pos)-c*s.vel)*h;s.pos+=s.vel*h;}
        if(!cfg.current.loop)s.pos=clamp(s.pos,-.35,cfg.current.n-1+.35);
        moving=Math.abs(err)>.0006||Math.abs(s.vel)>.0006;
        if(!moving){s.pos=s.target;s.vel=0;}
      }
    }
    layout();
    const magBusy=magnet();
    if(moving||s.dragging||magBusy){s.raf=requestAnimationFrame(frame);}else s.last=0;
  },[layout,magnet]);
  const kick=useCallback(()=>{if(!st.current.raf)st.current.raf=requestAnimationFrame(frame);},[frame]);

  // Measure the stage, size the cards, and keep them centred through resizes.
  useLayoutEffect(()=>{
    const stage=stageRef.current;if(!stage)return;
    const fit=()=>{const w=stage.clientWidth;st.current.cw=Math.round(clamp(w*.56,150,320));stage.style.setProperty('--cw',st.current.cw+'px');layout();};
    fit();const ro=new ResizeObserver(fit);ro.observe(stage);
    return()=>ro.disconnect();
  },[layout,slots]);
  useEffect(()=>{layout();kick();return()=>{cancelAnimationFrame(st.current.raf);st.current.raf=0;};},[layout,kick,slots,loop]);
  // Turning looping off while parked outside 0..n-1 must not leave the carousel past its ends.
  useEffect(()=>{if(!loop){const s=st.current;s.target=clamp(Math.round(s.target),0,n-1);s.pos=clamp(s.pos,0,n-1);report();kick();}},[loop,n]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};
    document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
  },[onClose]);
  useEffect(()=>{stageRef.current?.focus({preventScroll:true});},[]);

  const go=useCallback((delta:number)=>{
    const s=st.current,next=clampTarget(Math.round(s.target)+delta);if(next===Math.round(s.target)&&!loop)return;
    s.target=next;report();kick();
  },[kick,loop]);// eslint-disable-line react-hooks/exhaustive-deps
  const centre=useCallback((slot:number)=>{
    const s=st.current;let d=slot-s.pos;if(cfg.current.loop)d=mod(d+cfg.current.slots/2,cfg.current.slots)-cfg.current.slots/2;
    const next=clampTarget(Math.round(s.pos+d));if(next===Math.round(s.target))return;
    s.target=next;report();kick();
  },[kick]);// eslint-disable-line react-hooks/exhaustive-deps

  /* Drag-to-scrub: 1:1 while held (mouse, touch and pen through pointer events), momentum + spring snap on release. */
  const unit=()=>Math.max(60,st.current.cw*.55);
  function down(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const s=st.current;s.startX=e.clientX;s.startPos=s.pos;s.moved=false;s.pointerId=e.pointerId;s.samples=[{t:performance.now(),p:s.pos}];
  }
  function move(e:ReactPointerEvent<HTMLDivElement>){
    const s=st.current;s.px=e.clientX;s.py=e.clientY;
    if(s.pointerId===e.pointerId&&(e.pointerType!=='mouse'||e.buttons!==0)){
      const dx=e.clientX-s.startX;
      if(!s.dragging&&Math.abs(dx)>6){s.dragging=true;s.moved=true;stageRef.current?.setPointerCapture(e.pointerId);stageRef.current?.classList.add('is-dragging');}
      if(s.dragging){
        let p=s.startPos-dx/unit();if(!cfg.current.loop)p=clamp(p,0,cfg.current.n-1);
        s.pos=p;s.vel=0;const now=performance.now();s.samples.push({t:now,p});while(s.samples.length>1&&now-s.samples[0].t>90)s.samples.shift();
        s.target=Math.round(p);report();kick();return;
      }
    }
    if(cfg.current.canHover&&e.pointerType==='mouse'){s.inside=true;kick();}
  }
  function up(e:ReactPointerEvent<HTMLDivElement>){
    const s=st.current;if(s.pointerId!==e.pointerId)return;s.pointerId=-1;
    stageRef.current?.classList.remove('is-dragging');
    if(!s.dragging)return;
    s.dragging=false;try{stageRef.current?.releasePointerCapture(e.pointerId);}catch{/* already released */}
    const a=s.samples[0],b=s.samples[s.samples.length-1],span=Math.max(1,b.t-a.t),v=(b.p-a.p)/span*1000; // cards per second
    const flick=cfg.current.reduced?0:clamp(v*.16,-3,3);
    s.target=clampTarget(Math.round(s.pos+flick));s.vel=cfg.current.reduced?0:clamp(v,-14,14);report();kick();
  }
  function leave(){const s=st.current;s.inside=false;kick();}
  function stageClick(e:ReactMouseEvent<HTMLDivElement>){
    if(st.current.moved){st.current.moved=false;return;}
    if(e.target===e.currentTarget||(e.target as HTMLElement).classList.contains('cf-track'))onClose();
  }
  function key(e:ReactKeyboardEvent<HTMLDivElement>){
    if(e.key==='ArrowRight'){e.preventDefault();go(1);}
    else if(e.key==='ArrowLeft'){e.preventDefault();go(-1);}
  }

  const atStart=!loop&&active<=0,atEnd=!loop&&active>=n-1;
  const cards=[];
  for(let i=0;i<slots;i++){
    const it=items[i%n],dup=i>=n;
    cards.push(<div className="cf-card" key={i} ref={el=>{cardRefs.current[i]=el;}} data-dup={dup?'1':'0'} data-v="0" style={{visibility:'hidden'}}
      role="group" aria-roledescription="slide" aria-label={`${(i%n)+1} of ${n}: ${it.title}`} aria-hidden={dup?true:undefined} tabIndex={-1}
      onClick={()=>{if(st.current.moved){return;}centre(i);}}
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();centre(i);}}}>
      <span className="cf-shadow" ref={el=>{shadowRefs.current[i]=el;}} aria-hidden="true"/>
      <div className="cf-mag" ref={el=>{magRefs.current[i]=el;}}>
        <img alt={dup?'':it.title} data-src={sized(it,1080)} decoding="async" draggable={false}/>
      </div>
    </div>);
  }
  return <div className="cf-view">
    <div className="cf-head">
      <div><h3>{stack.name}</h3><p aria-live="polite">{items[active]?.title} <span className="cf-count">{active+1} / {n}</span></p></div>
      <button type="button" className="cf-close" onClick={onClose} aria-label="Close and return to all stacks">Close ✕</button>
    </div>
    <div className={'cf-stage'+(reduced?' is-reduced':'')} ref={stageRef} tabIndex={0} role="region" aria-roledescription="carousel" aria-label={`${stack.name} images. Use the left and right arrow keys to browse, Escape to close.`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={leave} onClick={stageClick} onKeyDown={key}>
      <div className="cf-track">{cards}</div>
    </div>
    <div className="cf-controls">
      <button type="button" onClick={()=>go(-1)} disabled={atStart||n<2} aria-label="Previous image">‹</button>
      <button type="button" onClick={()=>go(1)} disabled={atEnd||n<2} aria-label="Next image">›</button>
    </div>
  </div>;
}

/* ============================================================ panel ===== */
export function WorkStacks({folders,images,stacks:settings,id='work'}:WorkStacksProps){
  const reduced=useMedia('(prefers-reduced-motion: reduce)'),canHover=useMedia('(hover: hover) and (pointer: fine)');
  const stacks=useMemo<Stack[]>(()=>{
    const out:Stack[]=[];
    for(const name of folders){
      const items=images.filter(i=>i.cat===name);if(!items.length)continue;
      const wanted=settings?.covers?.[name];
      out.push({name,items,cover:items.find(i=>i.slug===wanted)||items[0]});
    }
    return out;
  },[folders,images,settings?.covers]);
  const [open,setOpen]=useState<string|null>(null);
  const opener=useRef<HTMLElement|null>(null);
  const current=stacks.find(s=>s.name===open);
  const close=useCallback(()=>{setOpen(null);const el=opener.current;if(el)requestAnimationFrame(()=>el.isConnected&&el.focus({preventScroll:true}));},[]);
  if(!stacks.length)return <p className="ws-empty" role="status">No work to show yet.</p>;
  return <section className="work-stacks" aria-label="Work">
    {current
      ?<Coverflow key={current.name} stack={current} loop={settings?.loop!==false} reduced={reduced} canHover={canHover} onClose={close}/>
      :<StackGrid id={id} stacks={stacks} reduced={reduced} onOpen={(name,el)=>{opener.current=el;setOpen(name);}}/>}
  </section>;
}
