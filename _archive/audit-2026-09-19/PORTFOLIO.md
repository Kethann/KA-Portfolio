# Interactive portfolio

The public homepage remains the crystal KA portfolio in `index.html`, including its existing opening animation and navigation. The React + TypeScript + Three.js accordion folders are embedded inside Portfolio categories and the Gallery section. GSAP drives their reversible opening timeline and staggered project cards. `/crystal` serves the same homepage; `generator/build_cinematic.py` builds an older standalone animation and must not overwrite the homepage.

Portfolio and Gallery show a shelf of named folders. Selecting a folder opens its own artwork automatically. **All work**, **Close folder**, and closing a preview return the cards and close the folder before returning to the shelf. Changing batches of five also closes the current batch before opening the next one. Transition controls are temporarily disabled while moving to prevent competing animations. The gallery bundle loads only when one of these views is opened, with styles isolated from the KA page. Thumbnail textures load on the first folder opening.

The folder uses a rear top hinge, rounded dark panels, pleated sides, colored dividers, and a clasp. A perspective camera fits the opening envelope; portrait screens use a narrower, taller card arrangement. Rendering stops when the scene is offscreen or the document is hidden, and its framebuffer is capped at 3.2 million pixels.

After the KA opening completes, `client/src/poster-background.ts` renders a full-viewport painted surface behind the transparent KA canvas. Three original source textures blend through pigment-driven erosion, directional brush sweeps and radial ink reveals. Each 26-second shot holds for four seconds and blends for twenty-two; the incoming texture, composition seed and continuous motion become the next shot exactly, avoiding a blank reset. Surface drift, layered source detail and a restrained wet-pigment edge animate throughout. The center is gently shaded for logo contrast rather than cut out. The logo geometry and fragment flight paths remain intact. After the last join, real Voronoi seam edges carry a 1.5-second core-to-outline pulse, clipped to the KA alpha; the finished-logo reveal starts 650 ms after joining. Spark billboards are 48% of their former size with unchanged peak opacity. Background texture colors are sampled once and blended into the KA rim and polished facet highlights.

The public Envato “Paint Your Movie Credit V2” preview was inspected as a motion/composition reference; neither its footage nor template assets are included in the website. The previous small peripheral sprites have been replaced. Three textures load once after the opening, with a shared Three.js chunk, bounded framebuffer (1.5 million pixels mobile / 4 million desktop), 30fps target, hidden-page suspension, static reduced motion and GPU resource cleanup. Source assets remain 1254px; the renderer combines broad pigment fields with finer sampled texture rather than claiming native 4K artwork. Browser screenshots and live GPU/frame-rate checks remain unverified because no browser is connected.

Public project details show the complete image and metadata in the document flow, using the browser scrollbar. Closing reveals the scene immediately, then restores the cards and closes the folder. Hover picking targets card faces once per pointer frame, avoiding oversized outline hit regions. The cursor trail clears after 850 ms and yields to native interactive cursors. Contact fields have shrinkable grid tracks and the message field expands with its content. Public visitor statistics are removed; the footer includes the existing X profile.

Artwork source PNGs and generation provenance are in `client/src/artwork/`. The supplied folder reference is neither edited nor used as a background. Visual QA at target viewports/zoom levels and live frame-rate measurements still require a connected browser; automated checks do not establish visual equivalence.

## Run

From this directory, run:

```sh
npm install
npm run build
npm start
```

Open `http://127.0.0.1:8787` to use the complete crystal portfolio and embedded folders. Build again after frontend edits. `npm run frontend` runs the standalone folder development page; it is not the public homepage. Use the backend URL to verify the integration.

## Private creator access

Manually visit `http://127.0.0.1:8787/creator`. There is no public login link. On first startup, set `CREATOR_PASSWORD` in the server environment (at least 12 characters), or read the generated starter password in the private `server/data/creator-access.txt` file. Change it in Settings; changing it removes the starter file and invalidates sessions. An existing saved password takes precedence over the environment setting.

The dashboard manages folders, ordered projects, image uploads, editable content and button labels, and contact messages. Portfolio changes are drafts until **Save changes**. Image uploads and inbox actions save immediately. Refresh the public page to see saved changes. Each folder displays batches of up to five cards; close the folder to change collections or batches.

## Persistence and hosting

The public site and dashboard share the server's portfolio records. New installations seed five sample projects from `server/portfolio-seed.json`; existing collections retain their artwork and text and receive missing metadata fields automatically.

Credentials, inbox, portfolio records, and uploaded images live in `server/data/`, outside public static routes. Back up that entire directory. For deployment, set `CREATOR_DATA_DIR` to a **durable writable volume**; ephemeral hosting storage will not preserve edits across deployments. This implementation supports one Node process writing the data directory. Use HTTPS in production; set `TRUST_PROXY=1` only behind a trusted single reverse proxy. Set `HOST=0.0.0.0` when the hosting environment requires it. Sessions expire after eight hours and are intentionally invalidated by server restarts.

The existing optional image-enhancement sidecar and assistant backend are preserved. They are independent of the folder/contact/creator workflow.

## Verification

```sh
npm test
npm run build
```

Tests exercise private-route isolation, authentication, CSRF, upload validation, contact delivery, editing, restart persistence, inbox management, password rotation, and exact folder timeline reversal. The frontend uses a capped pixel budget, time-based damping, reduced-motion handling, and skips rendering when offscreen or hidden. These checks are not browser screenshots or 60/120 Hz benchmarks; inspect the experience on target devices before publishing.
