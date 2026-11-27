import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';
import { mulberry32 } from '../world/noise.js';

// Glyph Rain: the falling-code screensaver, in depth. Instead of one flat
// sheet of characters, a whole forest of columns stands around the path; in
// each one bright heads run downward leaving fading trails of flickering
// glyphs, and you drift forward between them.

const HALF = 120;
const SPREAD = 46; // how far the columns extend to either side
const LANE = 1.8; // nothing stands closer than this to the path
const COUNT = 1300;
const HEIGHT = 46; // metres, centred on eye level: rain above and below
const CELL = 0.62; // size of one glyph
const ROWS = Math.round(HEIGHT / CELL);

// katakana, Latin capitals and digits
const ALPHABET =
  'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  '0123456789';
const ATLAS_COLS = 16;
const ATLAS_ROWS = Math.ceil(ALPHABET.length / ATLAS_COLS);

/** Every glyph drawn once into a grid, white on black. */
function glyphAtlas() {
  const PX = 64;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * PX;
  canvas.height = ATLAS_ROWS * PX;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${PX * 0.72}px "Noto Sans Mono CJK JP", "Noto Sans CJK JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", "MS Gothic", monospace`;
  [...ALPHABET].forEach((ch, i) => {
    g.fillText(ch, ((i % ATLAS_COLS) + 0.5) * PX, (Math.floor(i / ATLAS_COLS) + 0.54) * PX);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

const VERT = /* glsl */ `
attribute vec4 aInst;        // x, z along the route, seed, fall speed (rows per second)
varying vec2 vUv;
varying vec2 vSeed;
varying float vFade;
${JOURNEY_GLSL}
void main() {
  float z = wrapZ(aInst.y, ${HALF}.0);
  // each column turns about its own upright axis to face you, so it never goes edge-on
  vec3 centre = (modelViewMatrix * vec4(aInst.x, 0.0, z, 1.0)).xyz;
  vec3 up = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 side = normalize(cross(centre, up));      // your right, so the glyphs read the right way round
  vec3 p = centre + side * position.x * ${(CELL / 2).toFixed(3)} + up * position.y * ${(HEIGHT / 2).toFixed(1)};
  vUv = position.xy * 0.5 + 0.5;
  vSeed = aInst.zw;
  vFade = fadeZ(z, ${HALF}.0);
  gl_Position = projectionMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uGlyphs;
varying vec2 vUv;
varying vec2 vSeed;
varying float vFade;
${JOURNEY_GLSL}
void main() {
  // the column's seed arrives interpolated; snap it so every pixel agrees exactly
  float seed = floor(vSeed.x * 4096.0 + 0.5) / 4096.0;
  float fromTop = (1.0 - vUv.y) * ${ROWS}.0;
  float row = floor(fromTop);
  vec2 cell = vec2(vUv.x, 1.0 - fract(fromTop));            // within one glyph, y up

  // two drops per column: a bright head running down with a fading trail above it
  float cycle = ${ROWS}.0 + 34.0;
  float glow = 0.0, head = 0.0;
  for (int k = 0; k < 2; k++) {
    float at = mod(uTime * vSeed.y + (seed + float(k) * 0.53) * cycle, cycle);
    float behind = at - row;
    if (behind >= 0.0) {
      glow += exp(-behind * 0.085);
      head += 1.0 - smoothstep(0.0, 1.5, behind);
    }
  }
  if (glow < 0.004) discard;

  // which character: mostly steady, re-rolled now and then so the code flickers
  float tick = floor(uTime * (0.3 + 2.6 * hash21(vec2(row * 1.3, seed * 57.0))));
  float gi = floor(hash21(vec2(row + tick * 0.37, seed * 91.7)) * ${ALPHABET.length}.0);
  vec2 slot = vec2(mod(gi, ${ATLAS_COLS}.0), floor(gi / ${ATLAS_COLS}.0));
  vec2 inset = clamp(cell, 0.06, 0.94);
  vec2 uv = vec2((slot.x + inset.x) / ${ATLAS_COLS}.0, 1.0 - (slot.y + 1.0 - inset.y) / ${ATLAS_ROWS}.0);
  float ink = smoothstep(0.14, 0.55, texture2D(uGlyphs, uv).r);     // crisp strokes, clean background

  vec3 green = vec3(0.10, 1.0, 0.35);
  vec3 col = mix(green * min(glow * 1.2, 1.0), vec3(0.85, 1.0, 0.92), clamp(head, 0.0, 1.0));
  gl_FragColor = vec4(col * ink * sqrt(vFade) * 1.5, 1.0);
}
`;

export function createRain() {
  const rand = mulberry32(1999);
  const inst = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (LANE + rand() * rand() * (SPREAD - LANE)); // denser near the path
    inst.set([x, rand() * HALF * 2, rand(), 5 + rand() * 11], i * 4);
  }
  const quad = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('aInst', new THREE.InstancedBufferAttribute(inst, 4));
  geo.instanceCount = COUNT;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { uTravel: journey.uTravel, uTime: journey.uTime, uGlyphs: { value: glyphAtlas() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, speed: 4 };
}
