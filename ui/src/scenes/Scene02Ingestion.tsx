// SCENE 02 · MERKLE TREE BUILDING
// Visual only: events slide in → leaf nodes pop → tree assembles → root pulses

import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, F} from '../tokens';
import {TREE, leafY, LEAF_COUNT} from '../treeLayout';

const HASHES = [
  '2d27b5', '7f3a9e', 'a4b5c6', 'c3d4e5', 'd1e2f3', 'e9f0a1', 'f7a8b9',
];

function dist(a: {x:number;y:number}, b: {x:number;y:number}) {
  return Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2);
}

// Animated line drawn from start frame over `dur` frames
const Line: React.FC<{x1:number;y1:number;x2:number;y2:number;sf:number;dur:number;frame:number;w?:number;opacity?:number}> =
  ({x1,y1,x2,y2,sf,dur,frame,w=1.6,opacity=0.55}) => {
    const len = dist({x:x1,y:y1},{x:x2,y:y2});
    const p = interpolate(frame,[sf,sf+dur],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
    if (p<=0) return null;
    return <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={C.citron} strokeWidth={w}
      strokeDasharray={len} strokeDashoffset={len*(1-p)}
      strokeLinecap="round" opacity={opacity}/>;
  };

// Spring-in circle
const Dot: React.FC<{cx:number;cy:number;r:number;sf:number;frame:number;fps:number;alpha?:number}> =
  ({cx,cy,r,sf,frame,fps,alpha=1}) => {
    const sc = spring({frame:frame-sf,fps,config:{damping:14,stiffness:220,mass:0.4},from:0,to:1,durationInFrames:20});
    if (frame<sf) return null;
    return (
      <circle cx={cx} cy={cy} r={r*Math.max(0,sc)}
        fill={`rgba(3,3,5,0.92)`}
        stroke={`rgba(202,209,131,${alpha})`}
        strokeWidth={1.8}
      />
    );
  };

export const Scene02Ingestion: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const sceneOp = interpolate(frame,[0,18],[0,1],{extrapolateRight:'clamp'});
  const exitOp  = interpolate(frame,[260,280],[1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});

  // Events slide in from far left, staggered
  const STAGGER = 20;
  const EVENT_DUR = 18;

  // Tree builds after all events arrive
  const TREE_START = LEAF_COUNT * STAGGER + EVENT_DUR + 6;

  // Leaf counter
  const leafCount = Math.floor(
    interpolate(frame,[TREE_START, TREE_START+60],[0,117],
      {extrapolateLeft:'clamp',extrapolateRight:'clamp'})
  );

  // Root pulse
  const ROOT_FRAME = TREE_START + 100;
  const rootPulse = spring({frame:frame-ROOT_FRAME,fps,config:{damping:9,stiffness:100,mass:0.8},from:0,to:1,durationInFrames:45});
  const rootOp = interpolate(frame,[ROOT_FRAME,ROOT_FRAME+16],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor:C.bgBase, opacity:sceneOp*exitOp, overflow:'hidden'}}>

      {/* Tyrian atmosphere */}
      <AbsoluteFill style={{
        background:'radial-gradient(ellipse 80% 70% at 65% 50%, rgba(102,2,60,0.28) 0%, transparent 65%)',
        pointerEvents:'none',
      }}/>

      {/* Leaf counter — top-right corner, large */}
      <div style={{
        position:'absolute', top:48, right:88,
        opacity:interpolate(frame,[TREE_START+8,TREE_START+24],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),
        textAlign:'right',
      }}>
        <div style={{
          fontFamily:F.mono, fontSize:130, fontWeight:700, lineHeight:1,
          color:C.citron, letterSpacing:'-0.03em',
          filter:'drop-shadow(0 0 36px rgba(202,209,131,0.22))',
        }}>
          {leafCount.toString().padStart(3,'0')}
        </div>
        <div style={{fontFamily:F.mono, fontSize:18, fontWeight:700, letterSpacing:'0.16em', color:C.textMuted}}>
          LEAVES
        </div>
      </div>

      {/* Incoming event pills (left edge → leaf x) */}
      {Array.from({length:LEAF_COUNT}).map((_,i)=>{
        const sf = i*STAGGER;
        const tx = interpolate(frame,[sf, sf+EVENT_DUR],[80, TREE.l0.x-20],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
        const op = interpolate(frame,[sf, sf+8],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}) *
                   interpolate(frame,[sf+EVENT_DUR-4, sf+EVENT_DUR+4],[1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
        if (frame<sf) return null;
        return (
          <div key={i} style={{
            position:'absolute',
            left: tx - 52,
            top: leafY(i) - 16,
            width: 104, height: 32,
            opacity: op,
            background: 'rgba(102,2,60,0.28)',
            border: `1px solid rgba(202,209,131,0.32)`,
            borderRadius: 5,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <span style={{fontFamily:F.mono, fontSize:12, fontWeight:600, color:C.citron, letterSpacing:'0.04em'}}>
              0x{HASHES[i]}…
            </span>
          </div>
        );
      })}

      {/* SVG tree */}
      <svg style={{position:'absolute',inset:0,overflow:'visible'}} width={1920} height={1080}>

        {/* Leaf nodes */}
        {[TREE.l0,TREE.l1,TREE.l2,TREE.l3,TREE.l4,TREE.l5,TREE.l6].map((n,i)=>(
          <Dot key={`l${i}`} cx={n.x} cy={n.y} r={11}
            sf={i*STAGGER+EVENT_DUR-2} frame={frame} fps={fps}/>
        ))}

        {/* Leaf → Intermediate */}
        <Line x1={TREE.l0.x} y1={TREE.l0.y} x2={TREE.i0.x} y2={TREE.i0.y} sf={TREE_START}    dur={20} frame={frame}/>
        <Line x1={TREE.l1.x} y1={TREE.l1.y} x2={TREE.i0.x} y2={TREE.i0.y} sf={TREE_START+4}  dur={20} frame={frame}/>
        <Line x1={TREE.l2.x} y1={TREE.l2.y} x2={TREE.i1.x} y2={TREE.i1.y} sf={TREE_START+8}  dur={20} frame={frame}/>
        <Line x1={TREE.l3.x} y1={TREE.l3.y} x2={TREE.i1.x} y2={TREE.i1.y} sf={TREE_START+12} dur={20} frame={frame}/>
        <Line x1={TREE.l4.x} y1={TREE.l4.y} x2={TREE.i2.x} y2={TREE.i2.y} sf={TREE_START+16} dur={20} frame={frame}/>
        <Line x1={TREE.l5.x} y1={TREE.l5.y} x2={TREE.i2.x} y2={TREE.i2.y} sf={TREE_START+20} dur={20} frame={frame}/>
        <Line x1={TREE.l6.x} y1={TREE.l6.y} x2={TREE.i3.x} y2={TREE.i3.y} sf={TREE_START+24} dur={20} frame={frame}/>

        {/* Intermediate nodes */}
        {[TREE.i0,TREE.i1,TREE.i2,TREE.i3].map((n,i)=>(
          <Dot key={`i${i}`} cx={n.x} cy={n.y} r={9}
            sf={TREE_START+i*8+28} frame={frame} fps={fps} alpha={0.60}/>
        ))}

        {/* Intermediate → Mid */}
        <Line x1={TREE.i0.x} y1={TREE.i0.y} x2={TREE.m0.x} y2={TREE.m0.y} sf={TREE_START+42} dur={20} frame={frame}/>
        <Line x1={TREE.i1.x} y1={TREE.i1.y} x2={TREE.m0.x} y2={TREE.m0.y} sf={TREE_START+46} dur={20} frame={frame}/>
        <Line x1={TREE.i2.x} y1={TREE.i2.y} x2={TREE.m1.x} y2={TREE.m1.y} sf={TREE_START+50} dur={20} frame={frame}/>
        <Line x1={TREE.i3.x} y1={TREE.i3.y} x2={TREE.m1.x} y2={TREE.m1.y} sf={TREE_START+54} dur={20} frame={frame}/>

        {/* Mid nodes */}
        {[TREE.m0,TREE.m1].map((n,i)=>(
          <Dot key={`m${i}`} cx={n.x} cy={n.y} r={12}
            sf={TREE_START+62+i*6} frame={frame} fps={fps} alpha={0.75}/>
        ))}

        {/* Mid → Root */}
        <Line x1={TREE.m0.x} y1={TREE.m0.y} x2={TREE.root.x} y2={TREE.root.y} sf={TREE_START+72} dur={24} frame={frame} w={2.2}/>
        <Line x1={TREE.m1.x} y1={TREE.m1.y} x2={TREE.root.x} y2={TREE.root.y} sf={TREE_START+76} dur={24} frame={frame} w={2.2}/>

        {/* Root glow rings */}
        {frame >= ROOT_FRAME && [2.4, 1.6, 1.0].map((k,i)=>(
          <circle key={i} cx={TREE.root.x} cy={TREE.root.y}
            r={28*k*Math.max(0,rootPulse)}
            fill="none" stroke={C.citron} strokeWidth={1}
            opacity={0.08*(3-i)}
          />
        ))}

        {/* Root node */}
        {frame >= ROOT_FRAME && (
          <>
            <circle cx={TREE.root.x} cy={TREE.root.y}
              r={24*Math.max(0,rootPulse)}
              fill="rgba(102,2,60,0.35)" stroke={C.citron} strokeWidth={2.2}
              opacity={rootOp}
            />
            <circle cx={TREE.root.x} cy={TREE.root.y}
              r={9*Math.max(0,rootPulse)} fill={C.citron}
              opacity={rootOp}
              style={{filter:'drop-shadow(0 0 14px rgba(202,209,131,0.55))'}}
            />
          </>
        )}
      </svg>

      {/* Root label — appears with root */}
      {frame >= ROOT_FRAME+12 && (
        <div style={{
          position:'absolute',
          left: TREE.root.x + 44,
          top: TREE.root.y - 28,
          opacity: rootOp,
          transform:`translateX(${interpolate(frame,[ROOT_FRAME+12,ROOT_FRAME+28],[-10,0],{extrapolateRight:'clamp'})}px)`,
        }}>
          <div style={{fontFamily:F.mono, fontSize:13, fontWeight:700, letterSpacing:'0.16em', color:C.textMuted, marginBottom:6}}>
            STATE ROOT
          </div>
          <div style={{fontFamily:F.mono, fontSize:18, fontWeight:600, color:'rgba(202,209,131,0.65)', letterSpacing:'0.025em'}}>
            0xd1cba3c2…4a77d
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
