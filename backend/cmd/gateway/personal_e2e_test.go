// Copyright (c) 2026 Casual Office. All rights reserved.

// Full Mode 3 (Standalone) flow exercised through real HTTP. Spins
// up the same wiring main() does — UserStore + PerUserStores +
// FileProfileStore + Handlers — and drives every personal-auth +
// per-user files + profile + admin route via an httptest server.
//
// This is the integration test sheet's Phase C closure called for;
// it proves the bricks of Batches 1-4.5 + 5 fit together end-to-end:
// signup → upload → list → save → download → rename → delete →
// profile → admin list/delete → cross-user isolation.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/schnsrw/docx/backend/internal/auth/personal"
	"github.com/schnsrw/docx/backend/internal/host/local"
)

// personalServer wires the full Phase C stack against a temp dir,
// mirroring cmd/gateway/main.go's run-loop construction with the
// pieces tests actually need. Each test gets a fresh server +
// cookie-jar HTTP client so sessions don't leak between cases.
type personalServer struct {
	t       *testing.T
	srv     *httptest.Server
	root    string
	users   *personal.UserStore
	perUser *local.PerUserStores
	client  *http.Client
}

func newPersonalServer(t *testing.T) *personalServer {
	t.Helper()
	root := t.TempDir()
	users, err := personal.NewWithOptions(root, 4)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { users.Close() })

	sess, err := personal.NewSession([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatal(err)
	}
	perUser, err := local.NewPerUserStores(root)
	if err != nil {
		t.Fatal(err)
	}
	profiles := personal.NewFileProfileStore(func(userID string) string {
		return filepath.Join(perUser.BaseRoot(), "users", userID, ".profile.json")
	})
	adapter := &peruserAdapter{stores: perUser}
	mux := http.NewServeMux()
	(&personal.Handlers{
		Users:       users,
		Session:     sess,
		Files:       adapter,
		Profiles:    profiles,
		UserDeleter: adapter,
		AdminRoutes: true,
	}).Routes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	jar, _ := cookiejar.New(nil)
	return &personalServer{
		t:       t,
		srv:     srv,
		root:    root,
		users:   users,
		perUser: perUser,
		client:  &http.Client{Jar: jar},
	}
}

// signup posts to /auth/signup; the cookie jar grabs the session
// cookie so subsequent calls on the same client are authenticated.
// Returns the freshly-minted User for assertion against the rest of
// the flow.
func (p *personalServer) signup(email, password string) personal.User {
	p.t.Helper()
	body := `{"email":"` + email + `","password":"` + password + `"}`
	resp, err := p.client.Post(p.srv.URL+"/auth/signup", "application/json",
		strings.NewReader(body))
	if err != nil {
		p.t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		raw, _ := io.ReadAll(resp.Body)
		p.t.Fatalf("signup %s: status %d body %s", email, resp.StatusCode, raw)
	}
	var u personal.User
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		p.t.Fatal(err)
	}
	return u
}

// login posts to /auth/login. Used by the logout-then-login leg of
// the flow.
func (p *personalServer) login(email, password string) int {
	p.t.Helper()
	body := `{"email":"` + email + `","password":"` + password + `"}`
	resp, err := p.client.Post(p.srv.URL+"/auth/login", "application/json",
		strings.NewReader(body))
	if err != nil {
		p.t.Fatal(err)
	}
	defer resp.Body.Close()
	return resp.StatusCode
}

func (p *personalServer) logout() {
	p.t.Helper()
	resp, err := p.client.Post(p.srv.URL+"/auth/logout", "application/json", nil)
	if err != nil {
		p.t.Fatal(err)
	}
	resp.Body.Close()
}

func (p *personalServer) uploadFile(name string, contents []byte) personal.FileSummary {
	p.t.Helper()
	req, _ := http.NewRequest(http.MethodPost, p.srv.URL+"/files", bytes.NewReader(contents))
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("X-File-Name", name)
	resp, err := p.client.Do(req)
	if err != nil {
		p.t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		raw, _ := io.ReadAll(resp.Body)
		p.t.Fatalf("upload %s: status %d body %s", name, resp.StatusCode, raw)
	}
	var s personal.FileSummary
	if err := json.NewDecoder(resp.Body).Decode(&s); err != nil {
		p.t.Fatal(err)
	}
	return s
}

func (p *personalServer) listFiles() []personal.FileSummary {
	p.t.Helper()
	resp, err := p.client.Get(p.srv.URL + "/files")
	if err != nil {
		p.t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		p.t.Fatalf("list: status %d", resp.StatusCode)
	}
	var out []personal.FileSummary
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		p.t.Fatal(err)
	}
	return out
}

// TestPersonalE2E walks the full Mode 3 happy path. One test, many
// steps, because the value is in the sequence — a unit-test-shaped
// breakdown would lose the "the user's whole workflow works" signal.
func TestPersonalE2E_FullFlow(t *testing.T) {
	p := newPersonalServer(t)

	// 1. Signup + check /auth/me returns the same User. First user
	//    auto-promotes to admin.
	u := p.signup("alex@example.com", "passw0rd!")
	if !u.IsAdmin {
		t.Error("first user should auto-promote to admin")
	}
	if resp, err := p.client.Get(p.srv.URL + "/auth/me"); err != nil || resp.StatusCode != 200 {
		t.Fatalf("/auth/me after signup: %v / %d", err, resp.StatusCode)
	}

	// 2. Upload, list, verify content + summary.
	uploaded := p.uploadFile("report.docx", []byte("PK\x03\x04 first version"))
	listed := p.listFiles()
	if len(listed) != 1 || listed[0].DocID != uploaded.DocID {
		t.Fatalf("list = %+v after upload", listed)
	}

	// 3. Save (PUT /files/{id}/contents) — version bump + bytes update.
	saveReq, _ := http.NewRequest(http.MethodPut,
		p.srv.URL+"/files/"+uploaded.DocID+"/contents",
		bytes.NewReader([]byte("PK\x03\x04 second version")))
	saveReq.Header.Set("Content-Type", "application/octet-stream")
	saveResp, err := p.client.Do(saveReq)
	if err != nil || saveResp.StatusCode != 200 {
		t.Fatalf("save: %v / %d", err, saveResp.StatusCode)
	}
	var saved personal.FileSummary
	json.NewDecoder(saveResp.Body).Decode(&saved)
	saveResp.Body.Close()
	if saved.Version != 2 {
		t.Errorf("version after save = %d, want 2", saved.Version)
	}

	// 4. Download — bytes match the latest save.
	dlResp, err := p.client.Get(p.srv.URL + "/files/" + uploaded.DocID)
	if err != nil || dlResp.StatusCode != 200 {
		t.Fatalf("download: %v / %d", err, dlResp.StatusCode)
	}
	body, _ := io.ReadAll(dlResp.Body)
	dlResp.Body.Close()
	if !bytes.Equal(body, []byte("PK\x03\x04 second version")) {
		t.Errorf("download body mismatch: %q", body)
	}
	if dlResp.Header.Get("ETag") != "2" {
		t.Errorf("ETag = %q, want 2", dlResp.Header.Get("ETag"))
	}

	// 5. Rename — name surfaces on the next list.
	renameReq, _ := http.NewRequest(http.MethodPatch,
		p.srv.URL+"/files/"+uploaded.DocID,
		strings.NewReader(`{"fileName":"renamed.docx"}`))
	renameReq.Header.Set("Content-Type", "application/json")
	renResp, _ := p.client.Do(renameReq)
	renResp.Body.Close()
	if renResp.StatusCode != 200 {
		t.Errorf("rename status = %d", renResp.StatusCode)
	}

	// 6. Profile round-trip — PUT then GET, fields persist.
	putReq, _ := http.NewRequest(http.MethodPut, p.srv.URL+"/auth/profile",
		strings.NewReader(`{"timezone":"America/Los_Angeles","prefs":{"showRulers":true}}`))
	putReq.Header.Set("Content-Type", "application/json")
	profResp, _ := p.client.Do(putReq)
	profResp.Body.Close()
	if profResp.StatusCode != 200 {
		t.Errorf("profile PUT status = %d", profResp.StatusCode)
	}
	getResp, _ := p.client.Get(p.srv.URL + "/auth/profile")
	var view map[string]any
	json.NewDecoder(getResp.Body).Decode(&view)
	getResp.Body.Close()
	if view["timezone"] != "America/Los_Angeles" {
		t.Errorf("profile.timezone = %v", view["timezone"])
	}

	// 7. Logout + login round-trip — re-list shows the same docs.
	p.logout()
	if status := p.login("alex@example.com", "passw0rd!"); status != 200 {
		t.Fatalf("login after logout: %d", status)
	}
	relisted := p.listFiles()
	if len(relisted) != 1 || relisted[0].FileName != "renamed.docx" {
		t.Errorf("relist after logout/login = %+v", relisted)
	}
}

// TestPersonalE2E_CrossUserIsolation — two users on one deploy must
// not see each other's files or read each other's bytes. This is the
// guarantee Batch 3 (per-user file scoping) exists to provide.
func TestPersonalE2E_CrossUserIsolation(t *testing.T) {
	// Owner signs up + uploads.
	owner := newPersonalServer(t)
	owner.signup("owner@example.com", "passw0rd!")
	uploaded := owner.uploadFile("private.docx", []byte("OWNER ONLY"))

	// Stranger uses the SAME backend (same root) but a separate
	// HTTP client (separate cookie jar).
	jar, _ := cookiejar.New(nil)
	stranger := &http.Client{Jar: jar}
	body := `{"email":"stranger@example.com","password":"passw0rd!"}`
	resp, _ := stranger.Post(owner.srv.URL+"/auth/signup", "application/json",
		strings.NewReader(body))
	resp.Body.Close()

	// Stranger's list is empty.
	listResp, _ := stranger.Get(owner.srv.URL + "/files")
	var stuff []personal.FileSummary
	json.NewDecoder(listResp.Body).Decode(&stuff)
	listResp.Body.Close()
	if len(stuff) != 0 {
		t.Errorf("stranger sees %d files; want 0", len(stuff))
	}

	// Stranger trying to download the owner's docId → 404 (not 403,
	// to avoid enumerating user ownership).
	dl, _ := stranger.Get(owner.srv.URL + "/files/" + uploaded.DocID)
	if dl.StatusCode != http.StatusNotFound {
		t.Errorf("cross-user download = %d, want 404", dl.StatusCode)
	}
	dl.Body.Close()
}

// TestPersonalE2E_AdminCanListAndDelete — exercises the admin
// surface in the full stack: list shows both users, delete removes
// the target's SQLite row AND their on-disk directory.
func TestPersonalE2E_AdminCanListAndDelete(t *testing.T) {
	p := newPersonalServer(t)
	admin := p.signup("admin@example.com", "passw0rd!")
	if !admin.IsAdmin {
		t.Fatal("first user should be admin")
	}

	// Second user (via a separate client) signs up + uploads, so
	// there's data on disk for the admin's delete to sweep.
	otherJar, _ := cookiejar.New(nil)
	other := &http.Client{Jar: otherJar}
	otherBody := `{"email":"other@example.com","password":"passw0rd!"}`
	otherResp, _ := other.Post(p.srv.URL+"/auth/signup", "application/json",
		strings.NewReader(otherBody))
	var otherUser personal.User
	json.NewDecoder(otherResp.Body).Decode(&otherUser)
	otherResp.Body.Close()
	// Upload one doc as `other`.
	upReq, _ := http.NewRequest(http.MethodPost, p.srv.URL+"/files",
		bytes.NewReader([]byte("other data")))
	upReq.Header.Set("Content-Type", "application/octet-stream")
	upReq.Header.Set("X-File-Name", "other.docx")
	upResp, _ := other.Do(upReq)
	upResp.Body.Close()

	// Admin lists — sees both users.
	listResp, _ := p.client.Get(p.srv.URL + "/admin/users")
	var users []personal.User
	json.NewDecoder(listResp.Body).Decode(&users)
	listResp.Body.Close()
	if len(users) != 2 {
		t.Fatalf("admin list = %d users, want 2", len(users))
	}

	// Admin deletes `other`. SQLite row gone + on-disk dir swept.
	delReq, _ := http.NewRequest(http.MethodDelete,
		p.srv.URL+"/admin/users/"+otherUser.ID, nil)
	delResp, _ := p.client.Do(delReq)
	delResp.Body.Close()
	if delResp.StatusCode != http.StatusNoContent {
		t.Errorf("delete status = %d", delResp.StatusCode)
	}
	// Re-list — one user left.
	listResp, _ = p.client.Get(p.srv.URL + "/admin/users")
	users = users[:0]
	json.NewDecoder(listResp.Body).Decode(&users)
	listResp.Body.Close()
	if len(users) != 1 {
		t.Errorf("after delete list = %d, want 1", len(users))
	}
	// On-disk sweep landed.
	userDir := filepath.Join(p.perUser.BaseRoot(), "users", otherUser.ID)
	if _, err := os.Stat(userDir); !os.IsNotExist(err) {
		t.Errorf("user dir %q still on disk after admin delete (err=%v)", userDir, err)
	}
}
