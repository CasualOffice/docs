// Copyright (c) 2026 Casual Office. All rights reserved.

package personal

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// newProfileStore returns a FileProfileStore rooted at a temp dir
// matching the production layout (<root>/users/<userID>/.profile.json).
func newProfileStore(t *testing.T) (*FileProfileStore, string) {
	t.Helper()
	root := t.TempDir()
	return NewFileProfileStore(func(userID string) string {
		return filepath.Join(root, "users", userID, ".profile.json")
	}), root
}

// TestProfile_ReadMissingReturnsZero — a never-written profile is a
// zero-value Profile, not an error. Lets the handler treat
// "no file yet" as "use defaults" without a sentinel.
func TestProfile_ReadMissingReturnsZero(t *testing.T) {
	s, _ := newProfileStore(t)
	p, err := s.Read("user_a")
	if err != nil {
		t.Fatalf("Read missing: %v", err)
	}
	if !reflect.DeepEqual(p, Profile{}) {
		t.Errorf("Read missing = %+v, want zero value", p)
	}
}

// TestProfile_WriteThenRead — round-trip happy path.
func TestProfile_WriteThenRead(t *testing.T) {
	s, _ := newProfileStore(t)
	in := Profile{
		Timezone:  "America/Los_Angeles",
		Locale:    "en-US",
		AvatarURL: "https://example.com/me.png",
		Prefs:     map[string]any{"showRulers": true, "zoom": float64(125)},
	}
	if err := s.Write("user_a", in); err != nil {
		t.Fatalf("Write: %v", err)
	}
	got, err := s.Read("user_a")
	if err != nil {
		t.Fatal(err)
	}
	if got.Timezone != in.Timezone || got.Locale != in.Locale || got.AvatarURL != in.AvatarURL {
		t.Errorf("scalars = %+v, want %+v", got, in)
	}
	if !reflect.DeepEqual(got.Prefs, in.Prefs) {
		t.Errorf("Prefs = %v, want %v", got.Prefs, in.Prefs)
	}
}

// TestProfile_WriteAtomicMode — written files land at 0o600 so a
// shared bind-mount doesn't leak a user's prefs to a co-tenant by
// default. Best-effort sanity check, not a security boundary.
func TestProfile_WriteAtomicMode(t *testing.T) {
	s, root := newProfileStore(t)
	if err := s.Write("user_b", Profile{Locale: "de"}); err != nil {
		t.Fatal(err)
	}
	final := filepath.Join(root, "users", "user_b", ".profile.json")
	info, err := os.Stat(final)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("file perm = %o, want 0600", info.Mode().Perm())
	}
}

// TestProfile_ApplyMergesNonNilFields — fields whose pointer is set
// overwrite; nil pointers leave the existing value alone. Including
// empty-string overwrites (a clear operation).
func TestProfile_ApplyMergesNonNilFields(t *testing.T) {
	base := Profile{Timezone: "UTC", Locale: "en", AvatarURL: "old.png"}
	tz := "America/New_York"
	emptyAvatar := ""
	patched := base.Apply(ProfilePatch{
		Timezone:  &tz,
		AvatarURL: &emptyAvatar,
		// Locale pointer left nil — should remain "en".
	})
	if patched.Timezone != "America/New_York" {
		t.Errorf("Timezone = %q, want America/New_York", patched.Timezone)
	}
	if patched.Locale != "en" {
		t.Errorf("Locale = %q, want en (untouched)", patched.Locale)
	}
	if patched.AvatarURL != "" {
		t.Errorf("AvatarURL = %q, want \"\" (clear)", patched.AvatarURL)
	}
}

// TestProfile_ApplyReplacesPrefs — Prefs is treated as a single
// document, not a deep merge. Mirrors the behaviour the storage-modes
// doc implies for the free-form bag.
func TestProfile_ApplyReplacesPrefs(t *testing.T) {
	base := Profile{Prefs: map[string]any{"old": 1}}
	fresh := map[string]any{"new": 2}
	patched := base.Apply(ProfilePatch{Prefs: &fresh})
	if !reflect.DeepEqual(patched.Prefs, map[string]any{"new": 2}) {
		t.Errorf("Prefs = %v, want full replacement", patched.Prefs)
	}
}

