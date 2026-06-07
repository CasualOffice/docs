// Package host defines the integration interface every document
// source must satisfy. The gateway calls Fetch on room creation
// to seed the in-memory Y.Doc; calls Snapshot on room drain
// (last-client disconnect) to persist the latest state.
//
// Three implementations are planned (see docs/05-backend-design.md):
//
//  1. inline  — in-process map. The v0 share-link flow: a user
//     uploads `.docx` to the gateway, gets a docId + share URL,
//     others join, anyone downloads. No external host. This
//     package's `inline` subpackage.
//  2. wopi    — full WOPI HTTP client (Nextcloud, SharePoint, …).
//     Future v1.
//  3. jwtapi  — leaner "WOPI-like but simpler" REST client: GET
//     <fetchURL> + POST <callbackURL> with `Authorization: Bearer
//     <jwt>`. Future v1+.
//
// The room manager never cases on host type — it calls the
// interface. Concrete impl is selected once at startup via env
// var / config and stays put for the gateway's lifetime.
package host

import (
	"context"
	"errors"
	"time"
)

// RevisionMeta is one entry in a doc's save history. Lives in the
// shared host package so every concrete implementation (inline,
// local, future wopi / s3 / postgres) emits the same wire shape,
// and the gateway's history handler can serialize it without per-
// impl branching.
type RevisionMeta struct {
	// Version is the monotonic save counter at the time this
	// revision was recorded.
	Version uint64 `json:"version"`
	// SavedAt is when this revision was recorded (doc creation for
	// version 1, Snapshot time thereafter).
	SavedAt time.Time `json:"savedAt"`
	// SizeBytes is the .docx byte length at this revision.
	SizeBytes int `json:"sizeBytes"`
	// Author is the display name of whoever triggered the save,
	// when known. Anonymous hosts (inline, local) leave this
	// empty; an authenticated host populates it. JSON-omitted
	// when empty so clients can render a generic "Saved" label.
	Author string `json:"author,omitempty"`
}

// DocStore is the superset of host.Integration that the gateway
// uses directly: upload + persistence + history + rename. Every
// concrete store (inline, local, future remote backends) implements
// this so cmd/gateway/main.go can pick one at startup from an env
// var and pass it through to every handler without type-switching.
type DocStore interface {
	Integration

	// Store ingests freshly-uploaded bytes and returns a new docId.
	Store(fileName string, contents []byte) (string, error)

	// Rename updates the user-visible filename for an existing doc.
	Rename(docID, newName string) error

	// History returns the revision-metadata log oldest-first.
	History(docID string) ([]RevisionMeta, error)
}

// FileInfo carries the metadata the gateway needs about a doc
// beyond its raw bytes. Hosts that don't expose all fields can
// leave them zero — only the ones with explicit semantics
// downstream matter.
type FileInfo struct {
	// FileName is the user-visible filename. Used in the
	// downloaded-snapshot `Content-Disposition` header so the
	// browser suggests the right filename on save.
	FileName string

	// Version is an opaque host-supplied version token (WOPI
	// `Version`, etag, hash, etc.). Useful for optimistic-
	// concurrency checks on Snapshot but not gated on yet.
	Version string

	// UserCanWrite is the host's permission check result.
	// `false` → the WS join still succeeds but Update frames
	// from this client are dropped (view-only). M2 wires this
	// into the auth layer; M1 inline always returns true.
	UserCanWrite bool
}

// Integration is the contract every host backend satisfies.
// authToken semantics are per-impl: inline ignores it, wopi uses
// it as the WOPI access_token query param, jwtapi uses it as a
// bearer header. The gateway forwards whatever it received on
// the WS connect URL.
type Integration interface {
	// Fetch returns the current bytes for docID plus a FileInfo
	// describing how to display + gate access. Called once at
	// room creation. Surfaces ErrNotFound when the docId doesn't
	// exist; that's a clean close on the WS side (close code
	// 4404) rather than an error log.
	Fetch(ctx context.Context, docID, authToken string) ([]byte, *FileInfo, error)

	// Snapshot persists the latest .docx bytes. Called once on
	// room drain. The host's response carries a new Version that
	// the caller logs but does not retain (we're stateless).
	Snapshot(ctx context.Context, docID, authToken string, contents []byte) error
}

// Locker is the optional capability hosts implement when they need
// the editor to claim a lock for the duration of an active room.
// WOPI hosts use this so a second editor (Word Online, for instance)
// can't open the same file concurrently and clobber the saves.
//
// The contract: the room manager calls Lock once on first client
// join (with a freshly-minted lockID it remembers for the room's
// lifetime), Unlock once on last client leave, and RefreshLock
// periodically while the room is alive (the period is the room
// manager's choice; WOPI hosts typically expect a refresh every
// ~5-10 min). The same lockID is used for every call within a
// room's lifetime.
//
// Hosts that don't have lock semantics (inline, local) simply don't
// implement this interface; the room manager checks via type
// assertion and skips the calls when the capability isn't there.
//
// Returning host.ErrConflict from Lock means the file is already
// locked by a different client (Word Online has it open, etc.);
// the room manager treats that as "refuse to open this room" and
// surfaces a 409 to the WS join.
type Locker interface {
	// Lock claims the file for this editor. lockID is opaque to the
	// host — it just round-trips through. authToken is the WOPI
	// access_token of the user opening the file; the host
	// authenticates the lock claim against it.
	Lock(ctx context.Context, docID, lockID, authToken string) error

	// Unlock releases a previously-acquired lock. lockID must match
	// what was passed to Lock. Idempotent: if the lock has already
	// expired host-side, the host typically returns 200 (or 409 with
	// X-WOPI-Lock=""); either is fine here.
	Unlock(ctx context.Context, docID, lockID, authToken string) error

	// RefreshLock extends the lifetime of an existing lock by the
	// host's TTL (typically 30 min for WOPI hosts). Called by a
	// periodic ticker in the room manager.
	RefreshLock(ctx context.Context, docID, lockID, authToken string) error
}

// Sentinel errors. Implementations either return these directly
// or wrap an HTTP-status-coded error that callers can match via
// errors.Is.
var (
	// ErrNotFound — the docId is unknown to the host. Gateway
	// closes the WS with code 4404 ("doc not found"); client
	// should not retry.
	ErrNotFound = errors.New("host: doc not found")

	// ErrForbidden — auth token rejected or permissions
	// revoked. WS close code 4401; client must re-auth and
	// reconnect.
	ErrForbidden = errors.New("host: forbidden")

	// ErrConflict — Snapshot rejected due to version mismatch
	// or external lock. The snapshot worker may retry after a
	// fresh CheckFileInfo / re-fetch.
	ErrConflict = errors.New("host: conflict")
)
