# Casual Editor — bundled image.
#
# Single container that serves the Go gateway (WS broker + REST upload/
# download) AND the built editor SPA from the same origin. Users:
#
#   docker run -p 8080:8080 casual-editor:latest
#   open http://localhost:8080/
#
# Upload a .docx, click Share, send the link to a friend, edit live.
# When everyone disconnects, the room drains and the original bytes
# stay in the inline store until the container restarts.
#
# This is the "collab" deployment shape. The single-user shapes
# (GitHub Pages demo, Tauri desktop) build the editor with collab
# disabled and don't need this image.
#
# Three stages:
#   1. web   — bun + vite build of the React editor, with collab
#              enabled via VITE_COLLAB_ENABLED=true.
#   2. build — Go 1.24, statically-linked gateway binary.
#   3. run   — distroless-ish Alpine + ca-certs + binary + static.

# ─── Stage 1: build the SPA ────────────────────────────────────────
FROM oven/bun:1.3.14 AS web
WORKDIR /web

# Workspaces define the packages directly, so we copy the whole tree
# rather than try to do a deps-only layer (the workspace symlinks
# need every package's source to resolve).
# Copy the whole editor tree (excluding node_modules / build outputs
# via .dockerignore) — workspace resolution + per-package build
# scripts need access to scripts/, postcss config, assets/, etc.
COPY docx-editor/ ./

RUN bun install --frozen-lockfile

# Build core + react libs first, then the vite demo.
ENV VITE_COLLAB_ENABLED=true
RUN bun run build && bun run build:demo

# ─── Stage 2: build the Go gateway ─────────────────────────────────
FROM golang:1.24-alpine AS build
WORKDIR /src

COPY backend/go.mod backend/go.sum* ./
RUN go mod download

COPY backend ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/gateway ./cmd/gateway

# ─── Stage 3: runtime ──────────────────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tini && \
    addgroup -S casual && adduser -S casual -G casual

COPY --from=build /out/gateway /usr/local/bin/gateway
COPY --from=web /web/examples/vite/dist /srv/static

USER casual
ENV GATEWAY_ADDR=:8080
ENV STATIC_DIR=/srv/static
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/health > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/gateway"]
