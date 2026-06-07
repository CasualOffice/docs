package personal

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Profile is the editable extended profile for a user, stored as a
// JSON sidecar at <root>/users/<userID>/.profile.json. Distinct from
// User (which lives in SQLite and carries the identity surface —
// email, displayName, createdAt). The split is deliberate:
//
//   - User is the source of truth for identity. Changes to
//     displayName go through UserStore.UpdateDisplayName so /auth/me
//     and the SQLite row never disagree.
//   - Profile holds the "preferences" surface — timezone, locale,
//     avatar URL, free-form prefs. Operators can edit the JSON file
//     directly on disk for support / migration without touching the DB.
//
// Empty fields mean "unset" — the web client falls back to its
// defaults. The JSON file is created lazily on the first PUT.
type Profile struct {
	// Timezone is an IANA tz string ("America/Los_Angeles"). Empty
	// means "browser default". The editor's autosave timestamps and
	// version-history "edited Tue 3:14pm" formatting consult this.
	Timezone string `json:"timezone,omitempty"`
	// Locale is a BCP-47 language tag ("en-US", "de"). Empty means
	// "match the browser". Drives the i18n LocaleProvider.
	Locale string `json:"locale,omitempty"`
	// AvatarURL is a fully-qualified URL the editor renders next to
	// the user's name. Empty means "use the first letter of the
	// display name as a colored chip" (the existing fallback).
	AvatarURL string `json:"avatarUrl,omitempty"`
	// Prefs is a free-form bag for client-managed settings the server
	// doesn't need to interpret (e.g. "showRulers": true, "zoomDefault":
	// 100). The server preserves shape on write and never inspects
	// values, so the web client can evolve the schema without a
	// gateway change.
	Prefs map[string]any `json:"prefs,omitempty"`
}

// ProfilePatch is the request body shape for PUT /auth/profile. Each
// field is a pointer so the handler can distinguish "field not in
// patch" from "field set to empty". DisplayName piggybacks the same
// endpoint — the handler routes it to UserStore.UpdateDisplayName
// rather than the JSON sidecar so identity stays authoritative.
type ProfilePatch struct {
	DisplayName *string         `json:"displayName,omitempty"`
	Timezone    *string         `json:"timezone,omitempty"`
	Locale      *string         `json:"locale,omitempty"`
	AvatarURL   *string         `json:"avatarUrl,omitempty"`
	Prefs       *map[string]any `json:"prefs,omitempty"`
}

// ProfileStore is the side-car JSON reader / writer used by the
// /auth/profile routes. Defined as an interface so cmd/gateway can
// wire a thin adapter (the actual file lives under a per-user
// directory the personal package doesn't model) without dragging
// host/local into this file.
type ProfileStore interface {
	// Read returns the user's profile, or a zero-value Profile when
	// no file has been written yet. Never returns os.ErrNotExist —
	// "not written yet" is a valid state.
	Read(userID string) (Profile, error)
	// Write atomically replaces the profile file with p. The
	// adapter should mkdir -p the per-user directory if needed.
	Write(userID string, p Profile) error
}

// FileProfileStore is the standalone file-backed ProfileStore. Used
// by tests; production wires through the cmd/gateway adapter so
// per-user directory creation goes through PerUserStores.
type FileProfileStore struct {
	// path returns the absolute path of the user's .profile.json
	// file. Injected so the adapter can layer it under a per-user
	// root (`<authRoot>/users/<userID>/.profile.json`) without this
	// store needing to know about that layout.
	path func(userID string) string
}

// NewFileProfileStore returns a store that resolves the profile path
// via the supplied closure. The closure is responsible for any
// userID validation it cares about — this store assumes the caller
// already gated on a safe userID.
func NewFileProfileStore(path func(userID string) string) *FileProfileStore {
	return &FileProfileStore{path: path}
}

// Read returns the profile or a zero-value Profile when the file is
// absent. A malformed file returns the parse error rather than
// papering over corruption.
func (s *FileProfileStore) Read(userID string) (Profile, error) {
	raw, err := os.ReadFile(s.path(userID))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Profile{}, nil
		}
		return Profile{}, fmt.Errorf("personal: read profile %q: %w", userID, err)
	}
	var p Profile
	if err := json.Unmarshal(raw, &p); err != nil {
		return Profile{}, fmt.Errorf("personal: parse profile %q: %w", userID, err)
	}
	return p, nil
}

// Write atomically replaces the profile file. The parent directory
// must already exist — the cmd/gateway adapter ensures the per-user
// path is provisioned (it always is, because Batch 3 mkdirs
// `users/<userID>` on the first FileStore call).
func (s *FileProfileStore) Write(userID string, p Profile) error {
	raw, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return fmt.Errorf("personal: marshal profile %q: %w", userID, err)
	}
	final := s.path(userID)
	if err := os.MkdirAll(filepath.Dir(final), 0o755); err != nil {
		return fmt.Errorf("personal: mkdir profile dir for %q: %w", userID, err)
	}
	tmp := final + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return fmt.Errorf("personal: write profile tmp %q: %w", userID, err)
	}
	if err := os.Rename(tmp, final); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("personal: rename profile %q: %w", userID, err)
	}
	return nil
}

// Apply merges a ProfilePatch into a Profile, returning the next
// state. Fields whose pointer is nil are left unchanged; non-nil
// pointers overwrite (including the empty string, which clears).
// Pure function — no side effects — so the handler can call this
// before deciding whether to persist.
func (p Profile) Apply(patch ProfilePatch) Profile {
	next := p
	if patch.Timezone != nil {
		next.Timezone = *patch.Timezone
	}
	if patch.Locale != nil {
		next.Locale = *patch.Locale
	}
	if patch.AvatarURL != nil {
		next.AvatarURL = *patch.AvatarURL
	}
	if patch.Prefs != nil {
		next.Prefs = *patch.Prefs
	}
	return next
}
