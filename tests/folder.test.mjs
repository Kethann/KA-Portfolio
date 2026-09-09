import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
const require=createRequire(import.meta.url),{gsap}=require('gsap/dist/gsap');
const source=await readFile(new URL('../client/src/folderMotion.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};vm.runInNewContext(output,{exports});
test('hinged folder, accordion expansion, staggered emergence and exact reverse',()=>{
  const hinge=new THREE.Group(),sides=new THREE.Group(),dividers=new THREE.Group(),folder=new THREE.Group();
  const cards=Array.from({length:5},(_,i)=>{const group=new THREE.Group();group.position.set(0,-.05,-.23+i*.08);group.scale.setScalar(.82);const p=exports.stackPose(i,5);return {group,home:new THREE.Vector3(p.x,p.y,p.z),rotation:p.rotation};});
  let state='closed';const timeline=exports.createFolderTimeline(gsap,hinge,sides,dividers,folder,cards,()=>state='open',()=>state='closed');
  timeline.seek(.45);assert(hinge.rotation.x<0);assert(sides.scale.z>1);assert.equal(cards[0].group.position.y,-.05);
  timeline.seek(.95);assert(cards[0].group.position.y>cards[4].group.position.y,'cards must emerge sequentially');
  timeline.progress(1);assert.equal(state,'open');assert.equal(hinge.rotation.x,-1.82);
  for(const card of cards)assert(card.group.position.distanceTo(card.home)<1e-6);
  timeline.reverse();timeline.progress(0);assert.equal(state,'closed');assert(Math.abs(hinge.rotation.x)<1e-9);assert.equal(sides.scale.z,1);assert.equal(folder.scale.x,1);
  cards.forEach((card,i)=>{assert(card.group.position.distanceTo(new THREE.Vector3(0,-.05,-.23+i*.08))<1e-6);assert.equal(card.group.scale.x,.82);});
  timeline.kill();gsap.ticker.sleep();
});

const geometrySource=await readFile(new URL('../client/src/folderGeometry.ts',import.meta.url),'utf8');
const geometry={};vm.runInNewContext(ts.transpileModule(geometrySource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:geometry,require:name=>{assert.equal(name,'three');return THREE;}});

test('actual folder and floating cards fit desktop, tablet, and mobile perspective cameras throughout opening',()=>{
  const viewports=[[1920,1080,1560,830],[1440,900,1324,670],[1366,768,1256,538],[768,1024,728,784],[390,844,366,599],[360,780,336,535],[844,390,804,360]];
  for(const [vw,vh,width,height] of viewports){
    const scene=new THREE.Scene(),parts=geometry.createFolder();scene.add(parts.folder);
    const compact=exports.cameraFrame(width/height,0).compact;
    const cards=Array.from({length:5},(_,i)=>{
      const group=new THREE.Group();group.add(geometry.panel(2.72,1.94,.045,0x171e2b,.075));scene.add(group);
      group.position.set(0,-.05,-.23+i*.08);group.scale.setScalar(.82);
      const pose=exports.stackPose(i,5,compact);return {group,home:new THREE.Vector3(pose.x,pose.y,pose.z),rotation:pose.rotation};
    });
    const timeline=exports.createFolderTimeline(gsap,parts.hinge,parts.sides,parts.dividers,parts.folder,cards,()=>{},()=>{});
    const camera=new THREE.PerspectiveCamera(34,width/height,.1,80);
    for(const progress of [0,.08,.15,.25,.4,.6,.8,1]){
      timeline.progress(progress);cards.forEach(card=>card.group.visible=progress>0);scene.updateMatrixWorld(true);
      const view=exports.cameraFrame(width/height,progress);camera.position.set(0,view.targetY+1.15,view.distance);camera.lookAt(0,view.targetY,0);camera.updateMatrixWorld(true);
      const projected=[];
      function visit(object){
        if(!object.visible)return;
        if(object.isMesh){
          object.geometry.computeBoundingBox();const {min,max}=object.geometry.boundingBox;
          for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z])projected.push(new THREE.Vector3(x,y,z).applyMatrix4(object.matrixWorld).project(camera));
        }
        object.children.forEach(visit);
      }
      visit(scene);
      const maxX=Math.max(...projected.map(p=>Math.abs(p.x))),maxY=Math.max(...projected.map(p=>Math.abs(p.y)));
      assert(maxX<.99&&maxY<.99,JSON.stringify({viewport:[vw,vh],progress,maxX,maxY}));
      if(progress===0){
        const coverage=(Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y)))/2;
        assert(coverage>.52,JSON.stringify({viewport:[vw,vh],coverage}));
      }
    }
    timeline.kill();scene.traverse(object=>{if(object.isMesh){object.geometry.dispose();object.material.dispose();}});
  }
  gsap.ticker.sleep();
});

test('responsive retargeting preserves the exact closed pose on reversal',()=>{
  const parts=geometry.createFolder();
  const cards=Array.from({length:5},(_,i)=>{const group=new THREE.Group();group.position.set(0,-.05,-.23+i*.08);group.scale.setScalar(.82);const p=exports.stackPose(i,5);return {group,home:new THREE.Vector3(p.x,p.y,p.z),rotation:p.rotation};});
  const timeline=exports.createFolderTimeline(gsap,parts.hinge,parts.sides,parts.dividers,parts.folder,cards,()=>{},()=>{});
  timeline.progress(1);const time=timeline.time();
  cards.forEach((card,i)=>{const p=exports.stackPose(i,5,true);card.home.set(p.x,p.y,p.z);card.rotation=p.rotation;});
  timeline.time(0,true).invalidate().time(time,true);timeline.reverse().progress(0);
  assert.equal(parts.hinge.rotation.x,0);assert.equal(parts.folder.scale.x,1);
  cards.forEach((card,i)=>assert(card.group.position.distanceTo(new THREE.Vector3(0,-.05,-.23+i*.08))<1e-6));
  timeline.kill();gsap.ticker.sleep();
});
test('one-to-five cards remain centered with overlapping depth, not a grid',()=>{
  for(let count=1;count<=5;count++){
    const poses=Array.from({length:count},(_,i)=>exports.stackPose(i,count));
    assert(Math.abs(poses.reduce((sum,p)=>sum+p.x,0))<1e-9);
    assert(poses.every(p=>[p.x,p.y,p.z,p.rotation].every(Number.isFinite)));
    if(count>2)assert(new Set(poses.map(p=>p.z)).size>1);
  }
});
