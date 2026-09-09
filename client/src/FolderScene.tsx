import {useEffect,useImperativeHandle,useRef,forwardRef} from 'react';
import * as THREE from 'three';
import {gsap} from 'gsap';
import {imageUrl,type Project} from './types';
import {createFolderTimeline,stackPose,cameraFrame} from './folderMotion';
import {createFolder,panel,roundedShape} from './folderGeometry';

export type FolderHandle={toggle:()=>void;select:(index:number)=>void;restore:()=>void};
type Props={projects:Project[];autoOpen?:boolean;onState:(state:string)=>void;onPreview:(project:Project|null)=>void;onError:()=>void};

export const FolderScene=forwardRef<FolderHandle,Props>(function FolderScene({projects,autoOpen=false,onState,onPreview,onError},ref){
  const host=useRef<HTMLDivElement>(null),controller=useRef<FolderHandle>({toggle(){},select(){},restore(){}});
  const callbacks=useRef({onState,onPreview,onError});callbacks.current={onState,onPreview,onError};
  useImperativeHandle(ref,()=>({toggle:()=>controller.current.toggle(),select:i=>controller.current.select(i),restore:()=>controller.current.restore()}),[]);
  useEffect(()=>{
    const element=host.current!;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'default'});}catch{callbacks.current.onError();return;}
    let disposed=false,state='closed',selected=-1,hovered=-1,frame=0,last=0,visible=false,compact=false,loaded=false;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');let reduced=media.matches;
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,80);
    renderer.setClearColor(0x101319,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','Accordion portfolio folder. Use the Open folder button to explore projects.');
    scene.add(new THREE.HemisphereLight(0xdbe6f8,0x3c3337,1.8));
    const key=new THREE.DirectionalLight(0xffe2ce,3.5);key.position.set(-3,6,5);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=7;key.shadow.camera.bottom=-5;
    key.shadow.bias=-.0005;key.shadow.normalBias=.025;key.shadow.radius=3;scene.add(key);
    const rim=new THREE.DirectionalLight(0xb3c9f1,2.5);rim.position.set(4,3,-3);scene.add(rim);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.36}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-2.03;floor.receiveShadow=true;scene.add(floor);
    const idle=new THREE.Group();scene.add(idle);
    const {folder,hinge,sides,dividers}=createFolder();idle.add(folder);
    const cards=projects.slice(0,5).map((project,i)=>{
      const group=new THREE.Group(),hover=new THREE.Group();group.add(hover);scene.add(group);
      const backing=panel(2.72,1.94,.045,0x171e2b,.075);hover.add(backing);
      const image=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:0x222a37}));
      image.position.set(0,.13,.044);hover.add(image);
      const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(roundedShape(2.73,1.95,.075).getPoints(8)),
        new THREE.LineBasicMaterial({color:0x718099,transparent:true,opacity:.48}));
      outline.position.z=.055;hover.add(outline);
      const labelCanvas=document.createElement('canvas');labelCanvas.width=768;labelCanvas.height=88;
      const ctx=labelCanvas.getContext('2d')!;
      ctx.fillStyle='#121925';ctx.fillRect(0,0,768,88);ctx.fillStyle='#e9edf5';ctx.font='24px sans-serif';
      const label=project.title.length>42?project.title.slice(0,39)+'…':project.title;
      ctx.fillText(label,24,52,665);ctx.font='19px monospace';ctx.fillStyle='#aab7ce';ctx.fillText(String(i+1).padStart(2,'0'),711,51);
      const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
      const caption=new THREE.Mesh(new THREE.PlaneGeometry(2.63,.30),new THREE.MeshBasicMaterial({map:labelTexture}));
      caption.position.set(0,-.76,.046);hover.add(caption);
      group.position.set(0,-.05,-.23+i*.08);group.scale.setScalar(.82);group.visible=false;
      const pose=stackPose(i,Math.min(5,projects.length));
      return {group,hover,backing,image,outline,project,home:new THREE.Vector3(pose.x,pose.y,pose.z),rotation:pose.rotation};
    });
    function loadImages(){
      if(loaded)return;loaded=true;
      const loader=new THREE.TextureLoader();
      cards.forEach(card=>loader.load(imageUrl(card.project),texture=>{
        if(disposed){texture.dispose();return;}
        texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
        card.image.material.map=texture;card.image.material.color.set(0xffffff);card.image.material.needsUpdate=true;
        const ratio=texture.image.width/texture.image.height,w=Math.min(2.62,1.56*ratio);
        card.image.scale.set(w,w/ratio,1);
        schedule();
      },undefined,()=>{/* The project title and preview remain usable if a thumbnail is unavailable. */}));
    }
    const setState=(next:string)=>{state=next;callbacks.current.onState(next);schedule();};
    const timeline=createFolderTimeline(gsap,hinge,sides,dividers,folder,cards,()=>setState('open'),()=>setState('closed'));
    function toggle(){
      if(state==='preview'||state==='restoring'||state==='opening'||state==='closing')return;
      if(state==='closed'||state==='closing'){
        loadImages();cards.forEach(c=>c.group.visible=true);setState('opening');timeline.timeScale(1).play();if(reduced)timeline.progress(1);
      }else{
        setState('closing');hovered=-1;timeline.timeScale(1.15).reverse();if(reduced)timeline.progress(0);
      }
    }
    function select(index:number){
      if(state!=='open'||selected>=0||!cards[index])return;
      selected=index;hovered=-1;setState('preview');
      callbacks.current.onPreview(cards[index].project);
    }
    function restore(){
      if(selected<0||state==='restoring')return;
      const card=cards[selected];selected=-1;callbacks.current.onPreview(null);setState('restoring');
      const pose=stackPose(cards.indexOf(card),cards.length,compact);
      gsap.to(card.group.position,{x:pose.x,y:pose.y,z:pose.z,duration:reduced?0:.45,ease:'power2.inOut'});
      gsap.to(card.group.rotation,{x:0,y:pose.yaw,z:pose.rotation,duration:reduced?0:.45});
      gsap.to(card.group.scale,{x:1,y:1,z:1,duration:reduced?0:.45,onComplete:()=>{
        if(disposed)return;setState('closing');timeline.timeScale(1.15).reverse();if(reduced)timeline.progress(0);
      }});
    }
    controller.current={toggle,select,restore};
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(10,10),target=new THREE.Vector2(),smoothed=new THREE.Vector2();
    let down:{x:number;y:number}|null=null,folderHovered=false,needsHitTest=false;
    function move(event:PointerEvent){
      const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)return;
      pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);target.copy(pointer);
      needsHitTest=true;
      schedule();
    }
    function pick(){
      needsHitTest=false;
      raycaster.setFromCamera(pointer,camera);
      folderHovered=state==='closed'&&raycaster.intersectObject(folder,true).length>0;
      hovered=-1;
      if(state==='open'){
        const hit=raycaster.intersectObjects(cards.map(c=>c.backing),false)[0];
        hovered=hit?cards.findIndex(c=>c.backing===hit.object):-1;
      }
      renderer.domElement.style.cursor=folderHovered||hovered>=0?'pointer':'default';
    }
    function leave(){down=null;target.set(0,0);pointer.set(10,10);hovered=-1;folderHovered=false;needsHitTest=false;renderer.domElement.style.cursor='default';schedule();}
    function pointerDown(event:PointerEvent){if(!event.isPrimary||event.button!==0)return;down={x:event.clientX,y:event.clientY};move(event);}
    function pointerUp(event:PointerEvent){
      if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>10){down=null;return;}
      down=null;move(event);pick();if(folderHovered)toggle();else if(hovered>=0)select(hovered);
    }
    element.addEventListener('pointermove',move);element.addEventListener('pointerleave',leave);
    element.addEventListener('pointerdown',pointerDown);element.addEventListener('pointerup',pointerUp);element.addEventListener('pointercancel',leave);
    function updateCamera(){
      const view=cameraFrame(camera.aspect,timeline.progress());camera.position.set(0,view.targetY+1.15,view.distance);
      camera.lookAt(0,view.targetY,0);camera.updateMatrixWorld();
    }
    function resize(){
      const {width,height}=element.getBoundingClientRect();if(width<=0||height<=0)return;
      camera.aspect=width/height;camera.updateProjectionMatrix();
      const nextCompact=cameraFrame(camera.aspect,0).compact;
      if(nextCompact!==compact){
        compact=nextCompact;
        cards.forEach((card,i)=>{const p=stackPose(i,cards.length,compact);card.home.set(p.x,p.y,p.z);card.rotation=p.rotation;});
        // Reset to the original closed pose before refreshing responsive destinations.
        // Invalidating in the open pose would make reverse playback stop in that pose.
        const time=timeline.time();
        const previewCard=selected>=0?cards[selected]:null;
        const previewPose=previewCard?{position:previewCard.group.position.clone(),rotation:previewCard.group.rotation.clone(),scale:previewCard.group.scale.clone()}:null;
        timeline.time(0,true).invalidate().time(time,true);
        if(previewCard&&previewPose){previewCard.group.position.copy(previewPose.position);previewCard.group.rotation.copy(previewPose.rotation);previewCard.group.scale.copy(previewPose.scale);}
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,compact?1.5:1.8,Math.sqrt(3200000/(width*height))));
      renderer.setSize(width,height);updateCamera();
      schedule();
    }
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    function onMotion(){reduced=media.matches;if(reduced){if(state==='opening')timeline.progress(1);else if(state==='closing')timeline.progress(0);}schedule();}
    media.addEventListener('change',onMotion);
    function tick(now:number){
      frame=0;if(disposed||!visible||document.hidden)return;
      const dt=Math.min(.05,(now-last)/1000||.016);last=now;const damp=reduced?1:1-Math.exp(-7*dt);
      if(needsHitTest)pick();
      const idleAmount=!reduced&&state==='closed'&&folderHovered?1:0;smoothed.lerp(target,damp);
      idle.rotation.y+=(target.x*.065*idleAmount-idle.rotation.y)*damp;
      idle.rotation.x+=(-target.y*.025*idleAmount-idle.rotation.x)*damp;
      idle.position.y+=(idleAmount*.045-idle.position.y)*damp;
      cards.forEach((card,i)=>{
        const focused=state==='open'&&i===hovered;
        card.hover.position.y+=((focused?.14:0)-card.hover.position.y)*damp;
        card.hover.position.z+=((focused?.55:0)-card.hover.position.z)*damp;
        const scale=focused?1.035:1;card.hover.scale.lerp(newScale.setScalar(scale),damp);
        card.outline.material.opacity+=( (focused?.95:.48)-card.outline.material.opacity)*damp;
        card.outline.material.color.set(focused?0x9cbdff:0x718099);
        if(state==='open'){
          card.group.position.x+=(card.home.x+(reduced?0:smoothed.x*.035)-card.group.position.x)*damp;
          card.group.position.y+=(card.home.y+(reduced?0:Math.sin(now*.00065+i*1.2)*.025)-card.group.position.y)*damp;
          card.group.rotation.z+=(card.rotation-card.group.rotation.z)*damp;
        }
      });
      updateCamera();renderer.render(scene,camera);if(!reduced)frame=requestAnimationFrame(tick);
    }
    const newScale=new THREE.Vector3();
    function schedule(){if(!frame&&!disposed&&visible&&!document.hidden){last=performance.now();frame=requestAnimationFrame(tick);}}
    const visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();else{cancelAnimationFrame(frame);frame=0;}});visibility.observe(element);
    function visibilityChange(){if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();}
    document.addEventListener('visibilitychange',visibilityChange);
    function contextLost(event:Event){event.preventDefault();callbacks.current.onError();}
    renderer.domElement.addEventListener('webglcontextlost',contextLost);
    setState('closed');
    const openingTimer=autoOpen?window.setTimeout(toggle,reduced?0:280):null;
    return()=>{
      if(openingTimer!==null)window.clearTimeout(openingTimer);
      disposed=true;cancelAnimationFrame(frame);observer.disconnect();visibility.disconnect();timeline.kill();
      document.removeEventListener('visibilitychange',visibilityChange);media.removeEventListener('change',onMotion);
      renderer.domElement.removeEventListener('webglcontextlost',contextLost);
      element.removeEventListener('pointermove',move);element.removeEventListener('pointerleave',leave);
      element.removeEventListener('pointerdown',pointerDown);element.removeEventListener('pointerup',pointerUp);element.removeEventListener('pointercancel',leave);
      scene.traverse(object=>{
        gsap.killTweensOf(object.position);gsap.killTweensOf(object.rotation);gsap.killTweensOf(object.scale);
        if(object instanceof THREE.Mesh||object instanceof THREE.Line){
          object.geometry.dispose();
          for(const material of Array.isArray(object.material)?object.material:[object.material]){
            if('map' in material)(material.map as THREE.Texture|null)?.dispose();material.dispose();
          }
        }
      });
      key.shadow.dispose();renderer.dispose();renderer.domElement.remove();controller.current={toggle(){},select(){},restore(){}};
    };
  },[projects,autoOpen]);
  return <div ref={host} className="folder-canvas"/>;
});
