// Walkable-surface description shared by the scene builders and locomotion.

export const PLATFORM = { r: 3.3, y: 0.3 };
export const ISLAND = { x: 9, z: -13, r: 5.6, h: 1.0 };
export const WORLD_RADIUS = 140; // how far the visitor may wander across the lake

/** Height of the island mound, or a negative number outside it. */
export function islandHeight(x, z) {
  const d = Math.hypot(x - ISLAND.x, z - ISLAND.z) / ISLAND.r;
  if (d >= 1) return -1;
  return ISLAND.h * Math.pow(1 - d * d, 1.3) - 0.1;
}

/** Height the visitor stands at: platform, island, or the water surface. */
export function groundHeight(x, z) {
  if (Math.hypot(x, z) < PLATFORM.r) return PLATFORM.y;
  return Math.max(0, islandHeight(x, z));
}
