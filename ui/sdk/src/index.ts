/**
 * @mnemox/sdk — TypeScript client for the Mnemox ZK event indexer.
 *
 * Provides typed Merkle proof retrieval from a Mnemox sidecar and
 * witness formatting compatible with Noir and Circom ZK circuit provers.
 *
 * Runtime requirement: Node >= 18 (native fetch) or any modern browser.
 */

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Response types
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Error classes
// ─────────────────────────────────────────────────────────────

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
export class MnemoxDesyncError extends Error {
  readonly status = 503 as const;
  readonly code = "DESYNC_LAG_PROTECTION" as const;

  constructor() {
    super(
      "[Mnemox SDK] Circuit Generation Halted: Local sidecar ledger is lagging behind " +
        "network consensus. Retry when synchronization finishes."
    );
    this.name = "MnemoxDesyncError";
    Object.setPrototypeOf(this, MnemoxDesyncError.prototype);
  }
}

/**
 * Thrown when the requested commitment is not present in the indexed tree.
 *
 * Possible causes: commitment was emitted before the configured `START_LEDGER`,
 * the contract address is wrong, or the leaf was never inserted.
 */
export class MnemoxNotFoundError extends Error {
  readonly status = 404 as const;
  readonly commitment: string;

  constructor(commitment: string) {
    super(`[Mnemox SDK] Commitment not found in Merkle tree: ${commitment}`);
    this.name = "MnemoxNotFoundError";
    this.commitment = commitment;
    Object.setPrototypeOf(this, MnemoxNotFoundError.prototype);
  }
}

/**
 * Thrown when the HTTP request to the sidecar exceeds `MnemoxConfig.timeout`.
 */
export class MnemoxTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`[Mnemox SDK] Request timed out after ${timeoutMs}ms. Is the sidecar reachable?`);
    this.name = "MnemoxTimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, MnemoxTimeoutError.prototype);
  }
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

/** Raw shape of the JSON body from `GET /tree/proof/:commitment`. */
interface RawProofPayload {
  readonly commitment: string;
  readonly leaf_index: number;
  readonly path: readonly string[];
  readonly root: string;
  readonly event_ledger: number;
  readonly event_ledger_timestamp: string;
}

/** Raw shape of an error body returned by the sidecar. */
interface RawErrorPayload {
  readonly status?: string;
  readonly error?: string;
}

/**
 * Normalises a hex string to `0x` + exactly 64 lowercase hex characters.
 * The sidecar uses `%x` (variable width) for the root and `%064x` for
 * siblings; this unifies both into the 256-bit fixed-width format
 * expected by BN254 circuit field element inputs.
 */
function padHex64(value: string): string {
  const stripped = value.startsWith("0x") ? value.slice(2) : value;
  return "0x" + stripped.padStart(64, "0").toLowerCase();
}

/**
 * Strict, non-backtracking linear-time hex commitment validator.
 *
 * Pattern: /^0x[a-fA-F0-9]{64}$/
 *   ^           — anchored at string start (no leading content)
 *   0x          — mandatory prefix (canonical Poseidon commitment format)
 *   [a-fA-F0-9] — character class, not a group — O(1) per character, no backtracking
 *   {64}        — exact repetition count; rejects partial commitments (< 256 bits)
 *   $           — anchored at string end (no trailing content)
 *
 * Complexity: O(n) where n = input length. The character class [a-fA-F0-9] has
 * no alternation groups and no nested quantifiers, eliminating all catastrophic
 * backtracking paths that are the root cause of ReDoS vulnerabilities.
 *
 * Rejects: bare hex (no 0x prefix), short inputs, values > 32 bytes, non-hex chars.
 */
const COMMITMENT_HEX_RE = /^0x[a-fA-F0-9]{64}$/;

function assertValidCommitmentHex(value: string): void {
  if (!COMMITMENT_HEX_RE.test(value)) {
    throw new TypeError(
      `[Mnemox SDK] Invalid commitment hash. Expected format: 0x followed by exactly ` +
        `64 hex characters (256-bit BN254 field element). Received: "${value}"`
    );
  }
}

function buildProofResponse(raw: RawProofPayload): MnemoxProofResponse {
  return {
    commitment: raw.commitment,
    leaf_index: raw.leaf_index,
    path: raw.path,
    root: raw.root,
    event_ledger: raw.event_ledger,
    event_ledger_timestamp: raw.event_ledger_timestamp,
    toNoirFormat(): NoirWitnessPath {
      return {
        root: padHex64(raw.root),
        leaf_index: raw.leaf_index,
        sibling_path: raw.path.map(padHex64),
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────

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
export class MnemoxClient {
  private readonly endpoint: string;
  private readonly timeout: number;

  constructor(config: MnemoxConfig = {}) {
    this.endpoint = (config.endpoint ?? "http://localhost:8080").replace(/\/$/, "");
    this.timeout = config.timeout ?? 10_000;
  }

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
  async getSiblingPath(commitmentHash: string): Promise<MnemoxProofResponse> {
    // Client-side validation — O(n) linear regex, no backtracking paths.
    // Enforces 0x-prefix + exactly 64 hex chars before any network I/O.
    assertValidCommitmentHex(commitmentHash);

    // Strip the mandatory 0x prefix; the sidecar URL path expects bare hex.
    const bareHex = commitmentHash.slice(2);

    const url = `${this.endpoint}/tree/proof/${encodeURIComponent(bareHex)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new MnemoxTimeoutError(this.timeout);
      }
      throw new Error(`[Mnemox SDK] Network error reaching sidecar at ${this.endpoint}: ${String(err)}`);
    }
    clearTimeout(timer);

    // ── 503 DESYNC_LAG_PROTECTION ──────────────────────────────────────────
    // The Go sidecar's assertSyncState() returns this when the local Poseidon
    // tree is behind the Stellar network ledger. A stale sibling path would
    // feed incorrect witnesses into the ZK circuit prover.
    if (response.status === 503) {
      const body = await response.json().catch((): RawErrorPayload => ({})) as RawErrorPayload;
      if (body.status === "DESYNC_LAG_PROTECTION") {
        throw new MnemoxDesyncError();
      }
      throw new Error(
        `[Mnemox SDK] Sidecar unavailable (503): ${body.error ?? "unknown error"}`
      );
    }

    // ── 404 Commitment not indexed ─────────────────────────────────────────
    if (response.status === 404) {
      throw new MnemoxNotFoundError(commitmentHash);
    }

    // ── 429 Rate limit ─────────────────────────────────────────────────────
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After") ?? "1";
      throw new Error(
        `[Mnemox SDK] Rate limit exceeded. Retry after ${retryAfter}s.`
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`[Mnemox SDK] Unexpected HTTP ${response.status}: ${body}`);
    }

    const raw = await response.json() as RawProofPayload;
    return buildProofResponse(raw);
  }

  /**
   * Returns the current Merkle root and leaf count from the sidecar.
   * Useful for quorum cross-verification across federated Mnemox instances.
   */
  async getTreeRoot(): Promise<{ root: string; leaf_count: number; latest_ledger: number }> {
    const url = `${this.endpoint}/tree/root`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new MnemoxTimeoutError(this.timeout);
      }
      throw new Error(`[Mnemox SDK] Network error: ${String(err)}`);
    }
    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`[Mnemox SDK] Unexpected HTTP ${response.status}: ${body}`);
    }

    return response.json() as Promise<{ root: string; leaf_count: number; latest_ledger: number }>;
  }

  /**
   * Fetches the sidecar health status.
   * Exposes `latest_ledger`, `indexed_events`, and `uptime_seconds`.
   */
  async getHealth(): Promise<{
    status: string;
    latest_ledger: number;
    indexed_events: number;
    started_at: string;
    uptime_seconds: number;
    network: string;
  }> {
    const url = `${this.endpoint}/health`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      throw new Error(`[Mnemox SDK] Health check failed with HTTP ${response.status}`);
    }
    return response.json() as Promise<{
      status: string;
      latest_ledger: number;
      indexed_events: number;
      started_at: string;
      uptime_seconds: number;
      network: string;
    }>;
  }
}
