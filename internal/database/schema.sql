CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    ledger      INTEGER NOT NULL,
    contract    TEXT NOT NULL,
    type        TEXT NOT NULL,
    value       TEXT NOT NULL,
    timestamp   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract);
CREATE INDEX IF NOT EXISTS idx_events_ledger ON events(ledger);
CREATE INDEX IF NOT EXISTS idx_events_value ON events(value);

CREATE TABLE IF NOT EXISTS cursor (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    ledger  INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO cursor (id, ledger) VALUES (1, 0);
