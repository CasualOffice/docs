package local

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/schnsrw/docx/backend/internal/host"
)

// Local persists per-revision .docx blobs on disk and serves them via
// FetchRevision (host.RevisionStore).
func TestLocalFetchRevisionPerVersion(t *testing.T) {
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	id, err := s.Store("d.docx", []byte("v1-bytes"))
	if err != nil {
		t.Fatalf("Store: %v", err)
	}
	if err := s.Snapshot(context.Background(), id, "", []byte("v2-bytes")); err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	for v, want := range map[uint64]string{1: "v1-bytes", 2: "v2-bytes"} {
		got, err := s.FetchRevision(id, v)
		if err != nil {
			t.Fatalf("FetchRevision v%d: %v", v, err)
		}
		if string(got) != want {
			t.Fatalf("v%d = %q, want %q", v, got, want)
		}
	}
	if _, err := s.FetchRevision(id, 99); !errors.Is(err, host.ErrNotFound) {
		t.Fatalf("unknown version: want ErrNotFound, got %v", err)
	}
}

// Delete sweeps the per-revision blobs too (no orphan .vN.docx files).
func TestLocalDeleteSweepsRevisionBlobs(t *testing.T) {
	root := t.TempDir()
	s, err := New(root)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	id, err := s.Store("d.docx", []byte("v1"))
	if err != nil {
		t.Fatalf("Store: %v", err)
	}
	if err := s.Snapshot(context.Background(), id, "", []byte("v2")); err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if err := s.Delete(id); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	matches, _ := filepath.Glob(filepath.Join(root, id+".v*.docx"))
	if len(matches) != 0 {
		t.Fatalf("revision blobs not swept: %v", matches)
	}
	if _, err := os.Stat(s.docxPath(id)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("docx not removed: %v", err)
	}
}
