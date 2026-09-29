import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.createSourceFile('WorkStacks.tsx',await readFile(new URL('../client/src/WorkStacks.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functions=new Map();
function collect(node){if(ts.isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node.getText(source));ts.forEachChild(node,collect);}collect(source);
function load(name,globals){const context=vm.createContext(globals);vm.runInContext(ts.transpileModule(functions.get(name),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);return context[name];}

test('carousel keyboard focus opens the current image without hijacking child buttons',()=>{
  const stage={};let opened=0,prevented=0,moved=0;
  const key=load('key',{stageRef:{current:stage},openViewer:()=>opened++,go:delta=>moved+=delta});
  const event=(name,target=stage)=>({key:name,target,preventDefault:()=>prevented++});
  key(event('Enter'));key(event(' '));assert.equal(opened,2);
  key(event('Enter',{}));assert.equal(opened,2);
  key(event('ArrowRight'));key(event('ArrowLeft'));assert.equal(moved,0);assert.equal(prevented,4);
});

test('share menu wraps keyboard focus and isolates arrows from the image viewer',()=>{
  let active,stopped=0;const items=Array.from({length:3},()=>({focus(){active=this;}}));active=items[0];
  const menuKey=load('menuKey',{mod:(v,n)=>((v%n)+n)%n});
  const currentTarget={querySelectorAll:()=>items,getRootNode:()=>({activeElement:active})};
  const key=name=>menuKey({key:name,currentTarget,stopPropagation:()=>stopped++,preventDefault(){}});
  key('ArrowUp');assert.equal(active,items[2]);key('ArrowDown');assert.equal(active,items[0]);
  key('End');assert.equal(active,items[2]);key('Home');assert.equal(active,items[0]);
  key('ArrowRight');assert.equal(active,items[0]);assert.equal(stopped,5);
});
