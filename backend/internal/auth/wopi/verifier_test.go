// Copyright (c) 2026 Casual Office. All rights reserved.

package wopi

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// jwksFixture spins up an in-process JWKS server backed by a fresh
// RSA key. Tests can sign a token with this key and feed it through
// the verifier without any external dependency.
type jwksFixture struct {
	srv   *httptest.Server
	key   *rsa.PrivateKey
	kid   string
	hits  atomic.Int64 // number of JWKS GETs the server has served
	delay time.Duration
}

func newJWKSFixture(t *testing.T) *jwksFixture {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	f := &jwksFixture{key: key, kid: "test-key-1"}
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/jwks.json", func(w http.ResponseWriter, _ *http.Request) {
		f.hits.Add(1)
		if f.delay > 0 {
			time.Sleep(f.delay)
		}
		nB := base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes())
		eB := base64.RawURLEncoding.EncodeToString([]byte{0x01, 0x00, 0x01}) // 65537
		body := map[string]any{
			"keys": []map[string]any{
				{"kty": "RSA", "kid": f.kid, "n": nB, "e": eB, "alg": "RS256", "use": "sig"},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(body)
	})
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	return f
}

func (f *jwksFixture) url() string { return f.srv.URL + "/.well-known/jwks.json" }

// signToken produces an RS256 token signed by the fixture's key with
// the claims map provided. Tests typically include exp + iat + a
// few custom fields.
func (f *jwksFixture) signToken(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = f.kid
	signed, err := tok.SignedString(f.key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

// TestVerify_HappyPath — JWT signed with the host's key + a future
// exp parses cleanly; claims surface.
func TestVerify_HappyPath(t *testing.T) {
	f := newJWKSFixture(t)
	v, err := NewVerifier(Options{JWKSURL: f.url()})
	if err != nil {
		t.Fatal(err)
	}
	tok := f.signToken(t, jwt.MapClaims{
		"sub": "user_42",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	claims, err := v.Verify(context.Background(), tok)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if claims["sub"] != "user_42" {
		t.Errorf("sub = %v, want user_42", claims["sub"])
	}
}

// TestVerify_Expired — exp in the past → ErrTokenExpired (distinct
// from "invalid" so callers can prompt re-auth).
func TestVerify_Expired(t *testing.T) {
	f := newJWKSFixture(t)
	v, _ := NewVerifier(Options{JWKSURL: f.url()})
	tok := f.signToken(t, jwt.MapClaims{
		"sub": "u",
		"exp": time.Now().Add(-time.Minute).Unix(),
	})
	if _, err := v.Verify(context.Background(), tok); !errors.Is(err, ErrTokenExpired) {
		t.Errorf("got %v, want ErrTokenExpired", err)
	}
}

// TestVerify_BadSignature — token signed by a DIFFERENT key is
// rejected with ErrTokenInvalid even though the kid matches.
func TestVerify_BadSignature(t *testing.T) {
	f := newJWKSFixture(t)
	v, _ := NewVerifier(Options{JWKSURL: f.url()})
	imposter, _ := rsa.GenerateKey(rand.Reader, 2048)
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	tok.Header["kid"] = f.kid
	signed, _ := tok.SignedString(imposter)
	if _, err := v.Verify(context.Background(), signed); !errors.Is(err, ErrTokenInvalid) {
		t.Errorf("got %v, want ErrTokenInvalid", err)
	}
}

// TestVerify_RejectsHSAlg — a token claiming HS256 is rejected
// without ever attempting verification. The "alg confusion" attack:
// if we allowed HS256, an attacker could sign tokens with the host's
// public key as the HMAC secret and pass verification. We allow
// asymmetric algs only.
func TestVerify_RejectsHSAlg(t *testing.T) {
	f := newJWKSFixture(t)
	v, _ := NewVerifier(Options{JWKSURL: f.url()})
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	tok.Header["kid"] = f.kid
	signed, _ := tok.SignedString([]byte("anything"))
	if _, err := v.Verify(context.Background(), signed); !errors.Is(err, ErrTokenInvalid) {
		t.Errorf("got %v, want ErrTokenInvalid", err)
	}
}

// TestVerify_MissingExpRequired — tokens without an exp claim are
// rejected. The verifier sets ExpirationRequired so a host can't
// hand out a non-expiring token (intentionally or otherwise).
func TestVerify_MissingExpRequired(t *testing.T) {
	f := newJWKSFixture(t)
	v, _ := NewVerifier(Options{JWKSURL: f.url()})
	tok := f.signToken(t, jwt.MapClaims{"sub": "u"})
	if _, err := v.Verify(context.Background(), tok); !errors.Is(err, ErrTokenInvalid) {
		t.Errorf("got %v, want ErrTokenInvalid (no exp)", err)
	}
}

// TestVerify_UnknownKidRefreshes — a token signed with a kid not in
// the cache triggers a JWKS refetch. Lets the host rotate keys
// without restarting the gateway.
func TestVerify_UnknownKidRefreshes(t *testing.T) {
	f := newJWKSFixture(t)
	v, _ := NewVerifier(Options{JWKSURL: f.url(), CacheTTL: time.Hour})
	// First call warms the cache with kid "test-key-1".
	tok1 := f.signToken(t, jwt.MapClaims{
		"sub": "u",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	if _, err := v.Verify(context.Background(), tok1); err != nil {
		t.Fatal(err)
	}
	hitsBefore := f.hits.Load()
	// Sign a token with an UNKNOWN kid — verifier should refetch.
	tok2 := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	tok2.Header["kid"] = "different-key"
	signed, _ := tok2.SignedString(f.key)
	_, _ = v.Verify(context.Background(), signed) // expected: kid not in JWKS
	hitsAfter := f.hits.Load()
	if hitsAfter <= hitsBefore {
		t.Errorf("expected JWKS refetch on unknown kid; hits %d → %d", hitsBefore, hitsAfter)
	}
}

// TestVerify_CachesJWKS — back-to-back calls hit the JWKS server
// at most once within the TTL window.
func TestVerify_CachesJWKS(t *testing.T) {
	f := newJWKSFixture(t)
	v, _ := NewVerifier(Options{JWKSURL: f.url(), CacheTTL: time.Hour})
	exp := time.Now().Add(time.Hour).Unix()
	for i := 0; i < 5; i++ {
		tok := f.signToken(t, jwt.MapClaims{"sub": "u", "exp": exp})
		if _, err := v.Verify(context.Background(), tok); err != nil {
			t.Fatal(err)
		}
	}
	if hits := f.hits.Load(); hits > 1 {
		t.Errorf("hits = %d, want 1 (cached)", hits)
	}
}

// TestVerify_JWKSUnreachable — when the JWKS server is down AND the
// cache is empty, surface ErrJWKSUnreachable. Operators see this in
// logs + the gateway returns 502.
func TestVerify_JWKSUnreachable(t *testing.T) {
	// Sign a valid-looking token so jwt.Parse reaches the keyfunc
	// callback that triggers the JWKS fetch. Without this, Parse
	// rejects the token as malformed before we ever try to refresh.
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	tok.Header["kid"] = "rotated"
	signed, _ := tok.SignedString(key)

	v, _ := NewVerifier(Options{
		JWKSURL: "http://127.0.0.1:1/jwks.json",
		// Short HTTP timeout so the test doesn't sit on the default
		// 10s waiting for connect-refused → eventual fail.
		HTTPClient: &http.Client{Timeout: 500 * time.Millisecond},
	})
	if _, err := v.Verify(context.Background(), signed); !errors.Is(err, ErrJWKSUnreachable) {
		t.Errorf("got %v, want ErrJWKSUnreachable", err)
	}
}

// TestVerify_TokenMissingKid — token without a kid header is
// rejected without an outbound JWKS hit.
func TestVerify_TokenMissingKid(t *testing.T) {
	f := newJWKSFixture(t)
	v, _ := NewVerifier(Options{JWKSURL: f.url()})
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	// Deliberately no kid header.
	signed, _ := tok.SignedString(f.key)
	if _, err := v.Verify(context.Background(), signed); !errors.Is(err, ErrTokenInvalid) {
		t.Errorf("got %v, want ErrTokenInvalid", err)
	}
}

// TestNewVerifier_RequiresJWKSURL — empty URL surfaces at construction.
func TestNewVerifier_RequiresJWKSURL(t *testing.T) {
	if _, err := NewVerifier(Options{}); err == nil {
		t.Error("NewVerifier(empty) returned no error")
	}
}
