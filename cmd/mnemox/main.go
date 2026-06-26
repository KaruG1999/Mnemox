package main

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/karengiannetto/mnemox/internal/config"
	"github.com/karengiannetto/mnemox/internal/crypto"
	"github.com/karengiannetto/mnemox/internal/database"
	"github.com/karengiannetto/mnemox/internal/ingestion"
	"github.com/karengiannetto/mnemox/internal/server"
)

func main() {
	_ = godotenv.Load()

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("config: %v", err)
	}

	log.Printf("Mnemox starting (network=%s contract=%s port=%s)", cfg.Network, cfg.ContractID, cfg.APIPort)

	st, err := database.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer st.Close()

	// Scan the WAL for ledger monotonicity before reconstructing the Poseidon tree
	// in RAM. A non-monotonic sequence indicates tampering and panics with SECURITY_ALERT.
	st.VerifyMonotonicity()

	tree, err := crypto.NewTree(20)
	if err != nil {
		log.Fatalf("crypto: %v", err)
	}

	// Reconstruct Merkle tree from stored commitments before serving any requests.
	// ORDER BY ledger ASC, id ASC in GetCommitments() guarantees Poseidon root consistency.
	if err := rebuildTree(st, tree); err != nil {
		log.Fatalf("rebuild tree: %v", err)
	}
	log.Printf("tree rebuilt: %d leaves, root=0x%x", tree.LeafCount(), tree.Root())

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	str := ingestion.New(cfg.StellarRPCURL, cfg.ContractID, cfg.PollIntervalMS, cfg.StartLedger, st, tree)
	go str.Run(ctx)

	srv := &http.Server{
		Addr:         "127.0.0.1:" + cfg.APIPort,
		Handler:      server.NewServer(st, tree, cfg.Network, cfg.StellarRPCURL).Handler(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("API listening on http://127.0.0.1:%s", cfg.APIPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("api: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	srv.Shutdown(shutCtx)
}

func rebuildTree(st *database.Store, tree *crypto.MerkleTree) error {
	commitments, err := st.GetCommitments()
	if err != nil {
		return err
	}
	for _, e := range commitments {
		if e.Value == "" {
			continue
		}
		c := new(big.Int)
		// Stored as 64-char lowercase hex (no 0x prefix).
		if _, ok := c.SetString(e.Value, 16); !ok {
			return fmt.Errorf("[FATAL] rebuildTree: database corruption at event %s — malformed scalar field element %q; process aborted to prevent Merkle root divergence", e.ID, e.Value)
		}
		if err := tree.Insert(c); err != nil {
			return err
		}
	}
	return nil
}
