import type {Group,Vector3} from 'three';
import type {gsap} from 'gsap';
type Card={group:Group;home:Vector3;rotation:number};
export function stackPose(index:number,count:number,compact=false){const offset=index-(count-1)/2;return {x:offset*(compact?.28:.58),y:1.03+index*(compact?.57:.48),z:1.75-index*.21,rotation:offset*(compact?-.028:-.055),yaw:offset*.045};}
export function cameraFrame(aspect:number,progress:number){
  progress=Math.min(1,progress*2);
  const compact=aspect<.85,height=5+progress*(compact?2.5:2.35),width=(compact?4.05:4.65)+progress*(compact?.65:1.9);
  const distance=Math.max(height,width/Math.max(aspect,.2))/(2*Math.tan(34*Math.PI/360))+1.3;
  return {distance,targetY:.05+progress*.95,compact};
}
export function createFolderTimeline(driver:typeof gsap,hinge:Group,sides:Group,dividers:Group,folder:Group,cards:Card[],opened:()=>void,closed:()=>void){
  const timeline=driver.timeline({paused:true,onComplete:opened,onReverseComplete:()=>{cards.forEach(card=>card.group.visible=false);closed();}});
  timeline.to(hinge.rotation,{x:-1.82,duration:.85,ease:'power2.inOut'},0)
    .to(sides.scale,{z:1.12,duration:.8,ease:'power2.inOut'},.12)
    .to(dividers.scale,{z:1.12,duration:.8,ease:'power2.inOut'},.12)
    .to(folder.position,{y:-.16,duration:1,ease:'power2.inOut'},.35)
    .to(folder.scale,{x:.94,y:.94,z:.94,duration:1,ease:'power2.inOut'},.35);
  cards.forEach((card,index)=>{
    const at=.5+index*.12,pose=stackPose(index,cards.length);
    timeline.to(card.group.position,{y:2.45,z:.9,duration:.72,ease:'power2.out'},at)
      .to(card.group.rotation,{z:()=>card.rotation,y:pose.yaw,duration:.9},at)
      .to(card.group.scale,{x:1,y:1,z:1,duration:.9,ease:'power2.out'},at)
      .to(card.group.position,{x:()=>card.home.x,y:()=>card.home.y,z:()=>card.home.z,duration:.85,ease:'power2.inOut'},at+.6);
  });return timeline;
}
