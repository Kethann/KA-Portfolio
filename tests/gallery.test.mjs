import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function mountFolderGallery'));
const source=ts.createSourceFile('portfolio.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const functions=new Map();
function collect(node){if(ts.isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node.getText(source));ts.forEachChild(node,collect);}
collect(source);

test('portfolio category opening is single-flight, cancellable, and returns focus',()=>{
  const timers=new Map();let nextTimer=0,mounts=0,disposals=0,focused=0;
  const folder={style:{},classList:{add(){},remove(){}},isConnected:true,focus(){focused++;}};
  const projects=[{slug:'one',cat:'Design'}];
  const context=vm.createContext({folderGrid:{children:[folder]},folderShelf:{style:{}},portfolioCoverflowEl:{innerHTML:''},
    folderOpenTimer:null,folderOrigin:null,coverflowTeardown:null,favFilter:'pinned',reducedMotion:false,
    postersFor:()=>projects,setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),
    mountFolderGallery(container,items,options){mounts++;assert.equal(items,projects);assert.equal(options.category,'Design');assert.deepEqual(Array.from(options.slugs),['one']);return()=>disposals++;}});
  for(const name of ['openFolder','closeFolder'])vm.runInContext(functions.get(name),context);
  context.openFolder('Design',folder);context.openFolder('Design',folder);
  assert.equal(timers.size,1);
  [...timers.values()][0]();timers.clear();assert.equal(mounts,1);
  context.openFolder('Design',folder);assert.equal(timers.size,0);
  context.closeFolder();assert.equal(disposals,1);assert.equal(focused,1);assert.equal(context.folderShelf.style.display,'');
  context.reducedMotion=true;context.openFolder('Design',folder);context.closeFolder();
  assert.equal(timers.size,0);assert.equal(mounts,1);assert.equal(context.folderShelf.style.opacity,'1');
});

test('leaving a gallery before its bundle loads prevents a late mount',async()=>{
  let resolveBundle,mounts=0;
  const bundle=new Promise(resolve=>{resolveBundle=resolve;});
  const container={children:[],replaceChildren(...children){this.children=children;}};
  const context=vm.createContext({document:{createElement:()=>({setAttribute(){}})},loadBundle:()=>bundle});
  vm.runInContext(functions.get('mountFolderGallery').replace("import('./dist/assets/gallery.js')",'loadBundle()'),context);
  const dispose=context.mountFolderGallery(container,[],{});
  assert.equal(container.children.length,1);dispose();
  resolveBundle({mount(){mounts++;}});await bundle;await Promise.resolve();
  assert.equal(mounts,0);assert.equal(container.children.length,0);
});

test('both portfolio and gallery navigation enter the embedded folder experience',()=>{
  assert.match(functions.get('openFolder'),/mountFolderGallery\(portfolioCoverflowEl/);
  assert.match(functions.get('switchSection'),/mountFolderGallery\(galleryCoverflowEl/);
});
