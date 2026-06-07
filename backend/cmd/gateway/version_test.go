package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/schnsrw/docx/backend/internal/version"
)

// TestHealth_PlainTextDefault — the historical one-line response
// shape is preserved when no JSON Accept header is sent. Operators
// have docker-run --health-cmd probes pinned against the literal
// "casual-editor gateway: ok" prefix; changing it would silently
// break those.
func TestHealth_PlainTextDefault(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(healthHandler))
	defer srv.Close()
	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.HasPrefix(string(body), "casual-editor gateway: ok") {
		t.Errorf("body = %q; want the pinned prefix", body)
	}
}

// TestHealth_JSONOnAccept — Accept: application/json switches to the
// structured response carrying the full Info struct.
func TestHealth_JSONOnAccept(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(healthHandler))
	defer srv.Close()
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q", ct)
	}
	var got version.Info
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got.Version == "" || got.Commit == "" {
		t.Errorf("Version=%q Commit=%q (both must be non-empty)", got.Version, got.Commit)
	}
}
