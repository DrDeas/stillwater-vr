import * as THREE from 'three';
import { makeNoiseTexture } from './noise.js';

// ---------------------------------------------------------------------------
// Shared look: one moon, one sky function, one set of uniforms.
//
// The lake is rendered as a true mirror: everything in the `world` group is
// drawn a second time flipped through y = 0, and a translucent water surface
// is laid over the top. That is cheap, stereo-correct in a headset, and needs
// no render targets. Materials therefore carry a `uMirror` uniform (+1 / -1)
// so lighting is evaluated in un-mirrored space and geometry is clipped at
// the waterline.
// ---------------------------------------------------------------------------

export const MOON_DIR = new THREE.Vector3(-0.3, 0.27, -1).normalize();

export const shared = {
  uTime: { value: 0 },
  uNoise: { value: makeNoiseTexture(256) },
  uMoonDir: { value: MOON_DIR },
  uLampPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uLampGlow: { value: 1 },
  uViewH: { value: 800 }, // viewport height in pixels (per eye in XR)
  uPx: { value: 1 }, // pixel scale for fixed-size points (stars)
};

/** Analytic sky colour for a direction with y >= 0. Used by sky, fog and water. */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uMoonDir;
vec3 skyBase(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 zen = vec3(0.010, 0.016, 0.060);
  vec3 mid = vec3(0.035, 0.065, 0.190);
  vec3 hor = vec3(0.215, 0.200, 0.400);
  vec3 c = mix(mid, zen, smoothstep(0.0, 0.8, h));
  c = mix(hor, c, smoothstep(0.0, 0.42, pow(h, 0.55)));
  float az = max(dot(normalize(d.xz + 1e-5), normalize(uMoonDir.xz)), 0.0);
  c += vec3(0.42, 0.20, 0.24) * pow(az, 3.0) * exp(-h * 6.5) * 0.55;   // rose afterglow
  c += vec3(0.05, 0.16, 0.17) * pow(1.0 - az, 2.0) * exp(-h * 9.0);    // teal on the far side
  float m = max(dot(d, uMoonDir), 0.0);
  c += vec3(0.50, 0.58, 0.85) * (pow(m, 28.0) * 0.20 + pow(m, 350.0) * 0.55); // moon halo
  return c;
}
`;

// ---------------------------------------------------------------------------
// Lit material: hemisphere ambient + moonlight + four warm lantern lights,
// aerial-perspective fog that melts into the sky.
// ---------------------------------------------------------------------------

const LIT_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = mat3(m) * normal;
  vCol = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const LIT_FRAG = /* glsl */ `
uniform float uMirror;
uniform float uEmissive;
uniform float uFog;
uniform float uPattern;
uniform float uRim;
uniform float uLampGlow;
uniform vec3 uLampPos[4];
uniform sampler2D uNoise;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
${SKY_GLSL}
void main() {
  if (vWorld.y * uMirror < -0.02) discard;            // clip at the waterline
  vec3 P = vec3(vWorld.x, vWorld.y * uMirror, vWorld.z);
  vec3 N = normalize(vN);
  N.y *= uMirror;
  #ifdef DOUBLE_SIDED
    if (!gl_FrontFacing) N = -N;
  #endif
  float pat = texture2D(uNoise, P.xz * 0.23 + P.y * 0.17).r * 0.45 + texture2D(uNoise, P.xz * 1.9 + P.y * 1.3).g * 0.55;
  vec3 albedo = vCol * (1.0 + (pat - 0.5) * 2.0 * uPattern);
  vec3 light = mix(vec3(0.035, 0.040, 0.070), vec3(0.120, 0.150, 0.290), N.y * 0.5 + 0.5);
  light += vec3(0.55, 0.62, 0.85) * max(dot(N, uMoonDir), 0.0);
  for (int i = 0; i < 4; i++) {
    vec3 L = uLampPos[i] - P;
    float d2 = dot(L, L);
    float ndl = max(dot(N, L) * inversesqrt(d2) * 0.75 + 0.25, 0.0);
    light += vec3(1.0, 0.52, 0.20) * uLampGlow * ndl * 1.5 / (1.0 + d2 * 0.55);
  }
  vec3 view = vWorld - cameraPosition;
  float dist = length(view);
  vec3 Vn = vec3(view.x, view.y * uMirror, view.z) / dist;
  light += vec3(0.16, 0.20, 0.36) * pow(1.0 - abs(dot(N, Vn)), 3.0) * uRim;   // soft sky rim
  vec3 col = albedo * light + vCol * uEmissive;
  float f = (1.0 - exp(-dist * 0.0017)) * uFog;
  col = mix(col, skyBase(normalize(vec3(view.x, dist * 0.05, view.z))), f);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function litMaterial({ emissive = 0, fog = 1, pattern = 0.35, rim = 1, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    side,
    uniforms: {
      uMoonDir: shared.uMoonDir,
      uNoise: shared.uNoise,
      uLampPos: shared.uLampPos,
      uLampGlow: shared.uLampGlow,
      uMirror: { value: 1 },
      uEmissive: { value: emissive },
      uFog: { value: fog },
      uPattern: { value: pattern },
      uRim: { value: rim },
    },
    vertexShader: LIT_VERT,
    fragmentShader: LIT_FRAG,
  });
}

// ---------------------------------------------------------------------------
// Mirror helper
// ---------------------------------------------------------------------------

const mirrorCache = new WeakMap();

function mirrorMaterial(mat) {
  if (!mat.uniforms || !mat.uniforms.uMirror) return mat;
  let m = mirrorCache.get(mat);
  if (!m) {
    m = mat.clone();
    // Share every uniform object with the original so animation stays in sync.
    for (const k of Object.keys(mat.uniforms)) m.uniforms[k] = mat.uniforms[k];
    m.uniforms.uMirror = { value: -1 };
    mirrorCache.set(mat, m);
  }
  return m;
}

/** A reflected copy of `obj` (shares geometry; mirrored materials). */
export function mirrorOf(obj) {
  const copy = obj.clone(true);
  copy.traverse((o) => {
    if (o.material) {
      o.material = mirrorMaterial(o.material);
      o.renderOrder -= 5; // reflections draw before the water surface
    }
  });
  const g = new THREE.Group();
  g.name = 'reflection';
  g.scale.y = -1;
  g.add(copy);
  return g;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Paint a flat vertex colour (with optional per-vertex jitter). */
export function paint(geo, color, jitter = 0, rand = Math.random) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const j = 1 + (rand() - 0.5) * 2 * jitter;
    arr[i * 3] = c.r * j;
    arr[i * 3 + 1] = c.g * j;
    arr[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Merge geometries (position / normal / color) into one non-indexed geometry. */
export function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3).fill(1);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o);
    if (g.attributes.color) col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/** Faceted look: un-index and recompute per-face normals. */
export function faceted(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Glow sprites: soft additive billboards for lanterns, flowers, etc.
// ---------------------------------------------------------------------------

const GLOW_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute float aSize;
attribute float aFlicker;
uniform float uLampGlow;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = aCorner;
  vCol = color * mix(1.0, uLampGlow, aFlicker);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xy += aCorner * aSize;
  gl_Position = projectionMatrix * mv;
}
`;

const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float r2 = dot(vUv, vUv);
  float a = exp(-r2 * 7.0) * 0.5 + exp(-r2 * 70.0) * 0.9;
  a *= (1.0 - smoothstep(0.6, 1.0, sqrt(r2)));
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;

/** items: [{ pos: Vector3, size: metres (radius), color: Color, flicker: 0..1 }] */
export function glowSprites(items) {
  const n = items.length;
  const pos = new Float32Array(n * 12);
  const corner = new Float32Array(n * 8);
  const size = new Float32Array(n * 4);
  const flicker = new Float32Array(n * 4);
  const col = new Float32Array(n * 12);
  const index = [];
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
  items.forEach((it, i) => {
    for (let v = 0; v < 4; v++) {
      pos.set([it.pos.x, it.pos.y, it.pos.z], i * 12 + v * 3);
      corner.set([corners[v * 2], corners[v * 2 + 1]], i * 8 + v * 2);
      size[i * 4 + v] = it.size;
      flicker[i * 4 + v] = it.flicker || 0;
      col.set([it.color.r, it.color.g, it.color.b], i * 12 + v * 3);
    }
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aFlicker', new THREE.BufferAttribute(flicker, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  const mat = new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: { uLampGlow: shared.uLampGlow },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

/**
 * Indexed polar grid (segs around, rows outward) with smooth normals.
 * fn(angle, t, out) fills out.x/y/z and out.color for each vertex.
 */
export function polarGrid(segs, rows, fn) {
  const n = (segs + 1) * (rows + 1);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const index = [];
  const out = { x: 0, y: 0, z: 0, color: new THREE.Color() };
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    for (let j = 0; j <= rows; j++) {
      fn(a, j / rows, out);
      const p = i * (rows + 1) + j;
      pos.set([out.x, out.y, out.z], p * 3);
      col.set([out.color.r, out.color.g, out.color.b], p * 3);
      if (i < segs && j < rows) {
        const q = p + rows + 1;
        index.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}
