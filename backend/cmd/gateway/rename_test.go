// Copyright (c) 2026 Casual Office. All rights reserved.

// Tests for PATCH /api/docs/{docId}/rename — updates the stored
// fileName so a subsequent /download advertises the new name in
// Content-Disposition. Used by the live-rename path: when a peer
// renames the doc in the editor, the React layer PATCHes here so
// the server matches the (Y.Map-synchronised) client state.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func patchRename(t *testing.T, srvURL, docID, newName string) (*http.Response, []byte) {
	t.Helper()
	body, err := json.Marshal(struct {
		FileName string `json:"fileName"`
	}{FileName: newName})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	req, err := http.NewRequest(
		http.MethodPatch,
		srvURL+"/api/docs/"+docID+"/rename",
		bytes.NewReader(body),
	)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	got, _ := io.ReadAll(resp.Body)
	return resp, got
}

func TestRenameUpdatesFileName(t *testing.T) {
	srv, _, store := startTestGateway(t)
	docID := seedDoc(t, store, "original.docx")
	resp, body := patchRename(t, srv.URL, docID, "renamed report.docx")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PATCH = %d; want 200 (body=%s)", resp.StatusCode, string(body))
	}
	var got struct {
		FileName string `json:"fileName"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got.FileName != "renamed report.docx" {
		t.Fatalf("response fileName=%q; want renamed report.docx", got.FileName)
	}

	// Verify download now advertises the new name.
	dl, err := http.Get(srv.URL + "/api/docs/" + docID + "/download")
	if err != nil {
		t.Fatalf("download: %v", err)
	}
	defer dl.Body.Close()
	disp := dl.Header.Get("Content-Disposition")
	if !strings.Contains(disp, "renamed%20report.docx") {
		t.Fatalf("Content-Disposition=%q; expected to include renamed%%20report.docx", disp)
	}
}

func TestRenameUnknownDocReturns404(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	resp, _ := patchRename(t, srv.URL, "no-such-id", "anything.docx")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("PATCH unknown = %d; want 404", resp.StatusCode)
	}
}

func TestRenameRequiresPatch(t *testing.T) {
	srv, _, store := startTestGateway(t)
	docID := seedDoc(t, store, "x.docx")
	// POST is rejected.
	resp, err := http.Post(srv.URL+"/api/docs/"+docID+"/rename", "application/json", strings.NewReader(`{"fileName":"x.docx"}`))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("POST = %d; want 405", resp.StatusCode)
	}
}

func TestRenameRejectsEmptyFileName(t *testing.T) {
	srv, _, store := startTestGateway(t)
	docID := seedDoc(t, store, "x.docx")
	resp, _ := patchRename(t, srv.URL, docID, "   ")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty fileName = %d; want 400", resp.StatusCode)
	}
}

func TestRenameRejectsTooLongFileName(t *testing.T) {
	srv, _, store := startTestGateway(t)
	docID := seedDoc(t, store, "x.docx")
	resp, _ := patchRename(t, srv.URL, docID, strings.Repeat("a", 300))
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf(">255 chars = %d; want 400", resp.StatusCode)
	}
}
