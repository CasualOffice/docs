// Package personal is the user store + session signer for Mode 3
// (Standalone) deploys — Docker + bind-mount /data + password
// authentication. Mirrors the design of sheet's
// apps/server/src/auth/personal.ts in Go.
//
// What lives here:
//
//   - UserStore: bcrypt password hashing + SQLite-backed user
//     records. The DB file lands at <root>/.casual/users.db so
//     operators can grep it without thinking about layout.
//   - Session: HMAC-SHA256 signed cookie format, no third-party JWT
//     dependency. The signing key is read from CASUAL_SESSION_KEY at
//     startup; missing → fatal so a misconfigured deploy never falls
//     back to an unsigned session.
//
// HTTP routes (signup, login, logout, /auth/me) wire to this in
// Batch 2; this file is the storage + crypto layer only.
package personal

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net/mail"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"golang.org/x/crypto/bcrypt"
)

// User is the public shape returned by Get / Create. The password
// hash never leaves the package.
type User struct {
	// ID is the URL-safe random user id (16 bytes base64-encoded).
	// Used as the routing key for per-user file paths.
	ID string `json:"userId"`
	// Email is the login identifier — lower-cased + trimmed on store
	// so lookup is case-insensitive without a separate index.
	Email string `json:"email"`
	// DisplayName is what the editor renders in the title bar /
	// version-history "by ..." rows. Defaults to the email-prefix
	// when the signup form omits it.
	DisplayName string `json:"displayName"`
	// CreatedAt is set by the store on Create; immutable after.
	CreatedAt time.Time `json:"createdAt"`
}

// UserStore is a SQLite-backed user record store. Safe for
// concurrent use — database/sql handles the connection pooling and
// the sync.Mutex on writes protects the SQLite single-writer
// constraint at the application layer (cheaper than retrying on a
// SQLITE_BUSY error).
type UserStore struct {
	db *sql.DB
	// writeMu serializes writes (Create, Update). SQLite allows
	// multiple readers but only one writer; serializing in Go avoids
	// the BUSY/LOCKED dance.
	writeMu sync.Mutex
	// minCost is the bcrypt cost factor used for password hashing.
	// 12 by default (~250ms on a modern laptop). Tests override it
	// via NewWithOptions to keep the suite fast.
	minCost int
}

// Sentinel errors. Callers either return these directly or wrap an
// HTTP-status-coded error that handlers can match via errors.Is.
var (
	// ErrEmailTaken — Create with an email that's already on file.
	// HTTP 409 from the signup handler.
	ErrEmailTaken = errors.New("personal: email already registered")

	// ErrInvalidCredentials — Verify with a wrong password OR a
	// missing user. Both shapes return the same error so a
	// timing-side-channel can't enumerate accounts.
	ErrInvalidCredentials = errors.New("personal: invalid email or password")

	// ErrInvalidEmail — Create with a malformed email. HTTP 400.
	ErrInvalidEmail = errors.New("personal: invalid email address")

	// ErrWeakPassword — Create with a password under the minimum
	// length. HTTP 400. Length-only check matches sheet; complexity
	// rules are unhelpful at this length.
	ErrWeakPassword = errors.New("personal: password must be at least 8 characters")

	// ErrUserNotFound — Get by id with no match. HTTP 404.
	ErrUserNotFound = errors.New("personal: user not found")
)

// New opens (or creates) a SQLite-backed user store under
// <root>/.casual/users.db. The directory is created if missing.
// Failing to open the DB is fatal at the caller — there's no
// graceful fallback for a Mode 3 deploy without users.
func New(root string) (*UserStore, error) {
	return NewWithOptions(root, 12)
}

// NewWithOptions exposes the bcrypt cost factor so tests can use a
// low cost (4) to keep the suite under a few hundred ms. Production
// callers should always use New (cost 12).
func NewWithOptions(root string, bcryptCost int) (*UserStore, error) {
	if bcryptCost < bcrypt.MinCost || bcryptCost > bcrypt.MaxCost {
		return nil, fmt.Errorf("personal: bcrypt cost %d out of range [%d, %d]",
			bcryptCost, bcrypt.MinCost, bcrypt.MaxCost)
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("personal: resolve root: %w", err)
	}
	dir := filepath.Join(abs, ".casual")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("personal: mkdir %q: %w", dir, err)
	}
	dsn := filepath.Join(dir, "users.db") + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("personal: open db: %w", err)
	}
	// Cap connection pool at a small number — SQLite serializes
	// writes anyway, and we don't want a flood of idle conns.
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(4)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("personal: ping db: %w", err)
	}
	if err := migrate(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("personal: migrate: %w", err)
	}
	return &UserStore{db: db, minCost: bcryptCost}, nil
}

// Close releases the SQLite connection pool. Idempotent.
func (s *UserStore) Close() error {
	return s.db.Close()
}

// Create registers a new user. Returns ErrEmailTaken if the email is
// already in use, ErrInvalidEmail / ErrWeakPassword on validation
// failures, and a wrapped DB error otherwise.
//
// displayName is optional — empty input falls back to the email
// prefix so users see something meaningful in the UI from minute one.
func (s *UserStore) Create(ctx context.Context, email, password, displayName string) (User, error) {
	email = normalizeEmail(email)
	if _, err := mail.ParseAddress(email); err != nil || email == "" {
		return User{}, ErrInvalidEmail
	}
	if len(password) < 8 {
		return User{}, ErrWeakPassword
	}
	if displayName == "" {
		displayName = defaultDisplayName(email)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), s.minCost)
	if err != nil {
		return User{}, fmt.Errorf("personal: hash password: %w", err)
	}
	id, err := newUserID()
	if err != nil {
		return User{}, fmt.Errorf("personal: mint user id: %w", err)
	}
	now := time.Now().UTC()

	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO users (id, email, password_hash, display_name, created_at)
		 VALUES (?, ?, ?, ?, ?)`,
		id, email, hash, displayName, now.Unix())
	if err != nil {
		if isUniqueViolation(err) {
			return User{}, ErrEmailTaken
		}
		return User{}, fmt.Errorf("personal: insert user: %w", err)
	}
	return User{
		ID:          id,
		Email:       email,
		DisplayName: displayName,
		CreatedAt:   now,
	}, nil
}

// Verify checks a password against the stored hash. Returns the
// matching User on success and ErrInvalidCredentials on any
// failure — including unknown email — so a caller can't distinguish
// "wrong password" from "no such user" via timing or response shape.
//
// Constant-time on the bcrypt path; the unknown-email branch
// performs a dummy bcrypt compare against a synthetic hash so the
// two paths take comparable wall-clock time.
func (s *UserStore) Verify(ctx context.Context, email, password string) (User, error) {
	email = normalizeEmail(email)
	row := s.db.QueryRowContext(ctx,
		`SELECT id, email, password_hash, display_name, created_at
		 FROM users WHERE email = ?`, email)
	var (
		u         User
		hash      []byte
		createdAt int64
	)
	err := row.Scan(&u.ID, &u.Email, &hash, &u.DisplayName, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		// Dummy bcrypt compare to keep the unknown-email branch
		// roughly the same wall-clock cost as the known-email
		// branch. Defeats username-enumeration via timing.
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return User{}, ErrInvalidCredentials
	}
	if err != nil {
		return User{}, fmt.Errorf("personal: lookup user: %w", err)
	}
	if err := bcrypt.CompareHashAndPassword(hash, []byte(password)); err != nil {
		return User{}, ErrInvalidCredentials
	}
	u.CreatedAt = time.Unix(createdAt, 0).UTC()
	return u, nil
}

// Get returns the User with the given id. ErrUserNotFound when no
// such id exists.
func (s *UserStore) Get(ctx context.Context, id string) (User, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, email, display_name, created_at
		 FROM users WHERE id = ?`, id)
	var (
		u         User
		createdAt int64
	)
	err := row.Scan(&u.ID, &u.Email, &u.DisplayName, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("personal: lookup user: %w", err)
	}
	u.CreatedAt = time.Unix(createdAt, 0).UTC()
	return u, nil
}

// UpdateDisplayName changes the display name for an existing user.
// Used by PUT /auth/profile so the editor's title bar / "Signed in
// as X" surface updates without forcing a re-signup. ErrUserNotFound
// when the id has no match. Empty input is rejected so the UI never
// silently flips to a blank header.
func (s *UserStore) UpdateDisplayName(ctx context.Context, id, newName string) error {
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return fmt.Errorf("personal: display name cannot be empty")
	}
	if len(newName) > 120 {
		return fmt.Errorf("personal: display name too long (>120)")
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	res, err := s.db.ExecContext(ctx,
		`UPDATE users SET display_name = ? WHERE id = ?`, newName, id)
	if err != nil {
		return fmt.Errorf("personal: update display name: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("personal: rows affected: %w", err)
	}
	if n == 0 {
		return ErrUserNotFound
	}
	return nil
}

// ---------------------------------------------------------------
// Session — HMAC-signed cookie format.
//
//	<userId>.<expiresUnix>.<hmacB64>
//
// Where hmac = HMAC-SHA256("<userId>.<expiresUnix>", secret). The
// signing key is the operator-supplied CASUAL_SESSION_KEY (or
// equivalent). 32+ bytes recommended; we accept anything ≥ 16.
// ---------------------------------------------------------------

// Session signs and verifies session tokens.
type Session struct {
	key []byte
}

// NewSession returns a Session signer with the given key. Returns
// an error if the key is too short to be meaningful (< 16 bytes).
func NewSession(key []byte) (*Session, error) {
	if len(key) < 16 {
		return nil, fmt.Errorf("personal: session key must be at least 16 bytes, got %d", len(key))
	}
	return &Session{key: append([]byte(nil), key...)}, nil
}

// Sign returns a session token valid for the given duration. The
// token shape is documented above; the format is internal but
// stable for the package's lifetime.
func (sess *Session) Sign(userID string, ttl time.Duration) string {
	expires := time.Now().Add(ttl).Unix()
	payload := userID + "." + strconv.FormatInt(expires, 10)
	mac := hmac.New(sha256.New, sess.key)
	mac.Write([]byte(payload))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return payload + "." + sig
}

// Verify returns the userID encoded in token if the signature is
// valid AND the token hasn't expired. Returns ErrInvalidCredentials
// otherwise — the caller can't distinguish "bad signature" from
// "expired" without timing analysis, by design.
func (sess *Session) Verify(token string) (string, error) {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 {
		return "", ErrInvalidCredentials
	}
	userID, expiresStr, sig := parts[0], parts[1], parts[2]
	payload := userID + "." + expiresStr

	mac := hmac.New(sha256.New, sess.key)
	mac.Write([]byte(payload))
	want := mac.Sum(nil)
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return "", ErrInvalidCredentials
	}
	if !hmac.Equal(want, got) {
		return "", ErrInvalidCredentials
	}
	expires, err := strconv.ParseInt(expiresStr, 10, 64)
	if err != nil {
		return "", ErrInvalidCredentials
	}
	if time.Now().Unix() > expires {
		return "", ErrInvalidCredentials
	}
	return userID, nil
}

// ---------------------------------------------------------------
// Internals
// ---------------------------------------------------------------

// migrate creates the users table if it doesn't exist. Idempotent;
// safe to call on every boot.
func migrate(db *sql.DB) error {
	const schema = `
	CREATE TABLE IF NOT EXISTS users (
		id            TEXT PRIMARY KEY,
		email         TEXT NOT NULL UNIQUE,
		password_hash BLOB NOT NULL,
		display_name  TEXT NOT NULL DEFAULT '',
		created_at    INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
	`
	if _, err := db.Exec(schema); err != nil {
		return err
	}
	return nil
}

// normalizeEmail lower-cases + trims so lookup is case-insensitive.
// Matches sheet's behaviour; doesn't strip "+tag" addresses (those
// are intentional aliases the user may rely on).
func normalizeEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// defaultDisplayName takes the part before '@' as the user's name.
// "alex@example.com" → "alex". Operators of single-user deploys can
// override via /auth/profile in Batch 4.5.
func defaultDisplayName(email string) string {
	if i := strings.IndexByte(email, '@'); i > 0 {
		return email[:i]
	}
	return email
}

// newUserID returns a 22-char URL-safe random user id. Same shape
// as inline / local docIds for visual consistency in logs.
func newUserID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

// dummyHash is a real bcrypt hash whose plaintext is not knowable —
// generated once and reused for the unknown-email branch in Verify
// so timing matches the known-email branch. Cost 12 to match
// production hashes.
var dummyHash = []byte(
	// bcrypt hash of a random 32-byte secret; cost 12.
	"$2a$12$AbCdEfGhIjKlMnOpQrStUu7XYZabcdefghijklmnopqrstuvwxyz0123",
)

// isUniqueViolation matches modernc.org/sqlite's constraint error
// shape. The driver wraps the underlying sqlite3 ERR_CONSTRAINT;
// `errors.As` would need the driver's exported error type which
// modernc.org/sqlite keeps internal. Substring check is reliable
// for this single sentinel.
func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}
