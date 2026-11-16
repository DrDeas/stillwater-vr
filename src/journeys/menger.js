import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';

// Fractal Passage: an endless flight down the central shaft of a Menger
// sponge. The first two levels of the fractal are real geometry; two finer
// levels are carved into every face by the shader.

const CELL = 18; // metres; the shaft is CELL / 3 wide
const CELLS = 13;
const HALF = (CELL * CELLS) / 2;

function spongeBoxes(level) {
  let boxes = [{ x: 0, y: 0, z: 0, s: 1 }];
  for (let l = 0; l < level; l++) {
    const next = [];
    for (const b of boxes) {
      const s = b.s / 3;
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (let k = -1; k <= 1; k++) {
            if ((i === 0) + (j === 0) + (k === 0) >= 2) continue; // carve the cross
            next.push({ x: b.x + i * s, y: b.y + j * s, z: b.z + k * s, s });
          }
    }
    boxes = next;
  }
  return boxes;
}

const VERT = /* glsl */ `
attribute float aI;
varying vec3 vLocal;
varying vec3 vN;
varying float vZ;
varying float vDist;
${JOURNEY_GLSL}
void main() {
  vLocal = position / ${CELL}.0 + 0.5;
  vN = normal;
  vZ = position.z + wrapZ(aI * ${CELL}.0, ${HALF.toFixed(1)});
  vec4 mv = modelViewMatrix * vec4(position.xy, vZ, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec3 vLocal;
varying vec3 vN;
varying float vZ;
varying float vDist;
${JOURNEY_GLSL}
void main() {
  vec3 an = abs(vN);
  vec2 uv = an.x > 0.5 ? vLocal.yz : (an.y > 0.5 ? vLocal.xz : vLocal.xy);
  // two more levels of the carpet, drawn rather than modelled
  float carve = 0.0;
  vec2 q = uv * 9.0;
  for (int i = 0; i < 2; i++) {
    vec2 f = floor(fract(q) * 3.0);
    if (f.x == 1.0 && f.y == 1.0) { carve = 1.0 - float(i) * 0.45; break; }
    q *= 3.0;
  }
  float track = vZ - uTravel;
  float face = an.y * 0.08 + an.z * 0.16;
  vec3 hue = pal(track * 0.0045 + face + uTime * 0.006);
  float shade = an.x * 0.9 + an.y * 0.6 + an.z * 0.75;
  vec3 col = mix(vec3(0.05, 0.06, 0.13), hue, 0.3) * shade * (0.22 + 0.95 / (1.0 + vDist * 0.07));
  // glowing seams between the blocks, and light inside the carved squares
  vec2 e2 = abs(fract(uv * 9.0) - 0.5);
  float seam = smoothstep(0.468, 0.5, max(e2.x, e2.y));
  col += hue * seam * 0.55;
  vec3 glow = pal(track * 0.0045 + face + 0.5 + uTime * 0.006) * (0.7 + 0.3 * sin(track * 0.35 - uTime * 0.8));
  col = mix(col, glow, carve * 0.85);
  float fog = clamp(1.0 - vDist / ${HALF.toFixed(1)}, 0.0, 1.0);
  gl_FragColor = vec4(col * fog * fog, 1.0);
}
`;

export function createMenger() {
  const boxes = spongeBoxes(2);
  const unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const up = unit.attributes.position.array;
  const un = unit.attributes.normal.array;
  const pos = new Float32Array(boxes.length * up.length);
  const nor = new Float32Array(boxes.length * up.length);
  boxes.forEach((b, bi) => {
    const o = bi * up.length;
    for (let i = 0; i < up.length; i += 3) {
      pos[o + i] = (b.x + up[i] * b.s) * CELL;
      pos[o + i + 1] = (b.y + up[i + 1] * b.s) * CELL;
      pos[o + i + 2] = (b.z + up[i + 2] * b.s) * CELL;
    }
    nor.set(un, o);
  });
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: CELLS }, (_, i) => i), 1));
  geo.instanceCount = CELLS;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { uTravel: journey.uTravel, uTime: journey.uTime },
      vertexShader: VERT,
      fragmentShader: FRAG,
    })
  );
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, speed: 3.5 };
}
