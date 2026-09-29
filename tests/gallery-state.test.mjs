import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../client/src/Gallery.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const projects=Array.from({length:6},(_,i)=>({id:String(i),slug:String(i),cat:'Posters',title:'Project '+i}));

function harness(props){
  const slots=[],effects=[],listeners=new Map();let cursor=0,resolveFetch;
  const hooks={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;return slots[i]??=({current:initial});},
    useMemo(fn){cursor++;return fn();},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}}
  };
  const exports={};
  vm.runInNewContext(compiled,{exports,AbortController,setTimeout,clearTimeout,
    window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),matchMedia:()=>({matches:true})},
    fetch:()=>new Promise(resolve=>{resolveFetch=resolve;}),
    require:name=>name==='react'?hooks:name==='./FolderScene'?{FolderScene:'scene'}:name==='./FolderCover'?{FolderCover:'cover'}:name==='./Preview'?{Preview:'preview'}:require(name)});
  return {
    render(){cursor=0;const tree=exports.Gallery(props);while(effects.length)effects.shift()();return tree;},
    update(site){listeners.get('ka-portfolio-updated')({detail:site});},
    resolve(site){resolveFetch({ok:true,json:async()=>site});}
  };
}
function nodes(tree){if(!tree||typeof tree!=='object')return [];return [tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];}
const find=(tree,predicate)=>nodes(tree).find(predicate);
const button=(tree,text)=>find(tree,node=>node.type==='button'&&node.props.children===text);

test('WebGL failure during opening unlocks fallback pagination and return navigation',()=>{
  const ui=harness({initialProjects:projects,category:'Posters',initialPortfolio:{images:projects,folders:['Posters'],details:{}}});
  let tree=ui.render();let scene=find(tree,node=>node.type==='scene');
  scene.props.onState('opening');tree=ui.render();
  assert.equal(button(tree,'Next').props.disabled,true);
  scene.props.onError();tree=ui.render();
  assert.equal(button(tree,'Next').props.disabled,false);
  button(tree,'Next').props.onClick();tree=ui.render();
  assert(find(tree,node=>node.props?.['aria-label']==='View Project 5'));
  const back=find(tree,node=>node.type==='button'&&node.props.className==='return-link');
  assert.equal(back.props.disabled,false);back.props.onClick();tree=ui.render();
  assert(find(tree,node=>node.props?.className==='collection-shelf'));
});

test('a delayed portfolio fetch cannot overwrite a newer creator update',async()=>{
  const ui=harness({initialProjects:projects,category:'Posters'});
  ui.render();
  ui.update({images:[{...projects[0],title:'New draft'}],folders:['Posters'],details:{}});ui.render();
  ui.resolve({images:[{...projects[0],title:'Old published'}],folders:['Posters'],details:{}});
  await new Promise(resolve=>setImmediate(resolve));
  ui.render();const tree=ui.render();
  assert.equal(find(tree,node=>node.type==='scene').props.projects[0].title,'New draft');
});
