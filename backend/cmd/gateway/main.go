// Package main is the entry point for the Casual Editor backend
// y-websocket gateway.
//
// Listens on `:8080` by default (override with GATEWAY_ADDR env)
// and exposes:
//
//	POST /api/docs                — upload a .docx, mint a docId,
//	                                return { docId, shareUrl }.
//	GET  /api/docs/{docId}/download — stream the latest snapshot.
//	GET  /doc/{docId}             — WebSocket; client joins the
//	                                live co-edit session.
//	GET  /health                  — liveness probe.
//
// See docs/05-backend-design.md for the wire-level lifecycle.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/coder/websocket"

	"github.com/schnsrw/docx/backend/internal/host"
	"github.com/schnsrw/docx/backend/internal/host/inline"
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

// staticDir returns the directory the gateway should serve the built
// SPA from, or "" if it should only handle API + WS routes (the
// local-dev story where Vite serves the editor on :5173). The
// production Docker image bakes the editor into /static and sets
// STATIC_DIR=/static so both live behind the same origin.
func staticDir() string {
	return os.Getenv("STATIC_DIR")
}

// staticHandler serves the bundled editor's index.html / assets out
// of dir, with an SPA fallback: any request that doesn't match a
// file on disk (and isn't an API/WS route — those are caught by
// more-specific handlers registered on the mux first) returns
// index.html so the client-side router can resolve it.
func staticHandler(dir string) http.HandlerFunc {
	fs := http.FileServer(http.Dir(dir))
	indexPath := filepath.Join(dir, "index.html")
	return func(w http.ResponseWriter, r *http.Request) {
		// Reject anything that escapes the static root before
		// touching the filesystem.
		clean := filepath.Clean(r.URL.Path)
		if strings.Contains(clean, "..") {
			http.Error(w, "bad path", http.StatusBadRequest)
			return
		}
		full := filepath.Join(dir, clean)
		info, err := os.Stat(full)
		if err == nil && !info.IsDir() {
			fs.ServeHTTP(w, r)
			return
		}
		// SPA fallback: serve index.html for any unmatched path
		// so /r/{docId} and other client-side routes work after a
		// hard refresh.
		http.ServeFile(w, r, indexPath)
	}
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

// docIDFromDownloadPath extracts `{docId}` from
// `/api/docs/{docId}/download`. Returns the empty string for
// any other shape.
func docIDFromDownloadPath(path string) string {
	const prefix = "/api/docs/"
	const suffix = "/download"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return ""
	}
	return path[len(prefix) : len(path)-len(suffix)]
}

// maxUploadBytes bounds the .docx upload size. The browser's
// File Open path accepts files up to this size; anything larger
// is rejected before allocating server-side buffers. 100 MB
// matches sheet's MAX_UPLOAD_MB default.
const maxUploadBytes = 100 * 1024 * 1024

// uploadResponse is the JSON returned from POST /api/docs.
type uploadResponse struct {
	DocID    string `json:"docId"`
	ShareURL string `json:"shareUrl"`
	WSPath   string `json:"wsPath"`
}

// writeJSONError sends a small structured error response. The
// shape matches what the React client expects:
//
//	{ "error": "<machine-friendly code>", "message": "..." }
func writeJSONError(w http.ResponseWriter, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code, "message": msg})
}

// uploadHandler accepts a multipart .docx upload, hands the
// bytes to the inline store, and returns the freshly-minted
// docId + the share URL.
func uploadHandler(store *inline.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSONError(w, http.StatusMethodNotAllowed, "method", "POST required")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)

		// Two accepted shapes:
		//   - multipart/form-data with `file` field (the browser
		//     <input type="file"> path).
		//   - raw body with Content-Type: application/octet-stream
		//     or application/vnd.openxmlformats-officedocument.
		//     Filename is taken from X-File-Name when present.
		var (
			contents []byte
			fileName string
			err      error
		)
		ct := r.Header.Get("Content-Type")
		if strings.HasPrefix(ct, "multipart/form-data") {
			if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
				writeJSONError(w, http.StatusBadRequest, "upload", "multipart parse failed: "+err.Error())
				return
			}
			file, header, ferr := r.FormFile("file")
			if ferr != nil {
				writeJSONError(w, http.StatusBadRequest, "upload", "missing `file` form field")
				return
			}
			defer file.Close()
			contents, err = io.ReadAll(file)
			if err != nil {
				writeJSONError(w, http.StatusBadRequest, "upload", "read failed: "+err.Error())
				return
			}
			fileName = header.Filename
		} else {
			contents, err = io.ReadAll(r.Body)
			if err != nil {
				writeJSONError(w, http.StatusBadRequest, "upload", "read failed: "+err.Error())
				return
			}
			fileName = r.Header.Get("X-File-Name")
		}

		if len(contents) == 0 {
			writeJSONError(w, http.StatusBadRequest, "empty", "no upload body")
			return
		}
		if fileName == "" {
			fileName = "Untitled.docx"
		}
		// Sanitize filename: keep base name only, prevent any
		// host-relative path injection in Content-Disposition.
		fileName = filepath.Base(fileName)

		docID, err := store.Store(fileName, contents)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "store", err.Error())
			return
		}

		log.Printf("upload doc=%s file=%q size=%d", docID, fileName, len(contents))

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(uploadResponse{
			DocID:    docID,
			ShareURL: "/r/" + docID,
			WSPath:   "/doc/" + docID,
		})
	}
}

// downloadHandler streams the latest snapshot of a doc out as
// a .docx response. Content-Disposition advertises the original
// filename so the browser's Save dialog defaults to it.
func downloadHandler(store *inline.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			writeJSONError(w, http.StatusMethodNotAllowed, "method", "GET required")
			return
		}
		docID := docIDFromDownloadPath(r.URL.Path)
		if docID == "" {
			writeJSONError(w, http.StatusBadRequest, "path", "expected /api/docs/{docId}/download")
			return
		}

		contents, info, err := store.Fetch(r.Context(), docID, "")
		if err != nil {
			if errors.Is(err, host.ErrNotFound) {
				writeJSONError(w, http.StatusNotFound, "not_found", "no such doc")
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "fetch", err.Error())
			return
		}

		fileName := info.FileName
		if fileName == "" {
			fileName = docID + ".docx"
		}
		w.Header().Set(
			"Content-Type",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		)
		w.Header().Set(
			"Content-Disposition",
			fmt.Sprintf(`attachment; filename*=UTF-8''%s`, url.PathEscape(fileName)),
		)
		w.Header().Set("Content-Length", strconv.Itoa(len(contents)))
		if r.Method == http.MethodHead {
			return
		}
		_, _ = w.Write(contents)
	}
}

// wsHandler upgrades to a WebSocket, registers the client with
// the room manager, and runs a reader+writer pair until the
// connection drops. Inbound binary frames are fanned to peers
// via Room.Broadcast — the gateway is a pure relay for the
// y-websocket protocol (see docs/05 §"Why our own protocol
// implementation").
//
// `integration` is the host backend that owns the doc bytes. The
// gateway only consults it to refuse pre-flight (does the docId
// exist?) — actual Y.Doc seed/snapshot are handled at the
// editor/client layer in v0 (the first joiner uploads its own
// snapshot via Yjs; subsequent joiners get it through the
// pass-through broker).
func wsHandler(rooms *room.Manager, integration host.Integration) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		docID := docIDFromPath(r.URL.Path)
		if docID == "" {
			http.Error(w, "missing docId", http.StatusBadRequest)
			return
		}

		// Pre-flight: does the host know about this docId?
		// Refusing here gives the client a clean 404 instead of
		// a successful WS connect that then sees only empty
		// frames forever.
		if _, _, err := integration.Fetch(r.Context(), docID, ""); err != nil {
			if errors.Is(err, host.ErrNotFound) {
				http.Error(w, "no such doc", http.StatusNotFound)
				return
			}
			if errors.Is(err, host.ErrForbidden) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			http.Error(w, "host integration error", http.StatusBadGateway)
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

// withCORS allows the React demo (served from a different port
// during local dev) to call the upload/download endpoints + open
// the WS without a same-origin restriction. M1 ships permissive;
// production should tighten Access-Control-Allow-Origin to a
// known frontend host.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-File-Name")
		w.Header().Set("Access-Control-Max-Age", "300")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	store := inline.New()
	rooms := room.NewManager(room.WithDrainFunc(func(docID string) {
		// v0 snapshot: every joiner already has the original .docx
		// bytes via /api/docs/{id}/download, and the gateway can't
		// re-serialize the Y.Doc back to .docx without a worker
		// pool (M2 / Bun headless serializer). Log the drain so
		// operators can see room lifecycle; the original bytes
		// remain in the inline store for re-seed on the next join.
		log.Printf("room drain doc=%s — original snapshot retained", docID)
	}))

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/docs", uploadHandler(store))
	mux.HandleFunc("/api/docs/", downloadHandler(store))
	mux.HandleFunc("/doc/", wsHandler(rooms, store))

	// Bundled-image mode: when STATIC_DIR is set, also serve the
	// built editor SPA on / with a fallback to index.html for
	// client-side routes. Local dev leaves it unset and runs Vite
	// on :5173 against this gateway on :8080.
	if dir := staticDir(); dir != "" {
		log.Printf("serving static SPA from %s", dir)
		mux.Handle("/", staticHandler(dir))
	}

	addr := listenAddr()
	srv := &http.Server{
		Addr:              addr,
		Handler:           withCORS(mux),
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
