import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';
import { mulberry32 } from '../world/noise.js';

// Solid forms: many copies of one shape, each placed and turned by a short
// vertex-shader body, all shaded with the same iridescent "soap film" look
// (colour shifts with the angle you see a face from).
//
// A body receives  position, normal, aI (copy number), aSeed (4 values per
// copy), t (seconds)  and must set:
//   z    where the copy is along the tunnel (use wrapZ)
//   p    the vertex position
//   n    the vertex normal
//   hue  its place in the palette

const FRAG = /* glsl */ `
varying vec3 vN;
varying vec3 vView;
varying float vHue;
varying float vFade;
${JOURNEY_GLSL}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vView);
  float ndv = abs(dot(N, V));
  vec3 col = pal(vHue + (1.0 - ndv) * 0.35) * (0.32 + 0.68 * ndv);
  col += pal(vHue + 0.5) * pow(1.0 - ndv, 3.0) * 0.7;
  gl_FragColor = vec4(col * vFade, 1.0);
}
`;

function solids({ geometry, count, half = 120, speed = 4, body, seed, doubleSided = false }) {
  const vert = /* glsl */ `
attribute float aI;
attribute vec4 aSeed;
varying vec3 vN;
varying vec3 vView;
varying float vHue;
varying float vFade;
${JOURNEY_GLSL}
void main() {
  float t = uTime;
  float z = 0.0;
  float hue = 0.0;
  vec3 p = position;
  vec3 n = normal;
  ${body}
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = -mv.xyz;
  vN = normalMatrix * n;
  vHue = hue;
  vFade = fadeZ(z, ${half.toFixed(1)});
  gl_Position = projectionMatrix * mv;
}
`;
  return () => {
    const base = geometry();
    const rand = mulberry32(count * 7 + 3);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) seeds.set(seed ? seed(i, rand) : [rand(), rand(), rand(), rand()], i * 4);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    geo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i), 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    const mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uTravel: journey.uTravel, uTime: journey.uTime },
        vertexShader: vert,
        fragmentShader: FRAG,
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      })
    );
    mesh.frustumCulled = false;
    const group = new THREE.Group();
    group.add(mesh);
    return { group, speed };
  };
}

const faceted = (g) => {
  const out = g.index ? g.toNonIndexed() : g;
  out.computeVertexNormals();
  return out;
};

// Gyro Rings: paired hoops that rock against each other like a gyroscope as you pass through.
export const createGyro = solids({
  geometry: () => new THREE.TorusGeometry(1, 0.03, 8, 72),
  count: 80,
  speed: 4,
  body: /* glsl */ `
  float gate = floor(aI * 0.5), k = mod(aI, 2.0);
  z = wrapZ(gate * 6.0, 120.0);
  float track = z - uTravel;
  float R = k < 0.5 ? 3.3 : 5.6;
  vec3 ax = vec3(cos(gate * 2.4 + k * 1.57), sin(gate * 2.4 + k * 1.57), 0.0);
  mat3 m = rotAxis(ax, (k < 0.5 ? 0.85 : -0.6) * sin(track * 0.07 + t * 0.35 + k));
  p = m * (position * R) + vec3(0.0, 0.0, z);
  n = m * normal;
  hue = track * 0.008 + k * 0.3 + t * 0.01;
  `,
});

// Cube Swarm: hundreds of tumbling, breathing cubes orbiting the path.
export const createCubes = solids({
  geometry: () => faceted(new THREE.BoxGeometry(1, 1, 1)),
  count: 900,
  speed: 4,
  body: /* glsl */ `
  z = wrapZ(aSeed.z * 240.0, 120.0);
  float track = z - uTravel;
  float ang = aSeed.x * 6.28318 + track * 0.02;
  float r = 3.6 + aSeed.y * aSeed.y * 14.0;
  float s = (0.5 + aSeed.w * 1.2) * (0.8 + 0.2 * sin(t * 1.3 + aI));
  mat3 m = rotAxis(normalize(aSeed.xyz - 0.5), t * (0.2 + aSeed.w * 0.5) + aI);
  p = m * (position * s) + vec3(cos(ang) * r, sin(ang) * r, z);
  n = m * normal;
  hue = aSeed.x * 0.4 + track * 0.006 + t * 0.01;
  `,
});

// Sierpinski Drift: fractal pyramids, each made of pyramids made of pyramids, turning slowly.
function sierpinski(level) {
  const V = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ];
  let tets = [{ c: [0, 0, 0], s: 1 }];
  for (let l = 0; l < level; l++) {
    tets = tets.flatMap(({ c, s }) => V.map((v) => ({ c: [c[0] + (v[0] * s) / 2, c[1] + (v[1] * s) / 2, c[2] + (v[2] * s) / 2], s: s / 2 })));
  }
  const pos = [];
  for (const { c, s } of tets)
    for (const f of [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]])
      for (const i of f) pos.push(c[0] + V[i][0] * s, c[1] + V[i][1] * s, c[2] + V[i][2] * s);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export const createSierpinski = solids({
  geometry: () => sierpinski(3),
  count: 230,
  speed: 3.5,
  doubleSided: true,
  body: /* glsl */ `
  z = wrapZ(aSeed.z * 240.0, 120.0);
  float track = z - uTravel;
  float ang = aSeed.x * 6.28318;
  float r = 7.0 + aSeed.y * aSeed.y * 16.0;
  float s = 1.1 + aSeed.w * 1.7;
  mat3 m = rotAxis(normalize(aSeed.yzx - 0.5), t * (0.08 + aSeed.w * 0.15) + aI);
  p = m * (position * s) + vec3(cos(ang) * r, sin(ang) * r, z);
  n = m * normal;
  hue = aSeed.y * 0.35 + track * 0.006 + t * 0.008;
  `,
});

// Crystal Cavern: a throat of long crystal shards pointing in from every side.
export const createCrystal = solids({
  geometry: () => faceted(new THREE.OctahedronGeometry(1, 0)),
  count: 900,
  speed: 3.5,
  body: /* glsl */ `
  z = wrapZ(aSeed.z * 240.0, 120.0);
  float track = z - uTravel;
  float ang = aSeed.x * 6.28318;
  vec3 rad = vec3(cos(ang), sin(ang), 0.0);
  float len = 1.0 + aSeed.w * aSeed.w * 3.6;
  float girth = 0.22 + 0.3 * aSeed.y;
  vec3 inward = normalize(-rad + vec3(-rad.y, rad.x, 0.0) * (aSeed.y - 0.5) * 0.9 + vec3(0.0, 0.0, (fract(aSeed.w * 7.0) - 0.5) * 1.1));
  vec3 bx = normalize(cross(inward, vec3(0.0, 0.0, 1.0)));
  vec3 bz = cross(bx, inward);
  vec3 q = position * vec3(girth, len, girth);
  p = bx * q.x + inward * q.y + bz * q.z + rad * 8.0 + vec3(0.0, 0.0, z);
  n = normalize(bx * normal.x / girth + inward * normal.y / len + bz * normal.z / girth);
  hue = aSeed.x * 0.3 + track * 0.01 + t * 0.012 + 0.1 * sin(t * 0.7 + aI);
  `,
});

// Monolith Grove: ranks of tall slabs rising and falling in waves on either side.
export const createPillars = solids({
  geometry: () => faceted(new THREE.BoxGeometry(1, 1, 1)),
  count: 16 * 60,
  speed: 5,
  seed: (i, rand) => {
    const col = i % 16;
    const side = col < 8 ? -1 : 1;
    return [side * (3.2 + (col % 8) * 3.4), Math.floor(i / 16), rand(), rand()];
  },
  body: /* glsl */ `
  z = wrapZ(aSeed.y * 4.0, 120.0);
  float track = z - uTravel;
  float h = 5.0 + 9.0 * aSeed.z + 5.0 * sin(track * 0.08 + abs(aSeed.x) * 0.35 - t * 0.6);
  p = position * vec3(0.55, h, 0.55) + vec3(aSeed.x, 0.0, z);
  n = normal;
  hue = track * 0.007 + abs(aSeed.x) * 0.02 + t * 0.01;
  `,
});

// Silk Ribbons: long bands of colour that weave around you, twisting as they go.
const RIBBON_HALF = 120;
function ribbonStrip() {
  const SEG = 320;
  const pos = [];
  const idx = [];
  for (let s = 0; s <= SEG; s++) {
    const z = -RIBBON_HALF + (s / SEG) * RIBBON_HALF * 2;
    pos.push(-1, 0, z, 1, 0, z);
    if (s < SEG) idx.push(s * 2, s * 2 + 1, s * 2 + 2, s * 2 + 2, s * 2 + 1, s * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(idx);
  return g;
}

export const createRibbons = solids({
  geometry: ribbonStrip,
  count: 11,
  speed: 4,
  doubleSided: true,
  body: /* glsl */ `
  z = position.z;                       // ribbons are continuous: no wrapping needed
  float track = z - uTravel;
  float dir = mod(aI, 2.0) < 0.5 ? 1.0 : -1.0;
  float phi = aI * 0.63 + dir * track * 0.045 + 0.8 * sin(track * 0.031 + aI * 1.7 + t * 0.1);
  float r = 3.9 + 1.5 * sin(track * 0.06 + aI * 2.1) + aSeed.x * 2.5;
  float th = dir * track * 0.22 + aI + t * 0.2;
  vec3 radial = vec3(cos(phi), sin(phi), 0.0);
  vec3 across = radial * cos(th) + vec3(-radial.y, radial.x, 0.0) * sin(th);
  p = radial * r + across * position.x * 0.5 + vec3(0.0, 0.0, z);
  n = normalize(cross(vec3(0.0, 0.0, 1.0), across));
  hue = aI * 0.09 + track * 0.008 + t * 0.012;
  `,
});
