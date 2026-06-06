package local

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/schnsrw/docx/backend/internal/host"
)

// TestStoreAndFetch — happy-path round-trip: upload bytes, fetch
// them back, verify metadata.
func TestStoreAndFetch(t *testing.T) {
	s := newStore(t)
	docID, err := s.Store("hello.docx", []byte("PK\x03\x04 stub docx"))
	if err != nil {
		t.Fatalf("Store: %v", err)
	}
	if docID == "" {
		t.Fatal("Store returned empty docID")
	}

	bytes, info, err := s.Fetch(context.Background(), docID, "")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if string(bytes) != "PK\x03\x04 stub docx" {
		t.Errorf("Fetch bytes mismatch: got %q", string(bytes))
	}
	if info.FileName != "hello.docx" {
		t.Errorf("FileName = %q, want hello.docx", info.FileName)
	}
	if info.Version != "1" {
		t.Errorf("Version = %q, want 1", info.Version)
	}
	if !info.UserCanWrite {
		t.Error("UserCanWrite = false; want true (local host is permissive)")
	}
}

// TestFetchNotFound — unknown docId returns host.ErrNotFound.
func TestFetchNotFound(t *testing.T) {
	s := newStore(t)
	_, _, err := s.Fetch(context.Background(), "AAAABBBBCCCC", "")
	if !errors.Is(err, host.ErrNotFound) {
		t.Errorf("got %v, want host.ErrNotFound", err)
	}
}

// TestFetchRejectsUnsafeDocID — path traversal attempts return
// ErrNotFound at the regex gate without hitting the filesystem.
func TestFetchRejectsUnsafeDocID(t *testing.T) {
	s := newStore(t)
	for _, bad := range []string{
		"../etc/passwd",
		"foo/bar",
		"",
		"a", // too short
	} {
		_, _, err := s.Fetch(context.Background(), bad, "")
		if !errors.Is(err, host.ErrNotFound) {
			t.Errorf("Fetch(%q) = %v, want ErrNotFound", bad, err)
		}
	}
}

// TestSnapshotPersistsAndIncrements — a Snapshot updates the docx
// bytes, bumps version, appends a revision entry.
func TestSnapshotPersistsAndIncrements(t *testing.T) {
	s := newStore(t)
	docID, err := s.Store("draft.docx", []byte("v1 bytes"))
	if err != nil {
		t.Fatal(err)
	}

	if err := s.Snapshot(context.Background(), docID, "", []byte("v2 bytes")); err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	bytes, info, err := s.Fetch(context.Background(), docID, "")
	if err != nil {
		t.Fatal(err)
	}
	if string(bytes) != "v2 bytes" {
		t.Errorf("Fetch after snapshot: %q", string(bytes))
	}
	if info.Version != "2" {
		t.Errorf("Version after snapshot = %q, want 2", info.Version)
	}

	revs, err := s.History(docID)
	if err != nil {
		t.Fatal(err)
	}
	if len(revs) != 2 {
		t.Fatalf("history len = %d, want 2", len(revs))
	}
	if revs[0].Version != 1 || revs[1].Version != 2 {
		t.Errorf("versions = %v, want [1, 2]", []uint64{revs[0].Version, revs[1].Version})
	}
}

// TestSnapshotRejectsEmpty — a zero-byte snapshot is an error, not
// a silent data wipe.
func TestSnapshotRejectsEmpty(t *testing.T) {
	s := newStore(t)
	docID, _ := s.Store("x.docx", []byte("seed"))
	if err := s.Snapshot(context.Background(), docID, "", nil); err == nil {
		t.Error("Snapshot with empty bytes returned nil error")
	}
}

// TestPersistsAcrossInstances — the whole point of the local host:
// docs survive a process restart. Two Store instances pointing at
// the same root see each other's writes.
func TestPersistsAcrossInstances(t *testing.T) {
	root := t.TempDir()

	s1, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	docID, err := s1.Store("survive.docx", []byte("hello"))
	if err != nil {
		t.Fatal(err)
	}

	// Brand-new store, same root, no shared state — simulates
	// process restart.
	s2, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	bytes, info, err := s2.Fetch(context.Background(), docID, "")
	if err != nil {
		t.Fatalf("Fetch after restart: %v", err)
	}
	if string(bytes) != "hello" {
		t.Errorf("Fetch after restart bytes mismatch")
	}
	if info.FileName != "survive.docx" {
		t.Errorf("FileName lost across restart: %q", info.FileName)
	}
}

// TestAtomicWrites — a partial-failure simulation. If the meta
// write fails mid-Store, the docx write should also roll back so
// the directory doesn't accumulate orphan .docx files.
//
// We can't easily simulate ENOSPC, but we can stat the directory
// before/after a successful Store + Snapshot to confirm exactly
// the expected pair of files lands.
func TestAtomicWritesNoTmpLeak(t *testing.T) {
	s := newStore(t)
	docID, err := s.Store("a.docx", []byte("a"))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Snapshot(context.Background(), docID, "", []byte("b")); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(s.Root())
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		name := e.Name()
		if filepath.Ext(name) == ".tmp" {
			t.Errorf("tmp file leaked: %s", name)
		}
	}
}

// TestStoreEmptyRejected — uploading zero bytes is an error, not a
// silent 0-byte file.
func TestStoreEmptyRejected(t *testing.T) {
	s := newStore(t)
	if _, err := s.Store("nothing.docx", nil); err == nil {
		t.Error("Store with empty bytes returned nil error")
	}
}

// TestHistoryRollOff — once a doc has more than maxRevisions saves,
// the oldest entries roll off. Verifies the cap holds across many
// Snapshot cycles.
func TestHistoryRollOff(t *testing.T) {
	s := newStore(t)
	docID, _ := s.Store("rolling.docx", []byte("v0"))
	for i := 0; i < maxRevisions+10; i++ {
		if err := s.Snapshot(context.Background(), docID, "", []byte("vN")); err != nil {
			t.Fatal(err)
		}
	}
	revs, _ := s.History(docID)
	if len(revs) > maxRevisions {
		t.Errorf("history len = %d, want <= %d", len(revs), maxRevisions)
	}
	// Last entry's version should equal initial (1) + total snapshots.
	wantVersion := uint64(1 + maxRevisions + 10)
	if revs[len(revs)-1].Version != wantVersion {
		t.Errorf("last version = %d, want %d", revs[len(revs)-1].Version, wantVersion)
	}
}

// newStore returns a Store rooted at a temp dir cleaned up on test
// teardown.
func newStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return s
}
