import * as THREE from 'three';
import { shared, mirrorOf } from './world/common.js';
import { PLATFORM } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { createWater } from './world/water.js';
import { createMountains } from './world/mountains.js';
import { createPlatform } from './world/platform.js';
import { createIsland } from './world/island.js';
import { createFlora } from './world/flora.js';
import { createBreathGuide } from './world/breath.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { Locomotion } from './xr/locomotion.js';
import { VRMenu } from './xr/vrmenu.js';
import { DesktopControls } from './ui/desktop.js';
import { createHud } from './ui/hud.js';
import { state } from './state.js';

const EYE_HEIGHT = 1.55; // flat-screen viewing height; a headset reports its own

// --- renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x02030a);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 4000);
camera.position.set(0, EYE_HEIGHT, 0);

// The rig is the visitor's feet; locomotion moves the rig, the headset moves the camera.
const rig = new THREE.Group();
rig.position.set(0, PLATFORM.y, 1.15);
rig.add(camera);
scene.add(rig);

// --- world ------------------------------------------------------------------
const sky = createSky();
const water = createWater();
const breath = createBreathGuide();

const world = new THREE.Group();
world.name = 'world';
world.add(createMountains(), createPlatform(), createIsland(), createFlora(), breath.mesh);

scene.add(sky.group, mirrorOf(world), water, world);

// --- systems ----------------------------------------------------------------
const audio = new AudioEngine(camera);
const menu = new VRMenu(scene, camera);
const locomotion = new Locomotion({ renderer, scene, rig, camera, menu });
const desktop = new DesktopControls({ dom: renderer.domElement, camera, locomotion, renderer });

const applyState = (key) => {
  if (key === 'volume') audio.setVolume(state.get('volume'));
  if (key === 'breath') breath.setEnabled(state.get('breath'));
  if (key === 'soundscape' && audio.unlocked) audio.setSoundscape(state.get('soundscape'));
};
state.subscribe(applyState);
applyState('volume');
applyState('breath');

async function beginAudio() {
  await audio.unlock();
  audio.setSoundscape(state.get('soundscape'));
}

async function enterVR() {
  if (renderer.xr.isPresenting) return;
  const session = await navigator.xr.requestSession('immersive-vr', {
    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
  });
  await renderer.xr.setSession(session);
}

const hud = createHud({ onBegin: beginAudio, onEnterVR: enterVR });

renderer.xr.addEventListener('sessionstart', () => {
  camera.position.set(0, 0, 0); // the headset pose takes over
  menu.setActive(true);
  hud.setInVR(true);
});
renderer.xr.addEventListener('sessionend', () => {
  menu.setActive(false);
  hud.setInVR(false);
  desktop.reset(EYE_HEIGHT);
  onResize();
});

function onResize() {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// --- frame loop -------------------------------------------------------------
const clock = new THREE.Clock();
const head = new THREE.Vector3();
const size = new THREE.Vector2();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  shared.uTime.value = t;
  // lantern flames: a slow, slightly irregular flicker
  shared.uLampGlow.value = 0.9 + 0.06 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 13.1 + 1.7) + 0.03 * Math.sin(t * 2.1);

  desktop.update(dt);
  locomotion.update(dt);
  menu.update(dt);
  breath.update(dt, t);
  sky.update(dt, t);

  // sky and water travel with the visitor so the horizon never gets closer
  rig.updateMatrixWorld();
  camera.getWorldPosition(head);
  sky.group.position.set(head.x, 0, head.z);
  water.position.set(head.x, 0, head.z);

  // point sprites are sized in pixels: tell the shaders how tall an eye's view is
  if (renderer.xr.isPresenting) {
    const eye = renderer.xr.getCamera().cameras[0];
    shared.uViewH.value = eye ? eye.viewport.w : 1600;
    shared.uPx.value = 1.6;
  } else {
    shared.uViewH.value = renderer.getDrawingBufferSize(size).y;
    shared.uPx.value = renderer.getPixelRatio();
  }

  renderer.render(scene, camera);
});

// Handy for poking at things from the console.
window.stillwater = { renderer, scene, camera, rig, audio, state, locomotion, menu, desktop };
