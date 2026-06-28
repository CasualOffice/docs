// Copyright (c) 2026 Casual Office. All rights reserved.

package personal

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/schnsrw/docx/backend/internal/host"
)

// TestSignup_HappyPath — 201 + session cookie + user JSON.
func TestSignup_HappyPath(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()

	resp := srv.post("/auth/signup", `{"email":"alex@example.com","password":"passw0rd!","displayName":"Alex"}`)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", resp.StatusCode)
	}

	var u User
	mustDecode(t, resp.Body, &u)
	if u.Email != "alex@example.com" {
		t.Errorf("email = %q", u.Email)
	}
	if u.ID == "" {
		t.Error("ID missing in response")
	}
	if !srv.hasSessionCookie(resp) {
		t.Error("Set-Cookie missing the session token")
	}
}

// TestSignup_BadJSON — 400 on a malformed body.
func TestSignup_BadJSON(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	resp := srv.post("/auth/signup", `{`)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

// TestSignup_DuplicateEmail — 409 + email_taken code.
func TestSignup_DuplicateEmail(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	_ = srv.post("/auth/signup", `{"email":"dup@example.com","password":"passw0rd!"}`)
	resp := srv.post("/auth/signup", `{"email":"dup@example.com","password":"different1"}`)
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409", resp.StatusCode)
	}
	body := readErrorBody(t, resp)
	if body.Code != "email_taken" {
		t.Errorf("code = %q, want email_taken", body.Code)
	}
}

// TestSignup_WeakPassword — 400 + weak_password code.
func TestSignup_WeakPassword(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	resp := srv.post("/auth/signup", `{"email":"weak@example.com","password":"123"}`)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
	if body := readErrorBody(t, resp); body.Code != "weak_password" {
		t.Errorf("code = %q, want weak_password", body.Code)
	}
}

// TestSignup_InvalidEmail — 400 + invalid_email.
func TestSignup_InvalidEmail(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	resp := srv.post("/auth/signup", `{"email":"not-an-email","password":"passw0rd!"}`)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
	if body := readErrorBody(t, resp); body.Code != "invalid_email" {
		t.Errorf("code = %q, want invalid_email", body.Code)
	}
}

// TestLogin_HappyPath — signup, then login with the same credentials.
func TestLogin_HappyPath(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()

	_ = srv.post("/auth/signup", `{"email":"carol@example.com","password":"passw0rd!"}`)
	resp := srv.post("/auth/login", `{"email":"carol@example.com","password":"passw0rd!"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if !srv.hasSessionCookie(resp) {
		t.Error("Set-Cookie missing")
	}
}

// TestLogin_WrongPassword — 401 + invalid_credentials.
func TestLogin_WrongPassword(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	_ = srv.post("/auth/signup", `{"email":"dan@example.com","password":"correctpass"}`)
	resp := srv.post("/auth/login", `{"email":"dan@example.com","password":"wrongpass"}`)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
	if body := readErrorBody(t, resp); body.Code != "invalid_credentials" {
		t.Errorf("code = %q, want invalid_credentials", body.Code)
	}
}

// TestLogin_UnknownEmail — same shape as wrong-password, by design.
func TestLogin_UnknownEmail(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	resp := srv.post("/auth/login", `{"email":"nobody@example.com","password":"anything12"}`)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
	if body := readErrorBody(t, resp); body.Code != "invalid_credentials" {
		t.Errorf("code = %q, want invalid_credentials", body.Code)
	}
}

// TestMe_RequiresSession — without a cookie, /auth/me returns 401.
func TestMe_RequiresSession(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	resp := srv.get("/auth/me", "")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestMe_WithSession — after signup, /auth/me returns the user.
func TestMe_WithSession(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"erin@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)

	resp := srv.get("/auth/me", cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var u User
	mustDecode(t, resp.Body, &u)
	if u.Email != "erin@example.com" {
		t.Errorf("email = %q", u.Email)
	}
}

// TestLogout_ClearsCookie — Set-Cookie with MaxAge=0 / past expiry.
func TestLogout_ClearsCookie(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	resp := srv.post("/auth/logout", "")
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d, want 204", resp.StatusCode)
	}
	// Set-Cookie value should be empty and MaxAge negative.
	for _, c := range resp.Cookies() {
		if c.Name == SessionCookieName && c.Value == "" && c.MaxAge < 0 {
			return
		}
	}
	t.Error("expected a clearing Set-Cookie")
}

// TestRequireAuth_HappyPath — wrapping a handler with RequireAuth
// gives downstream access to the resolved user via context.
func TestRequireAuth_HappyPath(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()

	signup := srv.post("/auth/signup", `{"email":"frank@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)

	// Mount a protected route on the same handler infra.
	protected := srv.h.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := UserFromContext(r.Context())
		if !ok {
			t.Error("UserFromContext returned ok=false inside RequireAuth-wrapped handler")
			http.Error(w, "no user", http.StatusInternalServerError)
			return
		}
		_, _ = w.Write([]byte(u.Email))
	}))
	srv.mux.Handle("GET /protected", protected)

	resp := srv.get("/protected", cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "frank@example.com" {
		t.Errorf("body = %q", string(body))
	}
}

// TestRequireAuth_NoCookie — 401 when no session.
func TestRequireAuth_NoCookie(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	protected := srv.h.RequireAuth(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("downstream handler should not run without a session")
	}))
	srv.mux.Handle("GET /protected", protected)
	resp := srv.get("/protected", "")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestSecureCookieNamePrefix — when Secure=true the cookie is
// prefixed with __Host- per the browser-side cookie-prefix rules.
func TestSecureCookieNamePrefix(t *testing.T) {
	srv := newTestServer(t)
	srv.h.Secure = true
	defer srv.close()
	resp := srv.post("/auth/signup", `{"email":"gail@example.com","password":"passw0rd!"}`)
	for _, c := range resp.Cookies() {
		if strings.HasPrefix(c.Name, "__Host-") {
			return
		}
	}
	t.Error("Set-Cookie missing the __Host- prefix in secure mode")
}

// ---------------------------------------------------------------
// GET /files
// ---------------------------------------------------------------

// fakeFiles is an in-memory FileStore for the /files tests. Keyed by
// (userID, docID) → bytes + summary so we can exercise list, upload,
// download, save, rename, delete without spinning up a real local
// store. Not thread-safe — every test gets a fresh instance.
type fakeFiles struct {
	byUser map[string]map[string]*fakeDoc
	// nextID is incremented before each Store so docIDs are
	// deterministic across the suite. The safeDocID regex in the
	// local host requires 8+ chars, so we pad. The personal package
	// doesn't validate docID shape — it delegates to the FileStore —
	// so any non-empty key works here.
	nextID int
}

type fakeDoc struct {
	summary  FileSummary
	contents []byte
}

func newFakeFiles() *fakeFiles {
	return &fakeFiles{byUser: map[string]map[string]*fakeDoc{}}
}

func (f *fakeFiles) seed(userID string, summary FileSummary, contents []byte) {
	if f.byUser[userID] == nil {
		f.byUser[userID] = map[string]*fakeDoc{}
	}
	f.byUser[userID][summary.DocID] = &fakeDoc{summary: summary, contents: contents}
}

func (f *fakeFiles) ListFor(userID string) ([]FileSummary, error) {
	docs := f.byUser[userID]
	out := make([]FileSummary, 0, len(docs))
	for _, d := range docs {
		out = append(out, d.summary)
	}
	return out, nil
}

func (f *fakeFiles) StoreFor(userID, fileName string, contents []byte) (FileSummary, error) {
	if f.byUser[userID] == nil {
		f.byUser[userID] = map[string]*fakeDoc{}
	}
	f.nextID++
	docID := "doc" + strings.Repeat("0", 5) + intStr(f.nextID)
	s := FileSummary{
		DocID:    docID,
		FileName: fileName,
		Version:  1,
		SavedAt:  "2026-01-01T00:00:00Z",
		Size:     int64(len(contents)),
	}
	f.byUser[userID][docID] = &fakeDoc{summary: s, contents: contents}
	return s, nil
}

func (f *fakeFiles) FetchFor(_ context.Context, userID, docID string) (FileSummary, []byte, error) {
	d, ok := f.byUser[userID][docID]
	if !ok {
		return FileSummary{}, nil, host.ErrNotFound
	}
	return d.summary, d.contents, nil
}

func (f *fakeFiles) SaveFor(_ context.Context, userID, docID string, contents []byte) (FileSummary, error) {
	d, ok := f.byUser[userID][docID]
	if !ok {
		return FileSummary{}, host.ErrNotFound
	}
	d.contents = contents
	d.summary.Version++
	d.summary.Size = int64(len(contents))
	return d.summary, nil
}

func (f *fakeFiles) RenameFor(userID, docID, newName string) error {
	d, ok := f.byUser[userID][docID]
	if !ok {
		return host.ErrNotFound
	}
	d.summary.FileName = newName
	return nil
}

func (f *fakeFiles) DeleteFor(userID, docID string) error {
	if _, ok := f.byUser[userID][docID]; !ok {
		// Match the production store: idempotent — already-absent is nil.
		return nil
	}
	delete(f.byUser[userID], docID)
	return nil
}

func intStr(n int) string {
	// Tiny helper to keep the seed code free of strconv churn.
	const digits = "0123456789"
	if n == 0 {
		return "0"
	}
	buf := []byte{}
	for n > 0 {
		buf = append([]byte{digits[n%10]}, buf...)
		n /= 10
	}
	return string(buf)
}

// withFiles returns a fresh test server with the FileStore wired in
// from the start, so /files routes are mounted before any request
// lands. Keeps each per-file test self-contained.
func withFiles(t *testing.T) (*testServer, *fakeFiles) {
	t.Helper()
	srv := newTestServer(t)
	srv.srv.Close() // discard the no-files server; rebuild with Files set.
	srv.h.Files = newFakeFiles()
	srv.mux = http.NewServeMux()
	srv.h.Routes(srv.mux)
	srv.srv = httptest.NewServer(srv.mux)
	return srv, srv.h.Files.(*fakeFiles)
}

// TestFiles_RequiresSession — without a cookie, /files returns 401.
func TestFiles_RequiresSession(t *testing.T) {
	srv, _ := withFiles(t)
	defer srv.close()

	resp := srv.get("/files", "")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestFiles_ReturnsUserScopedList — after signup + login, /files
// returns the file list scoped to the authenticated user.
func TestFiles_ReturnsUserScopedList(t *testing.T) {
	srv, files := withFiles(t)
	defer srv.close()

	signup := srv.post("/auth/signup", `{"email":"hank@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	var u User
	mustDecode(t, signup.Body, &u)
	files.seed(u.ID, FileSummary{
		DocID: "abc12345", FileName: "report.docx", Version: 1,
		SavedAt: "2026-01-01T00:00:00Z", Size: 42,
	}, []byte("PK"))

	resp := srv.get("/files", cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var got []FileSummary
	mustDecode(t, resp.Body, &got)
	if len(got) != 1 || got[0].FileName != "report.docx" {
		t.Errorf("got %+v", got)
	}
}

// TestFiles_NilListerOmitsRoute — when Files is nil, GET /files
// returns 404 from the mux (route not registered).
func TestFiles_NilListerOmitsRoute(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	resp := srv.get("/files", "")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 when Files lister isn't wired", resp.StatusCode)
	}
}

// ---------------------------------------------------------------
// POST /files (upload) / GET /files/:id (download)
// ---------------------------------------------------------------

// TestUploadFile_HappyPath — raw body upload returns a 201 with a
// summary the client can use as the FileSource result. The bytes
// land in the fake under the calling user.
func TestUploadFile_HappyPath(t *testing.T) {
	srv, files := withFiles(t)
	defer srv.close()

	signup := srv.post("/auth/signup", `{"email":"isaac@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	var u User
	mustDecode(t, signup.Body, &u)

	resp := srv.postRaw("/files", "application/octet-stream",
		[]byte("PK\x03\x04 stub"), cookie, map[string]string{"X-File-Name": "draft.docx"})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", resp.StatusCode)
	}
	var got FileSummary
	mustDecode(t, resp.Body, &got)
	if got.FileName != "draft.docx" {
		t.Errorf("fileName = %q, want draft.docx", got.FileName)
	}
	if got.DocID == "" {
		t.Error("docId missing")
	}
	if files.byUser[u.ID][got.DocID] == nil {
		t.Errorf("upload didn't land in fake (user=%s docId=%s)", u.ID, got.DocID)
	}
}

// TestUploadFile_RequiresSession — anonymous upload is 401.
func TestUploadFile_RequiresSession(t *testing.T) {
	srv, _ := withFiles(t)
	defer srv.close()
	resp := srv.postRaw("/files", "application/octet-stream", []byte("PK"), "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestUploadFile_EmptyBody — 400 with the empty code.
func TestUploadFile_EmptyBody(t *testing.T) {
	srv, _ := withFiles(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"jess@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	resp := srv.postRaw("/files", "application/octet-stream", []byte(""), cookie, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
	if body := readErrorBody(t, resp); body.Code != "empty" {
		t.Errorf("code = %q, want empty", body.Code)
	}
}

// TestDownloadFile_StreamsBytes — GET /files/{docId} returns the
// stored bytes with a Content-Disposition matching the stored
// fileName.
func TestDownloadFile_StreamsBytes(t *testing.T) {
	srv, files := withFiles(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"kim@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	var u User
	mustDecode(t, signup.Body, &u)
	files.seed(u.ID, FileSummary{
		DocID: "downloadme1", FileName: "policy.docx", Version: 3,
		SavedAt: "2026-01-01T00:00:00Z", Size: 9,
	}, []byte("HELLODOCX"))

	resp := srv.get("/files/downloadme1", cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "HELLODOCX" {
		t.Errorf("body = %q", string(body))
	}
	if cd := resp.Header.Get("Content-Disposition"); !strings.Contains(cd, "policy.docx") {
		t.Errorf("Content-Disposition = %q (no fileName)", cd)
	}
	if etag := resp.Header.Get("ETag"); etag != "3" {
		t.Errorf("ETag = %q, want 3", etag)
	}
}

// TestDownloadFile_NotOwnedByUser — another user's doc surfaces as
// 404, not 403, so the response shape can't be used to enumerate
// across users.
func TestDownloadFile_NotOwnedByUser(t *testing.T) {
	srv, files := withFiles(t)
	defer srv.close()

	// Owner uploads.
	ownerSignup := srv.post("/auth/signup", `{"email":"owner@example.com","password":"passw0rd!"}`)
	var owner User
	mustDecode(t, ownerSignup.Body, &owner)
	files.seed(owner.ID, FileSummary{DocID: "private01", FileName: "secret.docx"}, []byte("S"))

	// Stranger logs in.
	strangerSignup := srv.post("/auth/signup", `{"email":"stranger@example.com","password":"passw0rd!"}`)
	strangerCookie := extractSessionCookie(t, strangerSignup)

	resp := srv.get("/files/private01", strangerCookie)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 (cross-user access)", resp.StatusCode)
	}
}

// TestSaveFile_BumpsVersion — PUT /files/{id}/contents replaces
// bytes and returns a summary with the bumped version.
func TestSaveFile_BumpsVersion(t *testing.T) {
	srv, files := withFiles(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"lena@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	var u User
	mustDecode(t, signup.Body, &u)
	files.seed(u.ID, FileSummary{
		DocID: "saveme01", FileName: "notes.docx", Version: 4, Size: 1,
	}, []byte("A"))

	req, _ := http.NewRequest("PUT", srv.srv.URL+"/files/saveme01/contents",
		bytes.NewBufferString("PK\x03\x04 newer"))
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Cookie", cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var got FileSummary
	mustDecode(t, resp.Body, &got)
	if got.Version != 5 {
		t.Errorf("version = %d, want 5", got.Version)
	}
	if string(files.byUser[u.ID]["saveme01"].contents) != "PK\x03\x04 newer" {
		t.Errorf("save did not overwrite the bytes")
	}
}

// TestRenameFile_UpdatesName — PATCH /files/{id} with a JSON body
// containing a non-empty fileName returns 200 and the new name.
func TestRenameFile_UpdatesName(t *testing.T) {
	srv, files := withFiles(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"max@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	var u User
	mustDecode(t, signup.Body, &u)
	files.seed(u.ID, FileSummary{DocID: "rename01", FileName: "old.docx"}, []byte("X"))

	resp := srv.patch("/files/rename01", `{"fileName":"new.docx"}`, cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if files.byUser[u.ID]["rename01"].summary.FileName != "new.docx" {
		t.Errorf("rename didn't update fake store")
	}
}

// TestRenameFile_RejectsEmpty — empty fileName -> 400.
func TestRenameFile_RejectsEmpty(t *testing.T) {
	srv, files := withFiles(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"nora@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	var u User
	mustDecode(t, signup.Body, &u)
	files.seed(u.ID, FileSummary{DocID: "rename02", FileName: "old.docx"}, []byte("X"))

	resp := srv.patch("/files/rename02", `{"fileName":"   "}`, cookie)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

// TestDeleteFile_Removes — DELETE /files/{id} returns 204 and the
// doc disappears from the user's list.
func TestDeleteFile_Removes(t *testing.T) {
	srv, files := withFiles(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"olive@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	var u User
	mustDecode(t, signup.Body, &u)
	files.seed(u.ID, FileSummary{DocID: "delete01", FileName: "trash.docx"}, []byte("X"))

	resp := srv.delete("/files/delete01", cookie)
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d, want 204", resp.StatusCode)
	}
	if _, still := files.byUser[u.ID]["delete01"]; still {
		t.Errorf("doc not removed from fake store")
	}
}

// TestDeleteFile_IdempotentOnMissing — deleting a non-existent doc
// still returns 204 so the client can fire-and-forget.
func TestDeleteFile_IdempotentOnMissing(t *testing.T) {
	srv, _ := withFiles(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"pat@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	resp := srv.delete("/files/nothing0", cookie)
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d, want 204", resp.StatusCode)
	}
}

// errNotFoundFromHost is a regression check that the file routes
// faithfully propagate host.ErrNotFound from the FileStore into a
// 404 response. Uses a custom store that always errors so we don't
// depend on the fake's lookup behaviour.
func TestDownloadFile_HostNotFoundIs404(t *testing.T) {
	srv, _ := withFiles(t)
	defer srv.close()

	srv.h.Files = errStore{}
	srv.mux = http.NewServeMux()
	srv.h.Routes(srv.mux)
	srv.srv.Config.Handler = srv.mux

	signup := srv.post("/auth/signup", `{"email":"quinn@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)
	resp := srv.get("/files/anything1", cookie)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

// errStore is a FileStore whose read methods always return
// host.ErrNotFound. Used to verify the route layer's error mapping
// independently of the fake's bookkeeping.
type errStore struct{}

func (errStore) ListFor(string) ([]FileSummary, error) { return nil, nil }
func (errStore) StoreFor(string, string, []byte) (FileSummary, error) {
	return FileSummary{}, errors.New("not used")
}
func (errStore) FetchFor(context.Context, string, string) (FileSummary, []byte, error) {
	return FileSummary{}, nil, host.ErrNotFound
}
func (errStore) SaveFor(context.Context, string, string, []byte) (FileSummary, error) {
	return FileSummary{}, host.ErrNotFound
}
func (errStore) RenameFor(string, string, string) error { return host.ErrNotFound }
func (errStore) DeleteFor(string, string) error        { return nil }

// ---------------------------------------------------------------
// GET / PUT /auth/profile
// ---------------------------------------------------------------

// withProfile sets up a test server with both Files and Profiles
// wired. The Profiles store is in-memory so tests don't fight a tmp
// dir; the production store goes through FileProfileStore.
func withProfile(t *testing.T) *testServer {
	t.Helper()
	srv := newTestServer(t)
	srv.srv.Close()
	srv.h.Profiles = newFakeProfiles()
	srv.mux = http.NewServeMux()
	srv.h.Routes(srv.mux)
	srv.srv = httptest.NewServer(srv.mux)
	return srv
}

// fakeProfiles is an in-memory ProfileStore. Mirrors the FS-backed
// one's "missing returns zero" contract.
type fakeProfiles struct {
	byUser map[string]Profile
}

func newFakeProfiles() *fakeProfiles { return &fakeProfiles{byUser: map[string]Profile{}} }

func (f *fakeProfiles) Read(userID string) (Profile, error) { return f.byUser[userID], nil }

func (f *fakeProfiles) Write(userID string, p Profile) error {
	f.byUser[userID] = p
	return nil
}

// TestProfile_GetReturnsDefaultsWhenUnwritten — a never-written
// profile yields the merged view with identity fields populated and
// the extended fields empty (omitted from JSON via omitempty).
func TestProfile_GetReturnsDefaultsWhenUnwritten(t *testing.T) {
	srv := withProfile(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"rita@example.com","password":"passw0rd!","displayName":"Rita"}`)
	cookie := extractSessionCookie(t, signup)

	resp := srv.get("/auth/profile", cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var got map[string]any
	mustDecode(t, resp.Body, &got)
	if got["email"] != "rita@example.com" {
		t.Errorf("email = %v", got["email"])
	}
	if got["displayName"] != "Rita" {
		t.Errorf("displayName = %v", got["displayName"])
	}
	if _, set := got["timezone"]; set {
		t.Error("timezone should be omitted when unset")
	}
}

// TestProfile_PutWritesExtendedFields — PUT with a patch lands the
// fields in the store and the response reflects them.
func TestProfile_PutWritesExtendedFields(t *testing.T) {
	srv := withProfile(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"sam@example.com","password":"passw0rd!","displayName":"Sam"}`)
	cookie := extractSessionCookie(t, signup)
	var u User
	mustDecode(t, signup.Body, &u)

	body := `{"timezone":"America/Los_Angeles","locale":"en-US","prefs":{"showRulers":true}}`
	resp := srv.put("/auth/profile", body, cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var view map[string]any
	mustDecode(t, resp.Body, &view)
	if view["timezone"] != "America/Los_Angeles" {
		t.Errorf("timezone = %v", view["timezone"])
	}
	if view["locale"] != "en-US" {
		t.Errorf("locale = %v", view["locale"])
	}

	// Sanity: the underlying store has the values.
	got := srv.h.Profiles.(*fakeProfiles).byUser[u.ID]
	if got.Timezone != "America/Los_Angeles" {
		t.Errorf("store timezone = %q", got.Timezone)
	}
	if got.Prefs["showRulers"] != true {
		t.Errorf("store prefs = %v", got.Prefs)
	}
}

// TestProfile_PutDisplayNameUpdatesSqlite — DisplayName piggybacks
// the PUT but routes to UserStore.UpdateDisplayName so /auth/me
// reflects it.
func TestProfile_PutDisplayNameUpdatesSqlite(t *testing.T) {
	srv := withProfile(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"tina@example.com","password":"passw0rd!","displayName":"Tina"}`)
	cookie := extractSessionCookie(t, signup)

	resp := srv.put("/auth/profile", `{"displayName":"Tina Tomato"}`, cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var view map[string]any
	mustDecode(t, resp.Body, &view)
	if view["displayName"] != "Tina Tomato" {
		t.Errorf("view displayName = %v", view["displayName"])
	}

	// /auth/me sees the same change.
	me := srv.get("/auth/me", cookie)
	var u User
	mustDecode(t, me.Body, &u)
	if u.DisplayName != "Tina Tomato" {
		t.Errorf("me displayName = %q", u.DisplayName)
	}
}

// TestProfile_PutRejectsEmptyDisplayName — whitespace-only display
// name is 400, not 200. Mirrors UserStore.UpdateDisplayName.
func TestProfile_PutRejectsEmptyDisplayName(t *testing.T) {
	srv := withProfile(t)
	defer srv.close()
	signup := srv.post("/auth/signup", `{"email":"ulysses@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)

	resp := srv.put("/auth/profile", `{"displayName":"   "}`, cookie)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
	if body := readErrorBody(t, resp); body.Code != "display_name" {
		t.Errorf("code = %q, want display_name", body.Code)
	}
}

// TestProfile_RequiresSession — both routes reject anonymous calls.
func TestProfile_RequiresSession(t *testing.T) {
	srv := withProfile(t)
	defer srv.close()
	for _, path := range []string{"/auth/profile"} {
		resp := srv.get(path, "")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("GET %s status = %d, want 401", path, resp.StatusCode)
		}
		resp = srv.put(path, `{}`, "")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("PUT %s status = %d, want 401", path, resp.StatusCode)
		}
	}
}

// TestProfile_NilStoreOmitsRoutes — with Profiles nil, both routes
// 404 from the mux.
func TestProfile_NilStoreOmitsRoutes(t *testing.T) {
	srv := newTestServer(t)
	defer srv.close()
	if resp := srv.get("/auth/profile", ""); resp.StatusCode != http.StatusNotFound {
		t.Errorf("GET = %d, want 404 when Profiles store unwired", resp.StatusCode)
	}
}

// ---------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------

type testServer struct {
	t   *testing.T
	mux *http.ServeMux
	srv *httptest.Server
	h   *Handlers
}

func newTestServer(t *testing.T) *testServer {
	t.Helper()
	users, err := NewWithOptions(t.TempDir(), 4) // bcrypt cost 4 for speed
	if err != nil {
		t.Fatal(err)
	}
	sess, err := NewSession([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatal(err)
	}
	h := &Handlers{Users: users, Session: sess, Secure: false}
	mux := http.NewServeMux()
	h.Routes(mux)
	srv := httptest.NewServer(mux)
	return &testServer{t: t, mux: mux, srv: srv, h: h}
}

func (s *testServer) close() {
	s.srv.Close()
	_ = s.h.Users.Close()
}

func (s *testServer) post(path, body string) *http.Response {
	s.t.Helper()
	req, err := http.NewRequest("POST", s.srv.URL+path, bytes.NewBufferString(body))
	if err != nil {
		s.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	return resp
}

func (s *testServer) postRaw(path, contentType string, body []byte, cookie string, headers map[string]string) *http.Response {
	s.t.Helper()
	req, err := http.NewRequest("POST", s.srv.URL+path, bytes.NewReader(body))
	if err != nil {
		s.t.Fatal(err)
	}
	req.Header.Set("Content-Type", contentType)
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	return resp
}

func (s *testServer) put(path, body, cookie string) *http.Response {
	s.t.Helper()
	req, err := http.NewRequest("PUT", s.srv.URL+path, bytes.NewBufferString(body))
	if err != nil {
		s.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	return resp
}

func (s *testServer) patch(path, body, cookie string) *http.Response {
	s.t.Helper()
	req, err := http.NewRequest("PATCH", s.srv.URL+path, bytes.NewBufferString(body))
	if err != nil {
		s.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	return resp
}

func (s *testServer) delete(path, cookie string) *http.Response {
	s.t.Helper()
	req, err := http.NewRequest("DELETE", s.srv.URL+path, nil)
	if err != nil {
		s.t.Fatal(err)
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	return resp
}

func (s *testServer) get(path, cookie string) *http.Response {
	s.t.Helper()
	req, err := http.NewRequest("GET", s.srv.URL+path, nil)
	if err != nil {
		s.t.Fatal(err)
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	return resp
}

func (s *testServer) hasSessionCookie(resp *http.Response) bool {
	for _, c := range resp.Cookies() {
		if (c.Name == SessionCookieName || strings.HasPrefix(c.Name, "__Host-")) && c.Value != "" {
			return true
		}
	}
	return false
}

func mustDecode(t *testing.T, body io.Reader, dst any) {
	t.Helper()
	if err := json.NewDecoder(body).Decode(dst); err != nil {
		t.Fatalf("decode: %v", err)
	}
}

func readErrorBody(t *testing.T, resp *http.Response) errorResp {
	t.Helper()
	var e errorResp
	if err := json.NewDecoder(resp.Body).Decode(&e); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	return e
}

func extractSessionCookie(t *testing.T, resp *http.Response) string {
	t.Helper()
	for _, c := range resp.Cookies() {
		if c.Name == SessionCookieName {
			return c.Name + "=" + c.Value
		}
	}
	t.Fatal("session cookie missing on response")
	return ""
}
