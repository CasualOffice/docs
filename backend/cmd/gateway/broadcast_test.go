// Copyright (c) 2026 Casual Office. All rights reserved.

// Integration test: stand up the gateway on a random port, connect
// two clients to the same /doc/{docId} URL, verify a binary frame
// from one reaches the other and not the sender.
//
// This is the M1 acceptance criterion: the gateway is a working
// pass-through y-websocket relay. The Yjs binary protocol details
// (sync-1/2, update, awareness) are exercised end-to-end in a
// separate browser-driven test once the editor client is wired.
package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/schnsrw/docx/backend/internal/host/inline"
	"github.com/schnsrw/docx/backend/internal/room"
)

func startTestGateway(t *testing.T) (*httptest.Server, *room.Manager, *inline.Store) {
	t.Helper()
	rooms := room.NewManager()
	store := inline.New()
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/docs", uploadHandler(store))
	dlHandler := downloadHandler(store)
	rnHandler := renameHandler(store)
	histHandler := historyHandler(store)
	revHandler := revisionDownloadHandler(store)
	mux.HandleFunc("/api/docs/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/rename") {
			rnHandler(w, r)
			return
		}
		if strings.Contains(r.URL.Path, "/history/") && strings.HasSuffix(r.URL.Path, "/download") {
			revHandler(w, r)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/history") {
			histHandler(w, r)
			return
		}
		dlHandler(w, r)
	})
	mux.HandleFunc("/doc/", wsHandler(rooms, store))
	srv := httptest.NewServer(withCORS(mux))
	t.Cleanup(srv.Close)
	return srv, rooms, store
}

// seedDoc stores a placeholder doc and returns its docID, so the
// WS handler's host-integration pre-flight succeeds.
func seedDoc(t *testing.T, store *inline.Store, name string) string {
	t.Helper()
	id, err := store.Store(name, []byte("seed"))
	if err != nil {
		t.Fatalf("seedDoc: %v", err)
	}
	return id
}

// dialDoc opens a WS connection to /doc/{docID} against the
// httptest server, swapping http:// → ws://.
func dialDoc(t *testing.T, srv *httptest.Server, docID string) *websocket.Conn {
	t.Helper()
	wsURL := strings.Replace(srv.URL, "http://", "ws://", 1) + "/doc/" + docID
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial %s: %v", wsURL, err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	return c
}

func TestHealthEndpoint(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("/health status = %d; want 200", resp.StatusCode)
	}
}

func TestMissingDocIDReturns400(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	resp, err := http.Get(srv.URL + "/doc/")
	if err != nil {
		t.Fatalf("GET /doc/: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("/doc/ (empty docId) = %d; want 400", resp.StatusCode)
	}
}

func TestUnknownDocIDReturns404(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	// HTTP-level GET (not a WS upgrade) — the pre-flight runs
	// before websocket.Accept so we still get the 404.
	resp, err := http.Get(srv.URL + "/doc/never-uploaded")
	if err != nil {
		t.Fatalf("GET /doc/never-uploaded: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("/doc/<unknown> = %d; want 404", resp.StatusCode)
	}
}

func TestBroadcastBetweenTwoClientsInSameRoom(t *testing.T) {
	srv, rooms, store := startTestGateway(t)
	docID := seedDoc(t, store, "test.docx")

	clientA := dialDoc(t, srv, docID)
	clientB := dialDoc(t, srv, docID)

	// Give the server a moment to register both clients with the
	// room manager.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if rooms.Lookup(docID) != nil && rooms.Lookup(docID).Clients() == 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if r := rooms.Lookup(docID); r == nil || r.Clients() != 2 {
		t.Fatalf("expected 2 clients in room %s; got %v", docID, r)
	}

	frame := []byte{2, 0xde, 0xad, 0xbe, 0xef} // MessageUpdate + payload

	ctxA, cancelA := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelA()
	if err := clientA.Write(ctxA, websocket.MessageBinary, frame); err != nil {
		t.Fatalf("clientA write: %v", err)
	}

	// clientB should receive the same bytes.
	ctxB, cancelB := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelB()
	mt, got, err := clientB.Read(ctxB)
	if err != nil {
		t.Fatalf("clientB read: %v", err)
	}
	if mt != websocket.MessageBinary {
		t.Fatalf("clientB got msg type %v; want binary", mt)
	}
	if string(got) != string(frame) {
		t.Fatalf("clientB got %x; want %x", got, frame)
	}

	// clientA should NOT receive its own frame back. We give it
	// a short window to prove silence; a longer timeout would
	// also work, just slower.
	echoCtx, echoCancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer echoCancel()
	_, _, err = clientA.Read(echoCtx)
	if err == nil {
		t.Fatalf("clientA received an echo of its own frame; should have been excluded")
	}
}

func TestNoCrossRoomLeak(t *testing.T) {
	srv, _, store := startTestGateway(t)
	docX := seedDoc(t, store, "x.docx")
	docY := seedDoc(t, store, "y.docx")
	// Client A is in docX, client B is in docY — their frames
	// must not cross.
	a := dialDoc(t, srv, docX)
	b := dialDoc(t, srv, docY)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := a.Write(ctx, websocket.MessageBinary, []byte{2, 0xaa}); err != nil {
		t.Fatalf("a write: %v", err)
	}

	echoCtx, echoCancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer echoCancel()
	if _, _, err := b.Read(echoCtx); err == nil {
		t.Fatalf("client in docY received a frame from docX")
	}
}

func TestThreeClientFanOut(t *testing.T) {
	srv, _, store := startTestGateway(t)
	docID := seedDoc(t, store, "fanout.docx")
	a := dialDoc(t, srv, docID)
	b := dialDoc(t, srv, docID)
	c := dialDoc(t, srv, docID)

	// Wait for all three registrations.
	time.Sleep(100 * time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	frame := []byte{2, 0xca, 0xfe}
	if err := a.Write(ctx, websocket.MessageBinary, frame); err != nil {
		t.Fatalf("a write: %v", err)
	}

	for i, conn := range []*websocket.Conn{b, c} {
		readCtx, rcancel := context.WithTimeout(context.Background(), 2*time.Second)
		mt, got, err := conn.Read(readCtx)
		rcancel()
		if err != nil {
			t.Fatalf("peer %d read: %v", i, err)
		}
		if mt != websocket.MessageBinary || string(got) != string(frame) {
			t.Fatalf("peer %d got %x mt=%v; want %x binary", i, got, mt, frame)
		}
	}
}
