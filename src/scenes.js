import * as THREE from 'three';
import { journey, createBackdrop } from './journeys/common.js';
import { createPrism } from './journeys/prism.js';
import { createMenger } from './journeys/menger.js';
import { createSpiral } from './journeys/spiral.js';
import { createKaleido } from './journeys/kaleido.js';
import { createLight } from './journeys/light.js';
import { createLotus } from './journeys/lotus.js';
import { createHall } from './journeys/hall.js';
import { createFlower } from './journeys/flower.js';

// Scene manifest. The lake is the home scene; every entry with a `create`
// function is a journey (see src/journeys/). Add one here and it appears in
// the page bar and the in-VR panel.
//
//   create() -> { group: THREE.Group, speed: metres per second, update?(dt, t) }

export const SCENES = [
  { id: 'lake', name: 'Stillwater Lake', description: 'Moonlit water, lanterns and a blossom tree' },
  { id: 'prism', name: 'Prism Gates', description: 'Turning rings of light, one inside another', create: createPrism },
  { id: 'passage', name: 'Fractal Passage', description: 'An endless shaft through a Menger sponge', create: createMenger },
  { id: 'spiral', name: 'Spiral Drift', description: 'Coiling arms of stars streaming past', create: createSpiral },
  { id: 'vortex', name: 'Kaleido Vortex', description: 'A tunnel of ever-shifting fractal walls', create: createKaleido },
  { id: 'light', name: 'Into the Light', description: 'A slow approach toward a radiant source', create: createLight },
  { id: 'lotus', name: 'Lotus Mandala', description: 'Flowers of light that open as you arrive', create: createLotus },
  { id: 'hall', name: 'Hall of Light', description: 'An endless vaulted nave of luminous arches', create: createHall },
  { id: 'flower', name: 'Flower of Life', description: 'Turning seals of interlocking circles', create: createFlower },
];

export const findScene = (id) => SCENES.find((s) => s.id === id) || SCENES[0];

export class SceneManager {
  constructor({ scene, lake, rig, camera }) {
    this.lake = lake;
    this.rig = rig;
    this.camera = camera;
    this.currentId = 'lake';
    this.active = null; // the running journey, or null at the lake
    this.built = new Map();

    // Journeys live in one root that is placed around the visitor on entry.
    this.root = new THREE.Group();
    this.root.name = 'journey';
    this.root.visible = false;
    this.backdrop = createBackdrop();
    this.root.add(this.backdrop.group);
    scene.add(this.root);
  }

  get inJourney() {
    return this.active !== null;
  }

  /** Swap scenes immediately (wrap in a fade for a gentle transition). */
  show(id) {
    const def = findScene(id);
    if (def.id === this.currentId) return;
    this.currentId = def.id;
    if (this.active) this.active.group.visible = false;
    this.active = null;

    if (!def.create) {
      this.root.visible = false;
      this.lake.visible = true;
      return;
    }
    if (!this.built.has(def.id)) {
      const j = def.create();
      this.root.add(j.group);
      this.built.set(def.id, j);
    }
    this.active = this.built.get(def.id);
    this.active.group.visible = true;

    // Centre the flight path on the visitor's head, heading where they look.
    this.rig.updateMatrixWorld();
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    this.root.position.copy(head);
    this.root.rotation.y = Math.atan2(-dir.x, -dir.z);
    this.backdrop.anchor.position.y = this.rig.position.y - head.y;
    this.lake.visible = false;
    this.root.visible = true;
  }

  update(dt, t) {
    if (!this.active) return;
    journey.uTravel.value += this.active.speed * dt;
    this.active.update?.(dt, t);
  }
}
