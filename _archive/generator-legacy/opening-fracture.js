// Split the oversized source-logo sprite into a deterministic Voronoi mosaic.
// Cells tile its original plane exactly: no new image, duplicate mesh, or lost texture.
function fractureOpeningCore(){
  if (MANIFEST.shards.some(s => s.openingCore)) return;
  const ranked = MANIFEST.shards.slice().sort((a,b) => b.atlas.w*b.atlas.h - a.atlas.w*a.atlas.h);
  const parent = ranked[0];
  if (!parent || ranked.length < 2 || parent.atlas.w*parent.atlas.h < ranked[1].atlas.w*ranked[1].atlas.h*4) return;
  const w = parent.atlas.w, h = parent.atlas.h;
  const seeds = [];
  for (let row=0; row<5; row++) for (let col=0; col<4; col++){
    const k = row*4+col;
    seeds.push({x:(col+0.5+Math.sin(k*2.4)*0.22)*w/4,
                y:(row+0.5+Math.cos(k*1.7)*0.22)*h/5});
  }
  const cells = seeds.map((seed, index) => {
    let poly = [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
    seeds.forEach((other, j) => {
      if (j === index) return;
      const nx=other.x-seed.x, ny=other.y-seed.y;
      const limit=(other.x*other.x+other.y*other.y-seed.x*seed.x-seed.y*seed.y)/2;
      const clipped=[];
      poly.forEach((a,i) => {
        const b=poly[(i+1)%poly.length];
        const da=a.x*nx+a.y*ny-limit, db=b.x*nx+b.y*ny-limit;
        if (da<=0) clipped.push(a);
        if ((da<=0)!==(db<=0)){
          const t=da/(da-db);
          clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
        }
      });
      poly=clipped;
    });
    const x=Math.min(...poly.map(p=>p.x)), y=Math.min(...poly.map(p=>p.y));
    const cw=Math.max(...poly.map(p=>p.x))-x, ch=Math.max(...poly.map(p=>p.y))-y;
    return {...parent, id:`${parent.id}_fracture_${index}`, parent_id:parent.id,
      openingCore:true,
      fracturePolygon:poly.map(p=>({x:(p.x-x)/cw-0.5,y:0.5-(p.y-y)/ch})),
      atlas:{x:parent.atlas.x+x,y:parent.atlas.y+y,w:cw,h:ch},
      target:{x:parent.target.x+x,y:parent.target.y+y}, size:{w:cw,h:ch},
      landedWorld:{x:parent.landedWorld.x+(x+cw/2-w/2)*SCALE_X,
                   y:parent.landedWorld.y-(y+ch/2-h/2)*SCALE_Y}};
  });
  MANIFEST.shards=MANIFEST.shards.flatMap(s=>s===parent?cells:[s]);
}

function fractureGeometry(s, base){
  if (!s.fracturePolygon) return base.clone();
  const shape=new THREE.Shape(s.fracturePolygon.map(p=>new THREE.Vector2(p.x,p.y)));
  const geometry=new THREE.ShapeGeometry(shape);
  const pos=geometry.attributes.position, uv=geometry.attributes.uv;
  for (let i=0;i<pos.count;i++) uv.setXY(i,pos.getX(i)+0.5,pos.getY(i)+0.5);
  return geometry;
}

// Keep the same live drift as a piece starts flying, then smoothly remove it.
// Both displacement and its velocity reach zero before the final contact.
function openingDrift(s, ts){
  const p=ts*s.posFreq+s.driftSeed, r=ts*s.rotFreq+s.driftSeed*1.7;
  return {x:Math.sin(p)*13,y:Math.cos(p*0.8)*9.1,z:Math.sin(p*0.6)*6.5,
          roll:Math.sin(r)*s.rotAmp};
}
