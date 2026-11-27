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
  ['#ff2d95', '#19e3ff'], // pink + cyan
  ['#ffd319', '#ff2975'], // yellow + hot pink
  ['#7cff4f', '#b14cff'], // green + violet
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
  float foot = min(fwidth(s), min(fwidth(fract(s)), fwidth(fract(s + 0.5))));
  float w = clamp(foot * 3.0, 0.002, 1.5);
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

function striped({ geometry, count, seed, body, fragment = '', band = 0.6, crawl = 0.12, breathe = 0, wall = 8.4, speed = 3.5, colourway = 0, period = 50, doubleSided = false }) {
  const vert = /* glsl */ `
attribute float aI;
attribute vec4 aSeed;
varying float vStripe;
varying float vFar;
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
${JOURNEY_GLSL}
void main() {
  float t = uTime;
  float z = 0.0;
  float stripe = 0.0;
  vec3 local = vec3(0.0);       // free values handed to the fragment hook
  vec3 p = position;
  vec3 n = normal;
  ${body}
  vStripe = stripe;
  vLocal = local;
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
varying vec3 vLocal;
${JOURNEY_GLSL}
${BANDS_GLSL}
void main() {
  float s = vStripe / uBand - uTime * uCrawl;
  ${fragment}
  vec3 c = bands(s, vFar);
  // almost flat: just enough shading to round the forms
  float ndv = abs(dot(normalize(vN), normalize(vView)));
  gl_FragColor = vec4(c * (0.8 + 0.2 * ndv), 1.0);
}
`;

  return () => {
    const room = enclosure({ colourway, period, wall });
    const bandU = { value: band };

    const base = geometry();
    const rand = mulberry32(count * 5 + 1);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) seeds.set(seed ? seed(i, rand) : [rand(), rand(), rand(), rand()], i * 4);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    if (base.attributes.uv) geo.setAttribute('uv', base.attributes.uv);
    geo.setAttribute('aI', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i), 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    const forms = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { ...room.uniforms, uBand: bandU, uCrawl: { value: crawl } },
        vertexShader: vert,
        fragmentShader: frag,
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      })
    );
    forms.frustumCulled = false;
    room.group.add(forms);

    const update = (dt, t) => {
      room.tick(t);
      bandU.value = band * (1 + breathe * Math.sin(t * 0.13)); // the bands slowly widen and narrow
    };
    update(0, journey.uTime.value);
    return { group: room.group, speed, update };
  };
}

/**
 * What every striped world shares: the drifting two-colour scheme, a painted
 * wall behind the forms (optional) and caps that close both ends.
 */
function enclosure({ colourway = 0, period = 50, wall = 8.4, paintedWall = true }) {
  const colours = { uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() } };
  const uniforms = { uTravel: journey.uTravel, uTime: journey.uTime, ...colours };
  const group = new THREE.Group();

  if (paintedWall) {
    // one broad spiral of the same bands
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
  }

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

  const tick = (t) => {
    const turn = t / period + colourway;
    const i = Math.floor(turn) % COLOURWAYS.length;
    const j = (i + 1) % COLOURWAYS.length;
    const k = THREE.MathUtils.smoothstep(turn - Math.floor(turn), 0.82, 1); // hold, then glide
    colours.uColA.value.copy(COLOURWAYS[i][0]).lerp(COLOURWAYS[j][0], k);
    colours.uColB.value.copy(COLOURWAYS[i][1]).lerp(COLOURWAYS[j][1], k);
  };
  return { group, uniforms, tick };
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

// ===========================================================================
// More striped worlds: variations that never hold still.
// ===========================================================================

// shared by the dome scenes: copy `aI` sits on the wall along a golden spiral
const ON_SPIRAL = /* glsl */ `
  z = wrapZ(aI * 0.24, ${HALF}.0);
  float track = z - uTravel;
  float big = mod(aI, 5.0) < 0.5 ? 1.0 : 0.0;
  float ang = aI * ${GOLDEN};
  ${FRAME}
`;

// Tidal Bloom: waves of swelling run down the tunnel; domes rise into peaks as
// each wave arrives and sink flat behind it, their rings pouring outward.
export const createTidal = striped({
  geometry: () => dome(20, 9),
  count: 1000,
  band: 0.55,
  crawl: 0.5,
  breathe: 0.25,
  colourway: 5,
  period: 35,
  body: /* glsl */ `
  ${ON_SPIRAL}
  float swell = 0.5 + 0.5 * sin(track * 0.16 - t * 0.7 + 2.0 * sin(ang));
  float R = (big > 0.5 ? 2.7 : 1.1 + aSeed.x * 0.6) * (0.4 + 0.85 * swell);
  float tall = 0.6 + 1.3 * swell * swell;
  vec3 axis = normalize(-er + ez * 0.25);
  vec3 bx = et;
  vec3 bz = cross(bx, axis);
  p = er * 7.5 + (bx * position.x + axis * position.y * tall + bz * position.z) * R + vec3(0.0, 0.0, z);
  n = normalize(bx * normal.x + axis * normal.y / tall + bz * normal.z);
  stripe = acos(clamp(position.y, 0.0, 1.0)) * R;
  `,
});

// Whirlpool Eyes: every dome carries a spinning spiral instead of rings,
// neighbours turning opposite ways.
export const createWhirl = striped({
  geometry: () => dome(22, 10),
  count: 1000,
  band: 0.6,
  crawl: 0.0,
  colourway: 2,
  period: 35,
  body: /* glsl */ `
  ${ON_SPIRAL}
  float R = (big > 0.5 ? 2.6 : 1.1 + aSeed.x * 0.6) * (1.0 + 0.08 * sin(t * 0.9 + aI * 1.7));
  vec3 axis = normalize(-er + ez * 0.25);
  vec3 bx = et;
  vec3 bz = cross(bx, axis);
  p = er * 7.5 + (bx * position.x + axis * position.y * 1.25 + bz * position.z) * R + vec3(0.0, 0.0, z);
  n = normalize(bx * normal.x + axis * normal.y / 1.25 + bz * normal.z);
  stripe = acos(clamp(position.y, 0.0, 1.0)) * R;
  local = vec3(position.x, position.z, mod(aI, 2.0) < 0.5 ? 1.0 : -1.0);
  `,
  // wind the rings into a two-armed spiral and turn it (taken per pixel, so there is no seam)
  fragment: /* glsl */ `
  float spin = vLocal.z > 0.0 ? 1.0 : -1.0;
  s += spin * (atan(vLocal.y, vLocal.x) / 6.28318 * 2.0 + uTime * 0.22);
  `,
});

// Shapeshifter: the forms melt between soft domes and sharp spires in slow
// waves, so the tunnel is never the same shape twice.
export const createShapeshift = striped({
  geometry: () => dome(20, 10),
  count: 1000,
  band: 0.55,
  crawl: 0.2,
  breathe: 0.2,
  colourway: 6,
  period: 35,
  body: /* glsl */ `
  ${ON_SPIRAL}
  float m = 0.5 + 0.5 * sin(track * 0.11 + t * 0.45 + ang);       // 0 = dome, 1 = spire
  m = m * m * (3.0 - 2.0 * m);
  float v = acos(clamp(position.y, 0.0, 1.0)) / 1.5708;           // 0 at the crown, 1 at the rim
  float rr = mix(sin(v * 1.5708), pow(v, 1.6), m);
  float hh = mix(cos(v * 1.5708), 1.0 - v, m);
  vec2 around = length(position.xz) > 1e-4 ? normalize(position.xz) : vec2(1.0, 0.0);
  float R = big > 0.5 ? 2.5 : 1.0 + aSeed.x * 0.6;
  float tall = mix(1.2, 2.3, m);
  vec3 axis = normalize(-er + et * 0.3 * m + ez * (0.25 + 0.3 * m));
  vec3 bx = normalize(cross(axis, ez));
  vec3 bz = cross(bx, axis);
  p = er * 7.5 + (bx * around.x * rr + axis * hh * tall + bz * around.y * rr) * R + vec3(0.0, 0.0, z);
  n = normalize(bx * around.x + axis * mix(position.y, 0.35, m) + bz * around.y);
  stripe = v * R * mix(1.5708, 1.9, m);
  `,
});

// Budding Bloom: each great dome wears a slowly circling crown of smaller
// domes, every one with its own bullseye.
const BUDS = { parents: 260, kids: 9 };
export const createBudding = striped({
  geometry: () => dome(18, 8),
  count: BUDS.parents * (BUDS.kids + 1),
  seed: (i, rand) => [Math.floor(i / (BUDS.kids + 1)), i % (BUDS.kids + 1), rand(), rand()],
  band: 0.5,
  crawl: 0.22,
  colourway: 3,
  period: 35,
  body: /* glsl */ `
  float parent = aSeed.x, kid = aSeed.y;
  z = wrapZ(parent * ${(240 / BUDS.parents).toFixed(4)}, ${HALF}.0);
  float ang = parent * ${GOLDEN};
  ${FRAME}
  vec3 axis = normalize(-er + ez * 0.25);
  vec3 bx = et;
  vec3 bz = cross(bx, axis);
  float R = 2.5 * (1.0 + 0.08 * sin(t * 0.7 + parent * 1.9));
  vec3 q, nn;
  if (kid < 0.5) {
    q = vec3(position.x, position.y * 1.15, position.z) * R;
    nn = vec3(normal.x, normal.y / 1.15, normal.z);
    stripe = acos(clamp(position.y, 0.0, 1.0)) * R;
  } else {
    // buds: eight circling a ring part-way down, and one sitting on the crown
    float onRing = kid < 8.5 ? 1.0 : 0.0;
    float polar = onRing > 0.5 ? 0.95 : 0.0;
    float turn = (mod(parent, 2.0) < 0.5 ? 1.0 : -1.0) * t * 0.18;
    float ca = kid * 0.7854 + turn;
    vec3 out_ = vec3(sin(polar) * cos(ca), cos(polar), sin(polar) * sin(ca));     // where on the parent
    vec3 side = normalize(cross(out_, vec3(0.3, 1.0, 0.2)));
    vec3 fwd = cross(side, out_);
    float r = (onRing > 0.5 ? 0.78 : 0.95) * (1.0 + 0.15 * sin(t * 1.1 + kid * 2.0 + parent));
    q = out_ * vec3(1.0, 1.15, 1.0) * R * 0.97 + (side * position.x + out_ * position.y * 1.2 + fwd * position.z) * r;
    nn = side * normal.x + out_ * normal.y / 1.2 + fwd * normal.z;
    stripe = acos(clamp(position.y, 0.0, 1.0)) * r * 1.9;       // finer rings on the buds
  }
  p = er * 7.6 + bx * q.x + axis * q.y + bz * q.z + vec3(0.0, 0.0, z);
  n = normalize(bx * nn.x + axis * nn.y + bz * nn.z);
  `,
});

// Toadstool Grove: striped stalks lean in from every wall, each under a ringed
// cap that opens and closes like a slow umbrella.
function toadstool() {
  // profile of one toadstool, base to crown: [radius, height]
  const profile = [[0.24, 0], [0.2, 0.3], [0.18, 0.6], [0.5, 0.63], [0.95, 0.7], [1.0, 0.76], [0.9, 0.86], [0.65, 0.94], [0.35, 0.985], [0.0, 1.0]];
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  // record how far along the profile each vertex is, so bands follow the surface
  const arc = [0];
  for (let i = 1; i < profile.length; i++) arc.push(arc[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, arc[i % profile.length]);
  return g;
}

export const createToadstools = striped({
  geometry: toadstool,
  count: 620,
  band: 0.5,
  crawl: 0.16,
  breathe: 0.2,
  colourway: 4,
  period: 35,
  doubleSided: true,
  body: /* glsl */ `
  z = wrapZ(aI * ${(240 / 620).toFixed(4)}, ${HALF}.0);
  float ang = aI * ${GOLDEN};
  ${FRAME}
  float len = 3.0 + aSeed.x * 1.9;
  float capOpen = 0.75 + 0.45 * sin(t * 0.6 + aI * 0.9);           // umbrella opening and closing
  float isCap = smoothstep(0.6, 0.66, position.y);
  float girth = len * 0.4 * mix(1.0, capOpen, isCap);
  vec3 axis = normalize(-er + et * (aSeed.y - 0.5) * 0.7 + ez * 0.3);
  vec3 bx = normalize(cross(axis, ez));
  vec3 bz = cross(bx, axis);
  float y = position.y;
  vec3 sway = (et * sin(t * 0.5 + aI) + ez * cos(t * 0.4 + aI * 1.3)) * y * y * 0.5;
  p = er * 7.8 + bx * position.x * girth + axis * y * len + bz * position.z * girth + sway + vec3(0.0, 0.0, z);
  n = normalize(bx * normal.x + axis * normal.y + bz * normal.z);
  stripe = uv.y * len * 0.75;
  `,
});

// Anemone Garden: thousands of slender striped tentacles, waves of motion
// running from root to tip.
export const createAnemone = striped({
  geometry: () => new THREE.ConeGeometry(1, 1, 9, 12).translate(0, 0.5, 0),
  count: 1500,
  band: 0.42,
  crawl: 0.25,
  colourway: 1,
  period: 35,
  body: /* glsl */ `
  z = wrapZ(aI * ${(240 / 1500).toFixed(4)}, ${HALF}.0);
  float ang = aI * ${GOLDEN};
  ${FRAME}
  float len = 2.6 + aSeed.x * 2.6;
  float rad = 0.34 + aSeed.y * 0.22;
  vec3 axis = normalize(-er + et * (aSeed.z - 0.5) * 0.9 + ez * 0.35);
  vec3 bx = normalize(cross(axis, ez));
  vec3 bz = cross(bx, axis);
  float y = position.y;
  float taper = mix(1.0, 0.35, y) / max(1.0 - y, 0.08);            // keep some thickness toward the tip
  float w1 = sin(y * 3.2 - t * 1.3 + aI * 0.7);
  float w2 = cos(y * 2.6 - t * 1.0 + aI * 1.1);
  vec3 wave = (et * w1 + ez * w2) * y * 0.55 * (0.6 + 0.4 * sin(t * 0.3 + ang));
  p = er * 7.8 + (bx * position.x + bz * position.z) * rad * min(taper, 3.0) + axis * y * len + wave + vec3(0.0, 0.0, z);
  n = normalize(bx * normal.x + axis * normal.y * 0.2 + bz * normal.z);
  stripe = y * len;
  `,
});

// Living Bloom: the wall itself is alive. Bullseye domes drift across it,
// press against each other, merge and part, so the pattern is always becoming
// something else.
export function createLiving() {
  const WALL = 7.8;
  const CELLS = 9; // bullseyes around the tunnel
  const CELL = (2 * Math.PI * WALL) / CELLS;
  const room = enclosure({ colourway: 0, period: 35, wall: WALL, paintedWall: false });
  const bandU = { value: 0.5 };

  // distance to the nearest drifting centre, in cell units, plus which centre
  const FIELD = /* glsl */ `
vec3 field(float a, float track, float t) {
  vec2 p = vec2(a / 6.28318 * ${CELLS}.0, track / ${CELL.toFixed(4)});
  vec2 ip = floor(p), fp = fract(p);
  float best = 8.0;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 c = vec2(mod(ip.x + g.x, ${CELLS}.0), mod(ip.y + g.y, 512.0));
      vec2 h = hash22(c);
      vec2 o = 0.5 + 0.42 * sin(t * (0.25 + 0.2 * h.yx) + 6.28318 * h);     // each centre wanders
      float d = length(g + o - fp);
      if (d < best) { best = d; id = c; }
    }
  }
  return vec3(best, id);
}
`;
  const vert = /* glsl */ `
varying vec3 vWall;          // direction around the tunnel (x, y) and z
${JOURNEY_GLSL}
${FIELD}
void main() {
  float a = atan(position.y, position.x);
  float track = position.z - uTravel;
  float d = field(a, track, uTime).x;
  float lift = sqrt(max(0.0, 1.0 - d * d / 0.42)) * 2.5;            // a dome over each centre
  vWall = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * (${WALL.toFixed(1)} - lift), position.z, 1.0);
}
`;
  const frag = /* glsl */ `
uniform float uBand;
varying vec3 vWall;
${JOURNEY_GLSL}
${BANDS_GLSL}
${FIELD}
void main() {
  // the angle is taken per pixel so there is no seam where it wraps
  vec3 f = field(atan(vWall.y, vWall.x), vWall.z - uTravel, uTime);
  float flip = hash21(f.yz) < 0.5 ? 1.0 : -1.0;                     // some pour outward, some inward
  float s = f.x * ${CELL.toFixed(4)} / uBand - flip * uTime * 0.3;
  gl_FragColor = vec4(bands(s, abs(vWall.z) / ${HALF}.0) * (1.0 - 0.25 * smoothstep(0.35, 0.7, f.x)), 1.0);
}
`;
  // a finely divided tube, so the vertex shader has something to push inward
  const AROUND = 120;
  const SEG = 520;
  const pos = [];
  const idx = [];
  for (let s = 0; s <= SEG; s++) {
    const z = -HALF + (s / SEG) * HALF * 2;
    for (let a = 0; a < AROUND; a++) {
      const th = (a / AROUND) * Math.PI * 2;
      pos.push(Math.cos(th), Math.sin(th), z);
    }
    if (s < SEG)
      for (let a = 0; a < AROUND; a++) {
        const p0 = s * AROUND + a;
        const p1 = s * AROUND + ((a + 1) % AROUND);
        idx.push(p0, p0 + AROUND, p1, p1, p0 + AROUND, p1 + AROUND);
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const skin = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({ uniforms: { ...room.uniforms, uBand: bandU }, vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide })
  );
  skin.frustumCulled = false;
  room.group.add(skin);

  const update = (dt, t) => {
    room.tick(t);
    bandU.value = 0.5 * (1 + 0.2 * Math.sin(t * 0.13));
  };
  update(0, journey.uTime.value);
  return { group: room.group, speed: 3, update };
}
