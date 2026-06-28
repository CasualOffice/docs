// Copyright (c) 2026 Casual Office. All rights reserved.

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
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/schnsrw/docx/backend/internal/host"
)

// DefaultRefreshLockInterval is how often the room manager fires
// host.Locker.RefreshLock against an active room. WOPI hosts
// typically time out a lock after ~30 min of inactivity; 10 min
// gives 3 attempts before expiry, which absorbs one or two transient
// network failures without losing the lock.
const DefaultRefreshLockInterval = 10 * time.Minute

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

	// drops counts broadcast frames Broadcast() couldn't queue
	// because Send was full. The y-websocket protocol recovers
	// (next SyncStep1 catches the client up), but a steady stream
	// of drops indicates a client persistently behind the rest of
	// the room. Broadcast logs a warn on every power-of-two
	// crossing so operators get a signal without log spam from a
	// chronically slow client.
	drops atomic.Uint64
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

	// lockID is the per-room WOPI lock token minted on first join
	// when the manager has a host.Locker capability. Empty for
	// hosts without locking (inline, local). The same lockID is
	// used for the eventual Unlock at drain time so the host
	// recognises the release as ours.
	lockID string
	// authToken is the access_token of the FIRST client to join,
	// retained so the Unlock at drain time can authenticate the
	// release. A later client's token would also work (WOPI hosts
	// don't care whose token unlocks as long as the lockID matches)
	// but tracking the first-join token keeps the lock lifecycle
	// tied to a known caller — easier to reason about in logs.
	authToken string
	// stopRefresh cancels the periodic RefreshLock goroutine spawned
	// for this room. nil for rooms without a Locker. Called by Leave
	// when the room drains so the goroutine exits cleanly before
	// Unlock fires.
	stopRefresh context.CancelFunc
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
			// up on the next SyncStep1. Log on power-of-two
			// crossings — first drop, then 2, 4, 8, ... — so
			// the operator gets a heads-up on falling-behind
			// clients without one slow client flooding the log.
			n := c.drops.Add(1)
			if n&(n-1) == 0 {
				slog.Warn("broadcast frame dropped (client buffer full)",
					"doc", r.docID, "client", c.id, "dropsTotal", n)
			}
		}
	}
}

// Manager is the registry of active rooms keyed by docId. The
// gateway's WS handler calls Join on connect and Leave on
// disconnect; Manager handles room creation + reclaim.
//
// MaxRooms (when > 0) caps the number of concurrent open documents.
// The docs gateway is stateless — rooms only exist while at least
// one client is connected — so the cap is a hard "this many docs
// open right now" ceiling rather than the sheets-style LRU over
// idle rooms. Joining an already-open room never counts against
// the cap.
type Manager struct {
	mu       sync.Mutex
	rooms    map[string]*Room
	nextID   atomic.Uint64
	onDrain  DrainFunc
	maxRooms int // 0 = unbounded
	// locker is the optional host.Locker capability. When non-nil,
	// the manager claims a WOPI-style lock on first join and
	// releases it on last leave. When nil, lock calls are skipped
	// (inline + local hosts).
	locker host.Locker
	// refreshInterval is how often locker.RefreshLock fires for
	// each live room. Defaults to DefaultRefreshLockInterval. Set
	// to 0 to disable the periodic refresh entirely (the lock will
	// then idle out host-side; suitable for short-lived test
	// fixtures).
	refreshInterval time.Duration
}

// ErrCapacityFull is returned by Join when MaxRooms is configured
// and a *new* docId would push past the cap. Joining an already-
// open docId never returns this error. The HTTP layer maps it to
// 503 + Retry-After.
var ErrCapacityFull = errors.New("room: capacity full")

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
	m := &Manager{
		rooms:           make(map[string]*Room),
		refreshInterval: DefaultRefreshLockInterval,
	}
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

// WithLocker registers a host.Locker capability. The manager calls
// Lock on first client join (mints a lockID per room), Unlock on
// last client leave. Hosts without locking (inline, local) leave
// this nil; the manager simply skips lock calls.
//
// A Lock failure with host.ErrConflict means the file is already
// locked by another editor; Join returns that error to the caller
// so the gateway can refuse the WS join.
func WithLocker(l host.Locker) ManagerOption {
	return func(m *Manager) { m.locker = l }
}

// WithRefreshLockInterval overrides the default 10-min cadence for
// the periodic RefreshLock call. Set to 0 to disable refresh
// entirely — the host's own lock TTL becomes the only timeout
// (which is fine for short-lived test fixtures).
func WithRefreshLockInterval(d time.Duration) ManagerOption {
	return func(m *Manager) {
		if d < 0 {
			d = 0
		}
		m.refreshInterval = d
	}
}

// WithMaxRooms caps the number of concurrently open rooms (docIds).
// Zero or negative disables the cap entirely (the default — useful
// for tests + dev). When set and the cap is reached, Join returns
// ErrCapacityFull for any docId that isn't already open; existing
// rooms continue accepting joiners without limit.
//
// Production typical: 256 — matches the sheets equivalent.
func WithMaxRooms(n int) ManagerOption {
	return func(m *Manager) {
		if n < 0 {
			n = 0
		}
		m.maxRooms = n
	}
}

// Join records a new client for docID. If the room doesn't yet
// exist, it's created; this is the future hook point for the
// host.Integration seed flow. Returns the Room and a fresh
// Client handle whose `Send` channel the caller should drain
// from a writer goroutine.
//
// authToken is the per-client access_token. The first client to
// join a room contributes its token + a freshly-minted lockID
// to the Room's lock state, so the drain-time Unlock can use
// them. Subsequent joiners ignore their tokens for lock purposes
// — the lock is already held.
//
// Returns ErrCapacityFull when MaxRooms is configured (>0) and a
// new docId would push the registry past the cap. Joining an
// existing docId NEVER returns this error — only new rooms count.
// Returns host.ErrConflict when the configured Locker rejects the
// Lock (another editor holds the file); the gateway maps that to a
// WS close.
//
// `m.mu` is held through `AddClient` to close the race against
// Leave: if Join released `m.mu` before AddClient, a concurrent
// Leave could observe `r.Clients() == 0`, delete the room from
// the registry, and fire the drain — then this Join's new client
// would end up on an orphaned room that's no longer in the
// manager. Holding the outer lock through the inner AddClient is
// safe: lock order is m.mu → r.mu, and Leave follows the same
// order in its drain branch (m.mu held while it reads
// r.Clients()).
func (m *Manager) Join(ctx context.Context, docID, authToken string) (*Room, *Client, error) {
	m.mu.Lock()
	r, ok := m.rooms[docID]
	if !ok {
		if m.maxRooms > 0 && len(m.rooms) >= m.maxRooms {
			m.mu.Unlock()
			return nil, nil, ErrCapacityFull
		}
		// New room — claim the host-side lock before publishing the
		// Room to the manager registry. A Lock failure surfaces as
		// host.ErrConflict (or whatever the host returned) and we
		// never register the room — so a subsequent Join for the
		// same docID will retry the lock claim.
		lockID := ""
		if m.locker != nil {
			lockID = newLockID()
			if err := m.locker.Lock(ctx, docID, lockID, authToken); err != nil {
				m.mu.Unlock()
				return nil, nil, err
			}
		}
		r = &Room{
			docID:     docID,
			clients:   make(map[*Client]struct{}),
			lockID:    lockID,
			authToken: authToken,
		}
		// Spawn the periodic RefreshLock goroutine so the host's
		// lock TTL doesn't expire on long editing sessions. Wired
		// only when a Locker is present AND a positive interval is
		// configured; zero interval disables refresh entirely.
		if m.locker != nil && m.refreshInterval > 0 {
			refreshCtx, cancel := context.WithCancel(context.Background())
			r.stopRefresh = cancel
			go m.refreshLoop(refreshCtx, docID, lockID, authToken)
		}
		m.rooms[docID] = r
		// First-client seed (M2) plugs in here: load the .docx via
		// host.Integration.Fetch, run it through the headless Bun
		// pool, and populate the Y.Doc before AddClient so the new
		// client SyncStep1s against a populated state instead of
		// the empty default. Tracked under improvement-tracker P0
		// #1 / P1 #6 / F4. Until then the room is created empty
		// and clients seed it via their own y-prosemirror update.
	}
	id := m.nextID.Add(1)
	c := r.AddClient(id)
	m.mu.Unlock()
	return r, c, nil
}

// refreshLoop calls locker.RefreshLock on a ticker until ctx is
// cancelled. Errors are logged at warn so an operator notices a
// host-side lock conflict (someone stole the lock) without the
// goroutine taking down the room — the lock-stolen UX is a future
// policy concern; for now we just keep trying so a transient
// network blip doesn't drop the lock prematurely.
//
// Lives at the Manager level rather than Room because the
// arguments it needs (docID, lockID, authToken) are immutable for
// the room's lifetime; passing them by value avoids any goroutine-
// vs-mutex coordination question.
func (m *Manager) refreshLoop(ctx context.Context, docID, lockID, authToken string) {
	t := time.NewTicker(m.refreshInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			err := m.locker.RefreshLock(ctx, docID, lockID, authToken)
			if err != nil && !errors.Is(err, context.Canceled) {
				slog.Warn("room: RefreshLock failed",
					"docID", docID, "err", err)
			}
		}
	}
}

// newLockID mints a 16-char hex token for a fresh WOPI lock. Length
// is short enough to fit in the X-WOPI-Lock header (some hosts cap
// at 1024 bytes; 16 is well under) and long enough to be
// collision-resistant within the lifetime of a deploy. Cryptographic
// randomness is overkill for non-secret IDs but cheap.
func newLockID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// rand.Read should never fail on a sane OS; a fallback isn't
		// worth the branching. Caller surfaces a 500 if the lock
		// claim subsequently fails.
		return "fallback-lock"
	}
	return hex.EncodeToString(b[:])
}

// Leave records a client disconnect. When the last client
// disconnects from a room, the room is removed from the manager
// and the DrainFunc (if any) is invoked — that's the hook the
// host.Integration snapshot wires into. When the manager has a
// Locker capability, the WOPI Unlock fires here too, before the
// drain func.
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
	lockID := r.lockID
	authToken := r.authToken
	locker := m.locker
	m.mu.Unlock()

	if !drained {
		return
	}
	// Stop the periodic RefreshLock goroutine before Unlock so the
	// next tick doesn't race the release and end up refreshing a
	// just-unlocked lockID (which the host would 409).
	if r.stopRefresh != nil {
		r.stopRefresh()
	}
	// Release the host-side lock before the drain func. A failure
	// here doesn't block the drain — the host will eventually expire
	// the lock on its own — but it's logged so an operator can
	// notice a steady stream of unlock failures.
	if locker != nil && lockID != "" {
		// Use a fresh context — the original request context is
		// already done by the time Leave fires. Bounded by the
		// locker implementation's own timeout (30s default for
		// WOPI).
		if err := locker.Unlock(context.Background(), docID, lockID, authToken); err != nil {
			slog.Warn("room drain: unlock failed",
				"docID", docID, "lockID", lockID, "err", err)
		}
	}
	if drain != nil {
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
