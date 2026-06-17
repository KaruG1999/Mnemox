/**
 * MnemoxFlow — 1920×1080 · 30fps · 450 frames (15s)
 *
 * Three full-screen cinematic stages. No nav, no footer, no cards.
 * Palette matches the existing Mnemox visual identity (tokens.ts):
 *   bg #030305 · citron #CAD183 · tyrian #66023C
 */

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// ─── Palette (mirrors tokens.ts) ─────────────────────────────────────────────
const BG      = '#030305';
const CITRON  = '#CAD183';
const TYRIAN  = '#66023C';
const WHITE   = '#ECEEF0';
const MUTED   = 'rgba(202,209,131,0.28)';
const DIM     = 'rgba(202,209,131,0.14)';
const WARN    = '#E85D75';
const MONO    = '"JetBrains Mono","SF Mono","Courier New",monospace';

// ─── Timeline ─────────────────────────────────────────────────────────────────
// Stage 1: f0–150   — The Ledger Problem
// Stage 2: f130–290 — Atomic Persistence
// Stage 3: f270–450 — Merkle Proof Engine
const T_FADE = 20; // cross-fade duration

function stageOpacity(frame: number, inF: number, outF: number): number {
  const fadeIn  = Math.min(1, Math.max(0, (frame - inF)  / T_FADE));
  const fadeOut = Math.min(1, Math.max(0, (outF - frame) / T_FADE));
  return Math.min(fadeIn, fadeOut);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function ease(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}
function po(frame: number, s: number, e: number): number {
  return Math.max(0, Math.min(1, (frame - s) / (e - s)));
}
function deterministicHex(frame: number, seed: number, len: number): string {
  let h = ((Math.floor(frame / 4) * 0x9e3779b9) ^ (seed * 0x6c62272e)) >>> 0;
  let s = '';
  for (let i = 0; i < len; i++) {
    h = (Math.imul(h, 0x5851f42d) + 0xc4cec4c5) >>> 0;
    s += (h & 0xf).toString(16);
  }
  return s;
}

// ─── Stage 1: The Ledger Problem (f0–150) ────────────────────────────────────
const Stage1: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const localF = frame;
  const op     = stageOpacity(frame, 0, 150);
  if (op <= 0) return null;

  const ledger     = 49_832_000 + Math.floor(localF * 2.1);
  const ttl        = Math.max(0, 100 - Math.floor(localF * 0.55));
  const showAlert  = localF > 72;
  const alertBlink = showAlert ? Math.sin((localF - 72) * 0.22) * 0.5 + 0.5 : 0;
  const fadeIn     = ease(po(frame, 0, 30));

  const hexLines = [0, 1, 2].map(i => deterministicHex(frame, i * 23 + 7, 64));

  return (
    <AbsoluteFill style={{ opacity: op }}>
      {/* Radial Tyrian glow — same as MnemoxIntro */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse 65% 60% at 50% 45%, rgba(102,2,60,0.32) 0%, transparent 68%)`,
        pointerEvents: 'none',
      }} />

      {/* Center column */}
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 0, opacity: fadeIn,
      }}>

        {/* Label */}
        <div style={{
          fontFamily: MONO, fontSize: 16, color: MUTED,
          letterSpacing: 6, textTransform: 'uppercase',
          marginBottom: 32,
        }}>
          Soroban RPC · Latest Ledger
        </div>

        {/* Giant ledger number */}
        <div style={{
          fontFamily: MONO, fontSize: 128, fontWeight: 800,
          color: WHITE, letterSpacing: -6, lineHeight: 1,
          filter: `drop-shadow(0 0 40px rgba(202,209,131,0.18))`,
          marginBottom: 16,
        }}>
          #{ledger.toLocaleString()}
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: MONO, fontSize: 16, color: MUTED,
          letterSpacing: 4, marginBottom: 64,
        }}>
          Protocol 26 · Yardstick · BN254 Native
        </div>

        {/* Hex stream */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          alignItems: 'center', marginBottom: 56,
        }}>
          {hexLines.map((h, i) => (
            <div key={i} style={{
              fontFamily: MONO,
              fontSize: i === 0 ? 22 : 16,
              color: i === 0 ? CITRON : DIM,
              letterSpacing: 1,
              filter: i === 0 ? `drop-shadow(0 0 12px rgba(202,209,131,0.5))` : undefined,
            }}>
              0x{h}
            </div>
          ))}
        </div>

        {/* TTL meter */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 40,
          marginBottom: showAlert ? 48 : 0,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: MONO, fontSize: 13, color: MUTED, letterSpacing: 3, marginBottom: 8 }}>
              RETENTION TTL
            </div>
            <div style={{
              fontFamily: MONO, fontSize: 72, fontWeight: 800,
              color: ttl < 20 ? WARN : CITRON,
              filter: `drop-shadow(0 0 24px ${ttl < 20 ? 'rgba(232,93,117,0.5)' : 'rgba(202,209,131,0.3)'})`,
              lineHeight: 1,
            }}>
              {ttl}%
            </div>
            <div style={{ fontFamily: MONO, fontSize: 13, color: MUTED, letterSpacing: 3, marginTop: 8 }}>
              ≈ 7 DAY WINDOW
            </div>
          </div>
        </div>

        {/* CRITICAL alert */}
        {showAlert && (
          <div style={{
            fontFamily: MONO,
            textAlign: 'center',
            opacity: 0.55 + alertBlink * 0.45,
          }}>
            <div style={{
              fontSize: 13, color: WARN, letterSpacing: 5,
              fontWeight: 700, marginBottom: 10,
            }}>
              ⚠  [CRITICAL] CRYPTOGRAPHIC ENGINE
            </div>
            <div style={{ fontSize: 20, color: WHITE, letterSpacing: 2 }}>
              Merkle tree boundary reached at 2^20 = 1,048,576
            </div>
            <div style={{ fontSize: 16, color: MUTED, marginTop: 6, letterSpacing: 2 }}>
              Page mutation required.
            </div>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Stage 2: Atomic Disk Persistence (f130–290) ─────────────────────────────
const WAL_SEQ = ['WAL_WRITE', 'CHECKPOINT', 'FSYNC', 'COMMIT'] as const;

const Stage2: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const localF = frame - 130;
  const op     = stageOpacity(frame, 130, 290);
  if (op <= 0) return null;

  const fadeIn    = ease(po(frame, 130, 160));
  const numBlocks = Math.min(4, Math.floor(localF / 16));

  const telemetry = [
    { k: 'SaveBatch',          v: 'atomic transaction',     delay: 30 },
    { k: 'journal_mode',       v: 'WAL',                    delay: 48 },
    { k: 'max_open_conns',     v: '1',                      delay: 62 },
    { k: 'max_idle_conns',     v: '1',                      delay: 76 },
    { k: 'busy_timeout',       v: '5 000 ms',               delay: 90 },
    { k: 'VerifyMonotonicity', v: 'PASS',                   delay: 108 },
    { k: 'synchronous',        v: 'NORMAL',                 delay: 122 },
  ];

  const showBatch = localF > 100;

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse 65% 60% at 50% 45%, rgba(102,2,60,0.28) 0%, transparent 68%)`,
        pointerEvents: 'none',
      }} />

      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        opacity: fadeIn, gap: 0,
      }}>

        {/* Stage label */}
        <div style={{
          fontFamily: MONO, fontSize: 16, color: MUTED,
          letterSpacing: 6, marginBottom: 52,
        }}>
          Write-Ahead Log Pipeline
        </div>

        {/* WAL blocks — 4 large pills */}
        <div style={{ display: 'flex', gap: 32, marginBottom: 72 }}>
          {WAL_SEQ.map((label, i) => {
            const visible = i < numBlocks;
            const blockOp = ease(po(frame, 130 + i * 16, 130 + i * 16 + 20));
            return (
              <div key={label} style={{
                width: 240, height: 120,
                border: `1.5px solid ${visible ? CITRON : 'rgba(202,209,131,0.10)'}`,
                borderRadius: 12,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                opacity: visible ? blockOp : 0.15,
                filter: visible
                  ? `drop-shadow(0 0 20px rgba(202,209,131,0.22))`
                  : undefined,
                background: visible ? 'rgba(202,209,131,0.04)' : 'transparent',
              }}>
                <div style={{
                  fontFamily: MONO, fontSize: 18, fontWeight: 700,
                  color: visible ? CITRON : MUTED, letterSpacing: 2,
                }}>
                  {label}
                </div>
                <div style={{
                  fontFamily: MONO, fontSize: 12, color: MUTED,
                  marginTop: 8, letterSpacing: 1,
                }}>
                  PAGE_{i + 1}
                </div>
              </div>
            );
          })}
        </div>

        {/* Telemetry lines */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 14,
          alignItems: 'flex-start', minWidth: 560,
        }}>
          {telemetry.map(({ k, v, delay }) => {
            const vis = localF > delay;
            return (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between',
                width: '100%', opacity: vis ? ease(po(frame, 130 + delay, 130 + delay + 16)) : 0,
              }}>
                <span style={{ fontFamily: MONO, fontSize: 20, color: MUTED, letterSpacing: 1 }}>
                  {k}
                </span>
                <span style={{
                  fontFamily: MONO, fontSize: 20,
                  color: k === 'VerifyMonotonicity' ? CITRON : WHITE,
                  letterSpacing: 1,
                  filter: k === 'VerifyMonotonicity'
                    ? `drop-shadow(0 0 10px rgba(202,209,131,0.4))`
                    : undefined,
                }}>
                  {v}
                </span>
              </div>
            );
          })}
        </div>

        {/* SaveBatch note */}
        {showBatch && (
          <div style={{
            marginTop: 52,
            fontFamily: MONO, fontSize: 14, color: MUTED,
            letterSpacing: 3, textAlign: 'center',
            opacity: ease(po(frame, 230, 250)),
          }}>
            INSERT OR IGNORE · rollback-protected · WAL-persisted
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Stage 3: Merkle Proof Engine (f270–450) ─────────────────────────────────

// Tree geometry — 4 levels, 8 leaves, fits inside 1920×1080
// root → 2 → 4 → 8 leaves
type Pt = { x: number; y: number; r: number };

const TREE: Pt[] = [
  // root
  { x: 960, y: 110, r: 22 },
  // L2
  { x: 620, y: 270, r: 16 },
  { x: 1300, y: 270, r: 16 },
  // L3
  { x: 450, y: 430, r: 12 },
  { x: 790, y: 430, r: 12 },
  { x: 1130, y: 430, r: 12 },
  { x: 1470, y: 430, r: 12 },
  // L4 leaves (idx 7..14)
  { x: 365, y: 590, r: 9 },
  { x: 535, y: 590, r: 9 },
  { x: 705, y: 590, r: 9 },
  { x: 875, y: 590, r: 9 },
  { x: 1045, y: 590, r: 9 },
  { x: 1215, y: 590, r: 9 },
  { x: 1385, y: 590, r: 9 },
  { x: 1555, y: 590, r: 9 },
];

const EDGES: [number, number][] = [
  [0,1],[0,2],
  [1,3],[1,4],[2,5],[2,6],
  [3,7],[3,8],[4,9],[4,10],[5,11],[5,12],[6,13],[6,14],
];

function lineDist(a: Pt, b: Pt) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

const Stage3: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const localF = frame - 270;
  const op     = stageOpacity(frame, 270, 450);
  if (op <= 0) return null;

  const fadeIn    = ease(po(frame, 270, 300));
  const litLeaves = Math.min(8, Math.floor(localF / 16));

  const rootPulse = localF > 100
    ? spring({ fps, frame: localF - 100, config: { damping: 9, stiffness: 80, mass: 0.9 }, durationInFrames: 50 })
    : 0;

  const showBadge = localF > 130;
  const badgeOp   = ease(po(frame, 400, 420));
  const rootHex   = deterministicHex(frame, 99, 64);

  // Per-leaf spring pop
  const leafSprings = TREE.slice(7).map((_, i) =>
    spring({ fps, frame: localF - 20 - i * 16, config: { damping: 13, stiffness: 200, mass: 0.4 }, durationInFrames: 20 })
  );

  // Edge draw progress (leaf→parent, then parent→root)
  function edgeProg(childIdx: number): number {
    // leaf edges: appear when the leaf springs in
    if (childIdx >= 7) return Math.max(0, leafSprings[childIdx - 7] ?? 0);
    // L3→L2 edges
    if (childIdx >= 3) return ease(po(frame, 270 + 20 + 60, 270 + 20 + 80));
    // L2→root
    return ease(po(frame, 270 + 20 + 90, 270 + 20 + 110));
  }

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse 70% 65% at 50% 42%, rgba(102,2,60,0.30) 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <AbsoluteFill style={{ opacity: fadeIn }}>
        {/* Stage label */}
        <div style={{
          position: 'absolute', top: 44, left: 0, right: 0,
          textAlign: 'center',
          fontFamily: MONO, fontSize: 16, color: MUTED, letterSpacing: 6,
        }}>
          Poseidon BN254 · Depth 20 · Incremental Merkle Tree
        </div>

        {/* Leaf counter */}
        {litLeaves > 0 && (
          <div style={{
            position: 'absolute', top: 40, right: 100,
            fontFamily: MONO, fontWeight: 700,
            fontSize: 64, color: CITRON, lineHeight: 1,
            filter: `drop-shadow(0 0 24px rgba(202,209,131,0.25))`,
            textAlign: 'right',
          }}>
            {String(litLeaves).padStart(2, '0')}
            <div style={{ fontSize: 14, color: MUTED, letterSpacing: 4, fontWeight: 400, marginTop: 4 }}>
              LEAVES
            </div>
          </div>
        )}

        {/* Merkle SVG — full canvas */}
        <svg
          style={{ position: 'absolute', inset: 0 }}
          width={1920}
          height={1080}
          overflow="visible"
        >
          {/* Edges */}
          {EDGES.map(([a, b], i) => {
            const na = TREE[a]!;
            const nb = TREE[b]!;
            const len = lineDist(na, nb);
            const prog = edgeProg(b);
            const isLeafEdge = b >= 7;
            const leafLit = isLeafEdge && (b - 7) < litLeaves;
            const color = leafLit ? CITRON : `rgba(202,209,131,${isLeafEdge ? 0.15 : 0.30})`;
            if (prog <= 0) return null;
            return (
              <g key={i}>
                {leafLit && (
                  <line
                    x1={na.x} y1={na.y + na.r}
                    x2={nb.x} y2={nb.y - nb.r}
                    stroke={CITRON} strokeWidth={6} opacity={0.10}
                    strokeLinecap="round"
                    strokeDasharray={len} strokeDashoffset={len * (1 - prog)}
                  />
                )}
                <line
                  x1={na.x} y1={na.y + na.r}
                  x2={nb.x} y2={nb.y - nb.r}
                  stroke={color} strokeWidth={leafLit ? 2 : 1.5} opacity={0.80}
                  strokeLinecap="round"
                  strokeDasharray={len} strokeDashoffset={len * (1 - prog)}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {TREE.map((n, i) => {
            const isRoot  = i === 0;
            const isLeaf  = i >= 7;
            const leafIdx = i - 7;
            const lit     = isLeaf && leafIdx < litLeaves;
            const sc      = isLeaf
              ? Math.max(0, leafSprings[leafIdx] ?? 0)
              : isRoot ? ease(po(frame, 270 + 20 + 110, 270 + 20 + 130))
              : ease(po(frame, 270 + 20 + 60, 270 + 20 + 80));

            if (sc <= 0) return null;
            const r = n.r * sc;

            return (
              <g key={i}>
                {/* Glow ring for lit/root nodes */}
                {(lit || isRoot) && (
                  <circle cx={n.x} cy={n.y} r={r * 2.2}
                    fill="none" stroke={CITRON} strokeWidth={1}
                    opacity={isRoot ? 0.09 * rootPulse : 0.10}
                  />
                )}
                {/* Root pulse rings */}
                {isRoot && rootPulse > 0.3 && (
                  <circle cx={n.x} cy={n.y} r={r * (1.6 + rootPulse * 0.8)}
                    fill="none" stroke={CITRON} strokeWidth={1.5}
                    opacity={(1 - rootPulse) * 0.22}
                  />
                )}
                {/* Node circle */}
                <circle cx={n.x} cy={n.y} r={r}
                  fill={BG}
                  stroke={lit || isRoot ? CITRON : `rgba(202,209,131,${isLeaf ? 0.18 : 0.40})`}
                  strokeWidth={isRoot ? 2.5 : isLeaf ? 1.8 : 2}
                />
                {/* Inner fill dot for lit/root */}
                {(lit || (isRoot && rootPulse > 0.5)) && (
                  <circle cx={n.x} cy={n.y} r={r * 0.44}
                    fill={CITRON}
                    style={{ filter: 'drop-shadow(0 0 8px rgba(202,209,131,0.95))' }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* toNoirFormat badge */}
        {showBadge && (
          <div style={{
            position: 'absolute',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            opacity: badgeOp,
          }}>
            <div style={{
              fontFamily: MONO, fontSize: 14, color: MUTED,
              letterSpacing: 4, marginBottom: 16,
            }}>
              0x{rootHex.slice(0, 24)}…
            </div>
            <div style={{
              fontFamily: MONO, fontSize: 36, fontWeight: 800,
              color: CITRON, letterSpacing: 3,
              filter: `drop-shadow(0 0 28px rgba(202,209,131,0.55))`,
            }}>
              toNoirFormat() → READY FOR ULTRAHONK
            </div>
            <div style={{
              fontFamily: MONO, fontSize: 14, color: MUTED,
              letterSpacing: 3, marginTop: 14,
            }}>
              sibling_path[20] · zero-padded 256-bit BN254 field elements
            </div>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Root composition ─────────────────────────────────────────────────────────
export const MnemoxFlowComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const globalFadeIn = Math.min(1, frame / 12);

  return (
    <AbsoluteFill style={{ backgroundColor: BG, opacity: globalFadeIn }}>
      <Stage1 frame={frame} fps={fps} />
      <Stage2 frame={frame} fps={fps} />
      <Stage3 frame={frame} fps={fps} />
    </AbsoluteFill>
  );
};
