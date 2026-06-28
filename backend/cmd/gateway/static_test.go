// Copyright (c) 2026 Casual Office. All rights reserved.

// Tests the bundled-image static handler: assets resolve to the
// file on disk, unmatched paths fall back to index.html so the
// client-side router can take over, and `..` segments are
// rejected before they touch the filesystem.
package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func setupStaticRoot(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	files := map[string]string{
		"index.html":     "<!doctype html><html>spa root</html>",
		"assets/app.js":  "console.log('hello');",
		"assets/app.css": "body{}",
	}
	for rel, body := range files {
		full := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", full, err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatalf("write %s: %v", full, err)
		}
	}
	return dir
}

func TestStaticServesExistingAsset(t *testing.T) {
	dir := setupStaticRoot(t)
	srv := httptest.NewServer(staticHandler(dir))
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/assets/app.js")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d; want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "console.log('hello');" {
		t.Fatalf("body = %q; want app.js contents", body)
	}
}

func TestStaticFallsBackToIndex(t *testing.T) {
	dir := setupStaticRoot(t)
	srv := httptest.NewServer(staticHandler(dir))
	t.Cleanup(srv.Close)

	// SPA route — no matching file on disk. Should return index.html.
	resp, err := http.Get(srv.URL + "/r/some-doc-id")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d; want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "<!doctype html><html>spa root</html>" {
		t.Fatalf("body = %q; want index.html contents", body)
	}
}

func TestStaticRejectsParentTraversal(t *testing.T) {
	dir := setupStaticRoot(t)
	srv := httptest.NewServer(staticHandler(dir))
	t.Cleanup(srv.Close)

	// Server-side parent-traversal — handler should refuse before
	// touching the filesystem. The HTTP client cleans the path
	// before sending, so we need to bypass that.
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/", nil)
	req.URL.Path = "/../etc/passwd"
	req.URL.RawPath = "/../etc/passwd"
	resp, err := http.DefaultTransport.RoundTrip(req)
	if err != nil {
		t.Fatalf("RoundTrip: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d; want 400", resp.StatusCode)
	}
}
