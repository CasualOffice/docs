// Copyright (c) 2026 Casual Office. All rights reserved.

// Package local is a filesystem-backed host.Integration. Docs
// persist to a directory on the host filesystem so they survive
// container restarts — the foundation for the Standalone deploy
// mode (Docker + bind-mount /data). Mirrors the design of sheet's
// apps/server/src/host/local.ts but in Go.
//
// Layout under the root directory:
//
//	<root>/
//	  <docId>.docx           — raw .docx bytes (current snapshot)
//	  <docId>.meta.json      — { fileName, version, savedAt,
//	                             revisions: [...] }
//
// Two-file shape (not a single envelope) so operators can grab
// `.docx` files directly via shell if they ever want to bypass
// the gateway. The meta sidecar is small and easily
// reconstructable from the .docx if it's lost.
//
// Atomic writes: every Snapshot writes to `<file>.tmp` first then
// renames to the final path. POSIX guarantees rename atomicity on
// the same filesystem, so readers either see the previous
// version or the new one — never a half-written file.
package local

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/schnsrw/docx/backend/internal/host"
)

// docMeta is the JSON sidecar persisted alongside each .docx. The
// shape is intentionally small so it loads in microseconds even on
// a directory with thousands of docs. Revision entries use the
// shared host.RevisionMeta so the gateway's history handler can
// serialize them without per-store branching.
type docMeta struct {
	FileName  string              `json:"fileName"`
	Version   uint64              `json:"version"`
	SavedAt   time.Time           `json:"savedAt"`
	Revisions []host.RevisionMeta `json:"revisions"`
}

// maxRevisions matches the inline cap. Once a doc has 100 saves
// the oldest entries roll off the front of the slice; the .docx
// itself is never trimmed (always the latest snapshot only).
const maxRevisions = 100

// Store is the local-filesystem host.Integration implementation.
type Store struct {
	root string
	// mu serializes all FS operations. The store-once read/write
	// volume is far below disk throughput, and most ops are quick
	// (a few kB sidecar + a few-MB .docx). One global mutex keeps
	// the implementation simple and avoids any TOCTOU between
	// stat/rename. A per-doc mutex map would only be worth it if
	// concurrent multi-doc Snapshot rate exceeded the IO ceiling,
	// which won't happen on a single-node deploy.
	mu sync.Mutex
}

// New returns a Store rooted at the given directory. The directory
// is created (with parents) if it doesn't exist. Failing to make
// the dir is fatal — callers should treat it as a misconfigured
// CASUAL_LOCAL_PATH and exit.
func New(root string) (*Store, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("local: resolve root: %w", err)
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, fmt.Errorf("local: mkdir root %q: %w", abs, err)
	}
	return &Store{root: abs}, nil
}

// Root returns the resolved absolute path of the store's root
// directory. Useful for logging and tests.
func (s *Store) Root() string { return s.root }

// Store ingests a freshly-uploaded .docx and returns a new docId.
// Mirrors inline.Store's contract so the gateway's upload handler
// is host-agnostic.
func (s *Store) Store(fileName string, contents []byte) (string, error) {
	if len(contents) == 0 {
		return "", errors.New("local: empty contents")
	}
	docID, err := newDocID()
	if err != nil {
		return "", fmt.Errorf("local: mint docId: %w", err)
	}

	now := time.Now().UTC()
	meta := docMeta{
		FileName: fileName,
		Version:  1,
		SavedAt:  now,
		Revisions: []host.RevisionMeta{
			{Version: 1, SavedAt: now, SizeBytes: len(contents)},
		},
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.writeDocxAtomic(docID, contents); err != nil {
		return "", err
	}
	if err := s.writeRevisionAtomic(docID, 1, contents); err != nil {
		_ = os.Remove(s.docxPath(docID))
		return "", err
	}
	if err := s.writeMetaAtomic(docID, meta); err != nil {
		// Rollback: best-effort remove the .docx so the next Store
		// doesn't see a half-created doc.
		_ = os.Remove(s.docxPath(docID))
		_ = os.Remove(s.revPath(docID, 1))
		return "", err
	}
	return docID, nil
}

// Fetch implements host.Integration. authToken is ignored — local
// host has no auth surface; auth is the deploy mode's problem.
func (s *Store) Fetch(_ context.Context, docID, _ string) ([]byte, *host.FileInfo, error) {
	if !safeDocID.MatchString(docID) {
		return nil, nil, host.ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	meta, err := s.readMeta(docID)
	if err != nil {
		return nil, nil, err
	}
	bytes, err := os.ReadFile(s.docxPath(docID))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil, host.ErrNotFound
		}
		return nil, nil, fmt.Errorf("local: read docx %q: %w", docID, err)
	}
	info := &host.FileInfo{
		FileName:     meta.FileName,
		Version:      fmt.Sprintf("%d", meta.Version),
		UserCanWrite: true,
	}
	return bytes, info, nil
}

// Snapshot persists the latest .docx and appends a revision entry
// to the meta log. Both files are written atomically (write tmp +
// rename) so partial failures leave the previous version intact.
func (s *Store) Snapshot(_ context.Context, docID, _ string, contents []byte) error {
	if len(contents) == 0 {
		return errors.New("local: empty snapshot")
	}
	if !safeDocID.MatchString(docID) {
		return host.ErrNotFound
	}
	now := time.Now().UTC()
	s.mu.Lock()
	defer s.mu.Unlock()
	meta, err := s.readMeta(docID)
	if err != nil {
		return err
	}
	if err := s.writeDocxAtomic(docID, contents); err != nil {
		return err
	}
	meta.Version++
	meta.SavedAt = now
	meta.Revisions = append(meta.Revisions, host.RevisionMeta{
		Version:   meta.Version,
		SavedAt:   now,
		SizeBytes: len(contents),
	})
	if err := s.writeRevisionAtomic(docID, meta.Version, contents); err != nil {
		return err
	}
	if len(meta.Revisions) > maxRevisions {
		meta.Revisions = meta.Revisions[len(meta.Revisions)-maxRevisions:]
		// Drop the per-revision bytes that just rolled off the window.
		// Versions are monotonic +1, so version (V-maxRevisions) is gone.
		if meta.Version > maxRevisions {
			_ = os.Remove(s.revPath(docID, meta.Version-maxRevisions))
		}
	}
	if err := s.writeMetaAtomic(docID, meta); err != nil {
		slog.Warn("local: meta write failed after docx snapshot — log mismatch",
			"docId", docID, "err", err)
		return err
	}
	return nil
}

// Rename updates the stored fileName so a subsequent /download
// surfaces the new name in the Content-Disposition header. Does
// not touch revision history — file renames aren't an edit.
// Returns ErrNotFound if the doc isn't known.
func (s *Store) Rename(docID, newName string) error {
	if newName == "" {
		return errors.New("local: rename to empty name")
	}
	if !safeDocID.MatchString(docID) {
		return host.ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	meta, err := s.readMeta(docID)
	if err != nil {
		return err
	}
	meta.FileName = newName
	return s.writeMetaAtomic(docID, meta)
}

// Delete removes a doc and its meta sidecar from disk. Best-effort:
// missing files are treated as success so a double-delete is a no-op
// rather than an error the caller has to ignore. Returns ErrNotFound
// only when the docID itself is malformed; a missing-on-disk doc maps
// to nil so the HTTP layer can return 204 for both "deleted now" and
// "was already gone".
func (s *Store) Delete(docID string) error {
	if !safeDocID.MatchString(docID) {
		return host.ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	// Remove docx + meta independently; only surface a real error,
	// not "already absent". A meta-without-docx (or vice versa) gets
	// cleaned up here too.
	for _, p := range []string{s.docxPath(docID), s.metaPath(docID)} {
		if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("local: remove %q: %w", p, err)
		}
	}
	// Sweep per-revision blobs (<docId>.v<N>.docx). docID is regex-safe
	// (no glob metacharacters), so the pattern can't escape the root.
	if revs, err := filepath.Glob(filepath.Join(s.root, docID+".v*.docx")); err == nil {
		for _, p := range revs {
			_ = os.Remove(p)
		}
	}
	return nil
}

// Summary is the public-facing shape returned by List — one entry
// per doc. Big-payload fields (revision log, full meta) are
// intentionally omitted so a `/files` response stays small even on
// users with thousands of docs.
type Summary struct {
	DocID    string    `json:"docId"`
	FileName string    `json:"fileName"`
	Version  uint64    `json:"version"`
	SavedAt  time.Time `json:"savedAt"`
	Size     int64     `json:"size"`
}

// List enumerates every doc under the store's root, returning a
// summary per entry. Sorted by SavedAt descending so the most
// recently edited doc lands at the top of a `/files` list without
// the client needing to sort. Empty root returns an empty slice
// (not an error).
func (s *Store) List(_ context.Context) ([]Summary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, err := os.ReadDir(s.root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("local: read root: %w", err)
	}
	out := make([]Summary, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		const suffix = ".meta.json"
		if !strings.HasSuffix(name, suffix) {
			continue
		}
		docID := strings.TrimSuffix(name, suffix)
		meta, err := s.readMeta(docID)
		if err != nil {
			slog.Warn("local: skip unreadable meta during List", "docId", docID, "err", err)
			continue
		}
		info, err := os.Stat(s.docxPath(docID))
		if err != nil {
			slog.Warn("local: skip meta without docx during List", "docId", docID, "err", err)
			continue
		}
		out = append(out, Summary{
			DocID:    docID,
			FileName: meta.FileName,
			Version:  meta.Version,
			SavedAt:  meta.SavedAt,
			Size:     info.Size(),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].SavedAt.After(out[j].SavedAt)
	})
	return out, nil
}

// History returns the revision-metadata log for docID, oldest-first.
// Returns host.ErrNotFound for an unknown doc.
func (s *Store) History(docID string) ([]host.RevisionMeta, error) {
	if !safeDocID.MatchString(docID) {
		return nil, host.ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	meta, err := s.readMeta(docID)
	if err != nil {
		return nil, err
	}
	out := make([]host.RevisionMeta, len(meta.Revisions))
	copy(out, meta.Revisions)
	return out, nil
}

// ---------------------------------------------------------------
// Internals
// ---------------------------------------------------------------

// safeDocID restricts paths to URL-safe base64 characters. newDocID
// emits 22-char tokens of this shape; any input that doesn't match
// gets treated as a 404 to defeat path traversal attempts at the
// type-system level.
var safeDocID = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

func (s *Store) docxPath(docID string) string {
	return filepath.Join(s.root, docID+".docx")
}

func (s *Store) revPath(docID string, version uint64) string {
	return filepath.Join(s.root, fmt.Sprintf("%s.v%d.docx", docID, version))
}

// writeRevisionAtomic persists the immutable .docx bytes of one
// revision (write tmp + rename) so a partial write never leaves a
// truncated revision blob behind.
func (s *Store) writeRevisionAtomic(docID string, version uint64, contents []byte) error {
	final := s.revPath(docID, version)
	tmp := final + ".tmp"
	if err := os.WriteFile(tmp, contents, 0o644); err != nil {
		return fmt.Errorf("local: write revision tmp %q v%d: %w", docID, version, err)
	}
	if err := os.Rename(tmp, final); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("local: rename revision %q v%d: %w", docID, version, err)
	}
	return nil
}

// FetchRevision implements host.RevisionStore: the .docx bytes of a
// specific past revision (for version restore). Returns
// host.ErrNotFound when the doc or version is unknown — including
// versions that rolled off the maxRevisions window.
func (s *Store) FetchRevision(docID string, version uint64) ([]byte, error) {
	if !safeDocID.MatchString(docID) {
		return nil, host.ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	b, err := os.ReadFile(s.revPath(docID, version))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, host.ErrNotFound
		}
		return nil, fmt.Errorf("local: read revision %q v%d: %w", docID, version, err)
	}
	return b, nil
}

func (s *Store) metaPath(docID string) string {
	return filepath.Join(s.root, docID+".meta.json")
}

func (s *Store) readMeta(docID string) (docMeta, error) {
	raw, err := os.ReadFile(s.metaPath(docID))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return docMeta{}, host.ErrNotFound
		}
		return docMeta{}, fmt.Errorf("local: read meta %q: %w", docID, err)
	}
	var m docMeta
	if err := json.Unmarshal(raw, &m); err != nil {
		return docMeta{}, fmt.Errorf("local: parse meta %q: %w", docID, err)
	}
	return m, nil
}

func (s *Store) writeDocxAtomic(docID string, contents []byte) error {
	final := s.docxPath(docID)
	tmp := final + ".tmp"
	if err := os.WriteFile(tmp, contents, 0o644); err != nil {
		return fmt.Errorf("local: write docx tmp %q: %w", docID, err)
	}
	if err := os.Rename(tmp, final); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("local: rename docx %q: %w", docID, err)
	}
	return nil
}

func (s *Store) writeMetaAtomic(docID string, meta docMeta) error {
	raw, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return fmt.Errorf("local: marshal meta %q: %w", docID, err)
	}
	final := s.metaPath(docID)
	tmp := final + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return fmt.Errorf("local: write meta tmp %q: %w", docID, err)
	}
	if err := os.Rename(tmp, final); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("local: rename meta %q: %w", docID, err)
	}
	return nil
}

// newDocID mints a 22-character URL-safe random docId. Same shape
// as inline so URLs are interchangeable between deploy modes.
func newDocID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}
