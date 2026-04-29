# ── SWAPS ────────────────────────────────────────────────────────
# src/index.html is pre-compiled (React.createElement, no JSX runtime).
# public/index.html is the compiled copy committed alongside src/.
# No Babel build step needed — copy public/ directly.

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js .
COPY public/ public/

RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/ > /dev/null || exit 1

CMD ["node", "server.js"]
