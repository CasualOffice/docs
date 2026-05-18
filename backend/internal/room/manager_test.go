// Tests for the Manager + Room scaffold.
//
// These pin the M1 lifecycle invariants (join allocates a room,
// leave reclaims the room on last-client) without yet exercising
// the WOPI seed/snapshot path. Once that lands the test file
// grows with end-to-end load/save scenarios.
package room

import (
	"sync"
	"testing"
)

func TestNewManagerStartsEmpty(t *testing.T) {
	m := NewManager()
	if got := m.Count(); got != 0 {
		t.Fatalf("new manager should have 0 rooms; got %d", got)
	}
}

func TestJoinAllocatesRoom(t *testing.T) {
	m := NewManager()
	r := m.Join("doc-1")
	if r == nil {
		t.Fatalf("Join should return a non-nil room")
	}
	if r.DocID() != "doc-1" {
		t.Fatalf("room docID = %q; want %q", r.DocID(), "doc-1")
	}
	if r.Clients() != 1 {
		t.Fatalf("room client count = %d; want 1 after single Join", r.Clients())
	}
	if m.Count() != 1 {
		t.Fatalf("manager room count = %d; want 1", m.Count())
	}
}

func TestRepeatedJoinReusesRoom(t *testing.T) {
	m := NewManager()
	a := m.Join("doc-1")
	b := m.Join("doc-1")
	if a != b {
		t.Fatalf("second Join should return the same Room instance")
	}
	if a.Clients() != 2 {
		t.Fatalf("after two Joins, room.Clients() = %d; want 2", a.Clients())
	}
	if m.Count() != 1 {
		t.Fatalf("two Joins on the same docID should yield 1 room; got %d", m.Count())
	}
}

func TestLeaveDropsRoomOnZero(t *testing.T) {
	m := NewManager()
	m.Join("doc-1")
	m.Leave("doc-1")
	if m.Count() != 0 {
		t.Fatalf("Leave on the last client should reclaim the room; Count() = %d", m.Count())
	}
}

func TestLeaveKeepsRoomWithRemainingClients(t *testing.T) {
	m := NewManager()
	m.Join("doc-1")
	m.Join("doc-1")
	m.Leave("doc-1")
	if m.Count() != 1 {
		t.Fatalf("Leave with another client still connected should keep the room; Count() = %d", m.Count())
	}
}

func TestLeaveUnknownDocIsNoOp(t *testing.T) {
	m := NewManager()
	// Should not panic or otherwise misbehave.
	m.Leave("never-joined")
	if m.Count() != 0 {
		t.Fatalf("Leave on unknown doc should leave Count at 0; got %d", m.Count())
	}
}

func TestConcurrentJoinLeaveSafe(t *testing.T) {
	// Smoke test against data races. 100 goroutines hammering
	// Join + Leave on the same docId; the room should land back
	// at 0 clients (and the manager at 0 rooms) once everyone's
	// done.
	m := NewManager()
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			m.Join("hot-room")
			m.Leave("hot-room")
		}()
	}
	wg.Wait()
	if m.Count() != 0 {
		t.Fatalf("after 100 paired Join/Leave, Count() = %d; want 0", m.Count())
	}
}
