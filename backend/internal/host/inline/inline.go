// Package inline is the host.Integration that keeps documents in
// process memory keyed by docId. Powers the v0 share-link flow:
//
//  1. User POSTs a .docx to /api/docs → gateway calls Store(),
//     mints a docId, returns the share URL.
//  2. Anyone connecting to /doc/{docId} via WS triggers a Fetch
//     to seed the room's Y.Doc state.
//  3. Last-disconnect snapshot writes back via Snapshot.
//  4. GET /api/docs/{id}/download streams the latest bytes out.
//
// No external host. Process restart wipes every doc — acceptable
// for v0; the user re-uploads. A future wopi or jwtapi
// integration replaces this struct without touching the room
// manager (everything goes through host.Integration).
//
// Capacity bound: stores up to `maxDocs` documents; oldest-by-
// last-access evicted under pressure. v0 ceiling is generous
// (1000 docs) — far past any realistic "one user spins up a
// container and demos it" scale.
package inline

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/schnsrw/docx/backend/internal/host"
)

// Store is the inline host.Integration implementation.
type Store struct {
	mu      sync.RWMutex
	docs    map[string]*entry
	maxDocs int
}

type entry struct {
	contents     []byte
	fileName     string
	lastAccessed time.Time
	version      uint64
	// revisions is the append-only metadata log for this doc: one
	// entry on creation (version 1) and one per Snapshot. Capped at
	// maxRevisions (oldest dropped) so a long-lived doc with many
	// save cycles doesn't grow unbounded. Powers GET
	// /api/docs/{id}/history (Stream A1 of the parity pipeline).
	//
	// Powers GET /api/docs/{id}/history.
	revisions []RevisionMeta
	// revBytes retains the .docx bytes per revision version so the
	// editor can restore a past version (host.RevisionStore). Pruned
	// in lockstep with `revisions` (same maxRevisions window). Keyed
	// by RevisionMeta.Version.
	revBytes map[uint64][]byte
}

// RevisionMeta is a type alias for the shared host.RevisionMeta so
// callers (gateway handlers, tests) that reference inline.RevisionMeta
// still compile after the type was promoted to the host package. The
// shared type lets every backend (inline, local, future remote) emit
// the same wire shape from History.
type RevisionMeta = host.RevisionMeta

// maxRevisions caps the per-doc revision log. 100 save cycles is far
// past any realistic share-link session; the oldest entries roll off.
const maxRevisions = 100

// New returns an empty Store with the default capacity ceiling
// (1000 documents). Pass `WithMaxDocs(n)` to change it.
func New(opts ...Option) *Store {
	s := &Store{
		docs:    make(map[string]*entry),
		maxDocs: 1000,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// Option is a functional option for Store construction.
type Option func(*Store)

// WithMaxDocs caps the number of in-memory documents. Once
// reached, the least-recently-accessed doc is evicted on the
// next Store call. Set to 0 for unbounded (tests only).
func WithMaxDocs(n int) Option {
	return func(s *Store) { s.maxDocs = n }
}

// Store ingests a freshly-uploaded .docx and returns a new
// docId. The docId is a URL-safe random token; the caller uses
// it to construct a share URL like `/r/{docId}`.
func (s *Store) Store(fileName string, contents []byte) (string, error) {
	if len(contents) == 0 {
		return "", errors.New("inline: empty contents")
	}
	docID, err := newDocID()
	if err != nil {
		return "", fmt.Errorf("inline: mint docId: %w", err)
	}

	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.evictIfNeededLocked()
	s.docs[docID] = &entry{
		contents:     append([]byte(nil), contents...), // defensive copy
		fileName:     fileName,
		lastAccessed: now,
		version:      1,
		revisions: []RevisionMeta{
			{Version: 1, SavedAt: now, SizeBytes: len(contents)},
		},
		revBytes: map[uint64][]byte{
			1: append([]byte(nil), contents...),
		},
	}
	return docID, nil
}

// Fetch implements host.Integration. authToken is ignored.
func (s *Store) Fetch(_ context.Context, docID, _ string) ([]byte, *host.FileInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.docs[docID]
	if !ok {
		return nil, nil, host.ErrNotFound
	}
	e.lastAccessed = time.Now()
	bytes := append([]byte(nil), e.contents...) // copy for caller
	info := &host.FileInfo{
		FileName:     e.fileName,
		Version:      fmt.Sprintf("%d", e.version),
		UserCanWrite: true, // inline = anonymous full-edit
	}
	return bytes, info, nil
}

// Snapshot implements host.Integration. Increments the in-memory
// version so a future Fetch can advertise it.
func (s *Store) Snapshot(_ context.Context, docID, _ string, contents []byte) error {
	if len(contents) == 0 {
		return errors.New("inline: empty snapshot")
	}
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.docs[docID]
	if !ok {
		return host.ErrNotFound
	}
	e.contents = append([]byte(nil), contents...)
	e.version++
	e.lastAccessed = now
	e.revisions = append(e.revisions, RevisionMeta{
		Version:   e.version,
		SavedAt:   now,
		SizeBytes: len(contents),
	})
	if e.revBytes == nil {
		e.revBytes = make(map[uint64][]byte)
	}
	e.revBytes[e.version] = append([]byte(nil), contents...)
	// Roll off the oldest revisions past the cap. Keep the tail
	// (most-recent maxRevisions) so the history always shows the
	// latest saves; drop the matching per-revision bytes too.
	if len(e.revisions) > maxRevisions {
		drop := e.revisions[:len(e.revisions)-maxRevisions]
		for _, r := range drop {
			delete(e.revBytes, r.Version)
		}
		e.revisions = e.revisions[len(e.revisions)-maxRevisions:]
	}
	return nil
}

// FetchRevision implements host.RevisionStore: returns the .docx bytes
// of a specific past revision so the editor can restore it. Returns
// host.ErrNotFound if the doc or version is unknown (e.g. rolled off
// past the maxRevisions window).
func (s *Store) FetchRevision(docID string, version uint64) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.docs[docID]
	if !ok {
		return nil, host.ErrNotFound
	}
	b, ok := e.revBytes[version]
	if !ok {
		return nil, host.ErrNotFound
	}
	return append([]byte(nil), b...), nil // copy for caller
}

// History returns a copy of the revision-metadata log for docID,
// newest-last (creation first). Returns host.ErrNotFound for an
// unknown doc. The slice is a copy — callers can't mutate the
// store's internal log.
func (s *Store) History(docID string) ([]RevisionMeta, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.docs[docID]
	if !ok {
		return nil, host.ErrNotFound
	}
	out := make([]RevisionMeta, len(e.revisions))
	copy(out, e.revisions)
	return out, nil
}

// Rename updates the stored fileName so a subsequent /download
// advertises the new name in Content-Disposition. Does not bump
// the version — the file CONTENT hasn't changed, only its
// metadata. Used by the live-rename path: when a peer renames the
// doc in the editor, the React layer PATCHes here so the server
// stays in sync with the (Y.Map-synchronised) client state.
func (s *Store) Rename(docID, newName string) error {
	if newName == "" {
		return errors.New("inline: empty fileName")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.docs[docID]
	if !ok {
		return host.ErrNotFound
	}
	e.fileName = newName
	e.lastAccessed = time.Now()
	return nil
}

// Delete drops a doc from the store. Used by an explicit teardown
// path (host UI's "stop sharing" button, future) and during
// eviction.
func (s *Store) Delete(docID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.docs[docID]
	if ok {
		delete(s.docs, docID)
	}
	return ok
}

// Count returns the number of stored docs. Useful for metrics
// and tests.
func (s *Store) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.docs)
}

// evictIfNeededLocked drops the least-recently-accessed entry
// when adding a fresh doc would exceed maxDocs. Caller must hold
// the write lock.
//
// Eviction is a data-loss event in the inline backend: there is
// no external persistence layer, so the bytes for the evicted doc
// are gone. Log loudly so the operator can either bump maxDocs or
// swap in a persistent host integration before the next demo.
func (s *Store) evictIfNeededLocked() {
	if s.maxDocs <= 0 || len(s.docs) < s.maxDocs {
		return
	}
	var oldestID string
	var oldestAt time.Time
	var oldestSize int
	for id, e := range s.docs {
		if oldestID == "" || e.lastAccessed.Before(oldestAt) {
			oldestID = id
			oldestAt = e.lastAccessed
			oldestSize = len(e.contents)
		}
	}
	if oldestID != "" {
		delete(s.docs, oldestID)
		slog.Warn("inline host evicted least-recently-accessed doc — bytes lost",
			"docID", oldestID,
			"bytes", oldestSize,
			"lastAccessed", oldestAt.Format(time.RFC3339),
			"maxDocs", s.maxDocs,
		)
	}
}

// newDocID returns a URL-safe 16-byte random token (22 chars
// after base64 stripping). Collision odds at 1000 docs are
// ~2^-117, comfortably below the eviction-driven recycling rate.
func newDocID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}
