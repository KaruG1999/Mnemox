package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	cursor, _ := s.store.GetCursor()
	count, _ := s.store.CountEvents()
	elapsed := time.Since(s.start)
	writeJSON(w, http.StatusOK, map[string]any{
		"status":         "ok",
		"latest_ledger":  cursor,
		"indexed_events": count,
		"started_at":     s.start.UTC().Format(time.RFC3339),
		"uptime_seconds": int64(elapsed.Seconds()),
		"network":        s.network,
	})
}

func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	cursor, _ := s.store.GetCursor()
	root := s.tree.Root()
	writeJSON(w, http.StatusOK, map[string]any{
		"root":          fmt.Sprintf("0x%x", root),
		"leaf_count":    s.tree.LeafCount(),
		"latest_ledger": cursor,
	})
}

func (s *Server) handleProof(w http.ResponseWriter, r *http.Request) {
	commitment := strings.TrimPrefix(r.URL.Path, "/tree/proof/")
	if commitment == "" {
		writeError(w, http.StatusBadRequest, "commitment is required")
		return
	}
	// Bound the input before any tree or database work to prevent unbounded
	// string allocations and SQL parameter bloat (64-char hex + "0x" = 66 max).
	if len(commitment) > 130 {
		writeError(w, http.StatusBadRequest, "commitment exceeds maximum length")
		return
	}
	for _, c := range strings.TrimPrefix(commitment, "0x") {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			writeError(w, http.StatusBadRequest, "commitment must be a hex string")
			return
		}
	}

	// Verify the local Poseidon tree is within the 5-ledger consensus tolerance
	// before serving a sibling path. A stale tree injects incorrect witnesses into
	// the ZK circuit prover, producing proofs that fail on-chain verification.
	checkSync := s.assertSyncState
	if s.syncCheckFn != nil {
		checkSync = s.syncCheckFn
	}
	if err := checkSync(r.Context()); err != nil {
		log.Printf("server: stale state guard triggered: %v", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "DESYNC_LAG_PROTECTION",
			"error":  "Local ledger state behind network consensus",
		})
		return
	}

	idx := s.tree.FindLeaf(commitment)
	if idx < 0 {
		writeError(w, http.StatusNotFound, "commitment not found in tree")
		return
	}

	path, err := s.tree.Proof(idx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	root := s.tree.Root()

	// Look up on-chain ledger and timestamp so the client can determine whether
	// the commitment falls outside Stellar's 7-day RPC retention window.
	var eventLedger uint32
	var eventLedgerTimestamp string
	if ev, _ := s.store.GetEventByValue(commitment); ev != nil {
		eventLedger = ev.Ledger
		eventLedgerTimestamp = ev.Timestamp.UTC().Format(time.RFC3339)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"commitment":             commitment,
		"leaf_index":             idx,
		"path":                   path,
		"root":                   fmt.Sprintf("0x%x", root),
		"event_ledger":           eventLedger,
		"event_ledger_timestamp": eventLedgerTimestamp,
	})
}

// syncLagExceedsTolerance reports whether the network is ahead of the local cursor
// by more than the 5-ledger buffer. Stellar closes a ledger every ~5 s; one polling
// cycle can naturally lag 1–3 ledgers, so a strict equality check causes false 503s.
func syncLagExceedsTolerance(networkSeq, localSeq uint32) bool {
	const toleranceLedgers uint32 = 5
	return networkSeq > localSeq+toleranceLedgers
}

// assertSyncState fetches the network's latest ledger from Soroban RPC and
// returns an error only when the local cursor lags beyond the tolerance threshold.
func (s *Server) assertSyncState(ctx context.Context) error {
	latest, err := s.rpc.GetLatestLedger(ctx)
	if err != nil {
		// RPC unreachable: treat as desync to fail-safe.
		return fmt.Errorf("RPC unavailable: %w", err)
	}

	localLedger, err := s.store.GetCursor()
	if err != nil {
		return fmt.Errorf("cursor read failed: %w", err)
	}

	if syncLagExceedsTolerance(latest.Sequence, localLedger) {
		return fmt.Errorf("network ledger %d ahead of local ledger %d beyond tolerance threshold",
			latest.Sequence, localLedger)
	}
	return nil
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	contract := q.Get("contract")
	if contract == "" {
		writeError(w, http.StatusBadRequest, "contract query param is required")
		return
	}

	fromLedger := uint32(0)
	if v := q.Get("from_ledger"); v != "" {
		n, err := strconv.ParseUint(v, 10, 32)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid from_ledger")
			return
		}
		fromLedger = uint32(n)
	}

	limit := 100
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 || n > 1000 {
			writeError(w, http.StatusBadRequest, "invalid limit: must be between 1 and 1000")
			return
		}
		limit = n
	}

	events, err := s.store.GetEvents(contract, fromLedger, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	type ev struct {
		ID        string `json:"id"`
		Ledger    uint32 `json:"ledger"`
		Contract  string `json:"contract"`
		Type      string `json:"type"`
		Value     string `json:"value"`
		Timestamp string `json:"timestamp"`
	}
	out := make([]ev, len(events))
	for i, e := range events {
		out[i] = ev{e.ID, e.Ledger, e.Contract, e.Type, e.Value, e.Timestamp.UTC().Format(time.RFC3339)}
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": out})
}
