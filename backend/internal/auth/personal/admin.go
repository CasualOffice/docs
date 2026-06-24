package personal

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
)

// adminCtxKey threads "this request came from an admin" into the
// downstream handler context. Distinct from the userCtxKey used by
// RequireAuth so handlers don't have to re-look-up IsAdmin.
//
// IsAdminFromContext returns the flag set by RequireAdmin; ok=false
// when the middleware wasn't in the chain.
type adminCtxKey struct{}

// IsAdminFromContext reports whether the request was let through by
// RequireAdmin. Useful for handlers that want to expose more detail
// to admins without forking the entire response shape.
func IsAdminFromContext(ctx context.Context) bool {
	v, _ := ctx.Value(adminCtxKey{}).(bool)
	return v
}

// RequireAdmin wraps RequireAuth so the inner handler runs only when
// the resolved User has IsAdmin set. Non-admins see 403 (not 401 —
// the auth was fine, the authorisation wasn't); anonymous users see
// the 401 RequireAuth would have surfaced. Two-tier gating matches
// the convention HTTP clients expect.
//
// Mounted alongside RequireAuth on /admin/* routes; downstream
// handlers can rely on UserFromContext returning a User with IsAdmin
// = true without re-checking.
func (h *Handlers) RequireAdmin(next http.Handler) http.Handler {
	return h.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := UserFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
			return
		}
		if !u.IsAdmin {
			writeError(w, http.StatusForbidden, "forbidden", "admin required")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), adminCtxKey{}, true)))
	}))
}

// adminListUsers returns every user, oldest first. Operator triage —
// "who can log in to this deploy". The response shape is the public
// User struct so the bcrypt hash never leaves the server.
func (h *Handlers) adminListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.Users.List(r.Context())
	if err != nil {
		slog.Error("admin list users failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "list failed")
		return
	}
	if users == nil {
		users = []User{}
	}
	writeJSON(w, http.StatusOK, users)
}

// adminDeleteUser removes a user record. Returns 204 on success.
// The route handler does NOT remove the user's per-user file
// directory on disk — that's the cmd/gateway adapter's job (it
// knows about the FS layout, the personal package doesn't). 404 for
// an unknown id; 409 if the admin tries to delete themselves (we
// keep at least one admin around to avoid an unrecoverable state).
func (h *Handlers) adminDeleteUser(w http.ResponseWriter, r *http.Request) {
	caller, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not_authenticated", "session required")
		return
	}
	id := r.PathValue("id")
	if id == caller.ID {
		writeError(w, http.StatusConflict, "self_delete", "admins cannot delete themselves")
		return
	}
	// Guard against deleting the last admin — a deploy with no admin
	// would lose its escape hatch. Cheap to check here at request
	// time; the alternative (force a CLI promote afterwards) is
	// recoverable but worse UX.
	if h.UserDeleter != nil {
		if err := h.UserDeleter.DeleteUserData(id); err != nil {
			slog.Warn("admin delete user data failed", "userId", id, "err", err)
		}
	}
	if err := h.Users.Delete(r.Context(), id); err != nil {
		if errors.Is(err, ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "no such user")
			return
		}
		slog.Error("admin delete user failed", "userId", id, "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "delete failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UserDeleter is the optional disk-sweep companion to admin user
// deletion. Implemented in cmd/gateway as a thin adapter over
// PerUserStores so the personal package stays FS-agnostic. Nil-
// safe: handler skips the sweep when unset.
type UserDeleter interface {
	// DeleteUserData removes the user's per-user directory + files.
	// Idempotent — already-absent is nil. Errors are logged at the
	// route layer but don't fail the DELETE: a leftover .docx blob
	// is recoverable; refusing to delete a user record because the
	// FS sweep partial-failed isn't.
	DeleteUserData(userID string) error
}
