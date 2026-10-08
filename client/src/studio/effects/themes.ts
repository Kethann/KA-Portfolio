// Themes: a complete look in one tap: font, how the words arrive, the decoration, the palette, a realistic
// background scene, a finish, the letters' 3D material and the camera. Every part stays editable after.
export interface Theme {
  id: string; name: string; group: string; sample: string;
  font: string; typing: string; decoration: string; palette: string; scene: string; finish: string;
  fill?: string; glow?: number; textCase?: 'as-typed' | 'upper'; tracking?: number; speed?: number; density?: number; sceneIntensity?: number; caret?: 'bar' | 'block' | 'underscore' | 'nib' | 'none';
  depth?: number; light?: number; camera?: 'still' | 'drift' | 'dramatic';
  /** which look it opens in (default: 3D when it has a 3D material, 2D when it is flat) */
  look?: '2d' | '3d';
}
export const THEME_GROUPS = ['Cinematic', 'Elements', 'Science & medical', 'Military', 'Space & future', 'Earth & dark', 'Ancient & classic', 'Nature', 'Love & party', 'Retro'];

export const THEMES: Theme[] = [
  { id: 'blockbuster', name: 'Blockbuster', group: 'Cinematic', sample: 'THE LAST\nHORIZON', font: 'Cinzel', typing: 'blur-in', decoration: 'flare', palette: 'cinema', scene: 'cinema', finish: 'cinema', fill: 'gold', textCase: 'upper', tracking: 0.12, glow: 0.15, depth: 0.7, camera: 'drift' },
  { id: 'trailer', name: 'Trailer cut', group: 'Cinematic', sample: 'THIS SUMMER\nEVERYTHING CHANGES', font: 'Bebas Neue', typing: 'rise', decoration: 'none', palette: 'cinema', scene: 'spotlight', finish: 'cinema', fill: 'steel', textCase: 'upper', tracking: 0.08, depth: 0.8, camera: 'dramatic' },
  { id: 'noir', name: 'Film noir', group: 'Cinematic', sample: 'She walked in\nat midnight', font: 'Bodoni Moda', typing: 'typewriter', decoration: 'none', palette: 'noir', scene: 'noir', finish: 'dust', caret: 'block', camera: 'still' },
  { id: 'premiere', name: 'Red-carpet premiere', group: 'Cinematic', sample: 'Premiere\nNight', font: 'Playfair Display', typing: 'blur-in', decoration: 'sparkles', palette: 'royal', scene: 'golddust', finish: 'grain', fill: 'gold', glow: 0.2, depth: 0.55 },

  { id: 'inferno', name: 'Inferno', group: 'Elements', sample: 'FIRE\nWITHIN', font: 'Anton', typing: 'burn', decoration: 'flames', palette: 'inferno', scene: 'fire', finish: 'grain', fill: 'lava', textCase: 'upper', glow: 0.45, density: 0.7, depth: 0.7, camera: 'dramatic' },
  { id: 'molten', name: 'Molten', group: 'Elements', sample: 'Forged', font: 'Archivo Black', typing: 'burn', decoration: 'none', palette: 'inferno', scene: 'lava', finish: 'vignette', fill: 'lava', glow: 0.35, depth: 0.8 },
  { id: 'frozen', name: 'Frozen', group: 'Elements', sample: 'Stay\ncool', font: 'Unbounded', typing: 'blur-in', decoration: 'frost', palette: 'glacier', scene: 'ice', finish: 'vignette', fill: 'ice', glow: 0.25, depth: 0.6 },
  { id: 'snowfall', name: 'Snowfall', group: 'Elements', sample: 'Let it\nsnow', font: 'Playfair Display', typing: 'blur-in', decoration: 'frost', palette: 'glacier', scene: 'snow', finish: 'grain', fill: 'satin', density: 0.75, depth: 0.6, camera: 'drift' },
  { id: 'rain', name: 'Rainy night', group: 'Elements', sample: 'After the\nrain', font: 'Cormorant Garamond', typing: 'ink-bleed', decoration: 'ripples', palette: 'storm', scene: 'rain', finish: 'grain', fill: 'glass', glow: 0.1, depth: 0.5 },
  { id: 'thunder', name: 'Thunderstorm', group: 'Elements', sample: 'STRIKE', font: 'Big Shoulders Display', typing: 'glitch', decoration: 'lightning', palette: 'storm', scene: 'storm', finish: 'vignette', fill: 'chrome', textCase: 'upper', tracking: 0.1, glow: 0.3, depth: 0.8, camera: 'dramatic' },
  { id: 'cool', name: 'Cool breeze', group: 'Elements', sample: 'chill\nvibes', font: 'Outfit', typing: 'wave', decoration: 'sparkles', palette: 'glacier', scene: 'glow', finish: 'none', fill: 'glass', depth: 0.6 },

  { id: 'doctor', name: "Doctor's note", group: 'Science & medical', sample: 'Rest, water\nand a smile', font: 'Homemade Apple', typing: 'handwriting', decoration: 'ecg', palette: 'clinic', scene: 'medical', finish: 'paper', camera: 'still' },
  { id: 'medical', name: 'Medical monitor', group: 'Science & medical', sample: 'VITALS\nSTABLE', font: 'Space Grotesk', typing: 'decode', decoration: 'ecg', palette: 'scrubs', scene: 'medical', finish: 'scanlines', fill: 'neon', textCase: 'upper', tracking: 0.1, glow: 0.5 },
  { id: 'xray', name: 'X-ray lab', group: 'Science & medical', sample: 'Inside out', font: 'Major Mono Display', typing: 'decode', decoration: 'bones', palette: 'glacier', scene: 'xray', finish: 'scanlines', fill: 'glass', glow: 0.4 },

  { id: 'military', name: 'Command', group: 'Military', sample: 'MISSION\nREADY', font: 'Big Shoulders Display', typing: 'stamp', decoration: 'hud', palette: 'army', scene: 'military', finish: 'scanlines', fill: 'steel', textCase: 'upper', tracking: 0.14, depth: 0.7 },
  { id: 'classified', name: 'Classified', group: 'Military', sample: 'TOP SECRET', font: 'Space Mono', typing: 'typewriter', decoration: 'hud', palette: 'army', scene: 'military', finish: 'dust', textCase: 'upper', caret: 'block', fill: 'emboss', camera: 'still' },

  { id: 'space', name: 'Deep space', group: 'Space & future', sample: 'Among the\nstars', font: 'Orbitron', typing: 'decode', decoration: 'constellation', palette: 'cosmos', scene: 'space', finish: 'none', fill: 'chrome', glow: 0.2, tracking: 0.06, depth: 0.7, camera: 'drift' },
  { id: 'future', name: 'Neon future', group: 'Space & future', sample: 'NEXT\nLEVEL', font: 'Audiowide', typing: 'glitch', decoration: 'hud', palette: 'cyber', scene: 'synthwave', finish: 'scanlines', fill: 'chrome', textCase: 'upper', glow: 0.35, depth: 0.8, camera: 'dramatic' },
  { id: 'hacker', name: 'Hacker', group: 'Space & future', sample: 'access granted', font: 'VT323', typing: 'decode', decoration: 'none', palette: 'terminal', scene: 'matrix', finish: 'vhs', glow: 0.6, camera: 'still' },
  { id: 'hologram', name: 'Hologram', group: 'Space & future', sample: 'System\nonline', font: 'Unbounded', typing: 'blur-in', decoration: 'sparkles', palette: 'scrubs', scene: 'hud', finish: 'scanlines', fill: 'glass', glow: 0.6, depth: 0.5 },

  { id: 'underground', name: 'Underground', group: 'Earth & dark', sample: 'Deeper\nstill', font: 'Rubik Wet Paint', typing: 'wave', decoration: 'roots', palette: 'cave', scene: 'underground', finish: 'grain', fill: 'stone', glow: 0.1, depth: 0.7 },
  { id: 'bones', name: 'Bones', group: 'Earth & dark', sample: 'Bare\nbones', font: 'Pirata One', typing: 'stamp', decoration: 'bones', palette: 'crypt', scene: 'crypt', finish: 'dust', fill: 'bone', depth: 0.65 },
  { id: 'horror', name: 'Horror', group: 'Earth & dark', sample: 'Do not\nlook back', font: 'Creepster', typing: 'neon', decoration: 'drips', palette: 'noir', scene: 'crypt', finish: 'vhs', glow: 0.3, camera: 'drift' },

  { id: 'ancient', name: 'Ancient', group: 'Ancient & classic', sample: 'Veni Vidi\nVici', font: 'Cinzel', typing: 'rise', decoration: 'laurel', palette: 'parchment', scene: 'ancient', finish: 'paper', fill: 'carved', textCase: 'upper', tracking: 0.16, depth: 0.7, camera: 'still' },
  { id: 'temple', name: 'Golden temple', group: 'Ancient & classic', sample: 'Eternal', font: 'Italiana', typing: 'blur-in', decoration: 'laurel', palette: 'royal', scene: 'temple', finish: 'grain', fill: 'gold', glow: 0.2, depth: 0.6 },
  { id: 'marble', name: 'Marble hall', group: 'Ancient & classic', sample: 'Legacy', font: 'Cormorant Garamond', typing: 'rise', decoration: 'laurel', palette: 'paper', scene: 'temple', finish: 'vignette', fill: 'marble', textCase: 'upper', tracking: 0.12, depth: 0.7 },
  { id: 'gothic', name: 'Gothic', group: 'Ancient & classic', sample: 'Once upon\na time', font: 'UnifrakturMaguntia', typing: 'ink-bleed', decoration: 'swash', palette: 'parchment', scene: 'ancient', finish: 'paper', camera: 'still' },
  { id: 'calligraphy', name: 'Calligraphy', group: 'Ancient & classic', sample: 'With love,\nalways', font: 'Pinyon Script', typing: 'handwriting', decoration: 'swash', palette: 'paper', scene: 'ancient', finish: 'paper', camera: 'still' },

  { id: 'garden', name: 'Floral garden', group: 'Nature', sample: 'Bloom where\nyou are planted', font: 'Playfair Display', typing: 'typewriter', decoration: 'floral', palette: 'rose-noir', scene: 'glow', finish: 'none', camera: 'drift' },
  { id: 'forest', name: 'Firefly forest', group: 'Nature', sample: 'into the\nwoods', font: 'Amatic SC', typing: 'handwriting', decoration: 'butterflies', palette: 'forest', scene: 'forest', finish: 'vignette', glow: 0.3 },
  { id: 'aurora', name: 'Aurora', group: 'Nature', sample: 'Northern\nlights', font: 'Syne', typing: 'blur-in', decoration: 'sparkles', palette: 'cosmos', scene: 'aurora', finish: 'none', fill: 'glass', glow: 0.3, depth: 0.5 },
  { id: 'sunset', name: 'Golden hour', group: 'Nature', sample: 'Golden\nhour', font: 'DM Serif Display', typing: 'ink-bleed', decoration: 'none', palette: 'butter', scene: 'clouds', finish: 'leak', fill: 'rosegold', depth: 0.6 },
  { id: 'sakura', name: 'Sakura', group: 'Nature', sample: 'Spring\nagain', font: 'Italiana', typing: 'ink-bleed', decoration: 'petals', palette: 'sakura', scene: 'sakura', finish: 'paper' },
  { id: 'ocean', name: 'Ocean', group: 'Nature', sample: 'Sea you\nsoon', font: 'Pacifico', typing: 'wave', decoration: 'ripples', palette: 'ocean', scene: 'ocean', finish: 'none', fill: 'glass', glow: 0.2, depth: 0.6 },

  { id: 'love', name: 'Love letter', group: 'Love & party', sample: 'You & me', font: 'Great Vibes', typing: 'handwriting', decoration: 'hearts', palette: 'valentine', scene: 'hearts', finish: 'leak', glow: 0.4 },
  { id: 'balloon', name: 'Balloons', group: 'Love & party', sample: 'YAY!', font: 'Bungee', typing: 'wave', decoration: 'confetti', palette: 'party', scene: 'party', finish: 'none', fill: 'foil', depth: 0.7, camera: 'dramatic' },
  { id: 'party', name: 'Party', group: 'Love & party', sample: "LET'S\nPARTY!", font: 'Bungee', typing: 'stamp', decoration: 'confetti', palette: 'party', scene: 'party', finish: 'none', fill: 'candy', depth: 0.6 },
  { id: 'birthday', name: 'Birthday', group: 'Love & party', sample: 'Happy\nBirthday!', font: 'Shrikhand', typing: 'wave', decoration: 'confetti', palette: 'valentine', scene: 'golddust', finish: 'none', fill: 'foil', depth: 0.6 },
  { id: 'doodle', name: 'Doodle', group: 'Love & party', sample: 'big idea!', font: 'Gloria Hallelujah', typing: 'handwriting', decoration: 'doodles', palette: 'paper', scene: 'plain', finish: 'paper', camera: 'still' },

  { id: 'arcade', name: 'Arcade', group: 'Retro', sample: 'GAME OVER', font: 'Press Start 2P', typing: 'typewriter', decoration: 'sparkles', palette: 'arcade', scene: 'arcade', finish: 'scanlines', caret: 'block', fill: 'extrude', depth: 0.8 },
  { id: 'vhs', name: 'VHS 1989', group: 'Retro', sample: 'Rewind', font: 'Monoton', typing: 'neon', decoration: 'none', palette: 'cyber', scene: 'synthwave', finish: 'vhs', glow: 0.8 },
  { id: 'neonsign', name: 'Neon sign', group: 'Retro', sample: 'Open late', font: 'Yellowtail', typing: 'neon', decoration: 'none', palette: 'cyber', scene: 'noir', finish: 'grain', fill: 'neon', glow: 0.8, camera: 'drift' },
  { id: 'comic', name: 'Comic pop', group: 'Retro', sample: 'POW!', font: 'Bungee Shade', typing: 'stamp', decoration: 'doodles', palette: 'tomato', scene: 'plain', finish: 'halftone', fill: 'extrude', depth: 0.9 },
  { id: 'smoke', name: 'Smoke show', group: 'Retro', sample: 'Midnight\nsession', font: 'Syne', typing: 'blur-in', decoration: 'none', palette: 'orchid', scene: 'smoke', finish: 'grain', fill: 'candy', depth: 0.55 },
];
