// Classic typewriter: letters appear one at a time behind a caret, with human timing (40–120 ms), longer pauses
// after spaces and punctuation, and an optional typo that gets backspaced.
import { between } from '../rng';
import type { Effect } from '../types';

export const typewriter: Effect = {
  id: 'typewriter', name: 'Classic typewriter', description: 'Letter by letter behind a blinking caret, with human timing.', duration: 2.4,
  params: [{ id: 'typo', name: 'Make a typo', type: 'toggle', value: true }],
  init(ctx){ for (const c of ctx.chars) c.el.style.opacity = '0'; },
  play(tl, ctx, params){
    const r = ctx.rng, sp = Math.max(0.25, ctx.speed);
    const caret = ctx.stage.querySelector<HTMLElement>('.fx-caret');
    const sr = ctx.stage.getBoundingClientRect();
    let t = 0.35;
    const typoAt = params.typo !== false && ctx.chars.length > 6 ? Math.floor(between(r, ctx.chars.length * 0.35, ctx.chars.length * 0.7)) : -1;
    tl.set(ctx.chars.map(c => c.el), { opacity: 0 }, 0);
    if (caret && ctx.chars[0]){ const f = ctx.chars[0].rect; tl.set(caret, { opacity: 1, x: f.left - sr.left, y: f.top - sr.top, height: f.height }, 0); }
    ctx.chars.forEach((c, i) => {
      if (i === typoAt){
        // a wrong letter in the same spot, a beat, then a backspace
        const wrong = document.createElement('span');
        wrong.className = 'fx-typo'; wrong.setAttribute('aria-hidden', 'true');
        wrong.textContent = 'qwertyuiopasdfghjklzxcvbnm'[Math.floor(r() * 26)];
        Object.assign(wrong.style, { left: c.rect.left - sr.left + 'px', top: c.rect.top - sr.top + 'px', opacity: '0', font: getComputedStyle(ctx.textEl).font });
        ctx.stage.appendChild(wrong);
        tl.set(wrong, { opacity: 1 }, t);
        if (caret) tl.set(caret, { x: c.rect.right - sr.left }, t);
        t += between(r, 0.28, 0.42) / sp;
        tl.set(wrong, { opacity: 0 }, t);
        if (caret) tl.set(caret, { x: c.rect.left - sr.left }, t);
        t += between(r, 0.12, 0.2) / sp;
      }
      tl.set(c.el, { opacity: 1 }, t);
      if (caret) tl.set(caret, { x: c.rect.right - sr.left, y: c.rect.top - sr.top, height: c.rect.height }, t);
      ctx.revealAt(i, t);
      const next = ctx.chars[i + 1];
      let d = between(r, 0.04, 0.12);
      if (next && (next.word !== c.word || next.line !== c.line)) d += between(r, 0.12, 0.22);   // a space between words
      if (/[.,!?;:]/.test(c.char)) d += between(r, 0.26, 0.42);
      t += d / sp;
    });
    return t;
  },
  reset(ctx){ ctx.stage.querySelectorAll('.fx-typo').forEach(n => n.remove()); },
};
