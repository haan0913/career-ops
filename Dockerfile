# career-ops dashboard — full engine (scan / match-score / jd-fetch / set-status) + Next.js web UI.
# Build context = repo root. The dashboard spawns the repo's Node CLIs, so the image carries
# the whole engine; your USER LAYER (data/, .env, cv.md, portals.yml, modes/_profile.md, config/)
# is supplied at runtime as volumes (see docker-compose.yml) and is never baked into the image.

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    CAREER_OPS_ROOT=/app \
    NEXT_TELEMETRY_DISABLED=1

# 1) Engine deps (providers, scan, match-score/transformers, jd-fetch, playwright).
COPY package.json package-lock.json* ./
RUN npm install && npm cache clean --force

# 2) Chromium for the jd-fetch browser tier + scan --verify (matches the installed playwright).
RUN npx playwright install --with-deps chromium

# 3) Warm the local match-score model into the image so the first score is instant + offline.
#    Best-effort: if the network is unavailable at build time, it falls back to a runtime download.
RUN node -e "import('@huggingface/transformers').then(async (t)=>{const p=await t.pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2');await p('warm',{pooling:'mean',normalize:true});console.log('match-score model cached');}).catch((e)=>console.error('model warm skipped:',e.message))"

# 4) Web app deps (build needs dev deps; this is a build-and-run image).
COPY web/package.json web/package-lock.json* ./web/
RUN cd web && npm install && npm cache clean --force

# 5) System-layer code only (user layer is excluded via .dockerignore, mounted at runtime).
COPY . .

# 6) Build the dashboard.
RUN cd web && npm run build

EXPOSE 3737
WORKDIR /app/web
CMD ["npm", "start"]
