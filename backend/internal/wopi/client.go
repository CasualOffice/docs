// Package wopi is the WOPI-host client interface.
//
// The full WOPI protocol is REST-shaped (CheckFileInfo, GetFile,
// PutFile, …) but the gateway only needs three operations:
//
//  1. CheckFileInfo  — once at connect, per-doc, to confirm the
//     authenticated user has access and capture metadata
//     (filename, version, owner).
//  2. GetFile        — once when a room is created, to seed the
//     in-memory Y.Doc from the stored .docx.
//  3. PutFile        — once when a room drains (last client
//     disconnect), to persist the snapshot.
//
// This file ships the *interface* and a placeholder error type.
// The mock-WOPI implementation (backend/test/mock-wopi) and the
// real-WOPI HTTP client both implement this interface so the
// room manager doesn't know which one it's talking to.
//
// See docs/05-backend-design.md §Why mock WOPI before real WOPI.
package wopi

import (
	"context"
	"errors"
)

// FileInfo is the trimmed-down WOPI CheckFileInfo response. The
// real protocol response has 60+ fields; we only consume the ones
// that drive routing or display.
type FileInfo struct {
	// FileName is the user-visible filename (e.g. "Q4 Report.docx").
	FileName string

	// Version is an opaque host-supplied version token. Useful for
	// optimistic-concurrency checks on PutFile but not used yet.
	Version string

	// UserCanWrite is the result of the host's permission check.
	// The gateway gates WS join on this — read-only viewers
	// connect but their MessageUpdate frames are dropped.
	UserCanWrite bool
}

// Client is the contract every WOPI implementation must satisfy.
// Both the mock and the real HTTP client implement it.
type Client interface {
	// CheckFileInfo returns metadata for the file. Called once at
	// room creation; result is cached on the Room.
	CheckFileInfo(ctx context.Context, docID, accessToken string) (*FileInfo, error)

	// GetFile fetches the raw .docx bytes for seeding the Y.Doc.
	// Called once at room creation, after CheckFileInfo.
	GetFile(ctx context.Context, docID, accessToken string) ([]byte, error)

	// PutFile persists the latest snapshot. Called once at room
	// drain (last-client disconnect). The host's response carries
	// a new Version that the gateway logs but does not retain
	// (we're stateless).
	PutFile(ctx context.Context, docID, accessToken string, contents []byte) error
}

// Sentinel errors. WOPI hosts also surface HTTP-status-coded
// errors (404 / 409 / 412 / 500 / …); the implementations wrap
// those into one of these or pass them through with `errors.As`
// against an HTTPError type the room manager can branch on.
var (
	// ErrNotFound — host returned 404 for the docId. Treat as
	// "doc no longer exists"; close the WS with a clear reason.
	ErrNotFound = errors.New("wopi: file not found")

	// ErrForbidden — host returned 401/403. Token expired or
	// permissions revoked.
	ErrForbidden = errors.New("wopi: forbidden")

	// ErrConflict — host returned 409 on PutFile (version
	// mismatch / lock). Snapshot worker should retry with a
	// fresh CheckFileInfo to refresh the version.
	ErrConflict = errors.New("wopi: conflict")
)
