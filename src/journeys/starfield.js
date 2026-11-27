import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';
import { mulberry32 } from '../world/noise.js';

// Starfield: the classic screensaver, in real depth. Plain white stars drift
// toward you out of the dark, growing larger and brighter as they near, then
// slip past on every side. Nothing else: no colour, no shapes, just stars.

const HALF = 160; // stars appear this far ahead and fade this far behind
const RADIUS = 48; // how far the field spreads around the path
const CLEAR = 1.6; // nothing passes closer than this to your head
const COUNT = 3200;

const VERT = /* glsl */ `
attribute vec2 aData;        // relative size, warmth
uniform float uViewH;
varying vec3 vCol;
${JOURNEY_GLSL}
void main() {
  float z = wrapZ(position.z, ${HALF}.0);
  vec4 mv = modelViewMatrix * vec4(position.xy, z, 1.0);
  float dist = length(mv.xyz);
  // as in the original: the nearer the star, the brighter it is
  float near = clamp(1.0 - dist / ${HALF}.0, 0.0, 1.0);
  float bright = min(1.0, 0.12 + near * 1.5);
  // almost white, with the faintest warm or cool cast so the field feels alive
  vec3 tint = mix(vec3(0.82, 0.90, 1.0), vec3(1.0, 0.94, 0.86), aData.y);
  vCol = mix(tint, vec3(1.0), 0.55) * bright;
  // ...and the larger: a dot that swells with nearness (the screensaver's rule),
  // or its true perspective size once it is close enough for that to be bigger
  float px = uViewH / 720.0;
  float grown = (1.5 + 6.5 * near * near * aData.x) * px;
  float real = 0.09 * aData.x * uViewH * 0.5 * projectionMatrix[1][1] / max(-mv.z, 0.1);
  gl_PointSize = clamp(max(grown, real), 1.5 * px, 30.0 * px);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, r));        // a soft round dot
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;

export function createStarfield() {
  const rand = mulberry32(1987);
  const pos = new Float32Array(COUNT * 3);
  const data = new Float32Array(COUNT * 2);
  for (let i = 0; i < COUNT; i++) {
    // even density across the field, apart from a clear lane down the middle
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(CLEAR * CLEAR + rand() * (RADIUS * RADIUS - CLEAR * CLEAR));
    pos.set([Math.cos(a) * r, Math.sin(a) * r, rand() * HALF * 2], i * 3);
    data.set([0.6 + rand() * 0.9, rand()], i * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(data, 2));
  const stars = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { uTravel: journey.uTravel, uTime: journey.uTime, uViewH: journey.uViewH },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  stars.frustumCulled = false;
  const group = new THREE.Group();
  group.add(stars);
  return { group, speed: 7 };
}
