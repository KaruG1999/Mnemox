package crypto

import (
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"sync"
)

// MerkleTree is an incremental Merkle tree of depth 20 using Poseidon hashing.
// Pattern follows Tornado Cash / Semaphore: zero values fill unpopulated subtrees.
type MerkleTree struct {
	mu             sync.RWMutex
	depth          int
	leaves         []*big.Int
	zeros          []*big.Int // zeros[i] = zero value at level i (leaf=0, root=depth)
	filledSubtrees []*big.Int // current right-edge at each level
	leafIndex      map[string]int // 64-char lowercase hex → leaf position; O(1) FindLeaf
}

func NewTree(depth int) (*MerkleTree, error) {
	zeros := make([]*big.Int, depth+1)
	zeros[0] = big.NewInt(0)
	for i := 1; i <= depth; i++ {
		h, err := Hash([]*big.Int{zeros[i-1], zeros[i-1]})
		if err != nil {
			return nil, err
		}
		zeros[i] = h
	}

	filledSubtrees := make([]*big.Int, depth)
	for i := range filledSubtrees {
		filledSubtrees[i] = new(big.Int).Set(zeros[i])
	}

	return &MerkleTree{
		depth:          depth,
		zeros:          zeros,
		filledSubtrees: filledSubtrees,
		leafIndex:      make(map[string]int),
	}, nil
}

func (t *MerkleTree) Insert(commitment *big.Int) error {
	// Enforce BN254 scalar field boundary before the value reaches the tree.
	// A value ≥ p produces a root that diverges from the on-chain Circom verifier.
	if err := ValidateFieldElement(commitment); err != nil {
		return fmt.Errorf("merkle insert: %w", err)
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	idx := len(t.leaves)
	maxLeaves := 1 << t.depth

	// At 2^20 leaves the tree is full. Reject the insertion rather than allowing
	// an out-of-bounds write that would corrupt in-flight ZK proof generation.
	if idx >= maxLeaves {
		log.Printf("[CRITICAL] Cryptographic Engine: Merkle tree boundary reached. Page mutation required.")
		return errors.New("merkle tree is full")
	}

	t.leaves = append(t.leaves, new(big.Int).Set(commitment))
	t.leafIndex[fmt.Sprintf("%064x", commitment)] = idx

	current := new(big.Int).Set(commitment)
	pos := idx
	for level := 0; level < t.depth; level++ {
		var left, right *big.Int
		if pos%2 == 0 {
			// current node is left child; right sibling is zero
			left = current
			right = t.zeros[level]
			t.filledSubtrees[level] = new(big.Int).Set(current)
		} else {
			// current node is right child; left sibling is the stored filled subtree
			left = t.filledSubtrees[level]
			right = current
		}
		h, err := Hash([]*big.Int{left, right})
		if err != nil {
			return err
		}
		current = h
		pos >>= 1
	}
	return nil
}

func (t *MerkleTree) Root() *big.Int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	root, err := t.computeRoot()
	if err != nil {
		// Unreachable when BN254 validation is enforced at Insert.
		// Return the empty-tree root rather than crashing the API server.
		log.Printf("merkle: computeRoot error (returning zero root): %v", err)
		return new(big.Int).Set(t.zeros[t.depth])
	}
	return root
}

func (t *MerkleTree) computeRoot() (*big.Int, error) {
	n := len(t.leaves)
	if n == 0 {
		return new(big.Int).Set(t.zeros[t.depth]), nil
	}

	layer := make([]*big.Int, n)
	for i, l := range t.leaves {
		layer[i] = new(big.Int).Set(l)
	}

	for level := 0; level < t.depth; level++ {
		next := make([]*big.Int, (len(layer)+1)/2)
		for i := 0; i < len(next); i++ {
			left := layer[2*i]
			var right *big.Int
			if 2*i+1 < len(layer) {
				right = layer[2*i+1]
			} else {
				right = t.zeros[level]
			}
			h, err := Hash([]*big.Int{left, right})
			if err != nil {
				return nil, fmt.Errorf("computeRoot level %d node %d: %w", level, i, err)
			}
			next[i] = h
		}
		layer = next
	}
	return layer[0], nil
}

// Proof returns the sibling path (as hex strings) for the leaf at leafIndex.
func (t *MerkleTree) Proof(leafIndex int) ([]string, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()

	if leafIndex < 0 || leafIndex >= len(t.leaves) {
		return nil, errors.New("leaf index out of range")
	}

	// Build each level from leaves up
	layer := make([]*big.Int, len(t.leaves))
	for i, l := range t.leaves {
		layer[i] = new(big.Int).Set(l)
	}

	path := make([]string, t.depth)
	idx := leafIndex

	for level := 0; level < t.depth; level++ {
		var sibling *big.Int
		sibIdx := idx ^ 1 // toggle last bit
		if sibIdx < len(layer) {
			sibling = layer[sibIdx]
		} else {
			sibling = t.zeros[level]
		}
		path[level] = fmt.Sprintf("0x%064x", sibling)

		// Build next layer
		next := make([]*big.Int, (len(layer)+1)/2)
		for i := 0; i < len(next); i++ {
			left := layer[2*i]
			var right *big.Int
			if 2*i+1 < len(layer) {
				right = layer[2*i+1]
			} else {
				right = t.zeros[level]
			}
			h, err := Hash([]*big.Int{left, right})
			if err != nil {
				return nil, fmt.Errorf("Proof level %d node %d: %w", level, i, err)
			}
			next[i] = h
		}
		layer = next
		idx >>= 1
	}
	return path, nil
}

func (t *MerkleTree) LeafCount() int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return len(t.leaves)
}

// FindLeaf returns the index of the leaf whose hex value matches the given string.
// Input may carry an optional 0x prefix; it is normalised to 64-char lowercase hex
// before the O(1) map lookup. Returns -1 if the commitment is not in the tree.
func (t *MerkleTree) FindLeaf(value string) int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	raw := strings.ToLower(strings.TrimPrefix(value, "0x"))
	if len(raw) > 64 {
		return -1
	}
	if len(raw) < 64 {
		raw = strings.Repeat("0", 64-len(raw)) + raw
	}
	if i, ok := t.leafIndex[raw]; ok {
		return i
	}
	return -1
}
