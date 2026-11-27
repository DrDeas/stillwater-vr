import * as THREE from 'three';
import { journey, JOURNEY_GLSL } from './common.js';

// Painted tunnels: a plain tube whose walls are drawn entirely by a fragment
// shader. Each scene is one small GLSL body that turns
//
//   a      angle around the tunnel (-PI..PI)   -> keep patterns periodic in it
//   track  metres along the route (moves with the walls)
//   far    distance from the viewer along the tunnel
//   t      seconds
//
// into `col`. Everything is slow and continuous: no flashing.

const TAU = '6.28318';

function wall({ radius = 6, half = 120, speed = 4, body }) {
  const frag = /* glsl */ `
varying vec3 vPos;
${JOURNEY_GLSL}
void main() {
  float z = vPos.z;
  float track = z - uTravel;
  float a = atan(vPos.y, vPos.x);
  float far = abs(z);
  float t = uTime;
  float R = ${radius.toFixed(1)};
  vec3 col = vec3(0.0);
  ${body}
  gl_FragColor = vec4(col * fadeZ(z, ${half.toFixed(1)}), 1.0);
}
`;
  return () => {
    const geo = new THREE.CylinderGeometry(radius, radius, half * 2, 96, 1, true).rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uTravel: journey.uTravel, uTime: journey.uTime },
        vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: frag,
        side: THREE.BackSide,
      })
    );
    mesh.frustumCulled = false;
    const group = new THREE.Group();
    group.add(mesh);
    return { group, speed };
  };
}

// Liquid Rainbow: layered sine waves folding over each other, like oil on water.
export const createPlasma = wall({
  speed: 3.5,
  body: /* glsl */ `
  vec2 q = vec2(cos(a), sin(a));
  float v = sin(track * 0.35 + 3.0 * q.x + t * 0.4)
          + sin(track * 0.22 - 4.0 * q.y - t * 0.3)
          + sin(length(vec2(track * 0.3, 5.0 * q.x * q.y)) * 1.5 + t * 0.5)
          + sin(3.0 * a + track * 0.4 + 2.0 * sin(track * 0.15 + t * 0.2));
  col = pal(v * 0.22 + t * 0.03) * (0.5 + 0.5 * sin(v * 4.7));
  `,
});

// Hypno Spiral: broad arms winding down the tunnel, with a finer counter-spiral inside them.
export const createHypno = wall({
  speed: 3.5,
  body: /* glsl */ `
  float w = 0.06 + far * 0.012;
  float s = sin(5.0 * a + track * 1.1 + 1.5 * sin(track * 0.08 + t * 0.15) - t * 0.5);
  float band = smoothstep(-w, w, s);
  vec3 c1 = pal(track * 0.01 + t * 0.02);
  vec3 c2 = pal(track * 0.01 + t * 0.02 + 0.5) * 0.10;
  col = mix(c2, c1, band);
  col *= 0.7 + 0.3 * smoothstep(-w * 2.0, w * 2.0, sin(-9.0 * a + track * 2.3 + t * 0.35));
  `,
});

// Op-Art Warp: a black and white chequerboard that swells and pinches as it passes.
export const createOpArt = wall({
  speed: 3.5,
  body: /* glsl */ `
  float n = 16.0;
  float cell = ${TAU} * R / n;
  float u = a / ${TAU} * n + 0.35 * sin(track / cell * 0.9 + t * 0.4) * sin(a * 2.0);
  float v = track / cell + 0.35 * sin(a * 3.0 + t * 0.3);
  float w = 0.04 + far * 0.02;
  float k = smoothstep(-w, w, sin(3.14159 * u) * sin(3.14159 * v));
  vec3 ink = mix(vec3(1.0), pal(track * 0.008 + t * 0.02), 0.3 + 0.3 * sin(t * 0.17));
  col = mix(vec3(0.015), ink, k);
  `,
});

// Honeycomb Hive: glowing hexagonal cells that light up in slow travelling waves.
export const createHive = wall({
  speed: 3.5,
  body: /* glsl */ `
  float n = 14.0;
  float cell = ${TAU} * R / n;
  vec2 p = vec2(a / ${TAU} * n, track / cell);
  vec2 r = vec2(1.0, 1.7320508), h = r * 0.5;
  vec2 pa = mod(p, r) - h, pb = mod(p - h, r) - h;
  vec2 g = dot(pa, pa) < dot(pb, pb) ? pa : pb;
  vec2 id = p - g;
  float d = 0.5 - max(abs(g.x), dot(abs(g), vec2(0.5, 0.8660254)));     // distance to the cell wall
  float around = cos(id.x * ${TAU} / n * 2.0);
  float wave = sin(id.y * 0.55 - t * 1.1 + around * 2.0);
  vec3 c = pal(id.y * 0.025 + 0.15 * around + t * 0.02);
  float fill = 0.10 + 0.75 * pow(max(wave, 0.0), 3.0);
  col = c * fill * smoothstep(0.0, 0.28, d);
  col += pal(id.y * 0.025 + 0.5 + t * 0.02) * (1.0 - smoothstep(0.0, 0.05 + far * 0.004, d)) * 0.9;
  `,
});

// Stained Glass: drifting cells of colour held in dark leading.
export const createGlass = wall({
  speed: 3,
  body: /* glsl */ `
  float n = 10.0;
  float cell = ${TAU} * R / n;
  vec2 p = vec2(a / ${TAU} * n, track / cell);
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec2 cid = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 c = vec2(mod(ip.x + g.x, n), mod(ip.y + g.y, 512.0));
      vec2 o = 0.5 + 0.38 * sin(t * 0.35 + ${TAU} * hash22(c));
      vec2 rr = g + o - fp;
      float d = dot(rr, rr);
      if (d < d1) { d2 = d1; d1 = d; cid = c; } else if (d < d2) { d2 = d; }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  float lead = smoothstep(0.03, 0.09 + far * 0.004, edge);
  float glow = 0.55 + 0.45 * sin(hash21(cid) * 40.0 + t * 0.6);
  col = pal(hash21(cid + 7.0) + t * 0.015) * (0.3 + 0.7 * smoothstep(0.0, 0.6, edge)) * lead * glow;
  `,
});

// Labyrinth Flow: endless interlocking arcs, with light running along them.
export const createTruchet = wall({
  speed: 3.5,
  body: /* glsl */ `
  float n = 12.0;
  float cell = ${TAU} * R / n;
  vec2 p = vec2(a / ${TAU} * n, track / cell);
  vec2 ip = floor(p), fp = fract(p);
  if (hash21(vec2(mod(ip.x, n), mod(ip.y, 512.0))) < 0.5) fp.x = 1.0 - fp.x;
  float d = min(abs(length(fp) - 0.5), abs(length(fp - 1.0) - 0.5));
  float w = 0.07 + far * 0.004;
  float line = 1.0 - smoothstep(w, w + 0.06, d);
  float core = 1.0 - smoothstep(0.0, 0.03, d);
  float run = 0.55 + 0.45 * sin(track * 0.7 - t * 1.6 + 3.0 * sin(a));
  col = pal(track * 0.01 + t * 0.025 + 0.25 * sin(a)) * line * run + vec3(1.0, 0.95, 0.9) * core * 0.35 * run;
  col += pal(track * 0.01 + 0.5) * 0.035;
  `,
});

// Moire Waves: two sets of stripes sliding across each other, raising slow beats of colour.
export const createMoire = wall({
  speed: 3,
  body: /* glsl */ `
  // Two families of fine lines at almost the same pitch. Where they fall in step the
  // wall is bright, where they fall out of step it darkens: the broad fringes are
  // the pattern, and they move far faster than the lines themselves.
  float A = 64.0 * a + track * 9.0;
  float B = 61.0 * a + track * 8.6 + 2.5 * sin(track * 0.04 + t * 0.12) + t * 0.35;
  float w = 0.25 + far * 0.06;
  float fine = smoothstep(-w, w, sin(A)) * smoothstep(-w, w, sin(B));
  float fringe = 0.5 + 0.5 * cos(A - B);                        // what the eye sees from afar
  float k = mix(fine, 0.25 + 0.3 * fringe, smoothstep(6.0, 26.0, far));
  col = mix(vec3(0.012), mix(vec3(1.0), pal(0.3 * fringe + track * 0.006 + t * 0.02), 0.75), k) * (0.5 + 0.9 * fringe);
  `,
});

// Lava Lamp: the tunnel is a soft skin that swells into great slow blobs,
// which rise, lean into each other, merge and sink away. Unlike the painted
// tunnels above, the wall really moves: the blobs bulge toward you.
export function createLava() {
  const HALF = 120;
  const WALL = 8.2;
  // how far the skin bulges at each point, 0..1 (shared by both shaders)
  const FIELD = /* glsl */ `
float blob(float a, float track, float t) {
  float b = sin(3.0 * a + track * 0.33 + t * 0.4) * sin(track * 0.21 - t * 0.3 + 2.0 * sin(a))
          + 0.6 * sin(5.0 * a - track * 0.47 + t * 0.5 + 1.7 * sin(track * 0.1))
          + 0.5 * sin(2.0 * a + t * 0.25) * cos(track * 0.15 + t * 0.2);
  return smoothstep(-0.7, 1.3, b);
}
`;
  const vert = /* glsl */ `
varying vec3 vWall;
${JOURNEY_GLSL}
${FIELD}
void main() {
  float h = blob(atan(position.y, position.x), position.z - uTravel, uTime);
  vWall = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * (${WALL.toFixed(1)} - h * h * 4.4), position.z, 1.0);
}
`;
  const frag = /* glsl */ `
varying vec3 vWall;
${JOURNEY_GLSL}
${FIELD}
void main() {
  float track = vWall.z - uTravel;
  float h = blob(atan(vWall.y, vWall.x), track, uTime);
  // contour lines across the blobs, like the layers in warm wax
  float lines = 0.5 + 0.5 * sin(h * 26.0 - uTime * 0.8);
  vec3 col = pal(h * 0.7 + track * 0.004 + uTime * 0.02) * (0.3 + 0.7 * h) * (0.55 + 0.45 * lines);
  col += pal(h * 0.7 + 0.5 + uTime * 0.02) * pow(h, 5.0) * 0.5;
  gl_FragColor = vec4(col * fadeZ(vWall.z, ${HALF}.0), 1.0);
}
`;
  const AROUND = 96;
  const SEG = 420;
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
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({ uniforms: { uTravel: journey.uTravel, uTime: journey.uTime }, vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide })
  );
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, speed: 3 };
}
