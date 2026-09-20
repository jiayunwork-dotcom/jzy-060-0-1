# ---- build the React/Vite frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- backend runtime ----
FROM node:20-alpine
WORKDIR /app/backend

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    TICK_INTERVAL_MS=1000 \
    RETENTION_MS=86400000

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

COPY backend/src ./src
# The backend serves the built SPA from STATIC_DIR.
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Durable storage: metric archive (per-source JSONL) + config.json
# (alert rules + dashboard layout).
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
