package inline

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/schnsrw/docx/backend/internal/host"
)

func TestStoreThenFetchRoundTrip(t *testing.T) {
	s := New()
	docID, err := s.Store("test.docx", []byte("hello"))
	if err != nil {
		t.Fatalf("Store: %v", err)
	}
	if docID == "" {
		t.Fatalf("Store returned empty docID")
	}

	got, info, err := s.Fetch(context.Background(), docID, "")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if string(got) != "hello" {
		t.Fatalf("Fetch contents = %q; want %q", got, "hello")
	}
	if info.FileName != "test.docx" {
		t.Fatalf("Fetch FileName = %q; want %q", info.FileName, "test.docx")
	}
	if !info.UserCanWrite {
		t.Fatalf("inline integration should always grant write")
	}
}

func TestFetchUnknownDocIsErrNotFound(t *testing.T) {
	s := New()
	_, _, err := s.Fetch(context.Background(), "nope", "")
	if !errors.Is(err, host.ErrNotFound) {
		t.Fatalf("Fetch of unknown doc returned %v; want ErrNotFound", err)
	}
}

func TestStoreEmptyContentsRejected(t *testing.T) {
	s := New()
	_, err := s.Store("empty.docx", nil)
	if err == nil {
		t.Fatalf("Store with empty contents should error")
	}
}

func TestSnapshotUpdatesContents(t *testing.T) {
	s := New()
	docID, _ := s.Store("v.docx", []byte("v1"))

	if err := s.Snapshot(context.Background(), docID, "", []byte("v2")); err != nil {
		t.Fatalf("Snapshot: %v", err)
	}

	got, info, _ := s.Fetch(context.Background(), docID, "")
	if string(got) != "v2" {
		t.Fatalf("after Snapshot, Fetch = %q; want %q", got, "v2")
	}
	if info.Version != "2" {
		t.Fatalf("after Snapshot, Version = %q; want %q", info.Version, "2")
	}
}

func TestSnapshotUnknownDocIsErrNotFound(t *testing.T) {
	s := New()
	if err := s.Snapshot(context.Background(), "ghost", "", []byte("x")); !errors.Is(err, host.ErrNotFound) {
		t.Fatalf("Snapshot of unknown doc returned %v; want ErrNotFound", err)
	}
}

func TestSnapshotEmptyRejected(t *testing.T) {
	s := New()
	docID, _ := s.Store("x.docx", []byte("data"))
	if err := s.Snapshot(context.Background(), docID, "", nil); err == nil {
		t.Fatalf("empty Snapshot should error")
	}
}

func TestStoredBytesAreCopiedDefensively(t *testing.T) {
	s := New()
	src := []byte{1, 2, 3, 4}
	docID, _ := s.Store("d.docx", src)

	// Mutate the input slice — the store's copy should be unaffected.
	src[0] = 0xff
	got, _, _ := s.Fetch(context.Background(), docID, "")
	if got[0] != 1 {
		t.Fatalf("store kept reference to caller's slice; expected defensive copy")
	}

	// Mutate the returned slice — a subsequent Fetch should also be unaffected.
	got[1] = 0xff
	got2, _, _ := s.Fetch(context.Background(), docID, "")
	if got2[1] != 2 {
		t.Fatalf("Fetch returned reference to internal slice; expected defensive copy")
	}
}

func TestEvictionOnCapacity(t *testing.T) {
	s := New(WithMaxDocs(2))
	a, _ := s.Store("a.docx", []byte("A"))
	_, _ = s.Store("b.docx", []byte("B"))
	_, _ = s.Store("c.docx", []byte("C"))

	if got := s.Count(); got != 2 {
		t.Fatalf("after 3 stores with cap=2, Count = %d; want 2", got)
	}
	// `a` is the least-recently-accessed; should be evicted.
	if _, _, err := s.Fetch(context.Background(), a, ""); !errors.Is(err, host.ErrNotFound) {
		t.Fatalf("oldest doc should have been evicted; Fetch err = %v", err)
	}
}

func TestEvictionRespectsRecentAccess(t *testing.T) {
	s := New(WithMaxDocs(2))
	a, _ := s.Store("a.docx", []byte("A"))
	b, _ := s.Store("b.docx", []byte("B"))

	// Touch `a` so b becomes least-recently-accessed.
	_, _, _ = s.Fetch(context.Background(), a, "")

	_, _ = s.Store("c.docx", []byte("C"))

	// `b` should be the eviction victim now.
	if _, _, err := s.Fetch(context.Background(), b, ""); !errors.Is(err, host.ErrNotFound) {
		t.Fatalf("recently-accessed `a` should have survived; expected `b` evicted, err = %v", err)
	}
}

func TestDeleteRemoves(t *testing.T) {
	s := New()
	docID, _ := s.Store("d.docx", []byte("data"))
	if !s.Delete(docID) {
		t.Fatalf("Delete should return true for an existing doc")
	}
	if _, _, err := s.Fetch(context.Background(), docID, ""); !errors.Is(err, host.ErrNotFound) {
		t.Fatalf("after Delete, Fetch should return ErrNotFound; got %v", err)
	}
	if s.Delete(docID) {
		t.Fatalf("Delete of nonexistent doc should return false")
	}
}

func TestHistoryRecordsCreationRevision(t *testing.T) {
	s := New()
	docID, _ := s.Store("h.docx", []byte("v1"))

	revs, err := s.History(docID)
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	if len(revs) != 1 {
		t.Fatalf("after Store, History len = %d; want 1", len(revs))
	}
	if revs[0].Version != 1 {
		t.Fatalf("creation revision Version = %d; want 1", revs[0].Version)
	}
	if revs[0].SizeBytes != 2 {
		t.Fatalf("creation revision SizeBytes = %d; want 2", revs[0].SizeBytes)
	}
	if revs[0].SavedAt.IsZero() {
		t.Fatalf("creation revision SavedAt is zero")
	}
}

func TestHistoryAppendsOnSnapshot(t *testing.T) {
	s := New()
	docID, _ := s.Store("h.docx", []byte("v1"))
	_ = s.Snapshot(context.Background(), docID, "", []byte("v22"))
	_ = s.Snapshot(context.Background(), docID, "", []byte("v333"))

	revs, err := s.History(docID)
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	if len(revs) != 3 {
		t.Fatalf("after 2 snapshots, History len = %d; want 3", len(revs))
	}
	// Versions are monotonic 1,2,3; sizes 2,3,4.
	for i, want := range []struct {
		version uint64
		size    int
	}{{1, 2}, {2, 3}, {3, 4}} {
		if revs[i].Version != want.version {
			t.Fatalf("revs[%d].Version = %d; want %d", i, revs[i].Version, want.version)
		}
		if revs[i].SizeBytes != want.size {
			t.Fatalf("revs[%d].SizeBytes = %d; want %d", i, revs[i].SizeBytes, want.size)
		}
	}
}

func TestHistoryCapsAtMaxRevisions(t *testing.T) {
	s := New()
	docID, _ := s.Store("h.docx", []byte("v1"))
	// Push well past the cap; expect the tail retained.
	for i := 0; i < maxRevisions+50; i++ {
		_ = s.Snapshot(context.Background(), docID, "", []byte("x"))
	}
	revs, err := s.History(docID)
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	if len(revs) != maxRevisions {
		t.Fatalf("History len = %d; want cap %d", len(revs), maxRevisions)
	}
	// The retained tail must be the most-recent versions; the last
	// entry's version equals the total save count (1 create + N snaps).
	totalSaves := uint64(1 + maxRevisions + 50)
	if revs[len(revs)-1].Version != totalSaves {
		t.Fatalf("newest revision Version = %d; want %d", revs[len(revs)-1].Version, totalSaves)
	}
	// And the oldest retained is totalSaves-maxRevisions+1.
	if revs[0].Version != totalSaves-uint64(maxRevisions)+1 {
		t.Fatalf("oldest retained Version = %d; want %d",
			revs[0].Version, totalSaves-uint64(maxRevisions)+1)
	}
}

func TestHistoryUnknownDocIsErrNotFound(t *testing.T) {
	s := New()
	_, err := s.History("nope")
	if !errors.Is(err, host.ErrNotFound) {
		t.Fatalf("History of unknown doc = %v; want ErrNotFound", err)
	}
}

func TestHistoryReturnsCopy(t *testing.T) {
	s := New()
	docID, _ := s.Store("h.docx", []byte("v1"))
	revs, _ := s.History(docID)
	// Mutating the returned slice must not affect the store's log.
	if len(revs) > 0 {
		revs[0].Version = 9999
	}
	again, _ := s.History(docID)
	if again[0].Version != 1 {
		t.Fatalf("History returned a mutable view: got Version %d after caller mutation", again[0].Version)
	}
}

func TestDocIDsAreUniqueAcrossStores(t *testing.T) {
	// 1000 stores in parallel, expect 1000 unique docIDs.
	s := New(WithMaxDocs(2000))
	var wg sync.WaitGroup
	ids := make([]string, 1000)
	for i := range ids {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id, _ := s.Store("f.docx", []byte{byte(i)})
			ids[i] = id
		}(i)
	}
	wg.Wait()

	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if seen[id] {
			t.Fatalf("duplicate docID generated: %q", id)
		}
		seen[id] = true
	}
}
