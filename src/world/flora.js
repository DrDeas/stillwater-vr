import * as THREE from 'three';
import { litMaterial, merge, paint, glowSprites, shared } from './common.js';
import { mulberry32 } from './noise.js';
import { PLATFORM, ISLAND, islandHeight } from './terrain.js';

// Floating lotus flowers, lily pads and fireflies.

function lotusGeometry() {
  const parts = [];
  const base = new THREE.Color(1.0, 0.9, 0.95);
  const tip = new THREE.Color(1.0, 0.5, 0.72);
  const ring = (count, len, width, tilt, offset) => {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + offset;
      // one petal: a kite cupped along its length
      const v = [
        [0, 0, 0.02],
        [-width, 0.02, len * 0.5],
        [width, 0.02, len * 0.5],
        [0, 0.05, len],
      ];
      const tri = [0, 2, 1, 1, 2, 3];
      const pos = new Float32Array(18);
      const col = new Float32Array(18);
      tri.forEach((vi, n) => {
        pos.set(v[vi], n * 3);
        const cc = base.clone().lerp(tip, v[vi][2] / len);
        col.set([cc.r, cc.g, cc.b], n * 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      g.rotateX(-tilt).rotateY(a).translate(0, 0.03, 0);
      parts.push(g);
    }
  };
  ring(9, 0.22, 0.062, 0.3, 0);
  ring(7, 0.18, 0.055, 0.8, 0.4);
  ring(5, 0.13, 0.045, 1.25, 0.9);
  parts.push(paint(new THREE.ConeGeometry(0.035, 0.07, 8).translate(0, 0.065, 0), new THREE.Color(1.0, 0.85, 0.35)));
  return merge(parts);
}

const FIREFLY_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uViewH;
varying float vGlow;
void main() {
  float t = uTime * (0.25 + aSeed.w * 0.25);
  vec3 p = position + vec3(
    sin(t * 1.3 + aSeed.x * 6.28) + sin(t * 0.47 + aSeed.y * 6.28) * 1.6,
    sin(t * 0.9 + aSeed.z * 6.28) * 0.45,
    cos(t * 1.1 + aSeed.y * 6.28) + cos(t * 0.38 + aSeed.x * 6.28) * 1.6) * 0.8;
  p.y = max(p.y, 0.12);
  vGlow = smoothstep(-0.2, 1.0, sin(uTime * (0.6 + aSeed.z) + aSeed.w * 40.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(0.11 * uViewH * 0.5 * projectionMatrix[1][1] / -mv.z, 1.5, 40.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FIREFLY_FRAG = /* glsl */ `
varying float vGlow;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-r * r * 5.0) * 0.7 + exp(-r * r * 40.0);
  a *= (1.0 - smoothstep(0.7, 1.0, r)) * vGlow;
  gl_FragColor = vec4(vec3(0.85, 1.0, 0.42) * a, 1.0);
}
`;

export function createFlora() {
  const group = new THREE.Group();
  group.name = 'flora';
  const rand = mulberry32(99);
  const free = (x, z, margin = 0.6) => Math.hypot(x, z) > PLATFORM.r + margin + 0.4 && islandHeight(x, z) < -0.5;

  // --- lotus clusters, each with a few pads
  const flowers = [];
  const pads = [];
  let guard = 0;
  while (flowers.length < 26 && guard++ < 500) {
    const a = rand() * 6.28;
    const r = 4.6 + rand() * rand() * 30;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (!free(x, z)) continue;
    flowers.push({ x, z, s: 1.1 + rand() * 0.9, rot: rand() * 6.28 });
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const pa = rand() * 6.28;
      const pr = 0.45 + rand() * 0.9;
      const px = x + Math.sin(pa) * pr;
      const pz = z + Math.cos(pa) * pr;
      if (free(px, pz, 0.3)) pads.push({ x: px, z: pz, s: 0.7 + rand() * 0.9, rot: rand() * 6.28 });
    }
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const fill = (mesh, items, y) => {
    items.forEach((it, i) => {
      q.setFromAxisAngle(yAxis, it.rot);
      m4.compose(new THREE.Vector3(it.x, y, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
      mesh.setMatrixAt(i, m4);
    });
    mesh.frustumCulled = false;
    return mesh;
  };
  const lotus = new THREE.InstancedMesh(lotusGeometry(), litMaterial({ emissive: 0.42, pattern: 0, side: THREE.DoubleSide }), flowers.length);
  group.add(fill(lotus, flowers, 0.01));

  const padGeo = paint(
    new THREE.CircleGeometry(0.3, 16, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2),
    new THREE.Color(0.1, 0.3, 0.19)
  );
  const padMesh = new THREE.InstancedMesh(padGeo, litMaterial({ pattern: 0.3 }), pads.length);
  group.add(fill(padMesh, pads, 0.012));

  group.add(
    glowSprites(
      flowers.map((f) => ({
        pos: new THREE.Vector3(f.x, 0.12, f.z),
        size: 0.55 * f.s,
        color: new THREE.Color(0.3, 0.13, 0.2),
      }))
    )
  );

  // --- fireflies
  const COUNT = 170;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    let x, z, y;
    const a = rand() * 6.28;
    if (i < 60) {
      const r = PLATFORM.r + 0.5 + rand() * 9;
      x = Math.sin(a) * r; z = Math.cos(a) * r; y = 0.5 + rand() * 1.8;
    } else if (i < 120) {
      const r = rand() * (ISLAND.r + 2);
      x = ISLAND.x + Math.sin(a) * r; z = ISLAND.z + Math.cos(a) * r; y = 1.2 + rand() * 3.5;
    } else {
      const r = 12 + rand() * 30;
      x = Math.sin(a) * r; z = Math.cos(a) * r; y = 0.5 + rand() * 2.5;
    }
    pos.set([x, y, z], i * 3);
    seed.set([rand(), rand(), rand(), rand()], i * 4);
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  fgeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const flies = new THREE.Points(
    fgeo,
    new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uViewH: shared.uViewH },
      vertexShader: FIREFLY_VERT,
      fragmentShader: FIREFLY_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  flies.frustumCulled = false;
  flies.renderOrder = 3;
  group.add(flies);

  return group;
}
