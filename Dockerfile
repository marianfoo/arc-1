# =============================================================================
# ARC-1 (ABAP Relay Connector) — MCP Server for SAP ABAP systems
# Multi-stage build: npm ci + tsc → minimal Node.js runtime
#
# Build:  docker build -t arc-1 .
# Run:    docker run -p 8080:8080 -e SAP_URL=... -e SAP_USER=... arc-1
# =============================================================================

# --- Build Stage -------------------------------------------------------------
FROM node:22-alpine AS builder

# better-sqlite3 requires build tools for native addon compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Cache dependencies separately from source
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY ts-src/ ./ts-src/
RUN npm run build

# Remove dev dependencies for smaller image
RUN npm prune --omit=dev

# --- Runtime Stage -----------------------------------------------------------
FROM node:22-alpine

# tini: proper PID 1 init (handles SIGTERM gracefully)
# ca-certificates: needed for HTTPS connections to SAP systems
RUN apk add --no-cache tini ca-certificates

# Run as non-root user
RUN addgroup -S arc1 && adduser -S arc1 -G arc1
WORKDIR /home/arc1

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER arc1

# ─── Connection ──────────────────────────────────────────────────────────────
ENV SAP_URL=""
ENV SAP_USER=""
ENV SAP_PASSWORD=""
ENV SAP_CLIENT="001"
ENV SAP_LANGUAGE="EN"
ENV SAP_INSECURE="false"

# ─── Safety ──────────────────────────────────────────────────────────────────
ENV SAP_READ_ONLY="false"
ENV SAP_BLOCK_FREE_SQL="false"
ENV SAP_ALLOWED_OPS=""
ENV SAP_DISALLOWED_OPS=""
ENV SAP_ALLOWED_PACKAGES=""
ENV SAP_ALLOW_TRANSPORTABLE_EDITS="false"

# ─── MCP Transport ──────────────────────────────────────────────────────────
# http-streamable is the default for Docker (not stdio)
ENV SAP_TRANSPORT="http-streamable"
ENV SAP_HTTP_ADDR="0.0.0.0:8080"

# ─── Transport Management ───────────────────────────────────────────────────
ENV SAP_ENABLE_TRANSPORTS="false"

# ─── Feature Flags ──────────────────────────────────────────────────────────
ENV SAP_FEATURE_ABAPGIT="auto"
ENV SAP_FEATURE_RAP="auto"
ENV SAP_FEATURE_AMDP="auto"
ENV SAP_FEATURE_UI5="auto"
ENV SAP_FEATURE_TRANSPORT="auto"
ENV SAP_FEATURE_HANA="auto"

ENV SAP_VERBOSE="false"

EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
