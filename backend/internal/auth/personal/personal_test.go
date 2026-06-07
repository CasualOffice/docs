package personal

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// TestCreateAndVerify — happy-path round-trip: signup, then verify
// password works and metadata round-trips.
func TestCreateAndVerify(t *testing.T) {
	s := newStore(t)
	defer s.Close()

	u, err := s.Create(context.Background(), "Alex@Example.com", "passw0rd!", "Alex")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if u.Email != "alex@example.com" {
		t.Errorf("Email = %q, want normalized lower-case", u.Email)
	}
	if u.DisplayName != "Alex" {
		t.Errorf("DisplayName = %q", u.DisplayName)
	}
	if u.ID == "" || len(u.ID) < 16 {
		t.Errorf("ID = %q, want non-empty url-safe token", u.ID)
	}

	got, err := s.Verify(context.Background(), "alex@example.com", "passw0rd!")
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got.ID != u.ID {
		t.Errorf("Verify returned ID %q, want %q", got.ID, u.ID)
	}
}

// TestCaseInsensitiveLogin — Verify accepts the same email with any
// casing as the one stored. Matches sheet's behaviour.
func TestCaseInsensitiveLogin(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	_, err := s.Create(context.Background(), "alex@example.com", "passw0rd!", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, candidate := range []string{
		"alex@example.com",
		"ALEX@EXAMPLE.COM",
		"  Alex@Example.com  ",
	} {
		if _, err := s.Verify(context.Background(), candidate, "passw0rd!"); err != nil {
			t.Errorf("Verify(%q) = %v", candidate, err)
		}
	}
}

// TestDefaultDisplayName — empty display name falls back to the
// email prefix.
func TestDefaultDisplayName(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	u, err := s.Create(context.Background(), "bob@example.com", "longerpass", "")
	if err != nil {
		t.Fatal(err)
	}
	if u.DisplayName != "bob" {
		t.Errorf("DisplayName = %q, want 'bob'", u.DisplayName)
	}
}

// TestDuplicateEmailRejected — Create with an email already on file
// returns ErrEmailTaken (HTTP 409 from the future handler).
func TestDuplicateEmailRejected(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	if _, err := s.Create(context.Background(), "dup@example.com", "passw0rd!", ""); err != nil {
		t.Fatal(err)
	}
	_, err := s.Create(context.Background(), "DUP@example.com", "different1", "")
	if !errors.Is(err, ErrEmailTaken) {
		t.Errorf("got %v, want ErrEmailTaken", err)
	}
}

// TestWrongPassword returns ErrInvalidCredentials.
func TestWrongPassword(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	_, _ = s.Create(context.Background(), "carol@example.com", "rightpassword", "")
	_, err := s.Verify(context.Background(), "carol@example.com", "wrongpassword")
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("got %v, want ErrInvalidCredentials", err)
	}
}

// TestUnknownEmail returns ErrInvalidCredentials — same shape as
// wrong-password so callers can't distinguish, by design.
func TestUnknownEmail(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	_, err := s.Verify(context.Background(), "nobody@example.com", "anything12")
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("got %v, want ErrInvalidCredentials", err)
	}
}

// TestInvalidEmailRejected — malformed email at signup time.
func TestInvalidEmailRejected(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	for _, bad := range []string{
		"not-an-email",
		"@example.com",
		"alex@",
		"",
	} {
		_, err := s.Create(context.Background(), bad, "longenough", "")
		if !errors.Is(err, ErrInvalidEmail) {
			t.Errorf("Create(%q) = %v, want ErrInvalidEmail", bad, err)
		}
	}
}

// TestWeakPasswordRejected — under 8 chars.
func TestWeakPasswordRejected(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	_, err := s.Create(context.Background(), "a@b.com", "short1", "")
	if !errors.Is(err, ErrWeakPassword) {
		t.Errorf("got %v, want ErrWeakPassword", err)
	}
}

// TestGetByID returns the user; unknown id returns ErrUserNotFound.
func TestGetByID(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	u, _ := s.Create(context.Background(), "dan@example.com", "passw0rd!", "Dan")
	got, err := s.Get(context.Background(), u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Email != "dan@example.com" {
		t.Errorf("Email = %q", got.Email)
	}
	if _, err := s.Get(context.Background(), "no-such-id"); !errors.Is(err, ErrUserNotFound) {
		t.Errorf("Get(unknown) = %v, want ErrUserNotFound", err)
	}
}

// TestUpdateDisplayName — happy path: rename, then Get reflects it.
func TestUpdateDisplayName(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	u, err := s.Create(context.Background(), "rename@example.com", "passw0rd!", "Old")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateDisplayName(context.Background(), u.ID, "New"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(context.Background(), u.ID)
	if got.DisplayName != "New" {
		t.Errorf("DisplayName = %q, want New", got.DisplayName)
	}
}

// TestUpdateDisplayName_UnknownUser — surfaces ErrUserNotFound
// rather than silently succeeding.
func TestUpdateDisplayName_UnknownUser(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	if err := s.UpdateDisplayName(context.Background(), "no-such-id", "X"); !errors.Is(err, ErrUserNotFound) {
		t.Errorf("got %v, want ErrUserNotFound", err)
	}
}

// TestUpdateDisplayName_RejectsEmpty — whitespace-only input is
// rejected so the UI never silently flips to a blank header.
func TestUpdateDisplayName_RejectsEmpty(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	u, _ := s.Create(context.Background(), "blank@example.com", "passw0rd!", "Real Name")
	if err := s.UpdateDisplayName(context.Background(), u.ID, "   "); err == nil {
		t.Error("UpdateDisplayName('   ') = nil; want error")
	}
}

// TestGetByEmail — round-trip via email (case-insensitive).
func TestGetByEmail(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	_, _ = s.Create(context.Background(), "bymail@example.com", "passw0rd!", "")
	u, err := s.GetByEmail(context.Background(), "ByMail@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if u.Email != "bymail@example.com" {
		t.Errorf("Email = %q, want bymail@example.com", u.Email)
	}
	if _, err := s.GetByEmail(context.Background(), "no@such.user"); !errors.Is(err, ErrUserNotFound) {
		t.Errorf("GetByEmail(unknown) = %v, want ErrUserNotFound", err)
	}
}

// TestFirstSignupAutoPromotesAdmin — the bootstrap user inherits
// admin so a single-tenant deploy has someone to run /admin/* through.
func TestFirstSignupAutoPromotesAdmin(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	first, err := s.Create(context.Background(), "boot@example.com", "passw0rd!", "Boot")
	if err != nil {
		t.Fatal(err)
	}
	if !first.IsAdmin {
		t.Error("first user IsAdmin = false; want true (bootstrap auto-promotion)")
	}
	second, err := s.Create(context.Background(), "second@example.com", "passw0rd!", "Two")
	if err != nil {
		t.Fatal(err)
	}
	if second.IsAdmin {
		t.Error("second user IsAdmin = true; want false")
	}
}

// TestListUsers — oldest-first, includes admin flag.
func TestListUsers(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	_, _ = s.Create(context.Background(), "one@example.com", "passw0rd!", "One")
	_, _ = s.Create(context.Background(), "two@example.com", "passw0rd!", "Two")
	users, err := s.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 2 {
		t.Fatalf("len = %d, want 2", len(users))
	}
	if users[0].Email != "one@example.com" {
		t.Errorf("oldest = %q, want one@example.com", users[0].Email)
	}
}

// TestDeleteUser — gone from SQLite + Get returns ErrUserNotFound.
func TestDeleteUser(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	u, _ := s.Create(context.Background(), "delete@example.com", "passw0rd!", "")
	if err := s.Delete(context.Background(), u.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(context.Background(), u.ID); !errors.Is(err, ErrUserNotFound) {
		t.Errorf("Get after Delete = %v, want ErrUserNotFound", err)
	}
	if err := s.Delete(context.Background(), "no-such-id"); !errors.Is(err, ErrUserNotFound) {
		t.Errorf("Delete(unknown) = %v, want ErrUserNotFound", err)
	}
}

// TestResetPassword — new password Verify-able, old one rejected.
func TestResetPassword(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	_, _ = s.Create(context.Background(), "reset@example.com", "oldpassword", "")
	if err := s.ResetPassword(context.Background(), "reset@example.com", "newpassword"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Verify(context.Background(), "reset@example.com", "newpassword"); err != nil {
		t.Errorf("Verify(new) = %v", err)
	}
	if _, err := s.Verify(context.Background(), "reset@example.com", "oldpassword"); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("Verify(old) = %v, want ErrInvalidCredentials", err)
	}
}

// TestResetPassword_RejectsWeak — same length rule as Create.
func TestResetPassword_RejectsWeak(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	_, _ = s.Create(context.Background(), "weak@example.com", "passw0rd!", "")
	if err := s.ResetPassword(context.Background(), "weak@example.com", "123"); !errors.Is(err, ErrWeakPassword) {
		t.Errorf("got %v, want ErrWeakPassword", err)
	}
}

// TestResetPassword_UnknownEmail — bubbles ErrUserNotFound.
func TestResetPassword_UnknownEmail(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	if err := s.ResetPassword(context.Background(), "no@such.user", "passw0rd!"); !errors.Is(err, ErrUserNotFound) {
		t.Errorf("got %v, want ErrUserNotFound", err)
	}
}

// TestSetAdmin — promote then demote round-trip; unknown id surfaces
// ErrUserNotFound.
func TestSetAdmin(t *testing.T) {
	s := newStore(t)
	defer s.Close()
	// Create a second user — first auto-promoted, so we test the
	// promotion path on a non-admin.
	_, _ = s.Create(context.Background(), "boot@example.com", "passw0rd!", "")
	u, _ := s.Create(context.Background(), "promote@example.com", "passw0rd!", "")
	if u.IsAdmin {
		t.Fatal("second user should not start as admin")
	}
	if err := s.SetAdmin(context.Background(), u.ID, true); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(context.Background(), u.ID)
	if !got.IsAdmin {
		t.Error("IsAdmin after promote = false")
	}
	if err := s.SetAdmin(context.Background(), u.ID, false); err != nil {
		t.Fatal(err)
	}
	got, _ = s.Get(context.Background(), u.ID)
	if got.IsAdmin {
		t.Error("IsAdmin after demote = true")
	}
	if err := s.SetAdmin(context.Background(), "no-such-id", true); !errors.Is(err, ErrUserNotFound) {
		t.Errorf("SetAdmin(unknown) = %v, want ErrUserNotFound", err)
	}
}

// TestPersistsAcrossInstances — the whole point of SQLite over
// in-memory state. A fresh UserStore on the same root reads what
// the previous one wrote.
func TestPersistsAcrossInstances(t *testing.T) {
	root := t.TempDir()
	s1, err := NewWithOptions(root, 4)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s1.Create(context.Background(), "survive@example.com", "passw0rd!", ""); err != nil {
		t.Fatal(err)
	}
	s1.Close()

	s2, err := NewWithOptions(root, 4)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	if _, err := s2.Verify(context.Background(), "survive@example.com", "passw0rd!"); err != nil {
		t.Errorf("Verify after restart: %v", err)
	}
}

// ---------------------------------------------------------------
// Session signer / verifier
// ---------------------------------------------------------------

func TestSessionSignVerifyRoundTrip(t *testing.T) {
	sess := newSession(t)
	tok := sess.Sign("user-123", time.Minute)
	got, err := sess.Verify(tok)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got != "user-123" {
		t.Errorf("got %q, want user-123", got)
	}
}

func TestSessionRejectsTampered(t *testing.T) {
	sess := newSession(t)
	tok := sess.Sign("user-123", time.Minute)
	// Flip a single bit in the signature suffix.
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		t.Fatalf("unexpected token shape: %q", tok)
	}
	// Toggle the first char of the signature.
	tampered := parts[0] + "." + parts[1] + "." + flipFirstChar(parts[2])
	if _, err := sess.Verify(tampered); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("tampered token verified: err = %v", err)
	}
}

func TestSessionRejectsExpired(t *testing.T) {
	sess := newSession(t)
	tok := sess.Sign("user-123", -time.Second)
	if _, err := sess.Verify(tok); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("expired token verified: err = %v", err)
	}
}

func TestSessionRequiresMinKeyLength(t *testing.T) {
	if _, err := NewSession([]byte("too-short")); err == nil {
		t.Error("NewSession accepted a too-short key")
	}
}

func TestSessionVerifyRejectsMalformed(t *testing.T) {
	sess := newSession(t)
	for _, bad := range []string{
		"",
		"not.three.parts.here",
		"only-one-part",
		"two.parts",
		"user.notanumber.AAAA",
	} {
		if _, err := sess.Verify(bad); !errors.Is(err, ErrInvalidCredentials) {
			t.Errorf("Verify(%q) = %v, want ErrInvalidCredentials", bad, err)
		}
	}
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

func newStore(t *testing.T) *UserStore {
	t.Helper()
	// bcrypt cost 4 (the minimum) keeps the test suite under a
	// few hundred ms total — production stores default to 12.
	s, err := NewWithOptions(t.TempDir(), 4)
	if err != nil {
		t.Fatalf("NewWithOptions: %v", err)
	}
	return s
}

func newSession(t *testing.T) *Session {
	t.Helper()
	sess, err := NewSession([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}
	return sess
}

func flipFirstChar(s string) string {
	if s == "" {
		return "x"
	}
	if s[0] == 'A' {
		return "B" + s[1:]
	}
	return "A" + s[1:]
}
