import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';
import { mulberry32 } from '../world/noise.js';

// Striped worlds: tunnels packed wall to wall with solid forms, every one
// painted in the same bold repeating bands (colour, second colour, black).
// There is no sky and no way out: a painted wall sits behind the forms and
// the far end closes in colour, so you are always inside, always arriving.
//
// The colourway is two vivid colours plus black, and drifts through a cycle
// of pairings every minute or so.
//
// A scene supplies a geometry, a copy count and a vertex-shader body that
// receives  position, normal, aI, aSeed, t  and must set:
//   z       where the copy sits along the tunnel (use wrapZ)
//   p, n    vertex position and normal
//   stripe  distance along the form, in metres, that the bands follow

const HALF = 120;
const GOLDEN = '2.39996'; // the golden angle: spreads things evenly around a spiral

const COLOURWAYS = [
  ['#ff1fd0', '#ff6a3a'], // magenta + orange
  ['#8cf01e', '#3cf5a0'], // lime + mint
  ['#25b7ff', '#8a3cff'], // cyan + violet
  ['#ff3a6a', '#c61fff'], // rose + purple
  ['#ccff33', '#ff6614'], // chartreuse + orange
].map((pair) =>
  pair.map((c) => {
    // keep the colours exactly as written: these shaders output them directly
    const n = parseInt(c.slice(1), 16);
    return new THREE.Color().setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  })
);

// Three crisp bands, softened only as much as the pixel size demands so they
// never shimmer; far away they melt into their average.
const BANDS_GLSL = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
vec3 bands(float s, float farness) {
  float f = fract(s) * 3.0;
  float w = clamp(fwidth(s) * 3.0, 0.002, 1.5);
  vec3 c;
  if (f < 1.5) {
    c = mix(vec3(0.0), uColA, smoothstep(-w, w, f));
    c = mix(c, uColB, smoothstep(1.0 - w, 1.0 + w, f));
  } else {
    c = mix(uColB, vec3(0.0), smoothstep(2.0 - w, 2.0 + w, f));
    c = mix(c, uColA, smoothstep(3.0 - w, 3.0 + w, f));
  }
  vec3 avg = (uColA + uColB) / 3.0;
  c = mix(c, avg, smoothstep(0.5, 1.5, w));
  return mix(c, avg, smoothstep(0.6, 1.0, farness));
}
`;

function striped({ geometry, count, seed, body, band = 0.6, crawl = 0.12, wall = 8.4, speed = 3.5, colourway = 0, doubleSided = false }) {
  const vert = /* glsl */ `
attribute float aI;
attribute vec4 aSeed;
varying float vStripe;
varying float vFar;
varying vec3 vN;
varying vec3 vView;
${JOURNEY_GLSL}
void main() {
  float t = uTime;
  float z = 0.0;
  float stripe = 0.0;
  vec3 p = position;
  vec3 n = normal;
  ${body}
  vStripe = stripe;
  vFar = abs(z) / ${HALF}.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = -mv.xyz;
  vN = normalMatrix * n;
  gl_Position = projectionMatrix * mv;
}
`;
  const frag = /* glsl */ `
uniform float uBand;
uniform float uCrawl;
varying float vStripe;
varying float vFar;
varying vec3 vN;
varying vec3 vView;
${JOURNEY_GLSL}
${BANDS_GLSL}
void main() {
  vec3 c = bands(vStripe / uBand - uTime * uCrawl, vFar);
  // almost flat: just enough shading to round the forms
  float ndv = abs(dot(normalize(vN), normalize(vView)));
  gl_FragColor = vec4(c * (0.8 + 0.2 * ndv), 1.0);
}
`;
  // the painted wall behind everything: one broad spiral of the same bands
  const wallFrag = /* glsl */ `
varying vec3 vPos;
${JOURNEY_GLSL}
${BANDS_GLSL}
void main() {
  float track = vPos.z - uTravel;
  float a = atan(vPos.y, vPos.x);
  vec3 c = bands(track / 2.4 + a / 6.28318 * 3.0 - uTime * 0.05, abs(vPos.z) / ${HALF}.0);
  gl_FragColor = vec4(c * 0.55, 1.0);
}
`;

  return () => {
    const colours = { uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() } };
    const uniforms = { uTravel: journey.uTravel, uTime: journey.uTime, ...colours };
    const group = new THREE.Group();

    const base = geometry();
    const rand = mulberry32(count * 5 + 1);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) seeds.set(seed ? seed(i, rand) : [rand(), rand(), rand(), rand()], i * 4);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    geo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i), 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    const forms = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms, uBand: { value: band }, uCrawl: { value: crawl } },
        vertexShader: vert,
        fragmentShader: frag,
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      })
    );
    forms.frustumCulled = false;
    group.add(forms);

    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(wall, wall, HALF * 2, 64, 1, true).rotateX(Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: wallFrag,
        side: THREE.BackSide,
      })
    );
    tube.frustumCulled = false;
    group.add(tube);

    // close both ends in the far-off colour
    const capMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColA; uniform vec3 uColB; void main() { gl_FragColor = vec4((uColA + uColB) / 3.0, 1.0); }',
      side: THREE.DoubleSide,
    });
    for (const z of [-HALF, HALF]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(wall, 48), capMat);
      cap.position.z = z;
      group.add(cap);
    }

    const update = (dt, t) => {
      const turn = t / 50 + colourway;
      const i = Math.floor(turn) % COLOURWAYS.length;
      const j = (i + 1) % COLOURWAYS.length;
      const k = THREE.MathUtils.smoothstep(turn - Math.floor(turn), 0.82, 1); // hold, then glide
      colours.uColA.value.copy(COLOURWAYS[i][0]).lerp(COLOURWAYS[j][0], k);
      colours.uColB.value.copy(COLOURWAYS[i][1]).lerp(COLOURWAYS[j][1], k);
    };
    update(0, journey.uTime.value);
    return { group, speed, update };
  };
}

const cone = (radial = 22) => new THREE.ConeGeometry(1, 1, radial, 3).translate(0, 0.5, 0); // base at y=0, tip at y=1
const dome = (w = 18, h = 8) => new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2); // pole at +y

// directions around the tunnel at angle `ang`: er points outward, et around
const FRAME = /* glsl */ `
  vec3 er = vec3(cos(ang), sin(ang), 0.0);
  vec3 et = vec3(-er.y, er.x, 0.0);
  vec3 ez = vec3(0.0, 0.0, 1.0);
`;

// Candy Horns: curling striped horns crowd in from every side, big ones
// shouldering between small, all leaning along one great spiral.
export const createHorns = striped({
  geometry: () => cone(24),
  count: 1000,
  colourway: 0,
  body: /* glsl */ `
  z = wrapZ(aI * 0.24, ${HALF}.0);
  float big = mod(aI, 4.0) < 0.5 ? 1.0 : 0.0;
  float ang = aI * ${GOLDEN};
  ${FRAME}
  float len = big > 0.5 ? 5.4 : 2.6 + aSeed.x * 0.9;
  float rad = big > 0.5 ? 1.55 : 0.9;
  vec3 axis = normalize(-er + et * 0.55 + ez * 0.5);          // inward, around, and toward you
  vec3 bx = normalize(cross(axis, ez));
  vec3 bz = cross(bx, axis);
  float y = position.y;
  float sway = 0.25 * sin(t * 0.6 + aI);
  p = er * 7.7 + bx * position.x * rad + axis * y * len + bz * position.z * rad
    + et * y * y * (1.2 + sway) + vec3(0.0, 0.0, z);            // the curl
  n = normalize(bx * normal.x + axis * normal.y * (rad / len) + bz * normal.z);
  stripe = y * len;
  `,
});

// Romanesco: every cone carries a spiral of smaller cones, like the vegetable.
const ROMA = { parents: 300, kids: 14 };
export const createRomanesco = striped({
  geometry: () => cone(16),
  count: ROMA.parents * (ROMA.kids + 1),
  seed: (i, rand) => [Math.floor(i / (ROMA.kids + 1)), i % (ROMA.kids + 1), rand(), rand()],
  band: 0.5,
  colourway: 1,
  body: /* glsl */ `
  float parent = aSeed.x, kid = aSeed.y;
  z = wrapZ(parent * ${(240 / ROMA.parents).toFixed(4)}, ${HALF}.0);
  float ang = parent * ${GOLDEN};
  ${FRAME}
  vec3 axis = normalize(-er + et * 0.35 + ez * 0.45);
  vec3 bx = normalize(cross(axis, ez));
  vec3 bz = cross(bx, axis);
  const float LEN = 4.8, RAD = 1.8;
  vec3 q, nn;
  if (kid < 0.5) {
    q = vec3(position.x * RAD, position.y * LEN, position.z * RAD);
    nn = vec3(normal.x, normal.y * RAD / LEN, normal.z);
    stripe = position.y * LEN;
  } else {
    // a floret on the parent's flank, placed along a spiral and leaning outward
    float h = 0.10 + (kid - 1.0) / ${(ROMA.kids - 1).toFixed(1)} * 0.74;
    float ca = kid * ${GOLDEN};
    float pr = RAD * (1.0 - h);
    vec3 cdir = vec3(cos(ca), 0.0, sin(ca));
    vec3 caxis = normalize(cdir + vec3(0.0, 0.5, 0.0));
    vec3 cbx = normalize(cross(caxis, vec3(0.0, 1.0, 0.0)));
    vec3 cbz = cross(cbx, caxis);
    float cl = 1.7 * (1.0 - h * 0.55), cr = 0.55 * (1.0 - h * 0.45);
    q = cdir * pr * 0.92 + vec3(0.0, h * LEN, 0.0) + cbx * position.x * cr + caxis * position.y * cl + cbz * position.z * cr;
    nn = cbx * normal.x + caxis * normal.y * (cr / cl) + cbz * normal.z;
    stripe = position.y * cl * 2.2;                               // finer bands on the florets
  }
  p = er * 7.7 + bx * q.x + axis * q.y + bz * q.z + vec3(0.0, 0.0, z);
  n = normalize(bx * nn.x + axis * nn.y + bz * nn.z);
  `,
});

// Bullseye Bloom: swelling domes ringed like targets, large and small, breathing gently.
export const createBullseye = striped({
  geometry: () => dome(20, 9),
  count: 1000,
  band: 0.55,
  crawl: 0.18,
  colourway: 2,
  body: /* glsl */ `
  z = wrapZ(aI * 0.24, ${HALF}.0);
  float big = mod(aI, 5.0) < 0.5 ? 1.0 : 0.0;
  float ang = aI * ${GOLDEN};
  ${FRAME}
  float R = (big > 0.5 ? 2.5 : 1.0 + aSeed.x * 0.6) * (1.0 + 0.07 * sin(t * 0.8 + aI * 1.3));
  vec3 axis = normalize(-er + ez * 0.25);
  vec3 bx = et;
  vec3 bz = cross(bx, axis);
  p = er * 7.5 + (bx * position.x + axis * position.y * 1.3 + bz * position.z) * R + vec3(0.0, 0.0, z);
  n = normalize(bx * normal.x + axis * normal.y / 1.3 + bz * normal.z);
  stripe = acos(clamp(position.y, 0.0, 1.0)) * R;                 // rings around the crown
  `,
});

// Dragon Scales: overlapping scales laid like roof tiles, each ringed from its root.
const SCALES = { per: 14, gap: 1.8 };
export const createScales = striped({
  geometry: () => dome(12, 5),
  count: Math.round(240 / SCALES.gap) * SCALES.per,
  band: 0.5,
  crawl: 0.2,
  wall: 7.6,
  colourway: 4,
  body: /* glsl */ `
  float ring = floor(aI / ${SCALES.per}.0), k = mod(aI, ${SCALES.per}.0);
  z = wrapZ(ring * ${SCALES.gap.toFixed(1)}, ${HALF}.0);
  float cell = floor((z - uTravel) / ${SCALES.gap.toFixed(1)} + 0.5);
  float ang = (k + 0.5 * mod(cell, 2.0)) / ${SCALES.per}.0 * 6.28318 + cell * 0.045;   // bricked, slowly spiralling
  ${FRAME}
  float lift = 0.42 + 0.08 * sin(t * 0.7 + cell * 0.6);            // the scales ruffle
  vec3 along = normalize(ez * cos(lift) - er * sin(lift));         // toward you, lifting off the wall
  vec3 thick = normalize(-er * cos(lift) - ez * sin(lift));
  const float W = 1.85, L = 2.1, T = 0.5;
  p = er * 6.9 + et * position.x * W + thick * position.y * T + along * position.z * L + vec3(0.0, 0.0, z);
  n = normalize(et * normal.x / W + thick * normal.y / T + along * normal.z / L);
  stripe = length(vec2(position.x * W, (position.z + 1.0) * L));   // arcs spreading from the root
  `,
});

// Serpent Coil: fat striped bodies wound around the tunnel in both directions,
// woven through each other, their bands sliding along them.
const COIL_TUBES = 14;
function coilGeometry() {
  const AROUND = 14;
  const SEG = 300;
  const pos = [];
  const idx = [];
  for (let s = 0; s <= SEG; s++) {
    const z = -HALF + (s / SEG) * HALF * 2;
    for (let a = 0; a <= AROUND; a++) {
      const th = (a / AROUND) * Math.PI * 2;
      pos.push(Math.cos(th), Math.sin(th), z);
    }
    if (s < SEG)
      for (let a = 0; a < AROUND; a++) {
        const p = s * (AROUND + 1) + a;
        const q = p + AROUND + 1;
        idx.push(p, p + 1, q, q, p + 1, q + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(idx);
  return g;
}

export const createCoil = striped({
  geometry: coilGeometry,
  count: COIL_TUBES,
  band: 0.75,
  crawl: 0.3,
  wall: 9.4,
  colourway: 3,
  doubleSided: true,
  body: /* glsl */ `
  z = position.z;                                 // the bodies are continuous: no wrapping
  float track = z - uTravel;
  float dir = mod(aI, 2.0) < 0.5 ? 1.0 : -1.0;
  const float WIND = 0.11;
  float rr = dir > 0.0 ? 7.0 : 7.9;               // one set lies behind the other
  float ang = aI * ${(Math.PI * 2 / COIL_TUBES).toFixed(5)} + dir * track * WIND;
  ${FRAME}
  float girth = 1.8 * (1.0 + 0.16 * sin(track * 0.45 * dir + aI * 2.0 - t * 0.9));    // a slow swallow
  vec3 tang = normalize(et * (rr * dir * WIND) + ez);
  vec3 b2 = cross(tang, er);
  n = er * position.x + b2 * position.y;
  p = er * rr + n * girth + vec3(0.0, 0.0, z);
  stripe = dir * track * sqrt(1.0 + rr * rr * WIND * WIND);
  `,
});
