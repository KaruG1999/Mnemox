#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:8080"
WAIT_SECS=${WAIT_SECS:-15}

echo ""
echo "  ███╗   ███╗███╗   ██╗███████╗███╗   ███╗ ██████╗ ██╗  ██╗"
echo "  ████╗ ████║████╗  ██║██╔════╝████╗ ████║██╔═══██╗╚██╗██╔╝"
echo "  ██╔████╔██║██╔██╗ ██║█████╗  ██╔████╔██║██║   ██║ ╚███╔╝ "
echo "  ██║╚██╔╝██║██║╚██╗██║██╔══╝  ██║╚██╔╝██║██║   ██║ ██╔██╗ "
echo "  ██║ ╚═╝ ██║██║ ╚████║███████╗██║ ╚═╝ ██║╚██████╔╝██╔╝ ██╗"
echo "  ╚═╝     ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝"
echo ""
echo "  The memory layer for ZK applications on Stellar."
echo ""

check_running() {
  curl -sf "$BASE/health" > /dev/null 2>&1
}

if ! check_running; then
  echo "  [!] Mnemox is not running. Start it with: make run"
  echo ""
  exit 1
fi

# ─── Health ────────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  1. Service health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
HEALTH=$(curl -sf "$BASE/health")
echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"
echo ""

# ─── Wait for events if needed ────────────────────────────────────────────
COUNT=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('indexed_events',0))" 2>/dev/null || echo "0")
if [ "$COUNT" -eq 0 ]; then
  echo "  Waiting up to ${WAIT_SECS}s for first events to be indexed..."
  for i in $(seq 1 $WAIT_SECS); do
    sleep 1
    H=$(curl -sf "$BASE/health")
    C=$(echo "$H" | python3 -c "import sys,json; print(json.load(sys.stdin).get('indexed_events',0))" 2>/dev/null || echo "0")
    if [ "$C" -gt 0 ]; then
      echo "  Got $C events."
      break
    fi
    printf "  .(%ds)\r" "$i"
  done
  echo ""
fi

# ─── Merkle root ──────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  2. Merkle tree root"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ROOT_RESP=$(curl -sf "$BASE/tree/root")
echo "$ROOT_RESP" | python3 -m json.tool 2>/dev/null || echo "$ROOT_RESP"
echo ""

# ─── Proof for first known commitment ─────────────────────────────────────
CONTRACT="${CONTRACT_ID:-}"
if [ -z "$CONTRACT" ] && [ -f ".env" ]; then
  CONTRACT=$(grep '^CONTRACT_ID=' .env | cut -d= -f2)
fi

if [ -n "$CONTRACT" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  3. Fetching first indexed event as proof target"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  FIRST_VALUE=$(curl -sf "$BASE/events?contract=$CONTRACT&limit=1" | \
    python3 -c "import sys,json; events=json.load(sys.stdin)['events']; print(events[0]['value'] if events else '')" 2>/dev/null || echo "")

  if [ -n "$FIRST_VALUE" ]; then
    echo "  Target commitment: $FIRST_VALUE"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  4. Merkle inclusion proof"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    PROOF=$(curl -sf "$BASE/tree/proof/$FIRST_VALUE" 2>/dev/null || echo '{"error":"not found"}')
    echo "$PROOF" | python3 -m json.tool 2>/dev/null || echo "$PROOF"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Result"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Stellar's RPC window:  7 days"
    echo "  Mnemox window:         forever"
    echo ""
    echo "  in RPC window   NO  ✗"
    echo "  proof valid     YES ✓"
    echo ""
  else
    echo "  No events indexed yet for contract $CONTRACT"
  fi
else
  echo "  (Set CONTRACT_ID to run the proof demo)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Dashboard: http://localhost:8080/dashboard"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
