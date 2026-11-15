import * as THREE from 'three';
import { litMaterial, merge, paint, faceted, polarGrid, glowSprites, shared, MOON_DIR } from './common.js';
import { mulberry32, fbm } from './noise.js';
import { ISLAND, PLATFORM, islandHeight } from './terrain.js';

// A mossy islet carrying a blossom tree that sheds a slow drift of petals,
// plus the weathered rocks scattered across the lake.

const POINT_SIZE = /* glsl */ `
  gl_PointSize = clamp(aSize * uViewH * 0.5 * projectionMatrix[1][1] / -mv.z, 1.0, uMaxPx);
`;

const BLOSSOM_VERT = /* glsl */ `
attribute vec3 aN;
attribute float aSize;
uniform float uTime;
uniform float uViewH;
uniform float uMaxPx;
uniform vec3 uMoonDir;
varying vec3 vCol;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.5 + position.y * 1.3 + position.z) * 0.03;
  p.z += cos(uTime * 0.4 + position.x * 1.1) * 0.025;
  vec3 N = normalize(aN);
  float l = 0.46 + 0.5 * max(dot(N, uMoonDir), 0.0) + 0.22 * (N.y * 0.5 + 0.5);
  vCol = color * l;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  ${POINT_SIZE}
  gl_Position = projectionMatrix * mv;
}
`;

const BLOSSOM_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(vCol * (0.9 - c.y * 0.35), 1.0);
}
`;

const PETAL_VERT = /* glsl */ `
attribute vec4 aSeed;            // fall speed, phase, sway, size
uniform float uTime;
uniform float uViewH;
uniform float uMaxPx;
uniform float uMirror;
varying vec3 vCol;
void main() {
  float f = fract(uTime * aSeed.x + aSeed.y);
  vec3 p = position;
  p.y = mix(position.y, 0.0, f);
  float sway = aSeed.z * 6.2831;
  p.x += sin(uTime * 0.7 + sway) * 0.35 * f - f * 1.6;      // a faint breeze
  p.z += cos(uTime * 0.55 + sway * 1.7) * 0.35 * f + f * 0.9;
  float fade = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.93, 1.0, f));
  vCol = color * (0.55 + 0.25 * sin(uTime * 2.0 + sway * 3.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float aSize = aSeed.w * fade;
  ${POINT_SIZE}
  if (fade < 0.02) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); else gl_Position = projectionMatrix * mv;
}
`;

function tube(p0, p1, r0, r1) {
  const d = new THREE.Vector3().subVectors(p1, p0);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len * 1.04, 7, 1, true).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(p0.x, p0.y, p0.z);
}

function rock(rand, size) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const seed = Math.floor(rand() * 1000);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.7 + 0.6 * fbm(x * 1.3 + 5, y * 1.3 + z * 1.3 + 5, seed, 2);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.scale(size * (0.8 + rand() * 0.6), size * (0.5 + rand() * 0.5), size * (0.8 + rand() * 0.6));
  g.rotateY(rand() * 6.28);
  return paint(faceted(g), new THREE.Color(0.3, 0.31, 0.39), 0.08, rand);
}

export function createIsland() {
  const group = new THREE.Group();
  group.name = 'island';
  const rand = mulberry32(21);

  // --- mound
  const MOSS = new THREE.Color(0.1, 0.24, 0.14);
  const SHORE = new THREE.Color(0.2, 0.2, 0.23);
  const ground = polarGrid(48, 12, (a, t, out) => {
    const r = t * ISLAND.r;
    out.x = ISLAND.x + Math.sin(a) * r;
    out.z = ISLAND.z - Math.cos(a) * r;
    const bump = (fbm(out.x * 0.9, out.z * 0.9, 4, 3) - 0.5) * 0.22 * (1 - t);
    out.y = t >= 1 ? -0.12 : islandHeight(out.x, out.z) + bump;
    out.color.copy(SHORE).lerp(MOSS, THREE.MathUtils.smoothstep(out.y, 0.03, 0.4));
  });
  group.add(new THREE.Mesh(ground, litMaterial({ pattern: 0.5 })));

  // --- tree skeleton
  const branches = [];
  const tips = [];
  const up = new THREE.Vector3(0, 1, 0);
  const MAX = 5;
  const jitter = () => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5);
  (function grow(p, dir, len, rad, depth) {
    let pos = p.clone();
    let d = dir.clone();
    const SEG = 3;
    for (let s = 0; s < SEG; s++) {
      const nd = d.clone().addScaledVector(jitter(), 0.34).addScaledVector(up, 0.06).normalize();
      const np = pos.clone().addScaledVector(nd, len / SEG);
      branches.push(tube(pos, np, rad * (1 - (s / SEG) * 0.3), rad * (1 - ((s + 1) / SEG) * 0.3)));
      pos = np;
      d = nd;
    }
    if (depth >= 2) tips.push({ pos, r: depth >= MAX ? 0.62 : 0.42 });
    if (depth >= MAX) return;
    const n = depth === 0 ? 3 : rand() < 0.45 ? 3 : 2;
    const spin = rand() * 6.28;
    for (let k = 0; k < n; k++) {
      const perp = new THREE.Vector3().crossVectors(d, jitter()).normalize();
      perp.applyAxisAngle(d, spin + (k / n) * 6.28);
      const cd = d.clone().applyAxisAngle(perp, 0.5 + rand() * 0.45);
      cd.y = cd.y * 0.72 + 0.05; // spread wide rather than tall
      grow(pos, cd.normalize(), len * 0.74, rad * 0.7 * 0.82, depth + 1);
    }
  })(
    new THREE.Vector3(ISLAND.x, islandHeight(ISLAND.x, ISLAND.z) - 0.1, ISLAND.z),
    new THREE.Vector3(-0.22, 1, 0.2).normalize(), // leans gently toward the platform
    2.5,
    0.3,
    0
  );
  const bark = merge(branches.map((g) => paint(g, new THREE.Color(0.34, 0.24, 0.26), 0.1, rand)));
  group.add(new THREE.Mesh(bark, litMaterial({ pattern: 0.5 })));

  // --- blossoms
  const PER = 30;
  const count = tips.length * PER;
  const bpos = new Float32Array(count * 3);
  const bnor = new Float32Array(count * 3);
  const bcol = new Float32Array(count * 3);
  const bsize = new Float32Array(count);
  const box = new THREE.Box3();
  const c = new THREE.Color();
  const PALETTE = [new THREE.Color(1.0, 0.62, 0.78), new THREE.Color(1.0, 0.82, 0.9), new THREE.Color(0.95, 0.45, 0.68), new THREE.Color(1.0, 0.93, 0.96)];
  tips.forEach((tip, ti) => {
    box.expandByPoint(tip.pos);
    for (let k = 0; k < PER; k++) {
      const i = ti * PER + k;
      const o = jitter().add(jitter()).multiplyScalar(tip.r * 1.5);
      o.y *= 0.7;
      bpos.set([tip.pos.x + o.x, tip.pos.y + o.y, tip.pos.z + o.z], i * 3);
      bnor.set([o.x, o.y + tip.r * 0.35, o.z], i * 3);
      c.copy(PALETTE[Math.floor(rand() * PALETTE.length)]).multiplyScalar(0.8 + rand() * 0.3);
      bcol.set([c.r, c.g, c.b], i * 3);
      bsize[i] = 0.07 + rand() * 0.07;
    }
  });
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  bgeo.setAttribute('aN', new THREE.BufferAttribute(bnor, 3));
  bgeo.setAttribute('color', new THREE.BufferAttribute(bcol, 3));
  bgeo.setAttribute('aSize', new THREE.BufferAttribute(bsize, 1));
  const blossoms = new THREE.Points(
    bgeo,
    new THREE.ShaderMaterial({
      vertexColors: true,
      uniforms: { uTime: shared.uTime, uViewH: shared.uViewH, uMoonDir: shared.uMoonDir, uMaxPx: { value: 30 }, uMirror: { value: 1 } },
      vertexShader: BLOSSOM_VERT,
      fragmentShader: BLOSSOM_FRAG,
    })
  );
  blossoms.frustumCulled = false;
  group.add(blossoms);

  // --- falling petals
  const PETALS = 240;
  const ppos = new Float32Array(PETALS * 3);
  const pcol = new Float32Array(PETALS * 3);
  const pseed = new Float32Array(PETALS * 4);
  const bsz = box.getSize(new THREE.Vector3());
  for (let i = 0; i < PETALS; i++) {
    ppos.set([box.min.x + rand() * bsz.x, box.min.y + rand() * bsz.y * 0.7, box.min.z + rand() * bsz.z], i * 3);
    c.copy(PALETTE[i % PALETTE.length]);
    pcol.set([c.r, c.g, c.b], i * 3);
    pseed.set([0.035 + rand() * 0.03, rand(), rand(), 0.045 + rand() * 0.03], i * 4);
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
  pgeo.setAttribute('aSeed', new THREE.BufferAttribute(pseed, 4));
  const petals = new THREE.Points(
    pgeo,
    new THREE.ShaderMaterial({
      vertexColors: true,
      uniforms: { uTime: shared.uTime, uViewH: shared.uViewH, uMaxPx: { value: 12 }, uMirror: { value: 1 } },
      vertexShader: PETAL_VERT,
      fragmentShader: BLOSSOM_FRAG,
    })
  );
  petals.frustumCulled = false;
  group.add(petals);

  // --- a little light caught in the canopy
  const mid = box.getCenter(new THREE.Vector3());
  const glows = [];
  for (let i = 0; i < 7; i++) {
    glows.push({
      pos: new THREE.Vector3(mid.x + (rand() - 0.5) * bsz.x * 0.7, mid.y + (rand() - 0.3) * bsz.y * 0.5, mid.z + (rand() - 0.5) * bsz.z * 0.7),
      size: 1.6 + rand() * 1.2,
      color: new THREE.Color(0.2, 0.09, 0.15),
    });
  }
  group.add(glowSprites(glows));

  // --- rocks: around the island shore and scattered across the lake
  const rocks = [];
  const moonXZ = new THREE.Vector2(MOON_DIR.x, MOON_DIR.z).normalize();
  const place = (x, z, size, sink) => rocks.push(rock(rand, size).translate(x, -size * sink, z));
  for (let i = 0; i < 9; i++) {
    const a = rand() * 6.28;
    const r = ISLAND.r * (0.78 + rand() * 0.3);
    place(ISLAND.x + Math.sin(a) * r, ISLAND.z + Math.cos(a) * r, 0.35 + rand() * 0.6, 0.25);
  }
  for (let i = 0; i < 26; i++) {
    const a = rand() * 6.28;
    const r = 9 + rand() * rand() * 150;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (Math.hypot(x, z) < PLATFORM.r + 3 || islandHeight(x, z) > -1) continue;
    if ((x * moonXZ.x + z * moonXZ.y) / r > 0.95) continue; // keep the moon path clear
    const size = 0.5 + rand() * 1.2 + r * 0.02;
    place(x, z, size, 0.3);
    if (rand() < 0.6) place(x + size * 1.3, z + (rand() - 0.5) * size, size * 0.45, 0.3);
  }
  group.add(new THREE.Mesh(merge(rocks), litMaterial({ pattern: 0.28 })));

  return group;
}
