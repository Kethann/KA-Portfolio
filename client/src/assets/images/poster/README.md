# Motion-art source library

Created with the built-in image-generation tool; originals copied into this project without image editing. No supplied reference was used as a background.

- material-atlas.png: nine distinct isolated gestures in a 3×3 transparent atlas: dry ivory bristles, copper wet stroke, blue broken calligraphy; slate branching ink, amber diffusion, plum feathering; scraped impasto, layered gouache, fine splatter.
- brush.png: standalone copper dry brush gesture.
- ink.png: standalone branching slate watercolor bloom.
- paint.png: standalone charcoal, ivory and terracotta palette-knife paint.

Actual output is 1254×1254 pixels per file, despite requesting larger native output. The nine atlas cells are 418 pixels each. The current full-screen shader uses the three standalone textures, sampling them at broad and fine scales; the atlas is retained as source artwork but is no longer loaded. These are not native 4K originals. PNG alpha is preserved. The three active files total approximately 5.3 MB before HTTP transfer; they load after the logo sequence and are cached by hashed Vite URLs.

## Prompt set

Atlas: production texture atlas for a premium dark creative portfolio motion-art background; actual transparent alpha, no backdrop/checkerboard/text; exact 3×3 grid with isolated generous margins. Nine separate authentic scanned pigment gestures: ivory dry bristle sweep, antique copper wet curved stroke, smoky blue calligraphic brush; slate branching ink, dusty amber diffusion, muted plum feathery bloom; ivory/charcoal scraped impasto, copper/stone gouache scumble, blue-gray/ivory splatter. Rich microdetail, muted pigments, no objects, borders, glow or gradient blobs. Requested 4096×4096 if supported.

Standalone shared prompt: production source artwork for premium procedural motion art; actual transparent background with alpha, no solid backdrop or checkerboard; highest native resolution, 2048×2048 or larger if supported; isolate the complete gesture centered with 10% transparent margins; photographed/scanned authentic pigment texture with crisp fine material detail and sophisticated muted color; no text, frame, logos, objects, glow or gradient blobs; single texture asset, not a website mockup.

Brush subject: one expressive long diagonal dry brush stroke, curved copper pigment across warm ivory with broken bristle edges, abundant negative gaps and tiny pigment flecks.

Ink subject: one intricate slate blue ink bloom, irregular branching tendrils and smoky watercolor diffusion with transparent gaps and tiny isolated satellites.

Paint subject: one asymmetrical palette-knife smear of charcoal, warm ivory and muted terracotta gouache and acrylic, rich scraped physical ridges, fragmented feathered margins and irregular gaps.
