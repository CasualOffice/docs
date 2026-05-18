// Package main is the entry point for the Casual Editor backend
// y-websocket gateway.
//
// Listens on `:8080` by default (override with GATEWAY_ADDR env)
// and accepts WebSocket connections at `/doc/{docId}`. Each room
// holds an in-memory Y.Doc that's seeded from WOPI on first
// connect and snapshotted back to WOPI on last disconnect. See
// docs/05-backend-design.md for the wire-level lifecycle.
//
// This is the M1 scaffold: the server boots, accepts connections,
// and routes by docId. The actual y-websocket protocol handling
// + room manager + WOPI integration land in follow-up commits.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/coder/websocket"

	"github.com/schnsrw/docx/backend/internal/room"
)

// listenAddr returns the TCP address the gateway should bind to.
// Falls back to ":8080" so the M1 local-dev story stays trivial.
func listenAddr() string {
	if addr := os.Getenv("GATEWAY_ADDR"); addr != "" {
		return addr
	}
	return ":8080"
}

// healthHandler is a lightweight liveness probe. Returns 200 with
// the running gateway version. Reserved for container health
// checks; not part of the WS protocol.
func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprintln(w, "casual-editor gateway: ok")
}

// docIDFromPath extracts `{docId}` from a `/doc/{docId}` request
// path. Returns the empty string when the path is malformed —
// callers should treat that as a 400.
func docIDFromPath(path string) string {
	const prefix = "/doc/"
	if !strings.HasPrefix(path, prefix) {
		return ""
	}
	rest := path[len(prefix):]
	// Strip any trailing slash or sub-path; the gateway only
	// recognizes the bare /doc/<id> form.
	if i := strings.IndexAny(rest, "/?"); i >= 0 {
		rest = rest[:i]
	}
	return rest
}

// wsHandler upgrades to a WebSocket and hands the connection to
// the room manager. The actual y-websocket protocol is driven by
// internal/yws once that lands; for now we accept and immediately
// close — enough to prove the upgrade path works end-to-end and
// the rooms map gets populated.
func wsHandler(rooms *room.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		docID := docIDFromPath(r.URL.Path)
		if docID == "" {
			http.Error(w, "missing docId", http.StatusBadRequest)
			return
		}

		// AcceptOptions are intentionally permissive for M1.
		// Production: lock origins down via the auth layer
		// (`docs/05-backend-design.md` §Auth).
		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if err != nil {
			log.Printf("ws accept failed for doc=%s: %v", docID, err)
			return
		}

		room := rooms.Join(docID)
		defer rooms.Leave(docID)

		// Placeholder: send a "hello" text frame so we can verify
		// the round-trip end-to-end without yet implementing the
		// binary y-websocket protocol.
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		if err := c.Write(ctx, websocket.MessageText, []byte(
			fmt.Sprintf("hello, you joined room %s (clients=%d)", docID, room.Clients()),
		)); err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("ws hello write failed for doc=%s: %v", docID, err)
		}

		// Close cleanly — the real loop (read binary frames →
		// yws.Handle → broadcast) lands in a follow-up commit.
		_ = c.Close(websocket.StatusNormalClosure, "M1 scaffold: protocol not yet wired")
	}
}

func main() {
	rooms := room.NewManager()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/doc/", wsHandler(rooms))

	addr := listenAddr()
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Graceful shutdown on SIGINT / SIGTERM. The future final-
	// disconnect snapshot path will hook in here once the room
	// manager grows that lifecycle.
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("gateway shutdown error: %v", err)
		}
	}()

	log.Printf("casual-editor gateway listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("gateway listen error: %v", err)
	}
	log.Printf("casual-editor gateway shut down cleanly")
}
