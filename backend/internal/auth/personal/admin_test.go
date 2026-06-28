// Copyright (c) 2026 Casual Office. All rights reserved.

package personal

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// withAdmin returns a test server with AdminRoutes enabled and a
// fakeUserDeleter wired so the disk-sweep path is exercised. The
// fake records every userID handed to it so a test can assert the
// sweep ran.
func withAdmin(t *testing.T) (*testServer, *fakeUserDeleter) {
	t.Helper()
	srv := newTestServer(t)
	srv.srv.Close()
	srv.h.AdminRoutes = true
	deleter := &fakeUserDeleter{}
	srv.h.UserDeleter = deleter
	srv.mux = http.NewServeMux()
	srv.h.Routes(srv.mux)
	srv.srv = httptest.NewServer(srv.mux)
	return srv, deleter
}

type fakeUserDeleter struct {
	mu      sync.Mutex
	deleted []string
}

func (f *fakeUserDeleter) DeleteUserData(userID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, userID)
	return nil
}

// TestAdmin_RequiresAdmin — non-admin gets 403, anonymous gets 401.
func TestAdmin_RequiresAdmin(t *testing.T) {
	srv, _ := withAdmin(t)
	defer srv.close()

	// Anonymous → 401 from RequireAuth.
	if resp := srv.get("/admin/users", ""); resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("anon GET = %d, want 401", resp.StatusCode)
	}
	// First signup auto-promotes; do TWO signups so the SECOND is a
	// non-admin we can exercise the 403 against.
	_ = srv.post("/auth/signup", `{"email":"boss@example.com","password":"passw0rd!"}`)
	signup := srv.post("/auth/signup", `{"email":"peon@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	if resp := srv.get("/admin/users", cookie); resp.StatusCode != http.StatusForbidden {
		t.Errorf("non-admin GET = %d, want 403", resp.StatusCode)
	}
	if body := readErrorBody(t, srv.get("/admin/users", cookie)); body.Code != "forbidden" {
		t.Errorf("forbidden code = %q", body.Code)
	}
}

// TestAdmin_ListUsers — admin gets the list, sorted oldest first.
func TestAdmin_ListUsers(t *testing.T) {
	srv, _ := withAdmin(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"admin@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	_ = srv.post("/auth/signup", `{"email":"second@example.com","password":"passw0rd!"}`)

	resp := srv.get("/admin/users", cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var users []User
	mustDecode(t, resp.Body, &users)
	if len(users) != 2 {
		t.Fatalf("len = %d, want 2", len(users))
	}
	if !users[0].IsAdmin {
		t.Error("first user (admin) IsAdmin = false in response")
	}
	if users[1].IsAdmin {
		t.Error("second user IsAdmin = true; should be false")
	}
}

// TestAdmin_DeleteUser_HappyPath — admin deletes a non-self user.
// SQLite row is gone, fake sweep was called.
func TestAdmin_DeleteUser_HappyPath(t *testing.T) {
	srv, sweep := withAdmin(t)
	defer srv.close()
	adminSignup := srv.post("/auth/signup", `{"email":"admin@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, adminSignup)
	targetSignup := srv.post("/auth/signup", `{"email":"target@example.com","password":"passw0rd!"}`)
	var target User
	mustDecode(t, targetSignup.Body, &target)

	resp := srv.delete("/admin/users/"+target.ID, cookie)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", resp.StatusCode)
	}
	// SQLite row gone.
	if _, err := srv.h.Users.Get(context.Background(), target.ID); err == nil {
		t.Error("user still on disk after admin delete")
	}
	// Sweep ran with the right id.
	if len(sweep.deleted) != 1 || sweep.deleted[0] != target.ID {
		t.Errorf("sweep deleted = %v, want [%s]", sweep.deleted, target.ID)
	}
}

// TestAdmin_DeleteUser_SelfRefused — admin trying to delete
// themselves gets 409 (keeps at least one admin around).
func TestAdmin_DeleteUser_SelfRefused(t *testing.T) {
	srv, _ := withAdmin(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"admin@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	var admin User
	mustDecode(t, signup.Body, &admin)

	resp := srv.delete("/admin/users/"+admin.ID, cookie)
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("status = %d, want 409", resp.StatusCode)
	}
	if body := readErrorBody(t, resp); body.Code != "self_delete" {
		t.Errorf("code = %q", body.Code)
	}
}

// TestAdmin_DeleteUser_NotFound — unknown id → 404.
func TestAdmin_DeleteUser_NotFound(t *testing.T) {
	srv, _ := withAdmin(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"admin@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	resp := srv.delete("/admin/users/ghost123ghost", cookie)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

// TestAdmin_RoutesOmittedWhenDisabled — AdminRoutes false → /admin/*
// is a 404 (mux didn't register).
func TestAdmin_RoutesOmittedWhenDisabled(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	if resp := srv.get("/admin/users", ""); resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 when AdminRoutes off", resp.StatusCode)
	}
}
