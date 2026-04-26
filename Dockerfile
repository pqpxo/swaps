# ── SWAPS v2 ─────────────────────────────────────────────────────
# Multi-stage build:
#   Stage 1 (builder) — compiles src/index.html (JSX) → public/index.html
#   Stage 2 (runtime) — serves the compiled public/ with production deps only
#
# IMPORTANT: Edit src/index.html (source). Never edit public/index.html directly.

# ── Stage 1: Build ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

COPY package*.json ./
RUN npm install

COPY src/ src/
COPY build.js .
RUN node build.js

# ── Stage 2: Runtime ─────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js .
COPY --from=builder /build/public/ public/

RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/ > /dev/null || exit 1

CMD ["node", "server.js"]
