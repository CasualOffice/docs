// /wopi/host — the embed entry point for WOPI deploys (Mode 2).
//
// Wire shape:
//
//	GET /wopi/host?wopiSrc=<host file URL>&access_token=<JWT>
//	  ↓ verify JWT against the host's JWKS
//	  ↓ encode wopiSrc → docID
//	  303 redirect → /doc/{docID}?access_token=<JWT>
//
// The redirect lands the user at the editor SPA which then opens the
// WebSocket join. The access_token rides along as a query param so the
// gateway can thread it through to host.Integration.Fetch / Snapshot.
//
// Why query param and not cookie:
//
//   - WOPI's reference clients pass the token in the URL anyway; this
//     matches the convention every host is built against.
//   - A cookie would need to be scoped per-doc to support a user
//     editing two WOPI-hosted docs in two tabs simultaneously, which
//     becomes a per-doc cookie map and a separate complexity sink.
//
// Tradeoffs we accept:
//
//   - The token is visible in browser history and may land in
//     server access logs. WOPI tokens are short-lived (10 min - 1h
//     typical) so the blast radius is bounded, but operators should
//     scrub access_token from access logs (the AccessLog middleware
//     already does — it only logs the path, not the raw query).
package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	authwopi "github.com/schnsrw/docx/backend/internal/auth/wopi"
	"github.com/schnsrw/docx/backend/internal/host/wopi"
)

// wopiRedirectHandler returns the GET /wopi/host handler. verifier
// is required — Mode 2 without JWT verification would let any
// browser navigate to /wopi/host with a fabricated wopiSrc and
// pull arbitrary bytes from the gateway's outbound network.
func wopiRedirectHandler(verifier *authwopi.Verifier) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		wopiSrc := q.Get("wopiSrc")
		token := q.Get("access_token")
		if wopiSrc == "" || token == "" {
			writeJSONError(w, http.StatusBadRequest, "missing_param",
				"wopiSrc and access_token are required")
			return
		}
		// Defence-in-depth: reject anything that isn't an http(s)
		// URL before we even verify the JWT. The host.wopi DocStore
		// gates on this too, but failing fast here keeps the JWKS
		// roundtrip off the malformed-input path.
		if !strings.HasPrefix(wopiSrc, "http://") && !strings.HasPrefix(wopiSrc, "https://") {
			writeJSONError(w, http.StatusBadRequest, "bad_wopi_src",
				"wopiSrc must be an http(s) URL")
			return
		}

		// Validate the token against the host's JWKS. We don't gate
		// on specific claims here (sub / aud / iss vary by host); the
		// signature + exp check is what we care about. Per-host
		// claim policy is a follow-up if a deploy needs it.
		if _, err := verifier.Verify(r.Context(), token); err != nil {
			slog.Warn("wopi redirect: token rejected",
				slog.String("err", err.Error()))
			// All verifier failures map to 401 from the user's POV —
			// no point distinguishing "expired" from "bad sig" to
			// the browser since the only remediation is "go back to
			// the host and re-click open".
			writeJSONError(w, http.StatusUnauthorized, "bad_token",
				"access_token failed verification")
			return
		}

		docID := wopi.EncodeDocID(wopiSrc)

		// Build the redirect URL: /doc/{docID}?access_token=...
		// Using net/url so the token gets percent-encoded properly
		// even if a host issues an exotic JWT shape.
		target := url.URL{Path: "/doc/" + docID}
		tq := target.Query()
		tq.Set("access_token", token)
		target.RawQuery = tq.Encode()
		// 303 See Other so a browser that retains the GET semantics
		// of the original request still issues a clean GET on the
		// redirect target. 302 would work too; 303 is the slightly
		// safer pick because it forbids POST→GET-retry-as-POST
		// shenanigans (which aren't relevant here, but cost zero).
		http.Redirect(w, r, target.String(), http.StatusSeeOther)
	}
}

// wopiRedirectPath is the path the handler mounts on. Centralised so
// the test and the mux registration can't drift.
const wopiRedirectPath = "/wopi/host"

// requireGET is a tiny method-gate used by wopiRedirectHandler when
// we register it without the new go1.22 mux pattern. (We don't —
// main.go uses "GET /wopi/host", so this helper is reserved for
// fallback testing.)
//
//nolint:unused // referenced from tests
func requireGET(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSONError(w, http.StatusMethodNotAllowed, "method", "GET required")
			return
		}
		h.ServeHTTP(w, r)
	})
}

// formatWopiRedirectTarget is exported only for tests so they don't
// have to reimplement the URL builder when asserting redirect
// destinations.
func formatWopiRedirectTarget(wopiSrc, token string) string {
	docID := wopi.EncodeDocID(wopiSrc)
	target := url.URL{Path: "/doc/" + docID}
	q := target.Query()
	q.Set("access_token", token)
	target.RawQuery = q.Encode()
	return target.String()
}

// wopiInitErr wraps a startup-time setup failure with the env var
// name that caused it so the operator's logs surface what to fix.
func wopiInitErr(envVar string, err error) error {
	return fmt.Errorf("wopi: setup via %s: %w", envVar, err)
}
