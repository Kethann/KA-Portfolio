# KA Crystal Reconstruction

Portfolio site, digital store, customer gallery, and private creator portal. The public home page is `index.html`; browser applications are built from `client/`, and the API runs through the Node development host or Cloudflare Worker.

## Start and build

```powershell
npm install
npm start
```

Open the site at `http://127.0.0.1:9878` and the creator portal at `http://127.0.0.1:9878/portal/`.

```powershell
npm test          # automated test suite and UI checks
npm run build     # production bundles, delivery checks, startup checks, and Pages staging
npm run build:cf  # production bundles for Cloudflare
```

Use `npm run cf:deploy` to build, apply D1 migrations, deploy the Worker, and publish Pages. Read the operations guides before configuring production or Docker.

## Repository map

| Path | Purpose |
| --- | --- |
| `index.html` | Public homepage, crystal animation, and lightweight site interactions |
| `client/src/` | Store, gallery, 3D folders, studio, and shared browser features |
| `client/portal/` | Creator portal application and admin tools |
| `server/handlers/` | Public API request handlers |
| `server/admin/` | Authenticated portal APIs and content validation |
| `server/assistant/`, `server/store/`, `server/visitors/` | Feature logic grouped by domain |
| `server/core/`, `server/platform/`, `server/dev/` | Shared infrastructure, Cloudflare adapter, and local Node host |
| `migrations/` | Ordered SQLite/D1 schema changes; never reorder migrations already deployed |
| `shared/` | Browser/server modules with shared types or logic |
| `scripts/` | Deploy, stage, import, and maintenance commands |
| `generator/` | Crystal artwork assets, legacy demo generator, and visual/build verification scripts |
| `tests/` | API, UI, security, and build regression checks |
| `pages/` | Cloudflare Pages Worker and route configuration |
| `images/`, `public/` | Public artwork and static vendor assets |
| `docs/` | Project guides, operating instructions, plans, and review notes; see [docs/README.md](docs/README.md) |
| `.data/`, `dist/`, `out/`, `.wrangler/` | Local data or generated output; do not edit or commit as source |

## Project notes

- Edit portfolio content and project images in the portal. Published site-document changes appear on the public site through its live refresh.
- Keep secrets in local `.env` / `.dev.vars` files or your hosting provider's secret store. The tracked `.env.example` contains names and examples only.
- Keep the standalone output from `generator/build_cinematic.py` separate from `index.html`; it is an older demo generator, not the full current site.
- Add new database changes as a new, higher-numbered migration. Deployed migration files are immutable.
