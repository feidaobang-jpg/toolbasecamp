// Tank Battle 3D · shared field constants (pure data, safe for Node + browser).
// Field: 26×26 cells (one cell = one 8px NES block). Positions are tank centres in cell units;
// x grows to the right, z grows toward the player's base (row 25). Directions: 0 up, 1 right, 2 down, 3 left.
export const N = 26;
export const EMPTY = 0, BRICK = 1, STEEL = 2, BASE = 3;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const HALF = 0.98;                      // tank half-size (a hair under one cell so 2-cell lanes fit)
export const BULLET_R = 0.18;
export const PLAYER_SPAWN = { x: 9, z: 25 };
export const ENEMY_SPAWNS = [{ x: 1, z: 1 }, { x: 13, z: 1 }, { x: 25, z: 1 }];
export const BASE_CENTER = { x: 13, z: 25 };
export const BASE_WALL = [[11, 23], [12, 23], [13, 23], [14, 23], [11, 24], [14, 24], [11, 25], [14, 25]];

// A tank sits on two cells per axis, so layouts are planned on a 13×13 "super" grid of 2×2 blocks.
export const S = N / 2;
// Footprint (top-left cell) of every spawn plus the eagle, in super coordinates.
export const SPAWN_SUPERS = [[0, 0], [6, 0], [12, 0]];
export const PLAYER_SUPER = [4, 12];
export const BASE_SUPER = [6, 12];

export function rngFrom(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
