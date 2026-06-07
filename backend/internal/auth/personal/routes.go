package personal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/schnsrw/docx/backend/internal/host"
)

// SessionCookieName is the cookie key set by /auth/login + /auth/signup
// and read by RequireAuth + /auth/me. Exposed so handlers and tests
// can reference the same constant.
const SessionCookieName = "casual_session"

// SessionTTL is how long a fresh /auth/login or /auth/signup cookie
// stays valid. Matches sheet's 30-day default.
const SessionTTL = 30 * 24 * time.Hour

// userCtxKey is the context key used by RequireAuth to thread the
// resolved User into downstream handlers. Unexported + typed so
// no other package can collide on the key.
type userCtxKey struct{}

// UserFromContext returns the User stored on the request context
// by RequireAuth. ok=false when no user is present (handler wasn't
// wrapped, or the middleware decided to let an unauth'd request
// through unchanged).
func UserFromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userCtxKey{}).(User)
	return u, ok
}

// FileStore is the per-user file CRUD surface the personal routes
// consume. Implementations live in cmd/gateway as a thin adapter
// over local.PerUserStores so the personal package stays free of any
// host/local dep (the adapter sits at the wiring layer where both
// packages are already imported).
//
// All methods are user-scoped at the boundary — callers pass the
// authenticated userID resolved by RequireAuth, and the adapter is
// responsible for routing to that user's store. Implementations
// must reject any docID the user doesn't own with host.ErrNotFound.
type FileStore interface {
	// ListFor enumerates the calling user's docs. Newest first.
	ListFor(userID string) ([]FileSummary, error)
	// StoreFor ingests a freshly-uploaded .docx, mints a docID, and
	// returns the resulting summary. fileName is the user-visible
	// name shown in the editor title bar.
	StoreFor(userID, fileName string, contents []byte) (FileSummary, error)
	// FetchFor returns the raw .docx bytes for the user's doc plus
	// the summary so the handler can advertise the filename via
	// Content-Disposition. host.ErrNotFound when the doc isn't the
	// caller's or doesn't exist.
	FetchFor(ctx context.Context, userID, docID string) (FileSummary, []byte, error)
	// SaveFor overwrites the doc's .docx bytes (snapshot save).
	// Returns the updated summary with the bumped version.
	SaveFor(ctx context.Context, userID, docID string, contents []byte) (FileSummary, error)
	// RenameFor updates the stored fileName. Doesn't bump version
	// — renames aren't an edit.
	RenameFor(userID, docID, newName string) error
	// DeleteFor removes the doc + its meta from disk. Idempotent at
	// the FS layer; a re-delete of an already-absent doc returns nil.
	DeleteFor(userID, docID string) error
}


// FileSummary is the wire shape returned by GET /files. Mirrors
// local.Summary but lives in this package so the routes file can
// reference it without importing host/local.
type FileSummary struct {
	DocID    string `json:"docId"`
	FileName string `json:"fileName"`
	Version  uint64 `json:"version"`
	// SavedAt as RFC3339 string — the personal package shouldn't
	// take a time.Time dep here; the local-side conversion handles
	// formatting.
	SavedAt string `json:"savedAt"`
	Size    int64  `json:"size"`
}

// Handlers bundles the wire dependencies for the auth + files
// routes. Built once in main(), wired into the same mux that owns
// the upload / download paths.
type Handlers struct {
	Users   *UserStore
	Session *Session
	// Files, when non-nil, mounts the per-user file CRUD routes
	// behind RequireAuth so the calling user can list / upload /
	// download / rename / delete their own docs. Optional — a deploy
	// that uses personal auth purely for an external host (WOPI etc.)
	// can leave this nil and skip the routes.
	Files FileStore
	// Profiles, when non-nil, mounts GET + PUT /auth/profile so the
	// calling user can read / patch their extended profile (timezone,
	// locale, avatar, prefs). Optional — leaving it nil skips the
	// route and the editor falls back to client-side defaults.
	Profiles ProfileStore
	// Secure flips Set-Cookie's `Secure` flag + the `__Host-` prefix
	// on the cookie name. Operators set this true for production
	// HTTPS deploys and false for localhost / docker-compose dev.
	// Defaults false so a misconfigured deploy fails loud (browsers
	// reject `__Host-` cookies served over http) rather than silently
	// dropping the cookie.
	Secure bool
}

// Routes registers the auth endpoints on the given mux. When
// Handlers.Files is set, GET /files (auth-gated) lands too.
// Idempotent per process — the standard mux panics on double-
// register, which is the right failure mode (a duplicate call is a
// programming bug).
func (h *Handlers) Routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /auth/signup", h.Signup)
	mux.HandleFunc("POST /auth/login", h.Login)
	mux.HandleFunc("POST /auth/logout", h.Logout)
	mux.HandleFunc("GET /auth/me", h.Me)
	if h.Files != nil {
		mux.Handle("GET /files", h.RequireAuth(http.HandlerFunc(h.ListFiles)))
		mux.Handle("POST /files", h.RequireAuth(http.HandlerFunc(h.UploadFile)))
		mux.Handle("GET /files/{docId}", h.RequireAuth(http.HandlerFunc(h.DownloadFile)))
		mux.Handle("PUT /files/{docId}/contents", h.RequireAuth(http.HandlerFunc(h.SaveFile)))
		mux.Handle("PATCH /files/{docId}", h.RequireAuth(http.HandlerFunc(h.RenameFile)))
		mux.Handle("DELETE /files/{docId}", h.RequireAuth(http.HandlerFunc(h.DeleteFile)))
	}
	if h.Profiles != nil {
		mux.Handle("GET /auth/profile", h.RequireAuth(http.HandlerFunc(h.GetProfile)))
		mux.Handle("PUT /auth/profile", h.RequireAuth(http.HandlerFunc(h.PutProfile)))
	}
}

// ListFiles returns the calling user's doc list. Mounted only when
// Handlers.Files is non-nil. RequireAuth has already resolved the
// User onto the request context.
func (h *Handlers) ListFiles(w http.ResponseWriter, r *http.Request) {
	u, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
		return
	}
	list, err := h.Files.ListFor(u.ID)
	if err != nil {
		slog.Error("list files failed", "userId", u.ID, "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "list failed")
		return
	}
	// Always return an array (never null) so the web client doesn't
	// need a null-check before mapping.
	if list == nil {
		list = []FileSummary{}
	}
	writeJSON(w, http.StatusOK, list)
}

// maxUploadBytes caps the body size for upload + save handlers. 100 MB
// matches the legacy /api/docs path's MAX_UPLOAD_MB default; a future
// CASUAL_MAX_UPLOAD_MB env tunable goes through main.go, not here.
const maxUploadBytes = 100 * 1024 * 1024

// UploadFile ingests a new .docx for the calling user and returns the
// resulting summary (docId, fileName, version, size, savedAt). The
// docID is server-minted so two users uploading "report.docx" never
// collide. Accepts the same two body shapes as the legacy
// `/api/docs` upload: multipart/form-data with a `file` field, or
// raw bytes with the filename in `X-File-Name`.
func (h *Handlers) UploadFile(w http.ResponseWriter, r *http.Request) {
	u, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)

	contents, fileName, err := readUploadBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "upload", err.Error())
		return
	}
	if len(contents) == 0 {
		writeError(w, http.StatusBadRequest, "empty", "no upload body")
		return
	}
	if fileName == "" {
		fileName = "Untitled.docx"
	}
	fileName = filepath.Base(fileName)

	summary, err := h.Files.StoreFor(u.ID, fileName, contents)
	if err != nil {
		slog.Error("upload failed", "userId", u.ID, "err", err)
		writeError(w, http.StatusInternalServerError, "store", "upload failed")
		return
	}
	writeJSON(w, http.StatusCreated, summary)
}

// DownloadFile streams the user's doc as a .docx response. The
// Content-Disposition advertises the stored fileName so the browser
// "Save as" dialog defaults to it.
func (h *Handlers) DownloadFile(w http.ResponseWriter, r *http.Request) {
	u, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
		return
	}
	docID := r.PathValue("docId")
	summary, contents, err := h.Files.FetchFor(r.Context(), u.ID, docID)
	if err != nil {
		if errors.Is(err, host.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "no such doc")
			return
		}
		slog.Error("download failed", "userId", u.ID, "docId", docID, "err", err)
		writeError(w, http.StatusInternalServerError, "fetch", "download failed")
		return
	}
	fileName := summary.FileName
	if fileName == "" {
		fileName = docID + ".docx"
	}
	w.Header().Set("Content-Type",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename*=UTF-8''%s`, url.PathEscape(fileName)))
	w.Header().Set("Content-Length", strconv.Itoa(len(contents)))
	w.Header().Set("ETag", strconv.FormatUint(summary.Version, 10))
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(contents)
}

// SaveFile overwrites the user's doc with new .docx bytes (snapshot
// save — bumps version, appends to revision log). The body shape
// mirrors UploadFile so the client doesn't need a different
// serializer for save vs first-upload.
func (h *Handlers) SaveFile(w http.ResponseWriter, r *http.Request) {
	u, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
		return
	}
	docID := r.PathValue("docId")
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	contents, _, err := readUploadBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "upload", err.Error())
		return
	}
	if len(contents) == 0 {
		writeError(w, http.StatusBadRequest, "empty", "no save body")
		return
	}
	summary, err := h.Files.SaveFor(r.Context(), u.ID, docID, contents)
	if err != nil {
		if errors.Is(err, host.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "no such doc")
			return
		}
		slog.Error("save failed", "userId", u.ID, "docId", docID, "err", err)
		writeError(w, http.StatusInternalServerError, "save", "save failed")
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// RenameFile updates the stored fileName. JSON body:
// `{ "fileName": "..." }`. Capped at 255 chars; empty rejected.
func (h *Handlers) RenameFile(w http.ResponseWriter, r *http.Request) {
	u, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
		return
	}
	docID := r.PathValue("docId")
	var body struct {
		FileName string `json:"fileName"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_json", err.Error())
		return
	}
	body.FileName = strings.TrimSpace(body.FileName)
	if body.FileName == "" {
		writeError(w, http.StatusBadRequest, "file_name", "fileName required")
		return
	}
	if len(body.FileName) > 255 {
		writeError(w, http.StatusBadRequest, "file_name", "fileName too long (>255)")
		return
	}
	if err := h.Files.RenameFor(u.ID, docID, body.FileName); err != nil {
		if errors.Is(err, host.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "no such doc")
			return
		}
		slog.Error("rename failed", "userId", u.ID, "docId", docID, "err", err)
		writeError(w, http.StatusInternalServerError, "rename", "rename failed")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		FileName string `json:"fileName"`
	}{FileName: body.FileName})
}

// DeleteFile removes the user's doc. 204 on success; idempotent at
// the FS layer so deleting an already-absent doc still returns 204.
func (h *Handlers) DeleteFile(w http.ResponseWriter, r *http.Request) {
	u, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
		return
	}
	docID := r.PathValue("docId")
	if err := h.Files.DeleteFor(u.ID, docID); err != nil {
		if errors.Is(err, host.ErrNotFound) {
			// Malformed docID — gate at the FS layer returned ErrNotFound.
			// 204 anyway so the client doesn't have to distinguish
			// "deleted now" from "was never valid"; either way the
			// caller's intent is satisfied.
			w.WriteHeader(http.StatusNoContent)
			return
		}
		slog.Error("delete failed", "userId", u.ID, "docId", docID, "err", err)
		writeError(w, http.StatusInternalServerError, "delete", "delete failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// profileView is the response shape for GET / PUT /auth/profile. It
// merges the User identity fields (which live in SQLite) with the
// Profile extended fields (which live in the JSON sidecar) so the
// client gets a single object to render. The split between sources
// is invisible to the web client.
type profileView struct {
	UserID      string         `json:"userId"`
	Email       string         `json:"email"`
	DisplayName string         `json:"displayName"`
	Timezone    string         `json:"timezone,omitempty"`
	Locale      string         `json:"locale,omitempty"`
	AvatarURL   string         `json:"avatarUrl,omitempty"`
	Prefs       map[string]any `json:"prefs,omitempty"`
}

func mergeProfileView(u User, p Profile) profileView {
	return profileView{
		UserID:      u.ID,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		Timezone:    p.Timezone,
		Locale:      p.Locale,
		AvatarURL:   p.AvatarURL,
		Prefs:       p.Prefs,
	}
}

// GetProfile returns the merged profile view for the calling user.
// Missing .profile.json is normal (never written yet); zero values
// for the extended fields signal "use client defaults".
func (h *Handlers) GetProfile(w http.ResponseWriter, r *http.Request) {
	u, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
		return
	}
	p, err := h.Profiles.Read(u.ID)
	if err != nil {
		slog.Error("read profile failed", "userId", u.ID, "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "read failed")
		return
	}
	writeJSON(w, http.StatusOK, mergeProfileView(u, p))
}

// PutProfile applies a patch. DisplayName updates route to
// UserStore.UpdateDisplayName (identity stays authoritative in
// SQLite); everything else lands in the JSON sidecar. Returns the
// merged view so the client doesn't need a separate GET after PUT.
func (h *Handlers) PutProfile(w http.ResponseWriter, r *http.Request) {
	u, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
		return
	}
	var patch ProfilePatch
	if err := decodeJSON(r, &patch); err != nil {
		writeError(w, http.StatusBadRequest, "bad_json", err.Error())
		return
	}

	// Apply the displayName update first so a downstream JSON-write
	// failure doesn't leave SQLite and the sidecar inconsistent (if
	// the write fails before we touch SQLite, neither has moved).
	if patch.DisplayName != nil {
		if err := h.Users.UpdateDisplayName(r.Context(), u.ID, *patch.DisplayName); err != nil {
			if errors.Is(err, ErrUserNotFound) {
				writeError(w, http.StatusNotFound, "not_found", "user not found")
				return
			}
			if strings.Contains(err.Error(), "empty") || strings.Contains(err.Error(), "too long") {
				writeError(w, http.StatusBadRequest, "display_name", err.Error())
				return
			}
			slog.Error("update display name failed", "userId", u.ID, "err", err)
			writeError(w, http.StatusInternalServerError, "internal", "update failed")
			return
		}
		// Refresh the in-memory User so the merged view reflects the
		// new name without an extra DB round-trip.
		fresh, err := h.Users.Get(r.Context(), u.ID)
		if err == nil {
			u = fresh
		}
	}

	current, err := h.Profiles.Read(u.ID)
	if err != nil {
		slog.Error("read profile failed", "userId", u.ID, "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "read failed")
		return
	}
	next := current.Apply(patch)
	if err := h.Profiles.Write(u.ID, next); err != nil {
		slog.Error("write profile failed", "userId", u.ID, "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "write failed")
		return
	}
	writeJSON(w, http.StatusOK, mergeProfileView(u, next))
}

// readUploadBody decodes either a multipart/form-data POST/PUT with
// a `file` field or a raw-body POST/PUT with X-File-Name. Same shape
// as the legacy /api/docs upload so the web client can reuse its
// existing FormData-vs-raw branching.
func readUploadBody(r *http.Request) ([]byte, string, error) {
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") {
		if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
			return nil, "", fmt.Errorf("multipart parse failed: %w", err)
		}
		file, header, ferr := r.FormFile("file")
		if ferr != nil {
			return nil, "", fmt.Errorf("missing `file` form field")
		}
		defer file.Close()
		contents, err := io.ReadAll(file)
		if err != nil {
			return nil, "", fmt.Errorf("read failed: %w", err)
		}
		return contents, header.Filename, nil
	}
	contents, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, "", fmt.Errorf("read failed: %w", err)
	}
	return contents, r.Header.Get("X-File-Name"), nil
}

// ---------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------

type credentialsReq struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName,omitempty"`
}

type errorResp struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ---------------------------------------------------------------
// Routes
// ---------------------------------------------------------------

// Signup creates a new user record and lands the caller already
// signed in (server-set cookie). 201 on success; 400 / 409 for
// validation + dup-email; 500 on a DB failure the operator should
// see in logs.
func (h *Handlers) Signup(w http.ResponseWriter, r *http.Request) {
	var req credentialsReq
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_json", err.Error())
		return
	}
	u, err := h.Users.Create(r.Context(), req.Email, req.Password, req.DisplayName)
	if err != nil {
		switch {
		case errors.Is(err, ErrEmailTaken):
			writeError(w, http.StatusConflict, "email_taken", err.Error())
		case errors.Is(err, ErrInvalidEmail):
			writeError(w, http.StatusBadRequest, "invalid_email", err.Error())
		case errors.Is(err, ErrWeakPassword):
			writeError(w, http.StatusBadRequest, "weak_password", err.Error())
		default:
			slog.Error("signup failed", "err", err)
			writeError(w, http.StatusInternalServerError, "internal", "signup failed")
		}
		return
	}
	h.setSessionCookie(w, u.ID)
	writeJSON(w, http.StatusCreated, u)
}

// Login verifies the password and lands the caller signed in. 200
// on success; 401 on bad credentials (unknown email + wrong
// password both return the same shape so the response can't be
// used to enumerate accounts).
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var req credentialsReq
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_json", err.Error())
		return
	}
	u, err := h.Users.Verify(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid_credentials", err.Error())
			return
		}
		slog.Error("login failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "login failed")
		return
	}
	h.setSessionCookie(w, u.ID)
	writeJSON(w, http.StatusOK, u)
}

// Logout clears the session cookie. 204 either way — there's nothing
// to fail at, and we don't want the response to confirm whether a
// cookie was present.
func (h *Handlers) Logout(w http.ResponseWriter, _ *http.Request) {
	h.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// Me returns the calling user's profile when the session cookie
// verifies; 401 otherwise. The web client uses this to decide
// whether to show the PersonalAuthGate at boot.
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	u, ok := h.userFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not_authenticated", "no session")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// RequireAuth wraps an http.Handler so it sees only authenticated
// requests. Resolves the session cookie → User and threads it onto
// the request context (read back via UserFromContext). Returns 401
// on missing / invalid / expired session.
//
// Wraps once at the mux level; downstream handlers don't need to
// know auth exists. Combined with WithUser for handlers that want
// the user without erroring out (e.g. landing-page heuristics).
func (h *Handlers) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := h.userFromRequest(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userCtxKey{}, u)))
	})
}

// ---------------------------------------------------------------
// Internals
// ---------------------------------------------------------------

// cookieName returns the cookie name with the __Host- prefix when
// running secure. Browsers reject __Host- cookies served over http,
// so the prefix is only safe on production HTTPS deploys.
func (h *Handlers) cookieName() string {
	if h.Secure {
		return "__Host-" + SessionCookieName
	}
	return SessionCookieName
}

// setSessionCookie writes a freshly-signed session cookie. Called
// from /signup and /login on success.
func (h *Handlers) setSessionCookie(w http.ResponseWriter, userID string) {
	token := h.Session.Sign(userID, SessionTTL)
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookieName(),
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.Secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(SessionTTL.Seconds()),
	})
}

// clearSessionCookie writes a zero-value cookie with MaxAge=-1 to
// trigger browser deletion. Used by /logout.
func (h *Handlers) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookieName(),
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   h.Secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// userFromRequest reads the session cookie, verifies the signature
// + expiry, and resolves the user record. ok=false on any failure;
// the caller decides whether that's a 401 or a continue-anonymous.
func (h *Handlers) userFromRequest(r *http.Request) (User, bool) {
	c, err := r.Cookie(h.cookieName())
	if err != nil {
		return User{}, false
	}
	userID, err := h.Session.Verify(c.Value)
	if err != nil {
		return User{}, false
	}
	u, err := h.Users.Get(r.Context(), userID)
	if err != nil {
		// Session verified but the user record is gone (admin
		// deleted, DB rolled back, etc). Treat as unauthenticated
		// rather than 500 — the client can re-signup or login.
		return User{}, false
	}
	return u, true
}

// decodeJSON enforces a small payload cap (1 MiB) so a malicious
// caller can't tie up the gateway with a giant body.
func decodeJSON(r *http.Request, dst any) error {
	const maxBytes = 1 << 20
	r.Body = http.MaxBytesReader(nil, r.Body, maxBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	return nil
}

// writeJSON serialises v as JSON with the right Content-Type.
// Failures here imply a misconfigured handler; log + 500.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("writeJSON failed", "err", err)
	}
}

// writeError writes a uniformly-shaped JSON error response so the
// web client can switch on the code field.
func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(errorResp{Code: code, Message: message}); err != nil {
		slog.Error("writeError failed", "err", err)
	}
}

// trimAndLower exists so tests can construct mock request bodies
// the same way the store normalises emails. Kept package-private
// because it's not part of the public API.
//
//nolint:unused // referenced from tests via runtime call sites
func trimAndLower(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
