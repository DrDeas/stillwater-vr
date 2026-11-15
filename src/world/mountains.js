import * as THREE from 'three';
import { litMaterial, polarGrid, MOON_DIR } from './common.js';
import { ridged, fbm } from './noise.js';

// Three concentric mountain ranges. Fog in the lit material layers them into
// soft, receding silhouettes; a valley opens toward the moon.

const RINGS = [
  { r0: 250, depth: 150, height: 52, freq: 0.0085, seed: 11, segs: 220, rows: 9 },
  { r0: 430, depth: 220, height: 135, freq: 0.0048, seed: 23, segs: 240, rows: 10 },
  { r0: 720, depth: 330, height: 300, freq: 0.0026, seed: 37, segs: 240, rows: 10 },
];

const FOREST = new THREE.Color(0.045, 0.07, 0.085);
const ROCK = new THREE.Color(0.1, 0.11, 0.17);
const SNOW = new THREE.Color(0.5, 0.55, 0.7);
const { smoothstep } = THREE.MathUtils;

export function createMountains() {
  const group = new THREE.Group();
  group.name = 'mountains';
  const moonAz = Math.atan2(MOON_DIR.x, -MOON_DIR.z);
  const mat = litMaterial({ pattern: 0.0, rim: 0 });

  RINGS.forEach((ring, ri) => {
    const geo = polarGrid(ring.segs, ring.rows, (a, t, out) => {
      // Lower the range toward the moon so it hangs over an open valley.
      const da = Math.abs(((a - moonAz + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const gap = 0.3 + 0.7 * smoothstep(da, 0.1, 0.55 - ri * 0.08);
      const r = ring.r0 + t * ring.depth;
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      const profile = smoothstep(t, 0, 0.62);
      const n = ridged(x * ring.freq + 50, z * ring.freq + 50, ring.seed);
      const broad = fbm(x * ring.freq * 0.35 + 9, z * ring.freq * 0.35 + 9, ring.seed + 5, 3);
      const h = ring.height * profile * (0.25 + 1.25 * n) * (0.55 + 0.9 * broad) * gap;
      out.x = x;
      out.y = h - 3 * (1 - profile); // dip under the water at the shore
      out.z = z;
      const hn = h / ring.height;
      out.color.copy(FOREST).lerp(ROCK, smoothstep(hn, 0.1, 0.5)).lerp(SNOW, smoothstep(hn, 0.62, 0.95));
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  return group;
}
