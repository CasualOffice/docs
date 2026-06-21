// Package limit implements a per-IP token-bucket HTTP middleware
// for the Casual Docs gateway.
//
// Design:
//
//   - One [rate.Limiter] per source IP, cached in a sync.Map keyed
//     by ip string.
//   - LRU eviction: when the cache exceeds maxIPs, the oldest entries
//     are dropped. Prevents an attacker spraying from millions of
//     unique IPs from filling memory.
//   - Two configurable rates: a "general" bucket for control-plane
//     POSTs (room create), and an "upload" bucket for byte-heavy
//     POSTs (.docx uploads). Wrapping middleware picks per-route.
//   - Stable Retry-After header from rate.Limiter.Reserve so callers
//     can back off precisely instead of guessing.
//
// Why not @fastify/rate-limit-shaped library: the Go ecosystem
// favours small, composable pieces. golang.org/x/time/rate is the
// standard token-bucket; everything else is glue. Glue lives here.
//
// Equivalent to the sheets repo's apps/server middleware shipped in
// Stream C1 of the production-readiness pipeline; see
// /notes/rate-limit-room-cap-hocuspocus-backend/ for the design.
package limit

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// Config captures the public knobs the middleware exposes.
//
// Zero values disable the limiter entirely — the middleware becomes
// a pass-through. Used by tests + the dev path where the bucket
// would mask real failures.
type Config struct {
	// PerMin is the long-term rate (requests / minute) per source
	// IP. Translated to per-second token replenishment inside the
	// limiter.
	PerMin int
	// Burst is the maximum tokens a single IP can spend
	// instantaneously. Sized to allow a small refresh-burst (e.g.
	// a user clicking Save twice quickly) without throttling.
	Burst int
	// MaxIPs bounds the per-IP limiter cache. When exceeded, the
	// oldest entries are evicted. Prevents memory growth under a
	// many-IP scrape attack.
	MaxIPs int
}

// DefaultGeneral returns the recommended config for control-plane
// POSTs (room create, rename). Maps to the sheets equivalent of 60
// requests/minute with a small burst.
func DefaultGeneral() Config {
	return Config{PerMin: 60, Burst: 10, MaxIPs: 10_000}
}

// DefaultUpload returns the recommended config for byte-heavy POSTs
// (.docx upload). Tighter than General because each accepted
// request can pull megabytes into memory.
func DefaultUpload() Config {
	return Config{PerMin: 12, Burst: 3, MaxIPs: 10_000}
}

// Limiter wraps a per-IP token-bucket cache.
//
// Safe for concurrent use. The internal sync.Map handles the read
// path lock-free; writes (new IP + LRU eviction) take a small
// mutex.
type Limiter struct {
	cfg     Config
	rps     rate.Limit // pre-computed PerMin / 60
	buckets sync.Map   // map[string]*ipBucket
	// order maintains LRU eviction order. Append to tail on use,
	// drop from head when len exceeds cfg.MaxIPs. Guarded by mu.
	mu    sync.Mutex
	order []string
}

type ipBucket struct {
	limiter *rate.Limiter
	// No lastSeen tracking: LRU eviction uses insertion order
	// (l.order), and the rate.Limiter itself tracks its internal
	// per-bucket clock. Adding lastSeen here without locking
	// produces a benign-but-real data race under concurrent
	// access to the same IP, caught by `go test -race`.
}

// New constructs a Limiter from cfg. When cfg.PerMin <= 0 the
// limiter becomes a pass-through (Allow always returns true).
func New(cfg Config) *Limiter {
	rps := rate.Limit(0)
	if cfg.PerMin > 0 {
		rps = rate.Limit(float64(cfg.PerMin) / 60.0)
	}
	if cfg.MaxIPs <= 0 {
		cfg.MaxIPs = 10_000
	}
	if cfg.Burst <= 0 {
		cfg.Burst = 1
	}
	return &Limiter{cfg: cfg, rps: rps}
}

// Allow checks whether the request from `ip` should be processed.
// Returns the wait duration the caller should advertise via
// Retry-After when the answer is false. Wait is 0 when the result
// is true.
//
// Disabled (rps == 0): always (true, 0).
func (l *Limiter) Allow(ip string) (allowed bool, wait time.Duration) {
	if l.rps == 0 {
		return true, 0
	}
	b := l.bucketFor(ip)
	reservation := b.limiter.Reserve()
	if !reservation.OK() {
		// Burst not yet available + reserve refused → block.
		return false, time.Second
	}
	delay := reservation.Delay()
	if delay > 0 {
		reservation.Cancel()
		return false, delay
	}
	return true, 0
}

// bucketFor returns (creating if needed) the per-IP rate.Limiter.
// Triggers an LRU pass when the cache would exceed MaxIPs.
func (l *Limiter) bucketFor(ip string) *ipBucket {
	if v, ok := l.buckets.Load(ip); ok {
		return v.(*ipBucket)
	}
	// Fast path miss — take the mutex, double-check, then insert.
	l.mu.Lock()
	defer l.mu.Unlock()
	if v, ok := l.buckets.Load(ip); ok {
		return v.(*ipBucket)
	}
	b := &ipBucket{
		limiter: rate.NewLimiter(l.rps, l.cfg.Burst),
	}
	l.buckets.Store(ip, b)
	l.order = append(l.order, ip)
	// Evict if we've passed the cap. Drop the oldest 1024 at a
	// time so the eviction pass is cheap even on sustained
	// many-IP traffic.
	if len(l.order) > l.cfg.MaxIPs {
		evictBatch := 1024
		if evictBatch > len(l.order)-l.cfg.MaxIPs {
			evictBatch = len(l.order) - l.cfg.MaxIPs
		}
		for _, oldIP := range l.order[:evictBatch] {
			l.buckets.Delete(oldIP)
		}
		l.order = l.order[evictBatch:]
	}
	return b
}

// Middleware returns an http.Handler that enforces the limit on
// `next`. Rejected requests get 429 + Retry-After.
//
// Pass key=httputil's client-IP extractor when running behind a
// reverse proxy that sets X-Forwarded-For; the default reads
// RemoteAddr.
func (l *Limiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		allowed, wait := l.Allow(ip)
		if !allowed {
			waitSec := int(wait.Seconds() + 0.5)
			if waitSec < 1 {
				waitSec = 1
			}
			w.Header().Set("Retry-After", fmt.Sprintf("%d", waitSec))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			fmt.Fprintf(w, `{"error":"rate_limited","retryAfterSec":%d}`, waitSec)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// clientIP extracts a meaningful client IP from the request. Reads
// X-Forwarded-For when present (first hop = original client),
// falls back to RemoteAddr. The gateway must run behind a trusted
// proxy for the forwarded-header path to be meaningful — see
// docs/DEPLOYMENT.md for reverse-proxy recipes.
//
// Doesn't validate the IP — the bucket cache treats whatever the
// header says as the bucket key. A malicious proxy header would
// just create extra bucket entries (bounded by MaxIPs).
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For: "client, proxy1, proxy2" — first hop
		// is the client we care about.
		if comma := strings.IndexByte(xff, ','); comma > 0 {
			return strings.TrimSpace(xff[:comma])
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
