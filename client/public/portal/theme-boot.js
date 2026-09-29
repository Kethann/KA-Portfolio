// Applies the saved portal theme before first paint (no flash). External file so the CSP needs no inline script.
(function(){try{var r=document.documentElement,t=JSON.parse(localStorage.getItem('ka.portal.theme')||'"system"'),a=JSON.parse(localStorage.getItem('ka.portal.accent')||'"ember"');
if(t==='dark'||t==='light')r.setAttribute('data-theme',t);r.setAttribute('data-accent',a==='crimson'?'crimson':'ember');}catch(e){}})();
