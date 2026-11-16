import * as THREE from 'three';
import { shared } from '../world/common.js';
import { mulberry32 } from '../world/noise.js';

// Shared pieces for the "journey" scenes: endless forward flight through
// geometric and fractal forms.
//
// Nothing actually moves on the CPU. Every journey lays its elements out along
// the z axis and wraps them in the vertex shader as `uTravel` (metres flown)
// grows, so the flight is seamless and costs the same forever. `track` — an
// element's position along the route (z - uTravel) — drives colour and shape,
// so forms keep their identity as they approach and pass.

export const journey = {
  uTravel: { value: 0 },
  uTime: shared.uTime,
  uViewH: shared.uViewH,
  uPx: shared.uPx,
};

export const JOURNEY_GLSL = /* glsl */ `
uniform float uTravel;
uniform float uTime;
vec3 pal(float t) {
  return vec3(0.52, 0.45, 0.62) + vec3(0.48, 0.42, 0.38) * cos(6.28318 * (t + vec3(0.0, 0.18, 0.42)));
}
float wrapZ(float z0, float halfLen) {
  return mod(z0 + uTravel + halfLen, 2.0 * halfLen) - halfLen;
}
float fadeZ(float z, float halfLen) {
  float d = clamp(1.0 - abs(z) / halfLen, 0.0, 1.0);
  return d * d;
}
`;

const DOME_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 tint = vec3(0.52, 0.45, 0.62) + vec3(0.48, 0.42, 0.38) * cos(6.28318 * (uTime * 0.004 + vec3(0.0, 0.18, 0.42)));
  vec3 col = vec3(0.006, 0.008, 0.022) + tint * 0.035 * (1.0 - abs(d.y)) * (0.6 + 0.4 * d.z);
  gl_FragColor = vec4(col, 1.0);
}
`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
uniform float uPx;
uniform float uTime;
varying float vB;
void main() {
  vB = 0.55 + 0.45 * sin(uTime * (0.5 + aSize) + position.x);
  gl_PointSize = aSize * uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const STAR_FRAG = /* glsl */ `
varying float vB;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.0, 1.0, r);
  gl_FragColor = vec4(vec3(0.8, 0.86, 1.0) * a * a * vB, 1.0);
}
`;

/** Deep-space backdrop shared by every journey, plus a still ring at the feet. */
export function createBackdrop() {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.ShaderMaterial({
      uniforms: { uTime: journey.uTime },
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: DOME_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    })
  );
  dome.renderOrder = -20;
  dome.frustumCulled = false;
  group.add(dome);

  const rand = mulberry32(5);
  const COUNT = 2600;
  const pos = new Float32Array(COUNT * 3);
  const size = new Float32Array(COUNT);
  const v = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    do v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
    v.normalize().multiplyScalar(1300);
    pos.set([v.x, v.y, v.z], i * 3);
    size[i] = 1.4 + Math.pow(rand(), 4) * 2.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const stars = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { uTime: journey.uTime, uPx: journey.uPx },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  stars.renderOrder = -15;
  stars.frustumCulled = false;
  group.add(stars);

  // A motionless ring on the floor: a fixed reference that keeps the flight
  // comfortable in a headset.
  const anchor = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 0.97, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  );
  anchor.renderOrder = 8;
  group.add(anchor);

  return { group, anchor };
}
