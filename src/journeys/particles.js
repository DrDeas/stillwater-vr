import * as THREE from 'three';
import { journey, JOURNEY_GLSL, createMotes } from './common.js';
import { mulberry32 } from '../world/noise.js';

// Forms drawn in points of light. Each scene supplies a `build(i, rand)` that
// returns [x, y, z, a, b, c, d] per point (three free values in `position`,
// four in `aSeed`) and a vertex-shader body that sets:
//   z     where the point is along the tunnel (use wrapZ)
//   p     its position
//   col   its colour
//   size  its diameter in metres

const FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-r * r * 3.5) * (1.0 - smoothstep(0.7, 1.0, r));
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;

function particles({ count, half = 120, speed = 4, build, body, extras }) {
  const vert = /* glsl */ `
attribute vec4 aSeed;
uniform float uViewH;
varying vec3 vCol;
${JOURNEY_GLSL}
void main() {
  float t = uTime;
  float z = 0.0;
  float size = 0.08;
  vec3 p = vec3(0.0);
  vec3 col = vec3(1.0);
  ${body}
  vCol = col * 1.25 * sqrt(fadeZ(z, ${half.toFixed(1)}));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(size * 1.8 * uViewH * 0.5 * projectionMatrix[1][1] / -mv.z, 1.8, 40.0);
  gl_Position = projectionMatrix * mv;
}
`;
  return () => {
    const rand = mulberry32(count + 11);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const v = build(i, rand);
      pos.set(v.slice(0, 3), i * 3);
      seed.set(v.slice(3, 7), i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uTravel: journey.uTravel, uTime: journey.uTime, uViewH: journey.uViewH },
        vertexShader: vert,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    points.frustumCulled = false;
    const group = new THREE.Group();
    group.add(points);
    if (extras) extras(group);
    return { group, speed };
  };
}

// Double Helix: twin strands and their rungs coil around you, inside a slower outer pair.
const HELIX = { inner: 2 * 2400, rungs: 200 * 12, outer: 2 * 1600 };
export const createHelix = particles({
  count: HELIX.inner + HELIX.rungs + HELIX.outer,
  speed: 4,
  build: (i, rand) => {
    if (i < HELIX.inner) return [0, i % 2, Math.floor(i / 2) * 0.1, 0, rand(), 0, 0];
    i -= HELIX.inner;
    if (i < HELIX.rungs) return [1, 0, Math.floor(i / 12) * 1.2, (i % 12) / 11, rand(), 0, 0];
    i -= HELIX.rungs;
    return [2, i % 2, Math.floor(i / 2) * 0.15, 0, rand(), 0, 0];
  },
  body: /* glsl */ `
  z = wrapZ(position.z, 120.0);
  float track = z - uTravel;
  float twist = track * 0.5;
  if (position.x < 0.5) {
    float ang = twist + position.y * 3.14159;
    p = vec3(cos(ang) * 3.0, sin(ang) * 3.0, z);
    col = pal(position.y * 0.5 + track * 0.004 + t * 0.01);
    size = 0.10;
  } else if (position.x < 1.5) {
    // rungs reach in from each strand but leave the middle clear for you
    float l = aSeed.x < 0.5 ? mix(-1.0, -0.5, aSeed.x * 2.0) : mix(0.5, 1.0, aSeed.x * 2.0 - 1.0);
    p = vec3(cos(twist) * 3.0 * l, sin(twist) * 3.0 * l, z);
    col = pal((l > 0.0 ? 0.2 : 0.7) + track * 0.004 + t * 0.01) * 0.85;
    size = 0.075;
  } else {
    float ang = -track * 0.2 + position.y * 3.14159 + 0.5;
    p = vec3(cos(ang) * 8.5, sin(ang) * 8.5, z);
    col = pal(0.4 + position.y * 0.3 + track * 0.004 + t * 0.01) * 0.8;
    size = 0.15;
  }
  col *= 0.75 + 0.25 * sin(track * 0.9 - t * 1.5);
  `,
});

// Spirograph: each gate is a different looping curve, slowly redrawing itself.
const SPIRO = { gates: 30, per: 420 };
export const createSpiro = particles({
  count: SPIRO.gates * SPIRO.per,
  speed: 4,
  build: (i) => [(i % SPIRO.per) / SPIRO.per, Math.floor(i / SPIRO.per), 0, 0, 0, 0, 0],
  body: /* glsl */ `
  z = wrapZ(position.y * 8.0, 120.0);
  float track = z - uTravel;
  float cell = floor(track / 8.0 + 0.5);
  float k = 3.0 + floor(hash11(cell) * 6.0);                  // 3 to 8 lobes
  float th = position.x * 6.28318;
  float R = 6.0, r = R / k;
  float d = r * (0.3 + 0.7 * (0.5 + 0.5 * sin(cell * 1.3 + t * 0.35)));
  float rot = t * 0.1 * (mod(cell, 2.0) < 0.5 ? 1.0 : -1.0) + cell;
  vec2 q = vec2((R - r) * cos(th) + d * cos((k - 1.0) * th), (R - r) * sin(th) - d * sin((k - 1.0) * th));
  p = vec3(q.x * cos(rot) - q.y * sin(rot), q.x * sin(rot) + q.y * cos(rot), z);
  col = pal(cell * 0.13 + position.x * 0.3 + t * 0.02);
  size = 0.08;
  `,
});

// Bloom Bursts: seeds of light that open into great dandelion heads as you reach them.
const BURST = { n: 90, per: 220 };
export const createBursts = particles({
  count: BURST.n * BURST.per,
  speed: 4,
  build: (i, rand) => [Math.floor(i / BURST.per), 0, 0, rand(), rand(), rand(), rand()],
  body: /* glsl */ `
  float id = position.x;
  float h1 = hash11(id * 1.7 + 3.0), h2 = hash11(id * 3.1 + 7.0), h3 = hash11(id * 5.3 + 1.0);
  z = wrapZ(h3 * 240.0, 120.0);
  float ang = h1 * 6.28318;
  float cr = 5.4 + h2 * h2 * 12.0;
  float grow = smoothstep(-110.0, -4.0, z);
  float rad = (0.3 + 3.0 * grow) * (0.88 + 0.12 * sin(t * 1.2 + id));
  vec3 dir = normalize(aSeed.xyz * 2.0 - 1.0 + 1e-3);
  float f = pow(aSeed.w, 0.35);
  p = vec3(cos(ang) * cr, sin(ang) * cr, z) + dir * rad * f;
  col = mix(vec3(1.0), pal(h1 + t * 0.02), f) * (0.45 + 0.8 * f);
  size = 0.05 + 0.07 * f;
  `,
});

// Jellyfish Deep: luminous jellyfish pulsing gently upward through dark water.
const JELLY = { n: 54, bell: 220, tent: 140 };
export const createJelly = particles({
  count: JELLY.n * (JELLY.bell + JELLY.tent),
  speed: 2.5,
  build: (i, rand) => {
    const per = JELLY.bell + JELLY.tent;
    const k = i % per;
    const id = Math.floor(i / per);
    if (k < JELLY.bell) return [id, 0, 0, rand(), Math.sqrt(rand()), 0, 0];
    const t = k - JELLY.bell;
    return [id, 1, 0, (t % 10) / 10, Math.floor(t / 10) / 13, 0, 0];
  },
  body: /* glsl */ `
  float id = position.x;
  float h1 = hash11(id * 1.7 + 3.0), h2 = hash11(id * 3.1 + 7.0), h3 = hash11(id * 5.3 + 1.0);
  z = wrapZ(h3 * 240.0, 120.0);
  float ang = h1 * 6.28318;
  float cr = 4.8 + h2 * h2 * 13.0;
  float S = 0.7 + hash11(id * 9.1) * 1.1;
  float beat = sin(t * 1.5 + id * 2.0);                       // the swimming pulse
  vec3 c = vec3(cos(ang) * cr, sin(ang) * cr + 0.6 * sin(t * 0.5 + id) + 0.3 * beat, z);
  float th = aSeed.x * 6.28318;
  if (position.y < 0.5) {
    float v = aSeed.y;                                         // 0 crown .. 1 rim
    float rr = sin(v * 1.5708) * (1.0 - 0.28 * beat * v * v);
    float yy = cos(v * 1.5708) * 0.75 + 0.1 * beat * (1.0 - v);
    p = c + vec3(cos(th) * rr, yy, sin(th) * rr) * S;
    col = mix(vec3(0.25, 0.85, 1.0), vec3(0.75, 0.4, 1.0), h1) * (0.3 + 0.7 * v);
    size = 0.06 * S;
  } else {
    float s = aSeed.y;                                         // 0 at the bell .. 1 at the tip
    float sway = sin(t * 1.5 + id * 2.0 - s * 5.0) * 0.2 * s;
    float rr = 0.75 * (1.0 - 0.25 * beat) * (1.0 - 0.35 * s) + sway;
    p = c + vec3(cos(th) * rr, -s * 2.8 - 0.05, sin(th) * rr) * S;
    col = mix(vec3(0.25, 0.85, 1.0), vec3(1.0, 0.5, 0.9), h1) * (1.0 - 0.75 * s);
    size = 0.045 * S;
  }
  `,
  extras: (group) => group.add(createMotes({ count: 2500, half: 120, inner: 1.5, outer: 30, seed: 31, size: 0.05 })),
});
