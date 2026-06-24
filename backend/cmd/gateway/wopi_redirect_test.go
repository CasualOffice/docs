package main

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	wopiauth "github.com/schnsrw/docx/backend/internal/auth/wopi"
)

// wopiJWKSFixture spins up an httptest JWKS endpoint backed by a
// fresh RSA key. Tests can sign tokens with this key and feed them
// through the redirect handler without mocking the verifier itself.
type wopiJWKSFixture struct {
	srv *httptest.Server
	key *rsa.PrivateKey
	kid string
}

func newWopiJWKSFixture(t *testing.T) *wopiJWKSFixture {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	f := &wopiJWKSFixture{key: key, kid: "redirect-key-1"}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		nB := base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes())
		eB := base64.RawURLEncoding.EncodeToString([]byte{0x01, 0x00, 0x01}) // 65537
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]any{
				{"kty": "RSA", "kid": f.kid, "n": nB, "e": eB, "alg": "RS256", "use": "sig"},
			},
		})
	}))
	t.Cleanup(srv.Close)
	f.srv = srv
	return f
}

func (f *wopiJWKSFixture) jwksURL() string { return f.srv.URL }

func (f *wopiJWKSFixture) signToken(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = f.kid
	signed, err := tok.SignedString(f.key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

// callRedirect issues a GET to the handler under test and captures
// the response without following the redirect (so we can assert the
// Location header).
func callRedirect(t *testing.T, h http.Handler, query map[string]string) *http.Response {
	t.Helper()
	q := url.Values{}
	for k, v := range query {
		q.Set(k, v)
	}
	req := httptest.NewRequest(http.MethodGet, "/wopi/host?"+q.Encode(), nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Result()
}

// TestWopiRedirect_HappyPath — valid token + wopiSrc → 303 to
// /doc/{docID}?access_token=...
func TestWopiRedirect_HappyPath(t *testing.T) {
	f := newWopiJWKSFixture(t)
	v, err := wopiauth.NewVerifier(wopiauth.Options{JWKSURL: f.jwksURL()})
	if err != nil {
		t.Fatal(err)
	}
	tok := f.signToken(t, jwt.MapClaims{
		"sub": "user_42",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	resp := callRedirect(t, wopiRedirectHandler(v), map[string]string{
		"wopiSrc":      "https://host.example/wopi/files/abc",
		"access_token": tok,
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("status = %d, want 303", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if !strings.HasPrefix(loc, "/doc/") {
		t.Errorf("Location = %q, want /doc/...", loc)
	}
	// Token must be re-attached to the redirect target so the WS
	// connect carries it through to integration.Fetch.
	u, _ := url.Parse(loc)
	if u.Query().Get("access_token") != tok {
		t.Errorf("redirect missing or different access_token")
	}
}

// TestWopiRedirect_BadToken — expired / unsigned tokens surface as
// 401 with bad_token code. The verifier's distinctions (expired vs
// invalid sig) collapse to "go re-auth" from the browser's POV.
func TestWopiRedirect_BadToken(t *testing.T) {
	f := newWopiJWKSFixture(t)
	v, _ := wopiauth.NewVerifier(wopiauth.Options{JWKSURL: f.jwksURL()})
	// Expired token.
	tok := f.signToken(t, jwt.MapClaims{
		"sub": "u",
		"exp": time.Now().Add(-time.Minute).Unix(),
	})
	resp := callRedirect(t, wopiRedirectHandler(v), map[string]string{
		"wopiSrc":      "https://host.example/wopi/files/abc",
		"access_token": tok,
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestWopiRedirect_MissingParam — wopiSrc or access_token missing →
// 400 with missing_param.
func TestWopiRedirect_MissingParam(t *testing.T) {
	f := newWopiJWKSFixture(t)
	v, _ := wopiauth.NewVerifier(wopiauth.Options{JWKSURL: f.jwksURL()})
	for _, tc := range []struct {
		name  string
		query map[string]string
	}{
		{"no token", map[string]string{"wopiSrc": "https://h.example/wopi/files/x"}},
		{"no wopiSrc", map[string]string{"access_token": "anything"}},
		{"both empty", map[string]string{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := callRedirect(t, wopiRedirectHandler(v), tc.query)
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", resp.StatusCode)
			}
		})
	}
}

// TestWopiRedirect_RejectsNonHTTPWopiSrc — a wopiSrc that decodes to
// a non-http(s) scheme is rejected before any JWT roundtrip. Defends
// against file://, unix:, etc.
func TestWopiRedirect_RejectsNonHTTPWopiSrc(t *testing.T) {
	f := newWopiJWKSFixture(t)
	v, _ := wopiauth.NewVerifier(wopiauth.Options{JWKSURL: f.jwksURL()})
	tok := f.signToken(t, jwt.MapClaims{
		"sub": "u",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	resp := callRedirect(t, wopiRedirectHandler(v), map[string]string{
		"wopiSrc":      "file:///etc/passwd",
		"access_token": tok,
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

// TestFormatWopiRedirectTarget — pure-function check that the URL
// builder produces a parseable, query-correct target.
func TestFormatWopiRedirectTarget(t *testing.T) {
	got := formatWopiRedirectTarget("https://h.example/wopi/files/foo", "tok-xyz")
	u, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(u.Path, "/doc/") {
		t.Errorf("path = %q", u.Path)
	}
	if u.Query().Get("access_token") != "tok-xyz" {
		t.Errorf("token round-trip failed: %q", u.RawQuery)
	}
}
