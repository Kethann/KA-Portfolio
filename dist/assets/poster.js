import{W as N,y as j,m as G,f as V,b as X,z as _,M as J,n as O,I as Q,J as Y}from"./three.module-D2tSVXIV.js";const Z="/assets/brush-BLjTzXE9.webp",$="/assets/ink-CxA0Tg3j.webp",ee="/assets/paint-DL1yNVAF.webp",te="/assets/blue-plaster-KKqifFvS.webp",oe="/assets/red-plaster-DTxKEtyX.webp",v=[{url:te,full:!0},{url:ee,full:!1},{url:oe,full:!0},{url:Z,full:!1},{url:$,full:!1}];function re(i,r,n){return Math.min(n,2,Math.sqrt((i<600?15e5:4e6)/Math.max(1,i*r)))}function ne(i){const r=Math.floor(Math.max(0,i)/26),n=Math.max(0,i)-r*26,t=Math.max(0,Math.min(1,(n-4)/22));return{index:r,from:r%v.length,to:(r+1)%v.length,progress:t*t*t*(t*(t*6-15)+10)}}const ae=`
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
}`;function se(){if(document.getElementById("poster-environment"))return()=>{};const i=document.createElement("div");i.id="poster-environment",i.setAttribute("aria-hidden","true"),i.style.cssText="position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:1;background:#050506;",document.body.appendChild(i);const r=matchMedia("(prefers-reduced-motion: reduce)");let n;try{n=new N({alpha:!0,antialias:!1,powerPreference:"low-power"})}catch{return i.remove(),()=>{}}n.setClearColor(328966,0),i.appendChild(n.domElement);const t={uFrom:{value:null},uTo:{value:null},uResolution:{value:new G(innerWidth,innerHeight)},uTime:{value:0},uProgress:{value:0},uIndex:{value:0},uIntro:{value:0},uFromAspect:{value:1},uToAspect:{value:1},uFromFull:{value:0},uToFull:{value:0}},E=new j({uniforms:t,vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",fragmentShader:ae,depthTest:!1,depthWrite:!1,transparent:!0}),L=new V(2,2),M=new X,z=new _;M.add(new J(L,E));let m=[],u=0,x=0,l=0,c=!1,f=!1,I=0,w=0,R=!1,b=!1;const W=[],U=v.map(()=>[.5,.5,.5]);function B(e,o){if(!e.image)return;const a=document.createElement("canvas");a.width=32,a.height=32;const s=a.getContext("2d");if(s)try{s.drawImage(e.image,0,0,32,32);const p=s.getImageData(0,0,32,32).data,h=[0,0,0];let g=0;for(let d=0;d<p.length;d+=4){const S=p[d+3]/255;g+=S;for(let T=0;T<3;T++)h[T]+=p[d+T]/255*S}g&&(U[o]=h.map(d=>d/g))}catch{}}function F(){n.setPixelRatio(re(innerWidth,innerHeight,window.devicePixelRatio||1)),n.setSize(innerWidth,innerHeight),t.uResolution.value.set(innerWidth,innerHeight),f&&r.matches&&y()}function y(){const e=ne(u);t.uTime.value=u,t.uIndex.value=e.index,t.uProgress.value=e.progress,t.uFrom.value=m[e.from],t.uTo.value=m[e.to];const o=m[e.from].image,a=m[e.to].image;if(t.uFromAspect.value=o!=null&&o.naturalWidth&&(o!=null&&o.naturalHeight)?o.naturalWidth/o.naturalHeight:1,t.uToAspect.value=a!=null&&a.naturalWidth&&(a!=null&&a.naturalHeight)?a.naturalWidth/a.naturalHeight:1,t.uFromFull.value=Number(v[e.from].full),t.uToFull.value=Number(v[e.to].full),t.uIntro.value=r.matches?1:Math.min(1,u/4),n.render(M,z),u-I>.2||r.matches){I=u;const s=U[e.from],p=U[e.to];window.dispatchEvent(new CustomEvent("ka-ambient-light",{detail:{color:s.map((h,g)=>h+(p[g]-h)*e.progress),strength:(.048+.012*Math.sin(e.progress*Math.PI))*t.uIntro.value,reflection:{from:o,to:a,blend:e.progress,time:u,index:e.index,aspect:innerWidth/innerHeight,fromAspect:t.uFromAspect.value,toAspect:t.uToAspect.value,fromFull:t.uFromFull.value,toFull:t.uToFull.value}}}))}}function k(e){if(l=0,c||document.hidden||r.matches||!f||b)return;const o=x?e-x:33.4;if(o<(R?49:32)){l=requestAnimationFrame(k);return}w=o>65?w+1:Math.max(0,w-1),w>60&&(R=!0),u+=Math.min(.08,o/1e3),x=e,y(),P(!1)}function P(e=!0){f&&!c&&!document.hidden&&!r.matches&&!l&&!b&&(e&&(x=0),l=requestAnimationFrame(k))}function q(){document.hidden?(cancelAnimationFrame(l),l=0):P()}function A(){cancelAnimationFrame(l),l=0,f&&(r.matches?y():P())}function C(e){e.preventDefault(),b=!0,cancelAnimationFrame(l),l=0}function D(){b=!1,F(),A()}function H(){c||(c=!0,cancelAnimationFrame(l),window.removeEventListener("resize",F),document.removeEventListener("visibilitychange",q),r.removeEventListener("change",A),n.domElement.removeEventListener("webglcontextlost",C),n.domElement.removeEventListener("webglcontextrestored",D),W.forEach(e=>e.dispose()),L.dispose(),E.dispose(),n.dispose(),i.remove())}window.addEventListener("resize",F),document.addEventListener("visibilitychange",q),r.addEventListener("change",A),n.domElement.addEventListener("webglcontextlost",C),n.domElement.addEventListener("webglcontextrestored",D),F();const K=new O;return Promise.all(v.map(({url:e})=>new Promise((o,a)=>{K.load(e,s=>{if(c){s.dispose(),o(s);return}s.minFilter=Q,s.magFilter=Y,W.push(s),o(s)},void 0,a)}))).then(e=>{c||(m=e,e.forEach(B),f=!0,A())}).catch(H),H}export{v as artworkSources,ae as fragmentShader,re as renderBudget,se as startPosterBackground,ne as transitionState};
