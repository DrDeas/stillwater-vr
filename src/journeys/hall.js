import * as THREE from 'three';
import { journey, JOURNEY_GLSL, createMotes, createCore } from './common.js';
import { merge } from '../world/common.js';

// Hall of Light: an endless vaulted nave drawn in luminous ribs, mirrored in a
// polished floor, with shafts of light falling across the way.

const BAY = 9; // metres between arches
const BAYS = 26;
const HALF = (BAY * BAYS) / 2;
const FLOOR = -1.6;
const X = 5; // half width
const SPRING = 4.5; // where the arches spring from the pillars
const APEX = 10.5;

const RIB_VERT = /* glsl */ `
attribute float aI;
uniform float uFlip;
varying float vZ;
varying float vY;
varying float vDist;
${JOURNEY_GLSL}
void main() {
  vY = position.y;
  float y = uFlip > 0.0 ? position.y : 2.0 * ${FLOOR.toFixed(1)} - position.y;   // floor reflection
  vZ = position.z + wrapZ(aI * ${BAY}.0, ${HALF.toFixed(1)});
  vec4 mv = modelViewMatrix * vec4(position.x, y, vZ, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const RIB_FRAG = /* glsl */ `
uniform float uDim;
varying float vZ;
varying float vY;
varying float vDist;
${JOURNEY_GLSL}
void main() {
  float track = vZ - uTravel;
  float h = clamp((vY - ${FLOOR.toFixed(1)}) / ${(APEX - FLOOR).toFixed(1)}, 0.0, 1.0);
  vec3 col = mix(aura(track * 0.0035 + h * 0.25 + uTime * 0.005), vec3(1.0, 0.96, 0.88), h * 0.55);
  col *= 0.6 + 0.4 * sin(track * 0.2 - uTime * 0.6 + h * 3.0);
  float fog = clamp(1.0 - vDist / ${HALF.toFixed(1)}, 0.0, 1.0);
  gl_FragColor = vec4(col * fog * fog * uDim, 1.0);
}
`;

// Tall windows of coloured light set into each wall arch.
const GLASS_VERT = /* glsl */ `
attribute float aI;
varying vec2 vUv;
varying vec3 vCol;
${JOURNEY_GLSL}
void main() {
  vUv = uv;
  float side = mod(aI, 2.0) < 0.5 ? 1.0 : -1.0;
  float bay = floor(aI / 2.0);
  float z = wrapZ(bay * ${BAY}.0, ${HALF.toFixed(1)});
  float track = z - uTravel;
  vec3 p = vec3(side * ${X}.0, mix(${FLOOR.toFixed(1)}, 7.25, uv.y), z - uv.x * ${BAY}.0);
  vCol = aura(track * 0.02 + side * 0.12 + uTime * 0.01) * fadeZ(z, ${HALF.toFixed(1)});
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const GLASS_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float x = vUv.x * 2.0 - 1.0;
  float top = (${(SPRING - FLOOR).toFixed(2)} + ${(7.25 - SPRING).toFixed(2)} * (1.0 - x * x)) / ${(7.25 - FLOOR).toFixed(2)};   // arch outline
  float inside = (1.0 - smoothstep(top - 0.02, top, vUv.y)) * (1.0 - smoothstep(0.86, 0.97, abs(x)));
  float lead = 0.55 + 0.45 * smoothstep(0.02, 0.06, abs(fract(vUv.x * 3.0) - 0.5)) * smoothstep(0.02, 0.05, abs(fract(vUv.y * 5.0) - 0.5));
  float a = inside * lead * (0.10 + 0.34 * vUv.y * vUv.y);
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;

const SHAFT_VERT = /* glsl */ `
attribute float aI;
varying vec2 vUv;
varying float vFade;
${JOURNEY_GLSL}
void main() {
  vUv = uv;
  float side = mod(aI, 2.0) < 0.5 ? 1.0 : -1.0;
  float z = wrapZ(aI * ${BAY}.0 + ${BAY / 2}, ${HALF.toFixed(1)});
  vec3 top = vec3(side * ${X}.0, 7.6, z + (uv.x - 0.5) * 3.2);
  vec3 foot = vec3(-side * 1.2, ${FLOOR.toFixed(1)}, z + (uv.x - 0.5) * 4.4 + 2.0);
  vFade = fadeZ(z, ${HALF.toFixed(1)});
  gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(top, foot, uv.y), 1.0);
}
`;

const SHAFT_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vFade;
void main() {
  float a = sin(3.14159 * vUv.x);
  a = a * a * (1.0 - vUv.y * 0.6) * 0.2;
  gl_FragColor = vec4(vec3(1.0, 0.9, 0.68) * a * vFade, 1.0);
}
`;

function bayGeometry() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tube = (curve, segs = 14, r = 0.085) => new THREE.TubeGeometry(curve, segs, r, 5, false);
  const line = (a, b, r) => tube(new THREE.LineCurve3(a, b), 1, r);
  const arc = (a, c, b) => tube(new THREE.QuadraticBezierCurve3(a, c, b));
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(line(V(s * X, FLOOR, 0), V(s * X, SPRING, 0), 0.14)); // pillar
    parts.push(arc(V(s * X, SPRING, 0), V(s * X * 0.92, 9.4, 0), V(0, APEX, 0))); // pointed arch
    parts.push(arc(V(s * X, SPRING, 0), V(0, 2 * APEX - SPRING, -BAY / 2), V(-s * X, SPRING, -BAY))); // vault diagonal
    parts.push(arc(V(s * X, SPRING, 0), V(s * X, 10, -BAY / 2), V(s * X, SPRING, -BAY))); // window arch
    parts.push(line(V(s * X, FLOOR, 0), V(s * X, FLOOR, -BAY), 0.04)); // floor edge
  }
  parts.push(line(V(0, APEX, 0), V(0, APEX, -BAY), 0.04)); // ridge
  parts.push(line(V(-X, FLOOR, 0), V(X, FLOOR, 0), 0.03)); // threshold
  return merge(parts);
}

export function createHall() {
  const group = new THREE.Group();
  const bay = bayGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', bay.attributes.position);
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: BAYS }, (_, i) => i), 1));
  geo.instanceCount = BAYS;
  for (const [flip, dim] of [[1, 1.15], [-1, 0.4]]) {
    const mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uTravel: journey.uTravel, uTime: journey.uTime, uFlip: { value: flip }, uDim: { value: dim } },
        vertexShader: RIB_VERT,
        fragmentShader: RIB_FRAG,
        side: THREE.DoubleSide,
      })
    );
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  const quad = new THREE.PlaneGeometry(1, 1);
  const sgeo = new THREE.InstancedBufferGeometry();
  sgeo.index = quad.index;
  sgeo.setAttribute('position', quad.attributes.position);
  sgeo.setAttribute('uv', quad.attributes.uv);
  sgeo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: BAYS }, (_, i) => i), 1));
  sgeo.instanceCount = BAYS;
  const shafts = new THREE.Mesh(
    sgeo,
    new THREE.ShaderMaterial({
      uniforms: { uTravel: journey.uTravel, uTime: journey.uTime },
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  shafts.frustumCulled = false;
  shafts.renderOrder = 1;
  group.add(shafts);

  const ggeo = new THREE.InstancedBufferGeometry();
  ggeo.index = quad.index;
  ggeo.setAttribute('position', quad.attributes.position);
  ggeo.setAttribute('uv', quad.attributes.uv);
  ggeo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: BAYS * 2 }, (_, i) => i), 1));
  ggeo.instanceCount = BAYS * 2;
  const glass = new THREE.Mesh(
    ggeo,
    new THREE.ShaderMaterial({
      uniforms: { uTravel: journey.uTravel, uTime: journey.uTime },
      vertexShader: GLASS_VERT,
      fragmentShader: GLASS_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glass.frustumCulled = false;
  group.add(glass);

  group.add(createMotes({ count: 1800, half: HALF, inner: 0.8, outer: 4.6, seed: 17, size: 0.05 }));
  const core = createCore({ z: -HALF + 6, size: 30, intensity: 0.9, hue: 0.05 });
  core.position.y = 3.2;
  group.add(core);
  return { group, speed: 3 };
}
