# KA Crystal — Agent Fix Plan
> Read this file first in any new chat. User will say "phase 1", "phase 2" etc. to trigger each phase.
> Do NOT modify any files until the user confirms the phase. Read each target file fully before editing.

---

## Project Context
- **Stack:** Cloudflare Workers + D1 (SQLite) + R2 + Pages + Turnstile + Cron Triggers
- **Local dev:** Node.js 22 + Better-SQLite3 (`ka.sqlite`)
- **Frontend:** React 18 + TypeScript + Three.js + GSAP + Vite
- **Entry point (dev):** `server/platform/node-dev.js`
- **Entry point (prod):** `server/platform/cloudflare.js`
- **Build output:** `dist/`
- **Tests:** `npm test` (57 regression tests, all `.mjs` files in `tests/`)
- **DO NOT touch:** `server/data/`, payment logic, GSAP timelines, crystal animation

---

## PHASE 1 — Dead Code & Package Metadata Cleanup
**Risk: ZERO. Text/config only. No logic changes.**
**Verify after: `tsc --noEmit`**

### Fix 1.1 — `package.json` Line 6
- Change `description` from `"KA portfolio + store: static site, portable Web API handlers (Vercel today), Supabase Postgres/Storage."` → `"KA portfolio + store: Cloudflare Workers, D1 (SQLite), R2 storage, Cloudflare Pages."`

### Fix 1.2 — `package.json` Line 45 (engines field)
- Change `"node": ">=20.10"` → `"node": ">=22.0.0"` (matches `../operations/CLOUDFLARE.md` requirement)

### Fix 1.3 — `server/handler.js` (remove Vercel `__path` dead code)
- Find the block that handles `url.pathname === '/api/index' && url.searchParams.get('__path')` rewriting
- Remove that entire block — it was only needed for Vercel's legacy URL rewriting
- All live routes are unaffected (they use direct paths, not `__path`)

### Fix 1.4 — `server/core/router.js` (remove Vercel `__path` dead code)
- Find lines that check `url.pathname === '/api/index' && url.searchParams.get('__path')`
- Remove that block entirely — same Vercel legacy workaround

### Fix 1.5 — `server/core/email.js` (remove Vercel file tracer comment workaround)
- Find comments / workarounds on lines 11–13 about avoiding Vercel NFT file tracer
- Remove those comment blocks or simplify back to normal imports
- SMTP logic must remain completely untouched

### Fix 1.6 — `server/core/storage.js` (remove Vercel path workaround)
- Find lines 12–13 that use string joins instead of `path.resolve` to avoid Vercel's NFT file tracer
- Replace with proper `path.resolve` / `path.join` call
- Storage read/write logic untouched

---

## PHASE 2 — Security Fixes
**Risk: LOW. Additive only — adds protection, removes nothing.**
**Verify after: `npm test` (all 57 tests must pass)**

### Fix 2.1 — Environment validation on startup
- Create new file: `server/core/env-validate.js`
- It exports one function `validateEnv()` that checks:
  - In production (`process.env.KA_ENV === 'production'`): throw if `DOWNLOAD_TOKEN_SECRET` equals `'local-development-only'`
  - In production: throw if `ADMIN_ENCRYPTION_KEY` equals `'local-development-only-key'`
  - In dev: just `console.warn` — never block dev startup
- Call `validateEnv()` at the top of `server/platform/node-dev.js` before server starts
- Also call at top of `server/platform/cloudflare.js` fetch handler

### Fix 2.2 — Tighten AI assistant rate limit
- File: `server/handlers/assistant.js` Line 11
- Change: `rateLimit('assistant:' + ctx.ip, 12, 10 * 60)` → `rateLimit('assistant:' + ctx.ip, 8, 10 * 60)`
- That's it. One number. Chat still works identically for normal users.

### Fix 2.3 — Harden visitorId conversation ownership
- File: `server/assistant/engine.js` Lines 184–187
- In `ensureConversation`: after looking up by `conversationId`, verify that `row.visitor_id === visitorId` before returning it
- If mismatch: create a new conversation instead of continuing the hijacked one
- New conversations and normal flows completely unaffected

### Fix 2.4 — Add SRI to Razorpay script injection
- File: `client/src/store/Checkout.tsx` Line 24
- Fetch current Razorpay SRI hash from https://checkout.razorpay.com/v1/checkout.js (or use Razorpay's published hash)
- Add `integrity="sha384-..."` and `crossOrigin="anonymous"` to the dynamically injected `<script>` tag

---

## PHASE 3 — CI/CD Pipeline Fix
**Risk: MEDIUM. Changes GitHub Actions YAML. Read both files fully before touching.**
**Verify after: YAML lint check + confirm `wrangler.jsonc` main entry exists**

### Fix 3.1 — `Portfolio-main/.github/workflows/deploy.yml`
Replace entire workflow with a correct one that:
1. Adds `concurrency` block (cancel in-progress on same branch)
2. Uses `node-version: '22'`
3. Runs `npm install` → `tsc --noEmit` → `npm test` in a `quality-gate` job
4. Only if quality-gate passes: deploy to Cloudflare using `wrangler deploy`
5. Uses `CF_API_TOKEN` and `CF_ACCOUNT_ID` secrets (already in repo secrets presumably)
6. Remove all Vercel deploy steps and `amondnet/vercel-action` references

### Fix 3.2 — `KA-Crystal-Reconstruction/.github/workflows/deploy.yml`
Same corrections applied to the inner workflow:
- Fix `node-version` to 22
- Add `npm test` before deploy
- Replace Vercel CLI with Cloudflare Wrangler deploy
- Add concurrency block

---

## PHASE 4 — Build Pipeline Fix
**Risk: MEDIUM. Changes `package.json` scripts and `vite.config.mjs`.**
**Verify after: `npm run build:assets` completes, `dist/` output is correct**

### Fix 4.1 — Decouple tests from `npm start` (package.json)
Change scripts to:
```json
"prestart": "npm run build:assets",
"build:assets": "node generator/scripts/verify_scripts.cjs && tsc --noEmit && vite build && node generator/scripts/verify_startup.cjs",
"build": "npm run build:assets && node --test tests/gallery-build.test.mjs tests/delivery.test.mjs",
"ci": "npm run build && npm test",
"start": "node server/platform/node-dev.js",
"dev": "npm start",
"frontend": "vite",
"test": "node --test tests/workstacks.test.mjs tests/assistant.test.mjs tests/gallery-state.test.mjs tests/creator.test.mjs tests/creator-ui.test.mjs tests/mobile-ui.test.mjs tests/paper-motion.test.mjs tests/liquid-glass.test.mjs tests/folder.test.mjs tests/gallery.test.mjs tests/folder-shelf.test.mjs tests/poster.test.mjs tests/panda.test.mjs"
```
- `npm start` / `npm run dev` → fast (no test suite)
- `npm run build` → full with delivery tests (for CI)
- `npm run ci` → everything

### Fix 4.2 — Add content hash to lazy bundles (vite.config.mjs)
- Change `assets/[name].js` → `assets/[name]-[hash].js` for lazy entry output
- Read `index.html` script loader first to confirm it discovers bundles dynamically (not hardcoded filenames)
- If hardcoded: update the loader to do a directory scan or use a manifest

### Fix 4.3 — Make synchronous cpSync async (vite.config.mjs)
- In `closeBundle` hook, replace `cpSync(...)` with `await cp(..., { recursive: true })`
- Import `cp` from `node:fs/promises` instead of `cpSync` from `node:fs`

---

## PHASE 5 — TypeScript & Accessibility Fixes
**Risk: LOW. Additive. Compiler gets stricter, accessibility improves.**
**Verify after: `tsc --noEmit` + `npm test`**

### Fix 5.1 — Enable `noUncheckedIndexedAccess` (tsconfig.json)
- Add `"noUncheckedIndexedAccess": true` to `compilerOptions`
- Then scan for new type errors and add `?? ''` / `?? 0` / null guards at each site
- Key sites: `types.ts` line 8 (`p.widths[...]`), `panda-activity.ts`, `WorkStacks.tsx`

### Fix 5.2 — Focus trap in Preview (client/src/Preview.tsx)
- Import `useFocusTrap` from `../store/hooks` (already exists)
- Apply it to the Preview section container ref
- Escape key dismiss stays the same

### Fix 5.3 — Responsive images in Preview (client/src/Preview.tsx + types.ts)
- In `types.ts` `imageUrl()`: add `srcset` helper returning `400w`, `800w`, `1600w` variants
- Add safety guard: `if (!p.widths?.length) return fallback`
- In `Preview.tsx`: use `<img srcset={...} sizes="(max-width: 600px) 400px, (max-width: 1200px) 800px, 1600px">`
- Full-res still loads on desktop

### Fix 5.4 — Add ESLint (new file: eslint.config.js)
- Minimal config: TypeScript + React plugin
- Add `"lint": "eslint client/src client/portal/src server --max-warnings 0"` to scripts
- Does NOT block build — dev tooling only

---

## PHASE 6 — Performance: WebGL & RAF Optimizations
**Risk: MEDIUM-HIGH. Touches Three.js loops. Read every related file before editing.**
**Verify after: `npm test` + manual visual check of folder, panda, background**

### Fix 6.1 — Stop FolderScene RAF loop when idle (client/src/FolderScene.tsx)
- Add `let isAnimating = false` flag
- RAF loop: `if (!isAnimating) return; requestAnimationFrame(tick);`
- Set `isAnimating = true` on: pointer move, GSAP timeline start
- Set `isAnimating = false` on: GSAP `onComplete`, pointer leave + settle timeout (500ms)
- Opening/closing/hover all look identical

### Fix 6.2 — Fix WorkStacks layout thrashing (client/src/WorkStacks.tsx lines 86–90)
- Create a `ResizeObserver` that caches all card `getBoundingClientRect()` values
- RAF loop reads from cache — never calls `getBoundingClientRect()` inside the frame
- Update cache on window resize and on cards mount/unmount

### Fix 6.3 — Fix Panda travel layout thrashing (client/src/panda.ts lines 62–72)
- Read rects once at travel start (before animation begins)
- Cache them in local variables for the duration of that travel
- Re-read only if `window.resize` fires during travel
- Animation looks identical

### Fix 6.4 — Parallel AI chat DB queries (server/assistant/engine.js)
- Wrap independent reads in `Promise.all([settingsFetch, usageFetch, orderFetch, kbSearch])`
- Writes after generation remain sequential (they must be)
- Response time improves on D1 edge databases

---

## Issue Quick Reference (all 38)
| # | Severity | File | Issue |
|---|---|---|---|
| 1 | 🔴 Critical | `.github/workflows/deploy.yml` L20 | `build:vercel` script doesn't exist |
| 2 | 🔴 Critical | Both `deploy.yml` | Deploys to Vercel, app is on Cloudflare |
| 3 | 🔴 Critical | Both `deploy.yml` | No `npm test` before deploy |
| 4 | 🔴 Critical | `server/admin/auth.js` L27, `server/core/storage.js` L78 | Fallback secrets in production |
| 5 | 🟠 High | `.github/workflows/deploy.yml` L15 | Node 20 instead of 22 |
| 6 | 🟠 High | `server/handlers/assistant.js` L11 | No Turnstile on AI endpoint |
| 7 | 🟠 High | `server/assistant/engine.js` L184–187 | visitorId conversation hijack |
| 8 | 🟠 High | `vite.config.mjs` L13 | Dual Three.js runtimes (~1.2MB) |
| 9 | 🟠 High | `WorkStacks.tsx` L86–90, `panda.ts` L62–72 | RAF layout thrashing |
| 10 | 🟠 High | `FolderScene.tsx` L148–169 | Continuous RAF when idle |
| 11 | 🟠 High | `package.json` L8, L11 | Tests inside build/start |
| 12 | 🟠 High | `vite.config.mjs` L22 | No content hash on bundles |
| 13 | 🟡 Medium | No component tests | Zero frontend tests |
| 14 | 🟡 Medium | All docs confirm | No E2E / browser tests |
| 15 | 🟡 Medium | `server/platform/cloudflare.js` | Cloudflare platform untested |
| 16 | 🟡 Medium | `Preview.tsx` L17, `types.ts` L8 | Full-res images on mobile |
| 17 | 🟡 Medium | `Checkout.tsx` L24, `studio-entry.ts` L61 | No SRI on external scripts |
| 18 | 🟡 Medium | `server/assistant/engine.js` | 8–12 DB queries per chat turn |
| 19 | 🟡 Medium | `gallery-entry.tsx`, `studio-entry.ts` etc | Inlined CSS bloats JS bundles |
| 20 | 🟡 Medium | `tsconfig.json` | Missing `noUncheckedIndexedAccess` |
| 21 | 🟡 Medium | `Preview.tsx` L15 | Missing focus trap |
| 22 | 🟡 Medium | `server/handler.js`, `router.js`, `storage.js`, `email.js` | Stale Vercel dead code |
| 23 | 🟡 Medium | `.env.example` | No env validation on startup |
| 24 | 🟡 Medium | `panda-character.ts` L31–35 | Heavy physical materials on mobile |
| 25 | 🟡 Medium | `server/assistant/providers.js` L87 | 6hr model blacklist on transient errors |
| 26 | 🔵 Low | `package.json` L6 | Wrong description (Vercel/Supabase) |
| 27 | 🔵 Low | `package.json` L45 | Engine `>=20.10` should be `>=22.0.0` |
| 28 | 🔵 Low | `server/assistant/engine.js` L75 | English-only handoff regex |
| 29 | 🔵 Low | `server/assistant/engine.js` L13 | Hardcoded IST timezone offset |
| 30 | 🔵 Low | `server/visitors/geo.js` L22–25 | Free ipstack tier HTTP (unencrypted IPs) |
| 31 | 🔵 Low | `vite.config.mjs` L11–12 | Sync `cpSync` blocks event loop |
| 32 | 🔵 Low | `folderGeometry.ts` L24 | `THREE.DoubleSide` disables backface culling |
| 33 | 🔵 Low | `studio-entry.ts` L374–405 | 8Mbps MediaRecorder can crash mobile |
| 34 | 🔵 Low | `store/Store.tsx` L355 | `dangerouslySetInnerHTML` trust |
| 35 | 🔵 Low | `WorkStacks.tsx` L198–199 | Progress state flood re-renders |
| 36 | 🔵 Low | `tests/admin.test.mjs` L86, 126, 135 | Raw SQL bypasses app auth in tests |
| 37 | 🔵 Low | `store/hooks.ts` L31 | `querySelectorAll` on every Tab keydown |
| 38 | 🔵 Low | No config | No ESLint / Prettier |
