import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';

// Fractal architecture: fly-through structures assembled from real boxes, in
// the manner of Fractal Passage. Each scene builds one repeating cell as a
// list of boxes; the cell is merged into a single mesh, repeated endlessly
// along the route, and shaded the same way: dim faces, glowing edges, and
// (optionally) a finer fractal level carved into each face by the shader.
//
// A box is { c: [x, y, z], s: [sx, sy, sz], q?: Quaternion, hue?: number }.

const VERT = /* glsl */ `
attribute float aI;
attribute vec3 aLocal;       // position within the box, -0.5..0.5
attribute vec3 aSize;        // the box's size in metres
attribute float aHue;
uniform float uCell;
uniform float uHalf;
uniform float uTwist;        // radians of roll added per cell
varying vec3 vLocal;
varying vec3 vSize;
varying vec3 vN;
varying float vZ;
varying float vDist;
varying float vHue;
${JOURNEY_GLSL}
void main() {
  float zc = wrapZ(aI * uCell, uHalf);
  float cellId = floor((zc - uTravel) / uCell + 0.5);
  float ang = uTwist * cellId;
  float c = cos(ang), s = sin(ang);
  vec3 p = vec3(position.x * c - position.y * s, position.x * s + position.y * c, position.z + zc);
  vN = vec3(normal.x * c - normal.y * s, normal.x * s + normal.y * c, normal.z);
  vLocal = aLocal;
  vSize = aSize;
  vHue = aHue;
  vZ = p.z;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const STRUCTURE_FRAG = /* glsl */ `
uniform float uSeam;         // width of the glowing edges, metres
uniform float uCarve;        // 1 = carve a finer fractal level into each face
uniform float uPulse;        // strength of light running through the structure
uniform float uFog;
varying vec3 vLocal;
varying vec3 vSize;
varying vec3 vN;
varying float vZ;
varying float vDist;
varying float vHue;
${JOURNEY_GLSL}
void main() {
  // which face of the box is this, and where on it?
  vec3 al = abs(vLocal);
  float m = max(al.x, max(al.y, al.z)) - 1e-4;
  vec2 uv, sz;
  if (al.x >= m) { uv = vLocal.yz; sz = vSize.yz; }
  else if (al.y >= m) { uv = vLocal.xz; sz = vSize.xz; }
  else { uv = vLocal.xy; sz = vSize.xy; }
  vec2 e = (0.5 - abs(uv)) * sz;
  float seam = 1.0 - smoothstep(0.0, uSeam * (1.0 + vDist * 0.035), min(e.x, e.y));

  float carve = 0.0;
  if (uCarve > 0.5) {
    vec2 q = uv + 0.5;
    for (int i = 0; i < 2; i++) {
      vec2 f = floor(fract(q) * 3.0);
      if (f.x == 1.0 && f.y == 1.0) { carve = 1.0 - float(i) * 0.45; break; }
      q *= 3.0;
    }
  }

  float track = vZ - uTravel;
  vec3 an = abs(normalize(vN));
  vec3 hue = pal(track * 0.0045 + vHue + uTime * 0.006);
  float shade = an.x * 0.9 + an.y * 0.6 + an.z * 0.75;
  vec3 col = mix(vec3(0.05, 0.06, 0.13), hue, 0.3) * shade * (0.22 + 0.95 / (1.0 + vDist * 0.07));
  float pulse = 1.0 + uPulse * sin(vHue * 60.0 - uTime * 1.6);
  col += hue * seam * 0.6 * pulse;
  vec3 glow = pal(track * 0.0045 + vHue + 0.5 + uTime * 0.006) * (0.7 + 0.3 * sin(track * 0.35 - uTime * 0.8));
  col = mix(col, glow, carve * 0.85);
  float fog = clamp(1.0 - vDist / uFog, 0.0, 1.0);
  gl_FragColor = vec4(col * fog * fog, 1.0);
}
`;

const UNIT = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();

/** Merge a list of boxes into one repeating mesh. */
function structure(boxes, { cell, cells, seam = 0.07, carve = 0, pulse = 0, twist = 0, fog } = {}) {
  const up = UNIT.attributes.position.array;
  const un = UNIT.attributes.normal.array;
  const V = up.length / 3; // vertices per box
  const pos = new Float32Array(boxes.length * V * 3);
  const nor = new Float32Array(boxes.length * V * 3);
  const loc = new Float32Array(boxes.length * V * 3);
  const size = new Float32Array(boxes.length * V * 3);
  const hue = new Float32Array(boxes.length * V);
  const v = new THREE.Vector3();
  boxes.forEach((b, bi) => {
    for (let i = 0; i < V; i++) {
      const o = (bi * V + i) * 3;
      v.set(up[i * 3] * b.s[0], up[i * 3 + 1] * b.s[1], up[i * 3 + 2] * b.s[2]);
      if (b.q) v.applyQuaternion(b.q);
      pos.set([v.x + b.c[0], v.y + b.c[1], v.z + b.c[2]], o);
      v.set(un[i * 3], un[i * 3 + 1], un[i * 3 + 2]);
      if (b.q) v.applyQuaternion(b.q);
      nor.set([v.x, v.y, v.z], o);
      loc.set([up[i * 3], up[i * 3 + 1], up[i * 3 + 2]], o);
      size.set(b.s, o);
      hue[bi * V + i] = b.hue || 0;
    }
  });
  const half = (cell * cells) / 2;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aLocal', new THREE.BufferAttribute(loc, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 3));
  geo.setAttribute('aHue', new THREE.BufferAttribute(hue, 1));
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: cells }, (_, i) => i), 1));
  geo.instanceCount = cells;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: {
        uTravel: journey.uTravel,
        uTime: journey.uTime,
        uCell: { value: cell },
        uHalf: { value: half },
        uTwist: { value: twist },
        uSeam: { value: seam },
        uCarve: { value: carve },
        uPulse: { value: pulse },
        uFog: { value: fog || half },
      },
      vertexShader: VERT,
      fragmentShader: STRUCTURE_FRAG,
    })
  );
  mesh.frustumCulled = false;
  return mesh;
}

const scene = (speed, ...meshes) => {
  const group = new THREE.Group();
  group.add(...meshes);
  return { group, speed };
};

// ---------------------------------------------------------------------------
// Cantor Dust: keep only the eight corners of a cube, then the eight corners of
// each of those, and again. What is left is dust, clustered at every scale,
// with open lanes between the clusters.
// ---------------------------------------------------------------------------
export function createCantor() {
  const SIGNS = [-1, 1];
  const dust = (unit) => {
    let boxes = [{ c: [0, 0, 0], hue: 0 }];
    for (const step of [9 * unit, 3 * unit, unit]) {
      const next = [];
      boxes.forEach((b, n) => {
        for (const i of SIGNS) for (const j of SIGNS) for (const k of SIGNS)
          next.push({ c: [b.c[0] + i * step, b.c[1] + j * step, b.c[2] + k * step], hue: step === 3 * unit ? (next.length % 8) * 0.035 : b.hue });
      });
      boxes = next;
    }
    return boxes.map((b) => ({ ...b, s: [unit, unit, unit] }));
  };
  // the same dust twice: once around you, once three times larger around that
  const inner = structure(dust(1), { cell: 27, cells: 9, seam: 0.06, carve: 1 });
  const outer = structure(dust(3), { cell: 81, cells: 4, seam: 0.14, carve: 1, fog: 150 });
  return scene(3.5, inner, outer);
}

// ---------------------------------------------------------------------------
// Jack Lattice: a cube keeps its centre and the six cubes touching its faces,
// making a three-armed cross (a toy jack), and each piece does the same. Four
// columns of them stand around the path, their arms linking overhead.
// ---------------------------------------------------------------------------
export function createJacks() {
  const CELL = 18;
  const ARMS = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  let boxes = [{ c: [0, 0, 0], hue: 0 }];
  for (const step of [CELL / 3, CELL / 9, CELL / 27]) {
    boxes = boxes.flatMap((b) => ARMS.map((a, n) => ({ c: [b.c[0] + a[0] * step, b.c[1] + a[1] * step, b.c[2] + a[2] * step], hue: b.hue + (n ? 0.09 : 0) })));
  }
  const unit = CELL / 27;
  const all = [];
  for (const ox of [-1, 1]) for (const oy of [-1, 1])
    for (const b of boxes) all.push({ c: [b.c[0] + (ox * CELL) / 2, b.c[1] + (oy * CELL) / 2, b.c[2]], s: [unit, unit, unit], hue: b.hue });
  return scene(3.5, structure(all, { cell: CELL, cells: 13, seam: 0.05 }));
}

// ---------------------------------------------------------------------------
// Snowflake Vault: a tunnel whose cross-section is a Koch snowflake (every
// straight edge sprouts a smaller point, three times over), slowly twisting.
// ---------------------------------------------------------------------------
export function createVault() {
  const CELL = 6;
  const R = 9;
  let poly = [0, 1, 2].map((k) => [Math.cos((k * 2 * Math.PI) / 3 + Math.PI / 2) * R, Math.sin((k * 2 * Math.PI) / 3 + Math.PI / 2) * R]);
  for (let level = 0; level < 3; level++) {
    const next = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const dx = (b[0] - a[0]) / 3;
      const dy = (b[1] - a[1]) / 3;
      // the new point stands outward: turn the middle third by -60 degrees
      const px = a[0] + dx + dx * 0.5 + dy * 0.8660254;
      const py = a[1] + dy - dx * 0.8660254 + dy * 0.5;
      next.push(a, [a[0] + dx, a[1] + dy], [px, py], [a[0] + 2 * dx, a[1] + 2 * dy]);
    });
    poly = next;
  }
  const boxes = [];
  const zAxis = new THREE.Vector3(0, 0, 1);
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const q = new THREE.Quaternion().setFromAxisAngle(zAxis, ang);
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const hue = (i / poly.length) * 0.25;
    boxes.push({ c: [mx, my, 0], s: [len + 0.1, 0.14, CELL * 0.9], q, hue }); // wall panel
    // a rib at the joint between cells, standing a little proud of the wall
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    boxes.push({ c: [mx + nx * 0.22, my + ny * 0.22, CELL / 2], s: [len + 0.3, 0.5, CELL * 0.1 + 0.05], q, hue: hue + 0.45 });
  });
  return scene(3.5, structure(boxes, { cell: CELL, cells: 40, seam: 0.05, twist: 0.05 }));
}

// ---------------------------------------------------------------------------
// Hilbert Pipeworks: one unbroken pipe that visits every point of a cube
// without ever crossing itself (a space-filling curve), with a lane cut
// through the middle for you. Light runs along the pipe.
// ---------------------------------------------------------------------------
function hilbert3(order) {
  const pts = [];
  (function h(s, x, y, z, dx, dy, dz, dx2, dy2, dz2, dx3, dy3, dz3) {
    if (s === 1) return pts.push([x, y, z]);
    s /= 2;
    if (dx < 0) x -= s * dx;
    if (dy < 0) y -= s * dy;
    if (dz < 0) z -= s * dz;
    if (dx2 < 0) x -= s * dx2;
    if (dy2 < 0) y -= s * dy2;
    if (dz2 < 0) z -= s * dz2;
    if (dx3 < 0) x -= s * dx3;
    if (dy3 < 0) y -= s * dy3;
    if (dz3 < 0) z -= s * dz3;
    h(s, x, y, z, dx2, dy2, dz2, dx3, dy3, dz3, dx, dy, dz);
    h(s, x + s * dx, y + s * dy, z + s * dz, dx3, dy3, dz3, dx, dy, dz, dx2, dy2, dz2);
    h(s, x + s * dx + s * dx2, y + s * dy + s * dy2, z + s * dz + s * dz2, dx3, dy3, dz3, dx, dy, dz, dx2, dy2, dz2);
    h(s, x + s * dx2, y + s * dy2, z + s * dz2, -dx, -dy, -dz, -dx2, -dy2, -dz2, dx3, dy3, dz3);
    h(s, x + s * dx2 + s * dx3, y + s * dy2 + s * dy3, z + s * dz2 + s * dz3, -dx, -dy, -dz, -dx2, -dy2, -dz2, dx3, dy3, dz3);
    h(s, x + s * dx + s * dx2 + s * dx3, y + s * dy + s * dy2 + s * dy3, z + s * dz + s * dz2 + s * dz3, -dx3, -dy3, -dz3, dx, dy, dz, -dx2, -dy2, -dz2);
    h(s, x + s * dx + s * dx3, y + s * dy + s * dy3, z + s * dz + s * dz3, -dx3, -dy3, -dz3, dx, dy, dz, -dx2, -dy2, -dz2);
    h(s, x + s * dx3, y + s * dy3, z + s * dz3, dx2, dy2, dz2, -dx3, -dy3, -dz3, -dx, -dy, -dz);
  })(1 << order, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1);
  return pts;
}

export function createPipes() {
  const STEP = 2.2; // metres between neighbouring points of the curve
  const N = 8;
  const CELL = N * STEP;
  const THICK = 0.5;
  // The curve ends directly beyond where it began, so each cell's pipe runs
  // straight on into the next: add that joining step too.
  const pts = hilbert3(3);
  pts.push([pts[0][0], pts[0][1], N]);
  const at = (p) => [(p[0] - 3.5) * STEP, (p[1] - 3.5) * STEP, (p[2] - 3.5) * STEP];
  const inLane = (p) => Math.abs(p[0] - 3.5) < 1 && Math.abs(p[1] - 3.5) < 1;
  const boxes = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (inLane(pts[i]) || inLane(pts[i + 1])) continue;
    const a = at(pts[i]);
    const b = at(pts[i + 1]);
    boxes.push({
      c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      s: [0, 1, 2].map((k) => Math.abs(b[k] - a[k]) + THICK),
      hue: i / (pts.length - 1),
    });
  }
  return scene(3.5, structure(boxes, { cell: CELL, cells: 14, seam: 0.06, pulse: 0.6 }));
}

// ---------------------------------------------------------------------------
// Branching Arcade: trees that fork in two, again and again, lean in from all
// four sides and knit their finest twigs into a vault around the path.
// ---------------------------------------------------------------------------
export function createArcade() {
  const CELL = 12;
  const LEVELS = 8;
  const LANE = 2.6; // nothing grows closer than this to the path
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const branches = [];
  (function grow(base, dir, len, thick, level) {
    const end = base.clone().addScaledVector(dir, len);
    // keep the lane clear: test a few points along the branch
    for (let k = 1; k <= 4; k++) {
      const p = base.clone().lerp(end, k / 4);
      if (Math.hypot(p.x, p.y) < LANE + thick) return;
    }
    branches.push({ base, dir, len, thick, level });
    if (level === LEVELS - 1) return;
    // fork alternately side to side and fore and aft
    const axis = level % 2 === 0 ? Z.clone() : new THREE.Vector3().crossVectors(dir, Z).normalize();
    for (const sgn of [-1, 1]) {
      grow(end, dir.clone().applyAxisAngle(axis, sgn * 0.56).normalize(), len * 0.74, thick * 0.76, level + 1);
    }
  })(new THREE.Vector3(8, -8.5, 0), new THREE.Vector3(-0.22, 1, 0).normalize(), 4.4, 0.42, 0);

  const boxes = [];
  for (const [mx, my] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    for (const b of branches) {
      const dir = new THREE.Vector3(b.dir.x * mx, b.dir.y * my, b.dir.z);
      const mid = b.base.clone().addScaledVector(b.dir, b.len / 2);
      boxes.push({
        c: [mid.x * mx, mid.y * my, mid.z],
        s: [b.thick, b.len + b.thick * 0.5, b.thick],
        q: new THREE.Quaternion().setFromUnitVectors(Y, dir),
        hue: b.level * 0.055,
      });
    }
  }
  return scene(3.5, structure(boxes, { cell: CELL, cells: 20, seam: 0.04 }));
}
