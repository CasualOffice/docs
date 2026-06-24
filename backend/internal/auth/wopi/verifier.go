// Package wopi parses + verifies the JWT access_token a WOPI host
// hands the user when they click "Open in editor". The verifier
// fetches the host's published JWKS, caches it for 5 min (matching
// WOPI proof-key cache conventions), and validates a token's
// signature + expiry against it.
//
// What this package does NOT do:
//   - Claim-set policy. The verifier returns the parsed claims so the
//     caller decides whether `aud`, `iss`, `scp`, etc. match its
//     expectations. Each WOPI host has its own claim conventions and
//     baking one set in here would mis-fit the others.
//   - WOPI proof-key signature on request headers. That's the
//     companion authentication scheme WOPI hosts use to verify
//     editor → host requests; it lives in host/wopi (the outbound
//     client side), not here.
package wopi

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// DefaultCacheTTL is how long the JWKS document is cached before a
// refresh fetch. 5 min matches the WOPI proof-key TTL convention so
// operators don't need to think about two cache windows. Tests
// override via NewVerifier.
const DefaultCacheTTL = 5 * time.Minute

// Verifier parses + validates WOPI access tokens against a remote
// JWKS endpoint. Safe for concurrent use — the cache + the http
// client are both sharable.
type Verifier struct {
	jwksURL    string
	httpClient *http.Client
	ttl        time.Duration

	mu          sync.RWMutex
	cached      map[string]any // kid → *rsa.PublicKey | *ecdsa.PublicKey
	cachedUntil time.Time
}

// Options tunes the verifier. JWKSURL is required; the rest have
// sensible defaults so the zero value Options{JWKSURL: ...} works.
type Options struct {
	// JWKSURL is the host's published JWKS endpoint. Required.
	JWKSURL string
	// HTTPClient is used for outbound JWKS fetches. Defaults to a
	// 10-second-timeout client so a hanging host can't tie up the
	// gateway forever.
	HTTPClient *http.Client
	// CacheTTL overrides DefaultCacheTTL. Useful for tests; in
	// production stick with the default.
	CacheTTL time.Duration
}

// NewVerifier returns a verifier bound to a JWKS URL. Returns an
// error if the URL is empty — caller misconfiguration we'd rather
// catch at startup than on the first request.
func NewVerifier(opts Options) (*Verifier, error) {
	if opts.JWKSURL == "" {
		return nil, errors.New("wopi: JWKSURL required")
	}
	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	ttl := opts.CacheTTL
	if ttl <= 0 {
		ttl = DefaultCacheTTL
	}
	return &Verifier{
		jwksURL:    opts.JWKSURL,
		httpClient: client,
		ttl:        ttl,
		cached:     make(map[string]any),
	}, nil
}

// Verify parses + validates a token string and returns its claims on
// success. Errors collapse to a small set so callers can branch
// without depending on jwt-lib internals:
//
//	ErrTokenInvalid  — bad signature, malformed, wrong alg, no kid
//	ErrTokenExpired  — exp claim in the past
//	ErrJWKSUnreachable — JWKS fetch failed and cache is empty
//
// Anything else (e.g. unsupported key type) wraps a descriptive
// error so the operator's logs are useful.
func (v *Verifier) Verify(ctx context.Context, tokenStr string) (jwt.MapClaims, error) {
	parser := jwt.NewParser(
		// We accept the standard asymmetric algorithms a WOPI host
		// might use. HS* (symmetric) is rejected — we never share
		// the secret with a remote host, so a token claiming HS256
		// is a forged-token attack ("alg confusion").
		jwt.WithValidMethods([]string{"RS256", "RS384", "RS512", "ES256", "ES384", "ES512"}),
		jwt.WithExpirationRequired(),
	)
	tok, err := parser.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, fmt.Errorf("wopi: token missing kid header")
		}
		return v.keyFor(ctx, kid)
	})
	if err != nil {
		switch {
		case errors.Is(err, jwt.ErrTokenExpired):
			return nil, ErrTokenExpired
		case errors.Is(err, errJWKSUnreachable):
			return nil, ErrJWKSUnreachable
		default:
			return nil, fmt.Errorf("%w: %v", ErrTokenInvalid, err)
		}
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("%w: unexpected claims type", ErrTokenInvalid)
	}
	return claims, nil
}

// keyFor returns the public key for kid, refreshing the JWKS cache
// when it's expired or doesn't contain the requested kid. The
// "doesn't contain kid" path lets a host rotate keys without forcing
// a server restart — a token signed with a new kid triggers an
// out-of-band refresh.
func (v *Verifier) keyFor(ctx context.Context, kid string) (any, error) {
	now := time.Now()
	v.mu.RLock()
	key, ok := v.cached[kid]
	expired := now.After(v.cachedUntil)
	v.mu.RUnlock()
	if ok && !expired {
		return key, nil
	}
	// Force a refresh when the kid is unknown even if the TTL window
	// hasn't passed — handles host key rotation mid-cache.
	if err := v.refresh(ctx, !ok); err != nil {
		return nil, err
	}
	v.mu.RLock()
	key, ok = v.cached[kid]
	v.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("%w: unknown kid %q", ErrTokenInvalid, kid)
	}
	return key, nil
}

// refresh fetches + parses the JWKS, replacing the cache. Called
// under the verifier's mutex; concurrent refreshes are squashed so
// only one outbound fetch fires at a time even under load.
// `force` skips the "cache still valid" short-circuit — used when
// the caller knows the cache is missing a key it needs (kid
// rotation).
func (v *Verifier) refresh(ctx context.Context, force bool) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	// Re-check under the write lock — another goroutine may have
	// refreshed while we were waiting. Skip the short-circuit when
	// force is set (kid rotation path).
	if !force && time.Now().Before(v.cachedUntil) && len(v.cached) > 0 {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return fmt.Errorf("wopi: build jwks request: %w", err)
	}
	resp, err := v.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", errJWKSUnreachable, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: status %d", errJWKSUnreachable, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("%w: read body: %v", errJWKSUnreachable, err)
	}
	keys, err := parseJWKS(body)
	if err != nil {
		return fmt.Errorf("wopi: parse jwks: %w", err)
	}
	v.cached = keys
	v.cachedUntil = time.Now().Add(v.ttl)
	return nil
}

// parseJWKS decodes a JWKS document into a kid → public key map.
// Supports RSA (`kty: RSA`) and EC P-256/P-384/P-521 (`kty: EC`).
// Keys with missing kid or unsupported kty are skipped with a
// descriptive error rather than silently dropped — a misconfigured
// host should be obvious in logs.
func parseJWKS(raw []byte) (map[string]any, error) {
	var doc struct {
		Keys []struct {
			Kty string `json:"kty"`
			Kid string `json:"kid"`
			// RSA
			N string `json:"n"`
			E string `json:"e"`
			// EC
			Crv string `json:"crv"`
			X   string `json:"x"`
			Y   string `json:"y"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("decode jwks: %w", err)
	}
	out := make(map[string]any, len(doc.Keys))
	for i, k := range doc.Keys {
		if k.Kid == "" {
			return nil, fmt.Errorf("jwks key #%d missing kid", i)
		}
		switch k.Kty {
		case "RSA":
			pub, err := rsaFromJWK(k.N, k.E)
			if err != nil {
				return nil, fmt.Errorf("jwks key %q: %w", k.Kid, err)
			}
			out[k.Kid] = pub
		case "EC":
			pub, err := ecdsaFromJWK(k.Crv, k.X, k.Y)
			if err != nil {
				return nil, fmt.Errorf("jwks key %q: %w", k.Kid, err)
			}
			out[k.Kid] = pub
		default:
			return nil, fmt.Errorf("jwks key %q: unsupported kty %q", k.Kid, k.Kty)
		}
	}
	return out, nil
}

func rsaFromJWK(nB64, eB64 string) (*rsa.PublicKey, error) {
	n, err := base64.RawURLEncoding.DecodeString(nB64)
	if err != nil {
		return nil, fmt.Errorf("decode n: %w", err)
	}
	e, err := base64.RawURLEncoding.DecodeString(eB64)
	if err != nil {
		return nil, fmt.Errorf("decode e: %w", err)
	}
	// e is a big-endian unsigned int; pack it.
	var eInt int
	for _, b := range e {
		eInt = eInt<<8 | int(b)
	}
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(n),
		E: eInt,
	}, nil
}

func ecdsaFromJWK(crv, xB64, yB64 string) (*ecdsa.PublicKey, error) {
	var curve elliptic.Curve
	switch crv {
	case "P-256":
		curve = elliptic.P256()
	case "P-384":
		curve = elliptic.P384()
	case "P-521":
		curve = elliptic.P521()
	default:
		return nil, fmt.Errorf("unsupported curve %q", crv)
	}
	x, err := base64.RawURLEncoding.DecodeString(xB64)
	if err != nil {
		return nil, fmt.Errorf("decode x: %w", err)
	}
	y, err := base64.RawURLEncoding.DecodeString(yB64)
	if err != nil {
		return nil, fmt.Errorf("decode y: %w", err)
	}
	return &ecdsa.PublicKey{
		Curve: curve,
		X:     new(big.Int).SetBytes(x),
		Y:     new(big.Int).SetBytes(y),
	}, nil
}

// Sentinel errors. Internal callers branch on these; external
// callers can wrap them with their own status mapping (the
// gateway's WS close codes, for instance).
var (
	// ErrTokenInvalid — signature bad, malformed token, unknown kid,
	// or any other "this token isn't trustworthy" failure.
	ErrTokenInvalid = errors.New("wopi: token invalid")
	// ErrTokenExpired — exp claim is in the past. Distinguished from
	// ErrTokenInvalid so the caller can prompt a re-auth.
	ErrTokenExpired = errors.New("wopi: token expired")
	// ErrJWKSUnreachable — JWKS fetch failed and the verifier has no
	// cached keys to fall back on. Operator's problem (firewall,
	// host outage); the gateway should surface a 502 / 503.
	ErrJWKSUnreachable = errors.New("wopi: jwks unreachable")
	// errJWKSUnreachable is the internal sentinel the refresh path
	// wraps; the public ErrJWKSUnreachable is what callers match on.
	errJWKSUnreachable = ErrJWKSUnreachable
)
