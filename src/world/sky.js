import * as THREE from 'three';
import { shared, SKY_GLSL } from './common.js';
import { mulberry32 } from './noise.js';

// Sky dome (gradient, moon, aurora, milky way), star field and shooting stars.
// The lower hemisphere shows the mirrored sky, which is what the lake reflects.

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vDir;
${SKY_GLSL}

vec3 aurora(vec3 d) {
  float az = atan(d.x, -d.z);                       // 0 = straight ahead (-z)
  float win = (1.0 - smoothstep(0.35, 1.7, abs(az + 1.15))); // curtains hang to the left
  if (win <= 0.0) return vec3(0.0);
  float t = uTime * 0.012;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float base = 0.17 + fi * 0.10
      + 0.06 * sin(az * 2.3 + t * 3.0 + fi * 2.0)
      + 0.10 * (texture2D(uNoise, vec2(az * 0.25 + fi * 0.37, t * 0.4)).g - 0.5);
    float h = d.y - base;
    float rays = texture2D(uNoise, vec2(az * 0.9 + fi * 0.5 + t * 0.3, 0.37 + fi * 0.2 + t * 0.15)).r;
    rays = smoothstep(0.12, 0.85, rays);
    float body = smoothstep(-0.02, 0.025, h) * exp(-max(h, 0.0) * (5.5 - fi * 2.0));
    vec3 c = mix(vec3(0.12, 0.95, 0.58), vec3(0.50, 0.25, 0.95), smoothstep(0.0, 0.32, h));
    col += c * body * rays * (0.42 - fi * 0.16);
  }
  return col * win;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 d = normalize(vDir);
  d.y = abs(d.y);                                    // below the horizon: reflection
  vec3 col = skyBase(d);

  // Milky way: a faint dusty band across the sky.
  vec3 bandN = normalize(vec3(0.62, 0.42, -0.66));
  float b = dot(d, bandN);
  float dust = texture2D(uNoise, d.xz * 0.9 + d.y * 0.6).b;
  col += vec3(0.085, 0.095, 0.150) * exp(-b * b * 16.0) * (0.35 + dust) * smoothstep(0.05, 0.45, d.y);

  col += aurora(d);

  // Moon
  float ang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
  float R = 0.046;
  float disc = (1.0 - smoothstep(R - 0.0025, R, ang));
  if (disc > 0.0) {
    vec3 mx = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 my = cross(mx, uMoonDir);
    vec2 mp = vec2(dot(d, mx), dot(d, my)) / R;
    float maria = texture2D(uNoise, mp * 0.11 + 0.31).r * 0.65 + texture2D(uNoise, mp * 0.33 + 0.7).g * 0.35;
    vec3 moon = vec3(1.0, 0.98, 0.93) * (0.86 + 0.20 * smoothstep(0.3, 0.7, maria));
    moon *= 1.0 - 0.10 * dot(mp, mp);
    col = mix(col, moon, disc);
  }

  col += (hash12(gl_FragCoord.xy) - 0.5) * (2.0 / 255.0);   // dither away banding
  gl_FragColor = vec4(col, 1.0);
}
`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec2 aPhase;
uniform float uTime;
uniform float uPx;
uniform vec3 uMoonDir;
varying vec3 vCol;
void main() {
  vec3 d = normalize(position);
  float tw = 0.72 + 0.28 * sin(uTime * aPhase.y + aPhase.x);
  float haze = smoothstep(0.03, 0.30, abs(d.y));
  float nearMoon = (1.0 - smoothstep(0.96, 0.995, dot(vec3(d.x, abs(d.y), d.z), uMoonDir)));
  vCol = color * tw * haze * nearMoon;
  gl_PointSize = aSize * uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.0, 1.0, r));
  gl_FragColor = vec4(vCol * a * a, 1.0);
}
`;

const SHOOT_VERT = /* glsl */ `
attribute vec3 aParam;            // x: 0 head .. 1 tail, y: side, z: mirror sign
uniform vec3 uStart;
uniform vec3 uTravel;
uniform float uProgress;
varying float vA;
void main() {
  float glow = sin(3.14159 * clamp(uProgress, 0.0, 1.0));
  vec3 head = uStart + uTravel * uProgress;
  vec3 p = normalize(head - uTravel * aParam.x * 0.16 * glow) * 1350.0;
  vec3 side = normalize(cross(p, uTravel));
  p += side * aParam.y * 1.6 * (1.0 - aParam.x);
  p.y *= aParam.z;
  vA = glow * (1.0 - aParam.x);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const SHOOT_FRAG = /* glsl */ `
varying float vA;
void main() { gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * vA * vA, 1.0); }
`;

export function createSky() {
  const group = new THREE.Group();
  group.name = 'sky';

  // --- dome
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uNoise: shared.uNoise, uMoonDir: shared.uMoonDir },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    })
  );
  dome.renderOrder = -20;
  dome.frustumCulled = false;
  group.add(dome);

  // --- stars (each one has a mirrored twin for the reflection)
  const rand = mulberry32(7);
  const COUNT = 3600;
  const pos = new Float32Array(COUNT * 6);
  const col = new Float32Array(COUNT * 6);
  const size = new Float32Array(COUNT * 2);
  const phase = new Float32Array(COUNT * 4);
  const bandN = new THREE.Vector3(0.62, 0.42, -0.66).normalize();
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    // Uniform on the upper hemisphere, with a share pulled toward the milky way.
    do {
      v.set(rand() * 2 - 1, rand(), rand() * 2 - 1);
    } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
    v.normalize();
    if (i % 3 === 0) {
      v.addScaledVector(bandN, -v.dot(bandN) * (0.75 + rand() * 0.25)).normalize();
      v.y = Math.abs(v.y);
    }
    const mag = Math.pow(rand(), 5); // few bright, many faint
    const temp = rand();
    c.setRGB(0.75 + 0.25 * temp, 0.8 + 0.1 * temp, 1.0 - 0.3 * temp * temp);
    const bright = 0.35 + 0.65 * mag + (rand() < 0.02 ? 0.4 : 0);
    for (let m = 0; m < 2; m++) {
      const k = i * 2 + m;
      pos.set([v.x * 1400, v.y * 1400 * (m ? -1 : 1), v.z * 1400], k * 3);
      col.set([c.r * bright, c.g * bright, c.b * bright], k * 3);
      size[k] = 1.6 + mag * 3.2;
      phase.set([i * 1.7, 0.6 + (i % 13) * 0.17], k * 2);
    }
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sgeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  sgeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 2));
  const stars = new THREE.Points(
    sgeo,
    new THREE.ShaderMaterial({
      vertexColors: true,
      uniforms: { uTime: shared.uTime, uPx: shared.uPx, uMoonDir: shared.uMoonDir },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  stars.renderOrder = -15;
  stars.frustumCulled = false;
  group.add(stars);

  // --- shooting star (real + mirrored streak in one mesh)
  const params = [];
  const idx = [];
  for (let m = 0; m < 2; m++) {
    const o = m * 4;
    const s = m ? -1 : 1;
    params.push(0, -1, s, 0, 1, s, 1, -1, s, 1, 1, s);
    idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  }
  const shootGeo = new THREE.BufferGeometry();
  shootGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
  shootGeo.setAttribute('aParam', new THREE.BufferAttribute(new Float32Array(params), 3));
  shootGeo.setIndex(idx);
  const shootU = {
    uStart: { value: new THREE.Vector3(0, 1, 0) },
    uTravel: { value: new THREE.Vector3(1, 0, 0) },
    uProgress: { value: 2 },
  };
  const shoot = new THREE.Mesh(
    shootGeo,
    new THREE.ShaderMaterial({
      uniforms: shootU,
      vertexShader: SHOOT_VERT,
      fragmentShader: SHOOT_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  shoot.renderOrder = -14;
  shoot.frustumCulled = false;
  shoot.visible = false;
  group.add(shoot);

  let nextShoot = 9;
  function update(dt, elapsed) {
    if (shoot.visible) {
      shootU.uProgress.value += dt / 1.3;
      if (shootU.uProgress.value >= 1) shoot.visible = false;
    } else if (elapsed > nextShoot) {
      const az = Math.random() * Math.PI * 2;
      const el = 0.45 + Math.random() * 0.5;
      shootU.uStart.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      const ta = Math.random() * Math.PI * 2;
      shootU.uTravel.value.set(Math.cos(ta) * 0.4, -0.12 - Math.random() * 0.1, Math.sin(ta) * 0.4);
      shootU.uProgress.value = 0;
      shoot.visible = true;
      nextShoot = elapsed + 14 + Math.random() * 26;
    }
  }

  return { group, update };
}
