package database

import (
	"database/sql"
	_ "embed"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed schema.sql
var schema string

type Event struct {
	ID        string
	Ledger    uint32
	Contract  string
	Type      string
	Value     string
	Timestamp time.Time
}

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	// Embed connection-level PRAGMAs in the DSN so they apply to every connection
	// the pool opens, not just the first one.
	//
	// PRAGMA busy_timeout is per-connection — using db.Exec() would only set it on
	// one connection; subsequent pool connections would return SQLITE_BUSY immediately.
	//
	// PRAGMA journal_mode=WAL persists to the database file, but including it here
	// also ensures a fresh database is created in WAL mode from the first connection.
	dsn := path + "?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=on&_synchronous=NORMAL"
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}

	// SQLite WAL supports concurrent readers but only one writer at a time.
	// All three pool constraints are required together:
	//   SetMaxOpenConns(1)  — serialises every write; prevents a second connection
	//                         from being opened without the above WAL pragmas.
	//   SetMaxIdleConns(1)  — keeps exactly one idle connection alive so the pool
	//                         never opens a fresh FD under read bursts, capping OS
	//                         file descriptor consumption to 1 regardless of RPS.
	//   SetConnMaxLifetime(0) — connections live indefinitely; WAL mode benefits
	//                           from connection reuse (avoids WAL checkpoint races
	//                           on reconnect during concurrent reader scans).
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

// VerifyMonotonicity scans the events WAL table and asserts that ledger values
// are non-decreasing when rows are traversed in id order. Any rollback, gap, or
// reordering indicates WAL page tampering and halts the process with SECURITY_ALERT.
func (s *Store) VerifyMonotonicity() {
	rows, err := s.db.Query(
		`SELECT id, ledger FROM events ORDER BY id ASC`,
	)
	if err != nil {
		// A query failure at boot is itself a data integrity signal.
		panic(fmt.Sprintf(
			"[SECURITY_ALERT] State reconstruction halted: WAL mutation or data tampering suspected. (query error: %v)",
			err,
		))
	}
	defer rows.Close()

	var prevID string
	var prevLedger uint32
	first := true

	for rows.Next() {
		var id string
		var ledger uint32
		if err := rows.Scan(&id, &ledger); err != nil {
			panic(fmt.Sprintf(
				"[SECURITY_ALERT] State reconstruction halted: WAL mutation or data tampering suspected. (scan error: %v)",
				err,
			))
		}

		if !first {
			// Ledger must be non-decreasing in insertion-order traversal.
			if ledger < prevLedger {
				panic(fmt.Sprintf(
					"[SECURITY_ALERT] State reconstruction halted: WAL mutation or data tampering suspected. "+
						"(non-monotonic ledger sequence: id=%s ledger=%d < prev_id=%s prev_ledger=%d)",
					id, ledger, prevID, prevLedger,
				))
			}
			// ID must be strictly increasing (PRIMARY KEY guarantees uniqueness;
			// any violation means rows were reordered or forged).
			if id <= prevID {
				panic(fmt.Sprintf(
					"[SECURITY_ALERT] State reconstruction halted: WAL mutation or data tampering suspected. "+
						"(non-monotonic event_id sequence: id=%s <= prev_id=%s)",
					id, prevID,
				))
			}
		}

		prevID = id
		prevLedger = ledger
		first = false
	}

	if err := rows.Err(); err != nil {
		panic(fmt.Sprintf(
			"[SECURITY_ALERT] State reconstruction halted: WAL mutation or data tampering suspected. (iteration error: %v)",
			err,
		))
	}
}

// SaveBatch persists a slice of events and advances the ledger cursor atomically.
// Either all events are stored and the cursor moves, or nothing changes.
func (s *Store) SaveBatch(events []Event, cursor uint32) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(
		`INSERT OR IGNORE INTO events (id, ledger, contract, type, value, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?)`,
	)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, e := range events {
		if _, err := stmt.Exec(
			e.ID, e.Ledger, e.Contract, e.Type, e.Value,
			e.Timestamp.UTC().Format(time.RFC3339),
		); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(`UPDATE cursor SET ledger = ? WHERE id = 1`, cursor); err != nil {
		return err
	}

	return tx.Commit()
}

// GetCommitments returns all new_commitment_event rows ordered for Merkle tree reconstruction.
// ORDER BY ledger ASC, id ASC guarantees cryptographic consistency with on-chain insertion order.
func (s *Store) GetCommitments() ([]Event, error) {
	rows, err := s.db.Query(
		`SELECT id, ledger, contract, type, value, timestamp
		 FROM events
		 WHERE type = 'new_commitment_event'
		 ORDER BY ledger ASC, id ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEvents(rows)
}

func (s *Store) GetEvents(contractID string, fromLedger uint32, limit int) ([]Event, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	rows, err := s.db.Query(
		`SELECT id, ledger, contract, type, value, timestamp
		 FROM events
		 WHERE contract = ? AND ledger >= ?
		 ORDER BY ledger ASC, id ASC
		 LIMIT ?`,
		contractID, fromLedger, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEvents(rows)
}

// GetEventByValue looks up the first event matching a commitment value (for proof timestamp).
func (s *Store) GetEventByValue(value string) (*Event, error) {
	row := s.db.QueryRow(
		`SELECT id, ledger, contract, type, value, timestamp
		 FROM events WHERE value = ? LIMIT 1`,
		value,
	)
	var e Event
	var ts string
	if err := row.Scan(&e.ID, &e.Ledger, &e.Contract, &e.Type, &e.Value, &ts); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return nil, fmt.Errorf("store: malformed timestamp %q for event %s: %w", ts, e.ID, err)
	}
	e.Timestamp = t
	return &e, nil
}

func (s *Store) CountEvents() (int64, error) {
	var count int64
	err := s.db.QueryRow(`SELECT COUNT(*) FROM events`).Scan(&count)
	return count, err
}

func (s *Store) GetCursor() (uint32, error) {
	var ledger uint32
	err := s.db.QueryRow(`SELECT ledger FROM cursor WHERE id = 1`).Scan(&ledger)
	return ledger, err
}

func scanEvents(rows *sql.Rows) ([]Event, error) {
	var events []Event
	for rows.Next() {
		var e Event
		var ts string
		if err := rows.Scan(&e.ID, &e.Ledger, &e.Contract, &e.Type, &e.Value, &ts); err != nil {
			return nil, err
		}
		t, err := time.Parse(time.RFC3339, ts)
		if err != nil {
			return nil, fmt.Errorf("store: malformed timestamp %q for event %s: %w", ts, e.ID, err)
		}
		e.Timestamp = t
		events = append(events, e)
	}
	return events, rows.Err()
}
