// SCENE 01 · f 0–120 · BRAND REVEAL
// Pure cinematic: Tyrian bloom → logo emerges → tagline
// NO explanatory text — the homepage copy handles that

import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {MnemoxLogo} from '../MnemoxLogo';
import {C, F} from '../tokens';

export const Scene01Oblivion: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps}  = useVideoConfig();

  // Tyrian atmosphere blooms in over 80f
  const glowOp = interpolate(frame, [0, 80], [0, 1], {extrapolateRight: 'clamp'});

  // Logo spring entrance
  const logoSc = spring({
    frame, fps,
    config: {damping: 18, stiffness: 140, mass: 0.7},
    from: 0.80, to: 1,
    durationInFrames: 60,
  });
  const logoOp = interpolate(frame, [0, 28], [0, 1], {extrapolateRight: 'clamp'});

  // Wordmark slides in from left
  const markX = interpolate(frame, [30, 70], [-40, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const markOp = interpolate(frame, [30, 65], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Scene exit fade
  const exitOp = interpolate(frame, [100, 120], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: C.bgBase, opacity: exitOp}}>

      {/* Large Tyrian radial bloom */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse 100% 80% at 50% 44%,
          rgba(102,2,60,${0.50 * glowOp}) 0%,
          rgba(102,2,60,${0.18 * glowOp}) 40%,
          transparent 68%)`,
      }} />

      {/* Faint secondary citron halo */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse 55% 40% at 50% 52%,
          rgba(202,209,131,${0.04 * glowOp}) 0%,
          transparent 55%)`,
      }} />

      {/* Center content */}
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 0,
      }}>
        {/* Isotipo — large */}
        <div style={{
          opacity: logoOp,
          transform: `scale(${logoSc})`,
          filter: `drop-shadow(0 0 48px rgba(202,209,131,0.28))`,
          marginBottom: 42,
        }}>
          <MnemoxLogo size={180} showWordmark={false} />
        </div>

        {/* MNEMOX wordmark */}
        <div style={{
          opacity: markOp,
          transform: `translateX(${markX}px)`,
          fontFamily: F.ui,
          fontSize: 120,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: C.textPrimary,
          lineHeight: 1,
          filter: `drop-shadow(0 0 30px rgba(202,209,131,0.10))`,
        }}>
          MNEMOX
        </div>

        {/* Sub-descriptor — small, appears last */}
        <div style={{
          opacity: interpolate(frame, [65, 92], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          }),
          fontFamily: F.mono,
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '0.20em',
          textTransform: 'uppercase',
          color: C.textMuted,
          marginTop: 24,
        }}>
          ZK INGESTION LAYER · STELLAR SOROBAN
        </div>
      </AbsoluteFill>

      {/* Bottom corner telemetry — minimal */}
      <div style={{
        position: 'absolute', bottom: 56, left: 80,
        opacity: interpolate(frame, [75, 100], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        }) * exitOp,
        display: 'flex', gap: 40,
      }}>
        {[['DEPTH', '20'], ['HASH_FN', 'POSEIDON BN254'], ['RETENTION', '∞']].map(([k, v]) => (
          <div key={k} style={{fontFamily: F.mono, fontSize: 18}}>
            <span style={{color: C.textMuted}}>{k}  </span>
            <span style={{color: C.citron, fontWeight: 700}}>{v}</span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
