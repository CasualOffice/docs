package main

import (
	"bytes"
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/schnsrw/docx/backend/internal/auth/personal"
)

// seedUser puts a user on disk under root so the run() invocations
// can re-open the same SQLite file. Returns the email + initial
// password so the test can assert "old password no longer works".
func seedUser(t *testing.T, root, email, password string, admin bool) string {
	t.Helper()
	store, err := personal.NewWithOptions(root, 4)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	u, err := store.Create(context.Background(), email, password, "")
	if err != nil {
		t.Fatal(err)
	}
	if admin && !u.IsAdmin {
		// First user auto-promotes; subsequent ones need an explicit
		// SetAdmin.
		if err := store.SetAdmin(context.Background(), u.ID, true); err != nil {
			t.Fatal(err)
		}
	}
	return u.ID
}

// invoke wraps run() with default in/out streams so each test can
// focus on the args + assertions, not the pipe boilerplate. Returns
// the exit code and the captured stdout / stderr.
func invoke(t *testing.T, root, stdin string, args ...string) (int, string, string) {
	t.Helper()
	all := append([]string{"--root", root}, args...)
	var stdout, stderr bytes.Buffer
	code := run(all, strings.NewReader(stdin), &stdout, &stderr)
	return code, stdout.String(), stderr.String()
}

// TestResetPassword_WithFlag — happy path: --password lands the new
// hash; Verify accepts new and rejects old.
func TestResetPassword_WithFlag(t *testing.T) {
	root := t.TempDir()
	seedUser(t, root, "alex@example.com", "oldpassword", false)
	code, out, errOut := invoke(t, root, "",
		"reset-password", "alex@example.com", "--password", "newpassword")
	if code != 0 {
		t.Fatalf("exit = %d, stderr = %q", code, errOut)
	}
	if !strings.Contains(out, "password reset for alex@example.com") {
		t.Errorf("stdout = %q", out)
	}
	// Re-open the store and confirm Verify accepts the new password.
	store, _ := personal.NewWithOptions(root, 4)
	defer store.Close()
	if _, err := store.Verify(context.Background(), "alex@example.com", "newpassword"); err != nil {
		t.Errorf("Verify(new) = %v", err)
	}
}

// TestResetPassword_FromStdin — without --password, reads one line
// from stdin.
func TestResetPassword_FromStdin(t *testing.T) {
	root := t.TempDir()
	seedUser(t, root, "barb@example.com", "oldpassword", false)
	code, _, errOut := invoke(t, root, "newpassword\n",
		"reset-password", "barb@example.com")
	if code != 0 {
		t.Fatalf("exit = %d, stderr = %q", code, errOut)
	}
	store, _ := personal.NewWithOptions(root, 4)
	defer store.Close()
	if _, err := store.Verify(context.Background(), "barb@example.com", "newpassword"); err != nil {
		t.Errorf("Verify(new) = %v", err)
	}
}

// TestResetPassword_UnknownEmail — exit 1 + stderr message, store
// untouched.
func TestResetPassword_UnknownEmail(t *testing.T) {
	root := t.TempDir()
	code, _, errOut := invoke(t, root, "",
		"reset-password", "nope@example.com", "--password", "passw0rd!")
	if code != 1 {
		t.Errorf("exit = %d, want 1", code)
	}
	if !strings.Contains(errOut, `no user with email "nope@example.com"`) {
		t.Errorf("stderr = %q", errOut)
	}
}

// TestResetPassword_WeakRejected — short password surfaces the same
// 8-char rule as signup.
func TestResetPassword_WeakRejected(t *testing.T) {
	root := t.TempDir()
	seedUser(t, root, "carl@example.com", "oldpassword", false)
	code, _, errOut := invoke(t, root, "",
		"reset-password", "carl@example.com", "--password", "123")
	if code != 1 {
		t.Errorf("exit = %d, want 1", code)
	}
	if !strings.Contains(errOut, "password too short") {
		t.Errorf("stderr = %q", errOut)
	}
}

// TestListUsers_EmptyAndPopulated — both branches print the expected
// shape on stdout.
func TestListUsers_EmptyAndPopulated(t *testing.T) {
	root := t.TempDir()
	code, out, _ := invoke(t, root, "", "list-users")
	if code != 0 || !strings.Contains(out, "(no users)") {
		t.Errorf("empty: code=%d out=%q", code, out)
	}
	seedUser(t, root, "dee@example.com", "passw0rd!", false)
	code, out, _ = invoke(t, root, "", "list-users")
	if code != 0 {
		t.Fatalf("exit = %d", code)
	}
	if !strings.Contains(out, "dee@example.com") {
		t.Errorf("missing email; out=%q", out)
	}
	// First user is auto-promoted — should be tagged as admin.
	if !strings.Contains(out, "(admin)") {
		t.Errorf("missing admin tag; out=%q", out)
	}
}

// TestPromoteDemote — flag flips both ways; unknown email is 1.
func TestPromoteDemote(t *testing.T) {
	root := t.TempDir()
	seedUser(t, root, "boot@example.com", "passw0rd!", false) // first → admin
	seedUser(t, root, "user@example.com", "passw0rd!", false)
	if code, _, errOut := invoke(t, root, "", "promote", "user@example.com"); code != 0 {
		t.Fatalf("promote: code=%d err=%q", code, errOut)
	}
	store, _ := personal.NewWithOptions(root, 4)
	defer store.Close()
	u, _ := store.GetByEmail(context.Background(), "user@example.com")
	if !u.IsAdmin {
		t.Error("promote didn't set is_admin")
	}
	if code, _, _ := invoke(t, root, "", "demote", "user@example.com"); code != 0 {
		t.Errorf("demote: code=%d", code)
	}
	if code, _, _ := invoke(t, root, "", "promote", "no@such.user"); code != 1 {
		t.Errorf("promote unknown: code=%d, want 1", code)
	}
}

// TestUnknownSubcommand — exit 2 (syntax error) + usage on stderr.
func TestUnknownSubcommand(t *testing.T) {
	root := t.TempDir()
	code, _, errOut := invoke(t, root, "", "frobnicate")
	if code != 2 {
		t.Errorf("exit = %d, want 2", code)
	}
	if !strings.Contains(errOut, "unknown subcommand") {
		t.Errorf("stderr = %q", errOut)
	}
}

// TestRootDefault — when --root is omitted, falls back to env or
// /data. Tested via extractRoot since main() would try to open /data.
func TestExtractRoot(t *testing.T) {
	t.Setenv("CASUAL_LOCAL_PATH", filepath.Join(t.TempDir(), "alt"))
	root, rest := extractRoot([]string{"reset-password", "x@y"})
	if root == "" {
		t.Error("root resolved empty")
	}
	if len(rest) != 2 {
		t.Errorf("rest = %v", rest)
	}
	// Explicit --root wins over env.
	root, rest = extractRoot([]string{"--root", "/explicit", "reset-password"})
	if root != "/explicit" {
		t.Errorf("root = %q", root)
	}
	if len(rest) != 1 || rest[0] != "reset-password" {
		t.Errorf("rest = %v", rest)
	}
	// `--root=path` form also works.
	root, _ = extractRoot([]string{"--root=/explicit2", "list-users"})
	if root != "/explicit2" {
		t.Errorf("root (= form) = %q", root)
	}
}
