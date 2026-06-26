#!/usr/bin/env python3
"""
Demo seed script — populates mnemox.db with 237 new_commitment_event rows
for the Nethermind pool contract on Stellar Testnet.

Generates BN254-valid commitments via sha256 mod p so each leaf looks like
a real field element. The cursor is set to 3041173 to match the API Reference.
"""

import hashlib
import sqlite3
import struct
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "mnemox.db"
CONTRACT_ID = "CB3A7OBBCAHV2JJENCWAXFJVUX32G7YJ237D7O5RPVCLFR5A2OE2PXY5"
TARGET_CURSOR = 3041173
NUM_EVENTS = 237
# BN254 scalar field modulus
P = 21888242871839275222246405745257275088548364400416034343698204186575808495617

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    ledger      INTEGER NOT NULL,
    contract    TEXT NOT NULL,
    type        TEXT NOT NULL,
    value       TEXT NOT NULL,
    timestamp   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract);
CREATE INDEX IF NOT EXISTS idx_events_ledger   ON events(ledger);
CREATE INDEX IF NOT EXISTS idx_events_value    ON events(value);
CREATE TABLE IF NOT EXISTS cursor (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    ledger  INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO cursor (id, ledger) VALUES (1, 0);
"""

START_LEDGER = 3039900   # 3039900 + 236*5 = 3041080, safely below 3041173
LEDGER_STEP  = 5         # ~5 seconds per ledger on Stellar Testnet
# Base timestamp for the first event (2 weeks before June 25 2026)
BASE_TS = "2026-06-10T12:00:00Z"
BASE_SECS = (
    (2026 - 1970) * 365 * 86400
    + (4 * 366 + 52 * 365) * 86400   # rough leap-year correction already baked in below
)
# Use a simpler absolute approach: offset seconds from the BASE_TS string
import datetime
BASE_DT = datetime.datetime(2026, 6, 10, 12, 0, 0, tzinfo=datetime.timezone.utc)


def commitment_hex(i: int) -> str:
    """Return a deterministic BN254-valid 64-char hex commitment for index i."""
    raw = hashlib.sha256(b"mnemox-demo-commitment-" + struct.pack(">I", i)).digest()
    value = int.from_bytes(raw, "big") % P
    return f"{value:064x}"


def event_id(ledger: int, tx_idx: int = 1, evt_idx: int = 1) -> str:
    """Mimic Stellar Soroban event ID format: ledger-txIdx-evtIdx (zero-padded)."""
    return f"{ledger:019d}-{tx_idx:010d}-{evt_idx:010d}"


def main():
    if DB_PATH.exists():
        DB_PATH.unlink()
        print(f"Removed existing {DB_PATH}")

    con = sqlite3.connect(str(DB_PATH))
    con.executescript(SCHEMA)

    # Enable WAL mode to match the application's Open() DSN settings
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=5000")
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA synchronous=NORMAL")
    con.commit()

    rows = []
    for i in range(NUM_EVENTS):
        ledger = START_LEDGER + i * LEDGER_STEP
        ts = (BASE_DT + datetime.timedelta(seconds=i * LEDGER_STEP * 5)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        rows.append((
            event_id(ledger),
            ledger,
            CONTRACT_ID,
            "new_commitment_event",
            commitment_hex(i + 1),  # start from 1, not 0
            ts,
        ))

    con.executemany(
        "INSERT OR IGNORE INTO events (id, ledger, contract, type, value, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        rows,
    )
    con.execute("UPDATE cursor SET ledger = ? WHERE id = 1", (TARGET_CURSOR,))
    con.commit()

    # Verify
    count = con.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    cursor = con.execute("SELECT ledger FROM cursor WHERE id = 1").fetchone()[0]
    min_l = con.execute("SELECT MIN(ledger) FROM events").fetchone()[0]
    max_l = con.execute("SELECT MAX(ledger) FROM events").fetchone()[0]
    con.close()

    print(f"Seeded {count} events  |  ledger range: {min_l}–{max_l}  |  cursor: {cursor}")
    assert count == NUM_EVENTS, f"Expected {NUM_EVENTS}, got {count}"
    assert cursor == TARGET_CURSOR
    print("OK — database ready for demo.")


if __name__ == "__main__":
    main()
