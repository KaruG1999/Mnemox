package crypto

import (
	"fmt"
	"math/big"
	"testing"
)

func TestPoseidonDeterministic(t *testing.T) {
	h, err := Hash([]*big.Int{big.NewInt(0), big.NewInt(1)})
	if err != nil {
		t.Fatal(err)
	}
	h2, _ := Hash([]*big.Int{big.NewInt(0), big.NewInt(1)})
	if h.Cmp(h2) != 0 {
		t.Fatal("poseidon not deterministic")
	}
	t.Logf("Poseidon(0,1) = 0x%x", h)
}

func TestTreeInsertAndRoot(t *testing.T) {
	tree, err := NewTree(20)
	if err != nil {
		t.Fatal(err)
	}

	commitments := []*big.Int{big.NewInt(1), big.NewInt(2), big.NewInt(3)}
	for _, c := range commitments {
		if err := tree.Insert(c); err != nil {
			t.Fatalf("insert %v: %v", c, err)
		}
	}

	if tree.LeafCount() != 3 {
		t.Fatalf("expected 3 leaves, got %d", tree.LeafCount())
	}

	root := tree.Root()
	if root == nil || root.Sign() == 0 {
		t.Fatal("root should be non-zero")
	}
	t.Logf("root(3 leaves) = 0x%x", root)
}

func TestTreeProof(t *testing.T) {
	tree, err := NewTree(20)
	if err != nil {
		t.Fatal(err)
	}

	for i := 0; i < 4; i++ {
		tree.Insert(big.NewInt(int64(i + 1)))
	}

	path, err := tree.Proof(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(path) != 20 {
		t.Fatalf("expected 20 siblings, got %d", len(path))
	}
	t.Logf("proof[0] = %s", path[0])
}

func TestFindLeaf(t *testing.T) {
	tree, _ := NewTree(20)
	tree.Insert(big.NewInt(42))

	// Stored as 64-char zero-padded hex — must match the same format as the ingestion layer.
	hex64 := fmt.Sprintf("%064x", big.NewInt(42))
	idx := tree.FindLeaf(hex64)
	if idx != 0 {
		t.Fatalf("expected leaf at index 0, got %d (query=%s)", idx, hex64)
	}

	// Also works with 0x prefix.
	idx2 := tree.FindLeaf("0x" + hex64)
	if idx2 != 0 {
		t.Fatalf("expected leaf at index 0 with 0x prefix, got %d", idx2)
	}

	missing := tree.FindLeaf("nonexistent")
	if missing != -1 {
		t.Fatal("expected -1 for missing leaf")
	}
}

// TestBN254FieldOverflowRejection asserts that Insert rejects values at or above
// the BN254 scalar field modulus p and accepts the largest valid element p−1.
func TestBN254FieldOverflowRejection(t *testing.T) {
	p, ok := new(big.Int).SetString(
		"21888242871839275222246405745257275088548364400416034343698204186575808495617", 10)
	if !ok {
		t.Fatal("failed to parse BN254 modulus")
	}

	tree, err := NewTree(20)
	if err != nil {
		t.Fatal(err)
	}

	// p is not a valid field element — it equals the modulus.
	if err := tree.Insert(p); err == nil {
		t.Fatal("expected rejection of value equal to BN254 modulus")
	}

	// p+1 is clearly out of range.
	if err := tree.Insert(new(big.Int).Add(p, big.NewInt(1))); err == nil {
		t.Fatal("expected rejection of value exceeding BN254 modulus")
	}

	// p−1 is the largest valid field element and must be accepted.
	pMinus1 := new(big.Int).Sub(p, big.NewInt(1))
	if err := tree.Insert(pMinus1); err != nil {
		t.Fatalf("expected p-1 to be accepted as valid BN254 field element: %v", err)
	}

	if tree.LeafCount() != 1 {
		t.Fatalf("expected exactly 1 leaf after rejecting overflows, got %d", tree.LeafCount())
	}
}
