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
	"github.com/schnsrw/docx/backend/internal/yws"
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

// wsHandler upgrades to a WebSocket, registers the client with
// the room manager, and runs a reader+writer pair until the
// connection drops. Inbound binary frames are fanned to peers
// via Room.Broadcast — the gateway is a pure relay for the
// y-websocket protocol (see docs/05 §"Why our own protocol
// implementation").
func wsHandler(rooms *room.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		docID := docIDFromPath(r.URL.Path)
		if docID == "" {
			http.Error(w, "missing docId", http.StatusBadRequest)
			return
		}

		// AcceptOptions are intentionally permissive for M1.
		// Production: lock origins down via the auth layer
		// (docs/05-backend-design.md §Auth).
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if err != nil {
			log.Printf("ws accept failed for doc=%s: %v", docID, err)
			return
		}
		// Default to "going away" on any unhandled exit; we
		// override with NormalClosure on the clean-shutdown path
		// below.
		defer conn.CloseNow()

		rm, client := rooms.Join(docID)
		defer rooms.Leave(rm, client)

		log.Printf("ws join doc=%s client=%d total=%d", docID, client.ID(), rm.Clients())

		// Tie the WS lifetime to the request context so an HTTP
		// server shutdown unblocks both reader and writer loops.
		ctx := r.Context()

		// Run reader inline and writer in a goroutine. When the
		// reader returns (connection closed by peer, frame error,
		// or context cancel), RemoveClient closes client.Send
		// which terminates the writer.
		writerDone := make(chan struct{})
		go runWriter(ctx, conn, client, writerDone)
		runReader(ctx, conn, rm, client, docID)
		<-writerDone

		log.Printf("ws leave doc=%s client=%d remaining=%d", docID, client.ID(), rm.Clients())
		_ = conn.Close(websocket.StatusNormalClosure, "")
	}
}

// runReader pumps inbound binary frames into the room's
// broadcast hub. Text frames are ignored (the y-websocket protocol
// is binary-only); empty frames are dropped before broadcast (a
// protocol violation per yws.Classify, but cheap to tolerate).
//
// Returns on any read error — peer close, protocol failure, or
// the request context being canceled.
func runReader(ctx context.Context, conn *websocket.Conn, rm *room.Room, client *room.Client, docID string) {
	for {
		mt, data, err := conn.Read(ctx)
		if err != nil {
			// CloseError is expected on peer-initiated close;
			// other errors are surfaced as a single log line.
			var ce websocket.CloseError
			if !errors.As(err, &ce) && !errors.Is(err, context.Canceled) {
				log.Printf("ws read err doc=%s client=%d: %v", docID, client.ID(), err)
			}
			return
		}
		if mt != websocket.MessageBinary {
			// y-websocket carries everything in binary frames;
			// drop anything else without dropping the conn.
			continue
		}
		msgType, ok := yws.Classify(data)
		if !ok {
			// Empty frame — protocol violation. Don't echo;
			// loop continues and may receive a valid frame next.
			continue
		}
		// Awareness frames are also pure pass-through — they
		// just don't touch any doc state — but we log message
		// type to make traffic patterns visible during M1 dev.
		_ = msgType
		rm.Broadcast(client, data)
	}
}

// runWriter drains client.Send and writes each frame to the WS as
// a binary message. Exits when Send is closed (RemoveClient) or
// the context is canceled. The done channel signals the parent
// handler that the writer has fully exited so it can close the
// underlying conn without a race.
func runWriter(ctx context.Context, conn *websocket.Conn, client *room.Client, done chan struct{}) {
	defer close(done)
	for {
		select {
		case <-ctx.Done():
			return
		case frame, ok := <-client.Send:
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := conn.Write(writeCtx, websocket.MessageBinary, frame)
			cancel()
			if err != nil {
				if !errors.Is(err, context.Canceled) {
					log.Printf("ws write err client=%d: %v", client.ID(), err)
				}
				return
			}
		}
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
