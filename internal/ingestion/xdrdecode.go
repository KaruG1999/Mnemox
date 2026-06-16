package ingestion

import (
	"fmt"
	"math/big"

	"github.com/stellar/go/xdr"

	"github.com/karengiannetto/mnemox/internal/crypto"
)

// decodeSymbol decodes a base64 XDR ScVal (SCV_SYMBOL) to a plain string.
// Used to extract the event name from topic[0].
func decodeSymbol(b64 string) (string, error) {
	var val xdr.ScVal
	if err := xdr.SafeUnmarshalBase64(b64, &val); err != nil {
		return "", err
	}
	if val.Type != xdr.ScValTypeScvSymbol {
		return "", fmt.Errorf("expected ScvSymbol, got %v", val.Type)
	}
	sym, ok := val.GetSym()
	if !ok {
		return "", fmt.Errorf("failed to get symbol")
	}
	return string(sym), nil
}

// decodeU256 decodes a base64 XDR ScVal (SCV_U256) to a big.Int.
// Used to extract the Poseidon commitment from topic[1] of new_commitment_event.
func decodeU256(b64 string) (*big.Int, error) {
	var val xdr.ScVal
	if err := xdr.SafeUnmarshalBase64(b64, &val); err != nil {
		return nil, err
	}
	if val.Type != xdr.ScValTypeScvU256 {
		return nil, fmt.Errorf("expected ScvU256, got %v", val.Type)
	}
	parts, ok := val.GetU256()
	if !ok {
		return nil, fmt.Errorf("failed to get U256")
	}
	// Reconstruct the 256-bit integer from the four 64-bit limbs (big-endian).
	result := new(big.Int)
	result.SetUint64(uint64(parts.HiHi))
	result.Lsh(result, 64)
	result.Or(result, new(big.Int).SetUint64(uint64(parts.HiLo)))
	result.Lsh(result, 64)
	result.Or(result, new(big.Int).SetUint64(uint64(parts.LoHi)))
	result.Lsh(result, 64)
	result.Or(result, new(big.Int).SetUint64(uint64(parts.LoLo)))

	// Enforce BN254 scalar field boundary at the ingestion boundary.
	// A U256 can be up to 2^256-1; any value ≥ p will produce a Merkle root
	// that diverges from the on-chain Circom/Solidity verifier.
	if err := crypto.ValidateFieldElement(result); err != nil {
		return nil, fmt.Errorf("decodeU256: %w", err)
	}
	return result, nil
}
