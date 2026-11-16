import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';

// Kaleido Vortex: a tunnel whose walls are a living fractal. The pattern is an
// iterated fold-and-invert map, mirrored into a kaleidoscope around the axis,
// and its parameters drift so it never settles into the same form twice.

const HALF = 120;
const RADIUS = 6;

const VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec3 vPos;
${JOURNEY_GLSL}
void main() {
  float track = vPos.z - uTravel;
  float a = atan(vPos.y, vPos.x);
  float seg = 6.28318 / 8.0;
  float fa = abs(mod(a, seg) - seg * 0.5);            // mirror into 8 wedges
  float tz = abs(mod(track, 28.0) - 14.0);             // mirror along the route
  vec2 p = vec2(fa * 2.3 + 0.12, tz * 0.085 + 0.1);
  vec2 c = vec2(0.62 + 0.10 * sin(uTime * 0.031), 0.52 + 0.10 * cos(uTime * 0.023));
  float av = 0.0;
  float prev = 0.0;
  for (int i = 0; i < 6; i++) {
    p = abs(p) / (dot(p, p) + 1e-4) - c;
    float l = length(p);
    av += exp(-2.2 * abs(l - prev));
    prev = l;
  }
  av /= 6.0;
  vec3 col = pal(av * 1.4 + track * 0.004 + uTime * 0.012) * pow(av, 1.25) * 2.0;
  col += vec3(1.0, 0.95, 0.9) * pow(av, 7.0) * 0.9;     // bright filaments
  gl_FragColor = vec4(col * fadeZ(vPos.z, ${HALF}.0), 1.0);
}
`;

export function createKaleido() {
  const geo = new THREE.CylinderGeometry(RADIUS, RADIUS, HALF * 2, 96, 1, true).rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { uTravel: journey.uTravel, uTime: journey.uTime },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
    })
  );
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, speed: 4 };
}
