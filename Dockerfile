# Run the whole site (homepage, store, portal, API) as one container: the same code the Cloudflare Worker runs,
# on the Node host adapter (server/platform/node-dev.js) with a SQLite file and local file storage under /data.
# Production for kethan.pages.dev stays on Cloudflare (docs/CLOUDFLARE.md); use this for self-hosting, a VPS,
# or to run an exact copy of the site on any machine with Docker.
#   docker build -t ka-site .
#   docker run -p 8787:8787 -v ka-data:/data --env-file .env ka-site      (or: docker compose up --build)

# ---- 1. build the browser bundles (React store, portal, gallery) -------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:cf
# the server needs only the runtime packages plus the SQLite driver (a dev dependency here because the Worker
# build never ships it); drop everything else (vite, wrangler, typescript ...) to keep the image small
RUN npm prune --omit=dev --no-audit --no-fund \
 && npm install --no-save --no-audit --no-fund "better-sqlite3@$(node -p "require('./package-lock.json').packages['node_modules/better-sqlite3'].version")"

# ---- 2. runtime -------------------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 KA_DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/platform/node-dev.js"]
