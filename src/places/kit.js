import * as THREE from 'three';
import { shared, merge, paint, polarGrid } from '../world/common.js';
import { mulberry32, fbm, ridged } from '../world/noise.js';

// A kit for building places: still, explorable settings (a beach, a garden,
// a street) as opposed to the journeys. Everything is procedural low-poly:
// a sky, a terrain, optional water, and props assembled from simple solids,
// all lit by one sun with soft sky light and haze.
//
//   export const createBeach = place({ sky, light, fog, spawn, radius }, (k) => {
//     k.terrain({ ... });  k.water({ ... });  k.palm(x, z);  ...
//     return (x, z) => groundHeightAt(x, z);     // where the visitor stands
//   });

// Colours are used exactly as written (these shaders output them directly).
const BODY = 0.25; // the visitor's own radius, metres
const C = (v) => (v instanceof THREE.Color ? v : new THREE.Color().setHex(v, THREE.LinearSRGBColorSpace));
const { lerp, clamp } = THREE.MathUtils;
/** Smooth 0..1 ramp as x goes from a to b. Works in either direction (a may be greater than b). */
const smoothstep = (x, a, b) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export { smoothstep, lerp, clamp, fbm, ridged };

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const LIT_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = mat3(modelMatrix) * normal;
  vCol = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const HAZE_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uFogCol;
uniform vec3 uFogSun;
uniform float uFogDensity;
vec3 haze(vec3 col, vec3 world) {
  vec3 view = world - cameraPosition;
  float dist = length(view);
  float f = 1.0 - exp(-dist * uFogDensity);
  float sunward = pow(max(dot(view / dist, uSunDir), 0.0), 6.0);
  return mix(col, mix(uFogCol, uFogSun, sunward), f);
}
`;

const LIT_FRAG = /* glsl */ `
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform vec3 uLampPos[4];
uniform vec3 uLampCol[4];
uniform float uFlicker;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
${HAZE_GLSL}
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 light = (mix(uGroundCol, uSkyCol, N.y * 0.5 + 0.5) + uSunCol * max(dot(N, uSunDir), 0.0)) * 0.78;
  for (int i = 0; i < 4; i++) {
    vec3 L = uLampPos[i] - vWorld;
    float d2 = dot(L, L);
    light += uLampCol[i] * uFlicker * max(dot(N, L) * inversesqrt(d2) * 0.7 + 0.3, 0.0) / (1.0 + d2 * 0.12);
  }
  gl_FragColor = vec4(haze(vCol * light, vWorld), 1.0);
}
`;

const GLOW_FRAG = /* glsl */ `
uniform float uFlicker;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
${HAZE_GLSL}
void main() {
  gl_FragColor = vec4(mix(vCol * (0.9 + 0.1 * uFlicker), haze(vCol, vWorld), 0.5), 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uNadir;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunSize;
uniform float uStars;
uniform float uCloud;
uniform vec3 uCloudCol;
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vDir;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
  col = mix(col, uNadir, smoothstep(0.0, -0.25, d.y));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(s, 5.0) * 0.28 + pow(s, 60.0) * 0.5);

  if (uStars > 0.0 && d.y > -0.05) {
    vec3 q = d * 170.0;
    vec3 f = fract(q) - 0.5;
    float star = step(0.992, hash13(floor(q))) * (1.0 - smoothstep(0.0, 0.3, length(f)));
    col += vec3(0.9, 0.95, 1.0) * star * uStars * smoothstep(0.0, 0.3, d.y + 0.05);
  }
  if (uCloud > 0.0 && d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.14);
    float n = texture2D(uNoise, p * 0.06 + uTime * 0.0016).r * 0.6 + texture2D(uNoise, p * 0.17 - uTime * 0.0023).g * 0.4;
    float c = smoothstep(1.0 - uCloud, 1.05 - uCloud * 0.55, n) * smoothstep(0.0, 0.18, d.y);
    vec3 lit = mix(uCloudCol, uSunCol + uCloudCol * 0.5, pow(s, 3.0) * 0.8);
    col = mix(col, lit, c * 0.85);
  }
  float disc = 1.0 - smoothstep(uSunSize, uSunSize + 0.004, acos(clamp(dot(d, uSunDir), -1.0, 1.0)));
  col = mix(col, uSunCol * 1.5 + 0.3, disc);
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const WATER_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunCol;
uniform vec3 uDeep;
uniform float uCalm;
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vWorld;
${HAZE_GLSL}
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 uv = vWorld.xz;
  vec2 n1 = texture2D(uNoise, uv * 0.05 + uTime * vec2(0.006, 0.004)).rg - 0.5;
  vec2 n2 = texture2D(uNoise, uv * 0.19 - uTime * vec2(0.010, -0.007)).gb - 0.5;
  vec2 n3 = texture2D(uNoise, uv * 0.9 + uTime * vec2(-0.02, 0.025)).br - 0.5;
  vec2 slope = (n1 + n2 * 0.6 + n3 * 0.3 / (1.0 + dist * 0.03)) * uCalm;
  vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = mix(uHorizon, uZenith, pow(R.y, 0.55));
  float s = max(dot(R, uSunDir), 0.0);
  sky += uSunCol * (pow(s, 5.0) * 0.3 + pow(s, 90.0) * 0.9 + pow(s, 900.0) * 3.0);
  float fres = 0.08 + 0.92 * pow(1.0 - max(dot(V, N), 0.0), 3.0);
  gl_FragColor = vec4(haze(mix(uDeep, sky, fres), vWorld), 1.0);
}
`;

const MOTE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uDrift;         // metres per second (y negative = falling)
uniform float uSway;
uniform float uSize;
uniform float uTwinkle;
uniform float uTime;
uniform float uViewH;
varying float vA;
void main() {
  vec3 p = mod(position + uDrift * uTime * (0.7 + 0.6 * aSeed.x), uBoxSize);
  p.x += sin(uTime * (0.4 + aSeed.y) + aSeed.z * 40.0) * uSway;
  p.z += cos(uTime * (0.3 + aSeed.z) + aSeed.x * 40.0) * uSway;
  p += uBoxMin;
  // fade at the top and bottom of the box so nothing pops
  float fy = (p.y - uBoxMin.y) / uBoxSize.y;
  vA = smoothstep(0.0, 0.1, fy) * (1.0 - smoothstep(0.9, 1.0, fy)) * mix(1.0, 0.5 + 0.5 * sin(uTime * (1.0 + aSeed.w * 2.0) + aSeed.x * 50.0), uTwinkle);
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uSize * (0.6 + 0.8 * aSeed.w) * uViewH * 0.5 * projectionMatrix[1][1] / -mv.z, 1.0, 40.0);
  gl_Position = projectionMatrix * mv;
}
`;

// ---------------------------------------------------------------------------
// The kit
// ---------------------------------------------------------------------------

export function place(opts, build) {
  return () => {
    const group = new THREE.Group();
    const rand = mulberry32(opts.seed || 1);
    const sun = new THREE.Vector3(...opts.sky.sun).normalize();
    const flicker = { value: 1 };
    const lampPos = [0, 1, 2, 3].map(() => new THREE.Vector3(0, -999, 0));
    const lampCol = [0, 1, 2, 3].map(() => new THREE.Color(0, 0, 0));
    const hazeU = {
      uSunDir: { value: sun },
      uFogCol: { value: C(opts.fog.col) },
      uFogSun: { value: C(opts.fog.sun ?? opts.fog.col) },
      uFogDensity: { value: opts.fog.density },
    };
    const litU = {
      ...hazeU,
      uSunCol: { value: C(opts.light.sun) },
      uSkyCol: { value: C(opts.light.sky) },
      uGroundCol: { value: C(opts.light.ground) },
      uLampPos: { value: lampPos },
      uLampCol: { value: lampCol },
      uFlicker: flicker,
    };
    const lit = new THREE.ShaderMaterial({ vertexColors: true, uniforms: litU, vertexShader: LIT_VERT, fragmentShader: LIT_FRAG, side: THREE.DoubleSide });
    const glow = new THREE.ShaderMaterial({ vertexColors: true, uniforms: { ...hazeU, uFlicker: flicker }, vertexShader: LIT_VERT, fragmentShader: GLOW_FRAG, side: THREE.DoubleSide });

    // --- sky
    const skyU = {
      uZenith: { value: C(opts.sky.zenith) },
      uHorizon: { value: C(opts.sky.horizon) },
      uNadir: { value: C(opts.sky.nadir ?? opts.fog.col) },
      uSunDir: { value: sun },
      uSunCol: { value: C(opts.sky.sunCol ?? opts.light.sun) },
      uSunSize: { value: opts.sky.sunSize ?? 0.035 },
      uStars: { value: opts.sky.stars ?? 0 },
      uCloud: { value: opts.sky.cloud ?? 0 },
      uCloudCol: { value: C(opts.sky.cloudCol ?? 0xffffff) },
      uTime: shared.uTime,
      uNoise: shared.uNoise,
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 32, 20),
      new THREE.ShaderMaterial({
        uniforms: skyU,
        vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    dome.renderOrder = -20;
    dome.frustumCulled = false;
    group.add(dome);

    const parts = { lit: [], glow: [] };
    // Solid things the visitor cannot walk through. Recorded automatically
    // as shapes are added; pass { solid: false } to leave one out.
    const obstacles = [];
    let inMoving = 0;
    const solid = (ob, o = {}) => {
      if (inMoving || o.solid === false || Math.abs(o.rx || 0) > 0.3 || Math.abs(o.rz || 0) > 0.3) return;
      if (Math.hypot(ob.x, ob.z) > (opts.radius ?? 60) + 8) return; // out of reach anyway
      obstacles.push(ob);
    };
    const updaters = [];
    let lamps = 0;
    const m4 = new THREE.Matrix4();
    const euler = new THREE.Euler();

    /** Add a geometry at (x, y, z), turned by ry (and tilted by rx, rz), painted one colour. */
    const put = (geo, x, y, z, color, o = {}) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      m4.makeRotationFromEuler(euler.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')).setPosition(x, y, z);
      g.applyMatrix4(m4);
      g.computeVertexNormals();
      paint(g, C(color), o.jitter ?? 0.05, rand);
      (o.glow ? parts.glow : parts.lit).push(g);
    };

    const k = {
      rand,
      sun,
      group,
      // --- solids: y is always the base of the shape
      box: (x, y, z, sx, sy, sz, color, o) => {
        solid({ x, z, hw: sx / 2, hd: sz / 2, ry: o?.ry || 0, base: y, top: y + sy }, o);
        put(new THREE.BoxGeometry(sx, sy, sz).translate(0, sy / 2, 0), x, y, z, color, o);
      },
      cyl: (x, y, z, rTop, rBot, h, color, o = {}) => (Math.max(rTop, rBot) >= 0.1 && solid({ x, z, r: Math.max(rTop, rBot), base: y, top: y + h }, o), put(new THREE.CylinderGeometry(rTop, rBot, h, o.seg || 8).translate(0, h / 2, 0), x, y, z, color, o)),
      cone: (x, y, z, r, h, color, o = {}) => (solid({ x, z, r: r * 0.5, base: y, top: y + h }, o), put(new THREE.ConeGeometry(r, h, o.seg || 7).translate(0, h / 2, 0), x, y, z, color, o)),
      ball: (x, y, z, r, color, o = {}) => (solid({ x, z, r: r * 0.8, base: y - r * (o.sy ?? 1), top: y + r * (o.sy ?? 1) }, o), put(new THREE.IcosahedronGeometry(r, o.detail ?? 1).scale(1, o.sy ?? 1, o.sz ?? 1), x, y, z, color, o)),
      /** A gabled roof: ridge runs along local z. */
      gable: (x, y, z, sx, h, sz, color, o) => {
        const a = sx / 2, b = sz / 2;
        const v = [-a, 0, -b, a, 0, -b, 0, h, -b, -a, 0, b, a, 0, b, 0, h, b];
        const idx = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        g.setIndex(idx);
        put(g, x, y, z, color, o);
      },
      /** A flat disc or ring lying on the ground. */
      disc: (x, y, z, r, color, o = {}) => put(new THREE.CircleGeometry(r, o.seg || 20).rotateX(-Math.PI / 2), x, y, z, color, o),
      /** A half-round arch standing upright, facing local z. */
      arch: (x, y, z, r, depth, color, o = {}) => put(new THREE.CylinderGeometry(r, r, depth, 14, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), x, y, z, color, o),
      /** Anything already built as a geometry. */
      geo: (g, x, y, z, color, o) => put(g, x, y, z, color, o),

      // --- plants and rocks
      pine(x, y, z, s = 1, color = 0x1f4a35, o = {}) {
        k.cyl(x, y, z, 0.12 * s, 0.2 * s, 1.4 * s, 0x4a3426);
        for (let i = 0; i < 4; i++) {
          k.cone(x, y + (1.0 + i * 1.15) * s, z, (1.7 - i * 0.36) * s, 1.9 * s, color, { ry: rand() * 3, jitter: 0.1 });
          if (o.snow) k.cone(x, y + (1.75 + i * 1.15) * s, z, (1.05 - i * 0.24) * s, 1.15 * s, 0xf2f6ff, { ry: rand() * 3 });
        }
      },
      tree(x, y, z, s = 1, colors = [0x3f7d3a, 0x4f9444, 0x2f6a32]) {
        const lean = (rand() - 0.5) * 0.2;
        k.cyl(x, y, z, 0.16 * s, 0.26 * s, 2.6 * s, 0x5a4030, { rz: lean });
        for (let i = 0; i < 5; i++) {
          const a = rand() * 6.28;
          const r = i === 0 ? 0 : 1.1 * s;
          k.ball(x + Math.cos(a) * r, y + (3.1 + rand() * 1.5) * s, z + Math.sin(a) * r, (1.3 + rand() * 0.7) * s, colors[i % colors.length], { jitter: 0.12, ry: rand() * 3 });
        }
      },
      palm(x, y, z, s = 1) {
        const lean = (rand() - 0.5) * 0.5;
        const dir = rand() * 6.28;
        let px = x, py = y, pz = z;
        for (let i = 0; i < 6; i++) {
          const t = i / 6;
          k.cyl(px, py, pz, 0.14 * s, 0.17 * s, 1.25 * s, 0x8a6a4a, { rz: lean * t * 1.6, ry: dir });
          px += Math.cos(dir) * -Math.sin(lean * t * 1.6) * 1.2 * s;
          pz += Math.sin(dir) * Math.sin(lean * t * 1.6) * 1.2 * s;
          py += Math.cos(lean * t * 1.6) * 1.2 * s;
        }
        for (let f = 0; f < 9; f++) {
          const a = (f / 9) * 6.28 + rand() * 0.3;
          const frond = new THREE.BoxGeometry(0.5 * s, 0.05 * s, 3.2 * s).translate(0, 0, 1.6 * s);
          put(frond, px, py, pz, f % 2 ? 0x2f7a3c : 0x3a8f46, { ry: a, rx: 0.35 + rand() * 0.35, jitter: 0.1 });
        }
      },
      rock(x, y, z, s = 1, color = 0x77787f) {
        const g = new THREE.IcosahedronGeometry(1, 1);
        const p = g.attributes.position;
        const sd = Math.floor(rand() * 999);
        for (let i = 0; i < p.count; i++) {
          const f = 0.7 + 0.6 * fbm(p.getX(i) * 1.3 + 5, p.getY(i) * 1.3 + p.getZ(i) * 1.3 + 5, sd, 2);
          p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
        }
        g.scale(s * (0.8 + rand() * 0.6), s * (0.5 + rand() * 0.5), s * (0.8 + rand() * 0.6));
        solid({ x, z, r: s * 0.8, base: y - s * 0.6, top: y + s * 0.5 });
        put(g, x, y - s * 0.2, z, color, { ry: rand() * 6.28, jitter: 0.08 });
      },
      /** A small building: walls, gabled roof, and glowing or dark windows on the front. */
      house(x, y, z, w, h, d, wall, roof, o = {}) {
        k.box(x, y, z, w, h, d, wall, { ry: o.ry });
        k.gable(x, y + h, z, w * 1.12, o.roofH ?? w * 0.45, d * 1.1, roof, { ry: o.ry });
        const ry = o.ry || 0;
        const fx = Math.sin(ry), fz = Math.cos(ry); // facing direction
        const n = o.windows ?? 2;
        for (let i = 0; i < n; i++) {
          const off = ((i + 0.5) / n - 0.5) * w * 0.75;
          k.box(x + fx * (d / 2 + 0.02) + fz * off, y + h * 0.45, z + fz * (d / 2 + 0.02) - fx * off, w * 0.16, h * 0.28, 0.06, o.lit === null ? 0x1c2430 : o.lit ?? 0xffc477, { ry, glow: o.lit !== null, jitter: 0 });
        }
      },

      // --- large pieces
      /** Height-field ground. height(x, z) -> y; color(x, z, y, slope) -> hex or Color. */
      terrain({ size, res = 96, height, color }) {
        const g = new THREE.PlaneGeometry(size, size, res, res).rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
        g.computeVertexNormals();
        const n = g.attributes.normal;
        const col = new Float32Array(p.count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          const v = color(p.getX(i), p.getZ(i), p.getY(i), 1 - n.getY(i));
          c.copy(C(v)).multiplyScalar(0.92 + rand() * 0.16);
          col.set([c.r, c.g, c.b], i * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        group.add(new THREE.Mesh(g, lit));
      },
      /** A ring of distant mountains. */
      mountains({ r0 = 320, depth = 260, height = 150, seed = 3, low = 0x3c4a5c, high = 0x6f7f96, snow = null, freq = 0.005, y = -4, gap = null }) {
        const lo = C(low), hi = C(high), sn = snow !== null ? C(snow) : null;
        const g = polarGrid(200, 9, (a, t, out) => {
          const r = r0 + t * depth;
          const x = Math.sin(a) * r, z = -Math.cos(a) * r;
          const rise = smoothstep(t, 0, 0.6);
          let h = height * rise * (0.25 + 1.25 * ridged(x * freq + 40, z * freq + 40, seed)) * (0.5 + 0.9 * fbm(x * freq * 0.4, z * freq * 0.4, seed + 9, 3));
          if (gap) h *= 0.2 + 0.8 * smoothstep(Math.abs(((a - gap[0] + Math.PI * 3) % (Math.PI * 2)) - Math.PI), 0.05, gap[1]);
          out.x = x; out.z = z; out.y = y + h;
          const hn = h / height;
          out.color.copy(lo).lerp(hi, smoothstep(hn, 0.1, 0.6));
          if (sn) out.color.lerp(sn, smoothstep(hn, 0.55, 0.9));
        });
        const mesh = new THREE.Mesh(g, lit);
        mesh.frustumCulled = false;
        group.add(mesh);
      },
      /** A sheet of water reflecting the sky. */
      water({ level = 0, size = 3000, deep = 0x0b2a3a, calm = 0.25 }) {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
          new THREE.ShaderMaterial({
            uniforms: { ...hazeU, uZenith: skyU.uZenith, uHorizon: skyU.uHorizon, uSunCol: skyU.uSunCol, uDeep: { value: C(deep) }, uCalm: { value: calm }, uTime: shared.uTime, uNoise: shared.uNoise },
            vertexShader: 'varying vec3 vWorld; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
            fragmentShader: WATER_FRAG,
          })
        );
        mesh.position.y = level;
        group.add(mesh);
        return mesh;
      },
      /** Drifting specks: snow, leaves, petals, dust, fireflies. box = [minX, minY, minZ, sizeX, sizeY, sizeZ]. */
      motes({ count = 600, box, color = 0xffffff, size = 0.06, drift = [0, -0.5, 0], sway = 0.3, twinkle = 0, additive = false }) {
        const pos = new Float32Array(count * 3);
        const seed = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
          pos.set([rand() * box[3], rand() * box[4], rand() * box[5]], i * 3);
          seed.set([rand(), rand(), rand(), rand()], i * 4);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
        const col = C(color);
        const pts = new THREE.Points(
          g,
          new THREE.ShaderMaterial({
            uniforms: {
              uBoxMin: { value: new THREE.Vector3(box[0], box[1], box[2]) },
              uBoxSize: { value: new THREE.Vector3(box[3], box[4], box[5]) },
              uDrift: { value: new THREE.Vector3(...drift) },
              uSway: { value: sway },
              uSize: { value: size },
              uTwinkle: { value: twinkle },
              uTime: shared.uTime,
              uViewH: shared.uViewH,
              uCol: { value: col },
            },
            vertexShader: MOTE_VERT,
            fragmentShader: additive
              ? 'uniform vec3 uCol; varying float vA; void main() { float r = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(uCol * exp(-r * r * 4.0) * vA, 1.0); }'
              : 'uniform vec3 uCol; varying float vA; void main() { if (length(gl_PointCoord - 0.5) > 0.5 || vA < 0.3) discard; gl_FragColor = vec4(uCol, 1.0); }',
            transparent: additive,
            depthWrite: !additive,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          })
        );
        pts.frustumCulled = false;
        pts.renderOrder = 2;
        group.add(pts);
      },
      /** A warm light that brightens nearby surfaces (up to four per place). */
      lamp(x, y, z, color = 0xffa24d, strength = 1) {
        if (lamps >= 4) return;
        lampPos[lamps].set(x, y, z);
        lampCol[lamps].copy(C(color)).multiplyScalar(strength);
        lamps++;
      },
      /** Build a separately animated piece: returns a kit that collects into its own movable group. */
      moving(fn) {
        const saved = { lit: parts.lit, glow: parts.glow };
        parts.lit = [];
        parts.glow = [];
        inMoving++;
        fn();
        inMoving--;
        const g = new THREE.Group();
        if (parts.lit.length) g.add(new THREE.Mesh(merge(parts.lit), lit));
        if (parts.glow.length) g.add(new THREE.Mesh(merge(parts.glow), glow));
        parts.lit = saved.lit;
        parts.glow = saved.glow;
        group.add(g);
        return g;
      },
      onUpdate: (fn) => updaters.push(fn),
      materials: { lit, glow },
      uniforms: { haze: hazeU, sky: skyU },
    };

    const height = build(k);
    if (parts.lit.length) group.add(new THREE.Mesh(merge(parts.lit), lit));
    if (parts.glow.length) group.add(new THREE.Mesh(merge(parts.glow), glow));
    group.traverse((o) => (o.frustumCulled = false));

    return {
      group,
      ground: {
        height,
        radius: opts.radius ?? 60,
        /** Is there something solid standing at (x, z), for someone on the ground there? */
        blocked(x, z) {
          const g = height(x, z);
          for (const ob of obstacles) {
            // things underfoot (a deck, a low step) and things overhead (a roof, a kite) do not block
            if (ob.top < g + 0.6 || ob.base > g + 1.9) continue;
            const dx = x - ob.x, dz = z - ob.z;
            if (ob.r !== undefined) {
              if (dx * dx + dz * dz < (ob.r + BODY) * (ob.r + BODY)) return true;
            } else {
              const c = Math.cos(ob.ry), s = Math.sin(ob.ry);
              if (Math.abs(dx * c - dz * s) < ob.hw + BODY && Math.abs(dx * s + dz * c) < ob.hd + BODY) return true;
            }
          }
          return false;
        },
      },
      spawn: opts.spawn ?? [0, 0, 0],
      update(dt, t, head) {
        dome.position.set(head.x, 0, head.z);
        flicker.value = 0.9 + 0.07 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 13.1 + 1.7);
        for (const fn of updaters) fn(dt, t);
      },
    };
  };
}
