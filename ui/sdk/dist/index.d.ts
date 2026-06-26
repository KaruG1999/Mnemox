/**
 * @mnemox/sdk — TypeScript client for the Mnemox ZK event indexer.
 *
 * Provides typed Merkle proof retrieval from a Mnemox sidecar and
 * witness formatting compatible with Noir and Circom ZK circuit provers.
 *
 * Runtime requirement: Node >= 18 (native fetch) or any modern browser.
 */
/**
 * Initialization parameters for MnemoxClient.
 *
 * @property endpoint - Base URL of the Mnemox sidecar. Defaults to
 *                      `http://localhost:8080` (loopback-only deployment).
 * @property timeout  - Per-request abort timeout in milliseconds. Defaults to 10 000.
 */
export interface MnemoxConfig {
    readonly endpoint?: string;
    readonly timeout?: number;
}
/**
 * Noir/Circom-compatible witness structure produced by `toNoirFormat()`.
 *
 * All hex fields are normalised to 0x-prefixed, 64-character (256-bit)
 * zero-padded strings — the representation expected by Barretenberg and
 * Circom BN254 field element inputs.
 */
export interface NoirWitnessPath {
    /** Poseidon Merkle root at the moment the proof was generated. */
    readonly root: string;
    /** Zero-based leaf index of the commitment inside the tree. */
    readonly leaf_index: number;
    /**
     * Ordered sibling hashes from leaf level up to root.
     * Length equals the Merkle tree depth (20 for a 2^20-leaf tree).
     * Each element is a 0x-prefixed, zero-padded 64-char hex string.
     */
    readonly sibling_path: readonly string[];
}
/**
 * Raw proof payload returned by `GET /tree/proof/:commitment`.
 *
 * Extends the wire format with a `toNoirFormat()` helper that
 * re-encodes the path for direct use as ZK circuit witness parameters.
 */
export interface MnemoxProofResponse {
    /** Commitment queried — 64-char lowercase hex, no 0x prefix. */
    readonly commitment: string;
    /** Zero-based position of this commitment leaf inside the Merkle tree. */
    readonly leaf_index: number;
    /**
     * Sibling path from leaf to root (Merkle proof).
     * Each element is a 0x-prefixed, zero-padded 64-char hex string.
     * Ordered from leaf level (index 0) to root level (index depth-1).
     */
    readonly path: readonly string[];
    /** Current Merkle root as a 0x-prefixed hex string. */
    readonly root: string;
    /** Stellar ledger sequence number at which the commitment was indexed. */
    readonly event_ledger: number;
    /** ISO-8601 UTC timestamp of the ledger that emitted the commitment. */
    readonly event_ledger_timestamp: string;
    /**
     * Re-encodes this proof as a Noir/Circom witness argument object.
     *
     * Root is zero-padded to 64 hex chars; sibling_path entries are
     * already padded by the Mnemox sidecar (`0x%064x` format).
     */
    toNoirFormat(): NoirWitnessPath;
}
/**
 * Thrown when the Mnemox sidecar returns HTTP 503 with the
 * `DESYNC_LAG_PROTECTION` status code.
 *
 * This means the local Poseidon Merkle tree is behind the current
 * Stellar network ledger. Serving a sibling path from a stale tree
 * would inject incorrect witnesses into ZK circuit provers.
 *
 * Resolution: wait for the ingestion loop to re-synchronise, then retry.
 */
export declare class MnemoxDesyncError extends Error {
    readonly status: 503;
    readonly code: "DESYNC_LAG_PROTECTION";
    constructor();
}
/**
 * Thrown when the requested commitment is not present in the indexed tree.
 *
 * Possible causes: commitment was emitted before the configured `START_LEDGER`,
 * the contract address is wrong, or the leaf was never inserted.
 */
export declare class MnemoxNotFoundError extends Error {
    readonly status: 404;
    readonly commitment: string;
    constructor(commitment: string);
}
/**
 * Thrown when the HTTP request to the sidecar exceeds `MnemoxConfig.timeout`.
 */
export declare class MnemoxTimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(timeoutMs: number);
}
/**
 * Mnemox TypeScript client.
 *
 * Connects to a Mnemox sidecar (Go binary) over HTTP and provides
 * typed methods for retrieving Poseidon Merkle proofs and formatting
 * them as ZK circuit witness arguments.
 *
 * @example
 * ```ts
 * const client = new MnemoxClient({ endpoint: "http://localhost:8080" });
 * const proof = await client.getSiblingPath("0x" + commitmentHex);
 * const witness = proof.toNoirFormat();
 * ```
 */
export declare class MnemoxClient {
    private readonly endpoint;
    private readonly timeout;
    constructor(config?: MnemoxConfig);
    /**
     * Fetches the Merkle sibling path for a given Poseidon commitment hash.
     *
     * Performs hex validation client-side before sending the request to avoid
     * a round-trip for obviously malformed inputs.
     *
     * The Go sidecar's Stale State Guard (`assertSyncState`) is transparently
     * handled: a 503 DESYNC_LAG_PROTECTION response is re-thrown as a typed
     * `MnemoxDesyncError` instead of a generic network error, allowing callers
     * to implement retry logic without string-matching error messages.
     *
     * @param commitmentHash - Poseidon commitment as a hex string (with or
     *                         without `0x` prefix, 1–64 hex chars).
     * @throws {TypeError}          Input does not pass hex validation.
     * @throws {MnemoxDesyncError}  Sidecar ledger lags behind Stellar consensus.
     * @throws {MnemoxNotFoundError} Commitment absent from the indexed tree.
     * @throws {MnemoxTimeoutError} Request exceeded `config.timeout`.
     * @throws {Error}              Any other network or HTTP error.
     */
    getSiblingPath(commitmentHash: string): Promise<MnemoxProofResponse>;
    /**
     * Returns the current Merkle root and leaf count from the sidecar.
     * Useful for quorum cross-verification across federated Mnemox instances.
     */
    getTreeRoot(): Promise<{
        root: string;
        leaf_count: number;
        latest_ledger: number;
    }>;
    /**
     * Fetches the sidecar health status.
     * Exposes `latest_ledger`, `indexed_events`, and `uptime_seconds`.
     */
    getHealth(): Promise<{
        status: string;
        latest_ledger: number;
        indexed_events: number;
        started_at: string;
        uptime_seconds: number;
        network: string;
    }>;
}
//# sourceMappingURL=index.d.ts.map