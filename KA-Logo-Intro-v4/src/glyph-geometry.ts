import * as THREE from 'three';

// Faceted "stamped ornament" glyph: an outline ring at z=0, a raised mid ring and front/back apexes.
// Non-indexed so every facet keeps its own flat normal. Circumradius 1, tip pointing +Y.
export function createGlyphGeometry(points: number, inner: number, depth = 0.34): THREE.BufferGeometry {
  const n = points * 2;
  const outer: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 - (i * Math.PI) / points;
    const r = i % 2 === 0 ? 1 : inner;
    outer.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);

  for (const side of [1, -1]) {
    const apex = new THREE.Vector3(0, 0, depth * side);
    const mid = outer.map((p) => p.clone().multiplyScalar(0.46).setZ(depth * 0.64 * side));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [o0, o1, m0, m1] = [outer[i], outer[j], mid[i], mid[j]];
      if (side < 0) {
        tri(o0, o1, m1);
        tri(o0, m1, m0);
        tri(m0, m1, apex);
      } else {
        tri(o1, o0, m0);
        tri(o1, m0, m1);
        tri(m1, m0, apex);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
