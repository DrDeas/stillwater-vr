import * as THREE from 'three';
import { shared, SKY_GLSL } from './common.js';

// The water surface: a translucent sheet over the mirrored world. It darkens
// the reflection when you look down (Fresnel), adds slow ripples that catch
// the sky, and scatters the moon into a long glitter path.

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vWorld;
${SKY_GLSL}
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  vec2 uv = vWorld.xz;
  vec2 n1 = texture2D(uNoise, uv * 0.045 + uTime * vec2(0.0040, 0.0030)).rg - 0.5;
  vec2 n2 = texture2D(uNoise, uv * 0.160 - uTime * vec2(0.0070, -0.0050)).gb - 0.5;
  vec2 n3 = texture2D(uNoise, uv * 0.700 + uTime * vec2(-0.0110, 0.0140)).br - 0.5;
  float calm = 1.0 / (1.0 + dist * 0.012);            // ripples flatten with distance
  vec2 slope = (n1 * 0.9 + n2 * 0.5 + n3 * 0.22 * calm) * 0.2;
  vec3 N = normalize(vec3(slope.x, 1.0, slope.y));

  float fres = pow(1.0 - max(dot(V, N), 0.0), 3.0);
  float alpha = mix(0.66, 0.13, fres);                 // grazing view: pure mirror
  vec3 deep = vec3(0.006, 0.016, 0.040);

  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 R0 = vec3(-V.x, V.y, -V.z);
  float s = max(dot(R, uMoonDir), 0.0);
  vec3 glitter = vec3(1.0, 0.96, 0.88) * (pow(s, 1400.0) * 3.0 + pow(s, 220.0) * 0.16);
  vec3 sheen = max(skyBase(R) - skyBase(R0), 0.0) * 0.45;

  vec3 col = deep * alpha + glitter + sheen;
  float edge = (1.0 - smoothstep(1100.0, 1500.0, length(vWorld.xz - cameraPosition.xz)));
  gl_FragColor = vec4(col * edge, alpha * edge);       // premultiplied
}
`;

export function createWater() {
  const geo = new THREE.CircleGeometry(1500, 72);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uNoise: shared.uNoise, uMoonDir: shared.uMoonDir },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.renderOrder = 0;
  mesh.frustumCulled = false;
  return mesh;
}
