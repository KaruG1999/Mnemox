package ingestion

import (
	"context"
	"fmt"
	"log"
	"math"
	"math/big"
	"strings"
	"time"

	rpcclient "github.com/stellar/go/clients/rpcclient"
	protocol "github.com/stellar/go/protocols/rpc"

	"github.com/karengiannetto/mnemox/internal/crypto"
	"github.com/karengiannetto/mnemox/internal/database"
)

// ingestionBufferDepth is the maximum number of fetched event pages that can
// be queued between the RPC polling goroutine (producer) and the SQLite/tree
// worker goroutine (consumer). When the consumer lags — e.g., during a slow
// WAL flush or a Merkle tree insertion spike — the producer goroutine blocks
// on the channel send instead of allocating unbounded event slices in memory.
// This is the explicit backpressure gate: the Soroban RPC polling rate is
// throttled automatically whenever the processing pipeline falls behind.
const ingestionBufferDepth = 4

// eventPage is the unit of work passed from the RPC poller to the tree worker.
type eventPage struct {
	events   []database.Event
	nextFrom uint32 // cursor to advance to after this page is durably committed
}

type Streamer struct {
	rpc         *rpcclient.Client
	store       *database.Store
	tree        *crypto.MerkleTree
	contractID  string
	pollMs      int
	startLedger uint32
}

func New(rpcURL, contractID string, pollMs int, startLedger uint32, st *database.Store, tree *crypto.MerkleTree) *Streamer {
	return &Streamer{
		rpc:         rpcclient.NewClient(rpcURL, nil),
		store:       st,
		tree:        tree,
		contractID:  contractID,
		pollMs:      pollMs,
		startLedger: startLedger,
	}
}

// Run orchestrates the two-stage ingestion pipeline.
//
// Stage 1 — Producer (pollLoop): polls Soroban RPC on a fixed interval,
// fetches event pages, and sends them into pageCh. If pageCh is at capacity
// the send blocks, which suspends the poll ticker and throttles RPC traffic
// proportionally to the consumer's processing rate.
//
// Stage 2 — Consumer (processLoop): reads pages from pageCh, persists them
// to SQLite via an atomic SaveBatch, then inserts commitment leaves into the
// in-memory Poseidon Merkle tree.
//
// Shutdown is coordinated via innerCtx: if the consumer encounters a fatal
// tree-insertion error it calls cancelInner(), which causes the producer to
// exit cleanly. Run() then closes pageCh, drains it, and returns — allowing
// the process supervisor to restart and rebuildTree to replay SQLite in
// correct ORDER BY ledger ASC, id ASC order.
func (s *Streamer) Run(ctx context.Context) {
	cursor, err := s.store.GetCursor()
	if err != nil {
		log.Printf("ingestion: failed to get cursor: %v", err)
		cursor = 0
	}

	from := cursor
	if from == 0 {
		from = s.startLedger
	}
	if from == 0 {
		from = s.oldestAvailableLedger(ctx)
	}

	log.Printf("ingestion: starting from ledger %d for contract %s", from, s.contractID)

	// innerCtx allows the consumer to signal the producer to stop on a fatal
	// tree-insertion error without cancelling the outer application context.
	innerCtx, cancelInner := context.WithCancel(ctx)
	defer cancelInner()

	// pageCh is the bounded backpressure channel. Capacity = ingestionBufferDepth.
	pageCh := make(chan eventPage, ingestionBufferDepth)
	done := make(chan struct{})

	go func() {
		defer close(done)
		s.processLoop(pageCh, cancelInner)
	}()

	s.pollLoop(innerCtx, pageCh, &from)

	// Drain window: pageCh must be closed to signal the consumer range loop to
	// exit. The consumer may still be processing in-flight pages — <-done waits
	// for it to finish before Run() returns.
	close(pageCh)
	<-done
}

// pollLoop is the RPC producer stage. It runs on the ticker interval and sends
// fetched event pages into pageCh. The send is wrapped in a select that also
// listens to ctx.Done() so a context cancellation always unblocks the stage
// even if pageCh is at capacity.
func (s *Streamer) pollLoop(ctx context.Context, pageCh chan<- eventPage, from *uint32) {
	ticker := time.NewTicker(time.Duration(s.pollMs) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("ingestion: polling stopped")
			return

		case <-ticker.C:
			latest, err := s.rpc.GetLatestLedger(ctx)
			if err != nil {
				log.Printf("ingestion: getLatestLedger error: %v", err)
				continue
			}

			if *from > latest.Sequence {
				continue
			}

			fetched, nextFrom, err := s.fetchPage(ctx, *from, latest.Sequence)
			if err != nil {
				if isOutOfRangeError(err) {
					newFrom := s.oldestAvailableLedger(ctx)
					log.Printf("ingestion: cursor behind retention window, re-anchoring to ledger %d", newFrom)
					*from = newFrom
				} else {
					log.Printf("ingestion: fetchPage error: %v", err)
				}
				continue
			}

			if len(fetched) == 0 {
				if nextFrom > *from {
					*from = nextFrom
				}
				continue
			}

			// Backpressure gate: blocks here if pageCh is at capacity, throttling
			// the RPC poll rate to match the consumer's SQLite + tree insertion speed.
			select {
			case pageCh <- eventPage{events: fetched, nextFrom: nextFrom}:
				*from = nextFrom
			case <-ctx.Done():
				return
			}
		}
	}
}

// processLoop is the SQLite/tree consumer stage. It drains pageCh, persists
// each page atomically, then inserts commitment leaves into the Merkle tree.
//
// On a SaveBatch failure the page is logged and skipped; the in-memory cursor
// (*from in pollLoop) has already advanced, but the SQLite cursor has not. A
// clean restart will re-fetch the uncommitted range from the last durable ledger.
//
// On a tree.Insert failure (BN254 violation or full tree), cancelIngestion is
// called to stop the producer, the channel is drained without further processing,
// and processLoop returns — triggering a supervisor restart and clean tree rebuild.
func (s *Streamer) processLoop(pageCh <-chan eventPage, cancelIngestion context.CancelFunc) {
	for page := range pageCh {
		if err := s.store.SaveBatch(page.events, page.nextFrom-1); err != nil {
			log.Printf("ingestion: SaveBatch error: %v — page will be re-fetched on restart", err)
			continue
		}

		for _, e := range page.events {
			if e.Type != "new_commitment_event" || e.Value == "" {
				continue
			}
			c := new(big.Int)
			if _, ok := c.SetString(e.Value, 16); !ok {
				log.Printf("ingestion: malformed commitment hex %q for event %s — skipping",
					e.Value, e.ID)
				continue
			}
			if err := s.tree.Insert(c); err != nil {
				log.Printf("ingestion: tree insert for event %s: %v — stopping for clean restart",
					e.ID, err)
				// Cancel the producer so pollLoop exits and closes pageCh.
				// Drain any remaining in-flight pages without processing to unblock
				// any goroutine blocked on a send to pageCh.
				cancelIngestion()
				for range pageCh {
				}
				return
			}
		}

		log.Printf("ingestion: indexed %d events up to ledger %d (tree leaves: %d)",
			len(page.events), page.nextFrom-1, s.tree.LeafCount())
	}
}

// oldestAvailableLedger asks the RPC for the current oldest retained ledger.
// It probes with a GetEvents call on the latest two ledgers — the response
// always includes OldestLedger regardless of whether events matched.
func (s *Streamer) oldestAvailableLedger(ctx context.Context) uint32 {
	latest, err := s.rpc.GetLatestLedger(ctx)
	if err != nil {
		log.Printf("ingestion: getLatestLedger for probe: %v", err)
		return 1
	}
	probe, err := s.rpc.GetEvents(ctx, protocol.GetEventsRequest{
		StartLedger: latest.Sequence - 1,
		EndLedger:   latest.Sequence,
		Filters:     []protocol.EventFilter{},
	})
	if err != nil || probe.OldestLedger == 0 {
		return latest.Sequence - 100000
	}
	// Add a small buffer so we're safely inside the retention window
	// even if a few ledgers close between this probe and the next fetchPage.
	return probe.OldestLedger + 10
}

// fetchPage retrieves ALL events from [from, min(to, from+9999)] by exhausting
// the RPC pagination cursor. A single GetEvents call returns at most 100 events;
// if the window contains more, the response Cursor field is non-empty and must
// be used to continue. Skipping pagination silently drops events.
func (s *Streamer) fetchPage(ctx context.Context, from, to uint32) ([]database.Event, uint32, error) {
	evtType := protocol.EventTypeSet{}
	evtType[protocol.EventTypeContract] = nil

	// Guard against uint32 overflow: from+9999 wraps if from is near MaxUint32.
	const windowSize uint32 = 9999
	var endLedger uint32
	if from > math.MaxUint32-windowSize {
		endLedger = math.MaxUint32
	} else {
		endLedger = min32(to, from+windowSize)
	}

	const pageLimit uint = 100
	var (
		allEvents  []database.Event
		lastLedger = from
		pageCursor *protocol.Cursor
	)

	for {
		req := protocol.GetEventsRequest{
			Filters: []protocol.EventFilter{
				{
					EventType:   evtType,
					ContractIDs: []string{s.contractID},
				},
			},
			Pagination: &protocol.PaginationOptions{Limit: pageLimit},
		}

		if pageCursor != nil {
			req.Pagination.Cursor = pageCursor
		} else {
			req.StartLedger = from
			req.EndLedger = endLedger
		}

		resp, err := s.rpc.GetEvents(ctx, req)
		if err != nil {
			return nil, from, err
		}

		for _, e := range resp.Events {
			ts, _ := time.Parse(time.RFC3339, e.LedgerClosedAt)
			ev := database.Event{
				ID:        e.ID,
				Ledger:    uint32(e.Ledger),
				Contract:  e.ContractID,
				Timestamp: ts,
			}

			if len(e.TopicXDR) >= 1 {
				if name, err := decodeSymbol(e.TopicXDR[0]); err == nil {
					ev.Type = name
				}
			}
			if ev.Type == "new_commitment_event" && len(e.TopicXDR) >= 2 {
				if commitment, err := decodeU256(e.TopicXDR[1]); err == nil {
					ev.Value = fmt.Sprintf("%064x", commitment)
				} else {
					log.Printf("ingestion: decode commitment for %s: %v", e.ID, err)
				}
			}

			allEvents = append(allEvents, ev)
			if uint32(e.Ledger) > lastLedger {
				lastLedger = uint32(e.Ledger)
			}
		}

		if uint(len(resp.Events)) < pageLimit || resp.Cursor == "" {
			break
		}

		parsed, err := protocol.ParseCursor(resp.Cursor)
		if err != nil {
			return nil, from, fmt.Errorf("fetchPage: bad pagination cursor %q: %w", resp.Cursor, err)
		}
		pageCursor = &parsed
	}

	nextFrom := endLedger + 1
	if lastLedger+1 > nextFrom {
		nextFrom = lastLedger + 1
	}
	return allEvents, nextFrom, nil
}

// isOutOfRangeError returns true if err signals that the requested start ledger
// is outside the RPC node's retention window.
func isOutOfRangeError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "startledger must be within") ||
		(strings.Contains(msg, "start ledger") && strings.Contains(msg, "retention")) ||
		strings.Contains(msg, "outside of allowed window") ||
		strings.Contains(msg, "-32600")
}

func min32(a, b uint32) uint32 {
	if a < b {
		return a
	}
	return b
}
