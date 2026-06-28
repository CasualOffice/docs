// Copyright (c) 2026 Casual Office. All rights reserved.

package middleware

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestRequestID_MintsWhenAbsent — no inbound header → server mints
// a 16-hex id, echoes it on the response, exposes it on context.
func TestRequestID_MintsWhenAbsent(t *testing.T) {
	var ctxID string
	h := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctxID = RequestIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/anything", nil)
	h.ServeHTTP(rec, req)
	if ctxID == "" {
		t.Fatal("context id empty")
	}
	if len(ctxID) != 16 {
		t.Errorf("ctxID len = %d, want 16", len(ctxID))
	}
	if got := rec.Header().Get("X-Request-Id"); got != ctxID {
		t.Errorf("response header = %q, ctx = %q", got, ctxID)
	}
}

// TestRequestID_HonoursUpstream — inbound id is preserved so a
// proxy + this gateway share a correlation key.
func TestRequestID_HonoursUpstream(t *testing.T) {
	var ctxID string
	h := RequestID(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		ctxID = RequestIDFromContext(r.Context())
	}))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("X-Request-Id", "from-upstream")
	h.ServeHTTP(rec, req)
	if ctxID != "from-upstream" {
		t.Errorf("ctxID = %q, want from-upstream", ctxID)
	}
	if rec.Header().Get("X-Request-Id") != "from-upstream" {
		t.Errorf("response = %q", rec.Header().Get("X-Request-Id"))
	}
}

// TestAccessLog_EmitsStructured — confirms the attrs land in the
// logger output with the right keys. Uses a JSON handler so the
// assertion can scan substrings without parsing.
func TestAccessLog_EmitsStructured(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	chain := RequestID(AccessLog(logger, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/things", nil)
	chain.ServeHTTP(rec, req)
	line := buf.String()
	for _, want := range []string{`"method":"POST"`, `"path":"/api/things"`, `"status":200`, `"rid":`} {
		if !strings.Contains(line, want) {
			t.Errorf("log missing %q: %s", want, line)
		}
	}
}

// TestRequestID_NoneFromContext — calling the helper without the
// middleware in the chain returns the empty string.
func TestRequestID_NoneFromContext(t *testing.T) {
	if got := RequestIDFromContext(context.Background()); got != "" {
		t.Errorf("got %q, want \"\"", got)
	}
}
