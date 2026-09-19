import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const creator=await readFile(new URL('../public/creator.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function functions(code){
  const source=ts.createSourceFile('ui.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=new Map();
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name)found.set(node.name.text,node.getText(source));ts.forEachChild(node,visit);}
  visit(source);return found;
}
const publicFunctions=functions([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function applySiteAppearance')));

test('content input updates the draft before sending the live preview',()=>{
  const handlers={},site={details:{contactTitle:'Old',glassBlur:0}};let preview;
  const form={addEventListener:(type,fn)=>handlers[type]=fn};
  const line=creator.split('\n').find(line=>line.startsWith("$('#details').addEventListener('input'"));
  vm.runInNewContext(line,{$:()=>form,site,FormData:class{*[Symbol.iterator](){yield ['contactTitle','New'];}},markDirty:()=>preview=structuredClone(site)});
  handlers.input();assert.equal(preview.details.contactTitle,'New');assert.equal(preview.details.glassBlur,0);
});

test('edits made during publishing remain dirty and retain the new server revision',async()=>{
  const start=creator.indexOf("$('#save').addEventListener('click',async()=>{");
  const end=creator.indexOf("\n$('#password')",start);let handler,resolveSave;
  const save={disabled:false},form={checkValidity:()=>true};
  save.addEventListener=(_type,fn)=>handler=fn;
  const context=vm.createContext({$:s=>s==='#save'?save:form,site:{revision:2,details:{contactTitle:'Initial'}},draftVersion:1,dirty:true,
    FormData:class{*[Symbol.iterator](){yield ['contactTitle','Initial'];}},api:()=>new Promise(resolve=>resolveSave=resolve),syncPreview(){},status(){}});
  vm.runInContext(creator.slice(start,end),context);
  const pending=handler();context.site.details.contactTitle='Newer edit';context.draftVersion++;
  resolveSave({revision:3,details:{contactTitle:'Initial'}});await pending;
  assert.equal(context.site.details.contactTitle,'Newer edit');assert.equal(context.site.revision,3);assert.equal(context.dirty,true);assert.equal(save.disabled,false);
});

test('navigation visibility can be turned off and back on in the same preview',()=>{
  const items=[{name:'contact'},{name:'portfolio'},{name:'gallery'},{name:'about'}];let renders=0;
  const context=vm.createContext({document:{documentElement:{style:{}},getElementById:()=>({hidden:true})},
    ALL_NAV_ITEMS:items,NAV_ITEMS:items.slice(),applyElementStyles(){},applyLayoutOverrides(){},renderNavItems(){renders++;}});
  vm.runInContext(publicFunctions.get('applySiteAppearance'),context);
  context.applySiteAppearance({visibility:{navGallery:false,navAbout:false}});assert.equal(context.NAV_ITEMS.length,2);
  context.applySiteAppearance({visibility:{navGallery:true,navAbout:true}});assert.equal(context.NAV_ITEMS.length,4);assert.equal(renders,2);
});

test('typing while a contact request is pending cannot re-enable its submit button',()=>{
  const button={disabled:false};const context=vm.createContext({contactForm:{querySelector:()=>button},contactSending:true,allContactFieldsValid:()=>true});
  vm.runInContext(publicFunctions.get('updateContactSubmitState'),context);context.updateContactSubmitState();assert.equal(button.disabled,true);
  context.contactSending=false;context.updateContactSubmitState();assert.equal(button.disabled,false);
});
