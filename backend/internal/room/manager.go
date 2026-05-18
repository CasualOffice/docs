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
	"sync/atomic"
)

// outboundQueue is the per-client buffered channel of binary frames
// waiting to be written to the websocket. Sized to absorb a small
// burst of updates without blocking the broadcast path — when a
// client falls this far behind, the room drops the frame rather
// than block every other peer.
const outboundQueue = 64

// Client is one connected websocket in a room. The room holds a
// pointer to it; the gateway's writer goroutine drains `Send` and
// pumps frames to the underlying conn.
//
// Equality on `*Client` is pointer equality — Broadcast uses that
// to skip the sender. Clients are allocated by `Room.AddClient`,
// removed by `Room.RemoveClient`; callers never construct them
// directly.
type Client struct {
	// Send carries binary frames the writer goroutine should
	// dispatch over the websocket. Closed by RemoveClient as the
	// "writer can exit" signal.
	Send chan []byte

	// id is a monotonically-increasing per-process counter used
	// for stable identification in logs. Not meaningful across
	// process restarts.
	id uint64
}

// ID returns this client's per-process identifier. Stable for the
// lifetime of the connection.
func (c *Client) ID() uint64 { return c.id }

// Room is the per-docId in-memory state. Tracks every connected
// Client in a set so Broadcast can fan a frame out to peers
// without holding a write-lock during channel sends.
//
// Future fields (M2+):
//   - doc          authoritative Y.Doc bytes (host integration seed)
//   - drainCh      triggers host.Snapshot on last-disconnect
//   - lastSeen     time.Time for idle-eviction policies
type Room struct {
	mu      sync.RWMutex
	docID   string
	clients map[*Client]struct{}
}

// Clients returns the current number of connected clients. Safe
// to call from any goroutine.
func (r *Room) Clients() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}

// DocID returns the document identifier this room is serving.
func (r *Room) DocID() string {
	return r.docID
}

// AddClient registers a fresh websocket connection and returns a
// Client handle. The caller spawns a writer goroutine draining
// `client.Send` and a reader goroutine that calls Broadcast for
// each inbound frame.
func (r *Room) AddClient(id uint64) *Client {
	c := &Client{
		Send: make(chan []byte, outboundQueue),
		id:   id,
	}
	r.mu.Lock()
	r.clients[c] = struct{}{}
	r.mu.Unlock()
	return c
}

// RemoveClient deregisters a client and closes its Send channel
// (signaling the writer goroutine to exit). Idempotent — calling
// twice on the same client is a no-op.
func (r *Room) RemoveClient(c *Client) {
	r.mu.Lock()
	_, present := r.clients[c]
	if present {
		delete(r.clients, c)
		close(c.Send)
	}
	r.mu.Unlock()
}

// Broadcast forwards a binary frame to every connected client
// EXCEPT the sender. Drops the frame for any client whose Send
// buffer is full — the y-websocket protocol is tolerant of
// dropped Update messages (the next SyncStep1 will reconcile),
// so per-frame backpressure is preferable to head-of-line
// blocking on the broadcast path.
//
// `sender` may be nil for server-originated frames (the future
// initial-sync-from-host path), in which case every client
// receives the frame.
func (r *Room) Broadcast(sender *Client, frame []byte) {
	// Copy the recipient list under the read-lock so the
	// per-client channel sends happen without holding it. Even
	// in a 100-client room the slice is cheap; the alternative
	// (sending while locked) would let one slow client throttle
	// every other peer for the duration of its send.
	r.mu.RLock()
	recipients := make([]*Client, 0, len(r.clients))
	for c := range r.clients {
		if c == sender {
			continue
		}
		recipients = append(recipients, c)
	}
	r.mu.RUnlock()

	for _, c := range recipients {
		select {
		case c.Send <- frame:
			// queued
		default:
			// Buffer full; drop. The Yjs sync protocol catches
			// up on the next SyncStep1.
		}
	}
}

// Manager is the registry of active rooms keyed by docId. The
// gateway's WS handler calls Join on connect and Leave on
// disconnect; Manager handles room creation + reclaim.
type Manager struct {
	mu      sync.Mutex
	rooms   map[string]*Room
	nextID  atomic.Uint64
	onDrain DrainFunc
}

// DrainFunc is invoked once when the last client leaves a room,
// just before the manager forgets the room. The implementation
// should kick off whatever snapshot/persistence work the host
// integration requires; the call is synchronous but cheap because
// the actual host I/O happens in a goroutine the impl spawns.
//
// `docID` is the doc the room was serving. Errors are logged and
// otherwise ignored — the room is dropped regardless so the
// memory is reclaimed.
type DrainFunc func(docID string)

// NewManager constructs an empty Manager. Rooms are lazily
// allocated on first Join.
func NewManager(opts ...ManagerOption) *Manager {
	m := &Manager{rooms: make(map[string]*Room)}
	for _, o := range opts {
		o(m)
	}
	return m
}

// ManagerOption is a functional option for Manager construction.
type ManagerOption func(*Manager)

// WithDrainFunc registers a callback fired when the last client
// leaves a room. This is where the host.Integration snapshot is
// wired in (see cmd/gateway/main.go for the v0 wiring).
func WithDrainFunc(fn DrainFunc) ManagerOption {
	return func(m *Manager) { m.onDrain = fn }
}

// Join records a new client for docID. If the room doesn't yet
// exist, it's created; this is the future hook point for the
// host.Integration seed flow. Returns the Room and a fresh
// Client handle whose `Send` channel the caller should drain
// from a writer goroutine.
func (m *Manager) Join(docID string) (*Room, *Client) {
	m.mu.Lock()
	r, ok := m.rooms[docID]
	if !ok {
		r = &Room{docID: docID, clients: make(map[*Client]struct{})}
		m.rooms[docID] = r
		// TODO(m2): host.Integration.Fetch + Y.Doc seed.
	}
	m.mu.Unlock()
	id := m.nextID.Add(1)
	c := r.AddClient(id)
	return r, c
}

// Leave records a client disconnect. When the last client
// disconnects from a room, the room is removed from the manager
// and the DrainFunc (if any) is invoked — that's the hook the
// host.Integration snapshot wires into.
//
// `r` and `c` come from a prior Join.
func (m *Manager) Leave(r *Room, c *Client) {
	if r == nil {
		return
	}
	r.RemoveClient(c)
	m.mu.Lock()
	// Re-check via the room registry — a concurrent Join could
	// have added more clients between RemoveClient and here. We
	// only reclaim when the room is genuinely empty.
	stored, ok := m.rooms[r.DocID()]
	if !ok || stored != r {
		m.mu.Unlock()
		return
	}
	drained := false
	if r.Clients() == 0 {
		delete(m.rooms, r.DocID())
		drained = true
	}
	drain := m.onDrain
	docID := r.DocID()
	m.mu.Unlock()

	if drained && drain != nil {
		drain(docID)
	}
}

// Count returns the number of currently active rooms. Useful for
// health / metrics.
func (m *Manager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.rooms)
}

// Lookup returns the Room for docID, or nil if no room is open.
// Used by HTTP handlers that need read-only access to room state
// (e.g. /api/rooms/{id}/info) without forcing a Join.
func (m *Manager) Lookup(docID string) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.rooms[docID]
}
