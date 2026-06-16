package server

import (
	"context"
	"io"
	"log"
	"net/http"
	"time"

	rpcclient "github.com/stellar/go/clients/rpcclient"

	"github.com/karengiannetto/mnemox/internal/crypto"
	"github.com/karengiannetto/mnemox/internal/database"
)

type Server struct {
	store       *database.Store
	tree        *crypto.MerkleTree
	rpc         *rpcclient.Client
	network     string
	start       time.Time
	syncCheckFn func(ctx context.Context) error // overridable in tests; nil = use assertSyncState
}

func NewServer(st *database.Store, tree *crypto.MerkleTree, network, rpcURL string) *Server {
	return &Server{
		store:   st,
		tree:    tree,
		rpc:     rpcclient.NewClient(rpcURL, nil),
		network: network,
		start:   time.Now(),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/tree/root", s.handleRoot)
	mux.HandleFunc("/tree/proof/", s.handleProof)
	mux.HandleFunc("/events", s.handleEvents)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		serveEmbedded(w, r, "public/index.html")
	})
	mux.HandleFunc("/dashboard", func(w http.ResponseWriter, r *http.Request) {
		serveEmbedded(w, r, "public/dashboard.html")
	})
	mux.HandleFunc("/docs", func(w http.ResponseWriter, r *http.Request) {
		serveEmbedded(w, r, "public/docs.html")
	})
	// Rate-limit at 60 burst / 30 sustained rps to protect the O(n) FindLeaf
	// path and SQLite reads from trivial DoS.
	return logging(rateLimit(mux, 60, 30))
}

// rateLimit implements a token-bucket middleware.
// burst is the maximum instantaneous capacity; rps is the refill rate.
func rateLimit(next http.Handler, burst, rps int) http.Handler {
	tokens := make(chan struct{}, burst)
	for i := 0; i < burst; i++ {
		tokens <- struct{}{}
	}
	ticker := time.NewTicker(time.Second / time.Duration(rps))
	go func() {
		for range ticker.C {
			select {
			case tokens <- struct{}{}:
			default: // bucket full — discard token
			}
		}
	}()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-tokens:
			next.ServeHTTP(w, r)
		default:
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"rate limit exceeded"}`))
		}
	})
}

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(t))
	})
}

func serveEmbedded(w http.ResponseWriter, r *http.Request, path string) {
	f, err := FrontendAssets.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	io.Copy(w, f)
}
