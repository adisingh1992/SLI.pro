# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# SLI.pro / Wing — application container for Azure Container Apps
#
# Serves the React SPA, the REST API and the voice WebSocket from one process.
#
# Client and API ship together, so a deployed UI is always paired with the API
# version it was built against — no version skew, one artifact, one rollback.
# (Deviation from Architecture & Strategy §5, which places the SPA on Static
# Web Apps. Reversible: set SERVE_CLIENT=false and deploy the client separately.)
#
# The server is bundled with esbuild using --packages=external, so runtime
# node_modules are still needed — hence the production install in the final
# stage rather than a bare copy of dist/.
# ─────────────────────────────────────────────────────────────────────────────

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Dev dependencies are needed to build (vite, esbuild, typescript).
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Client -> dist/public, server -> dist/index.js, migrator -> dist/migrate.js
# The migrator is bundled so migrations can run as a Container Apps job using
# this same image, without tsx at runtime.
RUN npm run build:client \
 && npm run build:server \
 && npm run build:migrate

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Serve the SPA from this process (single-container deployment).
ENV SERVE_CLIENT=true

# Production dependencies only.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Bundled server + built client + SQL migrations.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Run as a non-root user.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

# Container Apps injects PORT; the app reads it via config.port.
ENV PORT=8080
EXPOSE 8080

# Ingress and Docker probes hit /api/health (liveness — no database dependency).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
