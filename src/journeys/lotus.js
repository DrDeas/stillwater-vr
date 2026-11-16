import * as THREE from 'three';
import { journey, JOURNEY_GLSL, createMotes, createCore } from './common.js';

// Lotus Mandala: great flowers of light hang along the path. Each one is a bud
// in the distance and opens, ring by ring, as you arrive and pass through it.

const HALF = 120;
const SPACING = 12;
const RINGS = [8, 12, 16]; // petals per ring, inner to outer

const VERT = /* glsl */ `
attribute vec3 aInst;        // gate, petal angle, ring
varying vec3 vCol;
varying vec2 vUv;
${JOURNEY_GLSL}
void main() {
  vUv = uv;
  float ring = aInst.z;
  float R = ring < 0.5 ? 2.3 : (ring < 1.5 ? 4.2 : 7.0);
  float LEN = ring < 0.5 ? 2.4 : (ring < 1.5 ? 3.3 : 4.8);
  float z = wrapZ(aInst.x * ${SPACING}.0 + ring * 1.3, ${HALF}.0);
  float track = z - uTravel;
  float open = smoothstep(-100.0, -6.0, z - ring * 6.0);          // inner rings open first
  float tilt = mix(1.38, 0.1, open) + 0.06 * sin(uTime * 0.5 + aInst.x + ring);
  float dir = ring > 0.5 && ring < 1.5 ? -1.0 : 1.0;
  float ang = aInst.y + dir * track * 0.012 + ring * 0.39;
  vec2 rad = vec2(cos(ang), sin(ang));
  vec2 tang = vec2(-rad.y, rad.x);
  float along = position.y * LEN;
  vec3 p = vec3(rad * (R * mix(0.5, 1.0, open) + along * cos(tilt)) + tang * position.x * LEN, z + along * sin(tilt));
  vCol = aura(track * 0.011 + ring * 0.17 + uTime * 0.008) * fadeZ(z, ${HALF}.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec3 vCol;
varying vec2 vUv;
void main() {
  float x = abs(vUv.x);
  float body = 0.10 + 0.55 * pow(x, 3.0) + 0.22 * vUv.y;
  float vein = exp(-x * x * 70.0) * 0.22;
  vec3 col = mix(vCol, vec3(1.0, 0.97, 0.92), vUv.y * 0.55);
  gl_FragColor = vec4(col * (body + vein), 1.0);
}
`;

function petalGeometry() {
  const S = 10;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let s = 0; s <= S; s++) {
    const t = s / S;
    const w = 0.26 * Math.sin(Math.PI * Math.pow(t, 0.72));
    for (const side of [-1, 0, 1]) {
      pos.push(side * w, t, 0);
      uv.push(side, t);
    }
    if (s < S) {
      const a = s * 3;
      idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function createLotus() {
  const group = new THREE.Group();
  const gates = Math.round((HALF * 2) / SPACING);
  const inst = [];
  for (let g = 0; g < gates; g++)
    RINGS.forEach((n, ring) => {
      for (let k = 0; k < n; k++) inst.push(g, (k / n) * Math.PI * 2, ring);
    });
  const petal = petalGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = petal.index;
  geo.setAttribute('position', petal.attributes.position);
  geo.setAttribute('uv', petal.attributes.uv);
  geo.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(inst), 3));
  geo.instanceCount = inst.length / 3;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { uTravel: journey.uTravel, uTime: journey.uTime },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  mesh.frustumCulled = false;
  group.add(mesh);
  group.add(createMotes({ count: 2500, half: HALF, inner: 1.5, outer: 30, seed: 11, size: 0.1 }));
  group.add(createCore({ size: 45, intensity: 0.8, hue: 0.2 }));
  return { group, speed: 3.5 };
}
