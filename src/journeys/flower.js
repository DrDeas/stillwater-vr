import * as THREE from 'three';
import { journey, JOURNEY_GLSL, createMotes, createCore } from './common.js';

// Flower of Life: great seals of interlocking circles and star figures, drawn
// in light, turn slowly as you pass through their centres.

const HALF = 120;
const SPACING = 16;
const TILE = 1024;
const GRID = 2; // the atlas is GRID x GRID figures

/** Four figures on one square canvas: flower of life, star lattice, nested hexagons, eightfold star. */
function sealAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = TILE * GRID;
  canvas.height = TILE * GRID;
  const g = canvas.getContext('2d', { willReadFrequently: true }); // keep it a plain CPU canvas
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const u = 122; // unit radius in pixels
  // Every line is drawn twice: a wide faint pass for glow, then a bright core.
  const glowStroke = () => {
    const w = g.lineWidth;
    g.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    g.lineWidth = w * 4.5;
    g.stroke();
    g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    g.lineWidth = w;
    g.stroke();
  };
  const circle = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    glowStroke();
  };
  const seg = (x0, y0, x1, y1) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    glowStroke();
  };
  const rim = () => {
    g.lineWidth = 4;
    circle(0, 0, u * 3);
    g.lineWidth = 2;
    circle(0, 0, u * 3.18);
  };
  const begin = (tile) => {
    g.save();
    g.translate((tile % GRID) * TILE + TILE / 2, Math.floor(tile / GRID) * TILE + TILE / 2);
    g.lineWidth = 4;
  };

  // 1: flower of life — nineteen circles on a hexagonal lattice
  begin(0);
  g.save();
  g.beginPath();
  g.arc(0, 0, u * 3, 0, Math.PI * 2);
  g.clip();
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++) {
      const x = (i + j / 2) * u;
      const y = ((j * Math.sqrt(3)) / 2) * u;
      if (Math.hypot(x, y) <= u * 2.01) circle(x, y, u);
    }
  g.restore();
  rim();
  g.restore();

  // 2: thirteen circles joined by every line between their centres
  begin(1);
  const pts = [[0, 0]];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    pts.push([Math.cos(a) * u * 1.2, Math.sin(a) * u * 1.2], [Math.cos(a) * u * 2.4, Math.sin(a) * u * 2.4]);
  }
  g.lineWidth = 1.5;
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) seg(...pts[a], ...pts[b]);
  g.lineWidth = 3;
  for (const [x, y] of pts) circle(x, y, u * 0.6);
  rim();
  g.restore();

  // 3: hexagons turning inside one another, with spokes
  begin(2);
  for (let k = 0; k < 7; k++) {
    const r = u * 3 * Math.pow(0.866, k);
    g.beginPath();
    for (let s = 0; s <= 6; s++) {
      const a = (s / 6) * Math.PI * 2 + k * (Math.PI / 6);
      g[s ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    glowStroke();
    if (k % 2 === 1) circle(0, 0, r * 0.866);
  }
  g.lineWidth = 1.5;
  for (let s = 0; s < 12; s++) {
    const a = (s / 12) * Math.PI * 2;
    seg(Math.cos(a) * u * 1.1, Math.sin(a) * u * 1.1, Math.cos(a) * u * 3, Math.sin(a) * u * 3);
  }
  rim();
  g.restore();

  // 4: two squares making an eightfold star, ringed with petals
  begin(3);
  for (const rot of [0, Math.PI / 4]) {
    for (const r of [u * 3, u * 2.12, u * 1.5]) {
      g.beginPath();
      for (let s = 0; s <= 4; s++) {
        const a = (s / 4) * Math.PI * 2 + rot;
        g[s ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      glowStroke();
    }
  }
  g.save();
  g.beginPath();
  g.arc(0, 0, u * 3, 0, Math.PI * 2);
  g.clip();
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2;
    circle(Math.cos(a) * u * 1.5, Math.sin(a) * u * 1.5, u * 1.5);
  }
  g.restore();
  circle(0, 0, u * 0.75);
  rim();
  g.restore();

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

const VERT = /* glsl */ `
attribute float aI;
varying vec3 vCol;
varying vec2 vUv;
${JOURNEY_GLSL}
void main() {
  float z = wrapZ(aI * ${SPACING}.0, ${HALF}.0);
  float track = z - uTravel;
  float dir = mod(aI, 2.0) < 0.5 ? 1.0 : -1.0;
  float ang = dir * (track * 0.01 + uTime * 0.02) + aI * 0.7;
  float c = cos(ang), s = sin(ang);
  float r = 10.5 * (1.0 + 0.06 * sin(track * 0.05 + uTime * 0.2));
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * r;
  float tile = mod(aI, ${GRID * GRID}.0);
  vUv = (uv + vec2(mod(tile, ${GRID}.0), floor(tile / ${GRID}.0))) / ${GRID}.0;
  vCol = mix(aura(track * 0.005 + uTime * 0.006), vec3(1.0, 0.96, 0.88), 0.2) * fadeZ(z, ${HALF}.0) * smoothstep(1.0, 5.0, abs(z));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, z, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uSeals;
varying vec3 vCol;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(vCol * texture2D(uSeals, vUv).r * 1.15, 1.0);
}
`;

export function createFlower() {
  const group = new THREE.Group();
  const count = Math.round((HALF * 2) / SPACING);
  const quad = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i), 1));
  geo.instanceCount = count;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { uTravel: journey.uTravel, uTime: journey.uTime, uSeals: { value: sealAtlas() } },
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
  group.add(createMotes({ count: 3000, half: HALF, inner: 1.5, outer: 32, seed: 23, size: 0.1 }));
  group.add(createCore({ size: 40, intensity: 0.7, hue: 0.55 }));
  return { group, speed: 4 };
}
