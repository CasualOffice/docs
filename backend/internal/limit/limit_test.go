// Copyright (c) 2026 Casual Office. All rights reserved.

package limit

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestNew_DisabledWhenPerMinZero(t *testing.T) {
	l := New(Config{PerMin: 0})
	// 1000 hits from one IP should all pass when disabled.
	for i := 0; i < 1000; i++ {
		ok, _ := l.Allow("1.2.3.4")
		if !ok {
			t.Fatalf("disabled limiter rejected request %d", i)
		}
	}
}

func TestAllow_BurstThenThrottle(t *testing.T) {
	// 60/min = 1/sec, burst 5. First 5 must pass; the 6th must
	// fall under the rate floor and get throttled.
	l := New(Config{PerMin: 60, Burst: 5, MaxIPs: 100})
	allowed := 0
	for i := 0; i < 6; i++ {
		ok, _ := l.Allow("client-1")
		if ok {
			allowed++
		}
	}
	if allowed != 5 {
		t.Fatalf("expected 5 allowed within burst, got %d", allowed)
	}
}

func TestAllow_IndependentBucketsPerIP(t *testing.T) {
	// Two distinct IPs should each get their own burst.
	l := New(Config{PerMin: 60, Burst: 3, MaxIPs: 100})
	for _, ip := range []string{"a", "b"} {
		for i := 0; i < 3; i++ {
			ok, _ := l.Allow(ip)
			if !ok {
				t.Fatalf("IP %q hit before burst exhausted at %d", ip, i)
			}
		}
		// 4th from the same IP should throttle
		ok, _ := l.Allow(ip)
		if ok {
			t.Fatalf("IP %q allowed past its burst", ip)
		}
	}
}

func TestAllow_RetryAfterIsPositive(t *testing.T) {
	// Saturate then check the wait > 0.
	l := New(Config{PerMin: 60, Burst: 2, MaxIPs: 100})
	_, _ = l.Allow("c")
	_, _ = l.Allow("c")
	ok, wait := l.Allow("c")
	if ok {
		t.Fatalf("third hit should be throttled")
	}
	if wait <= 0 {
		t.Fatalf("expected positive retry wait, got %v", wait)
	}
}

func TestMaxIPs_EvictsOldestBatch(t *testing.T) {
	// Cap 5; insert 5 + cap fillers + 1 more → eviction runs.
	// Verify the cap isn't broken silently (bucketFor returns
	// the right thing even for the evicted-and-re-added IP).
	l := New(Config{PerMin: 60, Burst: 1, MaxIPs: 5})
	for i := 0; i < 6; i++ {
		ip := string(rune('a' + i))
		ok, _ := l.Allow(ip)
		if !ok {
			t.Fatalf("first burst from new IP %q must pass", ip)
		}
	}
	// First IP ("a") may have been evicted (we only evict when
	// crossing the cap and currently the eviction batch is 1024;
	// for MaxIPs=5 the batch shrinks to len-cap = 1, so 'a' was
	// dropped when 'f' was added). Re-using 'a' should give a
	// fresh bucket, so the burst is available again.
	ok, _ := l.Allow("a")
	if !ok {
		t.Fatalf("re-used IP 'a' didn't get a fresh bucket after eviction")
	}
}

func TestMiddleware_PassesAllowedRequests(t *testing.T) {
	l := New(Config{PerMin: 60, Burst: 5, MaxIPs: 100})
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest("POST", "/api/docs", nil)
	req.RemoteAddr = "1.2.3.4:1234"
	rr := httptest.NewRecorder()
	l.Middleware(next).ServeHTTP(rr, req)
	if !called {
		t.Fatalf("expected next.ServeHTTP to be called when under limit")
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
}

func TestMiddleware_429WithRetryAfter(t *testing.T) {
	l := New(Config{PerMin: 60, Burst: 1, MaxIPs: 100})
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	// First request burns the burst, second should 429.
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("POST", "/api/docs", nil)
		req.RemoteAddr = "5.6.7.8:1234"
		rr := httptest.NewRecorder()
		l.Middleware(next).ServeHTTP(rr, req)
		if i == 1 {
			if rr.Code != http.StatusTooManyRequests {
				t.Fatalf("expected 429 on second hit, got %d", rr.Code)
			}
			if rr.Header().Get("Retry-After") == "" {
				t.Fatalf("expected Retry-After header on 429 response")
			}
			if rr.Header().Get("Content-Type") != "application/json" {
				t.Fatalf("expected JSON response body for 429")
			}
		}
	}
}

func TestClientIP_PrefersXForwardedFor(t *testing.T) {
	req := httptest.NewRequest("POST", "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.5, 10.0.0.1")
	if ip := clientIP(req); ip != "203.0.113.5" {
		t.Fatalf("expected XFF first hop, got %q", ip)
	}
}

func TestClientIP_FallsBackToRemoteAddr(t *testing.T) {
	req := httptest.NewRequest("POST", "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	if ip := clientIP(req); ip != "10.0.0.1" {
		t.Fatalf("expected host without port, got %q", ip)
	}
}

func TestAllow_ConcurrentSafeUnderRace(t *testing.T) {
	// Run with -race; sync.Map + the mutex protect the cache.
	l := New(Config{PerMin: 600, Burst: 100, MaxIPs: 1000})
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			ip := string(rune('a' + (id % 26)))
			for j := 0; j < 50; j++ {
				_, _ = l.Allow(ip)
			}
		}(i)
	}
	wg.Wait()
}
