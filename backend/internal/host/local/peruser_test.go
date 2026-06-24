package local

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/schnsrw/docx/backend/internal/host"
)

// TestList_EmptyStore — fresh store returns nil, nil.
func TestList_EmptyStore(t *testing.T) {
	s := newStore(t)
	got, err := s.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("len = %d, want 0", len(got))
	}
}

// TestList_HappyPath — Store, Snapshot, List returns the summary with
// the latest version + correct size.
func TestList_HappyPath(t *testing.T) {
	s := newStore(t)
	docID, _ := s.Store("hello.docx", []byte("PK\x03\x04 v1"))
	if err := s.Snapshot(context.Background(), docID, "", []byte("PK\x03\x04 v2 longer")); err != nil {
		t.Fatal(err)
	}

	got, err := s.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	sum := got[0]
	if sum.DocID != docID {
		t.Errorf("DocID = %q, want %q", sum.DocID, docID)
	}
	if sum.FileName != "hello.docx" {
		t.Errorf("FileName = %q", sum.FileName)
	}
	if sum.Version != 2 {
		t.Errorf("Version = %d, want 2", sum.Version)
	}
	if sum.Size != int64(len("PK\x03\x04 v2 longer")) {
		t.Errorf("Size = %d", sum.Size)
	}
}

// TestList_SortedNewestFirst — multiple docs come back ordered by
// SavedAt descending.
func TestList_SortedNewestFirst(t *testing.T) {
	s := newStore(t)
	id1, _ := s.Store("first.docx", []byte("a"))
	id2, _ := s.Store("second.docx", []byte("b"))
	id3, _ := s.Store("third.docx", []byte("c"))
	// Bump id1 to the front via a Snapshot.
	_ = s.Snapshot(context.Background(), id1, "", []byte("a-bumped"))

	got, err := s.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	// id1 was last-saved (via Snapshot) so should be first.
	if got[0].DocID != id1 {
		t.Errorf("first = %q, want bumped %q", got[0].DocID, id1)
	}
	// id3 was created after id2, so id3 comes before id2.
	wantOrder := []string{id1, id3, id2}
	for i, w := range wantOrder {
		if got[i].DocID != w {
			t.Errorf("position %d: got %q, want %q", i, got[i].DocID, w)
		}
	}
}

// TestList_SkipsOrphanFiles — a .docx without a .meta.json, or a
// .meta.json without a .docx, is logged + skipped. The List doesn't
// crash on garbage in the directory.
func TestList_SkipsOrphanFiles(t *testing.T) {
	s := newStore(t)
	id1, _ := s.Store("ok.docx", []byte("ok"))
	// Drop in an orphan .meta.json with no matching docx.
	const orphan = "ABCDEFGH12345678ABCDEF"
	if err := s.writeMetaAtomic(orphan, docMeta{FileName: "orphan.docx"}); err != nil {
		t.Fatal(err)
	}

	got, _ := s.List(context.Background())
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1 (orphan skipped)", len(got))
	}
	if got[0].DocID != id1 {
		t.Errorf("DocID = %q, want %q", got[0].DocID, id1)
	}
}

// ---------------------------------------------------------------
// PerUserStores
// ---------------------------------------------------------------

// TestPerUser_IsolatedScopes — two users on the same base never see
// each other's docs.
func TestPerUser_IsolatedScopes(t *testing.T) {
	root := t.TempDir()
	mgr, err := NewPerUserStores(root)
	if err != nil {
		t.Fatal(err)
	}

	const userA = "userAAAAAAAAAAAAAAAAAA"
	const userB = "userBBBBBBBBBBBBBBBBBB"

	storeA, err := mgr.For(userA)
	if err != nil {
		t.Fatal(err)
	}
	storeB, err := mgr.For(userB)
	if err != nil {
		t.Fatal(err)
	}

	_, _ = storeA.Store("a.docx", []byte("A"))
	_, _ = storeA.Store("a2.docx", []byte("AA"))
	_, _ = storeB.Store("b.docx", []byte("B"))

	listA, _ := storeA.List(context.Background())
	listB, _ := storeB.List(context.Background())

	if len(listA) != 2 {
		t.Errorf("user A: len = %d, want 2", len(listA))
	}
	if len(listB) != 1 {
		t.Errorf("user B: len = %d, want 1", len(listB))
	}
	for _, s := range listA {
		if s.FileName == "b.docx" {
			t.Error("user A's list contains user B's doc")
		}
	}
}

// TestPerUser_CachesPerUserStore — calling For() with the same
// userId returns the SAME Store instance, not a fresh one.
func TestPerUser_CachesPerUserStore(t *testing.T) {
	mgr, _ := NewPerUserStores(t.TempDir())
	const user = "samesamesamesamesame"
	s1, _ := mgr.For(user)
	s2, _ := mgr.For(user)
	if s1 != s2 {
		t.Error("For() returned different instances on repeated calls")
	}
}

// TestPerUser_RejectsUnsafeUserID — anything that doesn't match the
// safe-id regex fails fast so per-user paths can't escape baseRoot.
func TestPerUser_RejectsUnsafeUserID(t *testing.T) {
	mgr, _ := NewPerUserStores(t.TempDir())
	for _, bad := range []string{
		"../etc",
		"foo/bar",
		"",
		"short", // under 8 chars
		"with spaces",
	} {
		if _, err := mgr.For(bad); err == nil {
			t.Errorf("For(%q) returned nil error", bad)
		}
	}
}

// TestPerUser_PathLayout — confirms the per-user dir lands under
// <baseRoot>/users/<userID>/ so operators know where to find files
// via shell.
func TestPerUser_PathLayout(t *testing.T) {
	root := t.TempDir()
	mgr, _ := NewPerUserStores(root)
	const user = "userpathlayout123XXXXX"
	store, _ := mgr.For(user)
	want := filepath.Join(root, "users", user)
	if !strings.HasPrefix(store.Root(), want) {
		t.Errorf("store root = %q, want prefix %q", store.Root(), want)
	}
}

// TestPerUser_FetchErrors — fetching a doc by a different user's
// docID returns ErrNotFound from that user's scope (proves isolation
// at the read-path).
func TestPerUser_FetchErrors(t *testing.T) {
	mgr, _ := NewPerUserStores(t.TempDir())
	storeA, _ := mgr.For("aaaaaaaaaaaaaaaaaaaaaa")
	storeB, _ := mgr.For("bbbbbbbbbbbbbbbbbbbbbb")
	docID, _ := storeA.Store("private.docx", []byte("A"))

	_, _, err := storeB.Fetch(context.Background(), docID, "")
	if !errors.Is(err, host.ErrNotFound) {
		t.Errorf("cross-user fetch err = %v, want ErrNotFound", err)
	}
}
