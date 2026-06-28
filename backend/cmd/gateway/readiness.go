// Copyright (c) 2026 Casual Office. All rights reserved.

// /health/ready — readiness probe with per-component status.
//
// Distinct from /health (liveness — "the process is running"):
// readiness checks every downstream the gateway needs at request
// time. A load balancer or k8s readiness gate should poll this and
// drain traffic when it goes red.
//
// Components probed depend on what's wired at startup:
//
//	users.db   — sqlite Ping (when GATEWAY_AUTH=personal)
//	fs.root    — stat of the per-user data root (when GATEWAY_HOST=local)
//	wopi.jwks  — HEAD on the JWKS URL (when CASUAL_WOPI_JWKS_URL set)
//
// 200 when all probes pass, 503 when any required probe fails.
// Response body is always the same JSON shape regardless of status
// so a polling client doesn't need to special-case.
package main

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

// perProbeTimeout caps how long any single component check can take.
// The handler runs them in parallel, so the overall request lands in
// at most perProbeTimeout wall-clock time regardless of probe count.
const perProbeTimeout = 3 * time.Second

// ReadinessProbe is one component's status check. Returning nil
// means healthy; a non-nil error becomes the `reason` in the JSON
// response, and the overall readiness flips to false.
//
// Implementations should respect ctx.Done() — the handler enforces
// a per-probe timeout via context cancellation.
type ReadinessProbe interface {
	Name() string
	Check(ctx context.Context) error
}

// readinessReport is the on-wire shape returned by /health/ready.
// Always carries the same field set so a poller doesn't need to
// distinguish on status code.
type readinessReport struct {
	Status     string             `json:"status"` // "ok" or "degraded"
	Components []componentStatus  `json:"components"`
	Timestamp  string             `json:"timestamp"`
}

type componentStatus struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Reason string `json:"reason,omitempty"`
}

// readinessHandler returns the HTTP handler for /health/ready,
// closed over the configured probes. Operators wire probes in main()
// based on which features are enabled; the handler doesn't care
// which probes are which.
func readinessHandler(now func() time.Time, probes []ReadinessProbe) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		components := runReadinessProbes(r.Context(), probes, now)
		overall := http.StatusOK
		status := "ok"
		for _, c := range components {
			if !c.OK {
				overall = http.StatusServiceUnavailable
				status = "degraded"
				break
			}
		}
		report := readinessReport{
			Status:     status,
			Components: components,
			Timestamp:  now().UTC().Format(time.RFC3339),
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(overall)
		_ = json.NewEncoder(w).Encode(report)
	}
}

// runReadinessProbes fires every probe in parallel and collects the
// results. Each probe gets its own perProbeTimeout context derived
// from the request context — a slow probe can't tie up the whole
// readiness check, and a client cancel still drops everything.
//
// Order in the returned slice matches the input order so a polling
// dashboard can render components in a stable layout.
func runReadinessProbes(
	parent context.Context,
	probes []ReadinessProbe,
	now func() time.Time,
) []componentStatus {
	out := make([]componentStatus, len(probes))
	var wg sync.WaitGroup
	for i, p := range probes {
		wg.Add(1)
		go func(i int, p ReadinessProbe) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(parent, perProbeTimeout)
			defer cancel()
			started := now()
			err := p.Check(ctx)
			elapsed := now().Sub(started)
			cs := componentStatus{Name: p.Name(), OK: err == nil}
			if err != nil {
				cs.Reason = err.Error()
			}
			// Surface a timeout reason explicitly when the probe hit
			// the per-probe cap — generic "context deadline exceeded"
			// errors are less helpful in logs.
			if err != nil && elapsed >= perProbeTimeout && ctx.Err() == context.DeadlineExceeded {
				cs.Reason = "timeout after " + perProbeTimeout.String()
			}
			out[i] = cs
		}(i, p)
	}
	wg.Wait()
	return out
}

// ---------------------------------------------------------------
// Concrete probes
// ---------------------------------------------------------------

// SQLProbe pings a database/sql-shaped pool. Used for the personal
// auth users.db. Defined as a small adapter so the test suite can
// inject a fake without depending on database/sql.
type SQLProbe struct {
	Label   string
	PingCtx func(ctx context.Context) error
}

func (p *SQLProbe) Name() string { return p.Label }
func (p *SQLProbe) Check(ctx context.Context) error {
	return p.PingCtx(ctx)
}

// FSProbe stats a filesystem path. Used for the local host's data
// root — if the path is gone (bind-mount removed), the gateway can't
// serve docs and should be drained.
type FSProbe struct {
	Label string
	Path  string
	Stat  func(path string) error
}

func (p *FSProbe) Name() string { return p.Label }
func (p *FSProbe) Check(_ context.Context) error {
	return p.Stat(p.Path)
}

// HTTPProbe sends a HEAD request to a URL and checks the status.
// Used for the WOPI JWKS endpoint — if the host can't be reached,
// new JWT verifications will fail; existing cached keys still work,
// but the gateway is degraded.
type HTTPProbe struct {
	Label  string
	URL    string
	Client *http.Client
}

func (p *HTTPProbe) Name() string { return p.Label }
func (p *HTTPProbe) Check(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, p.URL, nil)
	if err != nil {
		return err
	}
	resp, err := p.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return &httpProbeError{status: resp.StatusCode}
	}
	return nil
}

type httpProbeError struct{ status int }

func (e *httpProbeError) Error() string {
	return "unexpected status " + statusName(e.status)
}

func statusName(code int) string {
	// Tiny formatter so the JSON body shows "503" instead of the
	// awkward stdlib reasons.
	return http.StatusText(code) + " (" + itoa(code) + ")"
}

func itoa(n int) string {
	// Avoid pulling in strconv just for this — handler is hot but
	// the cost is negligible.
	if n == 0 {
		return "0"
	}
	sign := ""
	if n < 0 {
		sign = "-"
		n = -n
	}
	const digits = "0123456789"
	buf := []byte{}
	for n > 0 {
		buf = append([]byte{digits[n%10]}, buf...)
		n /= 10
	}
	return sign + string(buf)
}
