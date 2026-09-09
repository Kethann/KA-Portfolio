// SVG annotations stay sharp at browser zoom and follow the actual WebGL bubbles.
let skillOverlay = null;
function buildSkillCallouts(){
  const ns='http://www.w3.org/2000/svg';
  const make=(tag,attrs,parent)=>{
    const el=document.createElementNS(ns,tag);
    Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,value));
    parent?.appendChild(el);return el;
  };
  skillOverlay=make('svg',{'class':'skill-callouts','role':'img','aria-label':'Skills: '+TOOLKIT.map(s=>s.label).join(', ')},document.body);
  const defs=make('defs',{},skillOverlay);
  const gradient=make('linearGradient',{id:'skill-line-light',x1:'0%',y1:'0%',x2:'100%',y2:'100%'},defs);
  make('stop',{offset:'0%','stop-color':'#b8d8ef','stop-opacity':'.55'},gradient);
  make('stop',{offset:'60%','stop-color':'#ffe8cd','stop-opacity':'.95'},gradient);
  make('stop',{offset:'100%','stop-color':'#e8aa82','stop-opacity':'.7'},gradient);
  icons.forEach((ic,i)=>{
    const group=make('g',{opacity:'0','aria-hidden':'true'},skillOverlay);
    const halo=make('path',{'class':'skill-line-halo',fill:'none'},group);
    const path=make('path',{'class':'skill-line',fill:'none',pathLength:'1'},group);
    const tip=make('path',{'class':'skill-tip',d:'M -3 0 L 0 -3 L 3 0 L 0 3 Z'},group);
    const label=make('text',{'class':'skill-label'},group);label.textContent=TOOLKIT[i].label;
    ic.callout={group,halo,path,tip,label,projected:new THREE.Vector3()};
  });
}

// Layout uses screen pixels so type never becomes tiny with the camera's FOV.
function skillLabelLayout(points,width,height){
  const compact=width<640;
  const cx=width/2,cy=height/2;
  if(compact){
    const top=Math.min(...points.map(p=>p.y-p.radius));
    const bottom=Math.max(...points.map(p=>p.y+p.radius));
    return points.map(p=>{
      const upper=p.y<cy,side=p.x<cx?-1:1;
      const peers=points.filter(q=>(q.y<cy)===upper && (q.x<cx)===(p.x<cx)).sort((a,b)=>Math.abs(b.y-cy)-Math.abs(a.y-cy));
      const row=peers.indexOf(p);
      return {x:width*(side<0?.25:.75),y:upper?Math.max(116,top-24)-row*28:Math.min(height-60,bottom+30)+row*28,
        anchor:'middle',side,compact:true};
    });
  }
  const labels=points.map(p=>{
    const side=p.x<cx?-1:1;
    return {x:side<0?Math.max(92,p.x-p.radius-58):Math.min(width-92,p.x+p.radius+58),
      y:Math.max(92,Math.min(height-28,p.y)),anchor:side<0?'end':'start',side,compact:false};
  });
  [-1,1].forEach(side=>{
    const column=labels.filter(p=>p.side===side).sort((a,b)=>a.y-b.y);
    for(let i=1;i<column.length;i++) column[i].y=Math.max(column[i].y,column[i-1].y+27);
    if(column.length && column[column.length-1].y>height-24){
      column[column.length-1].y=height-24;
      for(let i=column.length-2;i>=0;i--) column[i].y=Math.min(column[i].y,column[i+1].y-27);
    }
  });
  return labels;
}

function updateSkillCallouts(){
  if(!skillOverlay || !icons.length) return;
  const width=window.innerWidth,height=window.innerHeight;
  skillOverlay.setAttribute('viewBox',`0 0 ${width} ${height}`);
  camera.updateMatrixWorld();
  const points=icons.map(ic=>{
    const p=ic.callout.projected.copy(ic.sprite.position).project(camera);
    const distance=Math.max(1,camera.position.z-ic.sprite.position.z);
    return {x:(p.x*.5+.5)*width,y:(.5-p.y*.5)*height,
      radius:ic.sprite.scale.x*height/(4*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*distance)};
  });
  const labels=skillLabelLayout(points,width,height);
  let anyVisible=false;
  icons.forEach((ic,i)=>{
    const c=ic.callout,p=points[i],label=labels[i];
    const opacity=ic.sprite.material.opacity*(ic.calloutReveal || (reducedMotion?1:0));
    c.group.setAttribute('opacity',opacity.toFixed(3));
    if(opacity<.001) return;
    anyVisible=true;
    const dx=label.x-p.x,dy=label.y-p.y,len=Math.hypot(dx,dy)||1;
    const sx=p.x+dx/len*(p.radius+3),sy=p.y+dy/len*(p.radius+3);
    const ex=label.x+(label.anchor==='end'?7:label.anchor==='start'?-7:0),ey=label.y-4;
    const bend=label.compact?label.side*26:label.side*18;
    const d=`M ${sx} ${sy} C ${sx+bend} ${sy}, ${ex+bend} ${ey-12}, ${ex} ${ey}`;
    c.path.setAttribute('d',d);c.halo.setAttribute('d',d);
    c.path.style.strokeDashoffset=String(1-opacity);
    c.tip.setAttribute('transform',`translate(${ex},${ey})`);
    c.label.setAttribute('x',label.x);c.label.setAttribute('y',label.y+(label.compact?-9:0));
    c.label.setAttribute('text-anchor',label.anchor);
  });
  skillOverlay.setAttribute('aria-hidden',String(!anyVisible));
}
