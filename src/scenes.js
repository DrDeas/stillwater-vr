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
import { createStarfield } from './journeys/starfield.js';
import { createPlasma, createHypno, createOpArt, createHive, createGlass, createTruchet, createMoire } from './journeys/walls.js';
import { createNeon, createSlit, createWormhole } from './journeys/planes.js';
import { createGyro, createCubes, createSierpinski, createCrystal, createPillars, createRibbons } from './journeys/solids.js';
import { createHelix, createSpiro, createBursts, createJelly } from './journeys/particles.js';
import { createCantor, createJacks, createVault, createPipes, createArcade } from './journeys/fractals.js';
import {
  createHorns, createRomanesco, createBullseye, createScales, createCoil,
  createTidal, createWhirl, createShapeshift, createBudding, createToadstools, createAnemone, createLiving,
} from './journeys/striped.js';

// Scene manifest. The lake is the home scene; every entry with a `create`
// function is a journey (see src/journeys/). Add one here and it appears in
// the page bar and the in-VR panel.
//
//   create() -> { group: THREE.Group, speed: metres per second, update?(dt, t) }

export const SCENES = [
  { id: 'lake', group: 'Sanctuary', name: 'Stillwater Lake', description: 'Moonlit water, lanterns and a blossom tree' },

  { id: 'stars', group: 'Stars and geometry', name: 'Starfield', description: 'The classic drift through a quiet field of stars', create: createStarfield },
  { id: 'prism', group: 'Stars and geometry', name: 'Prism Gates', description: 'Turning rings of light, one inside another', create: createPrism },
  { id: 'spiral', group: 'Stars and geometry', name: 'Spiral Drift', description: 'Coiling arms of stars streaming past', create: createSpiral },
  { id: 'vortex', group: 'Stars and geometry', name: 'Kaleido Vortex', description: 'A tunnel of ever-shifting fractal walls', create: createKaleido },

  { id: 'passage', group: 'Fractal architecture', name: 'Fractal Passage', description: 'An endless shaft through a Menger sponge', create: createMenger },
  { id: 'cantor', group: 'Fractal architecture', name: 'Cantor Dust', description: 'Cubes scattered into clusters of clusters', create: createCantor },
  { id: 'jacks', group: 'Fractal architecture', name: 'Jack Lattice', description: 'Crosses built of crosses, linking overhead', create: createJacks },
  { id: 'vault', group: 'Fractal architecture', name: 'Snowflake Vault', description: 'A twisting tunnel shaped like a Koch snowflake', create: createVault },
  { id: 'pipes', group: 'Fractal architecture', name: 'Hilbert Pipeworks', description: 'One endless pipe that fills all of space', create: createPipes },
  { id: 'arcade', group: 'Fractal architecture', name: 'Branching Arcade', description: 'Forking trees knitting a vault around you', create: createArcade },

  { id: 'light', group: 'Light', name: 'Into the Light', description: 'A slow approach toward a radiant source', create: createLight },
  { id: 'lotus', group: 'Light', name: 'Lotus Mandala', description: 'Flowers of light that open as you arrive', create: createLotus },
  { id: 'hall', group: 'Light', name: 'Hall of Light', description: 'An endless vaulted nave of luminous arches', create: createHall },
  { id: 'flower', group: 'Light', name: 'Flower of Life', description: 'Turning seals of interlocking circles', create: createFlower },

  { id: 'plasma', group: 'Hypnotic', name: 'Liquid Rainbow', description: 'Colours folding over each other like oil on water', create: createPlasma },
  { id: 'hypno', group: 'Hypnotic', name: 'Hypno Spiral', description: 'Broad spiral arms winding down the tunnel', create: createHypno },
  { id: 'opart', group: 'Hypnotic', name: 'Op-Art Warp', description: 'A chequerboard that swells and pinches', create: createOpArt },
  { id: 'moire', group: 'Hypnotic', name: 'Moir\u00e9 Waves', description: 'Sliding stripes raising slow beats of colour', create: createMoire },
  { id: 'hive', group: 'Hypnotic', name: 'Honeycomb Hive', description: 'Hexagonal cells lighting in travelling waves', create: createHive },
  { id: 'glass', group: 'Hypnotic', name: 'Stained Glass', description: 'Drifting cells of colour in dark leading', create: createGlass },
  { id: 'truchet', group: 'Hypnotic', name: 'Labyrinth Flow', description: 'Interlocking arcs with light running along them', create: createTruchet },
  { id: 'slit', group: 'Hypnotic', name: 'Slit-Scan Gate', description: 'Walls of streaming colour meeting at infinity', create: createSlit },
  { id: 'wormhole', group: 'Hypnotic', name: 'Wormhole', description: 'A tube of light that snakes away ahead of you', create: createWormhole },
  { id: 'neon', group: 'Hypnotic', name: 'Neon Horizon', description: 'A glowing grid rolling toward a striped sun', create: createNeon },

  { id: 'horns', group: 'Striped worlds', name: 'Candy Horns', description: 'Curling striped horns crowding in on one great spiral', create: createHorns },
  { id: 'romanesco', group: 'Striped worlds', name: 'Romanesco', description: 'Cones covered in spirals of smaller cones', create: createRomanesco },
  { id: 'bullseye', group: 'Striped worlds', name: 'Bullseye Bloom', description: 'Swelling domes ringed like targets', create: createBullseye },
  { id: 'scales', group: 'Striped worlds', name: 'Dragon Scales', description: 'Overlapping scales that ruffle as you pass', create: createScales },
  { id: 'coil', group: 'Striped worlds', name: 'Serpent Coil', description: 'Fat striped bodies woven around the tunnel', create: createCoil },
  { id: 'tidal', group: 'Striped worlds', name: 'Tidal Bloom', description: 'Domes that rise into peaks as waves pass', create: createTidal },
  { id: 'whirl', group: 'Striped worlds', name: 'Whirlpool Eyes', description: 'Every dome a spinning spiral', create: createWhirl },
  { id: 'shapeshift', group: 'Striped worlds', name: 'Shapeshifter', description: 'Forms melting between domes and spires', create: createShapeshift },
  { id: 'budding', group: 'Striped worlds', name: 'Budding Bloom', description: 'Great domes crowned with circling buds', create: createBudding },
  { id: 'living', group: 'Striped worlds', name: 'Living Bloom', description: 'Bullseyes that drift, merge and part', create: createLiving },
  { id: 'toadstools', group: 'Striped worlds', name: 'Toadstool Grove', description: 'Striped stalks under opening and closing caps', create: createToadstools },
  { id: 'anemone', group: 'Striped worlds', name: 'Anemone Garden', description: 'Thousands of slender waving tentacles', create: createAnemone },

  { id: 'gyro', group: 'Forms in motion', name: 'Gyro Rings', description: 'Paired hoops rocking like a gyroscope', create: createGyro },
  { id: 'ribbons', group: 'Forms in motion', name: 'Silk Ribbons', description: 'Bands of colour weaving and twisting around you', create: createRibbons },
  { id: 'cubes', group: 'Forms in motion', name: 'Cube Swarm', description: 'Hundreds of tumbling, breathing cubes', create: createCubes },
  { id: 'sierpinski', group: 'Forms in motion', name: 'Sierpinski Drift', description: 'Fractal pyramids made of pyramids', create: createSierpinski },
  { id: 'crystal', group: 'Forms in motion', name: 'Crystal Cavern', description: 'A throat of iridescent crystal shards', create: createCrystal },
  { id: 'pillars', group: 'Forms in motion', name: 'Monolith Grove', description: 'Ranks of tall slabs rising and falling in waves', create: createPillars },
  { id: 'helix', group: 'Forms in motion', name: 'Double Helix', description: 'Twin strands of light coiling around you', create: createHelix },
  { id: 'spiro', group: 'Forms in motion', name: 'Spirograph', description: 'Looping curves that redraw themselves', create: createSpiro },
  { id: 'bursts', group: 'Forms in motion', name: 'Bloom Bursts', description: 'Seeds of light opening into dandelion heads', create: createBursts },
  { id: 'jelly', group: 'Forms in motion', name: 'Jellyfish Deep', description: 'Luminous jellyfish pulsing through dark water', create: createJelly },
];

const LEVEL_BELOW = THREE.MathUtils.degToRad(28); // gaze lower than this: fly level
const VERTICAL_ABOVE = THREE.MathUtils.degToRad(58); // gaze higher than this: fly straight up

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
    scene.add(this.root, this.backdrop.anchor);
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
      this.backdrop.anchor.visible = false;
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

    this.aim();
    this.lake.visible = false;
    this.root.visible = true;
    this.backdrop.anchor.visible = true;
  }

  /**
   * Centre the flight path on the visitor's head and point it where they are
   * looking, so the journey suits any posture: forward when sitting or
   * standing, straight up when lying down, in between when reclined.
   * Near-level and near-vertical gazes snap, so a slightly tilted head does
   * not give a slightly tilted path.
   */
  aim() {
    if (!this.active) return;
    this.rig.updateMatrixWorld();
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    const up = new THREE.Vector3(0, 1, 0);

    if (pitch < LEVEL_BELOW) {
      dir.y = 0; // level (looking down also counts: the path never dives)
      dir.normalize();
    } else {
      // The path's "up" follows the top of the visitor's head, so scenes with
      // a floor sit the same way relative to the body as they do when upright.
      up.set(0, 1, 0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
      if (pitch > VERTICAL_ABOVE) dir.set(0, 1, 0);
      up.addScaledVector(dir, -up.dot(dir));
      if (up.lengthSq() < 1e-4) up.set(0, 0, 1);
      up.normalize();
    }
    this.direction = pitch < LEVEL_BELOW ? 'forward' : pitch > VERTICAL_ABOVE ? 'up' : 'reclined';
    this.root.position.copy(head);
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, up));
    this.backdrop.anchor.position.set(head.x, this.rig.position.y + 0.01, head.z);
  }

  update(dt, t) {
    if (!this.active) return;
    journey.uTravel.value += this.active.speed * dt;
    this.active.update?.(dt, t);
  }
}
