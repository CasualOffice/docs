package personal

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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

// fakeFiles is an in-memory FileLister for the /files tests.
type fakeFiles struct {
	byUser map[string][]FileSummary
}

func (f *fakeFiles) ListFor(userID string) ([]FileSummary, error) {
	return f.byUser[userID], nil
}

// TestFiles_RequiresSession — without a cookie, /files returns 401.
func TestFiles_RequiresSession(t *testing.T) {
	srv := newTestServer(t)
	srv.h.Files = &fakeFiles{}
	srv.mux = http.NewServeMux()
	srv.h.Routes(srv.mux)
	srv.srv = httptest.NewServer(srv.mux)
	defer srv.close()

	resp := srv.get("/files", "")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestFiles_ReturnsUserScopedList — after signup + login, /files
// returns the file list scoped to the authenticated user.
func TestFiles_ReturnsUserScopedList(t *testing.T) {
	srv := newTestServer(t)
	// Wire the fake source AFTER signup so the user exists first.
	srv.h.Files = &fakeFiles{byUser: map[string][]FileSummary{}}
	srv.mux = http.NewServeMux()
	srv.h.Routes(srv.mux)
	srv.srv = httptest.NewServer(srv.mux)
	defer srv.close()

	signup := srv.post("/auth/signup", `{"email":"hank@example.com","password":"passw0rd!"}`)
	cookie := extractSessionCookie(t, signup)

	// Parse the user id out of the signup response so we can seed
	// the fake lister for THAT id.
	var u User
	mustDecode(t, signup.Body, &u)
	srv.h.Files = &fakeFiles{
		byUser: map[string][]FileSummary{
			u.ID: {{DocID: "abc", FileName: "report.docx", Version: 1, SavedAt: "2026-01-01T00:00:00Z", Size: 42}},
		},
	}
	// Re-mount /files so the new lister is picked up.
	srv.mux = http.NewServeMux()
	srv.h.Routes(srv.mux)
	srv.srv.Config.Handler = srv.mux

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
