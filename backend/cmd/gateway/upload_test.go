// Copyright (c) 2026 Casual Office. All rights reserved.

// Integration tests for the /api/docs upload + download REST
// endpoints. Together with broadcast_test.go these prove the
// v0 share-link flow end-to-end:
//
//   - POST /api/docs (multipart or raw)
//   - GET  /api/docs/{docId}/download
//   - WS connect to /doc/{docId} (pre-flight passes because the
//     upload registered the doc with the inline host)
//
// The Vite editor demo wires its "Share" button to this same
// surface; testing it via httptest lets us validate the contract
// without spinning up a browser.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"
)

func uploadMultipart(t *testing.T, url, fileName string, contents []byte) *http.Response {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	if _, err := part.Write(contents); err != nil {
		t.Fatalf("part.Write: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("mw.Close: %v", err)
	}
	req, _ := http.NewRequest(http.MethodPost, url, &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("upload POST: %v", err)
	}
	return resp
}

func TestUploadMultipartRoundTrip(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	resp := uploadMultipart(t, srv.URL+"/api/docs", "hello.docx", []byte("PK\x03\x04 hello docx bytes"))
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("upload status = %d; body = %s", resp.StatusCode, body)
	}
	var out uploadResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.DocID == "" {
		t.Fatalf("upload returned empty docId")
	}
	if !strings.HasPrefix(out.ShareURL, "/r/"+out.DocID) {
		t.Fatalf("shareUrl = %q; want /r/<docId>", out.ShareURL)
	}
	if !strings.HasPrefix(out.WSPath, "/doc/"+out.DocID) {
		t.Fatalf("wsPath = %q; want /doc/<docId>", out.WSPath)
	}

	// Now GET /api/docs/{docId}/download — bytes should round-trip.
	dl, err := http.Get(srv.URL + "/api/docs/" + out.DocID + "/download")
	if err != nil {
		t.Fatalf("download GET: %v", err)
	}
	defer dl.Body.Close()
	if dl.StatusCode != http.StatusOK {
		t.Fatalf("download status = %d", dl.StatusCode)
	}
	if got, _ := io.ReadAll(dl.Body); string(got) != "PK\x03\x04 hello docx bytes" {
		t.Fatalf("download bytes mismatch: %q", got)
	}

	disp := dl.Header.Get("Content-Disposition")
	if !strings.Contains(disp, "hello.docx") {
		t.Fatalf("Content-Disposition = %q; want filename hello.docx", disp)
	}
	if ct := dl.Header.Get("Content-Type"); !strings.Contains(ct, "wordprocessingml.document") {
		t.Fatalf("Content-Type = %q; want wordprocessingml.document", ct)
	}
}

func TestUploadRawBody(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/docs", bytes.NewReader([]byte("raw bytes")))
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("X-File-Name", "raw.docx")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("upload POST: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("upload status = %d; body = %s", resp.StatusCode, body)
	}
	var out uploadResponse
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if out.DocID == "" {
		t.Fatalf("upload returned empty docId")
	}

	dl, err := http.Get(srv.URL + "/api/docs/" + out.DocID + "/download")
	if err != nil {
		t.Fatalf("download GET: %v", err)
	}
	defer dl.Body.Close()
	body, _ := io.ReadAll(dl.Body)
	if string(body) != "raw bytes" {
		t.Fatalf("raw upload bytes did not round-trip; got %q", body)
	}
	if !strings.Contains(dl.Header.Get("Content-Disposition"), "raw.docx") {
		t.Fatalf("Content-Disposition missing X-File-Name value: %q", dl.Header.Get("Content-Disposition"))
	}
}

func TestUploadEmptyBodyReturns400(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/docs", bytes.NewReader(nil))
	req.Header.Set("Content-Type", "application/octet-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("upload POST: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty upload status = %d; want 400", resp.StatusCode)
	}
}

func TestUploadWrongMethodReturns405(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	resp, err := http.Get(srv.URL + "/api/docs")
	if err != nil {
		t.Fatalf("GET /api/docs: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("GET /api/docs = %d; want 405", resp.StatusCode)
	}
}

func TestDownloadUnknownReturns404(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	resp, err := http.Get(srv.URL + "/api/docs/never-uploaded/download")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("download of unknown doc = %d; want 404", resp.StatusCode)
	}
}

func TestDownloadHeadIsAllowedAndOmitsBody(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	// Upload first.
	resp := uploadMultipart(t, srv.URL+"/api/docs", "h.docx", []byte("body"))
	defer resp.Body.Close()
	var out uploadResponse
	_ = json.NewDecoder(resp.Body).Decode(&out)

	req, _ := http.NewRequest(http.MethodHead, srv.URL+"/api/docs/"+out.DocID+"/download", nil)
	dl, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("HEAD: %v", err)
	}
	defer dl.Body.Close()
	if dl.StatusCode != http.StatusOK {
		t.Fatalf("HEAD status = %d; want 200", dl.StatusCode)
	}
	if dl.Header.Get("Content-Length") != "4" {
		t.Fatalf("HEAD Content-Length = %q; want 4", dl.Header.Get("Content-Length"))
	}
	if body, _ := io.ReadAll(dl.Body); len(body) != 0 {
		t.Fatalf("HEAD body should be empty; got %d bytes", len(body))
	}
}

func TestCORSPreflightAllowed(t *testing.T) {
	srv, _, _ := startTestGateway(t)
	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/api/docs", nil)
	req.Header.Set("Origin", "https://example.test")
	req.Header.Set("Access-Control-Request-Method", "POST")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("OPTIONS: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("CORS preflight status = %d; want 204", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "https://example.test" {
		t.Fatalf("CORS origin echo = %q; want example.test", got)
	}
}
