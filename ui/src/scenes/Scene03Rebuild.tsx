// SCENE 03 · PROOF EXTRACTION + FINALE
// Same tree frozen → one path lights up → <1ms → "MNEMOX REMEMBERS."
// Zero prose — pure visual

import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {MnemoxLogo} from '../MnemoxLogo';
import {C, F} from '../tokens';
import {TREE} from '../treeLayout';

function dist(a:{x:number;y:number}, b:{x:number;y:number}) {
  return Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2);
}

// Glowing line (proof path highlight)
const GlowLine: React.FC<{x1:number;y1:number;x2:number;y2:number;sf:number;dur:number;frame:number}> =
  ({x1,y1,x2,y2,sf,dur,frame}) => {
    const len = dist({x:x1,y:y1},{x:x2,y:y2});
    const p = interpolate(frame,[sf,sf+dur],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
    if (p<=0) return null;
    return (
      <>
        {/* glow layer */}
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={C.citron} strokeWidth={8}
          strokeDasharray={len} strokeDashoffset={len*(1-p)}
          strokeLinecap="round" opacity={0.18}/>
        {/* sharp layer */}
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={C.citron} strokeWidth={2.4}
          strokeDasharray={len} strokeDashoffset={len*(1-p)}
          strokeLinecap="round" opacity={0.9}/>
      </>
    );
  };

// Dim line (non-path branches)
const DimLine: React.FC<{x1:number;y1:number;x2:number;y2:number}> =
  ({x1,y1,x2,y2}) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={C.citron} strokeWidth={1.4} opacity={0.14} strokeLinecap="round"/>
  );

// Glowing node (proof path)
const GlowDot: React.FC<{cx:number;cy:number;r:number;sf:number;frame:number;fps:number}> =
  ({cx,cy,r,sf,frame,fps}) => {
    const sc = spring({frame:frame-sf,fps,config:{damping:12,stiffness:220,mass:0.4},from:0.4,to:1,durationInFrames:22});
    if (frame<sf) return null;
    return (
      <>
        <circle cx={cx} cy={cy} r={r*2.2*Math.max(0,sc)} fill="none" stroke={C.citron} strokeWidth={1} opacity={0.15}/>
        <circle cx={cx} cy={cy} r={r*Math.max(0,sc)}
          fill="rgba(3,3,5,0.92)" stroke={C.citron} strokeWidth={2.2}/>
        <circle cx={cx} cy={cy} r={r*0.42*Math.max(0,sc)} fill={C.citron}
          style={{filter:`drop-shadow(0 0 8px rgba(202,209,131,0.8))`}}/>
      </>
    );
  };

// Dim (non-path) node, already visible
const DimDot: React.FC<{cx:number;cy:number;r:number}> =
  ({cx,cy,r}) => (
    <circle cx={cx} cy={cy} r={r}
      fill="rgba(3,3,5,0.92)" stroke="rgba(202,209,131,0.18)" strokeWidth={1.6}/>
  );

export const Scene03Rebuild: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const sceneOp = interpolate(frame,[0,18],[0,1],{extrapolateRight:'clamp'});

  // Proof path lights up: leaf0 → i0 → m0 → root, 22f each
  const P0 = 14;   // leaf0 appears
  const P1 = 36;   // l0 → i0 line
  const P2 = 60;   // i0 node
  const P3 = 78;   // i0 → m0 line
  const P4 = 100;  // m0 node
  const P5 = 118;  // m0 → root line
  const P6 = 140;  // root node

  // <1ms badge
  const BADGE = 165;
  const badgeSc = spring({frame:frame-BADGE,fps,config:{damping:10,stiffness:200,mass:0.55},from:0.6,to:1,durationInFrames:30});
  const badgeOp = interpolate(frame,[BADGE,BADGE+16],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});

  // Finale
  const FIN = 195;
  const finOp = interpolate(frame,[FIN,FIN+20],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const finSc = spring({frame:frame-FIN,fps,config:{damping:16,stiffness:160,mass:0.6},from:0.92,to:1,durationInFrames:35});

  return (
    <AbsoluteFill style={{backgroundColor:C.bgBase, opacity:sceneOp, overflow:'hidden'}}>

      {/* Tyrian atmosphere */}
      <AbsoluteFill style={{
        background:'radial-gradient(ellipse 80% 70% at 60% 50%, rgba(102,2,60,0.32) 0%, transparent 65%)',
        pointerEvents:'none',
      }}/>

      <svg style={{position:'absolute',inset:0,overflow:'visible'}} width={1920} height={1080}>

        {/* ── FULL TREE (dim, static) ── */}
        {/* Leaf → Intermediate (non-path) */}
        <DimLine x1={TREE.l1.x} y1={TREE.l1.y} x2={TREE.i0.x} y2={TREE.i0.y}/>
        <DimLine x1={TREE.l2.x} y1={TREE.l2.y} x2={TREE.i1.x} y2={TREE.i1.y}/>
        <DimLine x1={TREE.l3.x} y1={TREE.l3.y} x2={TREE.i1.x} y2={TREE.i1.y}/>
        <DimLine x1={TREE.l4.x} y1={TREE.l4.y} x2={TREE.i2.x} y2={TREE.i2.y}/>
        <DimLine x1={TREE.l5.x} y1={TREE.l5.y} x2={TREE.i2.x} y2={TREE.i2.y}/>
        <DimLine x1={TREE.l6.x} y1={TREE.l6.y} x2={TREE.i3.x} y2={TREE.i3.y}/>
        {/* Intermediate → Mid (non-path) */}
        <DimLine x1={TREE.i1.x} y1={TREE.i1.y} x2={TREE.m0.x} y2={TREE.m0.y}/>
        <DimLine x1={TREE.i2.x} y1={TREE.i2.y} x2={TREE.m1.x} y2={TREE.m1.y}/>
        <DimLine x1={TREE.i3.x} y1={TREE.i3.y} x2={TREE.m1.x} y2={TREE.m1.y}/>
        {/* Mid → Root (non-path) */}
        <DimLine x1={TREE.m1.x} y1={TREE.m1.y} x2={TREE.root.x} y2={TREE.root.y}/>

        {/* Dim nodes */}
        {[TREE.l1,TREE.l2,TREE.l3,TREE.l4,TREE.l5,TREE.l6].map((n,i)=>(
          <DimDot key={`dl${i}`} cx={n.x} cy={n.y} r={10}/>
        ))}
        {[TREE.i1,TREE.i2,TREE.i3].map((n,i)=>(
          <DimDot key={`di${i}`} cx={n.x} cy={n.y} r={8}/>
        ))}
        <DimDot cx={TREE.m1.x} cy={TREE.m1.y} r={11}/>

        {/* ── PROOF PATH (lit) ── */}
        {/* l0 node */}
        <GlowDot cx={TREE.l0.x} cy={TREE.l0.y} r={12} sf={P0} frame={frame} fps={fps}/>
        {/* l0 → i0 */}
        <GlowLine x1={TREE.l0.x} y1={TREE.l0.y} x2={TREE.i0.x} y2={TREE.i0.y} sf={P1} dur={22} frame={frame}/>
        {/* i0 node */}
        <GlowDot cx={TREE.i0.x} cy={TREE.i0.y} r={10} sf={P2} frame={frame} fps={fps}/>
        {/* i0 → m0 */}
        <GlowLine x1={TREE.i0.x} y1={TREE.i0.y} x2={TREE.m0.x} y2={TREE.m0.y} sf={P3} dur={22} frame={frame}/>
        {/* m0 node */}
        <GlowDot cx={TREE.m0.x} cy={TREE.m0.y} r={13} sf={P4} frame={frame} fps={fps}/>
        {/* m0 → root */}
        <GlowLine x1={TREE.m0.x} y1={TREE.m0.y} x2={TREE.root.x} y2={TREE.root.y} sf={P5} dur={24} frame={frame}/>
        {/* root */}
        {frame >= P6 && (
          <>
            {[2.8,1.8].map((k,j)=>(
              <circle key={j} cx={TREE.root.x} cy={TREE.root.y}
                r={28*k*Math.max(0,spring({frame:frame-P6,fps,config:{damping:9,stiffness:100,mass:0.8},from:0,to:1,durationInFrames:40}))}
                fill="none" stroke={C.citron} strokeWidth={1}
                opacity={0.10*(j===0?1:1.8)}
              />
            ))}
            <GlowDot cx={TREE.root.x} cy={TREE.root.y} r={22} sf={P6} frame={frame} fps={fps}/>
          </>
        )}
      </svg>

      {/* <1ms badge — centered below tree */}
      {frame >= BADGE && (
        <div style={{
          position:'absolute',
          left: 0, right: 0,
          bottom: 90,
          display:'flex', flexDirection:'column', alignItems:'center',
          opacity: badgeOp,
          transform:`scale(${Math.max(0,badgeSc)})`,
        }}>
          <div style={{
            fontFamily: F.mono, fontSize: 200, fontWeight: 700, lineHeight: 1,
            letterSpacing: '-0.04em', color: C.citron,
            filter: 'drop-shadow(0 0 60px rgba(202,209,131,0.30))',
          }}>
            &lt;1ms
          </div>
          <div style={{
            fontFamily: F.mono, fontSize: 20, fontWeight: 700,
            letterSpacing: '0.18em', color: C.textMuted, marginTop: 6,
          }}>
            SIBLING PATH RETURNED
          </div>
        </div>
      )}

      {/* FINALE — MNEMOX REMEMBERS. */}
      {frame >= FIN && (
        <AbsoluteFill style={{
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          opacity: finOp,
          transform:`scale(${Math.max(0,finSc)})`,
          pointerEvents:'none',
        }}>
          {/* Tyrian surge */}
          <div style={{
            position:'absolute', inset:0,
            background:`radial-gradient(ellipse 90% 70% at 50% 50%, rgba(102,2,60,${0.38*finOp}) 0%, transparent 65%)`,
          }}/>

          <div style={{
            position:'relative',
            display:'flex', alignItems:'center', gap:32,
          }}>
            <MnemoxLogo size={80} color={C.citron}/>
            <div style={{
              fontFamily: F.ui, fontSize: 100, fontWeight: 700,
              letterSpacing: '0.055em', color: C.textPrimary, lineHeight: 1,
              filter:'drop-shadow(0 0 40px rgba(202,209,131,0.14))',
            }}>
              MNEMOX REMEMBERS.
            </div>
          </div>

          <div style={{
            position:'relative', marginTop:24,
            fontFamily: F.mono, fontSize: 15, fontWeight: 700,
            letterSpacing: '0.18em', color: C.citron,
            padding: '6px 20px', borderRadius: 4,
            background: 'rgba(102,2,60,0.22)',
            border: `1px solid rgba(202,209,131,0.22)`,
          }}>
            DEPTH-20 · POSEIDON BN254 · STELLAR TESTNET
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
