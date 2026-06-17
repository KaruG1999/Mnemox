// 600×500 compact composition
// f0-120:   horizontal pipeline, one node captured
// f120-360: 3-level Merkle tree builds from base node up
// f360-600: laser scans, proof path citron highlight, "PROVING STATE // VERIFIED"

import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, F, W, H} from './tokens';

// 3-level complete binary tree — centered in 600×500
const N = {
  root: {x:300, y:70,  r:14},
  mL:   {x:148, y:200, r:10},
  mR:   {x:452, y:200, r:10},
  l0:   {x:72,  y:338, r:8},
  l1:   {x:224, y:338, r:8},
  l2:   {x:376, y:338, r:8},
  l3:   {x:528, y:338, r:8},
} as const;

const PIPE_Y = 428;
const F2 = 120, F3 = 360, FTOT = 600;

function po(frame: number, s: number, e: number) {
  return Math.max(0, Math.min(1, (frame - s) / (e - s)));
}
function eo(t: number) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}
function lineDist(a: {x:number;y:number}, b: {x:number;y:number}) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

// Animated line (stroke-dashoffset draw)
const Ln: React.FC<{
  x1:number; y1:number; x2:number; y2:number;
  prog: number; color: string; w: number; glow?: boolean;
}> = ({x1,y1,x2,y2,prog,color,w,glow=false}) => {
  const len = lineDist({x:x1,y:y1},{x:x2,y:y2});
  const p = Math.max(0, Math.min(1, prog));
  if (p <= 0) return null;
  return <>
    {glow && (
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={C.citron} strokeWidth={w * 4} opacity={0.16}
        strokeDasharray={len} strokeDashoffset={len * (1 - p)} strokeLinecap="round"/>
    )}
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={color} strokeWidth={w} opacity={0.82}
      strokeDasharray={len} strokeDashoffset={len * (1 - p)} strokeLinecap="round"/>
  </>;
};

// Spring-popping node
const Nd: React.FC<{
  n: {x:number;y:number;r:number}; sc: number;
  stroke: string; glow?: boolean; lit?: boolean;
}> = ({n,sc,stroke,glow=false,lit=false}) => {
  const r = n.r * Math.max(0, sc);
  if (r <= 0) return null;
  return <>
    {glow && <circle cx={n.x} cy={n.y} r={r * 2.4} fill="none"
      stroke={C.citron} strokeWidth={1} opacity={0.12}/>}
    <circle cx={n.x} cy={n.y} r={r} fill={C.bgBase} stroke={stroke} strokeWidth={1.8}/>
    {lit && <circle cx={n.x} cy={n.y} r={r * 0.42} fill={C.citron}
      style={{filter:'drop-shadow(0 0 6px rgba(202,209,131,0.90))'}}/>}
  </>;
};

export const MnemoxIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // ── PHASE 1: PIPELINE (f0→120) ─────────────────────────────
  const t1    = po(frame, 0, F2);
  const pOp   = 1 - eo(po(frame, F2 - 10, F2 + 10));
  const capG  = eo(po(frame, 52, 100));  // captured node glow

  // ── PHASE 2: TREE BUILD (f120→360) ─────────────────────────
  const t2 = po(frame, F2, F3);

  const leafSc = [0, 10, 20, 30].map(offset =>
    spring({frame: frame - F2 - offset, fps,
      config:{damping:14,stiffness:230,mass:0.4}, from:0, to:1, durationInFrames:18})
  );
  const midSc = spring({frame: frame - F2 - 114, fps,
    config:{damping:14,stiffness:220,mass:0.4}, from:0, to:1, durationInFrames:18});
  const rootSc = spring({frame: frame - F2 - 178, fps,
    config:{damping:12,stiffness:180,mass:0.5}, from:0, to:1, durationInFrames:22});

  const lmProg  = eo(po(frame, F2 + 48,  F2 + 98));   // leaf→mid lines
  const lmrProg = eo(po(frame, F2 + 56,  F2 + 106));
  const mrProg  = eo(po(frame, F2 + 132, F2 + 172));   // mid→root lines

  const leafCount = Math.floor(interpolate(frame, [F2, F3 - 18], [0, 117],
    {extrapolateLeft:'clamp', extrapolateRight:'clamp'}));
  const cntOp = eo(po(frame, F2 + 8, F2 + 28));

  // ── PHASE 3: PROOF (f360→600) ──────────────────────────────
  const t3      = po(frame, F3, FTOT);
  const pFadeIn = eo(po(frame, F3, F3 + 18));

  const laserX = interpolate(frame, [F3, F3 + 132], [-20, 630],
    {extrapolateLeft:'clamp', extrapolateRight:'clamp'});

  const l0Lit   = frame >= F3 && laserX > N.l0.x;
  const mLLit   = frame >= F3 && laserX > N.mL.x;
  const rootLit = frame >= F3 && laserX > N.root.x;

  const rPulse = spring({frame: frame - (F3 + 134), fps,
    config:{damping:9,stiffness:100,mass:0.8}, from:0, to:1, durationInFrames:40});
  const textOp = eo(po(frame, F3 + 148, F3 + 170)) *
                 (1 - eo(po(frame, F3 + 210, F3 + 228)));

  const showTree = frame >= F2 - 8;
  const isP3     = frame >= F3;

  // Helpers for phase-3 colors
  const dimN = (lit: boolean) =>
    lit && isP3 ? C.citron : `rgba(202,209,131,${isP3 ? 0.17 : 0.55})`;
  const dimL = (lit: boolean) =>
    lit && isP3 ? C.citron : `rgba(202,209,131,${isP3 ? 0.11 : 0.44})`;

  return (
    <AbsoluteFill style={{backgroundColor:C.bgBase, overflow:'hidden'}}>
      <AbsoluteFill style={{
        background:'radial-gradient(ellipse 80% 70% at 50% 44%, rgba(102,2,60,0.28) 0%, transparent 65%)',
        pointerEvents:'none',
      }}/>

      <svg style={{position:'absolute',inset:0}} width={W} height={H} overflow="visible">

        {/* ─── PHASE 1: PIPELINE ─── */}
        {pOp > 0.01 && (
          <g opacity={pOp}>
            <line x1={30} y1={PIPE_Y} x2={570} y2={PIPE_Y}
              stroke="rgba(202,209,131,0.14)" strokeWidth={1} strokeDasharray="5 9"/>

            {[90,210,300,390,510].map((bx, i) => {
              const isCap = i === 2;
              const spd = [0.9, 0.7, 0, 1.1, 1.3][i];
              const x = isCap ? 300 : ((bx + t1 * spd * 360) % 608) + 16;
              return (
                <g key={i}>
                  {isCap && capG > 0 && (
                    <circle cx={x} cy={PIPE_Y} r={14}
                      fill={`rgba(202,209,131,${capG * 0.13})`}/>
                  )}
                  <circle cx={x} cy={PIPE_Y} r={isCap ? 9 : 7}
                    fill={C.bgBase}
                    stroke={isCap && capG > 0.3 ? C.citron : `rgba(202,209,131,${isCap ? 0.50 : 0.22})`}
                    strokeWidth={1.6}/>
                  {isCap && capG > 0.5 && (
                    <circle cx={x} cy={PIPE_Y} r={4} fill={C.citron}
                      style={{filter:'drop-shadow(0 0 6px rgba(202,209,131,0.9))'}}/>
                  )}
                </g>
              );
            })}

            <text x={300} y={PIPE_Y + 26} textAnchor="middle"
              fontFamily={F.mono} fontSize={10} fontWeight={700}
              fill="#2E3340" letterSpacing="1.5">
              SOROBAN EVENT STREAM
            </text>
          </g>
        )}

        {/* ─── TREE (phase 2 + 3) ─── */}
        {showTree && (
          <g>
            {/* Leaf → Mid lines */}
            <Ln x1={N.l0.x} y1={N.l0.y} x2={N.mL.x} y2={N.mL.y}
              prog={isP3 ? 1 : lmProg} color={dimL(l0Lit && mLLit)}
              w={isP3 ? 1.4 : 1.6} glow={l0Lit && mLLit && isP3}/>
            <Ln x1={N.l1.x} y1={N.l1.y} x2={N.mL.x} y2={N.mL.y}
              prog={isP3 ? 1 : lmProg} color={dimL(false)} w={isP3 ? 1.4 : 1.6}/>
            <Ln x1={N.l2.x} y1={N.l2.y} x2={N.mR.x} y2={N.mR.y}
              prog={isP3 ? 1 : lmrProg} color={dimL(false)} w={isP3 ? 1.4 : 1.6}/>
            <Ln x1={N.l3.x} y1={N.l3.y} x2={N.mR.x} y2={N.mR.y}
              prog={isP3 ? 1 : lmrProg} color={dimL(false)} w={isP3 ? 1.4 : 1.6}/>

            {/* Mid → Root lines */}
            <Ln x1={N.mL.x} y1={N.mL.y} x2={N.root.x} y2={N.root.y}
              prog={isP3 ? 1 : mrProg} color={dimL(mLLit && rootLit)}
              w={isP3 ? 1.6 : 1.8} glow={mLLit && rootLit && isP3}/>
            <Ln x1={N.mR.x} y1={N.mR.y} x2={N.root.x} y2={N.root.y}
              prog={isP3 ? 1 : mrProg} color={dimL(false)} w={isP3 ? 1.6 : 1.8}/>

            {/* Leaf nodes */}
            {([N.l0, N.l1, N.l2, N.l3] as const).map((n, i) => (
              <Nd key={`l${i}`} n={n}
                sc={isP3 ? pFadeIn : leafSc[i]}
                stroke={dimN(i === 0 && l0Lit)}
                glow={i === 0 && l0Lit && isP3}
                lit={i === 0 && l0Lit && isP3}/>
            ))}

            {/* Mid nodes */}
            {([N.mL, N.mR] as const).map((n, i) => (
              <Nd key={`m${i}`} n={n}
                sc={isP3 ? pFadeIn : midSc}
                stroke={dimN(i === 0 && mLLit)}
                glow={i === 0 && mLLit && isP3}
                lit={i === 0 && mLLit && isP3}/>
            ))}

            {/* Root */}
            {isP3 ? (
              <>
                {rootLit && [2.0, 1.4].map((k, j) => (
                  <circle key={j} cx={N.root.x} cy={N.root.y}
                    r={N.root.r * k * Math.max(0, rPulse)}
                    fill="none" stroke={C.citron} strokeWidth={1} opacity={j === 0 ? 0.10 : 0.17}/>
                ))}
                <Nd n={N.root} sc={pFadeIn}
                  stroke={dimN(rootLit)} glow={rootLit} lit={rootLit}/>
              </>
            ) : (
              <>
                {rootSc > 0.4 && [1.8, 1.2].map((k, j) => (
                  <circle key={j} cx={N.root.x} cy={N.root.y}
                    r={N.root.r * k * Math.max(0, rootSc)}
                    fill="none" stroke={C.citron} strokeWidth={1} opacity={0.08}/>
                ))}
                <Nd n={N.root} sc={rootSc}
                  stroke={dimN(false)} glow={rootSc > 0.8} lit={rootSc > 0.8}/>
              </>
            )}

            {/* Laser sweep (phase 3) */}
            {isP3 && laserX > -20 && laserX < 640 && (
              <>
                <defs>
                  <linearGradient id="lz"
                    x1={laserX - 35} y1="0" x2={laserX + 35} y2="0"
                    gradientUnits="userSpaceOnUse">
                    <stop offset="0%"   stopColor={C.citron} stopOpacity={0}/>
                    <stop offset="35%"  stopColor={C.citron} stopOpacity={0.06}/>
                    <stop offset="50%"  stopColor={C.citron} stopOpacity={0.20}/>
                    <stop offset="65%"  stopColor={C.citron} stopOpacity={0.06}/>
                    <stop offset="100%" stopColor={C.citron} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <rect x={laserX - 35} y={0} width={70} height={H} fill="url(#lz)"/>
              </>
            )}
          </g>
        )}

        {/* Leaf counter — phase 2 only */}
        {frame >= F2 + 8 && frame < F3 && (
          <g opacity={cntOp}>
            <text x={556} y={72} textAnchor="end"
              fontFamily={F.mono} fontSize={80} fontWeight={700}
              fill={C.citron} letterSpacing="-2"
              style={{filter:'drop-shadow(0 0 24px rgba(202,209,131,0.22))'}}>
              {String(leafCount).padStart(3, '0')}
            </text>
            <text x={556} y={89} textAnchor="end"
              fontFamily={F.mono} fontSize={11} fontWeight={700}
              fill="#2E3340" letterSpacing="1.5">
              LEAVES
            </text>
          </g>
        )}

        {/* "PROVING STATE // VERIFIED" */}
        {frame >= F3 + 145 && textOp > 0 && (
          <text x={300} y={36} textAnchor="middle"
            fontFamily={F.mono} fontSize={12} fontWeight={700}
            fill={C.citron} opacity={textOp} letterSpacing="2">
            PROVING STATE // VERIFIED
          </text>
        )}

      </svg>
    </AbsoluteFill>
  );
};
