// Package wopi implements host.Integration as a WOPI client.
//
// In the WOPI architecture:
//
//   - the WOPI HOST is the file server (SharePoint, Nextcloud, your
//     custom storage) — it owns the bytes and serves them at
//     /wopi/files/{id}/contents
//   - the WOPI APP (this gateway) is the editor — it CALLS the host's
//     endpoints to fetch + save while the user is editing
//
// The handshake: the user clicks "Open in editor" on the host, which
// redirects their browser to GET /wopi/host?wopiSrc=<host's file URL,
// base64-encoded>&access_token=<JWT issued by the host>. The gateway
// (handler not in this file — D3) extracts both, validates the JWT
// via internal/auth/wopi, and lands the user inside the editor with
// the wopiSrc encoded as the docID and the access_token threaded
// through every subsequent host call.
//
// What this file implements: the outbound HTTP client that calls the
// host's CheckFileInfo + GetFile + PutFile. Stateless — every call
// uses the docID (= base64 wopiSrc) + the user's access_token.
//
// Out of scope for this file (deferred):
//
//   - WOPI Lock / Unlock / RefreshLock. The room manager grabs an
//     implicit lock at room create; supporting REFRESH_LOCK needs a
//     periodic ticker we haven't wired yet.
//   - WOPI proof keys (signed request headers from app → host). A
//     security hardening pass for production deploys; not required
//     for the protocol to work over HTTPS.
package wopi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/schnsrw/docx/backend/internal/host"
)

// DefaultHTTPTimeout is the per-request budget for outbound host
// calls. Generous enough for a slow host's PutFile, tight enough that
// a hung backend doesn't pin the gateway. Tests override via Options.
const DefaultHTTPTimeout = 30 * time.Second

// Client is the WOPI HTTP client. Implements host.Integration; the
// DocStore-only methods (Store, Rename, History) live on
// DocStoreAdapter below because WOPI hosts own file lifecycle —
// operators wire a different host backend (inline, local) for those
// flows.
type Client struct {
	httpClient *http.Client
	// userAgent is sent on every outbound request so the host's logs
	// can identify the editor. Defaults to "casual-editor-gateway/1.x"
	// but operators tuning multi-tenant deployments can override.
	userAgent string
}

// Options tunes the client. The zero value works.
type Options struct {
	// HTTPClient overrides the default 30s-timeout client. Useful for
	// tests (httptest server) or for operators who need custom TLS /
	// proxy settings.
	HTTPClient *http.Client
	// UserAgent is the User-Agent header value. Defaults to a fixed
	// string when empty.
	UserAgent string
}

// New returns a Client configured per opts.
func New(opts Options) *Client {
	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: DefaultHTTPTimeout}
	}
	ua := opts.UserAgent
	if ua == "" {
		ua = "casual-editor-gateway/1.x"
	}
	return &Client{httpClient: client, userAgent: ua}
}

// DocStoreAdapter wraps a Client so it satisfies the host.DocStore
// interface the gateway expects from selectStore. WOPI hosts own
// file creation + renames + history, so the embedded
// Store/Rename/History methods return "not supported in WOPI mode"
// rather than silently no-op'ing. The gateway's /api/docs upload
// route is effectively a no-go in Mode 2 — the user enters via the
// /wopi/host redirect instead, with the docID already encoded.
type DocStoreAdapter struct {
	*Client
}

// Store is a deliberate not-implemented for the WOPI adapter: WOPI
// users don't go through /api/docs (that's the v0 share-link path).
// Operators should mount Mode 2 deploys without that route exposed.
func (DocStoreAdapter) Store(string, []byte) (string, error) {
	return "", fmt.Errorf("wopi: file upload through /api/docs not supported (use /wopi/host redirect)")
}

// Rename is unsupported: WOPI 1.x has RenameFile but the editor's
// rename surface doesn't carry the X-WOPI-RequestedName header
// semantics yet. Future addition; for now operators surface the
// host's rename UI directly.
func (DocStoreAdapter) Rename(string, string) error {
	return fmt.Errorf("wopi: rename not supported in WOPI mode")
}

// History is unsupported: WOPI clients don't expose a standardised
// revision-history endpoint. Operators can surface the host's
// version-history surface directly.
func (DocStoreAdapter) History(string) ([]host.RevisionMeta, error) {
	return nil, fmt.Errorf("wopi: history not supported in WOPI mode")
}

// EncodeDocID returns the docID the gateway uses for a given WOPI
// source URL. Encoding is base64url so the result is safe in the
// gateway's /doc/{docId} path. The same encoding is consumed by the
// /wopi/host redirect handler (D3) when minting WS join URLs.
func EncodeDocID(wopiSrc string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(wopiSrc))
}

// DecodeDocID inverts EncodeDocID. Returns the original wopiSrc or
// host.ErrNotFound when the docID isn't valid base64 — same response
// shape the gateway uses for malformed docIDs in other backends.
func DecodeDocID(docID string) (string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(docID)
	if err != nil {
		return "", fmt.Errorf("%w: bad docID encoding", host.ErrNotFound)
	}
	s := string(raw)
	// Guard against the WOPI host URL turning into something we'd
	// hand to http.NewRequest as a path-traversal attempt: every
	// real wopiSrc is an absolute http(s):// URL.
	if !strings.HasPrefix(s, "http://") && !strings.HasPrefix(s, "https://") {
		return "", fmt.Errorf("%w: docID does not decode to http(s) URL", host.ErrNotFound)
	}
	return s, nil
}

// Fetch implements host.Integration. Calls the host's CheckFileInfo
// for metadata, then GetFile for the bytes. Two round-trips because
// the gateway uses the FileInfo to drive its FileName + Version
// surface; an optimisation would be to fold this into a single call
// per WOPI client guidance, but the cost is dominated by the GET
// bytes anyway.
func (s *Client) Fetch(ctx context.Context, docID, authToken string) ([]byte, *host.FileInfo, error) {
	wopiSrc, err := DecodeDocID(docID)
	if err != nil {
		return nil, nil, err
	}
	info, err := s.checkFileInfo(ctx, wopiSrc, authToken)
	if err != nil {
		return nil, nil, err
	}
	contents, err := s.getFile(ctx, wopiSrc, authToken)
	if err != nil {
		return nil, nil, err
	}
	return contents, info, nil
}

// Snapshot implements host.Integration. Calls PutFile to overwrite
// the host's stored bytes. WOPI conventions: POST to
// <wopiSrc>/contents with X-WOPI-Override: PUT.
//
// On 409 Conflict (lock mismatch) we surface host.ErrConflict so the
// room manager can decide whether to retry; on 401 / 403 we surface
// host.ErrForbidden so the gateway closes the WS for re-auth.
func (s *Client) Snapshot(ctx context.Context, docID, authToken string, contents []byte) error {
	wopiSrc, err := DecodeDocID(docID)
	if err != nil {
		return err
	}
	if len(contents) == 0 {
		return errors.New("wopi: empty snapshot rejected")
	}
	endpoint, err := withAccessToken(wopiSrc+"/contents", authToken)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(contents))
	if err != nil {
		return fmt.Errorf("wopi: build put request: %w", err)
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("X-WOPI-Override", "PUT")
	req.Header.Set("User-Agent", s.userAgent)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("wopi: put request failed: %w", err)
	}
	defer resp.Body.Close()
	if err := mapHTTPStatus(resp.StatusCode); err != nil {
		return err
	}
	return nil
}

// Lock implements host.Locker. Sends POST <wopiSrc>?access_token=…
// with X-WOPI-Override: LOCK and X-WOPI-Lock: <lockID>. A 200
// response means the lock is now ours; 409 means a different
// editor already holds the file and surfaces as host.ErrConflict.
func (s *Client) Lock(ctx context.Context, docID, lockID, authToken string) error {
	return s.lockOp(ctx, docID, lockID, authToken, "LOCK")
}

// Unlock releases a lock claimed via Lock. The same lockID must be
// supplied — the host rejects 409 if it doesn't match what was
// recorded at lock time.
func (s *Client) Unlock(ctx context.Context, docID, lockID, authToken string) error {
	return s.lockOp(ctx, docID, lockID, authToken, "UNLOCK")
}

// RefreshLock extends the host-side lock TTL. WOPI hosts typically
// time out a lock after 30 min of inactivity; the room manager
// fires this on a slower-than-that cadence to keep the lock alive
// for the duration of an active editing session.
func (s *Client) RefreshLock(ctx context.Context, docID, lockID, authToken string) error {
	return s.lockOp(ctx, docID, lockID, authToken, "REFRESH_LOCK")
}

// lockOp is the shared implementation of Lock / Unlock /
// RefreshLock. The only thing that varies is the X-WOPI-Override
// header value.
func (s *Client) lockOp(ctx context.Context, docID, lockID, authToken, op string) error {
	wopiSrc, err := DecodeDocID(docID)
	if err != nil {
		return err
	}
	if lockID == "" {
		return fmt.Errorf("wopi: lockID required for %s", op)
	}
	endpoint, err := withAccessToken(wopiSrc, authToken)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, nil)
	if err != nil {
		return fmt.Errorf("wopi: build %s request: %w", op, err)
	}
	req.Header.Set("X-WOPI-Override", op)
	req.Header.Set("X-WOPI-Lock", lockID)
	req.Header.Set("User-Agent", s.userAgent)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("wopi: %s request failed: %w", op, err)
	}
	defer resp.Body.Close()
	// WOPI hosts use 409 + X-WOPI-Lock header to indicate a lock
	// mismatch — the room manager treats that as ErrConflict so the
	// gateway can refuse the WS join (or skip the unlock if the
	// host already considers the lock released).
	return mapHTTPStatus(resp.StatusCode)
}

// checkFileInfo issues GET <wopiSrc>?access_token=... and decodes
// the JSON response into a host.FileInfo. The full CheckFileInfo
// shape is large (~30 fields, per WOPI's spec); we read only what
// the gateway exposes.
func (s *Client) checkFileInfo(ctx context.Context, wopiSrc, authToken string) (*host.FileInfo, error) {
	endpoint, err := withAccessToken(wopiSrc, authToken)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("wopi: build check request: %w", err)
	}
	req.Header.Set("User-Agent", s.userAgent)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("wopi: check request failed: %w", err)
	}
	defer resp.Body.Close()
	if err := mapHTTPStatus(resp.StatusCode); err != nil {
		return nil, err
	}
	var raw struct {
		BaseFileName string `json:"BaseFileName"`
		Version      string `json:"Version"`
		UserCanWrite bool   `json:"UserCanWrite"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("wopi: decode check response: %w", err)
	}
	return &host.FileInfo{
		FileName:     raw.BaseFileName,
		Version:      raw.Version,
		UserCanWrite: raw.UserCanWrite,
	}, nil
}

// getFile issues GET <wopiSrc>/contents?access_token=... and returns
// the body bytes. The host's response has no per-file metadata in
// the body — that's what CheckFileInfo is for.
func (s *Client) getFile(ctx context.Context, wopiSrc, authToken string) ([]byte, error) {
	endpoint, err := withAccessToken(wopiSrc+"/contents", authToken)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("wopi: build get request: %w", err)
	}
	req.Header.Set("User-Agent", s.userAgent)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("wopi: get request failed: %w", err)
	}
	defer resp.Body.Close()
	if err := mapHTTPStatus(resp.StatusCode); err != nil {
		return nil, err
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("wopi: read get body: %w", err)
	}
	return body, nil
}

// withAccessToken appends `access_token=<token>` to the URL as a
// query parameter, preserving any existing query. WOPI clients pass
// the token in the query rather than a header so a host with cached
// URL-routing logic sees consistent inputs per request.
func withAccessToken(rawURL, token string) (string, error) {
	if token == "" {
		return "", fmt.Errorf("wopi: empty access_token")
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("wopi: parse url %q: %w", rawURL, err)
	}
	q := parsed.Query()
	q.Set("access_token", token)
	parsed.RawQuery = q.Encode()
	return parsed.String(), nil
}

// mapHTTPStatus translates WOPI host responses into the host
// package's sentinels. The mapping mirrors the WOPI client spec:
//
//	200 / 201 — success
//	401 / 403 — host.ErrForbidden (re-auth)
//	404       — host.ErrNotFound
//	409 / 412 — host.ErrConflict (lock / version mismatch)
//	others    — generic error with status code for log diagnosis
func mapHTTPStatus(code int) error {
	switch {
	case code >= 200 && code < 300:
		return nil
	case code == http.StatusUnauthorized, code == http.StatusForbidden:
		return host.ErrForbidden
	case code == http.StatusNotFound:
		return host.ErrNotFound
	case code == http.StatusConflict, code == http.StatusPreconditionFailed:
		return host.ErrConflict
	default:
		return fmt.Errorf("wopi: unexpected host status %d", code)
	}
}
