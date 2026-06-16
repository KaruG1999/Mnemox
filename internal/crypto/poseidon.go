package crypto

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/iden3/go-iden3-crypto/poseidon"
)

// bn254Modulus is the BN254 scalar field prime.
// p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
// Any value ≥ p is not a valid field element and will produce a root that
// diverges from on-chain Circom/Solidity verifiers.
var bn254Modulus, _ = new(big.Int).SetString(
	"21888242871839275222246405745257275088548364400416034343698204186575808495617",
	10,
)

// ValidateFieldElement returns an error if v is nil, negative, or ≥ the BN254
// scalar field modulus. Call this at every ingestion boundary before inserting
// into the Merkle tree.
func ValidateFieldElement(v *big.Int) error {
	if v == nil {
		return errors.New("nil field element")
	}
	if v.Sign() < 0 {
		return errors.New("negative field element")
	}
	if v.Cmp(bn254Modulus) >= 0 {
		return fmt.Errorf("value 0x%x exceeds BN254 scalar field modulus", v)
	}
	return nil
}

// Hash computes Poseidon over BN254 scalar field.
// This matches Stellar Protocol 26 (Yardstick) native host functions and Circom's poseidon.
func Hash(inputs []*big.Int) (*big.Int, error) {
	return poseidon.Hash(inputs)
}
