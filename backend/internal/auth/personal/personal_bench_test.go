package personal

import (
	"context"
	"fmt"
	"testing"
)

// BenchmarkVerify measures the steady-state cost of a /auth/login.
// Bcrypt at cost 12 is the dominant term (~250ms on a modern laptop);
// cost 4 here so the bench number stays useful as a regression
// signal without taking forever. Operators tune bcrypt cost via
// NewWithOptions; production cost = 12.
func BenchmarkVerify(b *testing.B) {
	s, err := NewWithOptions(b.TempDir(), 4)
	if err != nil {
		b.Fatal(err)
	}
	defer s.Close()
	if _, err := s.Create(context.Background(), "bench@example.com", "benchpass1", ""); err != nil {
		b.Fatal(err)
	}
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := s.Verify(ctx, "bench@example.com", "benchpass1"); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkCreate measures /auth/signup. The bcrypt cost dominates;
// SQLite write contention is negligible at single-user scale.
func BenchmarkCreate(b *testing.B) {
	s, err := NewWithOptions(b.TempDir(), 4)
	if err != nil {
		b.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		email := fmt.Sprintf("bench-%d@example.com", i)
		if _, err := s.Create(ctx, email, "passw0rd!", ""); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkListUsers measures the admin-page query. The seed size
// (100 users) is the upper bound a real solo deploy ever hits; the
// query cost scales linearly with row count and there's no index
// on created_at (the ORDER BY uses a default scan).
func BenchmarkListUsers(b *testing.B) {
	s, err := NewWithOptions(b.TempDir(), 4)
	if err != nil {
		b.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	for i := 0; i < 100; i++ {
		_, _ = s.Create(ctx, fmt.Sprintf("user-%d@example.com", i), "passw0rd!", "")
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := s.List(ctx); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkSessionSignVerify measures the HMAC round-trip. This is
// in the hot path of every authenticated request (the cookie is
// re-verified server-side per request). Sub-microsecond is the
// expected ballpark.
func BenchmarkSessionSignVerify(b *testing.B) {
	sess, err := NewSession([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		b.Fatal(err)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		tok := sess.Sign("user-bench", 60)
		if _, err := sess.Verify(tok); err != nil {
			b.Fatal(err)
		}
	}
}
