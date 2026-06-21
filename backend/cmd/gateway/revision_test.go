package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"testing"
)

// GET /api/docs/{id}/history/{version}/download streams the .docx bytes
// of that specific revision (the restore path), and 404s on an unknown
// version.
func TestRevisionDownloadServesPerVersionBytes(t *testing.T) {
	srv, _, store := startTestGateway(t)
	id, err := store.Store("d.docx", []byte("V1-CONTENT"))
	if err != nil {
		t.Fatalf("Store: %v", err)
	}
	if err := store.Snapshot(context.Background(), id, "", []byte("V2-CONTENT")); err != nil {
		t.Fatalf("Snapshot: %v", err)
	}

	for v, want := range map[int]string{1: "V1-CONTENT", 2: "V2-CONTENT"} {
		url := fmt.Sprintf("%s/api/docs/%s/history/%d/download", srv.URL, id, v)
		resp, err := http.Get(url)
		if err != nil {
			t.Fatalf("GET v%d: %v", v, err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("v%d status = %d, want 200", v, resp.StatusCode)
		}
		if string(body) != want {
			t.Fatalf("v%d body = %q, want %q", v, body, want)
		}
		if ct := resp.Header.Get("Content-Type"); ct != "application/vnd.openxmlformats-officedocument.wordprocessingml.document" {
			t.Fatalf("v%d content-type = %q", v, ct)
		}
	}

	resp, err := http.Get(fmt.Sprintf("%s/api/docs/%s/history/99/download", srv.URL, id))
	if err != nil {
		t.Fatalf("GET unknown version: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown version status = %d, want 404", resp.StatusCode)
	}
}
