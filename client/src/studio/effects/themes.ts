// Themes: a complete look in one tap: font, how the words arrive, the decoration, the palette, an animated
// background scene, a finish and text styling. Picking one fills in every control, and each stays editable after.
export interface Theme {
  id: string; name: string; group: string; sample: string;
  font: string; typing: string; decoration: string; palette: string; scene: string; finish: string;
  fill?: string; glow?: number; textCase?: 'as-typed' | 'upper'; tracking?: number; speed?: number; density?: number; sceneIntensity?: number; caret?: 'bar' | 'block' | 'underscore' | 'nib' | 'none';
}
export const THEME_GROUPS = ['Cinematic', 'Elements', 'Science & medical', 'Military', 'Space & future', 'Earth & dark', 'Ancient & classic', 'Nature', 'Love & party', 'Retro'];

export const THEMES: Theme[] = [
  { id: 'blockbuster', name: 'Blockbuster', group: 'Cinematic', sample: 'THE LAST\nHORIZON', font: 'Cinzel', typing: 'blur-in', decoration: 'flare', palette: 'cinema', scene: 'cinema', finish: 'cinema', fill: 'metal-gold', textCase: 'upper', tracking: 0.12, glow: 0.3 },
  { id: 'trailer', name: 'Trailer cut', group: 'Cinematic', sample: 'THIS SUMMER\nEVERYTHING CHANGES', font: 'Bebas Neue', typing: 'rise', decoration: 'none', palette: 'cinema', scene: 'spotlight', finish: 'cinema', textCase: 'upper', tracking: 0.08 },
  { id: 'noir', name: 'Film noir', group: 'Cinematic', sample: 'She walked in\nat midnight', font: 'Bodoni Moda', typing: 'typewriter', decoration: 'none', palette: 'noir', scene: 'noir', finish: 'dust', caret: 'block' },
  { id: 'premiere', name: 'Red-carpet premiere', group: 'Cinematic', sample: 'Premiere\nNight', font: 'Playfair Display', typing: 'blur-in', decoration: 'sparkles', palette: 'royal', scene: 'spotlight', finish: 'grain', fill: 'metal-gold', glow: 0.4 },

  { id: 'inferno', name: 'Inferno', group: 'Elements', sample: 'FIRE\nWITHIN', font: 'Anton', typing: 'burn', decoration: 'flames', palette: 'inferno', scene: 'fire', finish: 'grain', fill: 'fire', textCase: 'upper', glow: 0.6, density: 0.7 },
  { id: 'frozen', name: 'Frozen', group: 'Elements', sample: 'Stay\ncool', font: 'Unbounded', typing: 'blur-in', decoration: 'frost', palette: 'glacier', scene: 'ice', finish: 'vignette', fill: 'ice', glow: 0.5 },
  { id: 'rain', name: 'Rainy night', group: 'Elements', sample: 'After the\nrain', font: 'Cormorant Garamond', typing: 'ink-bleed', decoration: 'ripples', palette: 'storm', scene: 'rain', finish: 'grain', glow: 0.2 },
  { id: 'thunder', name: 'Thunderstorm', group: 'Elements', sample: 'STRIKE', font: 'Big Shoulders Display', typing: 'glitch', decoration: 'lightning', palette: 'storm', scene: 'storm', finish: 'vignette', textCase: 'upper', tracking: 0.1, glow: 0.5 },
  { id: 'cool', name: 'Cool breeze', group: 'Elements', sample: 'chill\nvibes', font: 'Outfit', typing: 'wave', decoration: 'sparkles', palette: 'glacier', scene: 'glow', finish: 'none', fill: 'gradient' },

  { id: 'doctor', name: "Doctor's note", group: 'Science & medical', sample: 'Rest, water\nand a smile', font: 'Homemade Apple', typing: 'handwriting', decoration: 'ecg', palette: 'clinic', scene: 'medical', finish: 'paper' },
  { id: 'medical', name: 'Medical monitor', group: 'Science & medical', sample: 'VITALS\nSTABLE', font: 'Space Grotesk', typing: 'decode', decoration: 'ecg', palette: 'scrubs', scene: 'medical', finish: 'scanlines', textCase: 'upper', tracking: 0.1, glow: 0.4 },
  { id: 'xray', name: 'X-ray lab', group: 'Science & medical', sample: 'Inside out', font: 'Major Mono Display', typing: 'decode', decoration: 'bones', palette: 'glacier', scene: 'xray', finish: 'scanlines', glow: 0.5 },

  { id: 'military', name: 'Command', group: 'Military', sample: 'MISSION\nREADY', font: 'Big Shoulders Display', typing: 'stamp', decoration: 'hud', palette: 'army', scene: 'military', finish: 'scanlines', textCase: 'upper', tracking: 0.14 },
  { id: 'classified', name: 'Classified', group: 'Military', sample: 'TOP SECRET', font: 'Space Mono', typing: 'typewriter', decoration: 'hud', palette: 'army', scene: 'military', finish: 'dust', textCase: 'upper', caret: 'block' },

  { id: 'space', name: 'Deep space', group: 'Space & future', sample: 'Among the\nstars', font: 'Orbitron', typing: 'decode', decoration: 'constellation', palette: 'cosmos', scene: 'space', finish: 'none', glow: 0.5, tracking: 0.06 },
  { id: 'future', name: 'Neon future', group: 'Space & future', sample: 'NEXT\nLEVEL', font: 'Audiowide', typing: 'glitch', decoration: 'hud', palette: 'cyber', scene: 'synthwave', finish: 'scanlines', fill: 'gradient', textCase: 'upper', glow: 0.7 },
  { id: 'hacker', name: 'Hacker', group: 'Space & future', sample: 'access granted', font: 'VT323', typing: 'decode', decoration: 'none', palette: 'terminal', scene: 'matrix', finish: 'vhs', glow: 0.6 },
  { id: 'hologram', name: 'Hologram', group: 'Space & future', sample: 'System\nonline', font: 'Unbounded', typing: 'blur-in', decoration: 'sparkles', palette: 'scrubs', scene: 'hud', finish: 'scanlines', fill: 'outline-glow', glow: 0.8 },

  { id: 'underground', name: 'Underground', group: 'Earth & dark', sample: 'Deeper\nstill', font: 'Rubik Wet Paint', typing: 'wave', decoration: 'roots', palette: 'cave', scene: 'underground', finish: 'grain', glow: 0.3 },
  { id: 'bones', name: 'Bones', group: 'Earth & dark', sample: 'Bare\nbones', font: 'Pirata One', typing: 'stamp', decoration: 'bones', palette: 'crypt', scene: 'crypt', finish: 'dust' },
  { id: 'horror', name: 'Horror', group: 'Earth & dark', sample: 'Do not\nlook back', font: 'Creepster', typing: 'neon', decoration: 'drips', palette: 'noir', scene: 'crypt', finish: 'vhs', glow: 0.3 },

  { id: 'ancient', name: 'Ancient', group: 'Ancient & classic', sample: 'Veni Vidi\nVici', font: 'Cinzel', typing: 'rise', decoration: 'laurel', palette: 'parchment', scene: 'ancient', finish: 'paper', textCase: 'upper', tracking: 0.16 },
  { id: 'temple', name: 'Golden temple', group: 'Ancient & classic', sample: 'Eternal', font: 'Italiana', typing: 'blur-in', decoration: 'laurel', palette: 'royal', scene: 'temple', finish: 'grain', fill: 'metal-gold', glow: 0.4 },
  { id: 'gothic', name: 'Gothic', group: 'Ancient & classic', sample: 'Once upon\na time', font: 'UnifrakturMaguntia', typing: 'ink-bleed', decoration: 'swash', palette: 'parchment', scene: 'ancient', finish: 'paper' },
  { id: 'calligraphy', name: 'Calligraphy', group: 'Ancient & classic', sample: 'With love,\nalways', font: 'Pinyon Script', typing: 'handwriting', decoration: 'swash', palette: 'paper', scene: 'plain', finish: 'paper' },

  { id: 'garden', name: 'Floral garden', group: 'Nature', sample: 'Bloom where\nyou are planted', font: 'Playfair Display', typing: 'typewriter', decoration: 'floral', palette: 'rose-noir', scene: 'glow', finish: 'none' },
  { id: 'forest', name: 'Firefly forest', group: 'Nature', sample: 'into the\nwoods', font: 'Amatic SC', typing: 'handwriting', decoration: 'butterflies', palette: 'forest', scene: 'forest', finish: 'vignette', glow: 0.3 },
  { id: 'sakura', name: 'Sakura', group: 'Nature', sample: 'Spring\nagain', font: 'Italiana', typing: 'ink-bleed', decoration: 'petals', palette: 'sakura', scene: 'sakura', finish: 'paper' },
  { id: 'ocean', name: 'Ocean', group: 'Nature', sample: 'Sea you\nsoon', font: 'Pacifico', typing: 'wave', decoration: 'ripples', palette: 'ocean', scene: 'ocean', finish: 'none', glow: 0.3 },

  { id: 'love', name: 'Love letter', group: 'Love & party', sample: 'You & me', font: 'Great Vibes', typing: 'handwriting', decoration: 'hearts', palette: 'valentine', scene: 'hearts', finish: 'leak', glow: 0.4 },
  { id: 'party', name: 'Party', group: 'Love & party', sample: "LET'S\nPARTY!", font: 'Bungee', typing: 'stamp', decoration: 'confetti', palette: 'party', scene: 'party', finish: 'none', fill: 'gradient' },
  { id: 'birthday', name: 'Birthday', group: 'Love & party', sample: 'Happy\nBirthday!', font: 'Shrikhand', typing: 'wave', decoration: 'confetti', palette: 'butter', scene: 'party', finish: 'none' },
  { id: 'doodle', name: 'Doodle', group: 'Love & party', sample: 'big idea!', font: 'Gloria Hallelujah', typing: 'handwriting', decoration: 'doodles', palette: 'paper', scene: 'plain', finish: 'paper' },

  { id: 'arcade', name: 'Arcade', group: 'Retro', sample: 'GAME OVER', font: 'Press Start 2P', typing: 'typewriter', decoration: 'sparkles', palette: 'arcade', scene: 'arcade', finish: 'scanlines', caret: 'block', glow: 0.5 },
  { id: 'vhs', name: 'VHS 1989', group: 'Retro', sample: 'Rewind', font: 'Monoton', typing: 'neon', decoration: 'none', palette: 'cyber', scene: 'synthwave', finish: 'vhs', glow: 0.8 },
  { id: 'neonsign', name: 'Neon sign', group: 'Retro', sample: 'Open late', font: 'Yellowtail', typing: 'neon', decoration: 'none', palette: 'cyber', scene: 'noir', finish: 'grain', fill: 'outline-glow', glow: 1 },
  { id: 'comic', name: 'Comic pop', group: 'Retro', sample: 'POW!', font: 'Bungee Shade', typing: 'stamp', decoration: 'doodles', palette: 'tomato', scene: 'plain', finish: 'halftone' },
];

export const FILLS = [
  { id: 'solid', name: 'Solid' }, { id: 'gradient', name: 'Gradient' }, { id: 'outline', name: 'Outline' }, { id: 'outline-glow', name: 'Neon tube' },
  { id: 'metal-gold', name: 'Gold foil' }, { id: 'chrome', name: 'Chrome' }, { id: 'fire', name: 'Fire' }, { id: 'ice', name: 'Ice' },
];
