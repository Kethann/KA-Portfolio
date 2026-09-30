# Putting the site on Cloudflare (free plan)

Everything runs on Cloudflare:

| Part | Cloudflare service | What it holds |
|---|---|---|
| Website, portal, API | **Workers** (one Worker: `kethan-artzz`) | the site files + all `/api` code |
| Database | **D1** (`ka-db`) | products, orders, settings, messages, team… |
| Files | **R2** (`ka-files`) | uploaded images, files buyers download, backups |
| Emails | your **Gmail** (App Password) | receipts, download links, notifications |
| Daily/weekly jobs | **Cron Triggers** | order expiry, reports, weekly backup |

Do the steps in order. Each command is typed in a terminal (PowerShell) **inside the project folder**:

```
cd C:\Users\volet\Downloads\Portfolio-main\KA-Crystal-Reconstruction
```

---

## 0. One-time on your PC

1. **Install Node.js 22 LTS or newer** from https://nodejs.org (the "LTS" button). Cloudflare's tool needs it.
   Close and reopen the terminal afterwards, then check: `node -v` shows `v22…` or higher.
2. Install the project's tools: `npm install`
3. Sign in to Cloudflare from the terminal: `npx wrangler login` → a browser tab opens → **Allow**.

## 1. Create the database and the file bucket

```
npx wrangler d1 create ka-db
```
It prints a block with `"database_id": "…"`. Open **wrangler.jsonc** and paste that id where it says
`PASTE-YOUR-D1-DATABASE-ID-HERE`. Save.

```
npx wrangler r2 bucket create ka-files
```
(If Cloudflare asks you to enable R2 first: dashboard → **R2 Object Storage** → **Enable**. The free tier
needs a card on file but stays free up to 10 GB.)

## 2. Secrets (keys and passwords)

Run each line; it asks for the value and stores it encrypted on Cloudflare (never in the code).
If it asks "create a new Worker?", answer **yes**.

| Name | What to paste |
|---|---|
| `GEMINI_API_KEY` | your key from https://aistudio.google.com/apikey |
| `DOWNLOAD_TOKEN_SECRET` | any long random text (e.g. mash 40+ letters/numbers) — signs download links |
| `ADMIN_ENCRYPTION_KEY` | another long random text — protects two-factor codes |
| `OWNER_EMAIL` | the email that should receive order/message alerts |
| `GMAIL_USER` | your Gmail address, e.g. `kethanartzz@gmail.com` |
| `GMAIL_APP_PASSWORD` | the 16-letter App Password (see below) |
| `RAZORPAY_KEY_ID` | Razorpay key id (start with **test** keys: `rzp_test_…`) |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you type when creating the webhook (step 6) |
| `ADMIN_SETUP_TOKEN` | *only if you start with an empty database* (skip step 4): a code to create the first owner |

```
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put DOWNLOAD_TOKEN_SECRET
npx wrangler secret put ADMIN_ENCRYPTION_KEY
npx wrangler secret put OWNER_EMAIL
npx wrangler secret put GMAIL_USER
npx wrangler secret put GMAIL_APP_PASSWORD
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
```

**Gmail App Password:** Google Account → **Security** → turn on **2-Step Verification** (required) →
search "App passwords" → name it `Kethan Artzz site` → **Create** → copy the 16 letters.
Gmail allows about 500 emails a day, plenty for a store.

## 3. Build and deploy

```
npm run cf:deploy
```
This builds the site, creates the database tables on D1, and uploads the Worker. At the end it prints your
address, like `https://kethan-artzz.<your-name>.workers.dev`. Open **wrangler.jsonc**, put that address in
`"PUBLIC_SITE_URL": "…"` (used in email links), save, and run `npm run cf:deploy` once more.

## 4. Move your local data (products, settings, orders, team, images)

1. **Stop your local server** (the terminal running `npm start`: press `Ctrl + C`).
2. Copy the old local database into the new format and prepare the upload files:
   ```
   npm run cf:move-local-data
   ```
3. Load it into Cloudflare's database:
   ```
   npx wrangler d1 execute ka-db --remote --file .data/d1-import.sql
   ```
4. Upload your images and download files to R2 (keeps the same paths, so every link works):
   ```
   npm run cf:upload-files
   ```

Your portal sign-in (email + password) comes along, so you log in on the live site exactly as you do locally.

## 5. Check it

- Site: your `workers.dev` address → the crystal logo, portfolio, store, chat assistant.
- Portal: add `/portal/` to the address → sign in → every app opens.
- Portal → **Settings → System status** shows the database, storage and email as connected.

## 6. Payments (Razorpay)

Test mode first — no real money moves, the whole flow runs for real:

1. Razorpay dashboard → switch to **Test Mode** → **Settings → API Keys** → generate → put them in the two
   `RAZORPAY_KEY_*` secrets (step 2).
2. **Settings → Webhooks → Add**: URL `https://<your address>/api/webhooks/razorpay`, secret = the same text
   as `RAZORPAY_WEBHOOK_SECRET`, events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`,
   `refund.failed`.
3. Buy something on the live site with Razorpay's test card `4111 1111 1111 1111` (any future date, any CVV)
   or test UPI `success@razorpay`.

When everything looks right, switch Razorpay to **Live Mode**, replace the three secrets with the live values,
and add the webhook again in Live Mode.

> The local demo wallet (the Visa/Mastercard test cards with balances) only works on your PC. On the live
> site it is always off, so no one can ever "pay" with fake cards.

## 7. Optional: your own domain

Cloudflare dashboard → **Workers & Pages** → `kethan-artzz` → **Settings → Domains & Routes → Add → Custom
domain**. Then update `PUBLIC_SITE_URL` and the Razorpay webhook URL to the new address.

## Every later update

```
npm run cf:deploy
```
(Or connect the GitHub repo in the dashboard: `kethan-artzz` → **Settings → Builds** → build command
`npm run build:cf`, deploy command `npx wrangler d1 migrations apply ka-db --remote && npx wrangler deploy` —
then every push to `main` deploys by itself.)

## Good to know

- **Free-plan limits:** 100,000 Worker requests a day (the site's pages, images and scripts are served as
  static files and don't count), D1 5 GB, R2 10 GB, 1 million R2 writes a month.
- **Uploads:** one file can be up to 95 MB (Cloudflare's request limit on the free plan).
- **CPU:** the free plan gives each request 10 ms of CPU. Sign-in (password checking is deliberately slow for
  safety) may exceed it; if the portal sign-in ever shows an error page, tell me — the fix is a small setting
  change or the Workers Paid plan ($5/month).
- The old Cloudflare **Pages** project (`*.pages.dev`) can be deleted: dashboard → Workers & Pages → the Pages
  project → Settings → Delete.
