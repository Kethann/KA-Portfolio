import * as THREE from 'three';
import {activities, type Activity} from './panda-activity';

export type Character = {
  root: THREE.Group;
  activities: readonly Activity[];
  update: (activity: Activity, elapsed: number, weight: number, time: number, look: THREE.Vector2, dt: number) => void;
  dispose: () => void;
};

export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => {
      materials.add(material);
      Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
    });
  });
  textures.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); geometries.forEach(value => value.dispose());
}

/** Original geometry, with articulated pivots and fine silhouette fur. No downloaded artwork. */
export function createPanda(compact: boolean): Character {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  root.add(body); body.add(head); head.position.set(0,1.23,.06);
  const sphere = new THREE.SphereGeometry(1,32,24);
  const ivory = new THREE.MeshPhysicalMaterial({color:0xe8e4d9,roughness:.92,sheen:1,sheenColor:0xffffff,sheenRoughness:.85});
  const charcoal = new THREE.MeshPhysicalMaterial({color:0x191b20,roughness:.94,sheen:1,sheenColor:0x666b73,sheenRoughness:.8});
  const muzzle = new THREE.MeshPhysicalMaterial({color:0xf1e9dd,roughness:.86,sheen:.6});
  const noseMat = new THREE.MeshPhysicalMaterial({color:0x171b20,roughness:.32,clearcoat:.25});
  const eyeMat = new THREE.MeshPhysicalMaterial({color:0x18100c,roughness:.12,clearcoat:1,clearcoatRoughness:.08});
  const furMaterials = [0xbfbcb2,0x30343c].map(color => new THREE.LineBasicMaterial({color,transparent:true,opacity:.38}));
  let seed = 9137;
  const random = () => { seed = Math.imul(seed,1664525)+1013904223|0; return (seed>>>0)/4294967296; };
  function ellipsoid(parent: THREE.Object3D, material: THREE.Material, p: number[], scale: number[], fur = 0) {
    const mesh = new THREE.Mesh(sphere,material); mesh.position.set(p[0],p[1],p[2]); mesh.scale.set(scale[0],scale[1],scale[2]); parent.add(mesh);
    if (fur) {
      const points: number[] = [];
      const count = Math.round(fur * (compact ? .5 : 1));
      for (let i=0;i<count;i++) {
        const y=random()*2-1, angle=random()*Math.PI*2, radius=Math.sqrt(1-y*y);
        const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius,len=.012+random()*.026;
        // Fur follows the ellipsoid surface and curves gently down, including its silhouette.
        points.push(x,y,z,x*(1+len*.55),y*(1+len*.55)-.004,z*(1+len*.55));
        points.push(x*(1+len*.55),y*(1+len*.55)-.004,z*(1+len*.55),x*(1+len),y*(1+len)-.015,z*(1+len));
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
      mesh.add(new THREE.LineSegments(geometry,furMaterials[material===charcoal?1:0]));
    }
    return mesh;
  }
  ellipsoid(body,ivory,[0,.58,0],[.57,.64,.44],1700);
  ellipsoid(body,charcoal,[0,.98,-.02],[.57,.25,.43],600);
  ellipsoid(head,ivory,[0,.3,.05],[.65,.56,.49],2600);
  for (const sign of [-1,1]) {
    const ear=ellipsoid(head,charcoal,[sign*.49,.72,-.015],[.225,.235,.15],450);ear.rotation.z=-sign*.18;
    ellipsoid(head,noseMat,[sign*.49,.74,.105],[.119,.139,.045]);
    const patch=ellipsoid(head,charcoal,[sign*.245,.33,.465],[.175,.221,.055],250);patch.rotation.z=sign*-.27;
    ellipsoid(head,muzzle,[sign*.12,.115,.49],[.21,.155,.16],160);
    const foot=ellipsoid(body,charcoal,[sign*.4,.05,.28],[.245,.22,.32],400);foot.rotation.z=sign*.13;
    ellipsoid(body,noseMat,[sign*.4,.015,.553],[.12,.11,.025]);
  }
  const eyes = [-1,1].map(sign => ellipsoid(head,eyeMat,[sign*.235,.354,.523],[.067,.074,.045]));
  const nose=ellipsoid(head,noseMat,[0,.17,.658],[.105,.067,.061]);nose.rotation.z=.02;
  const mouth=ellipsoid(head,noseMat,[0,.035,.593],[.07,.012,.016]);
  const arms = [-1,1].map(sign => {
    const pivot = new THREE.Group(); pivot.position.set(sign*.48,.97,.03); body.add(pivot);
    ellipsoid(pivot,charcoal,[sign*.065,-.23,.035],[.21,.37,.23],650);
    ellipsoid(pivot,charcoal,[sign*.075,-.46,.1],[.205,.19,.2],250);return pivot;
  });
  const phone = new THREE.Group(); arms[1].add(phone);phone.position.set(.1,-.49,.27);
  const phoneCase=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.19,6,12),new THREE.MeshStandardMaterial({color:0x383a43,roughness:.38,metalness:.2}));phone.add(phoneCase);
  ellipsoid(phone,noseMat,[0,.11,.075],[.05,.019,.026]);
  const bamboo = new THREE.Group(); arms[0].add(bamboo);bamboo.position.set(-.03,-.4,.24);bamboo.rotation.z=-.28;
  const green = new THREE.MeshStandardMaterial({color:0x78864f,roughness:.83});
  bamboo.add(new THREE.Mesh(new THREE.CylinderGeometry(.033,.038,.72,12),green));
  const nodeMat=new THREE.MeshStandardMaterial({color:0xa6ad6b,roughness:.9});
  for(const y of [-.22,0,.22]) { const node=new THREE.Mesh(new THREE.TorusGeometry(.037,.008,5,12),nodeMat);node.rotation.x=Math.PI/2;node.position.y=y;bamboo.add(node); }
  const leaf=ellipsoid(bamboo,green,[.085,.24,0],[.12,.028,.032]);leaf.rotation.z=.5;
  const toy = ellipsoid(root,new THREE.MeshPhysicalMaterial({color:0xb5a1a0,roughness:.4,clearcoat:.4}),[.6,-.03,.47],[.14,.14,.14]);
  root.rotation.y=-.13;
  return {root,activities,dispose:()=>disposeObject(root),update(activity,elapsed,weight,time,look,dt){
    const sleep=activity==='sleeping'?weight:0, eat=activity==='eating'?weight:0,call=activity==='calling'?weight:0;
    const play=activity==='playing'?weight:0,stretch=activity==='stretching'?weight:0,watch=activity==='watching'?weight:0;
    // Gesture, pause, and recover; distinct rhythms avoid identical short hard loops.
    const bite=Math.pow(Math.max(0,Math.sin(elapsed*.73)),4),reach=Math.max(0,Math.sin(elapsed*.28));
    const yaw=Math.sin(time*.19)*.08*(1-sleep)+look.x*(.12+watch*.15);
    const damp=1-Math.exp(-dt*7);
    head.rotation.y+= (yaw-head.rotation.y)*damp;
    head.rotation.x+= (sleep*.26-call*.1+eat*bite*.06-look.y*.08-head.rotation.x)*damp;
    head.rotation.z=Math.sin(time*.31)*.025+sleep*.13+call*Math.sin(elapsed*.48)*.04;
    body.scale.y=1+Math.sin(time*(sleep?1.1:1.5))*.009+stretch*reach*.045;
    body.rotation.z=sleep*-.08+play*Math.sin(elapsed*.7)*.025;
    arms[0].rotation.z=-.12+eat*(1.05+bite*.18)-stretch*reach*2.35-play*.24;
    arms[1].rotation.z=.12+call*1.98+stretch*reach*2.25+play*(.25+Math.sin(elapsed*.9)*.2);
    arms[0].rotation.x=-eat*(.65+bite*.17)-play*.35;
    arms[1].rotation.x=-call*.38-play*.45;
    const blink=Math.pow(Math.max(0,Math.cos(time*1.37+Math.sin(time*.23)*1.5)),36);
    eyes.forEach(eye=>eye.scale.y=.074*Math.max(.055,(1-blink*.92)*(1-sleep*.95)));
    mouth.scale.y=.012*(1+eat*bite*.5+stretch*reach*2);
    phone.scale.setScalar(Math.max(.001,call));phone.visible=call>.005;
    bamboo.scale.setScalar(Math.max(.001,eat));bamboo.visible=eat>.005;
    toy.visible=play>.005;toy.scale.setScalar(.14*Math.max(.001,play));toy.position.x=.45+Math.sin(elapsed*.9)*.14;toy.rotation.z=-elapsed*.6;
  }};
}

/** Use named clips from a licensed rig without assuming that every activity exists. */
export async function loadPanda(url: string, clips: Partial<Record<Activity,string>>): Promise<Character> {
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const gltf=await new GLTFLoader().loadAsync(url),root=new THREE.Group();root.add(gltf.scene);
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.y)||size.y<=0){disposeObject(root);throw new Error('Panda model has no visible geometry.');}
  gltf.scene.position.set(-center.x,-bounds.min.y,-center.z);root.scale.setScalar(2.15/size.y);
  const mixer=new THREE.AnimationMixer(gltf.scene),actions=new Map<Activity,THREE.AnimationAction>();
  for(const activity of activities){const clip=gltf.animations.find(item=>item.name===(clips[activity]||activity));if(clip)actions.set(activity,mixer.clipAction(clip));}
  if(!actions.has('relaxing')){disposeObject(root);throw new Error('Panda model requires a relaxing/idle clip.');}
  let active:THREE.AnimationAction|undefined;
  return {root,activities:[...actions.keys()],update(activity,_elapsed,weight,_time,_look,dt){
    const action=actions.get(weight<.08?'relaxing':activity)||actions.get('relaxing')!;
    if(action!==active){action.reset().fadeIn(.65).play();active?.fadeOut(.65);active=action;}
    mixer.update(dt);
  },dispose(){mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);disposeObject(root);}};
}
