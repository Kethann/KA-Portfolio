# Running the site in Docker

The live site runs on Cloudflare (`docs/CLOUDFLARE.md`). Docker gives you the **same code in one container**: the
homepage, store, portal and API, with a SQLite database and file storage kept in a volume. Use it to self-host on a
VPS, to hand the project to someone, or to run an exact copy on a machine with only Docker installed.

## Start it

```
docker compose up --build
```

Open http://localhost:8787 (site) and http://localhost:8787/portal/ (portal). The first time, the portal asks you to
create the owner account.

Without compose:

```
docker build -t ka-site .
docker run -p 8787:8787 -v ka-data:/data --env-file .env ka-site
```

## Settings

Copy `.env.example` to `.env` and fill only what you use (email, Razorpay, Turnstile, AI keys). The file is read at
start and is **never** copied into the image (`.dockerignore`). Set `PUBLIC_SITE_URL` to the address people will use,
for example `https://shop.example.com`: license links and emails are built from it.

Also set two long random strings in `.env` (the app warns at start if they are missing): `DOWNLOAD_TOKEN_SECRET`
(signs download links) and `ADMIN_ENCRYPTION_KEY` (encrypts your two-factor seed and the Social webhook link at rest).
Keep them: changing `ADMIN_ENCRYPTION_KEY` later means saving the webhook link again and re-enrolling two-factor.

## Where the data lives

Everything that changes is in the `ka-data` volume, mounted at `/data`: `ka.sqlite` (orders, products, settings,
social posts), uploads, and the email outbox. Rebuilding or restarting the container keeps it.

Back it up:
```
docker run --rm -v ka-data:/data -v "$PWD":/backup busybox tar czf /backup/ka-data.tgz -C /data .
```

## Good to know

- Health check: `GET /api/health` (Docker marks the container healthy or unhealthy from it).
- Put it behind HTTPS (Caddy, nginx or a Cloudflare Tunnel) before using real payments.
- This runs the Node host (`server/platform/node-dev.js`). Scheduled jobs that Cloudflare runs for you (daily report,
  weekly backup, scheduled social posts) run on timers inside the container instead.
- Cloudflare deployment is unchanged: `npm run cf:deploy`.
