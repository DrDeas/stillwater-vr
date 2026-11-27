import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';

// Open scenes built from flat sheets rather than a tube.

const HALF = 140;
const material = (vertexShader, fragmentShader, extra = {}) =>
  new THREE.ShaderMaterial({ uniforms: { uTravel: journey.uTravel, uTime: journey.uTime }, vertexShader, fragmentShader, ...extra });

// ---------------------------------------------------------------------------
// Neon Horizon: a glowing grid rolling over a valley toward a striped sun.
// ---------------------------------------------------------------------------

const GRID_VERT = /* glsl */ `
varying vec3 vP;       // x, height above the valley floor, z
varying float vTrack;
${JOURNEY_GLSL}
void main() {
  float track = position.z - uTravel;
  float x = position.x;
  float rise = smoothstep(5.0, 42.0, abs(x));
  float h = rise * (7.0 + 5.0 * sin(x * 0.13 + track * 0.07) * sin(track * 0.11 + x * 0.05) + 3.0 * sin(x * 0.31 + track * 0.23));
  vP = vec3(x, h, position.z);
  vTrack = track;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(x, -2.2 + h, position.z, 1.0);
}
`;

const GRID_FRAG = /* glsl */ `
varying vec3 vP;
varying float vTrack;
${JOURNEY_GLSL}
void main() {
  float far = length(vP.xz);
  vec2 g = abs(fract(vec2(vP.x, vTrack) * 0.4) - 0.5);
  float w = 0.03 + far * 0.0022;
  float line = smoothstep(0.5 - w, 0.5, max(g.x, g.y));
  float lift = clamp(vP.y / 14.0, 0.0, 1.0);
  vec3 hot = mix(vec3(1.0, 0.15, 0.75), vec3(0.2, 0.9, 1.0), lift + 0.25 * sin(uTime * 0.1));
  vec3 col = hot * line * (0.7 + 0.3 * sin(vTrack * 0.3 - uTime * 1.2)) + vec3(0.07, 0.01, 0.13) * (0.4 + lift);
  gl_FragColor = vec4(col * fadeZ(vP.z, ${HALF}.0) * (1.0 - smoothstep(60.0, 120.0, abs(vP.x))), 1.0);
}
`;

const SUN_FRAG = /* glsl */ `
varying vec2 vUv;
${JOURNEY_GLSL}
void main() {
  float r = length(vUv);
  float disc = 1.0 - smoothstep(0.60, 0.61, r);
  // slits that widen toward the bottom of the disc
  float y = vUv.y / 0.6;
  float slit = y > 0.15 ? 1.0 : smoothstep(0.0, 0.05, abs(fract(y * 6.0 + uTime * 0.05) - 0.5) - 0.12 * (0.2 - y) * 2.2);
  vec3 body = mix(vec3(1.0, 0.25, 0.65), vec3(1.0, 0.85, 0.3), smoothstep(-0.6, 0.6, vUv.y));
  vec3 col = body * disc * slit + vec3(1.0, 0.35, 0.6) * exp(-max(r - 0.6, 0.0) * 6.0) * 0.35 * (1.0 - disc);
  gl_FragColor = vec4(col * (1.0 - smoothstep(0.9, 1.0, r)), 1.0);
}
`;

export function createNeon() {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(240, HALF * 2, 110, 150).rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(geo, material(GRID_VERT, GRID_FRAG));
  ground.frustumCulled = false;
  group.add(ground);

  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    material('varying vec2 vUv; void main() { vUv = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', SUN_FRAG, {
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  sun.scale.setScalar(46);
  sun.position.set(0, 13, -HALF + 4);
  sun.frustumCulled = false;
  sun.renderOrder = -5;
  group.add(sun);
  return { group, speed: 6 };
}

// ---------------------------------------------------------------------------
// Slit-Scan Gate: four walls of streaming colour meeting at a vanishing point.
// ---------------------------------------------------------------------------

const SLIT_VERT = /* glsl */ `
attribute vec2 aWall;       // cross-wall coordinate, wall number
varying vec2 vWall;
varying float vZ;
void main() {
  vWall = aWall;
  vZ = position.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SLIT_FRAG = /* glsl */ `
varying vec2 vWall;
varying float vZ;
${JOURNEY_GLSL}
void main() {
  float track = vZ - uTravel;
  // mirror each wall about its centre line, as in a kaleidoscope
  float rowPos = abs(vWall.x) * 2.2;
  float row = floor(rowPos);
  float h = hash11(row + mod(floor(vWall.y + 0.5), 2.0) * 31.0);   // round: the wall number is interpolated
  float n = sin(track * (0.11 + h * 0.2) + h * 40.0 + uTime * 0.1) * sin(track * (0.037 + h * 0.05) + h * 17.0);
  float streak = smoothstep(-0.25, 0.85, n);
  float blur = smoothstep(25.0, 95.0, abs(vZ));
  float soft = mix(1.0 - abs(fract(rowPos) - 0.5) * 1.5, 0.62, blur);
  vec3 near = pal(h + track * 0.004 + uTime * 0.02) * streak;
  vec3 distant = pal(track * 0.004 + uTime * 0.02 + 0.3 * sin(rowPos * 0.7)) * 0.45;
  vec3 col = mix(near, distant, blur) * soft * 1.5;
  gl_FragColor = vec4(col * fadeZ(vZ, ${HALF}.0), 1.0);
}
`;

export function createSlit() {
  const W = 7; // half-width of the square passage
  const pos = [];
  const wall = [];
  const idx = [];
  // each wall: a long strip, its cross coordinate running -W..W
  const walls = [
    (c) => [-W, c], // left
    (c) => [W, c], // right
    (c) => [c, -W], // floor
    (c) => [c, W], // ceiling
  ];
  walls.forEach((at, n) => {
    const o = pos.length / 3;
    for (const c of [-W, W])
      for (const z of [-HALF, HALF]) {
        pos.push(...at(c), z);
        wall.push(c, n);
      }
    idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aWall', new THREE.Float32BufferAttribute(wall, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material(SLIT_VERT, SLIT_FRAG, { side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, speed: 7 };
}

// ---------------------------------------------------------------------------
// Wormhole: a tube of light that snakes away ahead of you, swelling and narrowing.
// ---------------------------------------------------------------------------

const WORM_VERT = /* glsl */ `
varying float vZ;
varying vec2 vXY;
${JOURNEY_GLSL}
vec2 off(float tr) { return vec2(sin(tr * 0.031) * 7.0 + sin(tr * 0.013) * 5.0, cos(tr * 0.024) * 6.0 + sin(tr * 0.017) * 3.0); }
void main() {
  float z = position.z;
  float track = z - uTravel;
  // the tube is straight where you are and bends away with distance
  vec2 c = (off(track) - off(-uTravel)) * (z * z / (z * z + 500.0));
  float R = 5.0 + 1.1 * sin(track * 0.09);
  vZ = z;
  vXY = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * R + c, z, 1.0);
}
`;

const WORM_FRAG = /* glsl */ `
varying float vZ;
varying vec2 vXY;
${JOURNEY_GLSL}
void main() {
  float vA = atan(vXY.y, vXY.x);
  float track = vZ - uTravel;
  float far = abs(vZ);
  float w = 0.05 + far * 0.004;
  float ring = smoothstep(0.5 - w, 0.5, abs(fract(track * 0.5) - 0.5));
  float rib = smoothstep(0.5 - w * 0.6, 0.5, abs(fract(vA / 6.28318 * 24.0) - 0.5));
  vec3 hue = pal(track * 0.006 + uTime * 0.012);
  float swirl = 0.5 + 0.5 * sin(3.0 * vA + track * 0.25 + 2.0 * sin(track * 0.07 + uTime * 0.2));
  vec3 col = hue * max(ring, rib) * (0.65 + 0.35 * sin(track * 0.4 - uTime * 1.4));
  col += pal(track * 0.006 + 0.45 + uTime * 0.012) * swirl * swirl * 0.16;
  gl_FragColor = vec4(col * fadeZ(vZ, ${HALF}.0), 1.0);
}
`;

export function createWormhole() {
  const geo = new THREE.CylinderGeometry(1, 1, HALF * 2, 64, 220, true).rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material(WORM_VERT, WORM_FRAG, { side: THREE.BackSide }));
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, speed: 5 };
}
