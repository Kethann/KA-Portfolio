// Small, self-cleaning confetti burst (loaded only when a payment succeeds). One canvas, ~90
// pieces, ~1.6 s, then everything is removed. Skipped entirely under reduced motion.
export function burst(host: HTMLElement, origin: { x: number; y: number }){
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  Object.assign(c.style, { position: 'fixed', inset: '0', width: w + 'px', height: h + 'px', pointerEvents: 'none', zIndex: '5' });
  c.setAttribute('aria-hidden', 'true');
  host.appendChild(c);
  const x = c.getContext('2d');
  if (!x){ c.remove(); return; }
  x.scale(dpr, dpr);
  const colors = ['#ffb37a', '#ff9438', '#ffe0c2', '#8fe0a8', '#c9a4ff', '#ffffff'];
  const n = 90, P = new Float32Array(n * 7);   // x, y, vx, vy, rot, vr, size
  for (let i = 0; i < n; i++){
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = 5 + Math.random() * 8, o = i * 7;
    P[o] = origin.x; P[o + 1] = origin.y; P[o + 2] = Math.cos(a) * s; P[o + 3] = Math.sin(a) * s;
    P[o + 4] = Math.random() * 6.28; P[o + 5] = (Math.random() - 0.5) * 0.4; P[o + 6] = 4 + Math.random() * 5;
  }
  const t0 = performance.now(), dur = 1600;
  const frame = (t: number) => {
    const k = (t - t0) / dur;
    x.clearRect(0, 0, w, h);
    if (k >= 1){ c.remove(); return; }
    x.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    for (let i = 0; i < n; i++){
      const o = i * 7;
      P[o + 2] *= 0.985; P[o + 3] = P[o + 3] * 0.985 + 0.32;
      P[o] += P[o + 2]; P[o + 1] += P[o + 3]; P[o + 4] += P[o + 5];
      x.save(); x.translate(P[o], P[o + 1]); x.rotate(P[o + 4]);
      x.fillStyle = colors[i % colors.length];
      x.fillRect(-P[o + 6] / 2, -P[o + 6] / 4, P[o + 6], P[o + 6] / 2);
      x.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
