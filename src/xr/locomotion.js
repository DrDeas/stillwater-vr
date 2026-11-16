import * as THREE from 'three';
import { groundHeight, WORLD_RADIUS } from '../world/terrain.js';

// Moving through the sanctuary in a headset.
//
//   trigger / pinch (hold, aim, release)  teleport along the arc
//   left thumbstick                        glide slowly, relative to your gaze
//   right thumbstick left / right          snap turn
//   grip / squeeze                         open the settings panel
//
// Comfort first: teleports dip through a brief fade, gliding is slow, turning
// is snapped. The visitor may walk on the water anywhere inside WORLD_RADIUS.

const ARC_POINTS = 40;
const ARC_SPEED = 7.5;
const GRAVITY = 9.8;
const GLIDE_SPEED = 1.5; // m/s
const SNAP = THREE.MathUtils.degToRad(30);

export class Locomotion {
  constructor({ renderer, scene, rig, camera, menu }) {
    this.renderer = renderer;
    this.rig = rig;
    this.camera = camera;
    this.menu = menu;
    this.enabled = true; // false during journeys: no teleport or gliding
    this.aiming = null;
    this.hit = null;
    this.snapReady = true;
    this.fade = { value: 0, target: 0, then: null };

    // --- teleport arc + landing marker (world space)
    this.arcPositions = new Float32Array(ARC_POINTS * 3);
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcPositions, 3));
    this.arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.75 }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arc.renderOrder = 10;
    scene.add(this.arc);

    this.marker = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.3, 48).rotateX(-Math.PI / 2), ringMat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24).rotateX(-Math.PI / 2), ringMat);
    this.marker.add(ring, dot);
    this.marker.visible = false;
    this.marker.renderOrder = 10;
    scene.add(this.marker);

    // --- fade sphere around the head for teleport dips
    this.fadeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x02030a, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false })
    );
    this.fadeMesh.renderOrder = 1000;
    this.fadeMesh.visible = false;
    camera.add(this.fadeMesh);

    // --- controllers / hands (target-ray spaces work for both)
    this.controllers = [0, 1].map((i) => {
      const c = renderer.xr.getController(i);
      rig.add(c);
      c.userData.index = i;

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.9 })
      );
      const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
      const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.35 }));
      ray.scale.z = 0.25;
      c.add(tip, ray);
      c.userData.ray = ray;

      c.addEventListener('connected', (e) => (c.userData.source = e.data));
      c.addEventListener('disconnected', () => {
        c.userData.source = null;
        if (this.aiming === c) this.#stopAiming();
      });
      c.addEventListener('selectstart', () => {
        if (this.menu.click(i)) return;
        if (this.enabled) this.aiming = c;
      });
      c.addEventListener('selectend', () => {
        if (this.aiming !== c) return;
        const hit = this.hit;
        this.#stopAiming();
        if (hit) this.teleport(hit);
      });
      c.addEventListener('squeezestart', () => this.menu.toggle());
      return c;
    });
  }

  #stopAiming() {
    this.aiming = null;
    this.hit = null;
    this.arc.visible = false;
    this.marker.visible = false;
  }

  /** Dip to black, run `fn`, and come back. */
  fadeThrough(fn) {
    this.fade.target = 1;
    this.fade.then = () => {
      fn();
      this.fade.target = 0;
    };
  }

  /** Move the rig so the visitor's head ends up above `point`. */
  teleport(point) {
    this.fadeThrough(() => {
      const head = this.camera.getWorldPosition(new THREE.Vector3());
      this.rig.position.x += point.x - head.x;
      this.rig.position.z += point.z - head.z;
      this.rig.position.y = groundHeight(point.x, point.z);
    });
  }

  #snapTurn(angle) {
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const p = this.rig.position;
    const dx = p.x - head.x;
    const dz = p.z - head.z;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    p.x = head.x + dx * c + dz * s;
    p.z = head.z - dx * s + dz * c;
    this.rig.rotation.y += angle;
  }

  #updateArc(controller) {
    const origin = controller.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
    const vel = dir.multiplyScalar(ARC_SPEED);
    const p = origin.clone();
    const prev = origin.clone();
    const dt = 0.035;
    let hit = null;
    let n = 0;
    for (; n < ARC_POINTS; n++) {
      this.arcPositions.set([p.x, p.y, p.z], n * 3);
      const g = groundHeight(p.x, p.z);
      if (n > 0 && p.y <= g) {
        const g0 = groundHeight(prev.x, prev.z);
        const t = (prev.y - g0) / (prev.y - g0 - (p.y - g) || 1);
        hit = prev.clone().lerp(p, THREE.MathUtils.clamp(t, 0, 1));
        hit.y = groundHeight(hit.x, hit.z);
        this.arcPositions.set([hit.x, hit.y, hit.z], n * 3);
        n++;
        break;
      }
      prev.copy(p);
      p.addScaledVector(vel, dt);
      vel.y -= GRAVITY * dt;
    }
    if (hit && Math.hypot(hit.x, hit.z) > WORLD_RADIUS) hit = null;
    this.arc.geometry.setDrawRange(0, n);
    this.arc.geometry.attributes.position.needsUpdate = true;
    this.arc.visible = true;
    this.arc.material.opacity = hit ? 0.75 : 0.25;
    this.marker.visible = !!hit;
    if (hit) this.marker.position.set(hit.x, hit.y + 0.03, hit.z);
    this.hit = hit;
  }

  update(dt) {
    // fade
    const f = this.fade;
    if (f.value !== f.target) {
      const step = dt / (f.target > f.value ? 0.12 : 0.28);
      f.value = f.target > f.value ? Math.min(f.target, f.value + step) : Math.max(f.target, f.value - step);
      if (f.value === 1 && f.then) {
        const then = f.then;
        f.then = null;
        then();
      }
    }
    this.fadeMesh.visible = f.value > 0.001;
    this.fadeMesh.material.opacity = f.value;

    if (!this.renderer.xr.isPresenting) return;

    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    for (const c of this.controllers) {
      if (!c.visible) continue;
      const i = c.userData.index;

      // UI pointing
      c.getWorldPosition(origin);
      dir.set(0, 0, -1).applyQuaternion(c.getWorldQuaternion(quat));
      const uiDist = this.aiming === c ? null : this.menu.point(i, origin, dir);
      c.userData.ray.scale.z = uiDist ?? 0.25;
      c.userData.ray.material.opacity = uiDist ? 0.8 : 0.35;
      c.userData.ray.visible = this.aiming !== c;

      // thumbsticks
      const pad = c.userData.source?.gamepad;
      if (pad && pad.axes.length >= 2) {
        const ax = pad.axes.length >= 4 ? pad.axes[2] : pad.axes[0];
        const ay = pad.axes.length >= 4 ? pad.axes[3] : pad.axes[1];
        const hand = c.userData.source.handedness;
        if (hand === 'right') {
          if (Math.abs(ax) > 0.65 && this.snapReady) {
            this.#snapTurn(ax > 0 ? -SNAP : SNAP);
            this.snapReady = false;
          } else if (Math.abs(ax) < 0.3) this.snapReady = true;
        } else if (Math.hypot(ax, ay) > 0.15) {
          this.glide(ax, -ay, dt);
        }
      }
    }
    if (this.aiming && !this.enabled) this.#stopAiming();
    if (this.aiming) this.#updateArc(this.aiming);
  }

  /** Glide relative to where the visitor is looking (strafe, forward in [-1, 1]). */
  glide(strafe, forward, dt, speed = GLIDE_SPEED) {
    if (!this.enabled) return;
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) return;
    fwd.normalize();
    const p = this.rig.position;
    p.x += (fwd.x * forward - fwd.z * strafe) * speed * dt;
    p.z += (fwd.z * forward + fwd.x * strafe) * speed * dt;
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const r = Math.hypot(head.x, head.z);
    if (r > WORLD_RADIUS) {
      const k = WORLD_RADIUS / r;
      p.x += head.x * k - head.x;
      p.z += head.z * k - head.z;
    }
    const target = groundHeight(head.x, head.z);
    p.y += (target - p.y) * Math.min(1, dt * 6);
  }
}
