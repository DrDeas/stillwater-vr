import * as THREE from 'three';

// Small deterministic noise toolkit used for terrain, textures and scattering.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const wrap = (i, period) => (period ? ((i % period) + period) % period : i);

/** Smooth value noise in [0,1]. `period` (in lattice cells) makes it tileable. */
export function valueNoise(x, y, seed = 0, period = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = wrap(ix, period);
  const x1 = wrap(ix + 1, period);
  const y0 = wrap(iy, period);
  const y1 = wrap(iy + 1, period);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x, y, seed = 0, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x, y, seed + o * 17);
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Ridged multifractal in [0,1] — sharp crests, good for mountains. */
export function ridged(x, y, seed = 0, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let prev = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(valueNoise(x, y, seed + o * 31) * 2 - 1);
    n *= n;
    sum += n * amp * prev;
    norm += amp;
    prev = 0.4 + n * 0.6;
    x *= 2.07;
    y *= 2.07;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Tileable RGBA noise texture; every channel is an independent fbm. */
export function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let c = 0; c < 4; c++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        let amp = 0.5;
        let norm = 0;
        let freq = 4;
        for (let o = 0; o < 5; o++) {
          sum += amp * valueNoise((x / size) * freq, (y / size) * freq, c * 101 + o * 7, freq);
          norm += amp;
          amp *= 0.5;
          freq *= 2;
        }
        const v = (sum / norm - 0.5) * 1.7 + 0.5; // widen contrast
        data[(y * size + x) * 4 + c] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
