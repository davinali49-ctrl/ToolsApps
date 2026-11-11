# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Tahap build: kompilasi aplikasi web (PWA) dengan Vite.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/desktop/package.json apps/desktop/package.json

RUN npm ci --workspace @toolsapps/web --include-workspace-root

COPY apps/web apps/web
RUN npm -w @toolsapps/web run build

# ---------------------------------------------------------------------------
# Tahap runtime: Nginx menyajikan berkas statis + fallback SPA.
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
