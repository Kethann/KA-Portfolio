// 3D letter materials: the list the studio offers. They are rendered live on the GPU (gpu/renderer.ts, gpu/shaders.ts):
// a bevelled surface from the glyph's distance field, real side walls, a soft shadow and reflections that move with the camera.

export interface Material { id: string; name: string; shaded: boolean }
export const MATERIALS: Material[] = [
  { id: 'solid', name: 'Flat colour', shaded: false }, { id: 'gradient', name: 'Gradient', shaded: false }, { id: 'outline', name: 'Outline', shaded: false },
  { id: 'chrome', name: 'Chrome 3D', shaded: true }, { id: 'gold', name: 'Gold 3D', shaded: true }, { id: 'rosegold', name: 'Rose gold 3D', shaded: true },
  { id: 'steel', name: 'Brushed steel 3D', shaded: true }, { id: 'glass', name: 'Glass 3D', shaded: true }, { id: 'ice', name: 'Ice 3D', shaded: true },
  { id: 'neon', name: 'Neon tube 3D', shaded: true }, { id: 'lava', name: 'Lava 3D', shaded: true }, { id: 'stone', name: 'Stone 3D', shaded: true },
  { id: 'carved', name: 'Carved stone', shaded: true }, { id: 'marble', name: 'Marble 3D', shaded: true }, { id: 'bone', name: 'Bone 3D', shaded: true },
  { id: 'candy', name: 'Glossy candy 3D', shaded: true }, { id: 'foil', name: 'Foil balloon 3D', shaded: true }, { id: 'extrude', name: 'Block extrude 3D', shaded: true },
  { id: 'emboss', name: 'Letterpress', shaded: true }, { id: 'satin', name: 'Satin 3D', shaded: true },
];
/** old fill names from earlier versions → today's materials */
export const LEGACY_FILL: Record<string, string> = { 'metal-gold': 'gold', fire: 'lava', 'outline-glow': 'neon' };
export const isShaded = (id: string) => !!MATERIALS.find(m => m.id === (LEGACY_FILL[id] || id))?.shaded;
