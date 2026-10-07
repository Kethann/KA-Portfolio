import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {CSSProperties,KeyboardEvent as ReactKeyboardEvent,MouseEvent as ReactMouseEvent,PointerEvent as ReactPointerEvent} from 'react';
import {imageUrl,type Project} from './types';
import {sfx} from './lib/sound/sfx';

export type StacksSettings={loop?:boolean;loops?:Record<string,boolean>;covers?:Record<string,string>};
export type WorkStacksProps={folders:string[];images:Project[];stacks?:StacksSettings;/** 'pinned' shows only pinned images (Portfolio ALL / PINNED chips). */filter?:'all'|'pinned';pinned?:string[];onPin?:(slug:string,on:boolean)=>void;/** Distinguishes panels (Portfolio, About) so each plays its own entrance once. */id?:string};
type Stack={name:string;items:Project[];cover:Project};

/** The scatter-to-organize entrance plays once per panel per page load, however often it re-renders or remounts. */
const entrancePlayed=new Set<string>();

const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));
const mod=(v:number,n:number)=>((v%n)+n)%n;
/** Smallest exported width that is at least `min`, else the largest available. Uploaded images carry their own src. */
function sized(p:Project,min:number){
  if(p.src)return p.src;
  const widths=[...p.widths].sort((a,b)=>a-b),w=widths.find(x=>x>=min)||widths[widths.length-1];
  return w?`/images/${p.slug}-${w}.${avif?'avif':'webp'}`:`/images/${p.slug}-full.webp`;
}
/** Every export exists as AVIF (roughly a third smaller than WebP at the same quality). A one-pixel probe
 *  decides once; until it answers (a few ms, long before a stack is on screen) WebP is used. */
let avif=false;
if(typeof Image!=='undefined'){
  const probe=new Image();
  probe.onload=()=>{avif=probe.width>0;};
  probe.src='data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
}
const dpr=()=>typeof window==='undefined'?1:Math.min(3,Math.max(1,window.devicePixelRatio||1));
/** Width to ask for in grids and the coverflow: the size it is actually drawn at (never wider than the
 *  screen) times the pixel density, capped at 2x — past that a phone shows no extra detail but pays
 *  twice the data. The full-screen viewer (hiMin) still uses the real density. */
const q=(base:number,cap:number)=>{
  const vw=typeof window==='undefined'?base:Math.max(320,window.innerWidth||base);
  return Math.min(cap,Math.round(Math.min(base,vw)*Math.min(2,dpr())));
};
/** Like sized(), but reaches for the original when even the largest export is smaller than needed (5K / 4K TVs). */
function sizedBest(p:Project,min:number){
  if(p.src)return p.src;
  const top=Math.max(0,...p.widths);
  if(min>top&&p.full)return `/images/${p.slug}-full.webp`;
  return sized(p,min);
}
/** One stack image: shimmers until it arrives and then fades in (no empty card, no pop-in); a size that
 *  fails falls back to the full export once, and if that fails too a quiet titled placeholder shows instead
 *  of an empty or broken card. The first stack's cover loads at once (it is the first thing seen). */
function StackImg({p,min,alt,eager}:{p:Project;min:number;alt:string;eager?:boolean}){
  const first=sized(p,min);
  const [src,setSrc]=useState(first);
  const [state,setState]=useState<'loading'|'ok'|'failed'>('loading');
  const ref=useRef<HTMLImageElement>(null);
  useEffect(()=>{setSrc(first);setState('loading');},[first]);
  // an image already in the browser cache can finish before React hears its load event
  useLayoutEffect(()=>{const i=ref.current;if(i&&i.complete&&i.naturalWidth)setState('ok');},[src]);
  if(state==='failed')return <span className="img-fallback" aria-hidden={alt?undefined:true}>{alt||p.title}</span>;
  const onError=()=>{const full=p.src?'':`/images/${p.slug}-full.webp`;if(full&&src!==full)setSrc(full);else setState('failed');};
  const fx=p.focusX??50,fy=p.focusY??50,zm=p.zoom??1;
  const frame:CSSProperties|undefined=(fx!==50||fy!==50||zm!==1)?{objectPosition:`${fx}% ${fy}%`,transformOrigin:`${fx}% ${fy}%`,...(zm>1?{transform:`scale(${zm})`}:{})}:undefined;
  return <img ref={ref} src={src} alt={alt} style={frame} className={state==='ok'?'is-in':''} loading={eager?'eager':'lazy'} decoding="async" draggable={false}
    {...(eager?{fetchpriority:'high'}:{}) as object} onLoad={()=>setState('ok')} onError={onError}/>;
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
  const canHover=useMedia('(hover: hover) and (pointer: fine)');
  const coarse=useMedia('(pointer: coarse)');
  // Swipe a stack sideways to roll through its pictures (it loops); a tap still opens it. A swipe here never turns the page.
  const [turn,setTurn]=useState<Record<string,{k:number;dir:number}>>({});
  const sw=useRef<{name:string;x:number;y:number;id:number;moved:boolean;el:HTMLElement}|null>(null);
  const suppress=useRef(0);
  const roll=(name:string,dir:number)=>setTurn(t=>({...t,[name]:{k:(t[name]?.k||0)+dir,dir}}));
  const swipeEnd=(e:React.PointerEvent,count:number)=>{
    const g=sw.current;if(!g||g.id!==e.pointerId)return;sw.current=null;
    const deck=g.el.querySelector<HTMLElement>('.deck');if(deck){deck.style.transition='';deck.style.translate='';deck.style.rotate='';}
    const dx=e.clientX-g.x;
    if(g.moved){suppress.current=performance.now()+400;if(e.type==='pointerup'&&Math.abs(dx)>36&&count>1){roll(g.name,dx<0?1:-1);sfx('stack.roll',{rate:dx<0?1.04:0.96});}}
  };
  // Magnetic pull: covers near the cursor lean toward it (tilt in 3D, lift, fan their card edges), eased every frame.
  // Only the inner deck moves (transform + custom properties), so it never fights the entrance animation.
  useEffect(()=>{
    if(!canHover||reduced)return;
    const root=rootRef.current;if(!root)return;
    const state=new Map<HTMLElement,{x:number;y:number;rx:number;ry:number;s:number;f:number}>();
    let raf=0,px=0,py=0,inside=false;
    const tick=()=>{
      raf=0;let busy=false;
      root.querySelectorAll<HTMLElement>('.stack').forEach(el=>{
        const m=state.get(el)||{x:0,y:0,rx:0,ry:0,s:1,f:0};state.set(el,m);
        let tx=0,ty=0,trx=0,tryy=0,ts=1,tf=0;
        if(inside){
          const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height*.42,dx=px-cx,dy=py-cy,R=Math.max(r.width,r.height*.7)*1.05;
          const prox=Math.max(0,1-Math.hypot(dx,dy)/R);
          if(prox>0){tx=dx*.12*prox;ty=dy*.12*prox-5*prox;trx=-(dy/r.height)*11*prox;tryy=(dx/r.width)*13*prox;ts=1+.05*prox;tf=prox;}
        }
        const k=inside?.17:.12;
        m.x+=(tx-m.x)*k;m.y+=(ty-m.y)*k;m.rx+=(trx-m.rx)*k;m.ry+=(tryy-m.ry)*k;m.s+=(ts-m.s)*k;m.f+=(tf-m.f)*k;
        if(Math.abs(tx-m.x)>.04||Math.abs(ty-m.y)>.04||Math.abs(trx-m.rx)>.03||Math.abs(tryy-m.ry)>.03||Math.abs(ts-m.s)>.0005||Math.abs(tf-m.f)>.004)busy=true;
        else{m.x=tx;m.y=ty;m.rx=trx;m.ry=tryy;m.s=ts;m.f=tf;}
        const st=el.style;
        st.setProperty('--mx',m.x.toFixed(2)+'px');st.setProperty('--my',m.y.toFixed(2)+'px');
        st.setProperty('--rx',m.rx.toFixed(2)+'deg');st.setProperty('--ry',m.ry.toFixed(2)+'deg');
        st.setProperty('--ms',m.s.toFixed(4));st.setProperty('--fan',m.f.toFixed(3));
      });
      if(busy)raf=requestAnimationFrame(tick);
    };
    const kick=()=>{if(!raf)raf=requestAnimationFrame(tick);};
    const move=(e:PointerEvent)=>{if(e.pointerType!=='mouse')return;px=e.clientX;py=e.clientY;inside=true;kick();};
    const leave=()=>{inside=false;kick();};
    root.addEventListener('pointermove',move,{passive:true});root.addEventListener('pointerleave',leave);
    return()=>{root.removeEventListener('pointermove',move);root.removeEventListener('pointerleave',leave);cancelAnimationFrame(raf);};
  },[canHover,reduced,keys]);
  useEffect(()=>{
    if(entered||!stacks.length)return;
    const root=rootRef.current;if(!root)return;
    let started=false,io:IntersectionObserver|undefined;
    const cleanup=()=>{io?.disconnect();window.removeEventListener('scroll',check);window.removeEventListener('resize',check);};
    // Close enough to the screen to be worth playing the entrance for. Hidden panels (zero size) never count.
    const inView=()=>{const r=root.getBoundingClientRect(),vh=window.innerHeight||1;return r.width>0&&r.height>0&&r.bottom>0&&r.top<vh*.88;};
    function play(){
      if(started||entrancePlayed.has(id))return;started=true;entrancePlayed.add(id);cleanup();
      // Whatever happens below (an older phone browser without Animation.finished / commitStyles, a throw, a
      // hidden tab), the stacks are forced visible once the entrance should long since have ended: never stuck hidden.
      const els=Array.from(root!.querySelectorAll<HTMLElement>('.stack'));
      // Touch/tablet: a plain rise-and-fade, not the full scatter-from-random-position entrance.
      // The scattered version reads great on a mouse but costs a getBoundingClientRect() and a
      // WAAPI animation per card that can visibly stall mid-flight on a slower phone GPU (the
      // "stack not fully visible" glitch) -- a shorter, single-axis motion resolves quickly and
      // can't get caught half-scattered.
      const light=coarse;
      const stagger=light?60:110,dur=light?520:1000;
      window.setTimeout(()=>setEntered(true),1000+els.length*stagger+(light?400:900));
      try{
        const box=root!.getBoundingClientRect();
        const anims=els.map((el,i)=>{
          if(light){
            return el.animate([
              {transform:'translate3d(0,16px,0) scale(.96)',opacity:0},
              {transform:'translate3d(0,0,0) scale(1)',opacity:1}
            ],{duration:dur,delay:i*stagger,easing:'cubic-bezier(.2,.9,.25,1)',fill:'both'});
          }
          const r=el.getBoundingClientRect(),padX=Math.min(80,box.width*.08),padY=Math.min(60,box.height*.1);
          // Scattered start: a random spot inside the panel bounds with a random tilt.
          const tx=box.left+padX+Math.random()*Math.max(1,box.width-2*padX),ty=box.top+padY+Math.random()*Math.max(1,box.height-2*padY);
          const dx=tx-(r.left+r.width/2),dy=ty-(r.top+r.height/2),rot=(Math.random()*40-20).toFixed(1);
          return el.animate([
            {transform:`translate3d(${dx}px,${dy}px,0) rotate(${rot}deg) scale(.9)`,opacity:0},
            {transform:'translate3d(0,0,0) rotate(0deg) scale(1)',opacity:1}
          ],{duration:dur,delay:i*stagger,easing:'cubic-bezier(.34,1.32,.64,1)',fill:'both'});
        });
        const finish=()=>{setEntered(true);anims.forEach(a=>{try{a.commitStyles();a.cancel();}catch{/* older engine or element gone */}});};
        const fins=anims.map(a=>a.finished);
        if(fins.every(Boolean))Promise.all(fins.map(f=>f.catch(()=>undefined))).then(finish);
      }catch{setEntered(true);}
    }
    function check(){if(inView())play();}
    if(typeof IntersectionObserver==='function'){
      io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))check();},{rootMargin:'0px 0px -12% 0px',threshold:0.01});
      io.observe(root);
    }
    // A phone browser that never reports the panel as visible still gets the entrance as you scroll near it.
    window.addEventListener('scroll',check,{passive:true});window.addEventListener('resize',check);
    const first=requestAnimationFrame(check);
    return()=>{cancelAnimationFrame(first);cleanup();};
  },[entered,keys,coarse]);
  return <div className={'stack-grid'+(entered?' is-entered':' is-pending')} ref={rootRef}>
    {stacks.map((s,si)=>{
      const count=s.items.length,others=s.items.filter(i=>i.slug!==s.cover.slug);
      const all=[s.cover,...others],t=turn[s.name],k=t?((t.k%count)+count)%count:0,ord=all.slice(k).concat(all.slice(0,k));
      const front=ord[0],n1=ord[1]||front,n2=ord[2]||n1;
      return <button type="button" className="stack" key={s.name} aria-label={`${s.name}, ${count} ${count===1?'image':'images'}. Open. Swipe sideways to look through it.`}
        onClick={e=>{if(performance.now()<suppress.current){e.preventDefault();return;}onOpen(s.name,e.currentTarget);}}
        onPointerDown={e=>{if(e.button!==0||!e.isPrimary)return;sw.current={name:s.name,x:e.clientX,y:e.clientY,id:e.pointerId,moved:false,el:e.currentTarget};}}
        onPointerMove={e=>{const g=sw.current;if(!g||g.id!==e.pointerId)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;
          if(Math.hypot(dx,dy)>8)suppress.current=performance.now()+450;   // it moved: whatever happens, the click that follows is not a tap
          if(!g.moved&&Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>10){sw.current=null;return;}
          if(!g.moved&&Math.abs(dx)>12){g.moved=true;try{g.el.setPointerCapture(e.pointerId);}catch{/* already released */}}
          if(g.moved&&!reduced){const d=g.el.querySelector<HTMLElement>('.deck');if(d){d.style.transition='none';d.style.translate=`${(dx*.35).toFixed(1)}px 0`;d.style.rotate=`${(dx*.03).toFixed(2)}deg`;}}}}
        onPointerUp={e=>swipeEnd(e,count)} onPointerCancel={e=>swipeEnd(e,count)}>
        <span className="deck">
          {count>2&&<span className="layer l2" aria-hidden="true"><StackImg p={n2} min={q(480,1080)} alt="" eager={si===0}/></span>}
          {count>1&&<span className="layer l1" aria-hidden="true"><StackImg p={n1} min={q(480,1080)} alt="" eager={si===0}/></span>}
          <span className={'front'+(t&&!reduced?(t.dir>0?' roll-next':' roll-prev'):'')} key={front.slug}><StackImg p={front} min={q(768,1600)} alt={front.title} eager={si===0}/></span>
        </span>
        <span className="meta"><strong>{s.name}</strong><small>{count} {count===1?'image':'images'}</small></span>
      </button>;
    })}
  </div>;
}

/* ============================================================ download button (v2: progress ring) ===== */
// Icon-only glass button, everything inside its own 48px circle. On click the arrow drops into the tray while a
// ring around the button fills with the file's REAL download progress (bytes received / total); when the file is
// saved the button resolves to a check with a soft burst. A failure turns the ring red and shakes a cross.
// The animation never decides the outcome: the check only appears once the file was actually fetched and saved.
const DL_DEFAULTS={minMs:700,resetMs:2000,style:'fill'};
type DlState='idle'|'busy'|'done'|'error';
function dlConfig(){return {...DL_DEFAULTS,...((window as unknown as {KA_DL_CONFIG?:Partial<typeof DL_DEFAULTS>}).KA_DL_CONFIG||{})};}
const easeInOut=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
/** Downloads are PNG or JPEG (the owner's choice in the portal), never WebP: the picture is fetched, redrawn on a canvas and saved. */
function dlFormat():{fmt:'png'|'jpeg';ext:string;mime:string}{const f=(window as unknown as {KA_DL_CONFIG?:{format?:string}}).KA_DL_CONFIG?.format==='jpeg'?'jpeg':'png';return {fmt:f,ext:f==='jpeg'?'jpg':'png',mime:f==='jpeg'?'image/jpeg':'image/png'};}
async function toFormat(blob:Blob):Promise<Blob>{
  const f=dlFormat(),bmp=await createImageBitmap(blob);
  const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;const x=c.getContext('2d')!;
  if(f.fmt==='jpeg'){x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);}
  x.drawImage(bmp,0,0);bmp.close?.();
  return new Promise((res,rej)=>c.toBlob(o=>o?res(o):rej(new Error('encode')),f.mime,f.fmt==='jpeg'?0.95:undefined));
}
function fileName(p:Project,url:string,ext0?:string){
  const ext=ext0||(/\.(webp|png|jpe?g|avif)(\?|$)/i.exec(url)?.[1]||'webp').toLowerCase().replace('jpeg','jpg');
  const base=(p.title||p.slug||'image').trim().replace(/[^\w\- ]+/g,'').replace(/\s+/g,'-').slice(0,80)||'image';
  return `${base}.${ext}`;
}
async function fetchFile(p:Project,onProgress:(v:number)=>void){
  const url=p.src||imageUrl(p,true),name=fileName(p,url);
  const res=await fetch(url);if(!res.ok)throw new RangeError('HTTP '+res.status);   // a real server error: not worth retrying as a link
  const total=Number(res.headers.get('content-length'))||0;
  let blob:Blob;
  if(!res.body||!total){blob=await res.blob();onProgress(1);}
  else{
    const reader=res.body.getReader(),chunks:Uint8Array[]=[];let got=0;
    for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);got+=value.length;onProgress(Math.min(1,got/total));}
    blob=new Blob(chunks as BlobPart[],{type:res.headers.get('content-type')||''});
  }
  // re-save as PNG/JPEG; if the browser cannot, the original file is still delivered rather than nothing
  try{if(typeof createImageBitmap==='function')return {blob:await toFormat(blob),name:fileName(p,url,dlFormat().ext)};}catch{/* keep the original */}
  return {blob,name};
}
function saveBlob(file:{blob:Blob;name:string}){
  const a=document.createElement('a');a.href=URL.createObjectURL(file.blob);a.download=file.name;a.style.display='none';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
function saveLink(p:Project){
  const a=document.createElement('a');a.href=p.src||imageUrl(p,true);a.download=fileName(p,a.href);a.rel='noopener';a.style.display='none';
  document.body.appendChild(a);a.click();a.remove();
}
const BURST=[0,60,120,180,240,300].map(a=>({'--x':`${(Math.cos(a*Math.PI/180)*30).toFixed(1)}px`,'--y':`${(Math.sin(a*Math.PI/180)*30).toFixed(1)}px`}) as CSSProperties);
function DownloadButton({project,reduced}:{project:Project;reduced:boolean}){
  const [state,setState]=useState<DlState>('idle');
  const stateRef=useRef<DlState>('idle');
  const bar=useRef<SVGCircleElement>(null),arrow=useRef<SVGGElement>(null);
  const raf=useRef(0),timer=useRef(0);
  const cfg=useMemo(dlConfig,[]);
  const set=(s:DlState)=>{stateRef.current=s;setState(s);};
  function paint(dp:number){
    bar.current?.setAttribute('stroke-dashoffset',(100-dp*100).toFixed(1));
    arrow.current?.setAttribute('transform',`translate(0 ${(11.5*easeInOut(Math.min(1,dp*1.12))).toFixed(2)})`);
  }
  useEffect(()=>()=>{cancelAnimationFrame(raf.current);clearTimeout(timer.current);},[]);
  // a different image: back to idle
  useEffect(()=>{cancelAnimationFrame(raf.current);clearTimeout(timer.current);stateRef.current='idle';setState('idle');paint(0);},[project.slug]);// eslint-disable-line react-hooks/exhaustive-deps
  function finish(ok:boolean){
    set(ok?'done':'error');
    clearTimeout(timer.current);timer.current=window.setTimeout(()=>{stateRef.current='idle';setState('idle');paint(0);},cfg.resetMs);
  }
  async function click(){
    if(stateRef.current!=='idle')return;
    set('busy');paint(0);
    let real=0,finished=false,failed=false;
    const pending=fetchFile(project,v=>{real=v;});
    pending.then(()=>{finished=true;},()=>{failed=true;});
    if(!reduced&&'animate' in Element.prototype){
      const t0=performance.now();let dp=0;
      await new Promise<void>(resolve=>{
        const tick=(now:number)=>{
          const t=now-t0,timeP=Math.min(.92,t/cfg.minMs*.92);
          // the ring follows the real progress, but never crawls: it also advances with time so it always reads as moving
          const target=finished?1:Math.min(.96,Math.max(real*.96,timeP));
          dp+=(target-dp)*.2;
          if(failed){resolve();return;}
          if(finished&&t>=cfg.minMs&&dp>.985){paint(1);resolve();return;}
          paint(dp);raf.current=requestAnimationFrame(tick);
        };
        raf.current=requestAnimationFrame(tick);
      });
    }
    try{saveBlob(await pending);finish(true);}
    catch(err){
      // the request itself could not be made as a blob (e.g. cross-origin): hand the plain link to the browser instead.
      // A genuine HTTP error (missing file) is reported as a failure, never as a success.
      if(err instanceof TypeError){try{saveLink(project);finish(true);}catch{finish(false);}}else finish(false);
    }
  }
  const label=state==='busy'?'Downloading…':state==='done'?'Download started':state==='error'?'Download failed, try again':`Download ${project.title}`;
  return <span className="dl2">
    <button type="button" className="dl2-btn" data-state={state} onClick={click} aria-label={label} aria-busy={state==='busy'} title={state==='idle'?'Download':label}>
      <svg className="dl2-ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <defs><linearGradient id="dl2g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe6c9"/><stop offset="1" stopColor="#ff9a5a"/></linearGradient></defs>
        <circle className="track" cx="24" cy="24" r="23"/>
        <circle className="bar" ref={bar} cx="24" cy="24" r="23" pathLength="100" strokeDasharray="100" strokeDashoffset="100" transform="rotate(-90 24 24)"/>
      </svg>
      <svg className="dl2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <defs><clipPath id="dl2c"><rect x="0" y="0" width="24" height="15.4"/></clipPath></defs>
        <g clipPath="url(#dl2c)"><g className="arrow" ref={arrow}><path d="M12 4.2v10.2m0 0-4.2-4.2M12 14.4l4.2-4.2"/></g></g>
        <path className="tray" d="M5.2 15.2v2.4a2.2 2.2 0 0 0 2.2 2.2h9.2a2.2 2.2 0 0 0 2.2-2.2v-2.4"/>
      </svg>
      <svg className="dl2-ok" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5.6 12.6l4.1 4.1L18.4 8"/></svg>
      <svg className="dl2-err" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.2 7.2l9.6 9.6M16.8 7.2l-9.6 9.6"/></svg>
      {BURST.map((s,i)=><i className="dl2-dot" style={s} key={i} aria-hidden="true"/>)}
    </button>
    <span className="sr" role="status" aria-live="polite">{state==='busy'?'Downloading…':state==='done'?'Download started':state==='error'?'Download failed. Try again.':''}</span>
  </span>;
}

/* ============================================================ download button (v3: liquid fill) ===== */
// The glass circle is a vial. On click the arrow stays put while green liquid rises inside it, with bubbles floating up through it, level = the file's REAL
// download progress (bytes received / total), with a live wavy surface. At 100% the liquid flashes, the arrow turns
// into a check and a soft ring expands outward. A failure drains the vial red and shakes a cross. The animation never
// decides the outcome: the check only appears after the file was actually fetched and saved.
// Choose the older ring style with  window.KA_DL_CONFIG = { style: 'ring' }.
function waveD(level:number,phase:number,amp:number){
  const yL=46*(1-level)+1;let d=`M0 ${yL.toFixed(2)}`;
  for(let x=0;x<=48;x+=3)d+=` L${x} ${(yL+amp*Math.sin(x/48*Math.PI*3+phase)).toFixed(2)}`;
  return d+' L48 49 L0 49 Z';
}
// bubbles drifting up through the liquid: x, radius, rise speed, start offset
const BUBBLES=[{x:11,r:1.7,s:.00019,o:0},{x:18,r:1.1,s:.00026,o:.4},{x:25,r:2.1,s:.00016,o:.7},{x:31,r:1.3,s:.00023,o:.2},{x:37,r:1.7,s:.0002,o:.55},{x:22,r:.9,s:.0003,o:.85},{x:14,r:1,s:.00028,o:.6},{x:34,r:.9,s:.00032,o:.1}];
function DownloadFill({project,reduced}:{project:Project;reduced:boolean}){
  const [state,setState]=useState<DlState>('idle');
  const stateRef=useRef<DlState>('idle');
  const w1=useRef<SVGPathElement>(null),w2=useRef<SVGPathElement>(null),bub=useRef<(SVGCircleElement|null)[]>([]);
  const raf=useRef(0),timer=useRef(0);
  const cfg=useMemo(dlConfig,[]);
  const set=(s:DlState)=>{stateRef.current=s;setState(s);};
  function paint(level:number,phase:number,time=0){
    const amp=2.3*(1-Math.min(1,level)*.7);
    w1.current?.setAttribute('d',waveD(level,phase,amp));
    w2.current?.setAttribute('d',waveD(Math.max(0,level-.035),phase*1.3+1.7,amp*.8));
    const surface=46*(1-level)+3;
    BUBBLES.forEach((b,i)=>{
      const c=bub.current[i];if(!c)return;
      if(level<.07){c.setAttribute('opacity','0');return;}
      const u=(time*b.s*1000/1000+b.o)%1,y=45-u*(45-surface);
      c.setAttribute('cx',(b.x+Math.sin(time*.004+b.o*6.3)*1.4).toFixed(2));
      c.setAttribute('cy',Math.max(surface,y).toFixed(2));
      c.setAttribute('opacity',(.3+.55*Math.sin(Math.PI*u)).toFixed(2));
    });
  }
  useEffect(()=>()=>{cancelAnimationFrame(raf.current);clearTimeout(timer.current);},[]);
  useEffect(()=>{cancelAnimationFrame(raf.current);clearTimeout(timer.current);stateRef.current='idle';setState('idle');paint(0,0);},[project.slug]);// eslint-disable-line react-hooks/exhaustive-deps
  function finish(ok:boolean){
    set(ok?'done':'error');
    clearTimeout(timer.current);timer.current=window.setTimeout(()=>{stateRef.current='idle';setState('idle');paint(0,0);},cfg.resetMs);
  }
  async function click(){
    if(stateRef.current!=='idle')return;
    set('busy');paint(0,0);
    let real=0,finished=false,failed=false;
    const pending=fetchFile(project,v=>{real=v;});
    pending.then(()=>{finished=true;},()=>{failed=true;});
    if(!reduced&&'animate' in Element.prototype){
      const t0=performance.now();let lv=0,phase=0,last=t0;
      await new Promise<void>(resolve=>{
        const tick=(now:number)=>{
          const t=now-t0,dt=Math.min(50,now-last);last=now;phase+=dt*.011;
          const timeP=Math.min(.92,t/cfg.minMs*.92);
          const target=finished?1:Math.min(.96,Math.max(real*.96,timeP));
          lv+=(target-lv)*.16;
          if(failed){resolve();return;}
          if(finished&&t>=cfg.minMs&&lv>.985){paint(1,phase,t);resolve();return;}
          paint(lv,phase,t);raf.current=requestAnimationFrame(tick);
        };
        raf.current=requestAnimationFrame(tick);
      });
    }
    try{saveBlob(await pending);finish(true);}
    catch(err){
      if(err instanceof TypeError){try{saveLink(project);finish(true);}catch{finish(false);}}else finish(false);
    }
  }
  const label=state==='busy'?'Downloading…':state==='done'?'Download started':state==='error'?'Download failed, try again':`Download ${project.title}`;
  return <span className="dl3">
    <button type="button" className="dl3-btn" data-state={state} onClick={click} aria-label={label} aria-busy={state==='busy'} title={state==='idle'?'Download':label}>
      <svg className="dl3-vial" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id="dl3c"><circle cx="24" cy="24" r="23"/></clipPath>
          <linearGradient id="dl3g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(196,255,214,.95)"/><stop offset="1" stopColor="rgba(38,190,108,.92)"/></linearGradient>
        </defs>
        <g clipPath="url(#dl3c)"><path className="wave b" ref={w2} d="M0 49 L48 49 L0 49Z"/><path className="wave a" ref={w1} d="M0 49 L48 49 L0 49Z"/>{BUBBLES.map((b,i)=><circle className="bub" key={i} ref={el=>{bub.current[i]=el;}} cx={b.x} cy="46" r={b.r} opacity="0"/>)}</g><path className="gloss" d="M9.5 15.5A16 16 0 0 1 19 8.4" />
      </svg>
      <svg className="dl3-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4.2v10.2m0 0-4.2-4.2M12 14.4l4.2-4.2"/><path d="M5.2 15.2v2.4a2.2 2.2 0 0 0 2.2 2.2h9.2a2.2 2.2 0 0 0 2.2-2.2v-2.4"/></svg>
      <svg className="dl3-ok" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5.6 12.6l4.1 4.1L18.4 8"/></svg>
      <svg className="dl3-err" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.2 7.2l9.6 9.6M16.8 7.2l-9.6 9.6"/></svg>
      <i className="dl3-pulse" aria-hidden="true"/>
    </button>
    <span className="sr" role="status" aria-live="polite">{state==='busy'?'Downloading…':state==='done'?'Download started':state==='error'?'Download failed. Try again.':''}</span>
  </span>;
}
/** The download control used by the viewer: liquid fill by default, ring style on request. */
function DownloadControl(props:{project:Project;reduced:boolean}){
  return dlConfig().style==='ring'?<DownloadButton {...props}/>:<DownloadFill {...props}/>;
}

/* ============================================================ share ===== */
// Phones/tablets: the native share sheet (any app). Desktop: a small menu with Copy link and the common apps.
// The link is a deep link (?image=<id>) that reopens exactly this image in the viewer.
function shareUrl(slug:string){
  const u=new URL(window.location.href);u.search='';u.hash='';u.searchParams.set('image',slug);return u.toString();
}
async function copyText(t:string){
  try{await navigator.clipboard.writeText(t);return true;}
  catch{
    try{const ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok;}
    catch{return false;}
  }
}
/** brand marks for the share menu (official shapes, in each brand's colour) */
const SHARE_ICON:Record<string,{c:string;d:string;stroke?:boolean}>={
  link:{c:'#ffe2c4',stroke:true,d:'M10 13.5a4.5 4.5 0 0 0 6.4.4l2.9-2.9a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.9 2.9a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2'},
  whatsapp:{c:'#25d366',d:'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z'},
  x:{c:'#f2f2f5',d:'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'},
  facebook:{c:'#1877f2',d:'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z'},
  linkedin:{c:'#0a66c2',d:'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.446-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.114 20.452H3.558V9h3.556v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z'},
  telegram:{c:'#26a5e4',d:'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z'},
  email:{c:'#ffb37a',stroke:true,d:'M3.5 6.5h17v11h-17zM3.8 7l8.2 6.2L20.2 7'},
  more:{c:'#c9b8ff',stroke:true,d:'M12 3.5v11M8 7.5l4-4 4 4M5.5 12.5v7h13v-7'},
};
function ShareIcon({name}:{name:string}){
  const i=SHARE_ICON[name];if(!i)return null;
  return <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{color:i.c}}>
    {i.stroke?<path d={i.d} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"/>:<path d={i.d} fill="currentColor"/>}
  </svg>;
}
function ShareButton({project,stackName}:{project:Project;stackName:string}){
  const [open,setOpen]=useState(false),[note,setNote]=useState('');
  const wrap=useRef<HTMLSpanElement>(null),btn=useRef<HTMLButtonElement>(null),timer=useRef(0);
  const coarse=useMedia('(pointer: coarse)');
  const url=useMemo(()=>shareUrl(project.slug),[project.slug]);
  const text=`${project.title} — ${stackName}`;
  const canNative=typeof navigator!=='undefined'&&typeof navigator.share==='function';
  useEffect(()=>{setOpen(false);setNote('');},[project.slug]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{
    if(!open)return;
    const away=(e:PointerEvent)=>{if(!e.composedPath().includes(wrap.current as EventTarget))setOpen(false);};
    const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();e.preventDefault();setOpen(false);btn.current?.focus({preventScroll:true});}};
    document.addEventListener('pointerdown',away,true);document.addEventListener('keydown',esc,true);
    (wrap.current?.querySelector('.vw-menu a,.vw-menu button') as HTMLElement|null)?.focus({preventScroll:true});
    return()=>{document.removeEventListener('pointerdown',away,true);document.removeEventListener('keydown',esc,true);};
  },[open]);
  function tell(msg:string){setNote(msg);clearTimeout(timer.current);timer.current=window.setTimeout(()=>setNote(''),2000);}
  async function nativeShare(){try{await navigator.share({title:project.title,text,url});}catch{/* the person closed the share sheet */}}
  async function click(){
    if(canNative&&coarse){await nativeShare();return;}     // touch devices: straight to the system share sheet
    setOpen(o=>!o);
  }
  async function copy(){setOpen(false);tell((await copyText(url))?'Link copied':'Could not copy the link');btn.current?.focus({preventScroll:true});}
  function menuKey(event:ReactKeyboardEvent<HTMLDivElement>){
    if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.stopPropagation();
    if(event.key==='ArrowLeft'||event.key==='ArrowRight')return;
    event.preventDefault();
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if(!items.length)return;
    const index=items.indexOf((event.currentTarget.getRootNode() as Document|ShadowRoot).activeElement as HTMLElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:mod(index+(event.key==='ArrowDown'?1:-1),items.length);
    items[next].focus({preventScroll:true});
  }
  const enc=encodeURIComponent,items:{label:string;href:string;icon:string}[]=[
    {label:'WhatsApp',href:`https://wa.me/?text=${enc(text+' '+url)}`,icon:'whatsapp'},
    {label:'Twitter',href:`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,icon:'x'},
    {label:'Facebook',href:`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,icon:'facebook'},
    {label:'LinkedIn',href:`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,icon:'linkedin'},
    {label:'Telegram',href:`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,icon:'telegram'},
    {label:'Email',href:`mailto:?subject=${enc(project.title)}&body=${enc(text+'\n'+url)}`,icon:'email'}
  ];
  return <span className="vw-share-wrap" ref={wrap}>
    <button type="button" ref={btn} className="vw-share" onClick={click} aria-haspopup={canNative&&coarse?undefined:'menu'} aria-expanded={canNative&&coarse?undefined:open} aria-label={`Share ${project.title}`} title="Share">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="5.6" r="2.6"/><circle cx="17.5" cy="18.4" r="2.6"/><path d="M8.8 10.8l6.4-3.8M8.8 13.2l6.4 3.8"/></svg>
    </button>
    {open&&<div className="vw-menu" role="menu" aria-label="Share this image" onKeyDown={menuKey}>
      <button type="button" role="menuitem" onClick={copy}><ShareIcon name="link"/>Copy link</button>
      {items.map(i=><a key={i.label} role="menuitem" href={i.href} target="_blank" rel="noopener noreferrer" onClick={()=>setOpen(false)}><ShareIcon name={i.icon}/>{i.label}</a>)}
      {canNative&&<button type="button" role="menuitem" onClick={()=>{setOpen(false);void nativeShare();}}><ShareIcon name="more"/>More apps…</button>}
    </div>}
    {note&&<span className="vw-toast" aria-hidden="true">{note}</span>}
    <span className="sr" role="status" aria-live="polite">{note}</span>
  </span>;
}

/* ============================================================ full image viewer ===== */
function Viewer({p,stackName,index,n,atStart,atEnd,onPrev,onNext,onBack,reduced,origin,pinned,onPin}:{pinned:boolean;onPin?:()=>void;p:Project;stackName:string;index:number;n:number;atStart:boolean;atEnd:boolean;onPrev:()=>void;onNext:()=>void;onBack:()=>void;reduced:boolean;origin:DOMRect|null}){
  const rootRef=useRef<HTMLDivElement>(null),frameRef=useRef<HTMLDivElement>(null),infoRef=useRef<HTMLDivElement>(null),first=useRef(true);
  const [hi,setHi]=useState(false);
  // Full quality for this screen: the widest the picture can be drawn, at the screen's real pixel density
  // (a phone gets ~1600, a 1440p desktop 1600, a 4K/5K display 2400-3840 or the original).
  const hiMin=useMemo(()=>Math.min(3840,Math.max(1080,Math.round(Math.min(window.innerWidth,1600)*dpr()))),[]);
  useEffect(()=>{setHi(false);},[p.slug]);
  useEffect(()=>{rootRef.current?.focus({preventScroll:true});},[]);
  // Fly the picture out of the carousel card into the viewer (transform only), then bring the text in.
  useLayoutEffect(()=>{
    if(!first.current)return;first.current=false;
    const f=frameRef.current,info=infoRef.current;if(reduced||!f||!f.animate)return;
    if(origin){
      const to=f.getBoundingClientRect();
      if(to.width&&to.height){
        const s=origin.width/to.width,dx=origin.left+origin.width/2-(to.left+to.width/2),dy=origin.top+origin.height/2-(to.top+to.height/2);
        f.animate([{transform:`translate3d(${dx}px,${dy}px,0) scale(${s})`},{transform:'translate3d(0,0,0) scale(1)'}],{duration:420,easing:'cubic-bezier(.2,.9,.25,1)'});
      }
    }
    info?.animate([{opacity:0,transform:'translate3d(24px,0,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:380,delay:110,easing:'cubic-bezier(.2,.9,.25,1)',fill:'backwards'});
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  const desc=(p.description||'').trim(),tech=(p.technologies||[]).filter(Boolean);
  return <div className="vw" ref={rootRef} tabIndex={-1} role="group" aria-roledescription="image viewer" aria-label={p.title}>
    <div className="vw-media">
      <button type="button" className="vw-nav prev" onClick={onPrev} disabled={atStart||n<2} aria-label="Previous image">‹</button>
      <div className="vw-frame" ref={frameRef} key={p.slug}>
        <img className="lo" src={sized(p,q(1080,2400))} alt={p.title} draggable={false}/>
        <img className={'hi'+(hi?' is-in':'')} src={sizedBest(p,hiMin)} alt="" aria-hidden="true" draggable={false} onLoad={()=>setHi(true)}/>
      </div>
      <button type="button" className="vw-nav next" onClick={onNext} disabled={atEnd||n<2} aria-label="Next image">›</button>
    </div>
    <div className="vw-info" ref={infoRef} key={'i'+p.slug}>
      <p className="vw-kicker">{stackName} <span>{index+1} / {n}</span></p>
      <h3 className="vw-title">{p.title}</h3>
      {tech.length>0&&<ul className="vw-tags" aria-label="Tools">{tech.map(t=><li key={t}>{t}</li>)}</ul>}
      {desc&&<div className="vw-desc"><p>{desc}</p></div>}
      <div className="vw-actions">
        {p.downloadable!==false&&<DownloadControl project={p} reduced={reduced}/>}
        <ShareButton project={p} stackName={stackName}/>
        {onPin&&<button type="button" className={'vw-pin'+(pinned?' is-on':'')} onClick={onPin} aria-pressed={pinned} aria-label={pinned?'Unpin this image':'Pin this image'} title={pinned?'Unpin':'Pin to the Pinned filter'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg></button>}
        {p.link&&<a className="vw-link" href={p.link} target="_blank" rel="noopener noreferrer">View project ↗</a>}
      </div>
    </div>
    <button type="button" className="vw-back" onClick={onBack} aria-label="Back to the carousel">✕</button>
  </div>;
}

/* ============================================================ magnetic coverflow ===== */
const VISIBLE=3;
function Coverflow({stack,loop,reduced,canHover,onClose,pins,onPin,startSlug}:{stack:Stack;loop:boolean;reduced:boolean;canHover:boolean;onClose:()=>void;pins:Set<string>;onPin?:(slug:string,on:boolean)=>void;startSlug?:string}){
  const items=stack.items,n=items.length;
  // Loop by modulo on the position. Short stacks are repeated (virtual slots) so the wrap point
  // always sits beyond the visible range and can never be seen as a seam.
  const slots=loop&&n>1?(n<7?n*Math.ceil(7/n):n):n;
  const stageRef=useRef<HTMLDivElement>(null),cardRefs=useRef<(HTMLDivElement|null)[]>([]),magRefs=useRef<(HTMLDivElement|null)[]>([]),shadowRefs=useRef<(HTMLSpanElement|null)[]>([]);
  const st=useRef({pos:0,vel:0,target:0,dragging:false,moved:false,raf:0,last:0,cw:280,px:0,py:0,inside:false,startX:0,startPos:0,samples:[] as {t:number,p:number}[],pointerId:-1,mags:[] as {x:number,y:number,s:number,o:number}[]});
  const [active,setActive]=useState(0);
  const [viewing,setViewing]=useState(false);
  const viewingRef=useRef(false),originRect=useRef<DOMRect|null>(null);
  const activeRef=useRef(0);
  const cfg=useRef({loop,reduced,canHover,n,slots});cfg.current={loop,reduced,canHover,n,slots};

  const wrapD=(d:number)=>cfg.current.loop?mod(d+cfg.current.slots/2,cfg.current.slots)-cfg.current.slots/2:d;
  const clampTarget=(t:number)=>cfg.current.loop?t:clamp(t,0,cfg.current.n-1);
  // each picture passing ticks softly: quicker spins tick faster and a little higher, and get softer (never harsh)
  const lastTick=useRef(0);
  const tickSound=()=>{const now=performance.now(),dt=Math.max(16,now-(lastTick.current||now-400));lastTick.current=now;const speed=1000/dt;
    sfx('gallery.swipe',{rate:0.94+Math.min(speed,24)*0.018,volume:speed>7?Math.max(0.3,1-(speed-7)*0.045):1});};
  const report=()=>{const a=mod(Math.round(st.current.target),cfg.current.n);if(a!==activeRef.current){activeRef.current=a;setActive(a);tickSound();}};

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
      el.dataset.c=ad<.35?'1':'0';
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
    return busy;
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

  // Trackpad two-finger swipe / horizontal wheel / Shift+wheel scrubs the carousel with the same spring, then snaps.
  useEffect(()=>{
    const stage=stageRef.current;if(!stage)return;
    let timer=0;
    const onWheel=(e:WheelEvent)=>{
      const horizontal=Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.shiftKey;
      if(!horizontal)return;                                        // vertical wheel keeps scrolling the page
      e.preventDefault();
      const s=st.current,raw=Math.abs(e.deltaX)>0?e.deltaX:e.deltaY,d=raw*(e.deltaMode===1?32:e.deltaMode===2?400:1);
      s.dragging=false;s.vel=0;
      s.target=clampTarget(s.target+d/Math.max(120,s.cw*1.05));
      report();kick();
      clearTimeout(timer);timer=window.setTimeout(()=>{s.target=clampTarget(Math.round(s.target));report();kick();},140);
    };
    stage.addEventListener('wheel',onWheel,{passive:false});
    return()=>{stage.removeEventListener('wheel',onWheel);clearTimeout(timer);};
  },[kick]);// eslint-disable-line react-hooks/exhaustive-deps
  // Opened from a shared link: start on that image, already in the full viewer.
  useLayoutEffect(()=>{
    if(!startSlug)return;
    const k=items.findIndex(x=>x.slug===startSlug);if(k<0)return;
    st.current.pos=k;st.current.target=k;activeRef.current=k;setActive(k);
    viewingRef.current=true;setViewing(true);sfx('gallery.view');
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  // Measure the stage, size the cards, and keep them centred through resizes.
  useLayoutEffect(()=>{
    const stage=stageRef.current;if(!stage)return;
    const fit=()=>{const w=stage.clientWidth;st.current.cw=Math.round(Math.max(80,Math.min(w*.56,Math.round(320*Math.min(1.9,Math.max(1,window.innerWidth/1440))),(stage.clientHeight-32)/1.5)));stage.style.setProperty('--cw',st.current.cw+'px');layout();};
    fit();const ro=new ResizeObserver(fit);ro.observe(stage);
    return()=>ro.disconnect();
  },[layout,slots]);
  useEffect(()=>{layout();kick();return()=>{cancelAnimationFrame(st.current.raf);st.current.raf=0;};},[layout,kick,slots,loop]);
  // Turning looping off while parked outside 0..n-1 must not leave the carousel past its ends.
  useEffect(()=>{if(!loop){const s=st.current;s.target=clamp(Math.round(s.target),0,n-1);s.pos=clamp(s.pos,0,n-1);report();kick();}},[loop,n]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    // Escape steps back one level: image viewer -> carousel -> all stacks.
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();if(viewingRef.current)closeViewer();else onClose();}};
    document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
  },[onClose]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{stageRef.current?.focus({preventScroll:true});},[]);

  const go=useCallback((delta:number)=>{
    const s=st.current,next=clampTarget(Math.round(s.target)+delta);if(next===Math.round(s.target)&&!loop)return;
    s.target=next;report();kick();
  },[kick,loop]);// eslint-disable-line react-hooks/exhaustive-deps
  const openViewer=useCallback(()=>{
    const s=st.current;let best:HTMLElement|null=null,bd=9;
    for(let i=0;i<cfg.current.slots;i++){let d=i-s.pos;if(cfg.current.loop)d=mod(d+cfg.current.slots/2,cfg.current.slots)-cfg.current.slots/2;if(Math.abs(d)<bd){bd=Math.abs(d);best=magRefs.current[i];}}
    originRect.current=best?best.getBoundingClientRect():null;   // where the picture flies out from
    viewingRef.current=true;setViewing(true);sfx('gallery.view');
  },[]);
  function closeViewer(){viewingRef.current=false;setViewing(false);sfx('gallery.back');requestAnimationFrame(()=>{layout();kick();stageRef.current?.focus({preventScroll:true});});}
  const centre=useCallback((slot:number)=>{
    const s=st.current;let d=slot-s.pos;if(cfg.current.loop)d=mod(d+cfg.current.slots/2,cfg.current.slots)-cfg.current.slots/2;
    const next=clampTarget(Math.round(s.pos+d));
    if(next===Math.round(s.target)){if(Math.abs(s.pos-s.target)<.2)openViewer();return;}   // the centred picture opens full-size
    s.target=next;report();kick();
  },[kick,openViewer]);// eslint-disable-line react-hooks/exhaustive-deps

  /* Drag-to-scrub: 1:1 while held (mouse, touch and pen through pointer events), momentum + spring snap on release. */
  const unit=()=>Math.max(60,st.current.cw*.55);
  const startY=useRef(0),travel=useRef(0);
  function down(e:ReactPointerEvent<HTMLDivElement>){
    if(!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0))return;
    startY.current=e.clientY;travel.current=0;
    const s=st.current;s.startX=e.clientX;s.startPos=s.pos;s.moved=false;s.pointerId=e.pointerId;s.samples=[{t:performance.now(),p:s.pos}];
  }
  function move(e:ReactPointerEvent<HTMLDivElement>){
    const s=st.current;s.px=e.clientX;s.py=e.clientY;
    if(s.pointerId===e.pointerId&&(e.pointerType!=='mouse'||e.buttons!==0)){
      const dx=e.clientX-s.startX;travel.current=Math.max(travel.current,Math.abs(dx),Math.abs(e.clientY-startY.current));
      if(!s.dragging&&Math.abs(e.clientY-startY.current)>Math.max(6,Math.abs(dx))){s.pointerId=-1;return;}
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
  function cancel(e:ReactPointerEvent<HTMLDivElement>){
    const s=st.current;if(s.pointerId!==e.pointerId)return;
    s.pointerId=-1;s.dragging=false;s.moved=true;s.vel=0;s.samples=[];
    s.target=clampTarget(Math.round(s.pos));stageRef.current?.classList.remove('is-dragging');
    try{stageRef.current?.releasePointerCapture(e.pointerId);}catch{/* already released */}
    report();kick();
  }
  function stageClick(e:ReactMouseEvent<HTMLDivElement>){
    if(st.current.moved){st.current.moved=false;return;}
    if(travel.current>8)return;   // a finger that moved was handling the pictures, not asking to leave
    if(!(e.target===e.currentTarget||(e.target as HTMLElement).classList.contains('cf-track')))return;
    // only a clear tap above or below the row of pictures closes: never a tap in the gaps between them
    let top=Infinity,bottom=-Infinity;
    stageRef.current?.querySelectorAll<HTMLElement>('.cf-card').forEach(c=>{const r=c.getBoundingClientRect();if(r.width&&r.height){top=Math.min(top,r.top);bottom=Math.max(bottom,r.bottom);}});
    if(Number.isFinite(top)&&e.clientY>top-28&&e.clientY<bottom+28)return;
    onClose();
  }
  function key(e:ReactKeyboardEvent<HTMLDivElement>){
    if(e.key==='ArrowRight'){e.preventDefault();go(1);}
    else if(e.key==='ArrowLeft'){e.preventDefault();go(-1);}
    else if((e.key==='Enter'||e.key===' ')&&e.target===stageRef.current){e.preventDefault();openViewer();}
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
        <img alt={dup?'':it.title} data-src={sized(it,q(1080,2400))} decoding="async" draggable={false}/>
      </div>
    </div>);
  }
  return <div className="cf-view" onKeyDown={key}>
    <div className="cf-head">
      <div><h3>{stack.name}</h3><p aria-live="polite">{items[active]?.title} <span className="cf-count">{active+1} / {n}</span></p></div>
      {!viewing&&<button type="button" className="cf-close" onClick={onClose} aria-label="Close and return to all stacks">Close ✕</button>}
    </div>
    <div className={'cf-stage'+(reduced?' is-reduced':'')} ref={stageRef} tabIndex={0} role="region" aria-roledescription="carousel" aria-label={`${stack.name} images. Use the left and right arrow keys to browse, Escape to close.`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} onPointerLeave={leave} onClick={stageClick} style={viewing?{display:'none'}:undefined}>
      <div className="cf-track">{cards}</div>
    </div>
    {viewing&&<Viewer p={items[Math.min(active,n-1)]} pinned={pins.has(items[Math.min(active,n-1)].slug)} onPin={onPin?()=>{const c=items[Math.min(active,n-1)];onPin(c.slug,!pins.has(c.slug));}:undefined} stackName={stack.name} index={active} n={n} atStart={atStart} atEnd={atEnd} onPrev={()=>go(-1)} onNext={()=>go(1)} onBack={closeViewer} reduced={reduced} origin={originRect.current}/>}
    <div className="cf-controls" style={viewing?{display:'none'}:undefined}>
      <button type="button" onClick={()=>go(-1)} disabled={atStart||n<2} aria-label="Previous image">‹</button>
      <button type="button" onClick={()=>go(1)} disabled={atEnd||n<2} aria-label="Next image">›</button>
    </div>
    {!viewing&&<p className="cf-hint">Tap the centre image to view it full size</p>}
  </div>;
}

/* ============================================================ panel ===== */
export function WorkStacks({folders,images,stacks:settings,id='work',filter='all',pinned,onPin}:WorkStacksProps){
  const reduced=useMedia('(prefers-reduced-motion: reduce)'),canHover=useMedia('(hover: hover) and (pointer: fine)');
  const pinSet=useMemo(()=>new Set(pinned||[]),[pinned]);
  const stacks=useMemo<Stack[]>(()=>{
    const out:Stack[]=[];
    const list=filter==='pinned'?images.filter(i=>pinSet.has(i.slug)):images;
    for(const name of folders){
      const items=list.filter(i=>i.cat===name);if(!items.length)continue;
      const wanted=settings?.covers?.[name];
      out.push({name,items,cover:items.find(i=>i.slug===wanted)||items[0]});
    }
    return out;
  },[folders,images,settings?.covers,filter,pinSet]);
  const [open,setOpen]=useState<string|null>(null);
  const [startSlug,setStartSlug]=useState('');
  const rootRef=useRef<HTMLElement>(null),pendingLink=useRef<string>(id==='work'&&typeof window!=='undefined'?(new URLSearchParams(window.location.search).get('image')||''):'');
  const opener=useRef<HTMLElement|null>(null);
  // A shared link (?image=<id>) opens that image once, as soon as it is in the data; the address is then tidied.
  useEffect(()=>{
    const slug=pendingLink.current;if(!slug)return;
    const hit=images.find(x=>x.slug===slug);if(!hit)return;
    pendingLink.current='';
    setStartSlug(slug);setOpen(hit.cat);
    try{const u=new URL(window.location.href);u.searchParams.delete('image');window.history.replaceState(null,'',u.pathname+u.search+u.hash);}catch{/* not critical */}
    requestAnimationFrame(()=>rootRef.current?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'}));
  },[images]);
  const current=stacks.find(s=>s.name===open);
  const close=useCallback(()=>{sfx('stack.close');setOpen(null);setStartSlug('');const el=opener.current;if(el)requestAnimationFrame(()=>el.isConnected&&el.focus({preventScroll:true}));},[]);
  if(!stacks.length)return <p className="ws-empty" role="status">{filter==='pinned'?'Nothing pinned yet. Open any image and tap the pin to keep it here.':'No work to show yet.'}</p>;
  return <section className="work-stacks" aria-label="Work" ref={rootRef}>
    {current
      ?<Coverflow key={current.name} stack={current} loop={settings?.loops?.[current.name]??(settings?.loop!==false)} reduced={reduced} canHover={canHover} onClose={close} pins={pinSet} onPin={onPin} startSlug={startSlug}/>
      :<StackGrid id={id} stacks={stacks} reduced={reduced} onOpen={(name,el)=>{opener.current=el;sfx('stack.open');setOpen(name);}}/>}
  </section>;
}
