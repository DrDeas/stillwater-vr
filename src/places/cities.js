import * as THREE from 'three';
import { place, fbm } from './kit.js';

// Cityscapes: streets to stroll down. Like the sanctuaries they are built
// from simple solids, but from repeated bays and lots rather than terrain.

const TAU = Math.PI * 2;
const pick = (k, list) => list[Math.floor(k.rand() * list.length)];

/** A flat ground slab. */
const slab = (k, w, d, color, y = 0, z = 0) => k.box(0, y - 0.5, z, w, 0.5, d, color, { jitter: 0.02 });

// ---------------------------------------------------------------------------
// Festival Street: a sunlit arcade street under hundreds of paper kites.
// ---------------------------------------------------------------------------
export const createFestival = place(
  {
    seed: 201,
    sky: { zenith: 0x1f78e0, horizon: 0xbfe4fa, sun: [0.35, 0.85, 0.35], sunCol: 0xfffbe8, cloud: 0.25, cloudCol: 0xffffff },
    light: { sun: 0xfff6dc, sky: 0xb4d0f0, ground: 0x8a7a6a },
    fog: { col: 0xc8e2f4, sun: 0xfff8e6, density: 0.0016 },
    spawn: [0, 8, 0],
    radius: 60,
  },
  (k) => {
    const NEAR = 14, FAR = -112;
    slab(k, 60, 160, 0xa29c90, 0, -50);
    // paving: a dark diamond in every flag
    for (let z = NEAR; z > FAR; z -= 1.7) for (let x = -3.4; x <= 3.5; x += 1.7) k.disc(x + (Math.round(z / 1.7) % 2) * 0.85 - 0.4, 0.012, z, 0.34, 0x3c3c44, { seg: 4, jitter: 0.04 });
    for (const sx of [-1, 1]) k.box(sx * 4.6, 0, -50, 0.22, 0.14, 160, 0xf2c81e, { jitter: 0.02 }); // yellow kerbs

    const WALLS = [0xf4ead8, 0xf2b46a, 0xf0d8b0, 0xe89a52, 0xfaf2e4, 0xf6c88a];
    const TILE = 0xb8502e;
    for (const sx of [-1, 1]) {
      for (let z = NEAR; z > FAR; ) {
        const w = 8 + k.rand() * 5;
        const zc = z - w / 2;
        const wall = pick(k, WALLS);
        const two = k.rand() < 0.65;
        // ground floor, set back behind an arcade of posts under a tiled roof
        k.box(sx * 11.5, 0, zc, 8, 3.6, w - 0.1, wall);
        k.box(sx * 6.1, 3.25, zc, 3.2, 0.16, w + 0.2, TILE, { rz: sx * 0.2 });
        for (let p = z - 0.6; p > z - w; p -= 2.9) {
          k.cyl(sx * 5.0, 0, p, 0.2, 0.24, 3.0, 0x9a3f24, { seg: 8 });
          k.cyl(sx * 5.0, 0, p, 0.3, 0.3, 0.45, 0xd8452e, { seg: 8 });
        }
        for (let d = z - 1.4; d > z - w + 1; d -= 3.2) k.box(sx * 7.48, 0, d, 0.08, 2.7, 2.0, pick(k, [0x2a2a30, 0x3a2a22, 0x4a3a30]));
        if (two) {
          k.box(sx * 11.8, 3.6, zc, 7.4, 3.4, w - 0.1, wall);
          k.box(sx * 8.1, 3.6, zc, 0.12, 0.9, w - 0.4, 0xffffff); // balcony wall
          for (let d = z - 1.6; d > z - w + 1; d -= 2.6) k.box(sx * 8.08, 4.5, d, 0.08, 1.5, 1.1, 0x4a6478);
        }
        k.box(sx * 11.8, two ? 7.0 : 3.6, zc, 7.8, 0.22, w + 0.1, 0xc8bca8);
        z -= w;
      }
    }
    // palms, lamp posts and potted plants down the street
    for (let z = 2; z > FAR; z -= 13) {
      k.palm(2.9, 0, z + 5, 1.5);
      k.cyl(-4.1, 0, z, 0.07, 0.09, 4.6, 0x2a2a2e, { seg: 6 });
      k.box(-3.7, 4.5, z, 0.9, 0.07, 0.07, 0x2a2a2e);
      k.ball(-3.3, 4.3, z, 0.16, 0xfff4d0, { glow: true, jitter: 0 });
      k.cyl(4.0, 0, z - 3, 0.45, 0.35, 0.7, 0xb8502e, { seg: 10 });
      for (let f = 0; f < 7; f++) k.box(4.0, 0.7, z - 3, 0.28, 0.04, 1.3, 0x3f9a4a, { ry: (f / 7) * TAU, rx: -0.9, jitter: 0.12 });
    }

    // the kites: strings across the street, each hung with a row of paper kites
    const BRIGHT = [0xe8392e, 0x19b6c9, 0xf58a1f, 0xf4cf1c, 0xd93a8a, 0x2f6fd8, 0x35b06a];
    const rows = [];
    for (let z = 9, i = 0; z > FAR + 6; z -= 2.6, i++) {
      const h = 5.4 + (i % 3) * 0.8;
      const row = k.moving(() => {
        k.box(0, 0.35, 0, 15, 0.02, 0.02, 0xf4f4f4, { jitter: 0 });
        for (let n = 0; n < 7; n++) {
          const x = -6.6 + n * 2.1 + (i % 2) * 1.0 + (k.rand() - 0.5) * 0.5;
          const col = pick(k, BRIGHT), tas = pick(k, BRIGHT);
          k.geo(new THREE.PlaneGeometry(1.5, 1.5).rotateZ(Math.PI / 4), x, 0, 0, col, { rx: -0.55, jitter: 0.03 });
          for (const side of [-1.0, 1.0]) k.box(x + side, -0.7, 0, 0.1, 0.7, 0.1, tas, { rz: side * 0.25, jitter: 0.03 });
          k.box(x, -1.6, 0.45, 0.1, 0.7, 0.1, tas, { jitter: 0.03 });
        }
      });
      row.position.set(0, h, z);
      rows.push(row);
    }
    k.onUpdate((dt, t) => rows.forEach((r, i) => ((r.rotation.x = Math.sin(t * 0.9 + i * 0.7) * 0.16), (r.rotation.z = Math.sin(t * 0.6 + i * 1.3) * 0.025))));
    return () => 0;
  }
);

// ---------------------------------------------------------------------------
// Glass Arcade: a grand shopping gallery under an iron-and-glass vault and dome.
// ---------------------------------------------------------------------------
export const createArcade = place(
  {
    seed: 202,
    sky: { zenith: 0x9ac4ee, horizon: 0xeef4fa, sun: [0.25, 0.9, 0.3], sunCol: 0xfffaf0, cloud: 0.5, cloudCol: 0xffffff },
    light: { sun: 0xfff4e2, sky: 0xdce4f0, ground: 0xb8a890 },
    fog: { col: 0xf0ece4, sun: 0xfffaf0, density: 0.0022 },
    spawn: [0, 34, 0],
    radius: 58,
  },
  (k) => {
    const HALF_W = 7, LEN = 62, CORNICE = 16, BAY = 6;
    const STONE = 0xd8ccb2, TRIM = 0xc4b48e, IRON = 0x3c4248;
    // floor: chequered marble, a border, and a round medallion under the dome
    slab(k, 132, 132, 0x5a544c);
    for (const hall of [0, 1]) {
      for (let a = -LEN; a < LEN; a += 1.5) {
        for (let c = -4; c < 4; c++) {
          if (hall === 1 && Math.abs(a + 0.75) < HALF_W) continue; // the crossing is laid once
          const light = (Math.round(a / 1.5) + c) & 1;
          const [x, z] = hall === 0 ? [c * 1.5 + 0.75, a + 0.75] : [a + 0.75, c * 1.5 + 0.75];
          k.geo(new THREE.PlaneGeometry(1.48, 1.48).rotateX(-Math.PI / 2), x, 0.01, z, light ? 0xb8ac98 : 0x8a5e56, { jitter: 0.04 });
        }
      }
      for (const side of [-1, 1]) {
        const [x, z, w, d] = hall === 0 ? [side * 6.5, 0, 1, LEN * 2] : [0, side * 6.5, LEN * 2, 1];
        k.box(x, 0, z, w, 0.02, d, 0x4a3a38, { jitter: 0.02 });
      }
    }
    // a round medallion under the dome
    [[8.2, 0x4a3a38], [7.6, 0xb8ac98], [6.0, 0x3a5a7a], [5.2, 0xb8ac98], [3.6, 0x8a3a34], [2.8, 0xc8a050], [1.2, 0x8a3a34]].forEach(([r, col], i) => k.disc(0, 0.03 + i * 0.004, 0, r, col, { seg: 48, jitter: 0.02 }));
    for (let i = 0; i < 16; i++) k.box(Math.cos((i / 16) * TAU) * 4.4, 0.06, Math.sin((i / 16) * TAU) * 4.4, 1.4, 0.01, 0.35, 0xc8a050, { ry: -(i / 16) * TAU, jitter: 0.02 });

    // one bay of facade; `put` places a box given (along, up, out-from-wall) coordinates
    const bay = (put, glow) => {
      put(0, 0, -0.5, BAY, CORNICE, 0.6, STONE); // wall
      for (const e of [-BAY / 2, BAY / 2]) put(e, 0, 0.1, 0.7, CORNICE, 0.5, TRIM); // pilasters
      put(0, 0, 0.02, 3.6, 3.4, 0.3, 0x2c2622); // shop opening...
      glow(0, 0.3, 0.22, 3.0, 2.8, 0.08, 0xffd08a); // ...its lit window
      put(0, 3.4, 0.2, 4.2, 0.8, 0.3, 0x3a3028); // fascia
      glow(0, 3.6, 0.38, 2.6, 0.4, 0.05, 0xf4d488); // gilded sign
      put(0, 4.6, 0.3, BAY, 0.3, 0.7, TRIM); // string course
      for (const [h, wh] of [[5.8, 3.2], [10.6, 2.6]]) {
        put(0, h, 0.02, 1.9, wh, 0.2, 0x4a5a66); // tall window
        put(0, h + wh, 0.2, 2.5, 0.35, 0.4, TRIM); // its hood
        put(0, h - 0.1, 0.45, 2.7, 0.1, 0.6, TRIM); // balcony slab
        for (let b = -1.2; b <= 1.21; b += 0.4) put(b, h, 0.7, 0.08, 0.9, 0.08, IRON); // railing
      }
      put(0, 9.9, 0.3, BAY, 0.25, 0.6, TRIM);
      put(0, CORNICE - 0.6, 0.5, BAY, 0.6, 1.1, TRIM); // cornice
    };
    // the two halls: along z, and across along x
    for (const hall of [0, 1]) {
      for (const side of [-1, 1]) {
        for (let a = -LEN + BAY / 2; a < LEN; a += BAY) {
          if (Math.abs(a) < HALF_W + 2) continue; // the crossing is open
          const at = (along, up, out, w, h, d, color, glowing) => {
            const off = side * (HALF_W + 0.25 - out);
            const [x, z, ry] = hall === 0 ? [off, a + along, Math.PI / 2] : [a + along, off, 0];
            k.box(x, up, z, w, h, d, color, { ry, glow: glowing, jitter: glowing ? 0 : 0.03 });
          };
          bay((...v) => at(...v, false), (...v) => at(...v, true));
        }
      }
      // iron ribs of the glass vault, and the long bars that tie them
      for (let a = -LEN; a <= LEN; a += 2) {
        if (Math.abs(a) < HALF_W) continue;
        const rib = new THREE.TorusGeometry(HALF_W, 0.07, 5, 18, Math.PI);
        if (hall === 0) k.geo(rib, 0, CORNICE, a, IRON);
        else k.geo(rib, a, CORNICE, 0, IRON, { ry: Math.PI / 2 });
      }
      for (const ang of [0.5, 1.05, Math.PI / 2, Math.PI - 1.05, Math.PI - 0.5]) {
        const off = Math.cos(ang) * HALF_W, up = CORNICE + Math.sin(ang) * HALF_W;
        for (const s of [-1, 1]) {
          const mid = s * (HALF_W + (LEN - HALF_W) / 2);
          if (hall === 0) k.box(off, up, mid, 0.07, 0.07, LEN - HALF_W, IRON);
          else k.box(mid, up, off, LEN - HALF_W, 0.07, 0.07, IRON);
        }
      }
    }
    // the dome over the crossing: a ring, meridian ribs and hoops
    const DOME = HALF_W * Math.SQRT2;
    k.geo(new THREE.TorusGeometry(DOME, 0.3, 6, 48).rotateX(Math.PI / 2), 0, CORNICE + 0.4, 0, TRIM);
    for (let i = 0; i < 24; i++) k.geo(new THREE.TorusGeometry(DOME, 0.08, 5, 14, Math.PI / 2), 0, CORNICE + 0.4, 0, IRON, { ry: (i / 24) * TAU });
    for (const el of [0.35, 0.75, 1.1, 1.38]) k.geo(new THREE.TorusGeometry(DOME * Math.cos(el), 0.06, 5, 40).rotateX(Math.PI / 2), 0, CORNICE + 0.4 + DOME * Math.sin(el), 0, IRON);
    // four corner piers carrying it, with painted lunettes above
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box(sx * (HALF_W + 1.2), 0, sz * (HALF_W + 1.2), 2.6, CORNICE, 2.6, STONE);
      k.box(sx * (HALF_W + 0.4), CORNICE - 4.4, sz * (HALF_W + 0.4), 2.2, 3.4, 2.2, 0xb8905a, { ry: Math.PI / 4 });
    }
    // globe lamps along the halls
    for (let a = -54; a <= 54; a += 12) {
      if (Math.abs(a) < 8) continue;
      for (const [x, z] of [[0, a], [a, 0]]) {
        k.cyl(x, 9.5, z, 0.02, 0.02, 6.5, IRON, { seg: 4 });
        k.ball(x, 9.1, z, 0.4, 0xfff0cc, { glow: true, jitter: 0, detail: 2 });
      }
    }
    k.motes({ count: 300, box: [-7, 1, -55, 14, 14, 110], color: 0xfff6dc, size: 0.035, drift: [0.02, -0.05, 0.03], sway: 0.5, twinkle: 1, additive: true });
    return () => 0;
  }
);

// ---------------------------------------------------------------------------
// Antigua Arch: a cobbled colonial street, a yellow clock arch, a volcano beyond.
// ---------------------------------------------------------------------------
export const createAntigua = place(
  {
    seed: 203,
    sky: { zenith: 0x3f86d8, horizon: 0xf4dcc0, sun: [-0.6, 0.38, 0.4], sunCol: 0xffe8c0, cloud: 0.5, cloudCol: 0xfff4ea },
    light: { sun: 0xffe2b4, sky: 0xa8c0e0, ground: 0x7a6a5a },
    fog: { col: 0xd4dcec, sun: 0xfff0d8, density: 0.0011 },
    spawn: [0, 10, 0],
    radius: 60,
  },
  (k) => {
    const NEAR = 18, FAR = -120, ARCH_Z = -46;
    k.terrain({ size: 300, res: 60, height: () => -0.05, color: () => 0x4f7244 });
    // cobbles: courses of stone across the street, and raised pavements
    for (let z = NEAR; z > FAR; z -= 0.55) for (let c = 0; c < 4; c++) k.box(-3.2 + c * 2.15 + (Math.round(z / 0.55) % 2) * 0.5 - 0.25, -0.1, z, 2.1, 0.1, 0.5, 0x6e6a64, { jitter: 0.16 });
    for (const sx of [-1, 1]) k.box(sx * 5.15, 0, -50, 1.7, 0.18, 142, 0x8e887c, { jitter: 0.03 });
    const WALLS = [0xd89a3a, 0xb8443a, 0x4a78b0, 0xf0e8d8, 0xc86a3a, 0xe8c040, 0x6a9a7a, 0xd8a0a0];
    const TILE = 0x9a4a30;
    for (const sx of [-1, 1]) {
      for (let z = NEAR; z > FAR; ) {
        const w = 7 + k.rand() * 5, h = 4.4 + k.rand() * 1.3;
        const zc = z - w / 2;
        if (Math.abs(zc - ARCH_Z) < 5) { z -= w; continue; }
        const wall = pick(k, WALLS);
        k.box(sx * 9, 0, zc, 6, h, w - 0.06, wall);
        k.box(sx * 5.98, 0, zc, 0.08, 0.9, w - 0.06, 0x5a4a44); // painted dado
        k.box(sx * 6.6, h - 0.1, zc, 2.2, 0.18, w + 0.1, TILE, { rz: sx * 0.32 }); // tiled eave
        k.box(sx * 5.96, 0, z - 1.6, 0.1, 2.7, 1.4, 0x4a3024); // door
        for (let d = z - 4.2; d > z - w + 1.2; d -= 3) {
          k.box(sx * 5.9, 1.1, d, 0.22, 1.9, 1.3, 0x34363c); // barred window box
          k.box(sx * 5.85, 0.95, d, 0.36, 0.16, 1.6, 0xe8e0d0);
          k.box(sx * 5.85, 3.0, d, 0.36, 0.14, 1.6, 0xe8e0d0);
        }
        if (k.rand() < 0.45) { k.ball(sx * 5.7, 3.3, z - 0.3, 0.16, 0xffd890, { glow: true, jitter: 0 }); k.box(sx * 5.85, 3.5, z - 0.3, 0.3, 0.05, 0.05, 0x2a2a2c); }
        if (k.rand() < 0.3) for (let b = 0; b < 5; b++) k.ball(sx * (5.9 + k.rand() * 0.6), h - 0.2 + k.rand() * 0.9, z - k.rand() * w, 0.7 + k.rand() * 0.5, 0xd8328a, { sy: 0.7 });
        z -= w;
      }
    }
    // the arch: two piers, a span, and a clock turret with a cupola
    const YEL = 0xf0b828, WHITE = 0xfaf6ec;
    for (const sx of [-1, 1]) {
      k.box(sx * 5.6, 0, ARCH_Z, 3.2, 9.4, 3.4, YEL);
      k.box(sx * 5.6, 0, ARCH_Z, 3.4, 0.9, 3.6, WHITE);
      k.box(sx * 4.05, 0, ARCH_Z, 0.3, 5.2, 3.5, WHITE);
    }
    k.box(0, 6.6, ARCH_Z, 8.2, 2.8, 3.2, YEL);
    for (const face of [-1, 1]) k.geo(new THREE.TorusGeometry(3.95, 0.32, 6, 18, Math.PI), 0, 5.2, ARCH_Z + face * 1.55, WHITE);
    for (let i = -4; i <= 4; i++) k.box(i * 0.5 * 1.9 * 0.5, 5.2 + Math.sqrt(Math.max(0, 16 - (i * 0.95) ** 2)), ARCH_Z, 1.0, 6.7 - (5.2 + Math.sqrt(Math.max(0, 16 - (i * 0.95) ** 2))), 3.2, YEL);
    k.box(0, 9.4, ARCH_Z, 14.6, 0.35, 3.7, WHITE);
    k.box(0, 9.75, ARCH_Z, 3.2, 3.6, 3.2, YEL);
    k.box(0, 13.3, ARCH_Z, 3.6, 0.3, 3.6, WHITE);
    for (const face of [-1, 1]) k.geo(new THREE.CircleGeometry(1.0, 24), 0, 11.6, ARCH_Z + face * 1.62, WHITE, { ry: face < 0 ? Math.PI : 0, jitter: 0 });
    k.ball(0, 14.4, ARCH_Z, 1.3, WHITE, { detail: 2 });
    k.cyl(0, 15.5, ARCH_Z, 0.05, 0.05, 1.3, 0x3a3a3a, { seg: 4 });
    // the volcano at the end of the street, and green hills around the town
    k.cone(40, -30, -1500, 900, 640, 0x5c6c8c, { seg: 28, jitter: 0.03 });
    k.mountains({ r0: 380, height: 90, low: 0x4f7a52, high: 0x7a9a8a, seed: 31, freq: 0.004, gap: [0, 0.5] });
    for (let i = 0; i < 40; i++) k.tree((k.rand() < 0.5 ? -1 : 1) * (14 + k.rand() * 30), 0, NEAR - k.rand() * 140, 1.4 + k.rand());
    k.motes({ count: 120, box: [-5, 0.5, -60, 10, 7, 75], color: 0xfff0c8, size: 0.035, drift: [0.06, 0.01, 0.03], sway: 0.6, twinkle: 1, additive: true });
    return (x) => (Math.abs(x) > 4.3 && Math.abs(x) < 6 ? 0.18 : 0);
  }
);

// ---------------------------------------------------------------------------
// Canal at Dusk: lamplit quays and tall houses along still water, boats rocking.
// ---------------------------------------------------------------------------
export const createCanal = place(
  {
    seed: 204,
    sky: { zenith: 0x1e2860, horizon: 0xff9c6c, sun: [0.1, 0.06, -1], sunCol: 0xffb480, stars: 0.5, cloud: 0.45, cloudCol: 0xc87a8a },
    light: { sun: 0xe88a5a, sky: 0x6a70a8, ground: 0x3a3450 },
    fog: { col: 0x8a6a8a, sun: 0xffac80, density: 0.004 },
    spawn: [6.6, 10, 0],
    radius: 60,
  },
  (k) => {
    const NEAR = 30, FAR = -150, QUAY = 0.9, EDGE = 4.6;
    k.water({ deep: 0x0c2434, calm: 0.14 });
    const WALLS = [0xd88a6a, 0xe8c090, 0xc86a5a, 0xe0b0a0, 0xd8d0b8, 0xb8705a, 0xc8a078];
    for (const sx of [-1, 1]) {
      k.box(sx * (EDGE + 2.2), -2, -60, 4.4, QUAY + 2, 190, 0x8a8078, { jitter: 0.03 }); // the quay
      k.box(sx * (EDGE + 0.1), QUAY, -60, 0.3, 0.1, 190, 0xb8b0a4, { jitter: 0.02 });
      for (let z = NEAR; z > FAR; ) {
        const w = 6 + k.rand() * 4, floors = 3 + Math.floor(k.rand() * 2.2), h = floors * 3.3 + 1;
        const zc = z - w / 2;
        k.box(sx * 13, 0, zc, 8, h, w - 0.05, pick(k, WALLS));
        k.box(sx * 13, h, zc, 8.6, 0.4, w + 0.2, 0x9a5038);
        k.arch(sx * 8.98, QUAY + 1.7, z - w / 2 + (k.rand() - 0.5) * 2, 0.75, 0.1, 0x2c1e18, { ry: sx * Math.PI / 2 });
        k.box(sx * 8.98, QUAY, z - w / 2, 0.1, 1.7, 1.5, 0x2c1e18);
        for (let f = 1; f < floors; f++) for (let d = z - 1.2; d > z - w + 0.8; d -= 1.9) {
          const lit = k.rand() < 0.55;
          k.box(sx * 8.97, QUAY + f * 3.3, d, 0.08, 1.7, 0.9, lit ? pick(k, [0xffc878, 0xffd898, 0xf4b060]) : 0x24283a, { glow: lit, jitter: 0 });
        }
        z -= w;
      }
      // lamps along the water's edge, and mooring poles
      for (let z = 14; z > FAR; z -= 13) {
        k.cyl(sx * (EDGE + 0.5), QUAY, z, 0.06, 0.08, 3.0, 0x22222a, { seg: 6 });
        k.ball(sx * (EDGE + 0.5), QUAY + 3.15, z, 0.24, 0xffd898, { glow: true, jitter: 0, detail: 2 });
        k.cyl(sx * (EDGE - 0.5), -1, z + 5, 0.09, 0.09, 3.2, 0x5a4636, { seg: 6 });
      }
    }
    k.lamp(EDGE + 0.5, QUAY + 2.9, 1, 0xffb060, 2.2);
    k.lamp(-EDGE - 0.5, QUAY + 2.9, 1, 0xffb060, 2.2);
    k.lamp(EDGE + 0.5, QUAY + 2.9, -12, 0xffb060, 2.2);
    k.lamp(EDGE + 0.5, QUAY + 2.9, 14, 0xffb060, 2.2);
    // humped stone bridges
    for (const bz of [-34, -100]) {
      for (let i = -7; i <= 7; i++) {
        const t = i / 7, y = QUAY + (1 - t * t) * 2.3;
        k.box(t * (EDGE + 1.6), y - 0.5, bz, 0.95, 0.5, 3.4, 0x9a9086, { rz: -t * 0.5 });
        for (const side of [-1.6, 1.6]) k.box(t * (EDGE + 1.6), y, bz + side, 0.95, 0.75, 0.22, 0xa8a094, { rz: -t * 0.5 });
      }
    }
    // boats moored along the quays
    const boats = [[3.3, -6], [-3.4, 4], [3.4, -22], [-3.3, -48], [3.3, -70], [-3.4, -18]].map(([bx, bz], i) => {
      const b = k.moving(() => {
        k.ball(0, 0.05, 0, 0.75, 0x1c1a20, { sy: 0.4, sz: 5.2, detail: 1, jitter: 0.03 });
        k.box(0, 0.25, 0.4, 0.9, 0.12, 1.6, 0x6a2a2a);
        k.box(0, 0.3, -3.6, 0.1, 0.7, 0.1, 0xc8b060);
      });
      b.position.set(bx, 0.05, bz);
      return b;
    });
    k.onUpdate((dt, t) => boats.forEach((b, i) => ((b.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.07), (b.position.y = 0.05 + Math.sin(t * 0.7 + i) * 0.05))));
    return (x) => (Math.abs(x) > EDGE ? QUAY : 0);
  }
);
