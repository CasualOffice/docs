/**
 * End-to-end smoke for the co-edit path. Bring the gateway up
 * (`go run ./cmd/gateway` from `backend/`), then run:
 *
 *   bun backend/scripts/smoke-coedit.mjs
 *
 * Proves the full chain:
 *   1. POST /api/docs (upload) → gateway returns a docId.
 *   2. Two y-websocket clients dial /doc/{id}.
 *   3. Yjs sync handshake (MessageSyncStep1/2) completes for both
 *      clients without either side hanging.
 *   4. Client A's Y.Doc edit fans out to client B.
 *   5. Client B's edit fans out to client A (reverse path).
 *   6. The first client's `awareness` state reaches the second
 *      (presence — peer cursors depend on this).
 *
 * No Playwright, no React. Just raw Yjs over the real WS protocol.
 * If this passes, multi-peer editing works at the protocol layer
 * — every editor feature that goes through y-prosemirror's
 * ySyncPlugin will sync, because the gateway only relays frames.
 *
 * Exits with non-zero on any failure. Test runs in < 5 s.
 */
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const FIXTURE = join(repoRoot, 'docx-editor/e2e/fixtures/empty.docx');
const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:8080';
const WS_BASE = GATEWAY.replace(/^http/, 'ws');

function log(stage, msg) {
  console.log(`[${stage}] ${msg}`);
}
function die(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const health = await fetch(`${GATEWAY}/health`).catch(() => null);
if (!health || !health.ok) die(`gateway not reachable at ${GATEWAY}`);
log('init', `gateway healthy at ${GATEWAY}`);

// 1. Upload a real .docx so the room has a seed file to download.
const bytes = readFileSync(FIXTURE);
const upRes = await fetch(`${GATEWAY}/api/docs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'smoke.docx' },
  body: bytes,
});
if (!upRes.ok) die(`upload returned ${upRes.status}`);
const { docId } = await upRes.json();
if (!docId) die('upload response had no docId');
log('upload', `docId=${docId}`);

// 2. Open two y-websocket clients on the same room.
const docA = new Y.Doc();
const docB = new Y.Doc();
const provA = new WebsocketProvider(`${WS_BASE}/doc`, docId, docA, {
  WebSocketPolyfill: WebSocket,
});
const provB = new WebsocketProvider(`${WS_BASE}/doc`, docId, docB, {
  WebSocketPolyfill: WebSocket,
});

// Wait for both to report `connected` (the WebsocketProvider only
// flips to 'connected' after the WS upgrade succeeds AND the sync
// handshake exchanges StepX messages).
function awaitStatus(prov, want, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} never hit ${want}`)), 5000);
    if (prov.wsconnected) {
      clearTimeout(t);
      resolve();
      return;
    }
    prov.on('status', (e) => {
      if (e.status === want) {
        clearTimeout(t);
        resolve();
      }
    });
  });
}
await Promise.all([
  awaitStatus(provA, 'connected', 'provA'),
  awaitStatus(provB, 'connected', 'provB'),
]);
log('connect', 'both clients connected');

// Wait for the synced event so initial state vectors are exchanged
// before we start measuring edit fan-out.
function awaitSynced(prov, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} never synced`)), 5000);
    if (prov.synced) {
      clearTimeout(t);
      resolve();
      return;
    }
    prov.on('sync', (synced) => {
      if (synced) {
        clearTimeout(t);
        resolve();
      }
    });
  });
}
await Promise.all([awaitSynced(provA, 'provA'), awaitSynced(provB, 'provB')]);
log('sync', 'both clients synced');

// 3. A → B: write to A's shared text, wait for B to see it.
const textA = docA.getText('content');
const textB = docB.getText('content');
const aToB = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('B never saw A\'s edit')), 3000);
  const obs = () => {
    if (textB.toString().includes('HELLO-FROM-A')) {
      clearTimeout(t);
      textB.unobserve(obs);
      resolve();
    }
  };
  textB.observe(obs);
});
textA.insert(0, 'HELLO-FROM-A ');
await aToB;
log('a→b', `B saw ${JSON.stringify(textB.toString())}`);

// 4. B → A: same in reverse.
const bToA = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('A never saw B\'s edit')), 3000);
  const obs = () => {
    if (textA.toString().includes('REPLY-FROM-B')) {
      clearTimeout(t);
      textA.unobserve(obs);
      resolve();
    }
  };
  textA.observe(obs);
});
textB.insert(0, 'REPLY-FROM-B ');
await bToA;
log('b→a', `A saw ${JSON.stringify(textA.toString())}`);

// 5. Awareness (presence) — A sets its local awareness state, B
// reads it. y-prosemirror's cursor plugin uses this channel for
// peer cursors, so a working awareness path implies working
// remote cursors.
provA.awareness.setLocalStateField('user', { name: 'alice', color: '#f00' });
const awareDeadline = Date.now() + 3000;
let saw = null;
while (Date.now() < awareDeadline) {
  for (const [, state] of provB.awareness.getStates()) {
    if (state?.user?.name === 'alice') {
      saw = state.user;
      break;
    }
  }
  if (saw) break;
  await new Promise((r) => setTimeout(r, 50));
}
if (!saw) die('B never saw A in awareness states');
log('awareness', `B sees A as ${JSON.stringify(saw)}`);

// 6. The seeded .docx must still be downloadable post-edit (room
// drain hasn't fired yet because both clients are still
// connected; this just sanity-checks the /download endpoint
// while a live room exists).
const dlRes = await fetch(`${GATEWAY}/api/docs/${encodeURIComponent(docId)}/download`);
if (!dlRes.ok) die(`download returned ${dlRes.status}`);
const dlBytes = new Uint8Array(await dlRes.arrayBuffer());
if (dlBytes.byteLength === 0) die('download was empty');
log('download', `${dlBytes.byteLength} bytes (currently re-serves original upload — M2 will swap to live snapshot)`);

// 7. Rename — peer A renames via the shared metaMap. Peer B
// observes the change. PATCH /api/docs/{id}/rename also updates
// the server-side metadata so a future joiner sees the new name
// in the Content-Disposition header.
const metaA = docA.getMap('meta');
const metaB = docB.getMap('meta');
const renameSeen = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('B never saw rename')), 3000);
  const obs = () => {
    if (metaB.get('fileName') === 'renamed-by-A.docx') {
      clearTimeout(t);
      metaB.unobserve(obs);
      resolve();
    }
  };
  metaB.observe(obs);
});
metaA.set('fileName', 'renamed-by-A.docx');
const renameRes = await fetch(`${GATEWAY}/api/docs/${encodeURIComponent(docId)}/rename`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileName: 'renamed-by-A.docx' }),
});
if (!renameRes.ok) die(`PATCH /rename returned ${renameRes.status}`);
await renameSeen;
log('rename', `B saw new fileName ${JSON.stringify(metaB.get('fileName'))}`);

// 8. New joiners see the new name on download.
const dlAfter = await fetch(`${GATEWAY}/api/docs/${encodeURIComponent(docId)}/download`, {
  method: 'HEAD',
});
const disp = dlAfter.headers.get('content-disposition') ?? '';
if (!disp.includes('renamed-by-A.docx')) {
  die(`Content-Disposition didn't carry new name: ${disp}`);
}
log('rename-server', `download Content-Disposition: ${disp}`);

provA.destroy();
provB.destroy();
console.log('\nALL PASS — co-edit path verified end-to-end (incl. rename).');
process.exit(0);
