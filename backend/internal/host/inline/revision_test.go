package inline

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/schnsrw/docx/backend/internal/host"
)

// Inline retains per-revision bytes so the editor can restore a past
// version (host.RevisionStore).
func TestInlineFetchRevisionPerVersion(t *testing.T) {
	s := New()
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
	if _, err := s.FetchRevision("nope", 1); !errors.Is(err, host.ErrNotFound) {
		t.Fatalf("unknown doc: want ErrNotFound, got %v", err)
	}
}

// Per-revision bytes roll off in lockstep with the metadata window.
func TestInlineRevisionBytesPrunedWithMetadata(t *testing.T) {
	s := New()
	id, err := s.Store("d.docx", []byte("v1"))
	if err != nil {
		t.Fatalf("Store: %v", err)
	}
	// Drive enough snapshots to push version 1 off the maxRevisions window.
	for i := 0; i < maxRevisions; i++ {
		if err := s.Snapshot(context.Background(), id, "", []byte(fmt.Sprintf("v%d", i+2))); err != nil {
			t.Fatalf("Snapshot %d: %v", i, err)
		}
	}
	if _, err := s.FetchRevision(id, 1); !errors.Is(err, host.ErrNotFound) {
		t.Fatalf("rolled-off v1: want ErrNotFound, got %v", err)
	}
	// The newest version is still retrievable.
	latest := uint64(maxRevisions + 1)
	if _, err := s.FetchRevision(id, latest); err != nil {
		t.Fatalf("latest v%d should be retained: %v", latest, err)
	}
}
