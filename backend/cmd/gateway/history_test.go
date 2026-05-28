// Tests for GET /api/docs/{docId}/history — the revision-metadata
// log surfaced to the version-history panel. Metadata only; content
// revert to a past revision is not exposed here (M2 serializer
// worker dependency).
package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/schnsrw/docx/backend/internal/host/inline"
)

func getHistory(t *testing.T, srvURL, docID string) (*http.Response, []byte) {
	t.Helper()
	resp, err := http.Get(srvURL + "/api/docs/" + docID + "/history")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp, body
}

func TestHistoryEndpointReturnsCreationRevision(t *testing.T) {
	srv, _, store := startTestGateway(t)
	docID := seedDoc(t, store, "h.docx")

	resp, body := getHistory(t, srv.URL, docID)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET history = %d; want 200 (body=%s)", resp.StatusCode, body)
	}
	var revs []inline.RevisionMeta
	if err := json.Unmarshal(body, &revs); err != nil {
		t.Fatalf("unmarshal: %v (body=%s)", err, body)
	}
	if len(revs) != 1 {
		t.Fatalf("history len = %d; want 1", len(revs))
	}
	if revs[0].Version != 1 {
		t.Fatalf("revs[0].Version = %d; want 1", revs[0].Version)
	}
}

func TestHistoryEndpointReflectsSnapshots(t *testing.T) {
	srv, _, store := startTestGateway(t)
	docID := seedDoc(t, store, "h.docx")
	_ = store.Snapshot(context.Background(), docID, "", []byte("second"))

	resp, body := getHistory(t, srv.URL, docID)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET history = %d; want 200", resp.StatusCode)
	}
	var revs []inline.RevisionMeta
	if err := json.Unmarshal(body, &revs); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(revs) != 2 {
		t.Fatalf("history len = %d; want 2", len(revs))
	}
	if revs[1].Version != 2 || revs[1].SizeBytes != len("second") {
		t.Fatalf("revs[1] = %+v; want version 2 size %d", revs[1], len("second"))
	}
}

func TestHistoryEndpointUnknownDocIs404(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	resp, _ := getHistory(t, srv.URL, "does-not-exist")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("GET history of unknown doc = %d; want 404", resp.StatusCode)
	}
}

func TestHistoryEndpointRejectsNonGet(t *testing.T) {
	srv, _, store := startTestGateway(t)
	docID := seedDoc(t, store, "h.docx")
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/docs/"+docID+"/history", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("POST history = %d; want 405", resp.StatusCode)
	}
}
