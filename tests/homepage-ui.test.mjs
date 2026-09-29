import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function functions(code){
  const source=ts.createSourceFile('ui.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=new Map();
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name)found.set(node.name.text,node.getText(source));ts.forEachChild(node,visit);}
  visit(source);return found;
}
const publicFunctions=functions([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function applySiteAppearance')));

test('navigation visibility can be turned off and back on in the same preview',()=>{
  const items=[{name:'contact'},{name:'about'},{name:'store'},{name:'tips'}];let renders=0;
  const context=vm.createContext({document:{documentElement:{style:{}},getElementById:()=>({hidden:true})},
    ALL_NAV_ITEMS:items,NAV_ITEMS:items.slice(),applyElementStyles(){},applyElementAnimations(){},applyLayoutOverrides(){},renderNavItems(){renders++;}});
  vm.runInContext(publicFunctions.get('applySiteAppearance'),context);
  context.applySiteAppearance({visibility:{navGallery:false,navAbout:false}});assert.deepEqual(context.NAV_ITEMS.map(i=>i.name),['contact','store','tips']);
  context.applySiteAppearance({visibility:{navGallery:true,navAbout:true}});assert.equal(context.NAV_ITEMS.length,4);assert.equal(renders,2);
});

test('typing while a contact request is pending cannot re-enable its submit button',()=>{
  const button={disabled:false};const context=vm.createContext({contactForm:{querySelector:()=>button},contactSending:true,allContactFieldsValid:()=>true});
  vm.runInContext(publicFunctions.get('updateContactSubmitState'),context);context.updateContactSubmitState();assert.equal(button.disabled,true);
  context.contactSending=false;context.updateContactSubmitState();assert.equal(button.disabled,false);
});
