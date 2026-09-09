import * as THREE from 'three';
import brushUrl from './assets/images/poster/brush.webp';
import inkUrl from './assets/images/poster/ink.webp';
import paintUrl from './assets/images/poster/paint.webp';
import blueUrl from './assets/images/poster/blue-plaster.webp';
import redUrl from './assets/images/poster/red-plaster.webp';

export const artworkSources=[
  {url:blueUrl,full:true},{url:paintUrl,full:false},{url:redUrl,full:true},
  {url:brushUrl,full:false},{url:inkUrl,full:false}
];

export function renderBudget(width:number,height:number,pixelRatio:number){
  return Math.min(pixelRatio,2,Math.sqrt((width<600?1500000:4000000)/Math.max(1,width*height)));
}
export function transitionState(time:number){
  const index=Math.floor(Math.max(0,time)/26),phase=Math.max(0,time)-index*26;
  const progress=Math.max(0,Math.min(1,(phase-4)/22));
  return {index,from:index%artworkSources.length,to:(index+1)%artworkSources.length,progress:progress*progress*progress*(progress*(progress*6-15)+10)};
}
export const fragmentShader=`
precision highp float;
varying vec2 vUv;
uniform sampler2D uFrom,uTo;
uniform vec2 uResolution;
uniform float uTime,uProgress,uIndex,uIntro;
uniform float uFromAspect,uToAspect,uFromFull,uToFull;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.,a=.5;
  for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+3.7;a*=.5;}
  return v;
}
vec2 mirrorUv(vec2 p){return 1.-abs(mod(p,2.)-1.);}
vec3 painted(sampler2D art,vec2 uv,float seed,float sourceAspect,float full){
  if(full>.5){
    float viewportAspect=uResolution.x/uResolution.y;
    vec2 cover=viewportAspect>sourceAspect?vec2(1.,sourceAspect/viewportAspect):vec2(viewportAspect/sourceAspect,1.);
    vec2 sampleUv=uv/vec2(viewportAspect,1.)*cover*.97+.5;
    sampleUv+=vec2(sin(uTime*.016+seed),cos(uTime*.013+seed))*.008;
    return texture2D(art,clamp(sampleUv,vec2(.001),vec2(.999))).rgb;
  }
  float angle=seed*1.618;
  vec2 q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*uv;
  q+=vec2(sin(uTime*.026+seed),cos(uTime*.021+seed))*.065;
  vec2 flow=vec2(fbm(q*2.+seed+uTime*.012),fbm(q*2.-seed-uTime*.009))-.47;
  q+=flow*.17;
  vec4 broad=texture2D(art,mirrorUv(q*.62+.5));
  vec4 detail=texture2D(art,mirrorUv(q*1.55+vec2(.31,.67)+seed*.27));
  // Source pigment supplies both surface color and granular coverage.
  vec3 ground=mix(vec3(.025,.034,.046),vec3(.115,.073,.046),.5+.5*sin(seed*2.3));
  vec3 color=mix(ground,broad.rgb,broad.a*.78);
  color=mix(color,detail.rgb,detail.a*.25);
  float ridges=dot(detail.rgb,vec3(.3,.5,.2));
  color*=.8+ridges*.45;
  return color;
}
void main(){
  vec2 uv=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
  float pigment=fbm(uv*5.+uIndex*7.);
  float bristle=noise(vec2(uv.x*95.,uv.y*5.)+uIndex);
  float direction=mod(uIndex,4.);
  float sweep=direction<1.?vUv.x:direction<2.?1.-vUv.y:direction<3.?1.-vUv.x:length((vUv-.5)*1.4);
  vec4 maskPaint=texture2D(uTo,mirrorUv(uv*.9+.5+uIndex*.17));
  float grain=dot(maskPaint.rgb,vec3(.3,.5,.2))*maskPaint.a;
  // Overlapping hand-painted passes: each row reverses direction and has a curved bristle edge.
  vec2 brushUv=mod(uIndex,2.)<1.?vUv:vec2(vUv.y,1.-vUv.x);
  float paintedAt=2.;
  for(int i=0;i<5;i++){
    float row=float(i);
    float along=mod(row+uIndex,2.)<1.?brushUv.x:1.-brushUv.x;
    float center=(row+.5)/5.+sin(along*5.+row*1.7)*.027;
    float bristles=noise(vec2(along*9.,brushUv.y*170.)+row)*.025;
    float distanceFromPass=abs(brushUv.y-center);
    float outside=smoothstep(.085,.16+bristles,distanceFromPass);
    float arrival=row*.145+along*.32+outside*.7;
    paintedAt=min(paintedAt,arrival);
  }
  float field=paintedAt*.8+pigment*.1+bristle*.025+grain*.075;
  float edge=uProgress*1.4-.2;
  float localReveal=smoothstep(field-.27,field+.27,edge);
  float envelope=sin(uProgress*3.14159);
  float reveal=clamp(uProgress+(localReveal-uProgress)*envelope*.42,0.,1.);
  vec3 oldPaint=painted(uFrom,uv,uIndex,uFromAspect,uFromFull);
  vec3 newPaint=painted(uTo,uv,uIndex+1.,uToAspect,uToFull);
  vec3 color=mix(oldPaint,newPaint,reveal);
  // A narrow dragged-pigment edge, with no luminous glow.
  float wet=(1.-smoothstep(.02,.24,abs(field-edge)))*envelope;
  color=mix(color,color*.9,wet*.12);
  float center=smoothstep(.08,.72,length(uv*vec2(.8,1.)));
  float vignette=1.-smoothstep(.45,1.45,length(uv))*.36;
  color*=mix(.35,.74,center)*vignette;
  gl_FragColor=vec4(color,uIntro);
}`;

export function startPosterBackground(){
  if(document.getElementById('poster-environment'))return ()=>{};
  const layer=document.createElement('div');layer.id='poster-environment';layer.setAttribute('aria-hidden','true');
  layer.style.cssText='position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:1;background:#050506;';
  document.body.appendChild(layer);
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});}
  catch{layer.remove();return ()=>{};}
  renderer.setClearColor(0x050506,0);layer.appendChild(renderer.domElement);
  const uniforms={uFrom:{value:null as THREE.Texture|null},uTo:{value:null as THREE.Texture|null},uResolution:{value:new THREE.Vector2(innerWidth,innerHeight)},uTime:{value:0},uProgress:{value:0},uIndex:{value:0},uIntro:{value:0},uFromAspect:{value:1},uToAspect:{value:1},uFromFull:{value:0},uToFull:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader,depthTest:false,depthWrite:false,transparent:true});
  const geometry=new THREE.PlaneGeometry(2,2),scene=new THREE.Scene(),camera=new THREE.Camera();
  scene.add(new THREE.Mesh(geometry,material));
  let textures:THREE.Texture[]=[],clock=0,last=0,frame=0,disposed=false,ready=false,lastLight=0,slow=0,lowPower=false,lost=false;
  const loaded:THREE.Texture[]=[];
  const colors=artworkSources.map(()=>[.5,.5,.5]);
  function sampleColor(texture:THREE.Texture,index:number){
    if(!texture.image)return;
    const probe=document.createElement('canvas');probe.width=32;probe.height=32;
    const context=probe.getContext('2d');if(!context)return;
    try{
      context.drawImage(texture.image as HTMLImageElement,0,0,32,32);
      const pixels=context.getImageData(0,0,32,32).data,average=[0,0,0];let weight=0;
      for(let i=0;i<pixels.length;i+=4){const alpha=pixels[i+3]/255;weight+=alpha;for(let c=0;c<3;c++)average[c]+=pixels[i+c]/255*alpha;}
      if(weight)colors[index]=average.map(c=>c/weight);
    }catch{/* Keep the calibrated fallback if image sampling is unavailable. */}
  }
  function resize(){
    renderer.setPixelRatio(renderBudget(innerWidth,innerHeight,window.devicePixelRatio||1));
    renderer.setSize(innerWidth,innerHeight);uniforms.uResolution.value.set(innerWidth,innerHeight);
    if(ready&&media.matches)draw();
  }
  function draw(){
    const state=transitionState(clock);
    uniforms.uTime.value=clock;uniforms.uIndex.value=state.index;uniforms.uProgress.value=state.progress;
    uniforms.uFrom.value=textures[state.from];uniforms.uTo.value=textures[state.to];
    const fromImage=textures[state.from].image as HTMLImageElement|undefined,toImage=textures[state.to].image as HTMLImageElement|undefined;
    uniforms.uFromAspect.value=fromImage?.naturalWidth&&fromImage?.naturalHeight?fromImage.naturalWidth/fromImage.naturalHeight:1;
    uniforms.uToAspect.value=toImage?.naturalWidth&&toImage?.naturalHeight?toImage.naturalWidth/toImage.naturalHeight:1;
    uniforms.uFromFull.value=Number(artworkSources[state.from].full);uniforms.uToFull.value=Number(artworkSources[state.to].full);
    uniforms.uIntro.value=media.matches?1:Math.min(1,clock/4);
    renderer.render(scene,camera);
    if(clock-lastLight>.2||media.matches){
      lastLight=clock;
      const a=colors[state.from],b=colors[state.to];
      window.dispatchEvent(new CustomEvent('ka-ambient-light',{detail:{color:a.map((c,i)=>c+(b[i]-c)*state.progress),strength:(.048+.012*Math.sin(state.progress*Math.PI))*uniforms.uIntro.value,reflection:{from:fromImage,to:toImage,blend:state.progress,time:clock,index:state.index,aspect:innerWidth/innerHeight,fromAspect:uniforms.uFromAspect.value,toAspect:uniforms.uToAspect.value,fromFull:uniforms.uFromFull.value,toFull:uniforms.uToFull.value}}}));
    }
  }
  function tick(now:number){
    frame=0;if(disposed||document.hidden||media.matches||!ready||lost)return;
    const elapsed=last?now-last:33.4;
    if(elapsed<(lowPower?49:32)){frame=requestAnimationFrame(tick);return;}
    slow=elapsed>65?slow+1:Math.max(0,slow-1);if(slow>60)lowPower=true;
    clock+=Math.min(.08,elapsed/1000);last=now;draw();schedule(false);
  }
  function schedule(reset=true){if(ready&&!disposed&&!document.hidden&&!media.matches&&!frame&&!lost){if(reset)last=0;frame=requestAnimationFrame(tick);}}
  function visibility(){if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();}
  function motion(){cancelAnimationFrame(frame);frame=0;if(!ready)return;if(media.matches)draw();else schedule();}
  function contextLost(event:Event){event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;}
  function contextRestored(){lost=false;resize();motion();}
  function dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);
    window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',motion);
    renderer.domElement.removeEventListener('webglcontextlost',contextLost);renderer.domElement.removeEventListener('webglcontextrestored',contextRestored);
    loaded.forEach(t=>t.dispose());geometry.dispose();material.dispose();renderer.dispose();layer.remove();
  }
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);media.addEventListener('change',motion);
  renderer.domElement.addEventListener('webglcontextlost',contextLost);renderer.domElement.addEventListener('webglcontextrestored',contextRestored);
  resize();
  const loader=new THREE.TextureLoader();
  Promise.all(artworkSources.map(({url})=>new Promise<THREE.Texture>((resolve,reject)=>{
    loader.load(url,t=>{if(disposed){t.dispose();resolve(t);return;}t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;loaded.push(t);resolve(t);},undefined,reject);
  }))).then(images=>{if(disposed)return;textures=images;images.forEach(sampleColor);ready=true;motion();}).catch(dispose);
  return dispose;
}
