// The only per-logo file. The KA body is the real v1 crystal render (a PNG, not a vector trace);
// the hero glyph is a 4-point ruby glint that docks on the tip of the K's upper arm.
import logoUrl from './assets/ka-logo.png';

export const LOGO_VIEWBOX = { x: 0, y: 0, w: 1410, h: 1887 };

export const LOGO_BODY_IMAGE: string = logoUrl;

export const GLYPH_POINTS = 4;
export const GLYPH_INNER = 0.3;

export const LOGO_STAR = { cx: 1152, cy: 22, r: 104 };

function starPath(cx: number, cy: number, r: number): string {
  const n = GLYPH_POINTS * 2;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 - (i * Math.PI) / GLYPH_POINTS;
    const rr = i % 2 === 0 ? r : r * GLYPH_INNER;
    const x = cx + Math.cos(a) * rr;
    const y = cy - Math.sin(a) * rr;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(3)} ${y.toFixed(3)}`;
  }
  return d + 'Z';
}

export const STAR_UNIT_PATH = starPath(0, 0, 1);
export const LOGO_STAR_PATH = starPath(LOGO_STAR.cx, LOGO_STAR.cy, LOGO_STAR.r);
