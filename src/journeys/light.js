import * as THREE from 'three';
import { journey, JOURNEY_GLSL, createMotes, createCore } from './common.js';
import { mulberry32 } from '../world/noise.js';

// Into the Light: a slow, endless approach toward a radiant source. Shafts of
// light and drifting motes stream past, and soft halos open around you.

const HALF = 120;

const STREAK_VERT = /* glsl */ `
attribute vec4 aInst;        // angle, radius, z0, length
varying vec3 vCol;
varying vec2 vUv;
${JOURNEY_GLSL}
void main() {
  vUv = position.xy;
  float z = wrapZ(aInst.z, ${HALF}.0);
  float track = z - uTravel;
  vec2 rad = vec2(cos(aInst.x), sin(aInst.x));
  vec2 tang = vec2(-rad.y, rad.x);
  float width = 0.02 + aInst.y * 0.004;
  vec3 p = vec3(rad * aInst.y + tang * position.x * width, z + position.y * aInst.w);
  vCol = mix(aura(track * 0.003 + aInst.x * 0.05 + uTime * 0.006), vec3(1.0, 0.97, 0.9), 0.45) * fadeZ(z, ${HALF}.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const STREAK_FRAG = /* glsl */ `
varying vec3 vCol;
varying vec2 vUv;
void main() {
  float a = (1.0 - abs(vUv.x)) * (1.0 - vUv.y * vUv.y);
  gl_FragColor = vec4(vCol * a * 0.8, 1.0);
}
`;

const HALO_VERT = /* glsl */ `
attribute float aI;
varying vec3 vCol;
varying vec2 vUv;
${JOURNEY_GLSL}
void main() {
  vUv = position.xy;
  float z = wrapZ(aI * 20.0, ${HALF}.0);
  float track = z - uTravel;
  float r = 9.0 + 2.5 * sin(track * 0.05);
  vCol = aura(track * 0.006 + uTime * 0.006) * fadeZ(z, ${HALF}.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * r, z, 1.0);
}
`;

const HALO_FRAG = /* glsl */ `
varying vec3 vCol;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float d = r - 0.8;
  float a = exp(-d * d * 260.0) * 0.5 + exp(-d * d * 22.0) * 0.1;
  gl_FragColor = vec4(vCol * a * (1.0 - smoothstep(0.92, 1.0, r)), 1.0);
}
`;

const additive = (uniforms, vertexShader, fragmentShader) =>
  new THREE.ShaderMaterial({
    uniforms: { uTravel: journey.uTravel, uTime: journey.uTime, ...uniforms },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

export function createLight() {
  const group = new THREE.Group();
  const rand = mulberry32(8);

  // shafts of light running alongside the path
  const COUNT = 800;
  const inst = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    inst.set([rand() * Math.PI * 2, 2.4 + rand() * rand() * 30, rand() * HALF * 2, 4 + rand() * 9], i * 4);
  }
  const quad = new THREE.PlaneGeometry(2, 2);
  const sgeo = new THREE.InstancedBufferGeometry();
  sgeo.index = quad.index;
  sgeo.setAttribute('position', quad.attributes.position);
  sgeo.setAttribute('aInst', new THREE.InstancedBufferAttribute(inst, 4));
  sgeo.instanceCount = COUNT;
  const streaks = new THREE.Mesh(sgeo, additive({}, STREAK_VERT, STREAK_FRAG));
  streaks.frustumCulled = false;
  group.add(streaks);

  // halos you pass through
  const HALOS = Math.round((HALF * 2) / 20);
  const hgeo = new THREE.InstancedBufferGeometry();
  hgeo.index = quad.index;
  hgeo.setAttribute('position', quad.attributes.position);
  hgeo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: HALOS }, (_, i) => i), 1));
  hgeo.instanceCount = HALOS;
  const halos = new THREE.Mesh(hgeo, additive({}, HALO_VERT, HALO_FRAG));
  halos.frustumCulled = false;
  group.add(halos);

  group.add(createMotes({ count: 5000, half: HALF, inner: 1.5, outer: 35, seed: 3 }));
  group.add(createCore({ size: 85, intensity: 1.25 }));
  return { group, speed: 5 };
}
