import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';
import { mulberry32 } from '../world/noise.js';

// Spiral Drift: luminous arms of particles coil around the flight path while
// scattered motes stream past on every side.

const HALF = 120;
const ARMS = 6;

const VERT = /* glsl */ `
attribute vec4 aData;        // angle offset, radius, size, arm (-1 = free mote)
uniform float uViewH;
varying vec3 vCol;
${JOURNEY_GLSL}
void main() {
  float z = wrapZ(position.z, ${HALF}.0);
  float track = z - uTravel;
  vec3 p;
  float hue;
  if (aData.w < 0.0) {
    p = vec3(position.xy, z);
    hue = track * 0.004 + aData.x;
  } else {
    float ang = track * 0.085 + aData.x + 0.8 * sin(track * 0.013 + uTime * 0.04);
    float r = aData.y * (1.0 + 0.28 * sin(track * 0.04 + uTime * 0.07));
    p = vec3(cos(ang) * r, sin(ang) * r, z);
    hue = aData.w / ${ARMS}.0 * 0.5 + track * 0.005;
  }
  float twinkle = 0.7 + 0.3 * sin(uTime * 1.3 + position.z * 3.1 + aData.x * 7.0);
  vCol = mix(pal(hue + uTime * 0.01), vec3(1.0), 0.25) * sqrt(fadeZ(z, ${HALF}.0)) * twinkle * 1.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aData.z * uViewH * 0.5 * projectionMatrix[1][1] / -mv.z, 1.6, 36.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.7, 1.0, r));
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;

export function createSpiral() {
  const rand = mulberry32(42);
  const gauss = () => rand() + rand() + rand() - 1.5;
  const ARM_POINTS = 24000;
  const MOTES = 5000;
  const n = ARM_POINTS + MOTES;
  const pos = new Float32Array(n * 3);
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const z = rand() * HALF * 2;
    if (i < ARM_POINTS) {
      const arm = i % ARMS;
      pos.set([0, 0, z], i * 3);
      data.set([(arm / ARMS) * Math.PI * 2 + gauss() * 0.2, 3.4 + gauss() * 0.5 + (arm % 2) * 2.4, 0.09 + rand() * 0.16, arm], i * 4);
    } else {
      const a = rand() * Math.PI * 2;
      const r = 7 + rand() * rand() * 45;
      pos.set([Math.cos(a) * r, Math.sin(a) * r, z], i * 3);
      data.set([rand(), 0, 0.12 + rand() * 0.22, -1], i * 4);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  const points = new THREE.Points(
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
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(points);
  return { group, speed: 6 };
}
