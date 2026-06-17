# @mnemox/sdk

TypeScript client SDK for the **Mnemox ZK Event Indexer** — a Data Availability sidecar that permanently indexes Soroban contract events and exposes Poseidon Merkle proofs over HTTP.

The SDK provides:
- Typed Merkle proof retrieval from a local or federated Mnemox instance
- Transparent interception of the Go sidecar's Stale State Guard (HTTP 503 `DESYNC_LAG_PROTECTION`)
- Witness formatting compatible with **Noir** (Barretenberg backend) and **Circom** (BN254 Poseidon) circuit provers

**Runtime requirement:** Node.js ≥ 18 (native `fetch`) or any ES2022-capable browser.

---

## Installation

### From local path (monorepo / hackathon setup)

```bash
# From your project root
npm install ./ui/sdk
```

### Build the SDK first (if `dist/` is absent)

```bash
cd ui/sdk
npm install
npm run build
```

---

## Quick Start

### 1 — Initialize the client

```typescript
import { MnemoxClient } from "@mnemox/sdk";

// Connects to the loopback sidecar at the default port.
// Override `endpoint` for federated deployments.
const mnemox = new MnemoxClient({
  endpoint: "http://localhost:8080",
  timeout: 8_000, // ms; defaults to 10 000
});
```

### 2 — Request a Merkle proof

```typescript
// commitmentHex is the 64-char hex Poseidon commitment emitted by the
// Soroban pool contract's new_commitment_event (topic[1], SCV_U256).
const commitmentHex = "1a2b3c..."; // 64-char hex, 0x prefix optional

const proof = await mnemox.getSiblingPath(commitmentHex);

console.log("Leaf index:", proof.leaf_index);
console.log("Merkle root:", proof.root);
console.log("Sibling path depth:", proof.path.length); // 20 for a 2^20-leaf tree
console.log("Indexed at ledger:", proof.event_ledger);
```

### 3 — Handle the 503 Desync State Guard gracefully

The Go sidecar returns `HTTP 503` with `{"status":"DESYNC_LAG_PROTECTION"}` when its
local Poseidon tree is behind the Stellar network ledger. Serving a stale sibling path
to a ZK circuit prover would produce an invalid proof. The SDK intercepts this as a
typed `MnemoxDesyncError` so you can implement targeted retry logic:

```typescript
import {
  MnemoxClient,
  MnemoxDesyncError,
  MnemoxNotFoundError,
  MnemoxTimeoutError,
} from "@mnemox/sdk";

const mnemox = new MnemoxClient({ endpoint: "http://localhost:8080" });

async function fetchProofWithRetry(commitment: string, maxRetries = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const proof = await mnemox.getSiblingPath(commitment);

      // Format as Noir circuit witness parameters.
      const witness = proof.toNoirFormat();

      console.log("Proof ready for circuit:", {
        root: witness.root,           // 0x-prefixed, 64-char hex (256-bit BN254 field)
        leaf_index: witness.leaf_index,
        sibling_path: witness.sibling_path, // string[20], each 0x + 64 hex chars
      });

      await submitToNoirProver(witness);
      return;

    } catch (err) {
      if (err instanceof MnemoxDesyncError) {
        // Sidecar is behind network consensus — safe to retry after delay.
        console.warn(`[attempt ${attempt}/${maxRetries}] ${err.message}`);
        await new Promise((r) => setTimeout(r, 3_000 * attempt));
        continue;
      }

      if (err instanceof MnemoxNotFoundError) {
        // Commitment not in tree — wrong hash, wrong contract, or pre-genesis ledger.
        console.error("Commitment absent from indexed tree:", err.commitment);
        return;
      }

      if (err instanceof MnemoxTimeoutError) {
        console.error("Sidecar unreachable:", err.message);
        return;
      }

      // Unknown error — surface it.
      throw err;
    }
  }

  throw new Error(`Proof retrieval failed after ${maxRetries} attempts (sidecar still desynced).`);
}
```

### 4 — Pass the formatted witness to a Noir circuit prover

```typescript
import { Noir } from "@noir-lang/noir_js";
import { BarretenbergBackend } from "@noir-lang/backend_barretenberg";
import circuit from "./target/mnemox_membership.json";

async function submitToNoirProver(witness: {
  root: string;
  leaf_index: number;
  sibling_path: readonly string[];
}): Promise<void> {
  const backend = new BarretenbergBackend(circuit as CompiledCircuit);
  const noir = new Noir(circuit as CompiledCircuit, backend);

  // Noir receives BN254 field elements as 0x-prefixed 64-char hex strings.
  // `toNoirFormat()` performs this normalisation automatically.
  const { proof } = await noir.generateProof({
    root: witness.root,
    leaf_index: witness.leaf_index,
    sibling_path: witness.sibling_path,
    // ... other circuit inputs (nullifier, secret, etc.)
  });

  console.log("ZK proof generated:", proof);
}
```

### 5 — Quorum cross-verification (federated deployment)

```typescript
const instances = [
  new MnemoxClient({ endpoint: "http://node-eu.example.com:8080" }),
  new MnemoxClient({ endpoint: "http://node-us.example.com:8080" }),
  new MnemoxClient({ endpoint: "http://node-ap.example.com:8080" }),
];

const roots = await Promise.all(instances.map((c) => c.getTreeRoot()));

const rootValues = roots.map((r) => r.root);
const consensus = rootValues.every((r) => r === rootValues[0]);

if (!consensus) {
  throw new Error(
    `[Quorum] Merkle root divergence detected across instances. ` +
      `Roots: ${rootValues.join(", ")}`
  );
}
console.log("Quorum consensus root:", rootValues[0]);
```

---

## API Reference

### `MnemoxConfig`

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `endpoint` | `string` | No | `"http://localhost:8080"` | Base URL of the Mnemox sidecar. Trailing slash is stripped. |
| `timeout` | `number` | No | `10000` | Per-request abort timeout in milliseconds. |

### `MnemoxProofResponse`

Returned by `getSiblingPath()`. All fields are readonly.

| Field | Type | Description |
|---|---|---|
| `commitment` | `string` | Queried Poseidon commitment — 64-char lowercase hex, no `0x` prefix. |
| `leaf_index` | `number` | Zero-based position of this leaf in the incremental Merkle tree. |
| `path` | `readonly string[]` | Sibling hashes from leaf level to root. Length = tree depth (20). Each entry: `0x` + 64 hex chars. |
| `root` | `string` | Current Poseidon Merkle root as a `0x`-prefixed hex string. |
| `event_ledger` | `number` | Stellar ledger sequence number at which the commitment was emitted. |
| `event_ledger_timestamp` | `string` | ISO-8601 UTC timestamp of the emitting ledger close. |
| `toNoirFormat()` | `() => NoirWitnessPath` | Re-encodes the proof as a Noir/Circom witness argument object. Root is zero-padded to 64 hex chars; `sibling_path` entries are already padded by the sidecar. |

### `NoirWitnessPath`

Produced by `MnemoxProofResponse.toNoirFormat()`.

| Field | Type | Description |
|---|---|---|
| `root` | `string` | `0x`-prefixed, zero-padded 64-char hex BN254 field element. |
| `leaf_index` | `number` | Zero-based leaf index. Pass directly to the circuit's `leaf_index` input. |
| `sibling_path` | `readonly string[]` | Ordered sibling hashes. Each: `0x` + 64 hex chars. Maps to the circuit's `sibling_path` array input of length `depth` (20). |

### `MnemoxDesyncError`

| Property | Type | Value |
|---|---|---|
| `name` | `string` | `"MnemoxDesyncError"` |
| `status` | `503` | HTTP status that triggered this error. |
| `code` | `"DESYNC_LAG_PROTECTION"` | Matches the Go sidecar's status payload field. |
| `message` | `string` | `"[Mnemox SDK] Circuit Generation Halted: Local sidecar ledger is lagging behind network consensus. Retry when synchronization finishes."` |

**Cause:** The sidecar's `assertSyncState()` detected that `rpc_ledger > local_cursor`. Serving a sibling path from a stale tree would produce circuit witnesses for an outdated Merkle root, causing proof verification failure on-chain.

**Resolution:** The ingestion loop re-synchronises automatically. Implement exponential backoff retry (3–30 seconds).

### `MnemoxNotFoundError`

| Property | Type | Description |
|---|---|---|
| `name` | `string` | `"MnemoxNotFoundError"` |
| `status` | `404` | HTTP status that triggered this error. |
| `commitment` | `string` | The queried commitment hash. |

**Cause:** The commitment is not present in the indexed tree. Possible causes: wrong commitment value, wrong contract ID configured in the sidecar, or the event was emitted before the configured `START_LEDGER`.

### `MnemoxTimeoutError`

| Property | Type | Description |
|---|---|---|
| `name` | `string` | `"MnemoxTimeoutError"` |
| `timeoutMs` | `number` | The configured timeout that was exceeded. |

**Cause:** The sidecar did not respond within `config.timeout` milliseconds. Verify the sidecar process is running and the endpoint is reachable.

---

## Error Handling Decision Tree

```
getSiblingPath() throws
├── TypeError            → Invalid hex input. Fix the commitment string format.
├── MnemoxDesyncError    → Sidecar behind network. Retry with backoff.
├── MnemoxNotFoundError  → Commitment not indexed. Verify hash and contract ID.
├── MnemoxTimeoutError   → Sidecar unreachable. Check process and network.
└── Error (generic)      → HTTP 4xx/5xx or network failure. Inspect message.
```

---

## Security Model

The Mnemox sidecar is **cryptographically blind**: it stores only irreversible 32-byte Poseidon commitments (`H(secret, nullifier)`). The secret preimage and nullifier never leave the client-side application layer. A full compromise of the sidecar host reveals only data already publicly observable on the Stellar ledger.

The `MnemoxDesyncError` interception is the primary safety gate: it prevents a compromised or lagging instance from feeding stale witnesses into a circuit prover, which would produce proofs that fail on-chain verification.

See [`SECURITY.md`](../../SECURITY.md) for the full threat model, attack vector mitigations, and federated deployment hardening specifications.
