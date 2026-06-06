package personal

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
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

// FileLister returns a per-user file summary list. The personal
// routes use this through PerUserFiles to keep the routes package
// from depending on host/local directly (avoids an import cycle if
// later batches let local depend on auth/personal).
type FileLister interface {
	ListFor(userID string) ([]FileSummary, error)
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
	// Files, when non-nil, mounts GET /files behind RequireAuth so
	// the calling user can enumerate their docs. Optional — a deploy
	// that uses personal auth purely for an external host (WOPI etc.)
	// can leave this nil and skip the route.
	Files FileLister
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
