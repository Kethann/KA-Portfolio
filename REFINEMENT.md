# Portfolio refinement

The public application remains `index.html`, served by Express. Its existing Three.js r128 crystal scene, vanilla navigation/chat, and lazy React gallery are preserved. The older Python cinematic generator is unchanged. Pre-existing homepage navigation and artwork-reflection edits were retained.

## Character

`client/src/panda.ts` is a separate lazy Vite entry sharing the gallery's installed Three.js module. The default character is original procedural 3D geometry: articulated limbs, dimensional muzzle/eye patches, physical materials, fine silhouette fur and telephone/bamboo/toy props. It uses no external character artwork or new dependency. It is a designed procedural character, not a scanned or artist-authored photorealistic rig; visual equivalence to the requested reference cannot be asserted. Only the text attachment was available in this session.

`panda-activity.ts` owns a seeded shuffle bag and 60-second active-time intervals. Seven activities blend through a neutral pose over 2.4 seconds. It prevents consecutive repeats, varies gesture rhythms, and stops advancing while hidden. Reduced motion renders a static relaxed pose. Desktop rendering follows RAF; coarse-pointer/low-core devices use a 30fps cadence and lower pixel ratio. The canvas never exceeds 100,000 pixels. Resize, visibility, context loss/restoration, remounting, page cache restoration and explicit disposal have dedicated handling. The existing accessible chat button/icon remains usable during loading or WebGL failure.

For an approved GLB, call `mountPanda(host, launcher, {modelUrl, clips})`. Map activity names to the model's actual clip names, e.g. `{relaxing:'Idle', sleeping:'Sleep'}`. A relaxing/idle clip is required; the scheduler uses only supported clips. The loader fits the model by height, crossfades actions and releases loaded resources. Validate the model's forward axis, seated pose, framing, texture sizes and license before using it. No external model is fetched by the default implementation.

## Crystal and surfaces

- Landing pulses now occur at actual flight completion and last 180ms on each shard's own atlas/polygon material. External spark and glitter pools, the center ignition star, broad region flashes and idle billboard twinkles were removed.
- Real fracture seams begin 220ms after the final join. The existing final reveal begins 650ms after joining. Bloom is masked back into the original KA alpha; there is no rectangular or external glow plane footprint. The final whole-mark highlight is shorter and restrained.
- Hero rendering has one owned RAF, pauses for hidden tabs and offscreen settled scenes, and retains phase time on resume. Background diagnostic polling was removed. Framebuffer budgets are 2.4M mobile / 6M desktop, capped at 2× DPR. Pointer damping is time based.
- Glass retains the established warm neutral palette with static highlights and 18px desktop / 12px compact blur. Chat expansion uses opacity/transform, with no animated blur or full-section brightness filter. The character is anchored inside the launcher so safe-area offsets cannot drift. Chat is above the character, has 44px close/chip targets, and adapts to short landscape viewports.
- Ember rendering now cancels on hidden/reduced-motion states. The folder renderer draws on input/state/texture/resize changes under reduced motion instead of running continuously.
- Five background delivery textures total 2,188,678 bytes instead of 23,300,571 bytes (90.6% smaller). Original artwork is retained. `generator/scripts/optimize-backgrounds.cjs` reproduces the WebP copies using the sibling project's existing Sharp install; it is a development utility, not a runtime dependency.
- Stable `gallery.js`, `poster.js` and `panda.js` entry URLs revalidate on subsequent visits; content-hashed dependencies retain immutable caching. This prevents returning visitors from being pinned to obsolete entry bundles after rebuilding.

## Verification and limits

Run `npm test`, `npm run build`, `node generator/scripts/verify_opening.cjs`, and `node generator/scripts/verify_ui.cjs`.

Tests cover active-time scheduling, 500 non-repeating transitions, the real character's projected geometry across every activity, resource disposal, visibility/reduced-motion/remount behavior, crystal geometry and landing at 30/60/120Hz, seam timing, hero lifecycle, responsive skill-label bounds, navigation/drag/chat behavior, gallery/backend behavior and real HTTP delivery of the built files. Build includes TypeScript and compiled-entry checks. This repository has no configured lint command; inline JS/CSS parsing supplements type checking.

No connected browser was available, so screenshots, live console inspection, actual shader output, touch/keyboard viewport behavior, perceptual quality and device FPS remain unverified. These tests are not a 60–120fps benchmark. Vite still reports its existing large shared Three.js chunk (about 614kB before gzip); it is shared by lazy entries rather than duplicated between them. The crystal's existing Three.js r128 engine is now served locally, retaining its license header, rather than depending on the CDN. Hero and panda use `./dist/assets/` URLs compatible with both the Express app and a static server. The build also executes the complete hero initialization and animation with the actual r128 engine and a stub renderer, through the final reveal.


## Crystal correction ? September 11

Removed the automatic 2.6-second idle dissolve, glass backing, dense logo point cloud, and hover/tap state switching. The original embedded crystal artwork is retained. Removed the held-phase opacity reset, whole-logo flash, scheduled reflection sweeps and global brightness oscillation. The resolved mark stays fully opaque with a continuous transition to its resting glow.

Cursor, pen and touch Pointer Events emit minute black surface particles through one fixed pool (112 desktop / 64 mobile). Alpha-mask hit testing keeps emission on the crystal; particles move outward with depth, shrink and fade over 0.75?1.15 seconds. UI input is excluded. Reduced motion, replay and hidden-page transitions clear the effect.

Tier 2/3 shards receive a bounded selection of warm comet tails (28 desktop / 14 mobile), rendered in one instanced draw with an analytic tapered shader. Velocity uses elapsed seconds; tails fade as fragments settle. The actual crystal fragments retain their shape. Both effects share the existing hero frame loop.

The startup simulation checks continuous resolved opacity for 30 seconds, absence of the deleted state path, black blending, outward particle travel and expiry, mouse/touch/pen input, UI exclusion, reduced motion, bounded trails, and equivalent trail lengths at 30/60/120/144 Hz. Its renderer is a stub: GPU shader compilation, visual appearance and real-device frame rate still require browser validation.


## Local crystal emission

Replaced the radial shard halos with a single instanced surface-emission layer for every crystal, including Tier 0/1. A padded RGB atlas is built once from each original shard crop and fracture polygon: sharp edge/facet energy, a narrow bloom kernel, and a wider atmospheric kernel. The original texture and geometry are untouched. Whole-logo bloom and highlight planes no longer render, and the resolved material no longer adds uniform warm brightness.

Independent low-amplitude phase/frequency/intensity variation and sparse facet-constrained sparkle animate in the shader. Local emission follows each shard through flight and remains through the resolved texture handoff. Reduced motion uses static emission. Nearby atmospheric dust receives bounded distance-based warm illumination at 20 Hz; black cursor particles retain their existing appearance. No per-piece lights, framebuffers or extra animation loops were added. This is a surface-based bloom/scattering approximation on the existing textured planes, not volumetric ray tracing or new solid 3D geometry.

Startup checks now cover every piece, finite emission transforms, nonzero held emission across tiers, independent parameters, removal of the global bloom plane and static reduced-motion lighting. Live localhost delivery and geometry/interaction regression checks remain applicable. Actual shader appearance and device FPS require a connected browser.


## Emission artifact correction

The screenshot exposed two defects missed by the stub-renderer checks: the RGB glow atlas shader wrote alpha 1 across its entire rectangular footprint, and its original shard contours persisted after the assembled artwork had replaced those fragments. Emission now uses explicit additive RGB with destination alpha preserved, discards empty texels, and stops drawing raw shard glow when the fragments disappear.

The revealed crystal receives its own surface-lighting pass sampled directly from the same finished cutout texture. Crack contrast, edge coverage and reflective-facet energy drive hot highlights, close bloom and softer outward spill. A small nearest-piece parameter texture retains independent intensity/frequency/phase variation without rendering source shard outlines. This pass shares the logo's reveal radius and opacity, with no delayed activation, and reduced motion disables pulsing. Raw-shard emission was strengthened.

Regression coverage now asserts alpha blend factors, zero retained raw-shard emission at rest, the correct resolved texture and full post-reveal emission opacity. These checks validate compositing configuration and sequence integration, not actual GPU output; no browser is connected.


## Final-logo halo and sparse comet trails

Added a cached two-radius bloom texture derived from the finished crystal artwork. It shares the resolved emission pass and reveal envelope, with stronger spill outside the silhouette and restrained interior contribution to preserve sharp facets. The existing alpha-preserving blend is retained. Comet trails now select at most 6 Tier 2/3 fragments on desktop and 3 on mobile, reduced from 28/14.


## Eased recurring glow

After reveal, the final glow eases out over five seconds, waits a newly randomized 3?8 seconds, then eases in over 1.4 seconds and out over 3.6 seconds. The full returning glow lasts five seconds. Quintic easing gives zero slope and acceleration at each endpoint. The envelope changes only emitted light, including nearby dust illumination; the crystal stays opaque. The palette progresses from orange outer spill to yellow-gold inner bloom and warm-white hot facets. Active frame time drives the cycle without timers; reduced motion keeps steady illumination.
