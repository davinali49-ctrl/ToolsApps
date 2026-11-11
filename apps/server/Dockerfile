# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Tahap build: kompilasi TypeScript server di dalam workspace npm.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json

RUN npm ci --workspace @toolsapps/server --include-workspace-root

COPY apps/server apps/server
RUN npm -w @toolsapps/server run build && npm prune --omit=dev

# ---------------------------------------------------------------------------
# Tahap runtime: Node + LibreOffice + FFmpeg + yt-dlp.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# YTDLP_VERSION=latest mengikuti rilis terbaru. Isi versi, misalnya
# 2026.10.26, agar build reproducible.
ARG YTDLP_VERSION=latest

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    HOME=/home/toolsapps \
    SOFFICE_PATH=/usr/bin/soffice \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    YTDLP_PATH=/usr/local/bin/yt-dlp

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      ffmpeg \
      fonts-dejavu-core \
      fonts-liberation \
      fonts-noto-core \
      libreoffice-calc \
      libreoffice-impress \
      libreoffice-writer \
      python3 \
 && rm -rf /var/lib/apt/lists/* \
 && if [ "$YTDLP_VERSION" = "latest" ]; then \
      YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"; \
    else \
      YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp"; \
    fi \
 && curl -fsSL "$YTDLP_URL" -o /usr/local/bin/yt-dlp \
 && chmod 0755 /usr/local/bin/yt-dlp \
 && yt-dlp --version

RUN useradd --create-home --uid 10001 toolsapps \
 && mkdir -p /data \
 && chown -R toolsapps:toolsapps /data

WORKDIR /app

COPY --from=build --chown=toolsapps:toolsapps /app/node_modules ./node_modules
COPY --from=build --chown=toolsapps:toolsapps /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=toolsapps:toolsapps /app/apps/server/dist ./apps/server/dist

USER toolsapps

EXPOSE 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
