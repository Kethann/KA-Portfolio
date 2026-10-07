// The font library: one list shared by the Typography studio, the Creator Portal (site fonts, pass card) and the
// server (which fonts a saved site may use). Every font is a free Google Font; `axes` is its css2 spec, so a page
// loads exactly the weights it has. The homepage keeps an identical name -> axes map inline (KA_FONT_AXES) so it can
// load a chosen font on first paint; tests/fonts.test.mjs keeps the two in step.
export const FONT_GROUPS = [
  { id: 'script', label: 'Script & calligraphy' },
  { id: 'hand', label: 'Handwriting & marker' },
  { id: 'serif', label: 'Serif & editorial' },
  { id: 'sans', label: 'Sans & grotesk' },
  { id: 'display', label: 'Display & poster' },
  { id: 'deco', label: 'Decorative & experimental' },
  { id: 'mono', label: 'Pixel & mono' },
];

const F = (name, group, axes, fallback) => ({ name, group, axes, fallback });
export const FONT_LIBRARY = [
  F('Great Vibes', 'script', '', 'cursive'), F('Sacramento', 'script', '', 'cursive'), F('Satisfy', 'script', '', 'cursive'),
  F('Dancing Script', 'script', 'wght@400..700', 'cursive'), F('Pacifico', 'script', '', 'cursive'), F('Parisienne', 'script', '', 'cursive'),
  F('Allura', 'script', '', 'cursive'), F('Pinyon Script', 'script', '', 'cursive'), F('Yellowtail', 'script', '', 'cursive'),
  F('Alex Brush', 'script', '', 'cursive'), F('Mrs Saint Delafield', 'script', '', 'cursive'), F('Monsieur La Doulaise', 'script', '', 'cursive'),

  F('Caveat', 'hand', 'wght@400..700', 'cursive'), F('Kalam', 'hand', 'wght@400;700', 'cursive'), F('Shadows Into Light', 'hand', '', 'cursive'),
  F('Permanent Marker', 'hand', '', 'cursive'), F('Amatic SC', 'hand', 'wght@400;700', 'cursive'), F('Homemade Apple', 'hand', '', 'cursive'),
  F('Rock Salt', 'hand', '', 'cursive'), F('Reenie Beanie', 'hand', '', 'cursive'), F('Gloria Hallelujah', 'hand', '', 'cursive'),
  F('Indie Flower', 'hand', '', 'cursive'), F('Nanum Pen Script', 'hand', '', 'cursive'),

  F('Fraunces', 'serif', 'opsz,wght@9..144,300..900', 'serif'), F('Playfair Display', 'serif', 'wght@400..900', 'serif'),
  F('Cormorant Garamond', 'serif', 'wght@400;600;700', 'serif'), F('DM Serif Display', 'serif', '', 'serif'),
  F('Bodoni Moda', 'serif', 'opsz,wght@6..96,400..900', 'serif'), F('Cinzel', 'serif', 'wght@400..900', 'serif'),
  F('Abril Fatface', 'serif', '', 'serif'), F('Yeseva One', 'serif', '', 'serif'), F('Italiana', 'serif', '', 'serif'), F('Prata', 'serif', '', 'serif'),

  F('Manrope', 'sans', 'wght@300..800', 'sans-serif'), F('Sora', 'sans', 'wght@300..800', 'sans-serif'),
  F('Poppins', 'sans', 'wght@400;500;600;700;800', 'sans-serif'), F('Space Grotesk', 'sans', 'wght@300..700', 'sans-serif'),
  F('Outfit', 'sans', 'wght@300..800', 'sans-serif'), F('Syne', 'sans', 'wght@400..800', 'sans-serif'), F('Unbounded', 'sans', 'wght@300..900', 'sans-serif'),
  F('Bricolage Grotesque', 'sans', 'wght@300..800', 'sans-serif'), F('Archivo Black', 'sans', '', 'sans-serif'),

  F('Bebas Neue', 'display', '', 'sans-serif'), F('Anton', 'display', '', 'sans-serif'), F('Oswald', 'display', 'wght@300..700', 'sans-serif'),
  F('Big Shoulders Display', 'display', 'wght@400..900', 'sans-serif'), F('Righteous', 'display', '', 'sans-serif'), F('Lobster', 'display', '', 'cursive'),
  F('Shrikhand', 'display', '', 'cursive'), F('Bungee', 'display', '', 'sans-serif'), F('Audiowide', 'display', '', 'sans-serif'),
  F('Orbitron', 'display', 'wght@400..900', 'sans-serif'),

  F('Monoton', 'deco', '', 'sans-serif'), F('Bungee Shade', 'deco', '', 'sans-serif'), F('Bungee Spice', 'deco', '', 'sans-serif'),
  F('Nabla', 'deco', '', 'sans-serif'), F('Rubik Glitch', 'deco', '', 'sans-serif'), F('Rubik Wet Paint', 'deco', '', 'sans-serif'),
  F('Fascinate', 'deco', '', 'cursive'), F('Faster One', 'deco', '', 'sans-serif'), F('Creepster', 'deco', '', 'cursive'),
  F('Pirata One', 'deco', '', 'serif'), F('UnifrakturMaguntia', 'deco', '', 'serif'),

  F('Press Start 2P', 'mono', '', 'monospace'), F('Silkscreen', 'mono', 'wght@400;700', 'monospace'), F('VT323', 'mono', '', 'monospace'),
  F('Major Mono Display', 'mono', '', 'monospace'), F('Space Mono', 'mono', 'wght@400;700', 'monospace'), F('JetBrains Mono', 'mono', 'wght@400..700', 'monospace'),
];

/** names a saved site may use (plus uploaded fonts) */
export const FONT_NAMES = [...FONT_LIBRARY.map(f => f.name), 'system-ui'];

/** a CSS font-family stack for a name ('system-ui' and uploaded fonts pass through) */
export function fontStack(name){
  const f = FONT_LIBRARY.find(x => x.name === name);
  return f ? `'${f.name}', ${f.fallback}` : name === 'system-ui' ? 'system-ui' : `'${name}', system-ui`;
}

/** one Google Fonts css2 URL for these library names (others are skipped); '' when there is nothing to load */
export function googleFontsUrl(names){
  const fams = [...new Set(names)].map(n => FONT_LIBRARY.find(f => f.name === n)).filter(Boolean)
    .map(f => 'family=' + f.name.replace(/ /g, '+') + (f.axes ? ':' + f.axes : ''));
  return fams.length ? 'https://fonts.googleapis.com/css2?' + fams.join('&') + '&display=swap' : '';
}
