package room

import (
	"context"
	"errors"
	"sync"
	"testing"

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
