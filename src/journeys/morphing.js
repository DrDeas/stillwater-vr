import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';
import { STRUCTURE_FRAG } from './fractals.js';

// Morphing fractals: structures assembled from boxes, like the rest of the
// fractal architecture, except that nothing here is fixed. A fractal is built
// level by level (a shape made of smaller copies made of smaller copies), and
// each box remembers the step it took at every level. The vertex shader can
// then stretch or shrink each level's steps separately and swell the boxes
// themselves, so a structure can close up into a solid block, unfold into its
// finest dust, or breathe anywhere in between.
//
// A box is { base, o: [step1, step2, step3], s, level, hue, seed }:
//   base   where its cluster sits in the cell
//   o      the offset it took at each level of the fractal
//   s      its size [x, y, z]
// A scene's `morph` GLSL sets:
//   f      vec3: how far each level's steps are stretched (1 = the true fractal)
//   g      vec3: how much the box itself swells
//   roll   radians: turn this cell about the path

const UNIT = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();

function morphing(boxes, { cell, cells, morph, seam = 0.06, carve = 0, wall = 13, speed = 3 }) {
  const half = (cell * cells) / 2;
  const vert = /* glsl */ `
attribute float aI;
attribute vec3 aBase;
attribute vec3 aO1;
attribute vec3 aO2;
attribute vec3 aO3;
attribute vec3 aSize;
attribute vec3 aMeta;        // level, hue, cluster seed
varying vec3 vLocal;
varying vec3 vSize;
varying vec3 vN;
varying float vZ;
varying float vDist;
varying float vHue;
${JOURNEY_GLSL}
float wave(float x) { return 0.5 + 0.5 * sin(x); }
void main() {
  float t = uTime;
  float zc = wrapZ(aI * ${cell.toFixed(2)}, ${half.toFixed(2)});
  float cellId = floor((zc - uTravel) / ${cell.toFixed(2)} + 0.5);
  float track = zc + aBase.z - uTravel;
  float level = aMeta.x;
  float seed = aMeta.z;
  vec3 f = vec3(1.0);
  vec3 g = vec3(1.0);
  float roll = 0.0;
  ${morph}
  vec3 q = aBase + aO1 * f.x + aO2 * f.y + aO3 * f.z + position * aSize * g;
  float cs = cos(roll), sn = sin(roll);
  vec3 p = vec3(q.x * cs - q.y * sn, q.x * sn + q.y * cs, q.z + zc);
  vLocal = position;
  vSize = aSize * g;
  vN = step(0.4999, abs(position)) * sign(position);
  vHue = aMeta.y;
  vZ = p.z;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;
  const up = UNIT.attributes.position.array;
  const V = up.length / 3;
  const n = boxes.length * V;
  const arr = () => new Float32Array(n * 3);
  const A = { position: arr(), aBase: arr(), aO1: arr(), aO2: arr(), aO3: arr(), aSize: arr(), aMeta: arr() };
  const ZERO = [0, 0, 0];
  boxes.forEach((b, bi) => {
    for (let i = 0; i < V; i++) {
      const o = (bi * V + i) * 3;
      A.position.set([up[i * 3], up[i * 3 + 1], up[i * 3 + 2]], o);
      A.aBase.set(b.base, o);
      A.aO1.set(b.o[0] || ZERO, o);
      A.aO2.set(b.o[1] || ZERO, o);
      A.aO3.set(b.o[2] || ZERO, o);
      A.aSize.set(b.s, o);
      A.aMeta.set([b.level || 0, b.hue || 0, b.seed || 0], o);
    }
  });
  const geo = new THREE.InstancedBufferGeometry();
  for (const [name, data] of Object.entries(A)) geo.setAttribute(name, new THREE.BufferAttribute(data, 3));
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: cells }, (_, i) => i), 1));
  geo.instanceCount = cells;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: {
        uTravel: journey.uTravel,
        uTime: journey.uTime,
        uSeam: { value: seam },
        uCarve: { value: carve },
        uPulse: { value: 0 },
        uFog: { value: half },
      },
      vertexShader: vert,
      fragmentShader: STRUCTURE_FRAG,
    })
  );
  mesh.frustumCulled = false;

  // An outer shell, so there is fractal in every direction: a dim Sierpinski
  // carpet of light that travels with the structure.
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(wall, wall, half * 2, 64, 1, true).rotateX(Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { uTravel: journey.uTravel, uTime: journey.uTime },
      vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
varying vec3 vPos;
${JOURNEY_GLSL}
void main() {
  float track = vPos.z - uTravel;
  float a = atan(vPos.y, vPos.x);
  vec2 q = vec2(a / 6.28318 * 9.0, track / ${((2 * Math.PI * wall) / 9).toFixed(3)});
  float lit = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 f = floor(fract(q) * 3.0);
    if (f.x == 1.0 && f.y == 1.0) { lit = 1.0 - float(i) * 0.3; break; }
    q *= 3.0;
  }
  float far = clamp(1.0 - abs(vPos.z) / ${half.toFixed(1)}, 0.0, 1.0);
  vec3 col = pal(track * 0.0045 + 0.5 + uTime * 0.006) * (0.035 + 0.2 * lit * (0.7 + 0.3 * sin(track * 0.3 - uTime * 0.7)));
  gl_FragColor = vec4(col * far * far, 1.0);
}
`,
      side: THREE.BackSide,
    })
  );
  shell.frustumCulled = false;

  const group = new THREE.Group();
  group.add(shell, mesh);
  return { group, speed };
}

// --- helpers for building fractals ------------------------------------------

/** Grow a fractal: start with one item and replace each by `steps` copies, once per size in `sizes`. */
function grow(steps, sizes) {
  let items = [{ o: [] }];
  for (const size of sizes) items = items.flatMap((it) => steps.map((st) => ({ o: [...it.o, st.map((v) => v * size)], last: st })));
  return items;
}

const CORNERS = [];
for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) CORNERS.push([i, j, k]);
const JACK = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// eight stations around the path: four sides and four corners
const ringOf = (d) => [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]];

// ---------------------------------------------------------------------------
// Breathing Sponge: the Menger sponge of Fractal Passage, alive. Its blocks
// swell and shrink in waves and the whole shaft loosens and tightens, so the
// holes in the walls keep opening and closing around you.
// ---------------------------------------------------------------------------
export function createBreathingSponge() {
  const SPONGE = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if ((i === 0) + (j === 0) + (k === 0) < 2) SPONGE.push([i, j, k]);
  const boxes = grow(SPONGE, [6, 2]).map((it) => ({ base: [0, 0, 0], o: it.o, s: [2, 2, 2], hue: (Math.abs(it.o[0][0]) + Math.abs(it.o[0][1])) * 0.004 }));
  return morphing(boxes, {
    cell: 18,
    cells: 13,
    carve: 1,
    wall: 15,
    morph: /* glsl */ `
    f = vec3(1.07 + 0.09 * sin(track * 0.12 - t * 0.6), 1.0 + 0.15 * sin(track * 0.2 + t * 0.8), 1.0);
    g = vec3(0.72 + 0.4 * wave(t * 1.0 - length(aO1.xy) * 0.45 - track * 0.16));
    `,
  });
}

// ---------------------------------------------------------------------------
// Unfolding Dust: solid cubes split into eight, and each of those into eight
// again, drifting apart into dust before gathering back into a block.
// ---------------------------------------------------------------------------
export function createUnfoldingDust() {
  const boxes = [];
  ringOf(8.6).forEach(([x, y], c) => {
    for (const it of grow(CORNERS, [2.2, 0.9])) boxes.push({ base: [x, y, 0], o: it.o, s: [0.9, 0.9, 0.9], hue: c * 0.04, seed: c / 8 });
  });
  return morphing(boxes, {
    cell: 10.5,
    cells: 23,
    carve: 1,
    morph: /* glsl */ `
    float u = wave(t * 0.45 + track * 0.11 + seed * 6.28318);
    float s1 = smoothstep(0.05, 0.55, u), s2 = smoothstep(0.4, 0.95, u);
    f = vec3(s1 * 1.25, s2 * 1.35, 0.0);
    g = vec3(mix(mix(4.2, 2.0, s1), 1.0, s2));            // one block, then eight, then sixty-four
    `,
  });
}

// ---------------------------------------------------------------------------
// Blooming Jacks: crosses made of crosses whose arms reach out and draw back,
// each level in its own time, like sea urchins opening.
// ---------------------------------------------------------------------------
export function createBloomingJacks() {
  const boxes = [];
  ringOf(9.4).forEach(([x, y], c) => {
    for (const it of grow(JACK, [2.7, 0.9])) boxes.push({ base: [x, y, 0], o: it.o, s: [0.9, 0.9, 0.9], hue: c * 0.03 + (it.last[0] || it.last[1] || it.last[2] ? 0.12 : 0), seed: c / 8 });
  });
  return morphing(boxes, {
    cell: 7.5,
    cells: 32,
    wall: 14.5,
    carve: 1,
    morph: /* glsl */ `
    float ph = t * 0.6 + track * 0.14 + seed * 6.28318;
    f = vec3(0.35 + 1.0 * wave(ph), 0.3 + 1.1 * wave(ph * 1.6 + 1.0), 0.0);
    g = vec3(0.75 + 0.6 * wave(ph + 2.0));
    `,
  });
}

// ---------------------------------------------------------------------------
// Pyramid Hall: pyramids built of pyramids hang from all four walls, their
// tiers rising and settling so the points reach toward you and withdraw.
// ---------------------------------------------------------------------------
export function createPyramidHall() {
  // one tier: four around the base and one on top (w points at the apex)
  const TIER = [[-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1], [0, 0, 1]];
  const UNIT_SIZE = 0.75;
  const boxes = [];
  const place = (inward, dist, unit, levels, hue, seed, zOff) => {
    // local (u, v, w) -> world, with w pointing inward toward the path
    const u = [0, 0, 1];
    const v = [inward[1] * u[2] - 0 * u[1], 0 * u[0] - inward[0] * u[2], 0]; // cross(inward, u)
    const world = (st) => [0, 1, 2].map((k) => u[k] * st[0] + v[k] * st[1] + inward[k] * st[2]);
    const sizes = levels === 3 ? [unit * 2, unit, unit / 2] : [unit, unit / 2];
    for (const it of grow(TIER, sizes)) {
      boxes.push({ base: [-inward[0] * dist, -inward[1] * dist, zOff], o: it.o.map(world), s: [unit, unit, unit], hue, seed, level: it.last[2] > 0 ? 1 : 0 });
    }
  };
  [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]].forEach((inw, c) => place(inw, 7.4, UNIT_SIZE, 3, c * 0.05, c / 4, 0));
  // broader, simpler pyramids fill the diagonals between them, half a cell further along
  const D = Math.SQRT1_2;
  [[D, D, 0], [-D, D, 0], [D, -D, 0], [-D, -D, 0]].forEach((inw, c) => place(inw, 9.2, 1.6, 2, 0.3 + c * 0.05, 0.5 + c / 4, 4));
  return morphing(boxes, {
    cell: 8,
    cells: 30,
    carve: 1,
    wall: 12,
    morph: /* glsl */ `
    float ph = t * 0.55 + track * 0.13 + seed * 6.28318;
    f = vec3(1.0 + 0.22 * sin(ph), 1.0 + 0.3 * sin(ph + 1.2), 1.0 + 0.4 * sin(ph + 2.4));
    g = vec3(0.8 + 0.35 * wave(ph * 1.3 + level * 1.5));
    `,
  });
}

// ---------------------------------------------------------------------------
// Carpet Gates: you pass through the middle of one Sierpinski carpet after
// another, each turned a little from the last, its holes widening and closing.
// ---------------------------------------------------------------------------
export function createCarpetGates() {
  const RING = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) RING.push([i, j, 0]);
  const boxes = grow(RING, [9, 3, 1]).map((it) => ({ base: [0, 0, 0], o: it.o, s: [1, 1, 0.7], hue: (Math.abs(it.o[0][0]) + Math.abs(it.o[0][1])) * 0.006 }));
  return morphing(boxes, {
    cell: 7.5,
    cells: 32,
    wall: 21,
    seam: 0.05,
    morph: /* glsl */ `
    float ph = t * 0.5 + cellId * 0.45;
    f = vec3(1.0 + 0.07 * sin(ph), 1.0 + 0.12 * sin(ph + 1.5), 1.0 + 0.18 * sin(ph + 3.0));
    g = vec3(vec2(0.55 + 0.6 * wave(t * 0.9 - length(aO1.xy + aO2.xy) * 0.25 + cellId * 0.5)), 1.0);
    roll = cellId * 0.13 + 0.35 * sin(t * 0.18 + cellId * 0.2);
    `,
  });
}

// ---------------------------------------------------------------------------
// Corner Reef: a cube sprouts a smaller cube from each of its eight corners,
// and each of those sprouts eight more. The buds push out and sink back in.
// ---------------------------------------------------------------------------
export function createCornerReef() {
  const boxes = [];
  ringOf(8.8).forEach(([x, y], c) => {
    const base = [x, y, 0];
    const seed = c / 8;
    boxes.push({ base, o: [], s: [3, 3, 3], level: 0, hue: c * 0.03, seed });
    for (const a of CORNERS) {
      const o1 = a.map((v) => v * 1.5);
      boxes.push({ base, o: [o1], s: [1.5, 1.5, 1.5], level: 1, hue: c * 0.03 + 0.15, seed });
      for (const b of CORNERS) boxes.push({ base, o: [o1, b.map((v) => v * 0.75)], s: [0.75, 0.75, 0.75], level: 2, hue: c * 0.03 + 0.3, seed });
    }
  });
  return morphing(boxes, {
    cell: 10,
    cells: 24,
    carve: 1,
    morph: /* glsl */ `
    float ph = t * 0.5 + track * 0.12 + seed * 6.28318;
    f = vec3(0.25 + 1.05 * wave(ph), 0.2 + 1.15 * wave(ph * 1.5 + 0.8), 0.0);
    g = vec3(level < 0.5 ? 0.85 + 0.25 * wave(ph + 3.14) : 0.7 + 0.55 * wave(ph * 1.2 + level));
    `,
  });
}
