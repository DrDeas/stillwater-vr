import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';
import { shared } from '../world/common.js';
import { mulberry32 } from '../world/noise.js';

// Cosmic Drift: flights through the cosmic web, the foam of glowing knots and
// filaments that matter forms on the largest scales.
//
// Each scene is a real three-dimensional web around the flight path: knots
// scattered through space, each joined to its nearest neighbours by filaments,
// all drawn in tens of thousands of points of light, with dust between and
// soft glow around the knots. A painted web on a distant shell closes the
// space so there is structure in every direction.
//
// Nothing holds still. The whole web undulates and slowly twists; knots swell
// and subside; the structure tightens into sharp threads and loosens into fog;
// waves of brightness run along it; colours drift.
//
// A scene supplies its shape (how many knots, how thick the threads), its
// motion (warp, twist, swell, breath, pulse) and a GLSL colour function
//   vec3 tint(float heat, float region, float t)
// where heat runs from 0 (faint outskirts) to 1 (the core of a knot) and
// region (0..1) is a slow field that divides space into differently coloured
// provinces.

const HALF = 120;
const LANE = 3.2; // nothing comes nearer the path than this

function buildWeb({ seed, knots, radius, links, perLink, perKnot, dust, mist, thread, knotSize }) {
  const rand = mulberry32(seed);
  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 1.2;
  const LEN = HALF * 2;
  // knots, kept clear of the path
  const K = [];
  for (let i = 0; i < knots; i++) {
    const a = rand() * Math.PI * 2;
    const r = LANE + 2.5 + Math.sqrt(rand()) * (radius - LANE - 2.5);
    K.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: rand() * LEN, phase: rand(), mass: 0.5 + rand() * rand() * 1.5 });
  }
  const dz = (a, b) => {
    let d = b.z - a.z;
    if (d > LEN / 2) d -= LEN;
    if (d < -LEN / 2) d += LEN;
    return d;
  };
  // join each knot to its nearest neighbours (the route wraps, so distances do too)
  const seen = new Set();
  const L = [];
  K.forEach((a, i) => {
    const near = K.map((b, j) => ({ j, d: Math.hypot(b.x - a.x, b.y - a.y, dz(a, b)) }))
      .filter((n) => n.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, links);
    for (const { j } of near) {
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const b = K[j];
      // skip threads that would cut across the path
      const ex = b.x - a.x, ey = b.y - a.y;
      const u = Math.max(0, Math.min(1, -(a.x * ex + a.y * ey) / (ex * ex + ey * ey || 1)));
      if (Math.hypot(a.x + ex * u, a.y + ey * u) < LANE + 1.2) continue;
      L.push([a, b]);
    }
  });

  const centre = [], offset = [], data = [];
  const add = (cx, cy, cz, ox, oy, oz, phase, heat, size) => {
    centre.push(cx, cy, ((cz % LEN) + LEN) % LEN);
    offset.push(ox, oy, oz);
    data.push(phase, heat, size, rand());
  };
  for (const k of K) {
    const R = knotSize * k.mass;
    for (let n = 0; n < perKnot * k.mass; n++) {
      // dense toward the middle: the core is hottest
      const d = Math.pow(rand(), 1.7);
      const v = [gauss(), gauss(), gauss()];
      const l = Math.hypot(...v) || 1;
      add(k.x, k.y, k.z, (v[0] / l) * d * R, (v[1] / l) * d * R, (v[2] / l) * d * R, k.phase, 1 - d * 0.75, 0.08 + rand() * 0.14);
    }
    for (let n = 0; n < mist; n++) add(k.x, k.y, k.z, gauss() * R * 0.5, gauss() * R * 0.5, gauss() * R * 0.5, k.phase, 0.3, 1.4 + rand() * 2.2);
  }
  for (const [a, b] of L) {
    const span = [b.x - a.x, b.y - a.y, dz(a, b)];
    const len = Math.hypot(...span);
    const n = Math.round(perLink * (0.5 + len / 22));
    for (let i = 0; i < n; i++) {
      const u = rand();
      // threads sag a little and thin toward the middle
      const sag = Math.sin(u * Math.PI);
      const w = thread * (1.25 - 0.6 * sag);
      add(a.x + span[0] * u, a.y + span[1] * u, a.z + span[2] * u, gauss() * w, gauss() * w, gauss() * w, a.phase + (b.phase - a.phase) * u, 0.5 - 0.22 * sag + rand() * 0.12, 0.07 + rand() * 0.1);
    }
  }
  for (let i = 0; i < dust; i++) {
    const a = rand() * Math.PI * 2;
    const r = LANE + Math.sqrt(rand()) * (radius + 6 - LANE);
    add(Math.cos(a) * r, Math.sin(a) * r, rand() * LEN, 0, 0, 0, rand(), 0.08 + rand() * 0.18, 0.05 + rand() * 0.08);
  }
  return { centre: new Float32Array(centre), offset: new Float32Array(offset), data: new Float32Array(data) };
}

function cosmic({ seed, tint, speed = 4, radius = 24, knots = 200, links = 3, perLink = 60, perKnot = 60, dust = 9000, mist = 8, density = 1.7, thread = 0.5, knotSize = 2.2,
  warp = 1.2, twist = 0.25, swell = 0.3, breath = 0.3, pulse = 0.35, spin = 0.0, gain = 1, shell = 0.5, haze = 0.12 }) {
  const HEAD = /* glsl */ `
${JOURNEY_GLSL}
vec3 tint(float heat, float region, float t) {
  ${tint}
}
`;
  const vert = /* glsl */ `
attribute vec3 aCentre;
attribute vec4 aData;        // phase, heat, size, random
uniform float uViewH;
varying vec3 vCol;
${HEAD}
void main() {
  float t = uTime;
  float z = wrapZ(aCentre.z, ${HALF}.0);
  float track = z - uTravel;
  vec3 c = vec3(aCentre.xy, z);
  // the whole web undulates...
  c.xy += vec2(sin(track * 0.07 + c.y * 0.11 + t * 0.23), sin(track * 0.05 + c.x * 0.13 - t * 0.19)) * ${warp.toFixed(3)};
  // ...and slowly winds about the path
  float ang = ${twist.toFixed(3)} * sin(track * 0.03 + t * 0.1) + ${spin.toFixed(3)} * t;
  float cs = cos(ang), sn = sin(ang);
  c.xy = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  // knots swell and subside; the structure tightens to threads and loosens to fog
  float sw = 1.0 + ${swell.toFixed(3)} * sin(t * 0.6 + aData.x * 6.28318 + track * 0.05);
  float loose = 1.0 + ${breath.toFixed(3)} * sin(t * 0.21 + track * 0.022);
  vec3 p = c + position * sw * loose;
  // keep the path clear whatever the motion does
  float r = length(p.xy);
  if (r < ${(LANE - 0.6).toFixed(1)}) p.xy *= ${(LANE - 0.6).toFixed(1)} / max(r, 0.05);

  float region = 0.5 + 0.5 * sin(c.x * 0.09 + c.y * 0.07 + 2.0 * sin(track * 0.035) + t * 0.05);
  float wave = 1.0 + ${pulse.toFixed(3)} * sin(track * 0.16 - t * 0.9 + aData.x * 4.0);
  float heat = clamp(aData.y * wave / loose, 0.0, 1.0);
  float big = step(0.9, aData.z);                               // the soft glow around a knot
  vCol = tint(heat, region, t) * (0.55 + 1.2 * heat) * mix(1.0, 0.2, big) * sqrt(fadeZ(z, ${HALF}.0))
       * (0.8 + 0.2 * sin(t * (0.8 + aData.w * 2.0) + aData.w * 50.0)) * ${gain.toFixed(3)};
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float px = aData.z * sw * uViewH * 0.5 * projectionMatrix[1][1] / -mv.z;
  gl_PointSize = clamp(px, 2.2 * uViewH / 720.0, mix(26.0, 110.0, big));
  gl_Position = projectionMatrix * mv;
}
`;
  const frag = /* glsl */ `
varying vec3 vCol;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-r * r * 3.6) * (1.0 - smoothstep(0.7, 1.0, r));
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;
  // Painted webs: an opaque one on the far wall, so no direction is empty, and
  // a translucent veil of finer threads nearer in, which slides against it as
  // you move. (Every sample scale is a whole number of tiles around the tunnel,
  // and a fixed level of detail is used, so there is no seam where the angle wraps.)
  const WEB = /* glsl */ `
uniform sampler2D uNoise;
varying vec3 vPos;
${HEAD}
float thread(float n, float sharp) { return pow(1.0 - abs(2.0 * n - 1.0), sharp); }
float tx(vec2 uv, float lod, int ch) {
  vec4 v = textureLod(uNoise, uv, lod);
  return ch == 0 ? v.r : (ch == 1 ? v.g : (ch == 2 ? v.b : v.a));
}
`;
  const wallFrag = /* glsl */ `
${WEB}
void main() {
  float t = uTime;
  float track = vPos.z - uTravel;
  float a = atan(vPos.y, vPos.x);
  vec2 uv = vec2(a / 6.28318 * 4.0, track / 60.0);
  uv += (textureLod(uNoise, uv * 0.5 + t * 0.004, 0.0).rg - 0.5) * 0.2;       // the pattern itself drifts and folds
  float web = thread(tx(uv, 0.0, 0), 5.0) * 0.5
            + thread(tx(uv * 2.0 + 0.37, 0.0, 1), 6.0) * 0.4
            + thread(tx(uv * 4.0 + 0.11, 0.0, 2), 7.0) * 0.35
            + thread(tx(uv * 8.0 + 0.53, 1.0, 0), 7.0) * 0.25;
  // bend the sampling so the provinces have wandering borders, not straight ones
  vec2 ru = uv * 0.25 + vec2(0.3 * sin(uv.y * 1.3), 0.3 * sin(uv.x * 3.14159)) + t * 0.002;
  float region = smoothstep(0.3, 0.7, tx(ru, 0.0, 3));
  float clump = smoothstep(0.4, 0.85, tx(uv * 0.75 - t * 0.003, 0.0, 1));
  float heat = clamp(web * (0.45 + 1.1 * clump), 0.0, 1.0);
  vec3 col = tint(heat, region, t) * heat * ${(shell * 1.9).toFixed(3)} + tint(0.3, region, t) * (${haze.toFixed(3)} * (0.5 + 1.2 * clump));
  gl_FragColor = vec4(col * sqrt(fadeZ(vPos.z, ${HALF}.0)), 1.0);
}
`;
  const veilFrag = /* glsl */ `
${WEB}
void main() {
  float t = uTime;
  float track = vPos.z - uTravel;
  float a = atan(vPos.y, vPos.x);
  vec2 uv = vec2(a / 6.28318 * 3.0 + 0.5, track / 34.0 + 0.3);
  uv += (textureLod(uNoise, uv * 1.0 - t * 0.006, 0.0).gb - 0.5) * 0.16;
  float web = thread(tx(uv * 2.0, 0.0, 2), 9.0) * 0.6 + thread(tx(uv * 4.0 + 0.7, 0.0, 0), 10.0) * 0.5 + thread(tx(uv * 8.0 + 0.2, 1.0, 1), 10.0) * 0.3;
  float region = smoothstep(0.3, 0.7, tx(uv / 3.0 + vec2(0.3 * sin(uv.y * 1.7), 0.3 * sin(uv.x * 6.28318)) + t * 0.002, 0.0, 3));
  float clump = smoothstep(0.35, 0.8, tx(uv * 1.0 + t * 0.004, 0.0, 3));
  float heat = clamp(web * clump * 1.5, 0.0, 1.0);
  // fade where it would be seen edge-on or right beside you
  float near = smoothstep(4.0, 16.0, abs(vPos.z));
  gl_FragColor = vec4(tint(heat, region, t) * heat * ${(shell * 1.3).toFixed(3)} * near * sqrt(fadeZ(vPos.z, ${HALF}.0)), 1.0);
}
`;
  return () => {
    const web = buildWeb({ seed, knots, radius, links, perLink: perLink * density, perKnot: perKnot * density, dust, mist, thread, knotSize });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(web.offset, 3));
    geo.setAttribute('aCentre', new THREE.BufferAttribute(web.centre, 3));
    geo.setAttribute('aData', new THREE.BufferAttribute(web.data, 4));
    const points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uTravel: journey.uTravel, uTime: journey.uTime, uViewH: journey.uViewH },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    points.frustumCulled = false;
    points.renderOrder = 2;
    const R = radius + 7;
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, HALF * 2, 64, 1, true).rotateX(Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: { uTravel: journey.uTravel, uTime: journey.uTime, uNoise: shared.uNoise },
        vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: wallFrag,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    wall.frustumCulled = false;
    const veil = new THREE.Mesh(
      new THREE.CylinderGeometry(11, 11, HALF * 2, 48, 1, true).rotateX(Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: { uTravel: journey.uTravel, uTime: journey.uTime, uNoise: shared.uNoise },
        vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: veilFrag,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    veil.frustumCulled = false;
    veil.renderOrder = 1;
    const group = new THREE.Group();
    group.add(wall, veil, points);
    group.userData.points = web.data.length / 4;
    return { group, speed };
  };
}

// Golden Web: amber knots burning white at their hearts, on black.
export const createGoldenWeb = cosmic({
  seed: 11, knots: 240, perKnot: 110, perLink: 34, thread: 0.9, knotSize: 2.8, mist: 4, swell: 0.4, breath: 0.25, haze: 0.05, shell: 0.6,
  tint: /* glsl */ `
  vec3 c = mix(vec3(0.42, 0.14, 0.01), vec3(1.0, 0.58, 0.10), smoothstep(0.0, 0.55, heat));
  return mix(c, vec3(1.0, 0.97, 0.90), smoothstep(0.62, 0.95, heat));`,
});

// Violet Tide: provinces of teal fire in a violet sea, the border always moving.
export const createVioletTide = cosmic({
  seed: 23, knots: 210, perKnot: 70, perLink: 70, thread: 0.6, warp: 1.6, breath: 0.4, haze: 0.3, shell: 0.7,
  tint: /* glsl */ `
  float edge = smoothstep(0.35, 0.65, region + 0.15 * sin(t * 0.3));
  vec3 violet = mix(vec3(0.30, 0.12, 0.42), vec3(0.80, 0.62, 0.95), heat);
  vec3 teal = mix(vec3(0.05, 0.38, 0.40), vec3(0.75, 1.0, 0.97), heat);
  return mix(violet, teal, edge);`,
});

// Midnight Filaments: a fine navy lace with small yellow sparks where threads meet.
export const createMidnight = cosmic({
  seed: 37, knots: 320, links: 4, perKnot: 22, perLink: 62, thread: 0.3, knotSize: 0.9, mist: 1, dust: 9000, warp: 1.0, swell: 0.5, pulse: 0.5, haze: 0.1, shell: 0.75,
  tint: /* glsl */ `
  vec3 c = mix(vec3(0.10, 0.13, 0.40), vec3(0.55, 0.62, 1.0), smoothstep(0.0, 0.6, heat));
  return mix(c, vec3(1.0, 0.95, 0.50), smoothstep(0.7, 0.92, heat));`,
});

// Ember Nebula: cold blue lace crossing banks of orange fire.
export const createEmber = cosmic({
  seed: 41, knots: 200, perKnot: 80, perLink: 64, thread: 0.55, mist: 6, knotSize: 3.0, warp: 1.5, breath: 0.35, haze: 0.34, shell: 0.6,
  tint: /* glsl */ `
  float fire = smoothstep(0.4, 0.75, region + 0.12 * sin(t * 0.25));
  vec3 cold = mix(vec3(0.16, 0.20, 0.50), vec3(1.0, 0.55, 0.85), smoothstep(0.1, 0.9, heat));
  vec3 hot = mix(vec3(0.55, 0.06, 0.02), vec3(1.0, 0.62, 0.12), smoothstep(0.0, 0.6, heat));
  hot = mix(hot, vec3(1.0, 0.98, 0.80), smoothstep(0.7, 1.0, heat));
  return mix(cold, hot, fire);`,
});

// Aurora Web: every colour in turn, sweeping through the web in slow bands.
export const createAuroraWeb = cosmic({
  seed: 53, knots: 220, perKnot: 60, perLink: 70, thread: 0.5, twist: 0.5, warp: 1.5, pulse: 0.5, haze: 0.16, shell: 0.6,
  tint: /* glsl */ `
  vec3 c = 0.55 + 0.45 * cos(6.28318 * (heat * 0.35 + region * 0.6 + t * 0.035 + vec3(0.0, 0.33, 0.67)));
  return mix(c * 0.7, vec3(1.0), smoothstep(0.75, 1.0, heat) * 0.7);`,
});

// Pulsar Bloom: the knots breathe hugely, swelling to blossoms and shrinking to sparks.
export const createPulsar = cosmic({
  seed: 67, knots: 190, perKnot: 120, perLink: 44, thread: 0.45, knotSize: 2.6, mist: 5, swell: 0.75, breath: 0.2, pulse: 0.7, warp: 0.9, haze: 0.1, shell: 0.5,
  tint: /* glsl */ `
  vec3 c = mix(vec3(0.08, 0.20, 0.75), vec3(0.55, 0.80, 1.0), smoothstep(0.0, 0.6, heat));
  c = mix(c, vec3(1.0, 0.45, 0.70), region * region * 0.7);
  return mix(c, vec3(1.0), smoothstep(0.7, 1.0, heat));`,
});

// Dark Matter Storm: the whole web turns and writhes, indigo shot with lime.
export const createStorm = cosmic({
  seed: 79, knots: 230, links: 4, perKnot: 50, perLink: 60, thread: 0.45, speed: 5.5, twist: 0.9, spin: 0.035, warp: 2.2, breath: 0.45, pulse: 0.6, haze: 0.2, shell: 0.7,
  tint: /* glsl */ `
  vec3 c = mix(vec3(0.22, 0.06, 0.62), vec3(0.50, 0.30, 1.0), smoothstep(0.0, 0.45, heat));
  return mix(c, vec3(0.70, 1.0, 0.25), smoothstep(0.5, 0.9, heat + 0.2 * sin(t * 0.4 + region * 6.0)));`,
});

// Genesis: structure condensing out of a glowing fog and dissolving back into it.
export const createGenesis = cosmic({
  seed: 97, knots: 220, perKnot: 80, perLink: 66, thread: 0.7, knotSize: 2.6, mist: 5, speed: 3, breath: 0.85, swell: 0.25, warp: 1.3, haze: 0.26, shell: 0.5,
  tint: /* glsl */ `
  vec3 peach = mix(vec3(0.55, 0.22, 0.20), vec3(1.0, 0.72, 0.50), heat);
  vec3 sea = mix(vec3(0.06, 0.36, 0.38), vec3(0.55, 1.0, 0.90), heat);
  return mix(mix(peach, sea, smoothstep(0.3, 0.7, region)), vec3(1.0, 0.98, 0.94), smoothstep(0.72, 1.0, heat));`,
});
