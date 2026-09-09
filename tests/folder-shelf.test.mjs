import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
async function component(file,mocks={}){
  const source=await readFile(new URL('../client/src/'+file,import.meta.url),'utf8'),exports={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>mocks[name]||require(name)});
  return exports;
}
const cover=await component('FolderCover.tsx');let selected;
const {Gallery}=await component('Gallery.tsx',{'./FolderCover':cover,'./FolderScene':{FolderScene:props=>{selected=props;return null;}},'./Preview':{Preview:()=>null}});
const projects=[{id:'1',slug:'one',title:'One',cat:'Posters'},{id:'2',slug:'two',title:'Two',cat:'Posters'},{id:'3',slug:'three',title:'Three',cat:'Websites'}];
test('collection view shows one selectable folder per category with accurate counts',()=>{
  const html=renderToStaticMarkup(React.createElement(Gallery,{initialProjects:projects}));
  assert.equal((html.match(/class="collection-tile"/g)||[]).length,2);
  assert(html.includes('Open Posters, 2 projects'));assert(html.includes('Open Websites, 1 projects'));
  assert.equal((html.match(/class="collection-cover"/g)||[]).length,2);
});
test('a chosen category opens only its own images and honors pinned selections',()=>{
  renderToStaticMarkup(React.createElement(Gallery,{initialProjects:projects,category:'Posters',slugs:['two']}));
  assert(selected.autoOpen);assert.equal(selected.projects.length,1);assert.equal(selected.projects[0].slug,'two');
});

test('project detail uses the full image and metadata without a nested dialog',async()=>{
  const types=await component('types.ts');
  const {Preview}=await component('Preview.tsx',{'./types':types});
  const html=renderToStaticMarkup(React.createElement(Preview,{project:{...projects[0],widths:[480,1080],full:2000,description:'Poster artwork details',technologies:['Illustration'],link:'https://example.com/project'},label:'View project',onClose(){}}));
  assert(html.includes('/images/one-full.webp'));
  assert(html.includes('Poster artwork details'));
  assert(html.includes('Illustration'));
  assert(html.includes('https://example.com/project'));
  assert(!html.includes('<dialog'));
  assert(html.includes('Close project'));
});
