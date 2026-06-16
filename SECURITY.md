# SECURITY.md — Mnemox ZK Event Indexer

**Scope:** Production deployment of Mnemox as a Data Availability sidecar for ZK applications on Stellar.
**Audience:** Senior Systems Engineers auditing cryptographic infrastructure.

---

## 1. Cryptographic Blindness

### Formal Statement

Mnemox processes exclusively **irreversible 32-byte Poseidon commitments** over the BN254 scalar field. It retains zero plaintext metadata, zero user identifiers, and zero secret witnesses. It is structurally incapable of compromising ZK privacy regardless of its operational state.

### What Is Indexed

When a user deposits into a Soroban pool contract, the on-chain VM emits a `new_commitment_event`. The event's `topic[1]` is an XDR-encoded `SCV_U256` value: the output of `Poseidon(secret, nullifier)` computed inside the ZK circuit on the client. Mnemox decodes this value via `internal/ingestion/xdrdecode.go` and stores only the resulting 32-byte field element.

### Irreversibility Proof

Let `p = 21888242871839275222246405745257275088548364400416034343698204186575808495617` be the BN254 scalar field prime. The Poseidon permutation is a bijection over `GF(p)^t`, but the commitment is computed as:

```
C = Poseidon(secret || nullifier)  where  secret, nullifier ∈ GF(p)
```

Recovering `(secret, nullifier)` from `C` requires inverting a cryptographic hash function with a 254-bit output space. No sub-exponential algorithm is known. For practical purposes, preimage recovery is computationally infeasible.

### What Mnemox Does and Does Not Store

| Field | Stored by Mnemox | Location |
|---|---|---|
| Poseidon commitment `C = H(secret, nullifier)` | **Yes** | `events.value` (64-char hex) |
| Secret preimage (`secret`) | **No** | Client-side only |
| Nullifier (`nullifier`) | **No** | Client-side only |
| Depositor wallet address | **No** | Not present in `new_commitment_event` topics |
| Withdrawal target address | **No** | Not present in `new_commitment_event` topics |
| Merkle leaf index | Derived at query time | In-memory only (`internal/crypto/tree.go`) |
| Current Merkle root | Derived at query time | In-memory only |

**Consequence:** Full exfiltration of `mnemox.db` reveals only the ordered set of public commitments already observable on the Stellar ledger. The ZK privacy guarantee — the unlinkability of deposits and withdrawals — is enforced entirely by the on-chain verifier and the client-side circuit. Mnemox cannot weaken it.

### Trust Boundary Diagram

```
┌─────────────────── CLIENT (trusted enclave) ──────────────────────┐
│  secret, nullifier  →  Poseidon  →  C (commitment)                │
│                                     │                             │
│  ZK proof: π = Prove(secret, nullifier, path, root)               │
└─────────────────────────────────────┼─────────────────────────────┘
                                      │  C only (32 bytes)
                              Stellar on-chain
                                      │  new_commitment_event
                                      ▼
                    ┌─────────── MNEMOX (blind) ─────────────┐
                    │  Stores: C                              │
                    │  Returns: sibling_path(C), root        │
                    │  Never sees: secret, nullifier, π      │
                    └────────────────────────────────────────┘
```

### Ecosystem Compatibility

Mnemox's tree structure utilizes the exact same cryptographic primitive (Poseidon hash over the BN254 curve) found in Nethermind's Stellar Private Payments prototype, making Mnemox the ideal off-chain state provider for compliant Privacy Pools deployment on Soroban.

---

## 2. Threat Matrix

| Threat | Attack Scenario | Severity | Mitigation | Source Location |
|---|---|---|---|---|
| **Merkle Flooding** | Adversary submits valid BN254 commitments until the leaf array reaches 2^20 = 1,048,576 elements, triggering an out-of-bounds write that panics the process and corrupts in-flight proof generation | High | Boundary assertion at `idx >= 1<<20`: rejects insertion, emits `[CRITICAL] Cryptographic Engine: Merkle tree boundary reached. Page mutation required.`, returns a structured error — no panic, no silent drop | `internal/crypto/tree.go` · `Insert()` |
| **Stale State Injection** | A network-partitioned or lagging Mnemox instance serves a sibling path computed from an outdated Merkle tree; Spectra's ZK verifier accepts the stale root, or a crafted path forces an invalid proof through an unverified circuit | Critical | Stale State Guard: `GET /tree/proof/:commitment` queries Soroban RPC for `GetLatestLedger` before responding; if `rpc.Sequence > localCursor`, returns HTTP 503 `{"status":"DESYNC_LAG_PROTECTION","error":"Local ledger state behind network consensus"}` — the SDK converts this to a typed `MnemoxDesyncError` | `internal/server/handlers.go` · `assertSyncState()` |
| **WAL Tampering / Cold Boot Attack** | Adversary modifies `mnemox.db` at rest (WAL page rewrite, row deletion, ledger reordering) to cause `rebuildTree()` to reconstruct the Poseidon tree with wrong leaf order, diverging from the on-chain root and invalidating all downstream proofs | Critical | Cold Boot Monotonic Check: before `rebuildTree()`, `VerifyMonotonicity()` scans all events `ORDER BY id ASC` and asserts that ledger values are non-decreasing and event IDs are strictly increasing; any violation panics with `[SECURITY_ALERT] State reconstruction halted: WAL mutation or data tampering suspected.` | `internal/database/store.go` · `VerifyMonotonicity()` |
| **BN254 Field Overflow** | A maliciously crafted `SCV_U256` value ≥ scalar field prime `p` passes XDR decoding but produces a Poseidon hash that diverges from the on-chain Circom/Solidity verifier, silently corrupting the Merkle root | High | `ValidateFieldElement()` called at every ingestion boundary; rejects any `v ≥ p` at both XDR decode time and tree insert time | `internal/crypto/poseidon.go` · `ValidateFieldElement()`, `internal/ingestion/xdrdecode.go` · `decodeU256()` |
| **HTTP DoS (Proof Endpoint)** | High-frequency requests saturate the `O(n)` `FindLeaf` linear scan and the single SQLite connection, starving the ingestion pipeline of write access | Medium | Token-bucket rate limiter: 60-token burst capacity, 30 rps sustained refill; excess requests receive `429 Too Many Requests` with `Retry-After: 1` | `internal/server/server.go` · `rateLimit()` |
| **Loopback Bypass / Traffic Analysis** | Binding to `0.0.0.0` exposes the proof endpoint to public network traffic; timing analysis of proof request frequency can correlate ZK deposit events with user activity | Medium | Server binds exclusively to `127.0.0.1:PORT` (`cmd/mnemox/main.go`); all external access must route through an operator-controlled reverse proxy | `cmd/mnemox/main.go` · `srv.Addr` |
| **RPC Retention Window Expiry** | Stellar RPC nodes purge events older than ~7 days; on restart, a naive implementation re-anchors at the wrong ledger, skipping commitment leaves and producing an invalid root | Medium | `isOutOfRangeError()` detects the `-32600` / `startledger must be within` response codes; re-anchors via `oldestAvailableLedger()` which adds a +10 ledger safety buffer | `internal/ingestion/streamer.go` · `pollLoop()` |
| **Ingestion Backpressure Failure** | A sudden ledger event spike fills the in-flight processing queue; without explicit capacity control, the process allocates unbounded memory or silently drops commitment events | Medium | Bounded `pageCh` channel (`ingestionBufferDepth = 4`); the producer goroutine blocks on the channel send when the consumer falls behind, throttling the Soroban RPC poll rate proportionally to processing throughput | `internal/ingestion/streamer.go` · `pollLoop()` / `processLoop()` |
| **SDK ReDoS** | Crafted commitment string with pathological character patterns exhausts the JavaScript event loop via catastrophic regex backtracking before a network request is made | Low | Single linear-time pattern `^0x[a-fA-F0-9]{64}$` compiled once; character class `[a-fA-F0-9]` has no alternation groups or nested quantifiers — O(n) per input character, no backtracking | `ui/sdk/src/index.ts` · `COMMITMENT_HEX_RE` |

---

## 3. High-Availability Federation

### Motivation

A single Mnemox instance is a single point of failure for proof availability. If the host is compromised, partitioned from Stellar RPC, or experiences a hardware failure, ZK circuit provers have no fallback source for Merkle siblings. Federated deployment distributes this dependency across independent providers.

### Quorum Architecture

Deploy a minimum of three independent Mnemox instances across geographically and organizationally distinct infrastructure providers. Each instance independently rehydrates its Poseidon tree from its own SQLite WAL on startup, protected by `VerifyMonotonicity()`.

```
Stellar Soroban RPC ──────────────────────────────────────────┐
                                                              │  (same chain state)
┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  Mnemox     │    │  Mnemox     │    │  Mnemox     │◄───────┘
│  Node A     │    │  Node B     │    │  Node C     │
│  (EU)       │    │  (US)       │    │  (APAC)     │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │  root_A          │  root_B           │  root_C
       └──────────────────┼───────────────────┘
                          ▼
              ┌──────────────────────┐
              │  ZK Circuit Client   │
              │  (Spectra / Prover)  │
              │                      │
              │  Assert:             │
              │  root_A == root_B    │
              │       == root_C      │
              └──────────────────────┘
```

### Root Cross-Verification Protocol

Before generating a ZK proof, the client application queries `GET /tree/root` on all `n` Mnemox instances and compares `root` and `leaf_count` fields.

| Step | Action |
|---|---|
| 1 | Query `GET /tree/root` on all `n` instances in parallel |
| 2 | Assert that at least `⌈n/2⌉ + 1` instances return an identical `root` value (Byzantine majority) |
| 3 | Proceed with `GET /tree/proof/:commitment` only against a majority-confirmed instance |
| 4 | Any root divergence triggers a client-side alert; proof generation is blocked until consensus is re-established |

### Fault Tolerance Properties

| Quorum Size (`n`) | Tolerated faulty instances (`f`) | Formula |
|---|---|---|
| 3 | 1 | `f = ⌊(n−1)/2⌋` |
| 5 | 2 | |
| 7 | 3 | |

A faulty instance cannot forge a valid majority root without compromising `⌊n/2⌋` additional independent hosts simultaneously. Each instance's `VerifyMonotonicity()` check at cold boot prevents a locally tampered database from producing a fraudulent root that matches the honest majority.

---

## 4. Host Hardening Checklist

All items are mandatory before accepting ZK prover traffic in production.

### File System Permissions

| Resource | Command | Rationale |
|---|---|---|
| SQLite WAL database | `chmod 600 mnemox.db` | Prevents OS-level users from reading or directly modifying WAL pages, bypassing `VerifyMonotonicity()` |
| WAL auxiliary files | `chmod 600 mnemox.db-wal mnemox.db-shm` | These files expose the uncommitted write-ahead log; world-readable means an attacker can reconstruct recent commitment insertions before they are checkpointed |
| Environment file | `chmod 600 .env` | `CONTRACT_ID` and `STELLAR_RPC_URL` are operational secrets; a readable `.env` enables targeted RPC endpoint spoofing |
| Database directory | `chmod 700 /opt/mnemox/data/` | Directory listing exposes WAL auxiliary file names |
| Binary | `chmod 750 /opt/mnemox/bin/mnemox` | Prevents execution by non-privileged OS users |

### Process Isolation

| Requirement | Implementation |
|---|---|
| Dedicated non-root service user | `useradd -r -s /sbin/nologin -d /opt/mnemox mnemox` |
| No capability escalation | `NoNewPrivileges=true` in systemd unit |
| Isolated `/tmp` | `PrivateTmp=true` in systemd unit |
| Read-only system paths | `ProtectSystem=strict` in systemd unit |
| Scoped write access | `ReadWritePaths=/opt/mnemox/data` in systemd unit |
| Empty ambient capabilities | `AmbientCapabilities=` (empty) in systemd unit |

### Network Binding

| Requirement | Configuration | Rationale |
|---|---|---|
| Loopback-only binding | `srv.Addr = "127.0.0.1:" + port` in `cmd/mnemox/main.go` | Blocks direct public access to proof endpoints; eliminates network-layer traffic analysis |
| TLS termination | Nginx or Caddy reverse proxy on the public interface | Encrypts the proof path payload in transit; prevents passive interception of sibling hashes |
| Egress firewall | Allow only `STELLAR_RPC_URL:443` outbound | Prevents SSRF through a compromised `STELLAR_RPC_URL` config value reaching internal network resources |

### Systemd Unit

```ini
[Unit]
Description=Mnemox ZK Event Indexer
Documentation=https://github.com/karengiannetto/mnemox
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=mnemox
Group=mnemox
WorkingDirectory=/opt/mnemox
EnvironmentFile=/opt/mnemox/.env
ExecStart=/opt/mnemox/bin/mnemox
Restart=on-failure
RestartSec=5s

# Privilege hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
ReadWritePaths=/opt/mnemox/data
AmbientCapabilities=

# Syscall filter — mnemox requires only basic POSIX + socket syscalls
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

[Install]
WantedBy=multi-user.target
```

### Post-Deploy Verification

```bash
# Confirm loopback-only binding
ss -tlnp | grep mnemox
# Expected: 127.0.0.1:<port>  (NOT 0.0.0.0 or :::)

# Confirm file permissions
stat -c "%a %n" /opt/mnemox/data/mnemox.db
# Expected: 600

# Confirm process user
ps aux | grep mnemox
# Expected: mnemox   <pid>  ...

# Confirm API is live
curl -s http://127.0.0.1:8080/health | jq .status
# Expected: "ok"
```
