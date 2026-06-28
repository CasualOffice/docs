// Copyright (c) 2026 Casual Office. All rights reserved.

package local

import (
	"context"
	"fmt"
	"testing"
)

// BenchmarkStore measures the upload hot path — write a docx +
// meta sidecar atomically. A 100 KB payload is roughly the size of
// a thin one-page doc; real documents climb into MB territory but
// the cost grows linearly with payload, so this is the fixed-cost
// baseline.
func BenchmarkStore(b *testing.B) {
	s, err := New(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	payload := make([]byte, 100*1024)
	for i := range payload {
		payload[i] = byte(i % 256)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := s.Store(fmt.Sprintf("bench-%d.docx", i), payload); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkFetch measures the per-read cost a single co-edit room
// pays on first join (the gateway calls Fetch to seed the Y.Doc).
// Same 100 KB shape as BenchmarkStore.
func BenchmarkFetch(b *testing.B) {
	s, err := New(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	payload := make([]byte, 100*1024)
	docID, err := s.Store("fetched.docx", payload)
	if err != nil {
		b.Fatal(err)
	}
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, _, err := s.Fetch(ctx, docID, ""); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkList measures the personal-mode /files response cost. A
// 500-doc directory is the upper bound of "things one user
// realistically accumulates"; the scan walks every .meta.json
// sidecar in the root.
func BenchmarkList(b *testing.B) {
	s, err := New(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	payload := make([]byte, 4096)
	for i := 0; i < 500; i++ {
		if _, err := s.Store(fmt.Sprintf("doc-%d.docx", i), payload); err != nil {
			b.Fatal(err)
		}
	}
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := s.List(ctx); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkSnapshot measures the co-edit save hot path. Same
// 100 KB payload, but Snapshot also reads + rewrites the meta
// sidecar (adds a revision entry) so the cost is moderately
// higher than Store.
func BenchmarkSnapshot(b *testing.B) {
	s, err := New(b.TempDir())
	if err != nil {
		b.Fatal(err)
	}
	docID, err := s.Store("bench.docx", []byte("seed"))
	if err != nil {
		b.Fatal(err)
	}
	payload := make([]byte, 100*1024)
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := s.Snapshot(ctx, docID, "", payload); err != nil {
			b.Fatal(err)
		}
	}
}
