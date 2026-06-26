package crypto

import (
	"fmt"
	"math/big"
	"testing"
)

// BenchmarkTreeInsertionAndProof measures the ZK witness hot path:
// sequential Poseidon leaf insertion followed by immediate O(1) map-cached
// FindLeaf and sibling-path proof reconstruction.
//
// Two sub-benchmarks:
//   - sequential_insert_and_proof: one insert + one proof per iteration,
//     reflecting the incremental write pattern of the ingestion pipeline.
//   - concurrent_proof_reads: parallel FindLeaf + Proof calls on a
//     pre-populated tree, exercising the RWMutex read path under load.
//
// Run with:
//
//	go test -bench=. ./internal/crypto/...
//	go test -bench=. -benchmem ./internal/crypto/...
//	go test -bench=BenchmarkTreeInsertionAndProof/concurrent -cpu=1,2,4,8 ./internal/crypto/...
func BenchmarkTreeInsertionAndProof(b *testing.B) {

	// ── Sequential insert + proof ─────────────────────────────────────────────
	// Each iteration inserts one leaf then immediately requests its inclusion
	// proof. This stresses the path that the ingestion loop + proof endpoint
	// exercise together: Insert → FindLeaf (O(1) leafIndex cache) → Proof.
	b.Run("sequential_insert_and_proof", func(b *testing.B) {
		tree, err := NewTree(20)
		if err != nil {
			b.Fatal(err)
		}
		b.ReportAllocs()
		b.ResetTimer()

		for i := 0; i < b.N; i++ {
			leaf := big.NewInt(int64(i + 1))

			if err := tree.Insert(leaf); err != nil {
				// 2^20 capacity reached — terminate cleanly.
				b.Logf("tree full at iteration %d (2^20 leaf limit); stopping", i)
				return
			}

			// O(1) lookup via the leafIndex map; FindLeaf was O(n) before the cache.
			commitment := fmt.Sprintf("%064x", leaf)
			idx := tree.FindLeaf(commitment)
			if idx < 0 {
				b.Fatalf("FindLeaf returned -1 for just-inserted leaf at iteration %d", i)
			}

			if _, err := tree.Proof(idx); err != nil {
				b.Fatalf("Proof(%d): %v", idx, err)
			}
		}
	})

	// ── Concurrent proof reads ────────────────────────────────────────────────
	// Reflects the real access pattern: a single ingestion goroutine holds the
	// write lock intermittently while many ZK-prover clients hit /tree/proof
	// in parallel. FindLeaf and Proof both acquire the read lock (RLock), so
	// they should not block each other — this sub-benchmark surfaces any
	// contention that would appear under production load.
	b.Run("concurrent_proof_reads", func(b *testing.B) {
		tree, err := NewTree(20)
		if err != nil {
			b.Fatal(err)
		}

		const preload = 1024
		hexKeys := make([]string, preload)
		for i := 0; i < preload; i++ {
			leaf := big.NewInt(int64(i + 1))
			if err := tree.Insert(leaf); err != nil {
				b.Fatalf("preload insert %d: %v", i, err)
			}
			hexKeys[i] = fmt.Sprintf("%064x", leaf)
		}

		b.ReportAllocs()
		b.ResetTimer()

		b.RunParallel(func(pb *testing.PB) {
			i := 0
			for pb.Next() {
				key := hexKeys[i%preload]

				idx := tree.FindLeaf(key)
				if idx < 0 {
					b.Errorf("FindLeaf miss for preloaded commitment %s", key)
					return
				}

				if _, err := tree.Proof(idx); err != nil {
					b.Errorf("Proof(%d): %v", idx, err)
				}
				i++
			}
		})
	})
}
