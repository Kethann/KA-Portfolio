import * as THREE from 'three';
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
  let clock=createActivityClock(crypto.getRandomValues(new Uint32Array(1))[0]);
  function canRender(){return !disposed&&!lost&&!document.hidden&&visible&&host.isConnected;}
  function draw(dt:number){
    if(!character)return;
    const state=media.matches?{activity:'relaxing' as const,elapsed:0,weight:0}:clock.advance(dt);
    look.lerp(target,1-Math.exp(-dt*4));
    character.update(state.activity,state.elapsed,state.weight,time,look,media.matches?1:dt);
    host.dataset.activity=state.activity;
    renderer.render(scene,camera);
  }
  function tick(now:number){
    frame=0;if(!canRender()||media.matches)return;
    const elapsed=last?now-last:0;
    if(lowPower&&last&&elapsed<32){frame=requestAnimationFrame(tick);return;}
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
    const rect=host.getBoundingClientRect();if(!rect.width||!rect.height)return;
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
