import { rng } from './choreography';

export interface Slot {
  u: number;
  v: number;
}

const GRID_W = 220;

function pickSlots(alpha: Uint8ClampedArray, w: number, h: number, count: number, seed: number): Slot[] {
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && alpha[(y * w + x) * 4 + 3] > 150;
  const edge: number[] = [];
  const inner: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      const nearEdge =
        !solid(x - 2, y) || !solid(x + 2, y) || !solid(x, y - 2) || !solid(x, y + 2);
      (nearEdge ? edge : inner).push(y * w + x);
    }
  }
  const r = rng(seed);
  const minDist = Math.sqrt((edge.length + inner.length) / count) * 0.62;
  const taken: Slot[] = [];
  const takenPx: [number, number][] = [];
  const tryPick = (pool: number[], want: number, dist: number) => {
    let attempts = 0;
    while (want > 0 && attempts < pool.length * 3 && pool.length) {
      attempts++;
      const idx = pool[Math.floor(r() * pool.length)];
      const x = idx % w, y = Math.floor(idx / w);
      if (takenPx.some(([tx, ty]) => (tx - x) ** 2 + (ty - y) ** 2 < dist * dist)) continue;
      takenPx.push([x, y]);
      taken.push({ u: (x + r()) / w, v: (y + r()) / h });
      want--;
    }
  };
  tryPick(edge, Math.round(count * 0.6), minDist);
  tryPick(inner, count - taken.length, minDist);
  tryPick(edge.concat(inner), count - taken.length, minDist * 0.5);
  return taken;
}

export function sampleImageSlots(img: CanvasImageSource & { width: number; height: number }, count: number, seed = 3): Slot[] {
  const w = GRID_W;
  const h = Math.round((GRID_W * img.height) / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return pickSlots(ctx.getImageData(0, 0, w, h).data, w, h, count, seed);
}

export function samplePathSlots(
  path: string, viewBox: { x: number; y: number; w: number; h: number }, count: number, seed = 5,
): Slot[] {
  const w = GRID_W;
  const h = Math.round((GRID_W * viewBox.h) / viewBox.w);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(w / viewBox.w, h / viewBox.h);
  ctx.translate(-viewBox.x, -viewBox.y);
  ctx.fill(new Path2D(path));
  return pickSlots(ctx.getImageData(0, 0, w, h).data, w, h, count, seed);
}
