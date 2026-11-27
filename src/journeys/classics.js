import * as THREE from 'three';
import { journey, JOURNEY_GLSL, createMotes } from './common.js';
import { solids } from './solids.js';
import { particles } from './particles.js';
import { merge } from '../world/common.js';
import { mulberry32 } from '../world/noise.js';

// More screensaver classics, each rebuilt in depth so it surrounds you.

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Pipe Dream: a dozen pipes grow through space at once, turning at right
// angles and never crossing, until the space is full and it all begins again.
// ---------------------------------------------------------------------------
const PIPES = { count: 14, length: 170, step: 2 };
function layPipes() {
  const rand = mulberry32(95);
  const used = new Set();
  const key = (p) => p.join(',');
  const free = (p) => Math.abs(p[0]) <= 6 && Math.abs(p[1]) <= 6 && !(Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1) && !used.has(key(p));
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const segs = [];
  for (let n = 0; n < PIPES.count; n++) {
    let at, dir = DIRS[Math.floor(rand() * 6)];
    do at = [Math.floor(rand() * 13) - 6, Math.floor(rand() * 13) - 6, Math.floor(rand() * 120)]; while (!free(at));
    used.add(key(at));
    for (let s = 0; s < PIPES.length; s++) {
      const options = (rand() < 0.65 ? [dir] : []).concat(DIRS.slice().sort(() => rand() - 0.5));
      const go = options.find((d) => free([at[0] + d[0], at[1] + d[1], (at[2] + d[2] + 120) % 120]));
      if (!go) {
        segs.push(null); // boxed in: this pipe stops early
        continue;
      }
      const next = [at[0] + go[0], at[1] + go[1], (at[2] + go[2] + 120) % 120];
      const axis = go[0] ? 0 : go[1] ? 1 : 2;
      segs.push([(at[0] + go[0] / 2) * PIPES.step, (at[1] + go[1] / 2) * PIPES.step, (at[2] + go[2] / 2) * PIPES.step, segs.length + axis / 4 + 0.1]);
      used.add(key(next));
      at = next;
      dir = go;
    }
  }
  return segs;
}
let pipeSegs = null;
export const createPipeDream = solids({
  geometry: () => {
    const tube = new THREE.CylinderGeometry(0.42, 0.42, PIPES.step, 7, 1, true);
    const joint = new THREE.IcosahedronGeometry(0.58, 1).translate(0, PIPES.step / 2, 0);
    const g = merge([tube, joint]);
    g.computeVertexNormals();
    return g;
  },
  count: PIPES.count * PIPES.length,
  speed: 2,
  seed: (i) => (pipeSegs ||= layPipes())[i] || [0, 0, 0, -1],
  body: /* glsl */ `
  const float LEN = ${PIPES.length}.0;
  float order = floor(aSeed.w);
  float axis = floor(fract(aSeed.w) * 4.0 + 0.2);
  float T = mod(t * 5.0, LEN * 1.3);
  float grow = aSeed.w < 0.0 ? 0.0 : clamp(T - mod(order, LEN), 0.0, 1.0);
  grow *= 1.0 - smoothstep(LEN * 1.22, LEN * 1.3, T);            // all withdraw before it starts over
  vec3 q = position * vec3(step(0.001, grow), grow, step(0.001, grow));
  vec3 nn = normal;
  if (axis < 0.5) { q = q.yxz; nn = nn.yxz; } else if (axis > 1.5) { q = q.xzy; nn = nn.xzy; }
  z = wrapZ(aSeed.z, 120.0);
  p = q + vec3(aSeed.xy, z);
  n = nn;
  hue = floor(order / ${PIPES.length}.0) * 0.173 + 0.05;
  `,
});

// ---------------------------------------------------------------------------
// Soap Bubbles: iridescent bubbles wobble slowly upward all around you.
// ---------------------------------------------------------------------------
export const createBubbles = solids({
  geometry: () => new THREE.SphereGeometry(1, 20, 14),
  count: 300,
  speed: 1.2,
  body: /* glsl */ `
  z = wrapZ(aSeed.z * 240.0, 120.0);
  float ang = aSeed.x * 6.28318 + 0.3 * sin(t * 0.2 + aI);
  float r = 2.8 + aSeed.y * aSeed.y * 13.0;
  float rise = mod(aSeed.y * 77.0 + t * (0.35 + aSeed.w * 0.5), 34.0) - 17.0;
  float s = 0.35 + aSeed.w * aSeed.w * 1.5;
  vec3 wob = 1.0 + 0.07 * vec3(sin(t * 1.7 + aI), sin(t * 2.1 + aI * 1.3), sin(t * 1.9 + aI * 0.7));
  // to either side of you, never through you
  float xx = (aSeed.x < 0.5 ? -1.0 : 1.0) * (1.6 + s + r - 2.8) + sin(t * 0.5 + aI) * 0.4 + 0.0 * ang;
  p = position * s * wob + vec3(xx, rise, z);
  n = normal;
  hue = aSeed.x + t * 0.03 + position.y * 0.12;
  `,
});

// ---------------------------------------------------------------------------
// Aquarium: bright fish circle you in schools, tails beating, in blue water.
// ---------------------------------------------------------------------------
function fishGeometry() {
  const body = new THREE.OctahedronGeometry(1, 1).scale(1, 0.48, 0.24);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([-0.85, 0, 0, -1.7, 0.6, 0, -1.7, -0.6, 0], 3));
  const fin = new THREE.BufferGeometry();
  fin.setAttribute('position', new THREE.Float32BufferAttribute([0.3, 0.42, 0, -0.5, 0.42, 0, -0.3, 0.85, 0], 3));
  const g = merge([body, tail, fin]);
  g.computeVertexNormals();
  return g;
}
const fishSchool = solids({
  geometry: fishGeometry,
  count: 420,
  speed: 0,
  doubleSided: true,
  seed: (i, rand) => [Math.floor(i / 14) + rand() * 0.06, rand(), rand(), rand()], // fourteen to a school
  body: /* glsl */ `
  float school = floor(aSeed.x);
  float h1 = hash11(school * 1.7 + 2.0), h2 = hash11(school * 3.3 + 5.0), h3 = hash11(school * 7.1 + 1.0);
  float dir = h1 < 0.5 ? 1.0 : -1.0;
  float r = 4.0 + h2 * 13.0 + (aSeed.y - 0.5) * 2.4;
  float ang = h3 * 6.28318 + fract(aSeed.x) * 9.0 + dir * t * (0.10 + h1 * 0.12);
  float yy = (h2 - 0.5) * 16.0 * h3 + (aSeed.z - 0.5) * 2.2 + sin(t * 0.4 + school) * 0.8;
  float s = 0.32 + h3 * 0.5;
  vec3 q = position;
  q.z += sin(t * 7.0 + aI + q.x * 2.2) * 0.2 * smoothstep(0.4, -1.4, q.x);      // the tail beats
  vec3 fwd = vec3(-sin(ang), 0.0, cos(ang)) * dir;
  vec3 side = vec3(cos(ang), 0.0, sin(ang));
  p = (fwd * q.x + vec3(0.0, q.y, 0.0) + side * q.z) * s + vec3(cos(ang) * r, yy, sin(ang) * r);
  n = fwd * normal.x + vec3(0.0, normal.y, 0.0) + side * normal.z;
  hue = h1 * 0.9 + t * 0.004;
  z = 0.0;
  `,
});
export function createAquarium() {
  const j = fishSchool();
  const water = new THREE.Mesh(
    new THREE.SphereGeometry(70, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: { uTime: journey.uTime },
      vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
uniform float uTime; varying vec3 vP;
void main() {
  vec3 d = normalize(vP);
  vec3 col = mix(vec3(0.0, 0.05, 0.16), vec3(0.05, 0.42, 0.62), smoothstep(-0.6, 1.0, d.y));
  // shafts of light slanting down from the surface
  float a = atan(d.z, d.x);
  float rays = pow(0.5 + 0.5 * sin(a * 9.0 + sin(a * 4.0 + uTime * 0.2) * 2.0 + uTime * 0.1), 3.0);
  col += vec3(0.25, 0.5, 0.5) * rays * smoothstep(0.0, 0.9, d.y) * 0.5;
  gl_FragColor = vec4(col, 1.0);
}`,
      side: THREE.BackSide,
    })
  );
  water.frustumCulled = false;
  j.group.add(water, createMotes({ count: 900, half: 30, inner: 1.5, outer: 26, seed: 61, size: 0.06 }));
  return j;
}

// ---------------------------------------------------------------------------
// Fireworks: shells climb, burst and fall across the whole sky around you.
// ---------------------------------------------------------------------------
const SHELLS = { n: 50, per: 220 };
export const createFireworks = particles({
  count: SHELLS.n * SHELLS.per,
  speed: 0,
  build: (i, rand) => {
    const v = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
    const l = Math.hypot(...v) || 1;
    return [Math.floor(i / SHELLS.per), 0, 0, v[0] / l, v[1] / l, v[2] / l, rand()];
  },
  body: /* glsl */ `
  float id = position.x;
  float period = 5.0 + 4.0 * hash11(id * 1.3 + 1.0);
  float clock = t / period + hash11(id * 2.7 + 4.0);
  float shot = floor(clock);                       // each firing lands somewhere new
  float u = fract(clock);
  float ha = hash11(id * 3.1 + shot * 1.7), hb = hash11(id * 5.3 + shot * 2.9), hc = hash11(id * 7.7 + shot * 0.61);
  float ang = ha * 6.28318;
  float dist = 20.0 + hb * 24.0;
  vec3 burst = vec3(cos(ang) * dist, 6.0 + hc * 26.0, sin(ang) * dist);
  const float FUSE = 0.16;
  if (u < FUSE) {
    // the shell climbing: every spark rides together
    float k = u / FUSE;
    p = vec3(burst.x, mix(-14.0, burst.y, 1.0 - (1.0 - k) * (1.0 - k)), burst.z) + aSeed.xyz * 0.12;
    col = vec3(1.0, 0.8, 0.5) * 0.5;
    size = 0.3;
  } else {
    float k = (u - FUSE) / (1.0 - FUSE);
    float R = (6.0 + hc * 6.0) * (0.55 + 0.45 * aSeed.w);
    p = burst + aSeed.xyz * R * (1.0 - exp(-k * 4.0)) - vec3(0.0, k * k * 7.0, 0.0);
    vec3 hue = pal(ha + floor(hb * 3.0) * 0.33);
    col = mix(vec3(1.0), hue, smoothstep(0.0, 0.12, k)) * pow(1.0 - k, 1.6) * (0.75 + 0.25 * sin(t * 30.0 + aSeed.w * 60.0)) * 2.4;
    size = 0.6;
  }
  z = 0.0;
  `,
});

// ---------------------------------------------------------------------------
// Ember Streams: ribbons of glowing sparks swirl around you, each leaving a
// long fading trail.
// ---------------------------------------------------------------------------
const STREAMS = { n: 9, per: 1300 };
export const createEmbers = particles({
  count: STREAMS.n * STREAMS.per,
  speed: 0,
  build: (i, rand) => {
    const v = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
    return [Math.floor(i / STREAMS.per), rand(), 0, v[0], v[1], v[2], rand()];
  },
  body: /* glsl */ `
  float id = position.x;
  float age = fract(position.y + t * 0.16);                 // 0 newly shed .. 1 fading out
  float tau = t * 0.42 - age * 4.2 + id * 3.7;              // where the head was when this spark was shed
  float f1 = 0.7 + hash11(id + 1.0) * 0.5, f2 = 0.5 + hash11(id + 2.0) * 0.6, f3 = 0.6 + hash11(id + 3.0) * 0.5;
  vec3 head = vec3(sin(tau * f1 + id) * 9.0 + sin(tau * 0.31) * 3.0, sin(tau * f2 + id * 2.0) * 6.0, cos(tau * f3 + id * 1.3) * 9.0 + cos(tau * 0.23) * 3.0);
  // never through the middle: push the path out to arm's length and beyond
  head *= max(1.0, 4.0 / max(length(head), 0.5));
  p = head + aSeed.xyz * (0.15 + age * 1.5);
  col = pal(id * 0.11 + tau * 0.04) * pow(1.0 - age, 2.0) * 1.3 + vec3(1.0) * pow(1.0 - age, 12.0) * 0.6;
  size = 0.1 + age * 0.3;
  z = 0.0;
  `,
});

// ---------------------------------------------------------------------------
// Mystify: glowing polygons glide around you, their corners bouncing off
// unseen walls, each trailing a fan of fading echoes.
// ---------------------------------------------------------------------------
export function createMystify() {
  const SHAPES = 3, CORNERS = 4, TRAIL = 26;
  const BOX = new THREE.Vector3(13, 9, 13);
  const rand = mulberry32(73);
  const corners = [];
  for (let i = 0; i < SHAPES * CORNERS; i++) {
    corners.push({
      p: new THREE.Vector3((rand() * 2 - 1) * BOX.x, (rand() * 2 - 1) * BOX.y, (rand() * 2 - 1) * BOX.z),
      v: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(2.2 + rand() * 1.6),
    });
  }
  const history = []; // newest first: arrays of corner positions
  const snapshot = () => corners.map((c) => c.p.clone());
  for (let i = 0; i < TRAIL; i++) history.push(snapshot());

  const verts = SHAPES * TRAIL * CORNERS * 2;
  const pos = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  lines.frustumCulled = false;
  const group = new THREE.Group();
  group.add(lines);

  const c = new THREE.Color();
  let since = 0;
  function update(dt, t) {
    for (const k of corners) {
      k.p.addScaledVector(k.v, dt);
      for (const ax of ['x', 'y', 'z']) {
        if (Math.abs(k.p[ax]) > BOX[ax]) {
          k.p[ax] = Math.sign(k.p[ax]) * BOX[ax];
          k.v[ax] *= -1;
        }
      }
    }
    since += dt;
    if (since > 0.07) {
      since = 0;
      history.pop();
      history.unshift(snapshot());
    } else history[0] = snapshot();

    let o = 0;
    for (let s = 0; s < SHAPES; s++) {
      for (let h = 0; h < TRAIL; h++) {
        const fade = Math.pow(1 - h / TRAIL, 1.6);
        c.setHSL((s / SHAPES + t * 0.02) % 1, 0.9, 0.55).multiplyScalar(fade);
        for (let e = 0; e < CORNERS; e++) {
          const a = history[h][s * CORNERS + e];
          const b = history[h][s * CORNERS + ((e + 1) % CORNERS)];
          pos.set([a.x, a.y, a.z, b.x, b.y, b.z], o * 3);
          col.set([c.r, c.g, c.b, c.r, c.g, c.b], o * 3);
          o += 2;
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
  return { group, speed: 0, update };
}
