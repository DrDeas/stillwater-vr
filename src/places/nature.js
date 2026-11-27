import * as THREE from 'three';
import { shared } from '../world/common.js';
import { place, smoothstep, lerp, fbm } from './kit.js';

// Sanctuary places: quiet natural settings to stand in and wander around.

const TAU = Math.PI * 2;

/** Call fn(x, z) for `n` random points in a square of half-width `half`, centred on (cx, cz). */
function scatter(k, n, half, fn, cx = 0, cz = 0) {
  for (let i = 0; i < n; i++) fn(cx + (k.rand() * 2 - 1) * half, cz + (k.rand() * 2 - 1) * half);
}

// ---------------------------------------------------------------------------
// Dock at Dusk: a wooden dock reaching into a still lake under a pink sky.
// ---------------------------------------------------------------------------
export const createDock = place(
  {
    seed: 5,
    sky: { zenith: 0x5b62a6, horizon: 0xffbc98, sun: [-0.2, 0.08, -1], sunCol: 0xffc7a0, cloud: 0.7, cloudCol: 0xf0a2b4 },
    light: { sun: 0xff9a6c, sky: 0x9088bc, ground: 0x3c3654 },
    fog: { col: 0xd8a4aa, sun: 0xffc8a2, density: 0.0021 },
    spawn: [0, 7, 0],
    radius: 75,
  },
  (k) => {
    const land = (x, z) => {
      const back = smoothstep(z, 0, 7) * 2.5 + smoothstep(z, 10, 60) * 9;
      const left = smoothstep(-x - z * 0.3, 24, 75) * 16;
      const right = smoothstep(x - z * 0.25, 30, 85) * 13;
      const rise = back + left + right;
      return -1.7 + rise + (fbm(x * 0.05 + 7, z * 0.05 + 7, 3, 3) - 0.5) * Math.min(rise, 3) * 0.8;
    };
    k.terrain({ size: 340, res: 120, height: land, color: (x, z, y, s) => (y < 0.2 ? 0x6e655a : s > 0.3 ? 0x4c5a44 : 0x3f6b3d) });
    k.water({ deep: 0x0e3e44, calm: 0.2 });
    k.mountains({ r0: 400, height: 180, low: 0x4b4a6c, high: 0x7c7294, seed: 8 });

    // the dock: planks on posts
    const END = -13;
    for (let z = 5; z > END; z -= 1.04) k.box(0, 0.42, z, 3.4, 0.1, 1.0, 0x8c6048, { jitter: 0.12 });
    for (let z = 4; z > END; z -= 4) for (const x of [-1.55, 1.55]) k.cyl(x, -1.6, z, 0.11, 0.11, 2.1, 0x5c4032);

    scatter(k, 420, 150, (x, z) => {
      const y = land(x, z);
      if (y > 0.7 && Math.hypot(x, z - 7) > 6) k.pine(x, y, z, 0.8 + k.rand() * 0.9, k.rand() < 0.5 ? 0x1f4a35 : 0x275a3c);
    });

    // an islet with a little tower
    const [ix, iz] = [58, -125];
    k.ball(ix, -1.5, iz, 20, 0x3f6b3d, { sy: 0.22, detail: 2 });
    for (let i = 0; i < 26; i++) {
      const a = k.rand() * TAU, r = 5 + k.rand() * 12;
      k.tree(ix + Math.cos(a) * r, 1.6, iz + Math.sin(a) * r, 0.9 + k.rand() * 0.6);
    }
    k.box(ix, 2, iz, 3.2, 9, 3.2, 0xefe6d8);
    k.cone(ix, 11, iz, 2.6, 4.2, 0x9a4a3c, { seg: 4, ry: Math.PI / 4 });
    k.house(ix - 4.5, 2, iz + 1, 6, 4, 5, 0xefe6d8, 0x9a4a3c, { ry: 0.3 });

    k.motes({ count: 220, box: [-25, 0.3, -30, 50, 5, 45], color: 0xffe9a8, size: 0.05, drift: [0.05, 0, 0.02], sway: 0.6, twinkle: 1, additive: true });
    const onDock = (x, z) => Math.abs(x) < 1.7 && z < 5.5 && z > END - 0.5;
    return (x, z) => (onDock(x, z) ? 0.52 : Math.max(0, land(x, z)));
  }
);

// ---------------------------------------------------------------------------
// Sunset Beach: warm sand, leaning palms and a low sun over a calm sea.
// ---------------------------------------------------------------------------
export const createBeach = place(
  {
    seed: 12,
    sky: { zenith: 0x2f4f8f, horizon: 0xffa25e, sun: [0.12, 0.07, -1], sunCol: 0xffb060, sunSize: 0.05, cloud: 0.45, cloudCol: 0xe58a6a },
    light: { sun: 0xffa060, sky: 0x8e8cc0, ground: 0x5a4640 },
    fog: { col: 0xe9a57c, sun: 0xffc27e, density: 0.0016 },
    spawn: [0, 22, 0],
    radius: 70,
  },
  (k) => {
    const sand = (x, z) => -1.4 + smoothstep(z, -8, 30) * 3.6 + smoothstep(z, 44, 100) * 7 + (fbm(x * 0.06, z * 0.06, 2, 3) - 0.5) * smoothstep(z, -4, 12) * 1.2;
    k.terrain({ size: 320, res: 110, height: sand, color: (x, z, y) => (y < 0.25 ? 0xb89a78 : y > 4.5 ? 0x5f8a4a : 0xe6c79a) });
    k.water({ deep: 0x0d3c52, calm: 0.42 });

    // the surf: a pale band that slides up and down the sand
    const foam = k.moving(() => k.box(0, 0.03, -6.3, 300, 0.02, 1.6, 0xfff1e2, { jitter: 0 }));
    k.onUpdate((dt, t) => (foam.position.z = Math.sin(t * 0.45) * 1.3));

    scatter(k, 46, 90, (x, z) => {
      if (z > 6 && z < 60 && Math.hypot(x, z - 22) > 4) k.palm(x, sand(x, z), z, 1 + k.rand() * 0.5);
    });
    scatter(k, 26, 70, (x, z) => {
      if (z < 2 && z > -22) k.rock(x, Math.max(sand(x, z), -0.3), z, 0.5 + k.rand() * 1.6, 0x6a5a55);
    });
    // a place to sit: two loungers under a thatched shade
    const sy = sand(5, 15);
    for (const sx of [-1.3, 1.3]) {
      k.box(5 + sx, sy + 0.3, 15, 0.75, 0.12, 2.0, 0xf0e2c8);
      k.box(5 + sx, sy + 0.3, 15.85, 0.75, 0.12, 0.9, 0xf0e2c8, { rx: -0.7 });
    }
    k.cyl(5, sy, 15.2, 0.07, 0.07, 2.6, 0x7a5a3c);
    k.cone(5, sy + 2.4, 15.2, 2.4, 0.9, 0xc9a25e, { seg: 10 });
    // far headlands
    k.mountains({ r0: 500, depth: 200, height: 70, low: 0x6a5470, high: 0x8a6a80, seed: 5, gap: [Math.PI * 2 - 0.0, 1.3] });
    return (x, z) => Math.max(0, sand(x, z));
  }
);

// ---------------------------------------------------------------------------
// Mountain Chalet: a snowbound chalet with lit windows, high above a valley.
// ---------------------------------------------------------------------------
export const createChalet = place(
  {
    seed: 21,
    sky: { zenith: 0x0c1438, horizon: 0x5a6aa8, sun: [-0.45, 0.32, -0.8], sunCol: 0xdfe8ff, sunSize: 0.03, stars: 0.9, cloud: 0.3, cloudCol: 0x4a5a8a },
    light: { sun: 0x8fa6e0, sky: 0x5a6aa0, ground: 0x2a3050 },
    fog: { col: 0x5c6ca6, sun: 0x8a9ad0, density: 0.0019 },
    spawn: [2, -3, Math.PI],
    radius: 45,
  },
  (k) => {
    const snow = (x, z) => {
      const terrace = smoothstep(Math.hypot(x - 3, z - 8), 22, 9); // a level shelf for the chalet
      const slope = z * 0.16 + (fbm(x * 0.03, z * 0.03, 4, 4) - 0.5) * 9;
      return slope * (1 - terrace) + 1.3 * terrace;
    };
    k.terrain({ size: 360, res: 120, height: snow, color: (x, z, y, s) => (s > 0.42 ? 0x6f7890 : 0xe9eefb) });
    k.mountains({ r0: 330, depth: 320, height: 300, low: 0x4a5578, high: 0x8793b8, snow: 0xf4f7ff, seed: 14, freq: 0.004, y: -60 });

    // the chalet: stone base, timber upper floor, deep snow-laden roof
    const [cx, cz] = [9, 11];
    const y = 1.3;
    k.box(cx, y, cz, 11, 2.6, 8, 0x8a8480);
    k.box(cx, y + 2.6, cz, 11.6, 2.8, 8.6, 0x6b4630);
    k.gable(cx, y + 5.4, cz, 14, 4.2, 10.5, 0x4a3024);
    k.gable(cx, y + 5.75, cz, 13.6, 4.2, 10.7, 0xf2f6ff, { jitter: 0.02 });
    k.box(cx, y + 2.5, cz - 4.9, 12, 0.14, 1.6, 0x5a3a28); // balcony
    for (let i = -5; i <= 5; i += 1.25) k.box(cx + i, y + 2.6, cz - 5.6, 0.1, 0.9, 0.1, 0x5a3a28);
    k.box(cx, y + 3.45, cz - 5.6, 12, 0.1, 0.12, 0x5a3a28);
    for (const [wx, wy] of [[-3.6, 0.9], [0, 0.9], [3.6, 0.9], [-3.6, 3.5], [0, 3.5], [3.6, 3.5]])
      k.box(cx + wx, y + wy, cz - 4.36, 1.6, 1.3, 0.1, 0xffc070, { glow: true, jitter: 0 });
    k.box(cx + 3.4, y + 7.2, cz + 1.5, 1.1, 3.2, 1.1, 0x7c7672); // chimney
    k.lamp(cx, y + 2, cz - 6.5, 0xffa040, 2.2);
    k.lamp(cx - 6, y + 1.5, cz - 5, 0xffa040, 1.2);
    k.motes({ count: 60, box: [cx + 2.9, y + 10.4, cz + 1, 1, 9, 1], color: 0xb8c0d8, size: 0.5, drift: [0.15, 0.9, 0], sway: 0.4 });

    scatter(k, 300, 150, (x, z) => {
      if (Math.hypot(x - 5, z - 7) > 15 && Math.abs(x) + Math.abs(z) > 14) k.pine(x, snow(x, z) - 0.2, z, 0.9 + k.rand() * 1.1, 0x1c4034, { snow: true });
    });
    scatter(k, 14, 30, (x, z) => k.rock(x, snow(x, z), z, 0.5 + k.rand(), 0x6a7088));
    k.motes({ count: 1500, box: [-30, 0, -30, 60, 22, 60], color: 0xf4f8ff, size: 0.07, drift: [0.25, -1.1, 0.1], sway: 0.5 });
    return snow;
  }
);

// ---------------------------------------------------------------------------
// Quiet Cabin: a log cabin in a pine clearing at blue hour, a fire going.
// ---------------------------------------------------------------------------
export const createCabin = place(
  {
    seed: 33,
    sky: { zenith: 0x16234e, horizon: 0xe08a5a, sun: [0.6, 0.05, -0.8], sunCol: 0xffa060, stars: 0.5, cloud: 0.35, cloudCol: 0x8a5a70 },
    light: { sun: 0xd0784a, sky: 0x4a5a90, ground: 0x242a3c },
    fog: { col: 0x4a5680, sun: 0xd88a60, density: 0.006 },
    spawn: [0, 9, 0],
    radius: 40,
  },
  (k) => {
    const stream = (x, z) => smoothstep(Math.abs(x + 13 + Math.sin(z * 0.09) * 4), 3.5, 0.6);
    const ground = (x, z) => (fbm(x * 0.04, z * 0.04, 6, 3) - 0.5) * 2.4 + smoothstep(Math.hypot(x, z), 30, 90) * 6 - stream(x, z) * 1.5 + 0.6;
    k.terrain({ size: 260, res: 110, height: ground, color: (x, z, y, s) => (y < 0.05 ? 0x5a5448 : s > 0.3 ? 0x3a3f30 : k.rand() < 0.5 ? 0x33502e : 0x2c4729) });
    k.water({ level: -0.25, size: 400, deep: 0x10283a, calm: 0.5 });
    k.mountains({ r0: 300, height: 120, low: 0x2a3454, high: 0x4a547a, seed: 4 });

    // cabin with a porch
    const [cx, cz] = [3, -9];
    const y = ground(cx, cz) + 0.2;
    for (let i = 0; i < 9; i++) k.box(cx, y + i * 0.34, cz, 8.4 + (i % 2) * 0.3, 0.34, 6.2 + ((i + 1) % 2) * 0.3, i % 2 ? 0x6b4a32 : 0x5c3f2a);
    k.gable(cx, y + 3.06, cz, 9.6, 2.8, 8.4, 0x3a2a24);
    k.box(cx, y, cz + 4.1, 8.4, 0.25, 2.2, 0x5a4030);
    k.box(cx, y + 2.6, cz + 4.2, 9, 0.14, 2.6, 0x3a2a24, { rx: 0.14 });
    for (const px of [-3.9, 3.9]) k.cyl(cx + px, y, cz + 5.0, 0.1, 0.1, 2.5, 0x4a3426);
    k.box(cx - 2.4, y + 1.0, cz + 3.13, 1.4, 1.2, 0.08, 0xffb860, { glow: true, jitter: 0 });
    k.box(cx + 2.4, y + 1.0, cz + 3.13, 1.4, 1.2, 0.08, 0xffb860, { glow: true, jitter: 0 });
    k.box(cx, y + 0.25, cz + 3.13, 1.0, 2.0, 0.08, 0x2c1e18);
    k.box(cx + 2.6, y + 3.6, cz - 1, 0.9, 2.6, 0.9, 0x6a6460);
    k.lamp(cx, y + 1.6, cz + 4.6, 0xffa040, 1.6);
    k.motes({ count: 50, box: [cx + 2.2, y + 6.1, cz - 1.4, 0.8, 8, 0.8], color: 0x9aa0b4, size: 0.45, drift: [0.12, 0.8, 0], sway: 0.4 });

    // fire ring with logs to sit on
    const [fx, fz] = [-2.5, 2.5];
    const fy = ground(fx, fz);
    for (let i = 0; i < 9; i++) k.rock(fx + Math.cos((i / 9) * TAU) * 0.8, fy + 0.1, fz + Math.sin((i / 9) * TAU) * 0.8, 0.22, 0x6a6660);
    k.cone(fx, fy, fz, 0.42, 1.0, 0xff8a2a, { glow: true, jitter: 0.2 });
    k.cone(fx + 0.1, fy, fz - 0.1, 0.24, 0.65, 0xffd060, { glow: true, jitter: 0.1 });
    k.lamp(fx, fy + 0.7, fz, 0xff7a2a, 2.4);
    k.motes({ count: 40, box: [fx - 0.4, fy + 0.6, fz - 0.4, 0.8, 3.2, 0.8], color: 0xffa040, size: 0.05, drift: [0.05, 0.9, 0], sway: 0.25, twinkle: 1, additive: true });
    k.cyl(fx - 2, fy + 0.25, fz + 0.4, 0.28, 0.28, 2.2, 0x5a4030, { rz: Math.PI / 2, ry: 0.5 });
    k.cyl(fx + 0.6, fy + 0.25, fz + 2.1, 0.28, 0.28, 2.2, 0x5a4030, { rz: Math.PI / 2, ry: 1.9 });

    scatter(k, 520, 115, (x, z) => {
      if (Math.hypot(x - 1, z + 2) > 13 && stream(x, z) < 0.2) k.pine(x, ground(x, z) - 0.2, z, 1.1 + k.rand() * 1.3, k.rand() < 0.5 ? 0x1c3f30 : 0x234a36);
    });
    scatter(k, 30, 35, (x, z) => stream(x, z) > 0.3 && k.rock(x, ground(x, z) + 0.2, z, 0.3 + k.rand() * 0.6, 0x60646a));
    k.motes({ count: 260, box: [-22, 0.4, -22, 44, 4, 44], color: 0xd8ff7a, size: 0.05, drift: [0.04, 0, 0.03], sway: 0.8, twinkle: 1, additive: true });
    return (x, z) => Math.max(ground(x, z), -0.25);
  }
);

// ---------------------------------------------------------------------------
// Japanese Garden: a pond with an arched bridge, lanterns, maples and a pavilion.
// ---------------------------------------------------------------------------
export const createGarden = place(
  {
    seed: 44,
    sky: { zenith: 0x7aa6d8, horizon: 0xf2e2d0, sun: [0.5, 0.42, 0.6], sunCol: 0xfff0d8, cloud: 0.4, cloudCol: 0xffffff },
    light: { sun: 0xfff0d8, sky: 0xa8bcd8, ground: 0x5a6050 },
    fog: { col: 0xe4e2dc, sun: 0xfff4e2, density: 0.0045 },
    spawn: [0, 13, 0],
    radius: 38,
  },
  (k) => {
    const pond = (x, z) => smoothstep(Math.hypot((x + 2) / 13, (z + 6) / 8), 1.05, 0.7);
    const ground = (x, z) => 0.5 + (fbm(x * 0.05, z * 0.05, 9, 3) - 0.5) * 1.0 + smoothstep(Math.hypot(x, z), 30, 70) * 5 - pond(x, z) * 1.6;
    const gravel = (x, z) => Math.hypot(x - 12, z - 9) < 6.5;
    k.terrain({
      size: 200, res: 120, height: ground,
      color: (x, z, y) => (y < 0.12 ? 0x6a6458 : gravel(x, z) ? (Math.sin(Math.hypot(x - 12, z - 9) * 6) > 0 ? 0xdcd8cc : 0xcfcabc) : k.rand() < 0.5 ? 0x5c8a48 : 0x52803f),
    });
    k.water({ level: 0, size: 300, deep: 0x1c4038, calm: 0.12 });
    k.mountains({ r0: 260, height: 90, low: 0x7a90a0, high: 0xa8b8c4, seed: 12 });

    // arched vermilion bridge over the narrow end of the pond
    const RED = 0xc23a2a;
    for (let i = -6; i <= 6; i++) {
      const t = i / 6;
      const y = 0.55 + (1 - t * t) * 1.3;
      k.box(-2 + t * 5.4, y, -6, 0.95, 0.14, 2.6, 0x8a4a34, { rz: -t * 0.42 });
      for (const side of [-1.25, 1.25]) k.box(-2 + t * 5.4, y + 0.1, -6 + side, 0.12, 0.85, 0.12, RED, { jitter: 0.02 });
    }
    for (const side of [-1.25, 1.25]) for (let i = -6; i < 6; i++) {
      const t = (i + 0.5) / 6;
      k.box(-2 + t * 5.4, 0.55 + (1 - t * t) * 1.3 + 0.9, -6 + side, 1.0, 0.1, 0.12, RED, { rz: -t * 0.42, jitter: 0.02 });
    }

    // stone lanterns
    const lantern = (x, z) => {
      const y = ground(x, z);
      k.cyl(x, y, z, 0.22, 0.3, 0.2, 0x8c8a84);
      k.cyl(x, y + 0.2, z, 0.1, 0.12, 0.8, 0x8c8a84);
      k.box(x, y + 1.0, z, 0.44, 0.08, 0.44, 0x8c8a84);
      k.box(x, y + 1.08, z, 0.3, 0.3, 0.3, 0xffd890, { glow: true, jitter: 0 });
      k.cone(x, y + 1.38, z, 0.44, 0.3, 0x74726c, { seg: 4, ry: Math.PI / 4 });
    };
    [[4, 8], [-9, 5], [7, -3], [-12, -10], [14, -1]].forEach(([x, z]) => lantern(x, z));

    // tea pavilion with a sweeping roof
    const [px, pz] = [-13, 9];
    const py = ground(px, pz);
    k.box(px, py, pz, 6.4, 0.4, 5.4, 0x6a5444);
    for (const [sx, sz] of [[-2.8, -2.3], [2.8, -2.3], [-2.8, 2.3], [2.8, 2.3]]) k.cyl(px + sx, py + 0.4, pz + sz, 0.14, 0.14, 2.6, 0x5a3a2a);
    k.box(px, py + 0.4, pz - 2.4, 5.6, 2.4, 0.1, 0xefe6d2);
    k.gable(px, py + 3.0, pz, 8.6, 1.9, 7.4, 0x3d4a48, { ry: Math.PI / 2 });
    k.box(px, py + 2.95, pz, 8.2, 0.14, 8.8, 0x3d4a48);

    // planting: maples in autumn colour, pines, clipped shrubs, stepping stones
    const MAPLE = [0xc8422c, 0xd96a2a, 0xe0903a];
    scatter(k, 70, 60, (x, z) => {
      if (pond(x, z) > 0.05 || gravel(x, z) || Math.hypot(x, z - 13) < 4 || Math.hypot(x - px, z - pz) < 6) return;
      const y = ground(x, z);
      const r = k.rand();
      if (r < 0.4) k.tree(x, y, z, 0.8 + k.rand() * 0.5, MAPLE);
      else if (r < 0.75) k.pine(x, y, z, 0.7 + k.rand() * 0.7, 0x2c5a3c);
      else k.ball(x, y + 0.5, z, 0.7 + k.rand() * 0.5, 0x3f7a3c, { sy: 0.75 });
    });
    for (let i = 0; i < 9; i++) k.disc(0.3 * Math.sin(i * 1.7), ground(0, 12 - i * 1.25) + 0.04, 12 - i * 1.25, 0.42, 0x9a968c, { seg: 9 });
    [[10.5, 8], [13.5, 10.5], [12, 6.5]].forEach(([x, z]) => k.rock(x, ground(x, z) + 0.25, z, 0.7, 0x6c6e70));
    scatter(k, 16, 14, (x, z) => pond(x, z) > 0.6 && k.disc(x, 0.02, z, 0.35 + k.rand() * 0.3, 0x3c7a44, { seg: 9 }), -2, -6);
    k.motes({ count: 220, box: [-25, 0.2, -25, 50, 9, 50], color: 0xd8502c, size: 0.09, drift: [0.25, -0.45, 0.1], sway: 0.7 });
    return (x, z) => Math.max(ground(x, z), 0);
  }
);

// ---------------------------------------------------------------------------
// Autumn Forest: a path through tall trees in full colour, leaves drifting down.
// ---------------------------------------------------------------------------
export const createAutumn = place(
  {
    seed: 55,
    sky: { zenith: 0x6f9ed0, horizon: 0xffe0b0, sun: [-0.5, 0.28, -0.8], sunCol: 0xffd9a0, cloud: 0.3, cloudCol: 0xfff4e4 },
    light: { sun: 0xffc880, sky: 0x9aa8c0, ground: 0x5a4a38 },
    fog: { col: 0xe8c89a, sun: 0xffe4b4, density: 0.011 },
    spawn: [0, 8, 0],
    radius: 60,
  },
  (k) => {
    const path = (x, z) => smoothstep(Math.abs(x - Math.sin(z * 0.06) * 5), 2.6, 1.2);
    const ground = (x, z) => (fbm(x * 0.035, z * 0.035, 13, 3) - 0.5) * 3 + 0.8;
    const LITTER = [0xa8622c, 0xb8742e, 0x8c5228, 0xc48a34];
    k.terrain({ size: 260, res: 110, height: ground, color: (x, z) => (path(x, z) > 0.5 ? 0x8a7458 : LITTER[Math.floor(k.rand() * 4)]) });
    const LEAVES = [[0xd9702a, 0xe8922e, 0xc8502a], [0xe8b030, 0xf0c848, 0xd99a2a], [0xb83a2a, 0xd0522c, 0xa82c2a], [0xd98a2e, 0xc86a2c, 0xe8a83a]];
    scatter(k, 520, 120, (x, z) => {
      if (path(x, z) > 0.05) return;
      const y = ground(x, z);
      const s = 1.5 + k.rand() * 1.4;
      k.cyl(x, y, z, 0.2 * s, 0.3 * s, 2.4 * s, 0x4a382c); // a tall bare trunk under the crown
      k.tree(x, y + 2.0 * s, z, s, LEAVES[Math.floor(k.rand() * LEAVES.length)]);
    });
    scatter(k, 60, 60, (x, z) => path(x, z) < 0.1 && k.rock(x, ground(x, z), z, 0.3 + k.rand() * 0.7, 0x6a6258));
    // a bench beside the path
    const by = ground(3.4, 1);
    k.box(3.4, by + 0.42, 1, 0.5, 0.08, 1.8, 0x6a4a34);
    k.box(3.62, by + 0.5, 1, 0.08, 0.55, 1.8, 0x6a4a34);
    for (const dz of [-0.75, 0.75]) k.box(3.4, by, 1 + dz, 0.45, 0.42, 0.1, 0x3a3230);
    k.motes({ count: 900, box: [-30, 0.2, -30, 60, 16, 60], color: 0xe08a2c, size: 0.11, drift: [0.35, -0.7, 0.15], sway: 0.9 });
    k.motes({ count: 400, box: [-30, 0.2, -30, 60, 16, 60], color: 0xc8402a, size: 0.1, drift: [0.3, -0.6, 0.2], sway: 0.9 });
    return ground;
  }
);

// ---------------------------------------------------------------------------
// Golden Farm: striped fields over rolling hills, a red barn and a turning windmill.
// ---------------------------------------------------------------------------
export const createFarm = place(
  {
    seed: 66,
    sky: { zenith: 0x4a8ad8, horizon: 0xd8ecf8, sun: [0.4, 0.5, -0.6], sunCol: 0xfff6dc, cloud: 0.5, cloudCol: 0xffffff },
    light: { sun: 0xfff2d0, sky: 0xa8c4e4, ground: 0x6a6a48 },
    fog: { col: 0xcfe2f0, sun: 0xfff6e2, density: 0.0022 },
    spawn: [0, 10, 0],
    radius: 60,
  },
  (k) => {
    const hills = (x, z) => (fbm(x * 0.012, z * 0.012, 21, 3) - 0.5) * 22 * smoothstep(Math.hypot(x, z + 10), 14, 80) + 0.4;
    const FIELDS = [0x8fbf4a, 0xe2c04a, 0x6aa63e, 0xb88a4a, 0xd6d05a];
    k.terrain({
      size: 520, res: 130, height: hills,
      color: (x, z) => {
        if (Math.hypot(x, z + 10) < 22) return k.rand() < 0.5 ? 0x7ab04a : 0x86bc52; // the yard
        const band = Math.floor((x * 0.7 + z * 0.35) / 26 + 100) + Math.floor((z - x * 0.4) / 60 + 100) * 3;
        const furrow = Math.sin((x * 0.7 + z * 0.35) * 1.4) > 0.2 ? 1 : 0.86;
        return shade(FIELDS[band % 5], furrow);
      },
    });
    function shade(hex, f) {
      return (Math.round(((hex >> 16) & 255) * f) << 16) | (Math.round(((hex >> 8) & 255) * f) << 8) | Math.round((hex & 255) * f);
    }
    k.mountains({ r0: 420, height: 60, low: 0x7fa07a, high: 0x9ab4a8, seed: 9, freq: 0.004 });

    // barn, silo and farmhouse
    const y = 0.4;
    k.box(-12, y, -18, 12, 5.5, 16, 0xa83228);
    k.gable(-12, y + 5.5, -18, 13, 4.2, 17, 0x5a5a60);
    k.box(-12, y, -9.95, 4, 4.2, 0.1, 0xf2ece0);
    k.box(-12, y + 0.1, -9.9, 3.4, 3.8, 0.1, 0x7a2a22);
    k.cyl(-21.5, y, -15, 2.6, 2.6, 11, 0xd8d8d4, { seg: 14 });
    k.ball(-21.5, y + 11, -15, 2.6, 0xb0b4bc, { sy: 0.6, detail: 2 });
    k.house(13, y, -15, 9, 4.2, 7, 0xf4efe2, 0x8a4a3a, { windows: 3, lit: null });
    k.box(13, y, -11.3, 9.4, 0.3, 1.8, 0xc8c0b0);

    // windmill with turning sails
    const [wx, wz] = [22, -34];
    const wy = hills(wx, wz);
    k.cyl(wx, wy, wz, 1.3, 2.6, 12, 0xefe8da, { seg: 8 });
    k.cone(wx, wy + 12, wz, 1.8, 2.2, 0x6a4a3a, { seg: 8 });
    const sails = k.moving(() => {
      for (let i = 0; i < 4; i++) {
        k.box(0, 0.4, 0, 0.25, 7.2, 0.12, 0x6a4a3a, { rz: (i * Math.PI) / 2 });
        k.box(0, 1.6, 0.08, 1.5, 5.4, 0.06, 0xf4f0e4, { rz: (i * Math.PI) / 2 });
      }
    });
    sails.position.set(wx, wy + 12.4, wz + 2.0);
    k.onUpdate((dt, t) => (sails.rotation.z = t * 0.35));

    // fences, hay bales, trees
    for (let i = -20; i <= 20; i += 2.5) {
      k.box(i, y, 4, 0.14, 1.1, 0.14, 0xe8e2d4);
      if (i < 20) for (const h of [0.45, 0.85]) k.box(i + 1.25, y + h, 4, 2.5, 0.09, 0.07, 0xe8e2d4);
    }
    scatter(k, 26, 70, (x, z) => Math.hypot(x, z + 10) > 24 && k.cyl(x, hills(x, z) + 0.75, z, 0.75, 0.75, 1.5, 0xd8b85a, { rz: Math.PI / 2, ry: k.rand() * 3, seg: 12 }));
    scatter(k, 60, 150, (x, z) => Math.hypot(x, z + 10) > 26 && k.rand() < 0.6 && k.tree(x, hills(x, z), z, 1.2 + k.rand() * 0.9));
    k.tree(5, y, -4, 1.8);
    k.motes({ count: 160, box: [-25, 0.3, -30, 50, 6, 45], color: 0xfff0b0, size: 0.04, drift: [0.2, 0.02, 0.05], sway: 0.6, twinkle: 1, additive: true });
    return hills;
  }
);

// ---------------------------------------------------------------------------
// Amalfi Terrace: a pergola terrace high on a cliff, pastel houses stepping
// down to a blue sea.
// ---------------------------------------------------------------------------
export const createAmalfi = place(
  {
    seed: 77,
    sky: { zenith: 0x2f7ad8, horizon: 0xcfe8fa, sun: [-0.6, 0.55, 0.3], sunCol: 0xfff6e0, cloud: 0.35, cloudCol: 0xffffff },
    light: { sun: 0xfff2d6, sky: 0xa8c8ec, ground: 0x6a6a60 },
    fog: { col: 0xc4def2, sun: 0xfff4e0, density: 0.0019 },
    spawn: [-1, 2, 0.15],
    radius: 6.5,
  },
  (k) => {
    // the shore runs away ahead and swings left, so the far hillside faces you
    const shore = (z) => -22 + Math.min(0, z + 20) * 0.62;
    const T = 16; // height of the terrace you stand on
    const raw = (x, z) => 74 * Math.pow(smoothstep(x - shore(z), 0, 75), 0.8) - 2.5 + (fbm(x * 0.03, z * 0.03, 5, 3) - 0.5) * 6 * smoothstep(x - shore(z), 2, 30);
    // the hillside is cut back around the terrace so it never buries it
    const cliff = (x, z) => lerp(raw(x, z), Math.min(raw(x, z), T - 2), smoothstep(Math.hypot(x, z), 20, 11));
    k.terrain({ size: 560, res: 140, height: cliff, color: (x, z, y, s) => (y < 0.6 ? 0xb8a890 : s > 0.34 ? 0x9a9488 : k.rand() < 0.5 ? 0x5c8a4a : 0x6a9a52) });
    k.water({ deep: 0x0c4a7a, calm: 0.3 });
    k.mountains({ r0: 520, depth: 220, height: 110, low: 0x7a98b0, high: 0xa4bccc, seed: 6, gap: [Math.PI * 1.5, 1.2] });

    // houses stacked on the slope, facing the sea
    const WALLS = [0xf6d8a8, 0xf2b8a0, 0xf8e8c8, 0xe8a888, 0xfff4e0, 0xf0c890, 0xe6d0e0, 0xcfe0e8];
    scatter(k, 900, 200, (x, z) => {
      const y = cliff(x, z);
      if (y < 4 || y > 58 || Math.hypot(x, z) < 16) return;
      const w = 5 + k.rand() * 4, h = 5 + k.rand() * 6, d = 5 + k.rand() * 3;
      const ry = -Math.PI / 2 + Math.atan(0.62) * (z < -20 ? 1 : 0) + (k.rand() - 0.5) * 0.2;
      k.box(x, y - 2, z, w, h + 2, d, WALLS[Math.floor(k.rand() * WALLS.length)], { ry });
      k.box(x, y + h, z, w * 1.04, 0.35, d * 1.04, 0xb8603c, { ry });
      const fx = Math.sin(ry), fz = Math.cos(ry);
      for (let r = 0; r < Math.floor(h / 2.6); r++) for (const off of [-0.25, 0.25])
        k.box(x + fx * (d / 2 + 0.03) + fz * off * w, y + 1 + r * 2.6, z + fz * (d / 2 + 0.03) - fx * off * w, 0.8, 1.3, 0.06, 0x3a5466, { ry, jitter: 0.1 });
    }, -30, -70);
    // a tiled dome among them
    const [dx, dz] = [-48, -92];
    const dy = cliff(dx, dz);
    k.cyl(dx, dy - 2, dz, 5.5, 5.5, 9, 0xf8f0dc, { seg: 12 });
    k.ball(dx, dy + 7, dz, 5.5, 0xe8c040, { detail: 2, sy: 0.9 });
    k.box(dx + 8, dy - 2, dz + 4, 3.4, 20, 3.4, 0xf8f0dc);
    k.cone(dx + 8, dy + 18, dz + 4, 2.8, 3.6, 0x4a9a7a, { seg: 4, ry: Math.PI / 4 });

    // the terrace you stand on: tiled floor, railing, pergola, lemon trees, a table
    k.box(0, T - 14, 0, 14, 14, 14, 0xe8dcc8);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) k.box(i * 2, T - 0.02, j * 2, 1.96, 0.04, 1.96, (i + j) % 2 ? 0xb8704a : 0xdcc8a6, { jitter: 0.03 });
    for (let i = -7; i <= 7; i += 1) {
      k.cyl(i, T, -7, 0.07, 0.09, 1.0, 0xf4f0e6, { seg: 6 });
      k.cyl(-7, T, i, 0.07, 0.09, 1.0, 0xf4f0e6, { seg: 6 });
    }
    k.box(0, T + 1.0, -7, 14.2, 0.12, 0.24, 0xf4f0e6);
    k.box(-7, T + 1.0, 0, 0.24, 0.12, 14.2, 0xf4f0e6);
    for (const [px, pz] of [[2, 2], [6.5, 2], [2, 6.5], [6.5, 6.5]]) k.cyl(px, T, pz, 0.14, 0.16, 2.8, 0xf4f0e6);
    for (let i = 0; i < 7; i++) k.box(1.6 + i * 0.85, T + 2.8, 4.25, 0.12, 0.14, 6, 0x7a5a40);
    for (let i = 0; i < 26; i++) k.ball(1.5 + k.rand() * 5.5, T + 2.9 + k.rand() * 0.3, 1.5 + k.rand() * 5.5, 0.5 + k.rand() * 0.4, k.rand() < 0.3 ? 0xd84a8a : 0x4a8a3c, { sy: 0.5 });
    for (const [lx, lz] of [[-5.5, 4.5], [5.5, -5.5]]) {
      k.cyl(lx, T, lz, 0.5, 0.4, 0.7, 0xb8603c, { seg: 10 });
      k.cyl(lx, T + 0.7, lz, 0.07, 0.09, 1.2, 0x5a4030);
      k.ball(lx, T + 2.3, lz, 1.0, 0x3f7a34);
      for (let i = 0; i < 9; i++) k.ball(lx + (k.rand() - 0.5) * 1.7, T + 1.8 + k.rand() * 1.0, lz + (k.rand() - 0.5) * 1.7, 0.11, 0xffe040, { jitter: 0.03 });
    }
    k.cyl(4.2, T, 4.2, 0.06, 0.3, 0.75, 0x3a3a3a);
    k.cyl(4.2, T + 0.75, 4.2, 0.65, 0.65, 0.05, 0xf4f0e6, { seg: 14 });

    // boats on the bay, gently rocking
    const boats = [[-60, -40], [-95, -10], [-75, 30], [-130, -70], [-45, 12]].map(([bx, bz], i) => {
      const b = k.moving(() => {
        k.ball(0, -0.2, 0, 1, 0xfafafa, { sy: 0.35, sz: 3.2, detail: 1, jitter: 0.02 });
        k.box(0, 0.1, -0.4, 1.0, 0.7, 1.6, 0xfafafa);
      });
      b.position.set(bx, 0.15, bz);
      b.rotation.y = i * 1.3;
      return b;
    });
    k.onUpdate((dt, t) => boats.forEach((b, i) => ((b.rotation.z = Math.sin(t * 0.8 + i) * 0.06), (b.position.y = 0.15 + Math.sin(t * 0.6 + i * 2) * 0.08))));
    return () => T;
  }
);

// ---------------------------------------------------------------------------
// Lavender Hills: purple rows rolling to the horizon at sunrise, balloons adrift.
// ---------------------------------------------------------------------------
export const createLavender = place(
  {
    seed: 88,
    sky: { zenith: 0x5a84c8, horizon: 0xffd0a8, sun: [0.3, 0.14, -1], sunCol: 0xffd9a8, cloud: 0.42, cloudCol: 0xffc8c0 },
    light: { sun: 0xffc890, sky: 0xa0a8d0, ground: 0x5a5070 },
    fog: { col: 0xe8c4c0, sun: 0xffdcb4, density: 0.0028 },
    spawn: [0.9, 6, 0],
    radius: 60,
  },
  (k) => {
    const hills = (x, z) => (fbm(x * 0.011, z * 0.011, 31, 3) - 0.5) * 20 * smoothstep(Math.hypot(x, z), 10, 90) + 0.4;
    const row = (x) => Math.cos(x * 3.49); // a row every 1.8 m
    k.terrain({ size: 520, res: 150, height: hills, color: (x) => (row(x) > 0.1 ? (k.rand() < 0.5 ? 0x8a5ad0 : 0x7a4cc0) : 0x5a7a44) });
    k.mountains({ r0: 430, height: 80, low: 0x7a78a8, high: 0xa49cc0, seed: 17, freq: 0.004 });
    // plump tufts along the nearest rows, so the lavender has body up close
    for (let r = -22; r <= 22; r++) {
      const x = r * 1.8;
      for (let z = -44; z < 44; z += 1.15) {
        if (Math.hypot(x, z) > 44) continue;
        k.ball(x + (k.rand() - 0.5) * 0.2, hills(x, z) + 0.22, z + (k.rand() - 0.5) * 0.4, 0.4, k.rand() < 0.5 ? 0x9a6ae0 : 0x8256cc, { detail: 0, sy: 0.85, jitter: 0.12 });
      }
    }
    // a lone oak and a stone farmhouse
    k.tree(-14, hills(-14, -22), -22, 2.6);
    const [hx, hz] = [34, -60];
    k.house(hx, hills(hx, hz), hz, 11, 5, 8, 0xd8c8a8, 0xb86a48, { windows: 3, lit: null, ry: -0.4 });
    for (let i = 0; i < 6; i++) k.cone(hx - 10 + i * 0.3, hills(hx - 10, hz + i * 3), hz - 6 + i * 3, 1.0, 9, 0x2f5a3a, { seg: 6 }); // cypresses

    // hot-air balloons drifting on the morning air
    const COLORS = [[0xe85a4a, 0xffd04a], [0x4a90e0, 0xffffff], [0xe0a030, 0xb04ad0], [0x40b090, 0xfff0c0]];
    const balloons = COLORS.map(([a, b], i) => {
      const g = k.moving(() => {
        for (let s = 0; s < 8; s++) {
          const geo = new THREE.SphereGeometry(5, 3, 10, (s / 8) * TAU, TAU / 8).scale(1, 1.15, 1);
          k.geo(geo, 0, 0, 0, s % 2 ? a : b, { jitter: 0.03 });
        }
        k.cone(0, -8.6, 0, 2.4, 4, a, { seg: 8, rx: Math.PI });
        k.box(0, -10.6, 0, 1.3, 1.1, 1.3, 0x7a5a3a);
      });
      g.scale.setScalar(1.5);
      g.userData = { x: -80 + i * 55, y: 30 + i * 8, z: -105 - (i % 2) * 55, ph: i * 1.7 };
      return g;
    });
    k.onUpdate((dt, t) => balloons.forEach((b) => b.position.set(b.userData.x + ((t * 1.1 + b.userData.ph * 40) % 260) - 60, b.userData.y + Math.sin(t * 0.25 + b.userData.ph) * 3, b.userData.z)));
    k.motes({ count: 240, box: [-25, 0.3, -30, 50, 5, 45], color: 0xfff0c0, size: 0.04, drift: [0.15, 0.03, 0.05], sway: 0.7, twinkle: 1, additive: true });
    return hills;
  }
);

// ---------------------------------------------------------------------------
// Waterfall Grotto: a jungle pool beneath a tall fall, mist rising from its foot.
// ---------------------------------------------------------------------------
export const createWaterfall = place(
  {
    seed: 99,
    sky: { zenith: 0x4a9ad8, horizon: 0xd8f0e8, sun: [0.3, 0.75, 0.4], sunCol: 0xfffbe6, cloud: 0.3, cloudCol: 0xffffff },
    light: { sun: 0xfff6d8, sky: 0x9ad0c8, ground: 0x3a5a48 },
    fog: { col: 0xbfe2d8, sun: 0xf4fbe8, density: 0.006 },
    spawn: [0, 16, 0],
    radius: 30,
  },
  (k) => {
    const FALL_Z = -22;
    const pool = (x, z) => smoothstep(Math.hypot(x / 13, (z + 8) / 11), 1.05, 0.75);
    // a horseshoe of cliff wrapped round the pool
    const wall = (x, z) => smoothstep(Math.hypot(x, z + 4), 18, 30) * (z < 12 ? 1 : smoothstep(z, 26, 12)) * (30 + (fbm(x * 0.06, z * 0.06, 8, 3) - 0.5) * 16);
    const ground = (x, z) => 0.7 + (fbm(x * 0.05, z * 0.05, 3, 3) - 0.5) * 1.2 - pool(x, z) * 2 + wall(x, z);
    k.terrain({ size: 220, res: 130, height: ground, color: (x, z, y, s) => (s > 0.4 ? (k.rand() < 0.5 ? 0x5a5a52 : 0x4a5a48) : y < 0.2 ? 0x8a8068 : k.rand() < 0.5 ? 0x3f8a44 : 0x34783c) });
    k.water({ level: 0, size: 200, deep: 0x0f5a5c, calm: 0.5 });

    // the fall: a sheet of water whose streaks run downward
    const TOP = ground(0, FALL_Z - 5);
    const fall = new THREE.Mesh(
      new THREE.PlaneGeometry(7, TOP + 2, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uNoise: shared.uNoise },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
uniform float uTime; uniform sampler2D uNoise; varying vec2 vUv;
void main() {
  float a = texture2D(uNoise, vec2(vUv.x * 1.6, vUv.y * 0.35 + uTime * 0.55)).r;
  float b = texture2D(uNoise, vec2(vUv.x * 4.0 + 0.3, vUv.y * 0.9 + uTime * 0.95)).g;
  float streak = smoothstep(0.25, 0.9, a * 0.6 + b * 0.5);
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  vec3 col = mix(vec3(0.55, 0.82, 0.86), vec3(1.0), streak);
  if (edge * (0.55 + 0.45 * streak) < 0.35) discard;
  gl_FragColor = vec4(col, 1.0);
}`,
        side: THREE.DoubleSide,
      })
    );
    fall.position.set(0, (TOP + 2) / 2 - 1, FALL_Z + 2.2);
    k.group.add(fall);
    k.motes({ count: 500, box: [-6, 0, FALL_Z + 0.5, 12, 7, 7], color: 0xffffff, size: 0.5, drift: [0, 0.5, 0.35], sway: 0.6, additive: true });
    k.motes({ count: 0 + 120, box: [-14, 0.3, -18, 28, 6, 30], color: 0xfff6c0, size: 0.05, drift: [0.05, 0.02, 0.04], sway: 0.8, twinkle: 1, additive: true });

    // jungle: palms, broad trees, ferns and boulders
    scatter(k, 190, 60, (x, z) => {
      const y = ground(x, z);
      if (pool(x, z) > 0.02 || Math.hypot(x, z - 16) < 3.5) return;
      if (y > 12) { if (k.rand() < 0.5) k.tree(x, y, z, 1.4 + k.rand(), [0x2f7a3c, 0x3f8f46, 0x25683a]); return; }
      const r = k.rand();
      if (r < 0.35) k.palm(x, y, z, 0.9 + k.rand() * 0.6);
      else if (r < 0.6) k.tree(x, y, z, 1.0 + k.rand() * 0.7, [0x2f7a3c, 0x3f8f46, 0x25683a]);
      else for (let f = 0; f < 6; f++) k.box(x, y, z, 0.3, 0.04, 1.5, 0x3f9a4a, { ry: (f / 6) * TAU, rx: -0.6, jitter: 0.12 }); // a fern
    });
    scatter(k, 26, 16, (x, z) => pool(x, z) > 0.05 && pool(x, z) < 0.8 && k.rock(x, 0.1, z, 0.5 + k.rand() * 1.1, 0x5a5e58), 0, -8);
    for (let i = 0; i < 7; i++) k.rock((k.rand() - 0.5) * 8, 0.2, FALL_Z + 3 + k.rand() * 2, 0.8 + k.rand(), 0x4a5048);
    return (x, z) => Math.max(ground(x, z), 0);
  }
);

// ---------------------------------------------------------------------------
// Orbital Lounge: an observation deck in orbit, a blue world turning below.
// ---------------------------------------------------------------------------
export const createOrbital = place(
  {
    seed: 111,
    sky: { zenith: 0x010208, horizon: 0x02040c, nadir: 0x010208, sun: [0.7, 0.35, -0.6], sunCol: 0xfff4e0, sunSize: 0.02, stars: 1.6 },
    light: { sun: 0xfff0dc, sky: 0x3a4a70, ground: 0x4a5a80 },
    fog: { col: 0x02040c, density: 0.00001 },
    spawn: [0, 7.6, 0],
    radius: 9,
  },
  (k) => {
    const R = 10.5;
    // deck: dark floor with rings of light
    k.cyl(0, -0.5, 0, R, R, 0.5, 0x2a3040, { seg: 40, jitter: 0.02 });
    for (const [r0, r1] of [[9.6, 9.8], [5.9, 6.0], [2.4, 2.5]]) k.geo(new THREE.RingGeometry(r0, r1, 64).rotateX(-Math.PI / 2), 0, 0.01, 0, 0x7ad8ff, { glow: true, jitter: 0 });
    // the window wall: slim mullions and a ceiling ring, open to the view
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      k.box(Math.cos(a) * R, 0, Math.sin(a) * R, 0.22, 5.4, 0.22, 0xc8ccd8, { ry: -a });
    }
    k.geo(new THREE.TorusGeometry(R, 0.22, 6, 48).rotateX(Math.PI / 2), 0, 5.4, 0, 0xc8ccd8);
    k.geo(new THREE.TorusGeometry(R, 0.16, 6, 48).rotateX(Math.PI / 2), 0, 0.9, 0, 0xc8ccd8);
    k.cyl(0, 5.4, 0, R * 1.02, R * 1.02, 0.4, 0x30364a, { seg: 40 });
    k.geo(new THREE.RingGeometry(3.2, 3.5, 48).rotateX(Math.PI / 2), 0, 5.39, 0, 0xfff0d0, { glow: true, jitter: 0 });
    k.lamp(0, 4.6, 0, 0xfff0d0, 2.0);
    // a sunken lounge: curved seats around a small tree
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3;
      if (i % 5 === 4) continue; // gaps to walk through
      k.box(Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2, 2.3, 0.45, 0.9, 0xe8e2d8, { ry: -a + Math.PI / 2 });
      k.box(Math.cos(a) * 4.7, 0.45, Math.sin(a) * 4.7, 2.3, 0.5, 0.2, 0xd8d0c4, { ry: -a + Math.PI / 2 });
    }
    k.cyl(0, 0, 0, 1.1, 0.9, 0.6, 0xd8d0c4, { seg: 16 });
    k.tree(0, 0.5, 0, 0.8, [0x4a9a52, 0x5cb060, 0x3f8a48]);
    // the rest of the station: a great wheel beyond the glass, with running lights
    k.geo(new THREE.TorusGeometry(46, 2.2, 8, 60), 0, -7, 0, 0x9aa2b4, { rx: Math.PI / 2 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.26;
      k.box(Math.cos(a) * 28, -7.6, Math.sin(a) * 28, 34, 1.2, 1.2, 0x8a92a4, { ry: -a });
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      k.box(Math.cos(a) * 46, -4.7, Math.sin(a) * 46, 0.9, 0.3, 0.9, i % 2 ? 0xffd890 : 0x7ad8ff, { glow: true, jitter: 0 });
    }

    // the world below: oceans, land, cloud and a thin shell of air, slowly turning
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(900, 64, 40),
      new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uNoise: shared.uNoise, uSun: { value: k.sun } },
        vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec3 vView; void main() { vN = normalize(mat3(modelMatrix) * normal); vP = normal; vec4 w = modelMatrix * vec4(position, 1.0); vView = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: /* glsl */ `
uniform float uTime; uniform sampler2D uNoise; uniform vec3 uSun; varying vec3 vN; varying vec3 vP; varying vec3 vView;
void main() {
  vec2 uv = vec2(atan(vP.z, vP.x) / 6.28318 + uTime * 0.0012, vP.y * 0.5 + 0.5);
  float land = texture2D(uNoise, uv * vec2(2.0, 1.0)).r * 0.6 + texture2D(uNoise, uv * vec2(6.0, 3.0)).g * 0.4;
  float cloud = smoothstep(0.52, 0.8, texture2D(uNoise, uv * vec2(4.0, 2.0) + uTime * 0.0006).b * 0.6 + texture2D(uNoise, uv * vec2(11.0, 6.0)).r * 0.4);
  vec3 col = mix(vec3(0.03, 0.16, 0.42), mix(vec3(0.16, 0.42, 0.18), vec3(0.55, 0.47, 0.30), smoothstep(0.62, 0.8, land)), smoothstep(0.54, 0.58, land));
  col = mix(col, vec3(0.95), smoothstep(0.86, 1.0, abs(vP.y)));          // polar ice
  col = mix(col, vec3(1.0), cloud * 0.85);
  float day = smoothstep(-0.12, 0.3, dot(vN, uSun));
  col *= 0.03 + 0.97 * day;
  float rim = pow(1.0 - max(dot(vN, vView), 0.0), 3.0);
  col += vec3(0.3, 0.6, 1.0) * rim * (0.25 + 0.75 * day);
  gl_FragColor = vec4(col, 1.0);
}`,
      })
    );
    planet.position.set(40, -800, -850);
    k.group.add(planet);
    return () => 0;
  }
);
