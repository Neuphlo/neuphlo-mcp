FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY app ./app
COPY vite.config.ts ./vite.config.ts
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app

LABEL org.opencontainers.image.title="Neuphlo MCP Template" \
      org.opencontainers.image.version="0.1.0"

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    MCP_APP_NAME="Documentation" \
    NEUPHLO_MCP_CONTENT_ROOT=/data/content \
    NEUPHLO_MCP_WRITE_MODE=direct

RUN addgroup -S mcp && adduser -S -G mcp -u 10001 mcp

COPY --from=build --chown=mcp:mcp /app/package.json ./package.json
COPY --from=build --chown=mcp:mcp /app/node_modules ./node_modules
COPY --from=build --chown=mcp:mcp /app/dist/src ./dist
COPY --from=build --chown=mcp:mcp /app/dist/ui ./ui
COPY --chown=mcp:mcp CUSTOMIZING.md ./CUSTOMIZING.md
COPY --chown=mcp:mcp README.md ./README.md
COPY --chown=mcp:mcp CHANGELOG.md ./CHANGELOG.md
COPY --chown=mcp:mcp content/README.md ./content/README.md
COPY --chown=mcp:mcp docs ./docs

USER mcp
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1

CMD ["node", "dist/index.js"]
