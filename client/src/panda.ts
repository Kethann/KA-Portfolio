import * as THREE from 'three';
import {createTravel,setTravelOpen,advanceTravel,travelPose,stepThreadSpring,threadPaths} from './panda-travel';
import {createActivityClock, type Activity} from './panda-activity';
import {createPanda, loadPanda, type Character} from './panda-character';

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
    document.body.appendChild(host);host.classList.add('panda-traveler');
    thread=document.createElementNS('http://www.w3.org/2000/svg','svg');thread.classList.add('panda-thread');thread.setAttribute('aria-hidden','true');
    rope=document.createElementNS('http://www.w3.org/2000/svg','path');thread.appendChild(rope);
    loose=document.createElementNS('http://www.w3.org/2000/svg','path');thread.appendChild(loose);document.body.appendChild(thread);
    greeting=document.createElement('span');greeting.className='panda-bubble panda-return-greeting';greeting.textContent='';
    greeting.setAttribute('role','status');launcher.appendChild(greeting);
    setTravelOpen(travel,launcher.getAttribute('aria-expanded')==='true');
  }
  let lastPerch={x:0,y:0},lastPosition={x:0,y:0},activityBlend=0;
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
    const launch=launcher.getBoundingClientRect(),rect=host.getBoundingClientRect();
    const width=host.offsetWidth||rect.width,height=host.offsetHeight||rect.height;
    if(travel.open&&!panel.hidden){const bounds=panel.getBoundingClientRect();lastPerch={x:bounds.left+bounds.width/2-width/2,y:Math.max(4,bounds.top-height-8)};}
    const home={x:launch.left+launch.width/2-width/2,y:launch.bottom-height-(compact?30:26)};
    const pose=travelPose(travel,lastPerch,home,window.visualViewport?.height||innerHeight,height);
    lastPosition={x:pose.x,y:pose.y};
    host.style.transform=`translate3d(${pose.x}px,${pose.y}px,0) rotate(${pose.rotation}deg)`;
    host.style.opacity=String(pose.opacity);host.dataset.travel=travel.stage;
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
    setTravelOpen(travel,event.detail.open);movePanda(0);schedule();
  }) as EventListener,{signal});
  let clock=createActivityClock(crypto.getRandomValues(new Uint32Array(1))[0]);
  function canRender(){return !disposed&&!lost&&!document.hidden&&(visible||travel.stage!=='idle')&&host.isConnected;}
  function draw(dt:number){
    if(!character)return;
    const climbing=movePanda(dt);
    const gesturing=travel.stage!=='idle'||(greetingAge>=0&&greetingAge<2.8);
    const state=media.matches||gesturing?{activity:'relaxing' as const,elapsed:0,weight:0}:clock.advance(dt);
    look.lerp(target,1-Math.exp(-dt*4));
    activityBlend=gesturing||media.matches?0:Math.min(1,activityBlend+dt/.65);
    character.update(state.activity,state.elapsed,state.weight*activityBlend,time,look,media.matches?1:dt);
    character.climb?.(time,climbing);
    character.wave?.(greetingAge>=0&&greetingAge<2.8?greetingAge:-1);
    contact.visible=travel.stage==='idle';
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
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;pause();host.classList.remove('is-ready');},{signal});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{lost=false;resize();host.classList.add('is-ready');schedule();},{signal});
  function dispose(){
    if(disposed)return;disposed=true;pause();abort.abort();observer.disconnect();sizeObserver.disconnect();
    thread?.remove();greeting?.remove();host.classList.remove('panda-traveler');
    if(panel){if(originalStyle===null)host.removeAttribute('style');else if(originalStyle!==undefined)host.setAttribute('style',originalStyle);originalParent?.appendChild(host);}
    character?.dispose();contact.geometry.dispose();contact.material.dispose();renderer.dispose();renderer.domElement.remove();
    host.classList.remove('is-ready');owners.delete(host);
  }
  owners.set(host,dispose);
  try{
    character=options.modelUrl?await loadPanda(options.modelUrl,options.clips||{}):createPanda(lowPower);
    if(disposed){character.dispose();return dispose;}
    clock=createActivityClock(crypto.getRandomValues(new Uint32Array(1))[0],character.activities);
    scene.add(character.root);resize();host.classList.add('is-ready');schedule();
  }catch(error){dispose();throw error;}
  return dispose;
}
const owners=new WeakMap<HTMLElement,()=>void>();
