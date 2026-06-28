// Copyright (c) 2026 Casual Office. All rights reserved.

// Tests for the Manager + Room + broadcast hub.
//
// These pin:
//   - Manager lifecycle (alloc on Join, reclaim on last Leave,
//     no-op on unknown, race-free under concurrent Join/Leave).
//   - Room broadcast semantics (sender doesn't echo, peers
//     receive every frame, slow-client backpressure drops without
//     blocking the broadcast path).
package room

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestNewManagerStartsEmpty(t *testing.T) {
	m := NewManager()
	if got := m.Count(); got != 0 {
		t.Fatalf("new manager should have 0 rooms; got %d", got)
	}
}

func TestJoinAllocatesRoom(t *testing.T) {
	m := NewManager()
	r, c , _ := m.Join(context.Background(), "doc-1", "")
	if r == nil {
		t.Fatalf("Join should return a non-nil room")
	}
	if c == nil {
		t.Fatalf("Join should return a non-nil client")
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
	rA, _ , _ := m.Join(context.Background(), "doc-1", "")
	rB, _ , _ := m.Join(context.Background(), "doc-1", "")
	if rA != rB {
		t.Fatalf("second Join should return the same Room instance")
	}
	if rA.Clients() != 2 {
		t.Fatalf("after two Joins, room.Clients() = %d; want 2", rA.Clients())
	}
	if m.Count() != 1 {
		t.Fatalf("two Joins on the same docID should yield 1 room; got %d", m.Count())
	}
}

func TestLeaveDropsRoomOnZero(t *testing.T) {
	m := NewManager()
	r, c , _ := m.Join(context.Background(), "doc-1", "")
	m.Leave(r, c)
	if m.Count() != 0 {
		t.Fatalf("Leave on the last client should reclaim the room; Count() = %d", m.Count())
	}
}

func TestLeaveKeepsRoomWithRemainingClients(t *testing.T) {
	m := NewManager()
	r, c1 , _ := m.Join(context.Background(), "doc-1", "")
	_, _, _ = m.Join(context.Background(), "doc-1", "")
	m.Leave(r, c1)
	if m.Count() != 1 {
		t.Fatalf("Leave with another client still connected should keep the room; Count() = %d", m.Count())
	}
}

func TestLeaveNilIsNoOp(t *testing.T) {
	m := NewManager()
	m.Leave(nil, nil) // Should not panic.
	if m.Count() != 0 {
		t.Fatalf("Leave(nil) should leave Count at 0; got %d", m.Count())
	}
}

func TestConcurrentJoinLeaveSafe(t *testing.T) {
	// Smoke test against data races + final-count invariant.
	// 100 goroutines hammering Join + Leave on the same docId;
	// the room should land back at 0 clients (manager at 0 rooms)
	// once everyone's done.
	m := NewManager()
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, c , _ := m.Join(context.Background(), "hot-room", "")
			m.Leave(r, c)
		}()
	}
	wg.Wait()
	if m.Count() != 0 {
		t.Fatalf("after 100 paired Join/Leave, Count() = %d; want 0", m.Count())
	}
}

func TestClientIDsAreUnique(t *testing.T) {
	m := NewManager()
	_, a , _ := m.Join(context.Background(), "doc-1", "")
	_, b , _ := m.Join(context.Background(), "doc-1", "")
	if a.ID() == b.ID() {
		t.Fatalf("two clients in the same room share id %d", a.ID())
	}
	if a.ID() == 0 || b.ID() == 0 {
		t.Fatalf("client ids should be 1-indexed; got %d, %d", a.ID(), b.ID())
	}
}

// drainOne reads a single frame from c.Send or fails the test
// after `wait`. Used to verify Broadcast actually delivers.
func drainOne(t *testing.T, c *Client, wait time.Duration) []byte {
	t.Helper()
	select {
	case f := <-c.Send:
		return f
	case <-time.After(wait):
		t.Fatalf("client %d: timed out waiting for frame", c.ID())
		return nil
	}
}

func TestBroadcastFansOutToPeers(t *testing.T) {
	m := NewManager()
	_, a , _ := m.Join(context.Background(), "doc-1", "")
	r, b , _ := m.Join(context.Background(), "doc-1", "")
	_, c , _ := m.Join(context.Background(), "doc-1", "")

	frame := []byte{2, 0xff, 0xee} // MessageUpdate + arbitrary payload
	r.Broadcast(a, frame)

	// Both b and c should receive; a should NOT (it was the sender).
	got := drainOne(t, b, 100*time.Millisecond)
	if string(got) != string(frame) {
		t.Fatalf("b received %x; want %x", got, frame)
	}
	got = drainOne(t, c, 100*time.Millisecond)
	if string(got) != string(frame) {
		t.Fatalf("c received %x; want %x", got, frame)
	}

	// Sender's buffer should be empty (non-blocking read).
	select {
	case echo := <-a.Send:
		t.Fatalf("sender received echo %x; should have been excluded", echo)
	default:
	}
}

func TestBroadcastWithNilSenderReachesEveryone(t *testing.T) {
	m := NewManager()
	r, a , _ := m.Join(context.Background(), "doc-1", "")
	_, b , _ := m.Join(context.Background(), "doc-1", "")

	r.Broadcast(nil, []byte("server-originated"))

	if got := string(drainOne(t, a, 100*time.Millisecond)); got != "server-originated" {
		t.Fatalf("a got %q", got)
	}
	if got := string(drainOne(t, b, 100*time.Millisecond)); got != "server-originated" {
		t.Fatalf("b got %q", got)
	}
}

func TestBroadcastDropsForSlowClient(t *testing.T) {
	// A client whose Send queue fills should NOT block the
	// broadcast path. Verifies the non-blocking select default
	// in Broadcast.
	m := NewManager()
	r, slow , _ := m.Join(context.Background(), "doc-1", "")
	_, fast , _ := m.Join(context.Background(), "doc-1", "")

	// Sender that is not in the room — picks a placeholder
	// sender so neither slow nor fast is excluded.
	sender := &Client{Send: make(chan []byte, 1)}

	// Pre-fill slow's buffer to capacity so its next send drops.
	for i := 0; i < outboundQueue; i++ {
		slow.Send <- []byte{byte(i)}
	}

	// Broadcast — slow should be dropped silently, fast should
	// receive normally.
	r.Broadcast(sender, []byte("real"))

	if got := string(drainOne(t, fast, 100*time.Millisecond)); got != "real" {
		t.Fatalf("fast received %q; broadcast should have reached it", got)
	}
	// slow's queue should still hold the pre-fill bytes, never the
	// "real" frame.
	select {
	case f := <-slow.Send:
		if string(f) == "real" {
			t.Fatalf("slow should have dropped the new frame; got it instead")
		}
	default:
		t.Fatalf("slow buffer should still hold pre-fill")
	}
}

func TestRemoveClientClosesSendChannel(t *testing.T) {
	m := NewManager()
	r, c , _ := m.Join(context.Background(), "doc-1", "")
	r.RemoveClient(c)
	// Reading from a closed channel returns zero + ok=false.
	select {
	case _, ok := <-c.Send:
		if ok {
			t.Fatalf("Send should be closed after RemoveClient; got value back")
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("Send channel should be closed immediately after RemoveClient")
	}
}

func TestBroadcastIncrementsDropCounter(t *testing.T) {
	// Regression: the drop counter must increment on every dropped
	// frame so operators can detect persistently-slow clients via
	// the warn-on-power-of-two log signal. Without it, drops are
	// invisible.
	m := NewManager()
	r, slow , _ := m.Join(context.Background(), "doc-1", "")
	sender := &Client{Send: make(chan []byte, 1)}

	for i := 0; i < outboundQueue; i++ {
		slow.Send <- []byte{byte(i)}
	}
	if got := slow.drops.Load(); got != 0 {
		t.Fatalf("drops should be 0 before any drop; got %d", got)
	}

	r.Broadcast(sender, []byte("dropped-1"))
	r.Broadcast(sender, []byte("dropped-2"))
	r.Broadcast(sender, []byte("dropped-3"))

	if got := slow.drops.Load(); got != 3 {
		t.Fatalf("drops after 3 dropped frames = %d; want 3", got)
	}
}

func TestJoinLeaveRaceNeverOrphansRooms(t *testing.T) {
	// Regression for the Manager.Join vs Manager.Leave race: if
	// Join released m.mu before AddClient, a concurrent Leave on
	// the same docID could observe Clients()==0, delete the room
	// from the registry, fire the drain, and then Join's new
	// client would end up on an orphaned (off-registry) room.
	// Holding m.mu through AddClient closes the window.
	//
	// We don't try to deterministically trigger the race; instead
	// we hammer Join+Leave on the same docID under load and assert
	// the manager always reaches a consistent terminal state.
	const iters = 200
	m := NewManager()
	var wg sync.WaitGroup
	for i := 0; i < iters; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, c , _ := m.Join(context.Background(), "doc-race", "")
			r.RemoveClient(c)
			m.Leave(r, c)
		}()
	}
	wg.Wait()

	// Every Join was paired with a Leave; the manager must be
	// empty (no orphaned rooms left in the registry).
	if got := m.Count(); got != 0 {
		t.Fatalf("manager should be empty after paired Join/Leave; got %d rooms", got)
	}
}

func TestLookupReturnsActiveRoom(t *testing.T) {
	m := NewManager()
	if m.Lookup("not-there") != nil {
		t.Fatalf("Lookup on unknown docID should return nil")
	}
	r, _ , _ := m.Join(context.Background(), "doc-1", "")
	if m.Lookup("doc-1") != r {
		t.Fatalf("Lookup should return the same Room instance Join created")
	}
}

func TestMaxRoomsCap_RejectsNewDocAtCap(t *testing.T) {
	// Cap of 2. Three distinct docIds — third should be refused.
	m := NewManager(WithMaxRooms(2))
	if _, _, err := m.Join(context.Background(), "a", ""); err != nil {
		t.Fatalf("first room should join: %v", err)
	}
	if _, _, err := m.Join(context.Background(), "b", ""); err != nil {
		t.Fatalf("second room should join: %v", err)
	}
	if _, _, err := m.Join(context.Background(), "c", ""); err != ErrCapacityFull {
		t.Fatalf("third new docID should hit cap; got err=%v", err)
	}
}

func TestMaxRoomsCap_JoiningExistingDocBypassesCap(t *testing.T) {
	// Cap of 1. Two clients on the SAME docId — both should succeed
	// because joiners don't count against the cap.
	m := NewManager(WithMaxRooms(1))
	if _, _, err := m.Join(context.Background(), "a", ""); err != nil {
		t.Fatalf("first client should join: %v", err)
	}
	// Second client on the same doc — must NOT hit the cap.
	if _, _, err := m.Join(context.Background(), "a", ""); err != nil {
		t.Fatalf("second client on existing doc should join: %v", err)
	}
	// A NEW docId still hits the cap, though.
	if _, _, err := m.Join(context.Background(), "b", ""); err != ErrCapacityFull {
		t.Fatalf("new docId at cap should be refused; got err=%v", err)
	}
}

func TestMaxRoomsCap_FreedSlotAcceptsNewDoc(t *testing.T) {
	// Fill the cap, drain one room, then verify a new docId is accepted.
	m := NewManager(WithMaxRooms(2))
	rA, cA, _ := m.Join(context.Background(), "a", "")
	_, _, _ = m.Join(context.Background(), "b", "")
	// Confirm we're at cap.
	if _, _, err := m.Join(context.Background(), "c", ""); err != ErrCapacityFull {
		t.Fatalf("expected cap-full before drain")
	}
	// Drain "a" — leaving with the last client drops the room.
	m.Leave(rA, cA)
	// Now "c" should succeed.
	if _, _, err := m.Join(context.Background(), "c", ""); err != nil {
		t.Fatalf("freed slot should accept new doc: %v", err)
	}
}

func TestMaxRoomsCap_ZeroDisabled(t *testing.T) {
	// MaxRooms 0 == unbounded. Default behaviour.
	m := NewManager(WithMaxRooms(0))
	for i := 0; i < 50; i++ {
		ip := string(rune('A' + i))
		if _, _, err := m.Join(context.Background(), ip, ""); err != nil {
			t.Fatalf("disabled cap should not refuse joins; got %v at %d", err, i)
		}
	}
}
