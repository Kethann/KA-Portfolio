import * as THREE from 'three';
import {createTravel,setTravelOpen,advanceTravel,travelPose,stepThreadSpring,threadPaths} from './panda-travel';
import {createActivityClock, type Activity} from './panda-activity';
import {createPanda, loadPanda, type Character, type Flight} from './panda-character';

type Options = {modelUrl?: string; clips?: Partial<Record<Activity,string>>};
/** A single owner for rendering, active time, input, visibility and GPU resources. */
export async function mountPanda(host: HTMLElement, launcher: HTMLElement, options: Options = {}) {
  const existing = owners.get(host); existing?.();
  let disposed=false,frame=0,last=0,time=0,visible=true,lost=false,character:Character|undefined;
  const media=matchMedia('(prefers-reduced-motion: reduce)'),compact=matchMedia('(pointer: coarse)').matches;
  const lowPower=compact || (navigator.hardwareConcurrency||8)<=4;
  const abort=new AbortController(),signal=abort.signal;
  const look=new THREE.Vector2(),target=new THREE.Vector2();
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.domElement.setAttribute('aria-hidden','true');host.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,30);
  camera.position.set(.2,1.4,5.2);camera.lookAt(0,1.02,0);
  scene.add(new THREE.HemisphereLight(0xe6edff,0x5c4b40,2.4));
  const key=new THREE.DirectionalLight(0xffecd8,3.4);key.position.set(-3,4,5);scene.add(key);
  const fill=new THREE.DirectionalLight(0xb6c8e7,1.8);fill.position.set(3,2,-1);scene.add(fill);
  const contact=new THREE.Mesh(new THREE.CircleGeometry(.58,40),new THREE.MeshBasicMaterial({color:0x08080a,transparent:true,opacity:.13,depthWrite:false}));
  contact.rotation.x=-Math.PI/2;contact.position.set(0,-.15,.05);contact.scale.y=.7;scene.add(contact);
  const travel=createTravel(),panel=document.getElementById?.('assistant-panel');
  const originalParent=host.parentElement,originalStyle=host.getAttribute?.('style');
  let thread:SVGSVGElement|undefined,rope:SVGPathElement|undefined,loose:SVGPathElement|undefined,greeting:HTMLSpanElement|undefined;
  const tension={x:0,v:0};let pointer={x:-1000,y:-1000,moved:false},wasNear=false,hit=.5,disturbed=0;
  let threadX=0,threadY=0,snapX=0,snapY=0,greetingAge=-1;
  document.addEventListener('pointermove',(event:PointerEvent)=>{
    if(media.matches||travel.stage!=='perched')return;
    pointer={x:event.clientX,y:event.clientY,moved:true};
  },{passive:true,signal});
  if(panel){
    thread=document.createElementNS('http://www.w3.org/2000/svg','svg');thread.classList.add('panda-thread');thread.setAttribute('aria-hidden','true');
    rope=document.createElementNS('http://www.w3.org/2000/svg','path');thread.appendChild(rope);
    loose=document.createElementNS('http://www.w3.org/2000/svg','path');thread.appendChild(loose);document.body.appendChild(thread);
    greeting=document.createElement('span');greeting.className='panda-bubble panda-return-greeting';greeting.textContent='';
    greeting.setAttribute('role','status');launcher.appendChild(greeting);
    setTravelOpen(travel,launcher.getAttribute('aria-expanded')==='true');
  }
  let lastPerch={x:0,y:0},lastPosition={x:0,y:0},activityBlend=0;
  // Visits: the store closes, so the panda leaves the chat button, leaps onto the "closed" board (ka-panda-visit with
  // a target), naps on it while it scrolls, and leaps home when the board goes away (target null). The chat wins:
  // opening it calls the panda over; it leaps back to the board afterwards.
  const visit:{target:Element|null;stage:'idle'|'leap'|'sit'|'back';t:number;from:{x:number;y:number}|null}={target:null,stage:'idle',t:0,from:null};
  const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  let perchTurn=0,lastTurn=0;
  // The jetpack flight. The panda puts on a jetpack and flying goggles, turns to the side it is heading, lifts off, flies a smooth arc
  // (banking into the turn, the jets roaring harder as it brakes), hovers over the sign and settles on it. Back home it does the same
  // and takes the pack off at the chat button. fl is what the character reads to pose itself.
  const fl:Flight={face:0,bank:0,wear:0,thrust:0,pitch:0,settle:0};
  const ease5=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
  let puffClock=0,puffCount=0;
  function turnOf(el:Element|null){let a=0;for(let n:Element|null=el;n&&n!==document.body;n=n.parentElement){const t=getComputedStyle(n).transform;if(t&&t!=='none'){try{const m=new DOMMatrixReadOnly(t);a+=Math.atan2(m.b,m.a);}catch{/* not a matrix */}}}return a;}
  function visitStep(dt:number,home:{x:number;y:number},width:number,height:number){
    const r=visit.target?.getBoundingClientRect?.();
    // sits on the board's top edge, a little right of its centre, feet just over the rim. On the sign it rides rigidly:
    // the sign's own turn and position are taken every frame, so it swings with it instead of wobbling against it
    let perch=home;perchTurn=0;
    if(r&&r.width&&visit.target){
      const th=media.matches?0:turnOf(visit.target),w0=(visit.target as HTMLElement).offsetWidth||r.width,h0=(visit.target as HTMLElement).offsetHeight||r.height;
      const c=Math.cos(th),s=Math.sin(th),ux=w0*.12,uy=-h0/2,off=-height*.28;
      const px=r.left+r.width/2+ux*c-uy*s-off*s,py=r.top+r.height/2+ux*s+uy*c+off*c;
      perch={x:px-width/2,y:py-height/2};perchTurn=th*180/Math.PI;
    }
    if(media.matches){visit.stage=visit.target?'sit':'idle';visit.t=0;return {...(visit.target?perch:home),rotation:0};}
    visit.t+=Math.min(.1,Math.max(0,dt));
    const D=visit.stage==='leap'?2.3:visit.stage==='back'?2:0;
    if(D&&visit.t>=D){visit.t=0;visit.stage=visit.stage==='leap'?'sit':'idle';visit.from=null;}
    const damp=1-Math.exp(-dt*6);
    if(visit.stage==='sit'){
      // calm on the sign: the jets are off, it faces front, and the touchdown squash settles out
      fl.face+=(0-fl.face)*damp;fl.bank+=(0-fl.bank)*damp;fl.pitch+=(0-fl.pitch)*damp;fl.thrust=0;fl.wear=1;fl.settle=Math.max(0,1-visit.t/.5);
      return {...perch,rotation:perchTurn};
    }
    if(visit.stage==='idle'){fl.face=fl.bank=fl.thrust=fl.pitch=fl.settle=0;fl.wear=0;return {...home,rotation:0};}
    const leap=visit.stage==='leap',q=Math.min(1,visit.t/D),from=visit.from||home,to=leap?perch:home;
    const dx=to.x-from.x,dy=to.y-from.y,dist=Math.hypot(dx,dy),arc=Math.min(240,60+dist*.2);
    const cx=(from.x+to.x)/2,cy=Math.min(from.y,to.y)-arc*.6;
    const at=(qq:number)=>{
      const s=ease5((qq-.12)/.76),u=1-s;
      const lift=18*ease5(qq/.12)*(1-ease5((qq-.12)/.22))+14*ease5((qq-.74)/.13)*(1-ease5((qq-.87)/.13));   // a hop off the ground, a hover before touching down
      return {x:u*u*from.x+2*u*s*cx+s*s*to.x,y:u*u*from.y+2*u*s*cy+s*s*to.y-lift};
    };
    const p0=at(q),p1=at(Math.min(1,q+.02)),vx=(p1.x-p0.x)/(.02*D),vy=(p1.y-p0.y)/(.02*D),speed=Math.hypot(vx,vy);
    const dir=Math.abs(dx)<14?0:Math.sign(dx);
    fl.face+=(dir*(1-ease5((q-.84)/.14))-fl.face)*damp;   // turns to the side it flies to, and back to front before it lands
    fl.bank+=(Math.max(-1,Math.min(1,vx/1100))-fl.bank)*damp;
    fl.pitch+=(Math.min(1,speed/1300)-fl.pitch)*damp;
    const cruise=ease5(q/.08)*(.58+.08*Math.sin(time*23)),brake=.5*ease5((q-.72)/.1)*(1-ease5((q-.9)/.1));
    fl.thrust=(cruise+brake)*(1-ease5((q-.96)/.04));
    fl.wear=leap?ease5(q/.1):(q>.93?1-ease5((q-.93)/.07):1);
    fl.settle=0;
    return {x:p0.x,y:p0.y,rotation:fl.bank*12+(leap?perchTurn*ease5((q-.85)/.15):0)};
  }
  // smoke and sparks left in the air behind the jets (light page elements that fade by themselves)
  function trail(p:{x:number;y:number},width:number,height:number,dt:number){
    if(fl.thrust<.12||media.matches){return;}
    puffClock+=dt;const gap=.034/Math.max(.35,fl.thrust);
    while(puffClock>=gap&&puffCount<36){
      puffClock-=gap;
      const puff=document.createElement('i');puff.className='ka-puff'+(Math.random()<.3?' hot':'');
      const size=10+Math.random()*12;
      puff.style.cssText=`left:${(p.x+width*.5-fl.face*width*.17+(Math.random()-.5)*8).toFixed(1)}px;top:${(p.y+height*.66+Math.random()*6).toFixed(1)}px;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;--dx:${((Math.random()-.5)*26-fl.face*18).toFixed(1)}px;--dy:${(10+Math.random()*26).toFixed(1)}px`;
      puffCount++;puff.addEventListener('animationend',()=>{puff.remove();puffCount--;},{once:true});document.body.appendChild(puff);
    }
    if(puffClock>.2)puffClock=0;
  }
  function movePanda(dt:number){
    if(!panel)return 0;
    const previousStage=travel.stage;
    advanceTravel(travel,dt,media.matches);
    if(previousStage==='release'&&travel.stage==='fall'){snapX=threadX;snapY=threadY;tension.x=0;tension.v=0;}
    if(previousStage==='fall'&&travel.stage==='return'){tension.x=0;tension.v=0;}
    if(previousStage==='return'&&travel.stage==='idle'&&!media.matches){
      greetingAge=0;if(greeting)greeting.textContent="Hi, I'm back!";launcher.querySelector('.panda-bubble:not(.panda-return-greeting)')?.classList.remove('show');
    }
    if(travel.stage!=='idle'||media.matches)greetingAge=-1;
    if(greetingAge>=0)greetingAge+=dt;
    greeting?.classList.toggle('show',greetingAge>=0&&greetingAge<2.8);
    // Idle mascot shares the launcher's containing block, clipping and native zoom.
    // Detach only while travelling to/from the open conversation.
    const visiting=travel.stage==='idle'&&!travel.open&&visit.stage!=='idle';
    const travelling=travel.stage!=='idle'||visiting;
    const parent=travelling?document.body:launcher;
    if(host.parentElement!==parent)parent.appendChild(host);
    host.classList.toggle('panda-traveler',travelling);
    const launch=launcher.getBoundingClientRect(),rect=host.getBoundingClientRect();
    const width=host.offsetWidth||rect.width,height=host.offsetHeight||rect.height;
    // Perch above the open chat; if it fills the top of the screen (tablet side panel), hang beside it;
    // if there's no room at all (phone sheet), bow out while the chat is open instead of covering its header.
    let tucked=false;
    if(travel.open&&!panel.hidden){const b=panel.getBoundingClientRect();
      if(b.top>=height+12)lastPerch={x:b.left+b.width/2-width/2,y:b.top-height-8};
      else if(b.left>=width+20)lastPerch={x:b.left-width-12,y:b.top+14};
      else{lastPerch={x:b.left+b.width/2-width/2,y:4};tucked=true;}}
    const home={x:launch.left+launch.width/2-width/2,y:launch.bottom-height-(compact?30:26)};
    if(visiting){
      const p=visitStep(dt,home,width,height);
      lastPosition={x:p.x,y:p.y};if(visit.stage==='sit')lastTurn=perchTurn;
      trail(p,width,height,dt);
      host.style.transform=`translate3d(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px,0) rotate(${p.rotation.toFixed(3)}deg)`;
      host.style.opacity='1';host.dataset.travel='visit-'+visit.stage;
      if(thread)thread.style.opacity='0';
      return 0;
    }
    const pose=travelPose(travel,lastPerch,home,(window.visualViewport?.offsetTop||0)+(window.visualViewport?.height||innerHeight),height);
    lastPosition={x:pose.x,y:pose.y};
    host.style.transform=travelling?`translate3d(${pose.x}px,${pose.y}px,0) rotate(${pose.rotation}deg)`:'translateX(-50%)';
    host.style.opacity=String(tucked&&travel.stage==='perched'?0:pose.opacity);host.dataset.travel=travel.stage;
    if(thread&&rope&&loose){
      const returning=travel.stage==='return';
      threadX=pose.x+width*.5;threadY=Math.max(0,pose.y+height*.2);
      if(pointer.moved){
        const near=travel.stage==='perched'&&pointer.y>0&&pointer.y<threadY&&Math.abs(pointer.x-threadX)<26;
        if(near){const proximity=1-Math.abs(pointer.x-threadX)/26;
          tension.v=Math.max(-90,Math.min(90,tension.v+(pointer.x<threadX?-1:1)*proximity*(wasNear?14:65)));
          hit=pointer.y/Math.max(1,threadY);disturbed=time;
        }
        wasNear=near;pointer.moved=false;
      }
      stepThreadSpring(tension,dt);
      rope.style.strokeDasharray='none';rope.style.strokeDashoffset='0';
      if(returning){
        const tipX=home.x+width*.5,tipY=pose.webTipY;
        // The tip leads; after attachment only the hand end moves up the web.
        rope.setAttribute('d',`M ${threadX.toFixed(2)} ${threadY.toFixed(2)} L ${tipX.toFixed(2)} ${tipY.toFixed(2)}`);
        loose.setAttribute('d',`M ${tipX-3} ${tipY+3} L ${tipX} ${tipY} L ${tipX+3} ${tipY+3} M ${tipX} ${tipY} L ${tipX} ${tipY+5}`);
        thread.style.opacity=String(pose.thread);
      }else if(travel.stage==='fall'){
        const paths=threadPaths(snapX,snapY,0,.58,0,travel.elapsed);
        thread.style.opacity=String(paths.opacity);rope.setAttribute('d',paths.upper);loose.setAttribute('d',paths.lower);
      }else if(tucked&&travel.stage==='perched'){
        thread.style.opacity='0';
      }else if(pose.thread>0){
        const paths=threadPaths(threadX,threadY,media.matches?0:tension.x,hit,time-disturbed,null);
        rope.setAttribute('d',paths.upper);loose.setAttribute('d','');thread.style.opacity=String(pose.thread);
      }else{
        thread.style.opacity='0';
      }
    }
    return pose.climb;
  }
  document.addEventListener('ka-chat-state',((event:CustomEvent<{open:boolean}>)=>{
    greetingAge=-1;greeting?.classList.remove('show');pointer.moved=false;wasNear=false;
    if(event.detail.open){tension.x=0;tension.v=0;}
    if(!event.detail.open)lastPerch={...lastPosition};
    if(event.detail.open&&visit.target){visit.stage='leap';visit.t=0;visit.from=null;}   // back to the board once the chat closes
    setTravelOpen(travel,event.detail.open);movePanda(0);schedule();
  }) as EventListener,{signal});
  document.addEventListener('ka-panda-visit',((event:CustomEvent<{target:Element|null}>)=>{
    const target=event.detail?.target||null;
    if(target===visit.target)return;
    const flying=visit.stage!=='idle';
    visit.target=target;visit.t=0;
    if(target){visit.from=flying?{...lastPosition}:null;visit.stage='leap';}
    else if(visit.stage!=='idle'){visit.stage='back';visit.from={...lastPosition};}
    movePanda(0);schedule();
  }) as EventListener,{signal});
  // a visit asked for before the panda finished loading (the page keeps the latest request)
  const asked=(globalThis as unknown as {__kaPandaVisit?:Element|null}).__kaPandaVisit;
  if(asked&&asked.isConnected){visit.target=asked;visit.stage='leap';visit.from=null;}
  let clock=createActivityClock(crypto.getRandomValues(new Uint32Array(1))[0]);
  function canRender(){return !disposed&&!lost&&!document.hidden&&(visible||travel.stage!=='idle'||visit.stage!=='idle')&&host.isConnected;}
  function draw(dt:number){
    if(!character)return;
    const climbing=movePanda(dt);
    const leaping=visit.stage==='leap'||visit.stage==='back';
    const napping=visit.stage==='sit'&&travel.stage==='idle'&&!travel.open;   // resting on the closed board
    const gesturing=travel.stage!=='idle'||(!napping&&leaping)||(greetingAge>=0&&greetingAge<2.8);
    const nap:Activity=character.activities.includes('sleeping')?'sleeping':'relaxing';
    const calm=Math.min(1,Math.max(0,(visit.t-1.3)/1.1));   // sits upright and calm for a moment, then nods off
    const state=napping?(calm>.001?{activity:nap,elapsed:visit.t-1.3,weight:calm}:{activity:'relaxing' as const,elapsed:0,weight:0}):media.matches||gesturing?{activity:'relaxing' as const,elapsed:0,weight:0}:clock.advance(dt);
    look.lerp(target,1-Math.exp(-dt*4));
    activityBlend=gesturing||media.matches?0:Math.min(1,activityBlend+dt/.65);
    character.update(state.activity,state.elapsed,state.weight*activityBlend,time,look,media.matches?1:dt);
    character.climb?.(time,climbing);
    character.wave?.(greetingAge>=0&&greetingAge<2.8?greetingAge:-1);
    character.fly?.(time,dt,fl);
    document.documentElement?.toggleAttribute?.('data-ka-nap',napping&&calm>.05);
    contact.visible=travel.stage==='idle'&&visit.stage==='idle';
    host.dataset.activity=state.activity;
    renderer.render(scene,camera);
  }
  function tick(now:number){
    frame=0;if(!canRender()||media.matches)return;
    const elapsed=last?now-last:0;
    const dt=Math.min(.1,elapsed/1000);last=now;time+=dt;draw(dt);schedule(false);
  }
  function schedule(reset=true){
    if(!canRender()||!character)return;
    if(media.matches){draw(0);return;}
    if(!frame){if(reset)last=0;frame=requestAnimationFrame(tick);}
  }
  function pause(){cancelAnimationFrame(frame);frame=0;last=0;}
  function visibility(){pause();schedule();}
  function resize(){
    const bounds=host.getBoundingClientRect();
    const rect={width:host.offsetWidth||bounds.width,height:host.offsetHeight||bounds.height};if(!rect.width||!rect.height)return;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,lowPower?1.5:2,Math.sqrt(100000/(rect.width*rect.height))));
    renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();
    if(canRender())draw(0);
  }
  const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(host);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;visibility();});observer.observe(host);
  document.addEventListener('visibilitychange',visibility,{signal});media.addEventListener('change',visibility,{signal});
  launcher.addEventListener('pointermove',event=>{
    if(media.matches||event.pointerType==='touch')return;
    const rect=launcher.getBoundingClientRect();target.set(THREE.MathUtils.clamp((event.clientX-rect.left)/rect.width*2-1,-1,1),.35);
  },{passive:true,signal});
  launcher.addEventListener('pointerleave',()=>target.set(0,0),{signal});
  launcher.addEventListener('focus',()=>target.set(0,.5),{signal});
  launcher.addEventListener('blur',()=>target.set(0,0),{signal});
  launcher.addEventListener('click',()=>target.set(0,.6),{signal});
  // A lost graphics context usually comes back; if it doesn't within a few seconds, start over from scratch
  // (the page listens for ka-panda-lost and mounts a fresh panda), so the panda never just disappears.
  let lostTimer=0;
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;pause();host.classList.remove('is-ready');
    clearTimeout(lostTimer);lostTimer=setTimeout(()=>{if(lost&&!disposed){dispose();globalThis.dispatchEvent?.(new Event('ka-panda-lost'));}},4000) as unknown as number;},{signal});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{clearTimeout(lostTimer);lost=false;resize();host.classList.add('is-ready');schedule();},{signal});
  function dispose(){
    if(disposed)return;disposed=true;pause();abort.abort();observer.disconnect();sizeObserver.disconnect();
    thread?.remove();greeting?.remove();host.classList.remove('panda-traveler');document.documentElement?.removeAttribute?.('data-ka-nap');
    if(panel){if(originalStyle===null)host.removeAttribute('style');else if(originalStyle!==undefined)host.setAttribute('style',originalStyle);originalParent?.appendChild(host);}
    character?.dispose();contact.geometry.dispose();contact.material.dispose();renderer.dispose();renderer.domElement.remove();
    host.classList.remove('is-ready');owners.delete(host);
  }
  owners.set(host,dispose);
  if(typeof document.getElementById==='function'&&document.head&&!document.getElementById('ka-panda-fx')){const st=document.createElement('style');st.id='ka-panda-fx';st.textContent='.ka-puff{position:fixed;z-index:73;margin:-6px 0 0 -6px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(235,235,245,.5),rgba(170,175,190,.22) 55%,rgba(150,155,170,0) 72%);animation:ka-puff .95s ease-out forwards}.ka-puff.hot{background:radial-gradient(circle,rgba(255,236,170,.9),rgba(255,138,48,.5) 50%,rgba(255,110,30,0) 74%);animation-duration:.55s}@keyframes ka-puff{from{opacity:.95;transform:translate(0,0) scale(.35)}to{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.9)}}@media (prefers-reduced-motion:reduce){.ka-puff{display:none}}';document.head.appendChild(st);}
  try{
    character=options.modelUrl?await loadPanda(options.modelUrl,options.clips||{}):createPanda(lowPower);
    if(disposed){character.dispose();return dispose;}
    clock=createActivityClock(crypto.getRandomValues(new Uint32Array(1))[0],character.activities);
    scene.add(character.root);resize();host.classList.add('is-ready');schedule();
  }catch(error){dispose();throw error;}
  return dispose;
}
const owners=new WeakMap<HTMLElement,()=>void>();
