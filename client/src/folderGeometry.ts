import * as THREE from 'three';

export const dividerColors=[0xf08a74,0xedac65,0xe4cb70,0x9dc783,0x68b8ab,0x6bafd5,0x8197dc,0xab8dc8,0xcd93b5];
export function roundedShape(width:number,height:number,r:number){
  const x=-width/2,y=-height/2,s=new THREE.Shape();
  s.moveTo(x+r,y);s.lineTo(x+width-r,y);s.quadraticCurveTo(x+width,y,x+width,y+r);
  s.lineTo(x+width,y+height-r);s.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
  s.lineTo(x+r,y+height);s.quadraticCurveTo(x,y+height,x,y+height-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
export function panel(width:number,height:number,depth:number,color:number,radius=.08){
  const geometry=new THREE.ExtrudeGeometry(roundedShape(width,height,radius),{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.018,bevelThickness:.012,curveSegments:5});
  geometry.translate(0,0,-depth/2);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.12}));
  mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
function pleats(sign:number){
  const vertices:number[]=[];
  for(let i=0;i<18;i++){
    const x0=sign*(1.46+(i%2)*.055),x1=sign*(1.46+((i+1)%2)*.055),z0=-.52+i*.065,z1=z0+.065;
    vertices.push(x0,-1.78,z0,x1,-1.78,z1,x1,1.7,z1,x0,-1.78,z0,x1,1.7,z1,x0,1.7,z0);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x252831,roughness:.85,side:THREE.DoubleSide}));mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
export function createFolder(){
  const folder=new THREE.Group(),body=new THREE.Group();folder.add(body);body.rotation.y=-.30;
  const back=panel(3.18,3.9,.10,0x191d24);back.position.z=-.62;body.add(back);
  const front=panel(3.05,3.60,.10,0x20232a);front.position.set(-.055,-.15,.69);body.add(front);
  const bottom=panel(3.05,1.34,.06,0x151820);bottom.rotation.x=Math.PI/2;bottom.position.y=-1.94;body.add(bottom);
  const sides=new THREE.Group();sides.add(pleats(-1),pleats(1));body.add(sides);
  const dividers=new THREE.Group();body.add(dividers);
  dividerColors.forEach((color,i)=>{
    const sheet=panel(3.13,3.65,.018,color,.055);sheet.position.set(.075,0,.53-i*.127);dividers.add(sheet);
    const tab=panel(.37,.48,.022,color,.04);tab.position.set(1.55,1.56-i*.055,sheet.position.z);dividers.add(tab);
  });
  // The flap hinges around the top rear edge, like a physical expanding file.
  const hinge=new THREE.Group();hinge.position.set(0,1.95,-.65);body.add(hinge);
  const crown=panel(3.22,1.43,.07,0x292c34);crown.rotation.x=Math.PI/2;crown.position.z=.69;hinge.add(crown);
  const flap=panel(3.22,1.12,.07,0x252830,.20);flap.position.set(0,-.54,1.4);hinge.add(flap);
  const clasp=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,.055,24),new THREE.MeshStandardMaterial({color:0x090b10,roughness:.23,metalness:.65}));clasp.rotation.x=Math.PI/2;clasp.position.set(0,-.65,1.47);hinge.add(clasp);
  for(const sign of [-1,1]){
    const curve=new THREE.LineCurve3(new THREE.Vector3(sign*.40,-.1,1.46),new THREE.Vector3(0,-.65,1.48));
    hinge.add(new THREE.Mesh(new THREE.TubeGeometry(curve,1,.012,5,false),new THREE.MeshStandardMaterial({color:0x080a0e,roughness:.65})));
  }
  const inset=panel(.96,.25,.016,0x0b0c12,.12);inset.position.set(-.06,-.20,.755);body.add(inset);
  const lining=panel(.83,.15,.01,0x6b2734,.07);lining.position.set(-.06,-.21,.77);body.add(lining);
  return {folder,hinge,sides,dividers};
}
