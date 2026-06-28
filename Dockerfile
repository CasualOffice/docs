# Casual Editor — bundled image.
#
# Single container that serves the Node CasualOffice/collab server
# (Hocuspocus WS broker on /yjs + REST: /api/rooms share-link/seed,
# /auth, /files, /wopi) AND the built editor SPA from the same origin:
#
#   docker run -p 8080:8080 casual-editor:latest
#   open http://localhost:8080/
#
# Upload a .docx, click Share, send the link to a friend, edit live.
# When everyone disconnects, the room drains; persist across restarts
# with CASUAL_STORAGE=local + a /data volume.
#
# This is the "collab" deployment shape. The single-user shapes
# (GitHub Pages demo, Tauri desktop) build the editor with collab
# disabled and don't need this image.
#
# Two stages:
#   1. web — bun + vite build of the React editor, with collab enabled
#            via VITE_COLLAB_ENABLED=true.
#   2. run — node:22 + the collab server (run via tsx) with the built
#            SPA mounted where it serves static from (../../web/dist
#            relative to collab/src → /app/web/dist).

# ─── Stage 1: build the SPA ────────────────────────────────────────
FROM oven/bun:1.3.14 AS web
WORKDIR /web

# Workspaces define the packages directly, so we copy the whole tree
# rather than try to do a deps-only layer (the workspace symlinks
# need every package's source to resolve).
COPY docx-editor/ ./

RUN bun install --frozen-lockfile

# Build core + react libs first, then the vite demo (collab enabled).
ENV VITE_COLLAB_ENABLED=true
RUN bun run build && bun run build:demo

# ─── Stage 2: runtime (collab server + SPA) ────────────────────────
# node:22 (not slim) so better-sqlite3's native build — needed only
# when personal-auth mode is enabled — has python3 + a toolchain.
FROM node:22 AS run
RUN groupadd -r casual && useradd -r -g casual casual

WORKDIR /app/collab

# Prod deps first for layer caching. tsx lives in dependencies, so the
# `node --import tsx src/index.ts` start script resolves without dev deps.
COPY collab/package.json ./
RUN npm install --omit=dev

COPY collab/ ./

# Place the built SPA where the collab server serves static from:
# resolve(<collab>/src, '../../web/dist') → /app/web/dist.
COPY --from=web /web/examples/vite/dist /app/web/dist

# Serve on :8080 to preserve the bundled image's port contract. The
# SPA reaches the WS broker same-origin at /yjs (App.tsx default).
ENV PORT=8080
ENV HOST=0.0.0.0
# DOCS deployment — the sheet app deploys the same image with .xlsx.
ENV CASUAL_FILE_EXT=.docx

USER casual
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
