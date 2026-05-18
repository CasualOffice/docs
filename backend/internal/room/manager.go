// Package room owns the lifecycle of every in-memory Y.Doc the
// gateway is currently serving.
//
// Lifecycle (per docs/05-backend-design.md):
//
//  1. First client for a docId triggers seed: load .docx from
//     WOPI, deserialize via the headless Bun pool, populate the
//     Y.Doc.
//  2. Subsequent clients sync-step against the in-memory Y.Doc.
//  3. Last client to disconnect triggers snapshot: serialize the
//     Y.Doc → .docx, PUT back to WOPI, drop the Room from the
//     manager so its memory is reclaimed.
//
// M1 scaffold: this file ships the manager + Room struct with
// thread-safe join/leave but without the WOPI seed/snapshot
// hooks. Those land in a follow-up commit alongside the WOPI
// client + protocol-driven update broadcasting.
package room

import (
	"sync"
)

// Room is the per-docId in-memory state. The authoritative Y.Doc
// (a placeholder `[]byte` for now; will be a wrapper over the
// Yjs binary state once the protocol layer is wired) sits here
// alongside the active client count.
//
// Future fields:
//   - doc      *yjs.Doc            // CRDT state
//   - clients  map[uuid.UUID]chan  // per-client write channels
//   - drainer  chan struct{}       // triggers WOPI snapshot
//   - lastSeen time.Time           // for idle-eviction policies
type Room struct {
	mu      sync.RWMutex
	docID   string
	clients int
}

// Clients returns the current number of connected clients. Safe
// to call from any goroutine.
func (r *Room) Clients() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.clients
}

// DocID returns the document identifier this room is serving.
func (r *Room) DocID() string {
	return r.docID
}

// Manager is the registry of active rooms keyed by docId. The
// gateway's WS handler calls Join on connect and Leave on
// disconnect; Manager handles room creation + reclaim.
type Manager struct {
	mu    sync.Mutex
	rooms map[string]*Room
}

// NewManager constructs an empty Manager. Rooms are lazily
// allocated on first Join.
func NewManager() *Manager {
	return &Manager{rooms: make(map[string]*Room)}
}

// Join records a new client for docID. If the room doesn't yet
// exist, it's created; this is the future hook point for the
// WOPI seed flow. Returns a snapshot of the Room so the caller
// can read its current state without holding the manager lock.
func (m *Manager) Join(docID string) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.rooms[docID]
	if !ok {
		r = &Room{docID: docID}
		m.rooms[docID] = r
		// TODO(m2): WOPI GetFile + Y.Doc seed.
	}
	r.mu.Lock()
	r.clients++
	r.mu.Unlock()
	return r
}

// Leave records a client disconnect. When the last client
// disconnects from a room, the room is removed from the manager;
// in M2 this is also the trigger for the WOPI snapshot worker.
func (m *Manager) Leave(docID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.rooms[docID]
	if !ok {
		return
	}
	r.mu.Lock()
	r.clients--
	clients := r.clients
	r.mu.Unlock()
	if clients <= 0 {
		// TODO(m2): trigger WOPI PutFile snapshot before dropping.
		delete(m.rooms, docID)
	}
}

// Count returns the number of currently active rooms. Useful for
// health / metrics.
func (m *Manager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.rooms)
}
