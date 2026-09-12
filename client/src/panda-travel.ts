export type TravelStage='idle'|'down'|'perched'|'release'|'fall'|'return';
export type TravelState={stage:TravelStage;elapsed:number;open:boolean};
export const createTravel=():TravelState=>({stage:'idle',elapsed:0,open:false});
const ease=(t:number)=>{t=Math.max(0,Math.min(1,t));return Math.max(0,Math.min(1,t*t*t*(t*(t*6-15)+10)));};
export function setTravelOpen(state:TravelState,open:boolean){
  if(state.open===open)return;state.open=open;state.elapsed=0;state.stage=open?'down':'release';
}
export function advanceTravel(state:TravelState,dt:number,reduced:boolean){
  if(reduced){state.stage=state.open?'perched':'idle';state.elapsed=0;return;}
  state.elapsed+=Math.min(.1,Math.max(0,dt));
  const durations:Partial<Record<TravelStage,number>>={down:2.2,release:.34,fall:.8,return:2.1};
  while(durations[state.stage]&&state.elapsed>=durations[state.stage]!){
    state.elapsed-=durations[state.stage]!;
    state.stage=state.stage==='down'?'perched':state.stage==='release'?'fall':state.stage==='fall'?'return':'idle';
  }
}
export function travelPose(state:TravelState,perch:{x:number;y:number},home:{x:number;y:number},height:number,size:number){
  let x=home.x,y=home.y,rotation=0,opacity=1,climb=0,thread=0;
  const t=state.elapsed;
  if(state.stage==='down'||state.stage==='perched'||state.stage==='release'){
    const p=state.stage==='down'?ease(t/2.2):1;
    x=perch.x;y=(-size-8)+(perch.y+size+8)*p;
    if(state.stage==='down'){x+=Math.sin(t*7)*2*Math.sin(Math.PI*p);climb=1;opacity=Math.min(1,t/.18);}
    thread=1;
  }else if(state.stage==='fall'){
    const p=Math.min(1,t/.8);x=perch.x+Math.sin(p*Math.PI)*18;y=perch.y+(height+size-perch.y)*p*p;
    rotation=p*115;opacity=1-ease((p-.65)/.35);
  }else if(state.stage==='return'){
    const p=ease(t/2.1);y=height+size+(home.y-height-size)*p;
    x=home.x+Math.sin(t*7)*2*Math.sin(Math.PI*p);climb=-(1-ease((t-1.65)/.45));thread=Math.min(1,t/.2)*(1-ease((t-1.75)/.35));opacity=Math.min(1,t/.18);
  }
  return {x,y,rotation,opacity,climb,thread};
}
// Exact damped spring integration keeps thread tension consistent across refresh rates.
export type ThreadSpring={x:number;v:number};
export function stepThreadSpring(s:ThreadSpring,dt:number){
 const t=Math.min(.1,Math.max(0,dt)),d=5.5,w=16,wd=Math.sqrt(w*w-d*d),e=Math.exp(-d*t),c=Math.cos(wd*t),q=Math.sin(wd*t),x=s.x,v=s.v;
 s.x=e*(x*c+(v+d*x)/wd*q);s.v=e*(v*c-(d*v+w*w*x)/wd*q);
}
export function threadPaths(x:number,y:number,wobble:number,hit:number,age:number,snapAge:number|null,anchorY=0){
 const snapped=snapAge!==null,t=snapAge||0,tear=.58;
 const recoil=snapped?Math.sin(Math.min(1,t/.18)*Math.PI/2)*Math.exp(-t*3):0;
 const gap=snapped?Math.min(24,3+t*75):0;
 const path=(from:number,to:number,lower:boolean)=>{
  let out='';
  for(let i=0;i<=24;i++){
   const u=from+(to-from)*i/24;
   const wave=snapped?Math.sin((Math.abs(u-tear)-t*2.5)*28)*Math.exp(-Math.abs(Math.abs(u-tear)-t*2.5)*9)*12*Math.exp(-t*5):wobble*Math.cos((u-hit)*18-age*11);
   const dx=wave*Math.sin(Math.PI*u)+(snapped?(lower?-1:1)*recoil*10*Math.pow(1-Math.min(1,Math.abs(u-tear)/.58),2):0);
   const yy=anchorY+(y-anchorY)*u+(snapped?(lower?gap:-gap)*Math.pow(1-Math.min(1,Math.abs(u-tear)/.58),2):0);
   out+=(i?' L ':'M ')+(x+dx).toFixed(2)+' '+yy.toFixed(2);
  }
  return out;
 };
 return {upper:path(0,snapped?tear:1,false),lower:snapped?path(tear,1,true):'',opacity:snapped?Math.max(0,1-t/.55):1};
}
