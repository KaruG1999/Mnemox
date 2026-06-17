export const C = {
  bgBase:      '#030305',
  tyrian:      '#66023C',
  tyrianMid:   'rgba(102,2,60,0.35)',
  tyrianDim:   'rgba(102,2,60,0.18)',
  citron:      '#CAD183',
  citronDim:   'rgba(202,209,131,0.18)',
  citronFaint: 'rgba(202,209,131,0.06)',
  glass:       'rgba(18,2,12,0.75)',
  glassEl:     'rgba(32,4,20,0.88)',
  borderSpec:  'rgba(255,255,255,0.06)',
  borderTop:   'rgba(255,255,255,0.14)',
  textPrimary: '#ECEEF0',
  textSec:     '#555D6B',
  textMuted:   '#2E3340',
  err:         '#E85D75',
} as const;

export const F = {
  mono: '"JetBrains Mono","SF Mono",monospace',
  ui:   '"Inter",system-ui,sans-serif',
} as const;

export const FPS   = 30;
export const TOTAL = 600;   // 20 s
export const W     = 600;
export const H     = 500;

// Scene frame boundaries (adjusted for new flow)
export const S1_START = 0;
export const S1_END   = 120;   // 0–4 s  — brand reveal
export const S2_START = 110;
export const S2_END   = 390;   // 4–13 s — merkle building
export const S3_START = 380;
export const S3_END   = 600;   // 13–20 s— proof + finale
