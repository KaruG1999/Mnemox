// Shared Merkle tree node positions — centered in 1920×1080
// Used by both Scene02 and Scene03 so the tree looks identical

export const LX   = 560;   // leaf column x
export const GAP  = 90;    // vertical spacing between leaves
export const LEAF_COUNT = 7;
export const FIRST_Y = 540 - ((LEAF_COUNT - 1) * GAP) / 2; // = 270

export const leafY = (i: number) => FIRST_Y + i * GAP;

export const TREE = {
  // leaves
  l0: {x: LX, y: leafY(0)},
  l1: {x: LX, y: leafY(1)},
  l2: {x: LX, y: leafY(2)},
  l3: {x: LX, y: leafY(3)},
  l4: {x: LX, y: leafY(4)},
  l5: {x: LX, y: leafY(5)},
  l6: {x: LX, y: leafY(6)},
  // intermediates
  i0: {x: 780, y: (leafY(0) + leafY(1)) / 2},
  i1: {x: 780, y: (leafY(2) + leafY(3)) / 2},
  i2: {x: 780, y: (leafY(4) + leafY(5)) / 2},
  i3: {x: 780, y: leafY(6)},
  // mids
  m0: {x: 1000, y: (leafY(0) + leafY(3)) / 2},
  m1: {x: 1000, y: (leafY(4) + leafY(6)) / 2},
  // root
  root: {x: 1200, y: 540},
} as const;

// Proof path: leaf 0 → i0 → m0 → root (highlighted in Scene03)
export const PROOF_PATH = ['l0', 'i0', 'm0', 'root'] as const;
