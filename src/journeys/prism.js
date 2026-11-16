import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';

// Prism Gates: nested rings of glowing polygons that twist against each other
// as you pass through them, like a slowly turning kaleidoscope with depth.

const HALF = 120;

const VERT = /* glsl */ `
attribute float aI;
uniform float uSpacing;
uniform float uRadius;
uniform float uTwist;
uniform float uPhase;
varying vec3 vCol;
${JOURNEY_GLSL}
void main() {
  float z = wrapZ(aI * uSpacing, ${HALF}.0);
  float track = z - uTravel;
  float ang = track * uTwist + uPhase + 0.7 * sin(track * 0.021 + uTime * 0.05 + uPhase);
  float r = uRadius * (1.0 + 0.22 * sin(track * 0.045 + uTime * 0.11 + uPhase * 2.0));
  float c = cos(ang), s = sin(ang);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * r;
  float pulse = 0.75 + 0.25 * sin(track * 0.26 - uTime * 0.9);
  vCol = pal(track * 0.0065 + uPhase * 0.11 + uTime * 0.008) * fadeZ(z, ${HALF}.0) * pulse;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, z, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec3 vCol;
void main() { gl_FragColor = vec4(vCol, 1.0); }
`;

const LAYERS = [
  { sides: 6, radius: 3.1, spacing: 2.4, twist: 0.06, phase: 0.0, width: 0.035 },
  { sides: 3, radius: 5.6, spacing: 2.4, twist: -0.045, phase: 1.3, width: 0.03 },
  { sides: 4, radius: 9.0, spacing: 4.8, twist: 0.03, phase: 2.9, width: 0.028 },
  { sides: 12, radius: 16.0, spacing: 9.6, twist: -0.02, phase: 4.1, width: 0.022 },
];

export function createPrism() {
  const group = new THREE.Group();
  for (const L of LAYERS) {
    const base = new THREE.RingGeometry(1 - L.width, 1, L.sides, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    const count = Math.round((HALF * 2) / L.spacing);
    geo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i), 1));
    geo.instanceCount = count;
    const mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: {
          uTravel: journey.uTravel,
          uTime: journey.uTime,
          uSpacing: { value: L.spacing },
          uRadius: { value: L.radius },
          uTwist: { value: L.twist },
          uPhase: { value: L.phase },
        },
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
  }
  return { group, speed: 5 };
}
