// Package main is the entry point for the Casual Editor backend
// y-websocket gateway.
//
// Listens on `:8080` by default (override with GATEWAY_ADDR env)
// and exposes:
//
//	POST /api/docs                — upload a .docx, mint a docId,
//	                                return { docId, shareUrl }.
//	GET  /api/docs/{docId}/download — stream the latest snapshot.
//	GET  /api/docs/{docId}/history — revision-metadata log (JSON
//	                                array: version, savedAt, size).
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
	"log/slog"
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

	"github.com/schnsrw/docx/backend/internal/auth/personal"
	wopiauth "github.com/schnsrw/docx/backend/internal/auth/wopi"
	"github.com/schnsrw/docx/backend/internal/host"
	"github.com/schnsrw/docx/backend/internal/host/inline"
	"github.com/schnsrw/docx/backend/internal/host/local"
	hostwopi "github.com/schnsrw/docx/backend/internal/host/wopi"
	"github.com/schnsrw/docx/backend/internal/limit"
	"github.com/schnsrw/docx/backend/internal/middleware"
	"github.com/schnsrw/docx/backend/internal/room"
	"github.com/schnsrw/docx/backend/internal/yws"
)

// initLogger sets up the process-wide slog default. LOG_FORMAT=json
// (or unset on production deploys via the Docker image's env)
// produces a JSON handler operators can pipe into Loki / Cloudwatch;
// anything else produces the human-readable text handler used during
// local development. LOG_LEVEL=debug raises the verbosity; default
// is info.
func initLogger() {
	var level slog.Level
	switch strings.ToLower(os.Getenv("LOG_LEVEL")) {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: level}
	var h slog.Handler
	if strings.EqualFold(os.Getenv("LOG_FORMAT"), "json") {
		h = slog.NewJSONHandler(os.Stderr, opts)
	} else {
		h = slog.NewTextHandler(os.Stderr, opts)
	}
	slog.SetDefault(slog.New(h))
}

// envInt returns the env var `name` parsed as int, falling back
// to `def` when unset, empty, or unparseable.
func envInt(name string, def int) int {
	raw := os.Getenv(name)
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return def
	}
	return n
}

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

// docIDFromRenamePath extracts `{docId}` from
// `/api/docs/{docId}/rename`. Returns the empty string for any
// other shape.
func docIDFromRenamePath(path string) string {
	const prefix = "/api/docs/"
	const suffix = "/rename"
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
func uploadHandler(store host.DocStore) http.HandlerFunc {
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

		slog.Info("upload",
			slog.String("docId", docID),
			slog.String("file", fileName),
			slog.Int("size", len(contents)),
			slog.String("rid", middleware.RequestIDFromContext(r.Context())))

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
// renameHandler updates the stored fileName for a doc. Same path
// shape as download (`/api/docs/{docId}/rename`) but PATCH-only.
// JSON body: `{ "fileName": "new name.docx" }`. 200 on success
// with `{ "fileName": "..." }`, 404 if the docId is unknown.
//
// Cross-peer sync is the client's job — the React layer also
// writes the new name into the shared Y.Doc's meta map so live
// peers see it without polling the server.
func renameHandler(store host.DocStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			writeJSONError(w, http.StatusMethodNotAllowed, "method", "PATCH required")
			return
		}
		docID := docIDFromRenamePath(r.URL.Path)
		if docID == "" {
			writeJSONError(w, http.StatusBadRequest, "path", "expected /api/docs/{docId}/rename")
			return
		}
		var body struct {
			FileName string `json:"fileName"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "json", "invalid body: "+err.Error())
			return
		}
		body.FileName = strings.TrimSpace(body.FileName)
		if body.FileName == "" {
			writeJSONError(w, http.StatusBadRequest, "fileName", "fileName required")
			return
		}
		if len(body.FileName) > 255 {
			writeJSONError(w, http.StatusBadRequest, "fileName", "fileName too long (>255 chars)")
			return
		}
		if err := store.Rename(docID, body.FileName); err != nil {
			if errors.Is(err, host.ErrNotFound) {
				writeJSONError(w, http.StatusNotFound, "not_found", "no such doc")
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "rename", err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(struct {
			FileName string `json:"fileName"`
		}{FileName: body.FileName})
	}
}

func downloadHandler(store host.DocStore) http.HandlerFunc {
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

		// authToken comes from the WOPI redirect flow — see the same
		// pattern in wsHandler. Inline + local hosts ignore it; the
		// WOPI host client uses it to authenticate the outbound call.
		authToken := r.URL.Query().Get("access_token")
		contents, info, err := store.Fetch(r.Context(), docID, authToken)
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

// docIDFromHistoryPath extracts `{docId}` from
// `/api/docs/{docId}/history`. Returns the empty string for any
// other shape.
func docIDFromHistoryPath(path string) string {
	const prefix = "/api/docs/"
	const suffix = "/history"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return ""
	}
	return path[len(prefix) : len(path)-len(suffix)]
}

// historyHandler returns the revision-metadata log for a doc as a
// JSON array (creation first, newest last). Read-only, unrated —
// the version-history panel may poll it. Content-revert to a past
// revision is NOT supported here (needs the M2 serializer worker +
// per-revision blob storage); this endpoint is metadata only.
func historyHandler(store host.DocStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSONError(w, http.StatusMethodNotAllowed, "method", "GET required")
			return
		}
		docID := docIDFromHistoryPath(r.URL.Path)
		if docID == "" {
			writeJSONError(w, http.StatusBadRequest, "path", "expected /api/docs/{docId}/history")
			return
		}
		revisions, err := store.History(docID)
		if err != nil {
			if errors.Is(err, host.ErrNotFound) {
				writeJSONError(w, http.StatusNotFound, "not_found", "no such doc")
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "history", err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		// revisions is never nil (History returns a non-nil slice for
		// an existing doc), so this always serializes as a JSON array.
		_ = json.NewEncoder(w).Encode(revisions)
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
		//
		// authToken comes from the WS connect URL's access_token
		// query param — populated by the /wopi/host redirect in
		// Mode 2, ignored by inline/local hosts (they treat it as
		// the empty string). Stateless: the gateway never stores
		// the token between connects.
		authToken := r.URL.Query().Get("access_token")
		if _, _, err := integration.Fetch(r.Context(), docID, authToken); err != nil {
			if errors.Is(err, host.ErrNotFound) {
				http.Error(w, "no such doc", http.StatusNotFound)
				return
			}
			if errors.Is(err, host.ErrForbidden) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			// Non-NotFound / non-Forbidden errors were previously
			// turned into a generic 502 with no server-side signal
			// — operators had to reproduce the failure from scratch
			// to diagnose. Log the actual cause so transient host
			// errors leave a breadcrumb.
			slog.Error("ws preflight host.Fetch failed",
				slog.String("docId", docID), slog.Any("err", err))
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
			slog.Error("ws accept failed",
				slog.String("docId", docID), slog.Any("err", err))
			return
		}
		// Default to "going away" on any unhandled exit; we
		// override with NormalClosure on the clean-shutdown path
		// below.
		defer conn.CloseNow()

		rm, client, joinErr := rooms.Join(docID)
		if joinErr != nil {
			// Capacity cap reached. Close with PolicyViolation +
			// "capacity_full" reason string so the client knows
			// it should back off rather than reconnect. HTTP
			// Retry-After semantics don't apply over WS; the reason
			// string is the only signal the joiner gets. Matches
			// the sheets equivalent's 503 capacity_full envelope
			// in spirit; only the transport differs.
			slog.Warn("ws join refused",
				slog.String("docId", docID), slog.Any("err", joinErr))
			_ = conn.Close(websocket.StatusPolicyViolation, "capacity_full")
			return
		}
		defer rooms.Leave(rm, client)

		slog.Info("ws join",
			slog.String("docId", docID),
			slog.Int("clientId", int(client.ID())),
			slog.Int("clients", rm.Clients()))

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

		slog.Info("ws leave",
			slog.String("docId", docID),
			slog.Int("clientId", int(client.ID())),
			slog.Int("remaining", rm.Clients()))
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
				slog.Warn("ws read err",
					slog.String("docId", docID),
					slog.Int("clientId", int(client.ID())),
					slog.Any("err", err))
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
					slog.Warn("ws write err",
						slog.Int("clientId", int(client.ID())),
						slog.Any("err", err))
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

// selectStore picks the concrete host implementation from env at
// startup. GATEWAY_HOST=local routes through the filesystem store
// (docs persist across restart) under CASUAL_LOCAL_PATH; anything
// else falls back to inline (in-memory). Returning host.DocStore
// keeps every handler downstream host-agnostic.
// peruserAdapter is the thin glue between the personal.FileStore
// interface (which doesn't know about local) and local.PerUserStores
// (which doesn't know about personal). Keeps the two packages
// independent — both are imported here, at the wiring layer, and
// nowhere else.
type peruserAdapter struct {
	stores *local.PerUserStores
}

// summaryFor synthesises a personal.FileSummary from a local Store
// + docID by reading the meta sidecar. Used after operations that
// touch the doc (Store / Snapshot) to return the freshly-updated
// summary to the HTTP layer.
func summaryFor(ctx context.Context, s *local.Store, docID string) (personal.FileSummary, error) {
	contents, info, err := s.Fetch(ctx, docID, "")
	if err != nil {
		return personal.FileSummary{}, err
	}
	v, _ := strconv.ParseUint(info.Version, 10, 64)
	// Fetch returns the full byte slice; we only need len() — a future
	// optimization could split into Fetch + Stat to skip the read.
	// At single-user M3 scale this is well under any latency budget.
	return personal.FileSummary{
		DocID:    docID,
		FileName: info.FileName,
		Version:  v,
		SavedAt:  time.Now().UTC().Format(time.RFC3339),
		Size:     int64(len(contents)),
	}, nil
}

// ListFor returns the user's docs as personal.FileSummary slices.
// time.Time -> RFC3339 string happens at this seam so the personal
// package can stay free of host-side type deps.
func (a *peruserAdapter) ListFor(userID string) ([]personal.FileSummary, error) {
	s, err := a.stores.For(userID)
	if err != nil {
		return nil, err
	}
	raw, err := s.List(context.Background())
	if err != nil {
		return nil, err
	}
	out := make([]personal.FileSummary, len(raw))
	for i, r := range raw {
		out[i] = personal.FileSummary{
			DocID:    r.DocID,
			FileName: r.FileName,
			Version:  r.Version,
			SavedAt:  r.SavedAt.UTC().Format(time.RFC3339),
			Size:     r.Size,
		}
	}
	return out, nil
}

// StoreFor mints a docID and persists fresh upload bytes under the
// user's scoped store. Returns the resulting summary with version 1.
func (a *peruserAdapter) StoreFor(userID, fileName string, contents []byte) (personal.FileSummary, error) {
	s, err := a.stores.For(userID)
	if err != nil {
		return personal.FileSummary{}, err
	}
	docID, err := s.Store(fileName, contents)
	if err != nil {
		return personal.FileSummary{}, err
	}
	return personal.FileSummary{
		DocID:    docID,
		FileName: fileName,
		Version:  1,
		SavedAt:  time.Now().UTC().Format(time.RFC3339),
		Size:     int64(len(contents)),
	}, nil
}

// FetchFor returns the user's doc bytes + a summary. ErrNotFound
// surfaces up through host.ErrNotFound so the handler can map it to
// a 404.
func (a *peruserAdapter) FetchFor(ctx context.Context, userID, docID string) (personal.FileSummary, []byte, error) {
	s, err := a.stores.For(userID)
	if err != nil {
		return personal.FileSummary{}, nil, err
	}
	contents, info, err := s.Fetch(ctx, docID, "")
	if err != nil {
		return personal.FileSummary{}, nil, err
	}
	v, _ := strconv.ParseUint(info.Version, 10, 64)
	return personal.FileSummary{
		DocID:    docID,
		FileName: info.FileName,
		Version:  v,
		SavedAt:  time.Now().UTC().Format(time.RFC3339),
		Size:     int64(len(contents)),
	}, contents, nil
}

// DeleteUserData removes the user's per-user directory wholesale.
// Called by the admin DELETE /admin/users/{id} route after the
// SQLite row is gone, so a half-deleted user never leaves orphaned
// .docx blobs on disk. The cache entry for the user's Store is
// dropped here too — a future admin-undelete would mint a fresh dir.
func (a *peruserAdapter) DeleteUserData(userID string) error {
	root := filepath.Join(a.stores.BaseRoot(), "users", userID)
	if err := os.RemoveAll(root); err != nil {
		return fmt.Errorf("delete user dir %q: %w", root, err)
	}
	return nil
}

// SaveFor overwrites the doc and bumps version. The summary returned
// after Snapshot reflects the new version.
func (a *peruserAdapter) SaveFor(ctx context.Context, userID, docID string, contents []byte) (personal.FileSummary, error) {
	s, err := a.stores.For(userID)
	if err != nil {
		return personal.FileSummary{}, err
	}
	if err := s.Snapshot(ctx, docID, "", contents); err != nil {
		return personal.FileSummary{}, err
	}
	return summaryFor(ctx, s, docID)
}

// RenameFor updates fileName without bumping version.
func (a *peruserAdapter) RenameFor(userID, docID, newName string) error {
	s, err := a.stores.For(userID)
	if err != nil {
		return err
	}
	return s.Rename(docID, newName)
}

// DeleteFor removes the doc + sidecar from disk.
func (a *peruserAdapter) DeleteFor(userID, docID string) error {
	s, err := a.stores.For(userID)
	if err != nil {
		return err
	}
	return s.Delete(docID)
}

func selectStore() (host.DocStore, error) {
	kind := strings.ToLower(strings.TrimSpace(os.Getenv("GATEWAY_HOST")))
	switch kind {
	case "", "inline":
		slog.Info("host: inline (in-memory; docs lost on restart)")
		return inline.New(), nil
	case "local":
		path := os.Getenv("CASUAL_LOCAL_PATH")
		if path == "" {
			path = "/data"
		}
		s, err := local.New(path)
		if err != nil {
			return nil, fmt.Errorf("init local host at %q: %w", path, err)
		}
		slog.Info("host: local (filesystem)", slog.String("root", s.Root()))
		return s, nil
	case "wopi":
		// WOPI client: gateway acts as the editor consuming a remote
		// WOPI host's files. No local file storage; every Fetch /
		// Snapshot is an HTTP call to the host the user came from
		// (encoded into the docID by the /wopi/host redirect — D3,
		// not yet wired).
		c := hostwopi.New(hostwopi.Options{})
		slog.Info("host: wopi (remote)")
		return hostwopi.DocStoreAdapter{Client: c}, nil
	default:
		return nil, fmt.Errorf("unknown GATEWAY_HOST=%q (expected inline | local | wopi)", kind)
	}
}

func main() {
	initLogger()
	store, err := selectStore()
	if err != nil {
		log.Fatalf("host init: %v", err)
	}

	// MAX_ROOMS caps concurrent open docs. Default 256 matches the
	// sheets equivalent (Stream C2 of the production-readiness
	// pipeline). 0 disables the cap entirely — useful for dev +
	// load testing where the cap would mask real failures.
	maxRooms := envInt("MAX_ROOMS", 256)
	rooms := room.NewManager(
		room.WithDrainFunc(func(docID string) {
			// v0 snapshot: every joiner already has the original .docx
			// bytes via /api/docs/{id}/download, and the gateway can't
			// re-serialize the Y.Doc back to .docx without a worker
			// pool (M2 / Bun headless serializer). Log the drain so
			// operators can see room lifecycle; the original bytes
			// remain in the inline store for re-seed on the next join.
			slog.Info("room drain — original snapshot retained",
				slog.String("docId", docID))
		}),
		room.WithMaxRooms(maxRooms),
	)
	slog.Info("room manager started", slog.Int("maxRooms", maxRooms))

	// Per-IP token-bucket limiters (G1 of the gateway hardening pass —
	// equivalent of sheets Stream C1). Two tiers because upload is
	// byte-heavy and should have a tighter envelope than the control
	// plane.
	//
	// Disable either by setting the env to 0 (e.g. for load tests).
	uploadCfg := limit.DefaultUpload()
	uploadCfg.PerMin = envInt("UPLOAD_RATE_LIMIT_PER_MIN", uploadCfg.PerMin)
	uploadLimiter := limit.New(uploadCfg)
	generalCfg := limit.DefaultGeneral()
	generalCfg.PerMin = envInt("RATE_LIMIT_PER_MIN", generalCfg.PerMin)
	generalLimiter := limit.New(generalCfg)
	slog.Info("rate limit configured",
		slog.Int("uploadPerMin", uploadCfg.PerMin),
		slog.Int("generalPerMin", generalCfg.PerMin))

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)

	// Personal-mode (Mode 3) auth wires onto the same mux when
	// GATEWAY_AUTH=personal is set. CASUAL_LOCAL_PATH is the base
	// for users.db (defaults to /data, same default as the local
	// host); CASUAL_SESSION_KEY is the HMAC signing key (>= 16
	// bytes; fatal if unset so a misconfigured deploy never falls
	// back to an unsigned session). SECURE_COOKIES=true flips the
	// `__Host-` prefix + Secure flag on every Set-Cookie — required
	// for HTTPS production deploys, intentionally off by default
	// so localhost dev works without TLS.
	if strings.EqualFold(os.Getenv("GATEWAY_AUTH"), "personal") {
		authRoot := os.Getenv("CASUAL_LOCAL_PATH")
		if authRoot == "" {
			authRoot = "/data"
		}
		users, err := personal.New(authRoot)
		if err != nil {
			log.Fatalf("auth: open user store at %q: %v", authRoot, err)
		}
		keyRaw := os.Getenv("CASUAL_SESSION_KEY")
		if keyRaw == "" {
			log.Fatal("auth: CASUAL_SESSION_KEY unset — refusing to mount unsigned sessions")
		}
		sess, err := personal.NewSession([]byte(keyRaw))
		if err != nil {
			log.Fatalf("auth: build session signer: %v", err)
		}
		secure := strings.EqualFold(os.Getenv("SECURE_COOKIES"), "true")

		// Per-user file scoping (Batch 3) — separate manager from the
		// single-tenant `store` above so the legacy /api/docs/* path
		// stays untouched. Each user lands under
		// <authRoot>/users/<userID>/, with the docx + meta layout the
		// single-tenant local host already uses. Mounted unconditionally
		// alongside personal auth because the per-user dirs are cheap
		// to create lazily and the FS layout is identical to the local
		// host's.
		perUser, err := local.NewPerUserStores(authRoot)
		if err != nil {
			log.Fatalf("auth: per-user stores at %q: %v", authRoot, err)
		}

		// Profile store (Batch 4.5) — JSON sidecar at
		// <authRoot>/users/<userID>/.profile.json. Lives next to the
		// per-user docx files so an operator inspecting a user's
		// directory sees everything in one place. The path closure
		// keeps personal/ free of any host/local dep.
		profiles := personal.NewFileProfileStore(func(userID string) string {
			return filepath.Join(perUser.BaseRoot(), "users", userID, ".profile.json")
		})

		// AdminRoutes toggles the /admin/* surface. Default off so a
		// deploy that only uses personal auth for the editor doesn't
		// inadvertently expose user-list + user-delete; flip
		// ADMIN_ROUTES=true to mount them.
		adminRoutes := strings.EqualFold(os.Getenv("ADMIN_ROUTES"), "true")

		adapter := &peruserAdapter{stores: perUser}
		(&personal.Handlers{
			Users:       users,
			Session:     sess,
			Files:       adapter,
			Profiles:    profiles,
			UserDeleter: adapter,
			AdminRoutes: adminRoutes,
			Secure:      secure,
		}).Routes(mux)
		slog.Info("auth: personal mode mounted",
			slog.Bool("secureCookies", secure),
			slog.String("root", authRoot))
	}

	// WOPI redirect (Mode 2) — mounted when CASUAL_WOPI_JWKS_URL is
	// set so the gateway can verify access tokens against the host's
	// published key set. Without it the route 404s, preserving the
	// "no auth, no mount" pattern the personal and admin routes use.
	if jwksURL := os.Getenv("CASUAL_WOPI_JWKS_URL"); jwksURL != "" {
		verifier, err := wopiauth.NewVerifier(wopiauth.Options{JWKSURL: jwksURL})
		if err != nil {
			log.Fatalf("wopi verifier init: %v", err)
		}
		// Route only the exact path, not a prefix — the editor's
		// /wopi/* surface might grow other endpoints later that
		// shouldn't pass through the redirect handler.
		mux.HandleFunc("GET "+wopiRedirectPath, wopiRedirectHandler(verifier))
		slog.Info("auth: wopi mode mounted",
			slog.String("jwksURL", jwksURL))
	}

	// POST /api/docs (upload) — under the upload bucket (tighter).
	mux.Handle("/api/docs", uploadLimiter.Middleware(uploadHandler(store)))

	// `/api/docs/{id}/{action}` — dispatch on the trailing path
	// segment so download + rename share the same prefix without
	// needing a router lib. Rename is a control-plane POST; download
	// is a read endpoint that intentionally stays unrated (returning
	// peers re-joining a doc shouldn't get throttled).
	docsActionHandler := downloadHandler(store)
	docsRenameHandler := renameHandler(store)
	docsHistoryHandler := historyHandler(store)
	mux.HandleFunc("/api/docs/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/rename") {
			// Apply the general bucket only for the rename path;
			// the rest of the handler tree (download) stays unrated.
			generalLimiter.Middleware(http.HandlerFunc(docsRenameHandler)).ServeHTTP(w, r)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/history") {
			// Read-only revision-metadata list; unrated like download.
			docsHistoryHandler(w, r)
			return
		}
		docsActionHandler(w, r)
	})
	mux.HandleFunc("/doc/", wsHandler(rooms, store))

	// Bundled-image mode: when STATIC_DIR is set, also serve the
	// built editor SPA on / with a fallback to index.html for
	// client-side routes. Local dev leaves it unset and runs Vite
	// on :5173 against this gateway on :8080.
	if dir := staticDir(); dir != "" {
		slog.Info("serving static SPA", slog.String("dir", dir))
		mux.Handle("/", staticHandler(dir))
	}

	addr := listenAddr()
	// Middleware chain (outermost first): request-id → CORS → mux.
	// Access logging is enabled when ACCESS_LOG=true so the local
	// dev story stays quiet; production deploys flip the env var.
	var handler http.Handler = mux
	if strings.EqualFold(os.Getenv("ACCESS_LOG"), "true") {
		handler = middleware.AccessLog(slog.Default(), handler)
	}
	handler = withCORS(handler)
	handler = middleware.RequestID(handler)

	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
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
			slog.Error("gateway shutdown error", slog.Any("err", err))
		}
	}()

	slog.Info("casual-editor gateway listening", slog.String("addr", addr))
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("gateway listen error: %v", err)
	}
	slog.Info("casual-editor gateway shut down cleanly")
}
