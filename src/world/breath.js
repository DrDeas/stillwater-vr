import * as THREE from 'three';

// Breathing guide: a soft orb hovering over the water that swells as you
// breathe in and settles as you breathe out.

export const BREATH = { inhale: 4.5, exhale: 6.5 };

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += vUv * 1.25;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uBreath;   // 0 = empty, 1 = full
uniform float uOn;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float R = mix(0.26, 0.62, uBreath);
  float orb = exp(-pow(r / R, 2.0) * 2.6) * 0.34;
  float rim = (1.0 - smoothstep(0.0, 0.022, abs(r - R))) * 0.5;
  float guide = (1.0 - smoothstep(0.0, 0.008, abs(r - 0.64))) * 0.12 + (1.0 - smoothstep(0.0, 0.008, abs(r - 0.24))) * 0.08;
  vec3 c = mix(vec3(1.0, 0.72, 0.86), vec3(0.50, 0.80, 1.0), uBreath);
  float a = (orb + rim + guide) * (1.0 - smoothstep(0.8, 1.0, r)) * uOn;
  gl_FragColor = vec4(c * a, 1.0);
}
`;

export function createBreathGuide() {
  const uniforms = { uBreath: { value: 0 }, uOn: { value: 0 } };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  mesh.name = 'breath-guide';
  mesh.position.set(0, 1.5, -6.2);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;

  let on = 0;
  let target = 0;
  function update(dt, elapsed) {
    const cycle = BREATH.inhale + BREATH.exhale;
    const t = elapsed % cycle;
    const k = t < BREATH.inhale ? t / BREATH.inhale : 1 - (t - BREATH.inhale) / BREATH.exhale;
    uniforms.uBreath.value = 0.5 - 0.5 * Math.cos(Math.PI * k); // eased
    on += (target - on) * Math.min(1, dt * 1.5);
    uniforms.uOn.value = on;
    mesh.visible = on > 0.01;
  }
  return { mesh, update, setEnabled: (v) => (target = v ? 1 : 0) };
}
