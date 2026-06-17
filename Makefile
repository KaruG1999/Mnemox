BINARY=mnemox
CMD=./cmd/mnemox

-include .env
export

.PHONY: build build-prod build-static run test clean

# Dev build — native OS, CGO enabled via host toolchain.
build:
	CGO_ENABLED=1 go build -o $(BINARY) $(CMD)

# Production build — Linux amd64, dynamically linked against glibc.
# Use this target in CI/CD pipelines deploying to Render, Railway, or any
# glibc-based VPS. CGO_ENABLED=1 is mandatory: mattn/go-sqlite3 wraps the
# SQLite C amalgamation; a CGO_ENABLED=0 build panics at runtime.
build-prod:
	CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
		go build -ldflags="-s -w" -o bin/$(BINARY) $(CMD)

# Static build — fully self-contained binary for distroless / Alpine containers.
# Requires musl-gcc toolchain: apt-get install musl-tools
build-static:
	CGO_ENABLED=1 GOOS=linux GOARCH=amd64 CC=musl-gcc \
		go build -ldflags="-s -w -extldflags '-static'" -o bin/$(BINARY)-static $(CMD)

run:
	CGO_ENABLED=1 go run $(CMD)

test:
	go test ./...

clean:
	rm -f $(BINARY) bin/$(BINARY) bin/$(BINARY)-static mnemox.db
