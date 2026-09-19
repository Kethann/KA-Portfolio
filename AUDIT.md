# Application audit — 19 September 2026

Scope: the active KA-Crystal-Reconstruction application, its creator studio, shared Node APIs,
embedded React gallery, startup scripts, local server processes, and public build delivery.
The sibling portfolio and image-enhancement projects remain preserved; they were not rewritten.
Existing uncommitted edits were preserved. Pre-edit copies of the main affected files are in
`_archive/audit-2026-09-19/`. No existing project files were hard-deleted.

## Running the application

Run `npm start` from the parent workspace or this app directory. It builds and verifies the
frontend before starting the app. `npm run dev` uses the same entry point.

- Public site: http://127.0.0.1:8787
- Private creator studio: http://127.0.0.1:8787/creator
- Optional image worker: loopback port 8799, accessed by the browser through `/api/enhance`
- Set `ENHANCE_ENABLED=0` to disable the optional worker.

Three existing Vite preview processes were confirmed to belong to this app and stopped after
the shared app was healthy. They used 4173/4174 and served static previews, not the complete
Node application. Other system services were left alone. The Python worker remains separate
because it runs the existing PyTorch models, but visitors use only the shared Node URL.

## Fixed findings

1. Content inputs sent old values to the preview until publishing. Inputs now update the shared draft immediately.
2. The embedded gallery fetched published records independently of the creator preview. It now accepts the homepage's portfolio snapshot and listens for updates.
3. A late initial portfolio fetch could overwrite an iframe draft. Received drafts now take precedence.
4. Hidden Gallery/About navigation entries could not be restored without a reload. Visibility now derives from the complete navigation list.
5. Edits made during a publish request could be overwritten by its response. Newer edits stay dirty and retain the returned revision.
6. Creator name, tagline, contact button text, and download visibility were inconsistently connected to the public frontend. These controls now affect their corresponding public elements.
7. Studio logo uploads were classified as unused. Both published projects and branding now protect assets; the UI also protects draft references.
8. Removing an unused image permanently deleted its file. It now moves to private `server/data/archived-uploads/` (or the configured data directory).
9. Removing a custom font could leave invalid per-element font references. Those references now reset too; cancelling a font picker does nothing.
10. Typing during contact submission could re-enable the send button. Pending submissions remain locked against duplicates.
11. Successful JSON assistant replies were incorrectly treated as streams. Response handling now checks the content type.
12. Creator JS/CSS could be shadowed by stale built assets or cached too long. Their explicit, revalidated routes now take priority.
13. Unknown API endpoints returned HTML. They now return a useful JSON error; the creator UI also explains unexpected non-JSON responses.
14. Untrusted forwarded-host headers could affect creator origin checks. Forwarded hosts now require configured proxy trust; public CORS middleware excludes creator routes.
15. The optional Python service retried indefinitely and lacked explicit shutdown/error handling. Retries are bounded, spawn errors are handled, worker windows are hidden, and shutdown stops the owned worker.
16. Enhancement timeouts ended before the response body finished. They now cover the complete operation and clear in a finally block.
17. Duplicate starts could initialize services before discovering a port conflict. Startup acquires the common port first and gives a clear error without spawning another worker.
18. README instructions directed users to static servers that cannot execute APIs. Documentation and the workspace entry point now identify the shared server.
19. An inline legacy animation shader string contained a literal newline in a single-quoted string, breaking that script. Fixed and added all-inline-script parsing to the build.
20. The startup verifier expected obsolete black particles. It now checks the current fading colored sparks and still exercises lifecycle, opacity, motion, and cleanup.
21. Startup verification depended on the sibling project's Three.js install. It now uses this app's own dependency.
22. Hidden creator overlays remained keyboard-focusable; the toolbar required hover. Hidden overlays are excluded, keyboard focus reveals the toolbar, and the messages dialog traps/restores focus. Reduced-motion preferences are respected by creator transitions.
23. Vercel rewrites omitted uploaded files and creator routes. Added those routes; no remote deployment was performed.
24. The GitHub Pages workflow uploaded the repository root. It now builds and uploads only `dist`.
25. A real enhancement request exposed a face-helper coordinate enlargement and repeated model loading. The worker now reuses its detector/parser, keeps original image coordinates, clears per-image tensors, and rejects concurrent jobs even after an HTTP timeout. Decoded images are capped at 16 megapixels. If optional face compositing runs out of memory, completed Real-ESRGAN enhancement is returned with zero restored faces and the correct model label.

Builds preserve older generated files (`emptyOutDir: false`) in keeping with the no-hard-delete
request. This means obsolete generated assets can accumulate; archive them deliberately if
disk usage becomes an issue.

## Verification

- 29 regression tests passed, including authentication, CSRF, contacts/inbox, persistence,
  asset recovery, branding references, draft synchronization, publish races, and download controls.
- 5 production build/delivery tests passed.
- TypeScript checking passed.
- All 10 inline scripts and creator.js parse; the inline identifier checker also passed.
- Full hero startup, assembly, reveal, particle lifecycle, and reduced-motion checks passed.
- `npm audit --omit=dev`: zero known production dependency vulnerabilities.
- Live homepage, creator, creator script, gallery bundle, and portfolio API returned HTTP 200.
- A live assistant request completed its event stream successfully.
- The optional image worker reported ready through the shared server.
- Python pipeline regression and syntax checks passed, including original-coordinate compositing, cleanup, and memory fallback without false face-restoration claims.
- After reducing peak memory by running general enhancement before face restoration, the same previously failing 480x270 thumbnail returned HTTP 200 with a 1920x1080 PNG, two restored faces, and the Real-ESRGAN + CodeFormer label. The 2,668,927-byte result is preserved in `tmp/audit-enhanced.png`.
- Attempting another Node startup was rejected without starting an additional worker. Only 8787 (app) and 8799 (internal worker) remained among the project's previously observed server ports.

## Remaining limits

No browser was connected, so visual layout, real keyboard interaction, mobile behavior,
and GPU/frame-rate measurements have not been visually verified. Automated tests do not
establish that every browser/device combination is flawless.

The build still reports the existing large Three.js chunk warning. Panda tests emit Node's
AbortSignal listener-count warning while their lifecycle/cleanup assertions pass. These are
not build/test failures, but performance should be measured on actual devices before larger
renderer changes.

Static-only hosting still cannot execute creator/contact APIs. Use the Node server or a
configured reverse proxy and durable backend storage. The updated Vercel rewrites retain the
existing backend destination; remote deployment, proxy behavior, and persistence were not
tested or changed on the hosting provider. GitHub Pages is a static artifact target, not a
replacement for the Node service.

The standalone generator and archived implementations remain preserved. This audit does not
claim to modernize every legacy demo or replace the Python model dependencies.

The local machine experienced real memory pressure during face compositing. General enhancement
has a fallback for that stage; full face restoration still depends on available RAM/VRAM.
The existing Python environment also emits a torchvision deprecation warning; replacing that
ML dependency stack was not attempted as part of these application fixes.
