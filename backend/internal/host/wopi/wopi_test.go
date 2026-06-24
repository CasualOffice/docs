package wopi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/schnsrw/docx/backend/internal/host"
)

// mockHost spins up a WOPI host simulator. Each test wires up the
// HandlerFunc for the file id and url pattern it cares about; the
// fixture exposes the URL the WOPI Store should treat as wopiSrc
// (i.e. the base path to /wopi/files/{id}).
type mockHost struct {
	srv *httptest.Server
	mux *http.ServeMux
}

func newMockHost(t *testing.T) *mockHost {
	t.Helper()
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &mockHost{srv: srv, mux: mux}
}

// wopiSrc returns the host's URL of the form /wopi/files/{id}. Tests
// register handlers against this base path; the Store appends
// /contents internally.
func (m *mockHost) wopiSrc(id string) string {
	return m.srv.URL + "/wopi/files/" + id
}

// TestEncodeDecodeDocID — round-trip preserves the URL.
func TestEncodeDecodeDocID(t *testing.T) {
	in := "https://host.example/wopi/files/abc?path=foo"
	id := EncodeDocID(in)
	if id == in {
		t.Error("EncodeDocID returned the URL unchanged")
	}
	out, err := DecodeDocID(id)
	if err != nil {
		t.Fatal(err)
	}
	if out != in {
		t.Errorf("round-trip: in=%q out=%q", in, out)
	}
}

// TestDecodeDocID_RejectsBadEncoding — random non-base64 falls back
// to host.ErrNotFound so the gateway returns 404, not 400.
func TestDecodeDocID_RejectsBadEncoding(t *testing.T) {
	if _, err := DecodeDocID("@@@not-base64@@@"); !errors.Is(err, host.ErrNotFound) {
		t.Errorf("got %v, want host.ErrNotFound", err)
	}
}

// TestDecodeDocID_RejectsNonHTTPURL — bytes decode but the result
// isn't an http(s):// URL. Defends against an attacker who crafts a
// docID that decodes to a `file://...` or `unix:...` path the
// gateway would happily request.
func TestDecodeDocID_RejectsNonHTTPURL(t *testing.T) {
	bad := EncodeDocID("file:///etc/passwd")
	if _, err := DecodeDocID(bad); !errors.Is(err, host.ErrNotFound) {
		t.Errorf("got %v, want host.ErrNotFound", err)
	}
}

// TestFetch_HappyPath — CheckFileInfo + GetFile both succeed.
func TestFetch_HappyPath(t *testing.T) {
	m := newMockHost(t)
	m.mux.HandleFunc("/wopi/files/abc", func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("access_token"); got != "tok-1" {
			t.Errorf("access_token = %q", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"BaseFileName": "demo.docx",
			"Version":      "v42",
			"UserCanWrite": true,
		})
	})
	m.mux.HandleFunc("/wopi/files/abc/contents", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("PK\x03\x04 wopi bytes"))
	})

	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	bytes, info, err := s.Fetch(context.Background(), docID, "tok-1")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if string(bytes) != "PK\x03\x04 wopi bytes" {
		t.Errorf("bytes = %q", string(bytes))
	}
	if info.FileName != "demo.docx" || info.Version != "v42" || !info.UserCanWrite {
		t.Errorf("info = %+v", info)
	}
}

// TestFetch_CheckFileInfo401_Forbidden — auth failure on the
// metadata call surfaces as host.ErrForbidden so the gateway closes
// the WS with the re-auth signal.
func TestFetch_CheckFileInfo401_Forbidden(t *testing.T) {
	m := newMockHost(t)
	m.mux.HandleFunc("/wopi/files/abc", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "no", http.StatusUnauthorized)
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if _, _, err := s.Fetch(context.Background(), docID, "tok"); !errors.Is(err, host.ErrForbidden) {
		t.Errorf("got %v, want host.ErrForbidden", err)
	}
}

// TestFetch_404_NotFound — missing doc surfaces as host.ErrNotFound.
func TestFetch_404_NotFound(t *testing.T) {
	m := newMockHost(t)
	m.mux.HandleFunc("/wopi/files/missing", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "no", http.StatusNotFound)
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("missing"))
	if _, _, err := s.Fetch(context.Background(), docID, "tok"); !errors.Is(err, host.ErrNotFound) {
		t.Errorf("got %v, want host.ErrNotFound", err)
	}
}

// TestFetch_BadDocID — bytes don't decode → host.ErrNotFound. No
// outbound HTTP call.
func TestFetch_BadDocID(t *testing.T) {
	s := New(Options{})
	if _, _, err := s.Fetch(context.Background(), "@@", "tok"); !errors.Is(err, host.ErrNotFound) {
		t.Errorf("got %v, want host.ErrNotFound", err)
	}
}

// TestSnapshot_HappyPath — POST to /contents lands with the right
// override header, bytes match, returns nil.
func TestSnapshot_HappyPath(t *testing.T) {
	m := newMockHost(t)
	m.mux.HandleFunc("/wopi/files/abc/contents", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %q, want POST", r.Method)
		}
		if got := r.Header.Get("X-WOPI-Override"); got != "PUT" {
			t.Errorf("X-WOPI-Override = %q, want PUT", got)
		}
		body, _ := io.ReadAll(r.Body)
		if string(body) != "new bytes" {
			t.Errorf("body = %q", string(body))
		}
		w.WriteHeader(http.StatusOK)
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if err := s.Snapshot(context.Background(), docID, "tok", []byte("new bytes")); err != nil {
		t.Errorf("Snapshot: %v", err)
	}
}

// TestSnapshot_409_Conflict — lock mismatch surfaces as
// host.ErrConflict so the room manager can decide whether to retry.
func TestSnapshot_409_Conflict(t *testing.T) {
	m := newMockHost(t)
	m.mux.HandleFunc("/wopi/files/abc/contents", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "locked", http.StatusConflict)
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if err := s.Snapshot(context.Background(), docID, "tok", []byte("x")); !errors.Is(err, host.ErrConflict) {
		t.Errorf("got %v, want host.ErrConflict", err)
	}
}

// TestSnapshot_412_Conflict — precondition-failed maps to ErrConflict
// alongside 409 since both indicate "your write is stale".
func TestSnapshot_412_Conflict(t *testing.T) {
	m := newMockHost(t)
	m.mux.HandleFunc("/wopi/files/abc/contents", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "stale", http.StatusPreconditionFailed)
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if err := s.Snapshot(context.Background(), docID, "tok", []byte("x")); !errors.Is(err, host.ErrConflict) {
		t.Errorf("got %v, want host.ErrConflict", err)
	}
}

// TestSnapshot_EmptyRejectedLocally — an empty payload is rejected
// before any outbound call. A WOPI host might or might not accept
// an empty PUT; we never want to send one because it'd wipe the doc.
func TestSnapshot_EmptyRejectedLocally(t *testing.T) {
	m := newMockHost(t)
	calls := 0
	m.mux.HandleFunc("/wopi/files/abc/contents", func(http.ResponseWriter, *http.Request) {
		calls++
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if err := s.Snapshot(context.Background(), docID, "tok", nil); err == nil {
		t.Error("Snapshot(nil) returned nil; want error")
	}
	if calls != 0 {
		t.Errorf("outbound calls = %d; want 0 (rejected before HTTP)", calls)
	}
}

// TestEmptyAccessToken — Snapshot with no token is rejected without
// an outbound call. Same defence as nil-payload: never make a
// request the host will surely reject and that signals a client bug.
func TestEmptyAccessToken(t *testing.T) {
	m := newMockHost(t)
	calls := 0
	m.mux.HandleFunc("/wopi/files/abc/contents", func(http.ResponseWriter, *http.Request) {
		calls++
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if err := s.Snapshot(context.Background(), docID, "", []byte("x")); err == nil {
		t.Error("Snapshot(empty token) returned nil")
	}
	if calls != 0 {
		t.Errorf("outbound calls = %d; want 0", calls)
	}
}

// TestLock_HappyPath — POST to wopiSrc with X-WOPI-Override: LOCK
// and X-WOPI-Lock header; 200 → nil.
func TestLock_HappyPath(t *testing.T) {
	m := newMockHost(t)
	var seen struct {
		method   string
		override string
		lock     string
		token    string
	}
	m.mux.HandleFunc("/wopi/files/abc", func(w http.ResponseWriter, r *http.Request) {
		seen.method = r.Method
		seen.override = r.Header.Get("X-WOPI-Override")
		seen.lock = r.Header.Get("X-WOPI-Lock")
		seen.token = r.URL.Query().Get("access_token")
		w.WriteHeader(http.StatusOK)
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if err := s.Lock(context.Background(), docID, "lock-uuid-42", "tok-1"); err != nil {
		t.Fatalf("Lock: %v", err)
	}
	if seen.method != http.MethodPost || seen.override != "LOCK" ||
		seen.lock != "lock-uuid-42" || seen.token != "tok-1" {
		t.Errorf("wire shape mismatch: %+v", seen)
	}
}

// TestLock_ConflictAlreadyLocked — 409 surfaces as host.ErrConflict
// so the room manager refuses to open the room.
func TestLock_ConflictAlreadyLocked(t *testing.T) {
	m := newMockHost(t)
	m.mux.HandleFunc("/wopi/files/abc", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-WOPI-Lock", "held-by-someone-else")
		w.WriteHeader(http.StatusConflict)
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if err := s.Lock(context.Background(), docID, "mine", "tok"); !errors.Is(err, host.ErrConflict) {
		t.Errorf("got %v, want host.ErrConflict", err)
	}
}

// TestLock_EmptyLockIDRejected — caller bug surfaces locally
// without an outbound HTTP call.
func TestLock_EmptyLockIDRejected(t *testing.T) {
	s := New(Options{})
	docID := EncodeDocID("https://host.example/wopi/files/abc")
	if err := s.Lock(context.Background(), docID, "", "tok"); err == nil {
		t.Error("Lock with empty lockID returned nil")
	}
}

// TestUnlock_OverrideHeader — confirms the Unlock op uses the right
// X-WOPI-Override value, which is what the host switches on.
func TestUnlock_OverrideHeader(t *testing.T) {
	m := newMockHost(t)
	seenOverride := ""
	m.mux.HandleFunc("/wopi/files/abc", func(w http.ResponseWriter, r *http.Request) {
		seenOverride = r.Header.Get("X-WOPI-Override")
		w.WriteHeader(http.StatusOK)
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if err := s.Unlock(context.Background(), docID, "mine", "tok"); err != nil {
		t.Fatal(err)
	}
	if seenOverride != "UNLOCK" {
		t.Errorf("X-WOPI-Override = %q, want UNLOCK", seenOverride)
	}
}

// TestRefreshLock_OverrideHeader — same shape as Unlock, different
// override token.
func TestRefreshLock_OverrideHeader(t *testing.T) {
	m := newMockHost(t)
	seenOverride := ""
	m.mux.HandleFunc("/wopi/files/abc", func(w http.ResponseWriter, r *http.Request) {
		seenOverride = r.Header.Get("X-WOPI-Override")
		w.WriteHeader(http.StatusOK)
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if err := s.RefreshLock(context.Background(), docID, "mine", "tok"); err != nil {
		t.Fatal(err)
	}
	if seenOverride != "REFRESH_LOCK" {
		t.Errorf("X-WOPI-Override = %q, want REFRESH_LOCK", seenOverride)
	}
}

// TestLockOps_BadDocID — bad encoding surfaces as ErrNotFound
// before any outbound call. Same gate Fetch/Snapshot use.
func TestLockOps_BadDocID(t *testing.T) {
	s := New(Options{})
	for _, fn := range []func() error{
		func() error { return s.Lock(context.Background(), "@@", "id", "t") },
		func() error { return s.Unlock(context.Background(), "@@", "id", "t") },
		func() error { return s.RefreshLock(context.Background(), "@@", "id", "t") },
	} {
		if err := fn(); !errors.Is(err, host.ErrNotFound) {
			t.Errorf("got %v, want host.ErrNotFound", err)
		}
	}
}

// TestLockOps_401_Forbidden — auth failure on a lock op surfaces as
// host.ErrForbidden so the room manager can decide whether to retry
// after re-auth.
func TestLockOps_401_Forbidden(t *testing.T) {
	m := newMockHost(t)
	m.mux.HandleFunc("/wopi/files/abc", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "no", http.StatusUnauthorized)
	})
	s := New(Options{})
	docID := EncodeDocID(m.wopiSrc("abc"))
	if err := s.Lock(context.Background(), docID, "id", "bad-tok"); !errors.Is(err, host.ErrForbidden) {
		t.Errorf("got %v, want host.ErrForbidden", err)
	}
}

// TestUserAgent_SentOnEveryRequest — the User-Agent header lands on
// outbound requests so the host's logs can identify the editor.
func TestUserAgent_SentOnEveryRequest(t *testing.T) {
	m := newMockHost(t)
	seenUA := ""
	m.mux.HandleFunc("/wopi/files/abc", func(w http.ResponseWriter, r *http.Request) {
		seenUA = r.Header.Get("User-Agent")
		_ = json.NewEncoder(w).Encode(map[string]any{"BaseFileName": "x.docx", "Version": "1", "UserCanWrite": true})
	})
	m.mux.HandleFunc("/wopi/files/abc/contents", func(_ http.ResponseWriter, _ *http.Request) {})
	s := New(Options{UserAgent: "my-test-ua/1.0"})
	docID := EncodeDocID(m.wopiSrc("abc"))
	_, _, _ = s.Fetch(context.Background(), docID, "tok")
	if seenUA != "my-test-ua/1.0" {
		t.Errorf("UA = %q", seenUA)
	}
}
