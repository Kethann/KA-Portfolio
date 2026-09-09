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
