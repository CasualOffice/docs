#!/usr/bin/env bash
# Helper: assume vite is reachable at http://localhost:5173 (the persistent
# `docker compose up editor` container already runs it) and just run
# playwright. Use playwright.docker.config.ts which drops the webServer block
# so playwright doesn't try to start a second vite.
#
# Bun is the only runtime in the bun image — no curl/wget. We probe with
# `bun -e fetch(...)` and start our own vite only if nothing's listening.
set -u

probe_ready() {
  bun -e 'try { const r = await fetch("http://localhost:5173", { signal: AbortSignal.timeout(2000) }); process.exit(r.ok ? 0 : 1) } catch { process.exit(1) }' >/dev/null 2>&1
}

if probe_ready; then
  echo "[run-e2e] vite already up — reusing"
else
  echo "[run-e2e] no vite listening; starting one"
  bun run dev > /tmp/vite.log 2>&1 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
  for i in $(seq 1 240); do
    if probe_ready; then
      echo "[run-e2e] vite ready after ${i}s"
      break
    fi
    sleep 1
  done
  if ! probe_ready; then
    echo "[run-e2e] vite never became ready" >&2
    tail -40 /tmp/vite.log >&2 || true
    exit 1
  fi
fi

PW_TEST_HTML_REPORT_OPEN=never bunx playwright test --config=playwright.docker.config.ts "$@"
