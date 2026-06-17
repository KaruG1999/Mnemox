// SVG recreation of the Mnemox brand mark (flat-top hexagon + 3-node network graph)
// Colors are citron on transparent — works on any dark background.
import React from 'react';
import {C} from './tokens';

interface Props {
  size?: number;         // height of the icon portion
  showWordmark?: boolean;
  color?: string;
}

export const MnemoxLogo: React.FC<Props> = ({
  size = 100,
  showWordmark = false,
  color = C.citron,
}) => {
  const ICON_W = size;
  const MARK_W = showWordmark ? size * 2.85 : 0;
  const TOTAL_W = ICON_W + MARK_W;

  return (
    <svg
      width={TOTAL_W}
      height={size}
      viewBox={`0 0 ${100 + (showWordmark ? 285 : 0)} 100`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ── Rounded flat-top hexagon ── */}
      <path
        d="M50 9
           L68 9  Q84 9  84 25
           L84 50
           Q84 62 75 73
           L63 87 Q56 95 44 95
           Q32 95 25 87
           L13 73 Q6 62 6 50
           L6 25 Q6 9 22 9
           Z"
        stroke={color}
        strokeWidth="4.8"
        strokeLinejoin="round"
      />

      {/* ── Top diamond node ── */}
      <rect
        x="44" y="21" width="12" height="12" rx="1.4"
        fill={color}
        transform="rotate(45 50 27)"
      />
      {/* ── Bottom-left diamond node ── */}
      <rect
        x="20" y="61" width="11" height="11" rx="1.2"
        fill={color}
        transform="rotate(45 25.5 66.5)"
      />
      {/* ── Bottom-right diamond node ── */}
      <rect
        x="69" y="61" width="11" height="11" rx="1.2"
        fill={color}
        transform="rotate(45 74.5 66.5)"
      />

      {/* ── Connecting lines (top → bottom-left and top → bottom-right) ── */}
      <line
        x1="50" y1="35" x2="25.5" y2="61"
        stroke={color} strokeWidth="2.6" strokeLinecap="round"
      />
      <line
        x1="50" y1="35" x2="74.5" y2="61"
        stroke={color} strokeWidth="2.6" strokeLinecap="round"
      />

      {/* ── MNEMOX wordmark ── */}
      {showWordmark && (
        <text
          x="112"
          y="70"
          fontFamily='"Inter","Helvetica Neue",Arial,sans-serif'
          fontSize="58"
          fontWeight="700"
          letterSpacing="3"
          fill={C.textPrimary}
        >
          MNEMOX
        </text>
      )}
    </svg>
  );
};
