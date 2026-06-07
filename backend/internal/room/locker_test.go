package room

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/schnsrw/docx/backend/internal/host"
)

// fakeLocker is a host.Locker that records every call so tests can
// assert the lifecycle invariants the production WOPI client wires
// up: Lock once per room, Unlock once on drain, same lockID through
// both calls.
type fakeLocker struct {
	mu       sync.Mutex
	lockCalls   []lockCall
	unlockCalls []lockCall
	refreshCalls []lockCall
	lockErr  error // returned from Lock to simulate a conflict
}

type lockCall struct {
	docID, lockID, token string
}

func (f *fakeLocker) Lock(_ context.Context, docID, lockID, token string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lockCalls = append(f.lockCalls, lockCall{docID, lockID, token})
	return f.lockErr
}
func (f *fakeLocker) Unlock(_ context.Context, docID, lockID, token string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.unlockCalls = append(f.unlockCalls, lockCall{docID, lockID, token})
	return nil
}
func (f *fakeLocker) RefreshLock(_ context.Context, docID, lockID, token string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.refreshCalls = append(f.refreshCalls, lockCall{docID, lockID, token})
	return nil
}

// TestLocker_LockOnFirstJoinOnly — Lock fires once per room, even
// when multiple clients join. The lockID is consistent across the
// room's lifetime (we don't check the exact value because newLockID
// is random; we check that subsequent joins don't re-mint).
func TestLocker_LockOnFirstJoinOnly(t *testing.T) {
	loc := &fakeLocker{}
	m := NewManager(WithLocker(loc))
	r1, c1, err := m.Join(context.Background(), "doc-A", "tok-1")
	if err != nil {
		t.Fatal(err)
	}
	_, c2, err := m.Join(context.Background(), "doc-A", "tok-2")
	if err != nil {
		t.Fatal(err)
	}
	if len(loc.lockCalls) != 1 {
		t.Fatalf("Lock calls = %d, want 1 (room-level lock)", len(loc.lockCalls))
	}
	if loc.lockCalls[0].docID != "doc-A" || loc.lockCalls[0].token != "tok-1" {
		t.Errorf("Lock args = %+v", loc.lockCalls[0])
	}
	// The first-join token is what the room holds for unlock.
	if r1.authToken != "tok-1" {
		t.Errorf("room.authToken = %q, want tok-1", r1.authToken)
	}
	m.Leave(r1, c1)
	m.Leave(r1, c2)
	if len(loc.unlockCalls) != 1 {
		t.Fatalf("Unlock calls = %d, want 1", len(loc.unlockCalls))
	}
	// Unlock receives the same lockID Lock minted and the first-
	// joiner's token, not the second joiner's.
	if loc.unlockCalls[0].lockID != loc.lockCalls[0].lockID {
		t.Errorf("lockID mismatch: lock=%q unlock=%q",
			loc.lockCalls[0].lockID, loc.unlockCalls[0].lockID)
	}
	if loc.unlockCalls[0].token != "tok-1" {
		t.Errorf("Unlock token = %q, want tok-1", loc.unlockCalls[0].token)
	}
}

// TestLocker_ConflictPreventsRoom — Lock returning ErrConflict means
// the file is already locked elsewhere; Join should surface that
// error and never publish the room.
func TestLocker_ConflictPreventsRoom(t *testing.T) {
	loc := &fakeLocker{lockErr: host.ErrConflict}
	m := NewManager(WithLocker(loc))
	_, _, err := m.Join(context.Background(), "doc-B", "tok")
	if !errors.Is(err, host.ErrConflict) {
		t.Fatalf("Join returned %v, want host.ErrConflict", err)
	}
	if m.Count() != 0 {
		t.Errorf("room published despite Lock failure; Count = %d", m.Count())
	}
}

// TestLocker_NoLockerSkips — without a Locker capability, no calls
// are made (the typical inline / local backend story).
func TestLocker_NoLockerSkips(t *testing.T) {
	loc := &fakeLocker{}
	m := NewManager() // no WithLocker
	r, c, _ := m.Join(context.Background(), "doc-C", "tok")
	m.Leave(r, c)
	if len(loc.lockCalls)+len(loc.unlockCalls) != 0 {
		t.Errorf("locker called despite no WithLocker option: lock=%d unlock=%d",
			len(loc.lockCalls), len(loc.unlockCalls))
	}
}

// TestLocker_RefreshLockFires — the per-room goroutine calls
// RefreshLock periodically while the room is alive. We inject a
// short 30ms interval and wait long enough for at least two ticks
// before asserting. Verifies the same docID + lockID + token round-
// trip into Refresh so a host can recognise it as the original lock
// being extended.
func TestLocker_RefreshLockFires(t *testing.T) {
	loc := &fakeLocker{}
	m := NewManager(
		WithLocker(loc),
		WithRefreshLockInterval(30*time.Millisecond),
	)
	r, c, err := m.Join(context.Background(), "doc-E", "tok-refresh")
	if err != nil {
		t.Fatal(err)
	}
	// Wait long enough for ~3 ticks. 110ms with a 30ms interval —
	// generously above the threshold to absorb scheduler jitter
	// without crossing into "test is needlessly slow" territory.
	time.Sleep(110 * time.Millisecond)
	m.Leave(r, c)

	loc.mu.Lock()
	got := len(loc.refreshCalls)
	loc.mu.Unlock()
	if got < 2 {
		t.Fatalf("refresh calls = %d, want >= 2", got)
	}
	first := loc.refreshCalls[0]
	if first.docID != "doc-E" || first.lockID != r.lockID || first.token != "tok-refresh" {
		t.Errorf("refresh arg mismatch: %+v (room lockID = %q)", first, r.lockID)
	}
}

// TestLocker_RefreshStopsOnDrain — once the last client leaves, no
// more RefreshLock calls fire. Same setup as TestLocker_RefreshLockFires
// but the second sleep should produce zero new calls.
func TestLocker_RefreshStopsOnDrain(t *testing.T) {
	loc := &fakeLocker{}
	m := NewManager(
		WithLocker(loc),
		WithRefreshLockInterval(20*time.Millisecond),
	)
	r, c, _ := m.Join(context.Background(), "doc-F", "tok")
	time.Sleep(50 * time.Millisecond)
	m.Leave(r, c)

	loc.mu.Lock()
	before := len(loc.refreshCalls)
	loc.mu.Unlock()

	// Idle past several would-have-been-ticks; nothing should fire.
	time.Sleep(80 * time.Millisecond)

	loc.mu.Lock()
	after := len(loc.refreshCalls)
	loc.mu.Unlock()
	if after != before {
		t.Errorf("refresh fired after drain: %d → %d", before, after)
	}
}

// TestLocker_RefreshDisabledByZeroInterval — a 0 interval skips the
// ticker goroutine entirely. Useful for short-lived test fixtures
// where the periodic tick is just noise.
func TestLocker_RefreshDisabledByZeroInterval(t *testing.T) {
	loc := &fakeLocker{}
	m := NewManager(
		WithLocker(loc),
		WithRefreshLockInterval(0),
	)
	r, c, _ := m.Join(context.Background(), "doc-G", "tok")
	time.Sleep(60 * time.Millisecond)
	m.Leave(r, c)
	loc.mu.Lock()
	defer loc.mu.Unlock()
	if len(loc.refreshCalls) != 0 {
		t.Errorf("refresh calls = %d, want 0 with disabled interval", len(loc.refreshCalls))
	}
}

// TestLocker_LockIDIsStableAcrossJoins — the lockID minted at first
// Join is the same one stored on the Room and used at drain.
func TestLocker_LockIDIsStableAcrossJoins(t *testing.T) {
	loc := &fakeLocker{}
	m := NewManager(WithLocker(loc))
	r, c, _ := m.Join(context.Background(), "doc-D", "tok")
	if r.lockID == "" {
		t.Fatal("room.lockID empty after first join with locker")
	}
	if r.lockID != loc.lockCalls[0].lockID {
		t.Errorf("Room lockID = %q, Lock arg = %q", r.lockID, loc.lockCalls[0].lockID)
	}
	m.Leave(r, c)
	if loc.unlockCalls[0].lockID != r.lockID {
		t.Errorf("Unlock got different lockID than Room held")
	}
}
