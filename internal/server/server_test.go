package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/karengiannetto/mnemox/internal/crypto"
	"github.com/karengiannetto/mnemox/internal/database"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	st, err := database.Open(t.TempDir() + "/srv_test.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	tree, err := crypto.NewTree(20)
	if err != nil {
		t.Fatal(err)
	}
	// rpcURL is unused because tests always override syncCheckFn.
	return NewServer(st, tree, "testnet", "http://127.0.0.1:0")
}

// TestSyncLagExceedsTolerance verifies the 5-ledger tolerance boundary directly.
func TestSyncLagExceedsTolerance(t *testing.T) {
	cases := []struct {
		network uint32
		local   uint32
		want    bool
		desc    string
	}{
		{100, 100, false, "equal — no lag"},
		{103, 100, false, "3 ledgers ahead — within tolerance"},
		{105, 100, false, "exactly at boundary (105 = 100+5, not >)"},
		{106, 100, true, "one past boundary (106 > 100+5)"},
		{200, 100, true, "far ahead — clear desync"},
	}
	for _, c := range cases {
		got := syncLagExceedsTolerance(c.network, c.local)
		if got != c.want {
			t.Errorf("[%s] syncLagExceedsTolerance(%d, %d) = %v, want %v",
				c.desc, c.network, c.local, got, c.want)
		}
	}
}

// TestHandleProof_DesyncProtection asserts HTTP 503 + DESYNC_LAG_PROTECTION body
// when the sync check reports the local tree is behind network consensus.
func TestHandleProof_DesyncProtection(t *testing.T) {
	s := newTestServer(t)
	s.syncCheckFn = func(_ context.Context) error {
		return errors.New("network ledger ahead beyond tolerance threshold")
	}

	req := httptest.NewRequest(http.MethodGet,
		"/tree/proof/000000000000000000000000000000000000000000000000000000000000002a",
		nil)
	w := httptest.NewRecorder()
	s.handleProof(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 DESYNC, got %d", w.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "DESYNC_LAG_PROTECTION" {
		t.Fatalf("expected status=DESYNC_LAG_PROTECTION, got %q", body["status"])
	}
}

// TestHandleProof_WithinTolerance asserts no 503 when sync check passes.
// The commitment is absent from the tree, so the expected response is 404 — not 503.
func TestHandleProof_WithinTolerance(t *testing.T) {
	s := newTestServer(t)
	s.syncCheckFn = func(_ context.Context) error { return nil }

	req := httptest.NewRequest(http.MethodGet,
		"/tree/proof/000000000000000000000000000000000000000000000000000000000000002a",
		nil)
	w := httptest.NewRecorder()
	s.handleProof(w, req)

	if w.Code == http.StatusServiceUnavailable {
		t.Fatal("got 503 DESYNC_LAG_PROTECTION despite sync check passing")
	}
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown commitment, got %d", w.Code)
	}
}
