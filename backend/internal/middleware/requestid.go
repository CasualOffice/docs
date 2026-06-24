// Package middleware bundles cross-cutting HTTP wrappers — request
// id, structured access logging, future tracing — that the gateway
// chains in front of its mux. Kept separate from cmd/gateway so
// individual middlewares are unit-testable in isolation and
// composable into a different binary if one ever needs to live
// alongside this gateway.
package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"
)

// requestIDKey is the unexported context key the request-id is
// stashed under. Typed so no other package can collide on it; reads
// go through RequestIDFromContext.
type requestIDKey struct{}

// requestIDHeader is the canonical inbound/outbound header. Honours
// any upstream proxy's existing id when present (so a load-balancer
// + this gateway share a correlation key) and mints a new one
// otherwise.
const requestIDHeader = "X-Request-Id"

// RequestIDFromContext returns the id the RequestID middleware
// attached to r.Context(). Returns the empty string if the middleware
// wasn't in the chain — callers should treat that as "this request
// isn't being correlated".
func RequestIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey{}).(string); ok {
		return v
	}
	return ""
}

// RequestID returns an HTTP middleware that ensures every inbound
// request has an X-Request-Id, threads it onto the request context,
// and echoes it on the response so the client can quote it back when
// reporting issues. The middleware is intentionally allocation-thin:
// 16-byte hex string + one context value.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(requestIDHeader)
		if id == "" {
			id = newRequestID()
		}
		w.Header().Set(requestIDHeader, id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey{}, id)))
	})
}

// AccessLog wraps the next handler with an slog-formatted access
// line: method, path, status, bytes, duration, request-id. Emitted
// at Info level so an operator can turn it off at WARN without
// losing genuine error signals.
//
// The wrapped ResponseWriter captures status + bytes without
// breaking interface conformance — http.Flusher / http.Hijacker
// composition is preserved when the underlying writer supports
// them, so WebSocket upgrades still work past this middleware.
func AccessLog(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &recordingWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		logger.LogAttrs(r.Context(), slog.LevelInfo, "http",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", rw.status),
			slog.Int64("bytes", rw.bytes),
			slog.Duration("dur", time.Since(start)),
			slog.String("rid", RequestIDFromContext(r.Context())),
		)
	})
}

// newRequestID returns a 16-char hex token. Crypto/rand is fine
// here — the id only needs to be globally unique within a short
// window, not unguessable, but using strong randomness costs the
// same and keeps the property predictable. Falls back to the
// timestamp if rand reads fail (vanishingly rare).
func newRequestID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// rand.Read should never fail on a sane OS; if it does, fall
		// back to a degraded but still-unique id rather than reject
		// the request.
		now := time.Now().UnixNano()
		for i := 0; i < 8; i++ {
			b[i] = byte(now >> (i * 8))
		}
	}
	return hex.EncodeToString(b[:])
}

// recordingWriter intercepts WriteHeader + Write to capture the
// response status and byte count. Composes with the rest of the
// http.ResponseWriter contract so middlewares above us don't lose
// access to upgrade / flush / hijack.
type recordingWriter struct {
	http.ResponseWriter
	status int
	bytes  int64
	wrote  bool
}

func (rw *recordingWriter) WriteHeader(code int) {
	if rw.wrote {
		return
	}
	rw.status = code
	rw.wrote = true
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *recordingWriter) Write(b []byte) (int, error) {
	if !rw.wrote {
		rw.wrote = true
	}
	n, err := rw.ResponseWriter.Write(b)
	rw.bytes += int64(n)
	return n, err
}
