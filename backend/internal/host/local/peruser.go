// Copyright (c) 2026 Casual Office. All rights reserved.

package local

import (
	"fmt"
	"path/filepath"
	"regexp"
	"sync"
)

// PerUserStores manages per-user local Stores. Each user gets their
// own subdirectory under <baseRoot>/users/<userID>, so user A never
// sees user B's docs even on a single shared bind-mount. Stores are
// cached on first use — the underlying *sync.Mutex lets multiple
// goroutines call For() concurrently without redundant FS work.
//
// Mirrors the design intent of sheet's per-user file scoping in
// apps/server/src/files/personal-files-routes.ts, adapted for the
// Go store API.
type PerUserStores struct {
	baseRoot string
	mu       sync.Mutex
	cache    map[string]*Store
}

// safeUserID gates the per-user path component the same way safeDocID
// gates the per-doc component. Defence-in-depth — auth/personal mints
// 22-char URL-safe tokens that already match, but the regex is the
// final boundary so a future code path that lets a user-controlled
// string reach here can't sneak in `..`.
var safeUserID = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

// NewPerUserStores returns a manager rooted at baseRoot. Users land
// at baseRoot/users/<userID>. The baseRoot itself is created if it
// doesn't exist; per-user dirs are created lazily on first For().
func NewPerUserStores(baseRoot string) (*PerUserStores, error) {
	abs, err := filepath.Abs(baseRoot)
	if err != nil {
		return nil, fmt.Errorf("local: resolve base root: %w", err)
	}
	return &PerUserStores{
		baseRoot: abs,
		cache:    make(map[string]*Store),
	}, nil
}

// For returns the Store scoped to userID. Subsequent calls with the
// same userID return the cached Store so the FS doesn't get
// hammered on every request. Concurrent calls with the same userID
// resolve to the same Store — the cache lookup + creation runs
// under the manager's mutex.
//
// Returns an error if userID fails the safe-path gate or the
// underlying Store can't be created (e.g. the FS rejects mkdir).
func (p *PerUserStores) For(userID string) (*Store, error) {
	if !safeUserID.MatchString(userID) {
		return nil, fmt.Errorf("local: unsafe userId %q", userID)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if s, ok := p.cache[userID]; ok {
		return s, nil
	}
	userRoot := filepath.Join(p.baseRoot, "users", userID)
	s, err := New(userRoot)
	if err != nil {
		return nil, fmt.Errorf("local: per-user store init: %w", err)
	}
	p.cache[userID] = s
	return s, nil
}

// BaseRoot returns the resolved absolute path of the base directory.
// Useful for logging at startup.
func (p *PerUserStores) BaseRoot() string { return p.baseRoot }
