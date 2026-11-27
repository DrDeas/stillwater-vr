import * as THREE from 'three';
import { litMaterial, merge, paint, faceted, glowSprites, shared } from './common.js';
import { mulberry32 } from './noise.js';
import { PLATFORM, ISLAND, LAKE_SOLIDS } from './terrain.js';

// The meditation platform: a stone disc resting on the lake, a cushion at its
// heart, four lanterns at its rim and stepping stones leading to the island.

export function createPlatform() {
  const group = new THREE.Group();
  group.name = 'platform';
  const rand = mulberry32(3);
  const y = PLATFORM.y;

  // --- stonework
  const stone = [];
  stone.push(paint(new THREE.CylinderGeometry(3.45, 3.62, 0.7, 56).translate(0, y - 0.47, 0), 0x6d6f80, 0.04, rand));
  stone.push(paint(new THREE.CylinderGeometry(PLATFORM.r, PLATFORM.r, 0.12, 72).translate(0, y - 0.06, 0), 0x8f90a3, 0.03, rand));

  // --- lanterns
  const glows = [];
  const lampGeo = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const lx = Math.sin(a) * 2.85;
    const lz = Math.cos(a) * 2.85;
    const at = (g, h) => g.rotateY(a).translate(lx, y + h, lz);
    stone.push(paint(at(new THREE.CylinderGeometry(0.17, 0.21, 0.1, 8), 0.05), 0x77798a));
    stone.push(paint(at(new THREE.CylinderGeometry(0.055, 0.075, 0.62, 8), 0.4), 0x77798a));
    stone.push(paint(at(new THREE.BoxGeometry(0.32, 0.05, 0.32), 0.73), 0x77798a));
    stone.push(paint(at(new THREE.ConeGeometry(0.31, 0.2, 4).rotateY(Math.PI / 4), 1.09), 0x5f6172));
    stone.push(paint(at(new THREE.SphereGeometry(0.04, 8, 6), 1.21), 0x5f6172));
    lampGeo.push(paint(at(new THREE.BoxGeometry(0.2, 0.24, 0.2), 0.87), new THREE.Color(1.0, 0.6, 0.24)));
    const p = new THREE.Vector3(lx, y + 0.87, lz);
    shared.uLampPos.value[k].copy(p);
    LAKE_SOLIDS.push({ x: lx, z: lz, r: 0.24 });
    glows.push({ pos: p, size: 1.15, color: new THREE.Color(0.6, 0.3, 0.1), flicker: 1 });
    glows.push({ pos: p, size: 0.3, color: new THREE.Color(0.9, 0.6, 0.3), flicker: 1 });
  }

  // --- stepping stones toward the island
  const dir = new THREE.Vector2(ISLAND.x, ISLAND.z);
  const total = dir.length();
  dir.normalize();
  for (let d = 4.25; d < total - ISLAND.r + 0.3; d += 1.18) {
    const side = (rand() - 0.5) * 0.5;
    const r = 0.36 + rand() * 0.14;
    const g = new THREE.CylinderGeometry(r, r * 1.15, 0.3, 7)
      .scale(1, 1, 0.8 + rand() * 0.3)
      .rotateY(rand() * 3)
      .translate(dir.x * d - dir.y * side, -0.08, dir.y * d + dir.x * side);
    stone.push(paint(faceted(g), 0x7d7f90, 0.06, rand));
  }
  group.add(new THREE.Mesh(merge(stone), litMaterial({ pattern: 0.3 })));
  group.add(new THREE.Mesh(merge(lampGeo), litMaterial({ emissive: 1.25, pattern: 0 })));

  // --- softly glowing inlaid rings
  const rings = [
    new THREE.RingGeometry(2.3, 2.318, 128),
    new THREE.RingGeometry(1.18, 1.193, 96),
    new THREE.RingGeometry(3.18, 3.19, 128),
  ].map((g) => paint(g.rotateX(-Math.PI / 2).translate(0, y + 0.004, 0), new THREE.Color(0.14, 0.36, 0.46)));
  group.add(new THREE.Mesh(merge(rings), litMaterial({ emissive: 0.7, pattern: 0, fog: 0, rim: 0 })));

  // --- mat and cushion
  const fabric = [
    paint(new THREE.BoxGeometry(1.05, 0.045, 1.05).translate(0, y + 0.022, 0), 0x3a3f95),
    paint(new THREE.SphereGeometry(0.34, 28, 16).scale(1, 0.4, 1).translate(0, y + 0.17, 0), 0xc23a55),
  ];
  group.add(new THREE.Mesh(merge(fabric), litMaterial({ pattern: 0.12 })));

  group.add(glowSprites(glows));
  return group;
}
