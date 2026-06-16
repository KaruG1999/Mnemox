package database

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestStoreOpenAndEvents(t *testing.T) {
	st, err := Open(t.TempDir() + "/test.db")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	e := Event{
		ID:        "0001234-1",
		Ledger:    1234500,
		Contract:  "CTEST",
		Type:      "new_commitment_event",
		Value:     "000000000000000000000000000000000000000000000000000000000000aabc",
		Timestamp: time.Now(),
	}

	// SaveBatch is the only write path — atomically persists events + cursor.
	if err := st.SaveBatch([]Event{e}, 1234500); err != nil {
		t.Fatal(err)
	}
	// Idempotent: duplicate IDs are silently ignored.
	if err := st.SaveBatch([]Event{e}, 1234500); err != nil {
		t.Fatal("duplicate batch should be a no-op:", err)
	}

	events, err := st.GetEvents("CTEST", 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].ID != e.ID {
		t.Fatalf("unexpected event ID: %s", events[0].ID)
	}

	cur, err := st.GetCursor()
	if err != nil {
		t.Fatal(err)
	}
	if cur != 1234500 {
		t.Fatalf("expected cursor 1234500, got %d", cur)
	}
}

func TestGetCommitmentsOrdering(t *testing.T) {
	st, err := Open(t.TempDir() + "/order.db")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	batch := []Event{
		{ID: "0000300-2", Ledger: 300, Contract: "C1", Type: "new_commitment_event", Value: "0002", Timestamp: time.Now()},
		{ID: "0000100-1", Ledger: 100, Contract: "C1", Type: "new_commitment_event", Value: "0001", Timestamp: time.Now()},
		{ID: "0000200-1", Ledger: 200, Contract: "C1", Type: "new_nullifier_event", Value: "", Timestamp: time.Now()},
	}
	if err := st.SaveBatch(batch, 300); err != nil {
		t.Fatal(err)
	}

	commits, err := st.GetCommitments()
	if err != nil {
		t.Fatal(err)
	}
	// Only commitment events, in ledger ASC order.
	if len(commits) != 2 {
		t.Fatalf("expected 2 commitments, got %d", len(commits))
	}
	if commits[0].Ledger != 100 || commits[1].Ledger != 300 {
		t.Fatalf("wrong order: %d, %d", commits[0].Ledger, commits[1].Ledger)
	}
}

func TestVerifyMonotonicity(t *testing.T) {
	st, err := Open(t.TempDir() + "/mono.db")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	batch := []Event{
		{ID: "0000100-1", Ledger: 100, Contract: "C1", Type: "new_commitment_event", Value: "0001", Timestamp: time.Now()},
		{ID: "0000200-1", Ledger: 200, Contract: "C1", Type: "new_commitment_event", Value: "0002", Timestamp: time.Now()},
		{ID: "0000300-1", Ledger: 300, Contract: "C1", Type: "new_commitment_event", Value: "0003", Timestamp: time.Now()},
	}
	if err := st.SaveBatch(batch, 300); err != nil {
		t.Fatal(err)
	}

	// Should not panic on clean monotonic data.
	st.VerifyMonotonicity()
}

// TestVerifyMonotonicityTamperDetection simulates a WAL page-rewrite attack:
// a row is injected whose primary key sorts between two legitimate rows but
// whose ledger value rolls backward. VerifyMonotonicity must detect this and
// panic with a message containing [SECURITY_ALERT].
func TestVerifyMonotonicityTamperDetection(t *testing.T) {
	st, err := Open(t.TempDir() + "/tamper.db")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	// Legitimate monotonic batch: ledgers 100 → 300.
	if err := st.SaveBatch([]Event{
		{ID: "0000100-1", Ledger: 100, Contract: "C1", Type: "new_commitment_event", Value: "aaa1", Timestamp: time.Now()},
		{ID: "0000300-1", Ledger: 300, Contract: "C1", Type: "new_commitment_event", Value: "aaa3", Timestamp: time.Now()},
	}, 300); err != nil {
		t.Fatal(err)
	}

	// Tampered entry: ID "0000200-1" sorts lexicographically between the two
	// legitimate rows, but its ledger (50) is lower than the preceding row (100).
	// This mimics a WAL rollback attack where an adversary rewrites historical pages.
	if err := st.SaveBatch([]Event{
		{ID: "0000200-1", Ledger: 50, Contract: "C1", Type: "new_commitment_event", Value: "aaa2", Timestamp: time.Now()},
	}, 300); err != nil {
		t.Fatal(err)
	}

	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("expected VerifyMonotonicity to panic on tampered ledger sequence, got nil")
		}
		if msg := fmt.Sprintf("%v", r); !strings.Contains(msg, "[SECURITY_ALERT]") {
			t.Fatalf("panic must contain [SECURITY_ALERT]; got: %s", msg)
		}
	}()
	st.VerifyMonotonicity()
}
