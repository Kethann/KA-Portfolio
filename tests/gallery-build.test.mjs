import {test} from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';

test('ambient artwork loads independently of the gallery',async()=>{
  const poster=await import('../dist/assets/poster.js');
  assert.equal(typeof poster.startPosterBackground,'function');
});

test('compiled gallery exposes the mount function used by the crystal homepage',async()=>{
  // Import the real output and its dependencies, not a source-level stand-in.
  const gallery=await import('../dist/assets/gallery.js');
  assert.equal(typeof gallery.mount,'function','Vite must preserve the externally called mount export');
});

test('compiled shadow stylesheet parses and supplies the scene height and custom controls',async()=>{
  const gallery=await import('../dist/assets/gallery.js');
  const previous=globalThis.document;let style;
  globalThis.document={createElement(tag){
    const element={textContent:'',attachShadow(){return {append(){}};}};
    if(tag==='style')style=element;
    return element;
  }};
  try{
    // Capture the actual stylesheet passed to the shadow root. Stop at React's DOM check.
    assert.throws(()=>gallery.mount({replaceChildren(){}},{initialProjects:[]}),/#299|Target container/);
    assert(style?.textContent);
    const sheet=postcss.parse(style.textContent);
    let sceneHeight=false,styledButtons=false,toolbar=false;
    sheet.walkRules(rule=>{
      if(rule.selector==='.folder-canvas')rule.walkDecls('height',()=>sceneHeight=true);
      if(rule.selector==='.folder-toggle')styledButtons=true;
      if(rule.selector==='.gallery-toolbar')toolbar=true;
    });
    assert(sceneHeight&&styledButtons&&toolbar,'gallery requires its own scene sizing and controls');
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
