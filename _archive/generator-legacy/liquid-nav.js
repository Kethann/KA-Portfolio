// Pointer capture keeps a held selection attached even outside the control.
// Native button clicks and arrow keys remain available without a gesture.
var navDrag = null, suppressNavClickUntil = 0;
function endNavDrag(commit){
  if (!navDrag) return;
  var drag=navDrag; navDrag=null;
  clearTimeout(drag.holdTimer); cancelAnimationFrame(drag.raf);
  nav.classList.remove('is-holding');
  navPill.style.borderRadius='999px';
  if(!reducedMotion) navPill.classList.add('is-releasing');
  navItems.forEach(function(el){el.removeAttribute('data-preview');});
  if (nav.hasPointerCapture(drag.id)) nav.releasePointerCapture(drag.id);
  suppressNavClickUntil=performance.now()+450;
  if (commit){
    var name=drag.target.getAttribute('data-section');
    if (name!==activeSection) switchSection(name); else movePill();
    drag.target.focus({preventScroll:true});
  } else movePill();
}
nav.addEventListener('pointerdown',function(e){
  var button=e.target.closest('.nav-item');
  if (!button || navDrag || !e.isPrimary || e.button!==0) return;
  cancelAnimationFrame(pillRAF);
  navPill.classList.remove('is-releasing');
  var rect=nav.getBoundingClientRect();
  navDrag={id:e.pointerId,target:button,x:e.clientX-rect.left,rect:rect,raf:0,lastX:e.clientX-rect.left,lastT:performance.now(),
    bounds:navItems.map(function(el){return {el:el,left:el.offsetLeft,width:el.offsetWidth};})};
  nav.setPointerCapture(e.pointerId);
  navDrag.holdTimer=setTimeout(function(){if(navDrag) nav.classList.add('is-holding');},160);
  button.setAttribute('data-preview','');
});
nav.addEventListener('pointermove',function(e){
  if(!navDrag || e.pointerId!==navDrag.id) return;
  var drag=navDrag;
  drag.x=e.clientX-drag.rect.left;
  nav.classList.add('is-holding');
  if(drag.raf) return;
  drag.raf=requestAnimationFrame(function(){
    if(navDrag!==drag) return;
    drag.raf=0;
    var nearest=drag.bounds.reduce(function(best,b){return Math.abs(drag.x-b.left-b.width/2)<Math.abs(drag.x-best.left-best.width/2)?b:best;});
    drag.target=nearest.el;
    navItems.forEach(function(el){el.toggleAttribute('data-preview',el===drag.target);});
    pillW=nearest.width;
    pillX=clamp(drag.x-pillW/2,drag.bounds[0].left,drag.bounds[2].left+drag.bounds[2].width-pillW);
    pillVX=0;
    navPill.style.width=pillW+'px';
    var now=performance.now(),velocity=(drag.x-drag.lastX)/Math.max(8,now-drag.lastT);
    drag.lastX=drag.x;drag.lastT=now;
    var distance=Math.abs(drag.x-nearest.left-nearest.width/2);
    var stretch=reducedMotion?1:1+Math.min(.28,Math.abs(velocity)*.07+distance*.002);
    var squeeze=1/Math.pow(stretch,.48);
    navPill.style.borderRadius=reducedMotion?'999px':velocity>=0?'62% 38% 38% 62% / 48% 55% 45% 52%':'38% 62% 62% 38% / 55% 48% 52% 45%';
    navPill.style.setProperty('--liquid-light',velocity>=0?'72%':'28%');
    navPill.style.transform='translateX('+pillX+'px) scale('+stretch+','+squeeze+')';
  });
});
nav.addEventListener('pointerup',function(e){
  if(navDrag && e.pointerId===navDrag.id){
    // Resolve the final event directly, even when it arrives before a paint.
    var x=e.clientX-navDrag.rect.left;
    navDrag.target=navDrag.bounds.reduce(function(a,b){return Math.abs(x-b.left-b.width/2)<Math.abs(x-a.left-a.width/2)?b:a;}).el;
    endNavDrag(true);
  }
});
nav.addEventListener('pointercancel',function(){endNavDrag(false);});
nav.addEventListener('lostpointercapture',function(){endNavDrag(false);});
nav.addEventListener('keydown',function(e){if(e.key==='Escape' && navDrag){e.preventDefault();endNavDrag(false);}});
nav.addEventListener('click',function(e){
  if(e.detail!==0 && performance.now()<suppressNavClickUntil && e.target.closest('.nav-item')){
    e.preventDefault();e.stopImmediatePropagation();
  }
},true);
window.addEventListener('blur',function(){endNavDrag(false);});
window.addEventListener('resize',function(){endNavDrag(false);});
