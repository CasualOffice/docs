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
}

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

	s.mu.Lock()
	defer s.mu.Unlock()
	s.evictIfNeededLocked()
	s.docs[docID] = &entry{
		contents:     append([]byte(nil), contents...), // defensive copy
		fileName:     fileName,
		lastAccessed: time.Now(),
		version:      1,
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
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.docs[docID]
	if !ok {
		return host.ErrNotFound
	}
	e.contents = append([]byte(nil), contents...)
	e.version++
	e.lastAccessed = time.Now()
	return nil
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
func (s *Store) evictIfNeededLocked() {
	if s.maxDocs <= 0 || len(s.docs) < s.maxDocs {
		return
	}
	var oldestID string
	var oldestAt time.Time
	for id, e := range s.docs {
		if oldestID == "" || e.lastAccessed.Before(oldestAt) {
			oldestID = id
			oldestAt = e.lastAccessed
		}
	}
	if oldestID != "" {
		delete(s.docs, oldestID)
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
