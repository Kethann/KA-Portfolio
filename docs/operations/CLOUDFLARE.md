# Going live — complete setup (from zero)

How the live site is built:

| Part | Service | Name in this project |
|---|---|---|
| Public address | Cloudflare **Pages** | project `kethan` → `https://kethan.pages.dev` |
| API, portal logic, file links | Cloudflare **Worker** | `kethan-artzz` (Pages hands it `/api`, `/legal`, `/__storage`) |
| Database | Cloudflare **D1** | `ka-db` |
| Files (images, downloads, backups) | Cloudflare **R2** | bucket `ka-files` |
| Bot protection on forms | Cloudflare **Turnstile** | widget "Kethan Artzz site" |
| Email | **Gmail** with an App Password | your Gmail |
| Payments | **Razorpay** | test keys first, live keys later |
| Scheduled jobs | Cloudflare **Cron Triggers** | set in `wrangler.jsonc` (nothing to do) |

Every command below is typed in **PowerShell inside the project folder**:
```
cd C:\Users\volet\Downloads\Portfolio-main\KA-Crystal-Reconstruction
```
A command that asks for a value (`npx wrangler secret put NAME`) shows `Enter a secret value:` — type or paste the value
there and press Enter (pasted secrets stay invisible; that's normal). **Never** put secret values in files or chats.

---

## 1. Accounts you need (all free to start)
1. **Cloudflare** — https://dash.cloudflare.com/sign-up
2. **Google account** with Gmail — the address the store sends emails from
3. **Razorpay** — https://dashboard.razorpay.com/signup (test mode works before business verification)
4. **GitHub** — only if you want the code backed up / auto-deploys

## 2. Your PC (one time)
1. Install **Node.js 22**: PowerShell → `winget install OpenJS.NodeJS.22` → close and reopen VS Code → `node -v` shows `v22…`.
2. Allow npm to run in PowerShell: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` → `Y`.
3. Install the project tools: `npm install`
4. Sign in to Cloudflare: `npx wrangler login` → browser opens → **Allow**.

## 3. Database (D1)
1. `npx wrangler d1 create ka-db`
2. If it asks "add it on your behalf?" answer **No**. Copy the `database_id` it prints.
3. Open `wrangler.jsonc` → in `d1_databases` put that id in `"database_id"`. Save.
4. Create the tables: `npx wrangler d1 migrations apply ka-db --remote`

## 4. File storage (R2)
1. Cloudflare dashboard → **R2 Object Storage** → **Enable** (asks for a card; free up to 10 GB).
2. `npx wrangler r2 bucket create ka-files`

## 5. Bot protection (Turnstile) — needed for the contact form, checkout, notify-me and download pages
1. Cloudflare dashboard → **Turnstile** → **Add widget**.
2. Name: `Kethan Artzz site`. Hostnames: add `kethan.pages.dev` (and your own domain later). Mode: **Managed** → **Create**.
3. It shows a **Site Key** and a **Secret Key** — used in step 7.

## 6. Gmail App Password
1. https://myaccount.google.com/security → turn on **2-Step Verification** (phone + code).
2. https://myaccount.google.com/apppasswords → App name `Kethan Artzz site` → **Create** → copy the 16 letters.

## 7. Secrets (values never go in the code)
Run each line; paste the value when asked.

| Name | Where the value comes from | Needed for |
|---|---|---|
| `DOWNLOAD_TOKEN_SECRET` | make up 40+ random letters/numbers | signed download & file links (**required**) |
| `ADMIN_ENCRYPTION_KEY` | make up another 40+ random letters/numbers (never change it later) | portal two-factor codes (**required**) |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey → Create API key | chat assistant |
| `GMAIL_USER` | your Gmail address, e.g. `kethanartzz@gmail.com` | sending email |
| `GMAIL_APP_PASSWORD` | the 16 letters from step 6 | sending email |
| `OWNER_EMAIL` | where order/message alerts should go | alerts |
| `TURNSTILE_SITE_KEY` | step 5, Site Key | forms |
| `TURNSTILE_SECRET_KEY` | step 5, Secret Key | forms |
| `RAZORPAY_KEY_ID` | step 11 (`rzp_test_…` first) | payments |
| `RAZORPAY_KEY_SECRET` | step 11 | payments |
| `RAZORPAY_WEBHOOK_SECRET` | make up a long phrase; same text goes into Razorpay in step 11 | payments |
| `ADMIN_SETUP_TOKEN` | make up a code — *only* if the database has no portal account yet (step 9) | first sign-up |

```
npx wrangler secret put DOWNLOAD_TOKEN_SECRET
npx wrangler secret put ADMIN_ENCRYPTION_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GMAIL_USER
npx wrangler secret put GMAIL_APP_PASSWORD
npx wrangler secret put OWNER_EMAIL
npx wrangler secret put TURNSTILE_SITE_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```
(The first time, wrangler may ask to create the Worker — answer **yes**.)
Non-secret settings live in `wrangler.jsonc` → `"vars"`: `KA_ENV` (`production`), `SITE_NAME`, `PUBLIC_SITE_URL`
(`https://kethan.pages.dev`, or your domain later). Optional extras: `AI_MODEL`, `MAIL_SIGNATURE`, `IPSTACK_ACCESS_KEY`.

## 8. Publish
```
npm run cf:deploy
```
Builds the site, applies database changes, deploys the Worker and publishes `kethan.pages.dev`.
If the Pages project `kethan` doesn't exist yet, the first run creates it.
**Then:** Cloudflare dashboard → **Workers & Pages** → **kethan** → **Settings → Builds** → if a GitHub repository is
connected, **Disconnect** it (otherwise a push would publish a wrong build over the site).

## 9. Your portal account
- **Data already moved from your PC** (done for you): sign in at `https://kethan.pages.dev/portal/` with your email and
  the temporary password in `.data/live-owner-temp-password.txt`; the portal makes you choose your own.
- **Empty database:** set `ADMIN_SETUP_TOKEN` (step 7), open the portal, choose **Set up** and enter that code, your email
  and a password. Then remove the token: `npx wrangler secret delete ADMIN_SETUP_TOKEN`.

## 10. Content you must fill in (portal)
1. **Legal** app → fill every blank (your name/business name, address, contact email, city for disputes) in Terms,
   Privacy, Refunds and Delivery → **Publish** each. Until then the pages say "being updated" (Razorpay will reject it).
2. **Settings → Store**: seller name/address/tax id for receipts, tax on/off.
3. **Products**: replace the demo items and their demo download files with your real ones (upload the real file on each
   product; demo files are tiny `.txt` placeholders).
4. **KA Assistant → Knowledge**: add how delivery works, your commission terms, etc.

## 11. Payments (Razorpay)
1. Razorpay dashboard → toggle **Test Mode** → **Account & Settings → API Keys → Generate Test Key**.
2. `npx wrangler secret put RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` (step 7 table).
3. **Account & Settings → Webhooks → Add New Webhook**
   - URL: `https://kethan.pages.dev/api/webhooks/razorpay`
   - Secret: the same phrase as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`
4. Test: buy on the site with card `4111 1111 1111 1111` (any future date, any CVV) or UPI `success@razorpay`.
5. Real money: complete Razorpay's activation (KYC + website review — website `https://kethan.pages.dev`, needs step 10.1
   done), then repeat 1–3 in **Live Mode** with the live keys.

## 12. Optional: your own domain
Buy one (Cloudflare → **Domain Registration**, or any registrar and move the nameservers to Cloudflare) → **Workers &
Pages** → **kethan** → **Custom domains** → **Set up a domain**. Then: add the domain to the Turnstile widget (step 5),
change `PUBLIC_SITE_URL` in `wrangler.jsonc`, run `npm run cf:deploy`, and update the Razorpay webhook URL.

## Every later update
`npm run cf:deploy`

## Good to know
- Free plan: 100,000 Worker requests/day (pages, images and scripts are static and don't count), D1 5 GB, R2 10 GB.
- One upload can be up to 95 MB.
- Weekly backup (Mondays) goes to R2; download copies from the portal → Settings → Backups.
- Local development: `npm start` (local SQLite in `.data/ka.sqlite`, files in `.data/storage`, emails in `.data/outbox`).
