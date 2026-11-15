import * as THREE from 'three';
import { state } from '../state.js';
import { SOUNDSCAPES } from '../audio/soundscapes.js';

// In-headset settings panel, drawn on a canvas and pointed at with the
// controller ray (or a hand pinch). A small "menu orb" floats near the visitor
// so the panel can be opened without any buttons at all.

const W = 1024;
const H = 1024;
const SIZE = 0.72; // metres

export class VRMenu {
  constructor(scene, camera) {
    this.camera = camera;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.panel = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false })
    );
    this.panel.renderOrder = 20;
    this.panel.visible = false;
    scene.add(this.panel);

    this.cursor = new THREE.Mesh(
      new THREE.CircleGeometry(0.008, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false })
    );
    this.cursor.renderOrder = 21;
    this.cursor.visible = false;
    this.panel.add(this.cursor);

    this.orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.85 })
    );
    this.orb.visible = false;
    this.orb.renderOrder = 19;
    scene.add(this.orb);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.048, 0.054, 32),
      new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    this.orb.add(halo);

    this.hits = []; // { x, y, w, h, action }
    this.hover = [null, null]; // hovered hit per controller
    this.orbHover = [false, false];
    this.raycaster = new THREE.Raycaster();
    this.active = false; // true while an XR session is running

    state.subscribe(() => this.draw());
    this.draw();
  }

  get isOpen() {
    return this.panel.visible;
  }

  setActive(active) {
    this.active = active;
    this.orb.visible = active;
    if (!active) this.close();
    else this.#placeOrb(true);
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    fwd.y = 0;
    fwd.normalize();
    this.panel.position.copy(head).addScaledVector(fwd, 1.05);
    this.panel.position.y -= 0.12;
    this.panel.lookAt(head.x, this.panel.position.y, head.z);
    this.panel.visible = true;
    this.draw();
  }

  close() {
    this.panel.visible = false;
    this.cursor.visible = false;
    this.hover = [null, null];
  }

  /**
   * Point a controller ray at the UI. Returns the hit distance if the ray is
   * over the panel or the orb, otherwise null.
   */
  point(index, origin, direction) {
    this.raycaster.set(origin, direction);
    let hover = null;
    let dist = null;
    if (this.isOpen) {
      const hit = this.raycaster.intersectObject(this.panel, false)[0];
      if (hit) {
        dist = hit.distance;
        const px = hit.uv.x * W;
        const py = (1 - hit.uv.y) * H;
        hover = this.hits.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) || 'panel';
        this.cursor.position.set((hit.uv.x - 0.5) * SIZE, (hit.uv.y - 0.5) * SIZE, 0.002);
        this.cursor.visible = true;
      }
    }
    if (hover !== this.hover[index]) {
      this.hover[index] = hover;
      this.draw();
    }
    this.orbHover[index] = false;
    if (dist === null && this.orb.visible) {
      // generous target so the orb is easy to pick with a pinch
      const toOrb = this.orb.position.clone().sub(origin);
      const along = toOrb.dot(direction);
      if (along > 0 && toOrb.addScaledVector(direction, -along).length() < 0.07) {
        this.orbHover[index] = true;
        dist = along;
      }
    }
    if (!this.hover[0] && !this.hover[1]) this.cursor.visible = false;
    return dist;
  }

  /** Activate whatever controller `index` points at. Returns true if consumed. */
  click(index) {
    if (this.orbHover[index]) {
      this.toggle();
      return true;
    }
    const h = this.hover[index];
    if (!h) return false;
    if (h !== 'panel') h.action();
    return true;
  }

  update(dt) {
    if (!this.active) return;
    this.#placeOrb(false, dt);
    const s = this.orbHover[0] || this.orbHover[1] ? 1.5 : 1;
    this.orb.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 10));
    this.orb.lookAt(this.camera.getWorldPosition(new THREE.Vector3()));
  }

  // The orb idles low and to the left, and drifts back there when you turn.
  #placeOrb(snap, dt = 0) {
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    fwd.y = 0;
    fwd.normalize();
    const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const target = head.clone().addScaledVector(fwd, 0.55).addScaledVector(left, 0.38);
    target.y = head.y - 0.48;
    if (snap) return this.orb.position.copy(target);
    const d = this.orb.position.distanceTo(target);
    if (d > 0.3 || this.following) {
      this.following = d > 0.03;
      this.orb.position.lerp(target, Math.min(1, dt * 2.5));
    }
  }

  // --- drawing -------------------------------------------------------------

  draw() {
    const g = this.g;
    const hits = [];
    g.clearRect(0, 0, W, H);

    // panel
    g.fillStyle = 'rgba(9, 13, 34, 0.86)';
    roundRect(g, 8, 8, W - 16, H - 16, 44);
    g.fill();
    g.strokeStyle = 'rgba(160, 200, 255, 0.35)';
    g.lineWidth = 3;
    g.stroke();

    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(200, 220, 255, 0.6)';
    g.font = '600 30px system-ui, sans-serif';
    g.fillText('SOUNDSCAPE', 64, 78);

    // Rebuild hit boxes each draw; keep hover identity by matching ids.
    const prevHover = this.hover.map((h) => (h && h !== 'panel' ? h.id : h));
    const button = (id, x, y, w, h, action, paint) => {
      const b = { id, x, y, w, h, action };
      hits.push(b);
      const isHover = prevHover.includes(id);
      paint(isHover);
      return b;
    };

    let y = 120;
    const rowH = Math.min(118, Math.floor(520 / SOUNDSCAPES.length));
    for (const s of SOUNDSCAPES) {
      const selected = state.get('soundscape') === s.id;
      button(`scape:${s.id}`, 40, y, W - 80, rowH - 10, () => state.set('soundscape', s.id), (hov) => {
        g.fillStyle = selected ? 'rgba(120, 180, 255, 0.26)' : hov ? 'rgba(255, 255, 255, 0.13)' : 'rgba(255, 255, 255, 0.05)';
        roundRect(g, 40, y, W - 80, rowH - 10, 22);
        g.fill();
        g.beginPath();
        g.arc(88, y + (rowH - 10) / 2, 13, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(200, 225, 255, 0.8)';
        g.lineWidth = 3;
        g.stroke();
        if (selected) {
          g.beginPath();
          g.arc(88, y + (rowH - 10) / 2, 7, 0, Math.PI * 2);
          g.fillStyle = '#cfe6ff';
          g.fill();
        }
        g.fillStyle = '#f2f6ff';
        g.font = '500 38px system-ui, sans-serif';
        g.fillText(s.name, 126, y + (rowH - 10) / 2 - 16);
        g.fillStyle = 'rgba(200, 215, 245, 0.62)';
        g.font = '400 25px system-ui, sans-serif';
        g.fillText(s.description || '', 126, y + (rowH - 10) / 2 + 24);
      });
      y += rowH;
    }

    // volume
    y = 668;
    g.fillStyle = 'rgba(200, 220, 255, 0.6)';
    g.font = '600 30px system-ui, sans-serif';
    g.fillText('VOLUME', 64, y);
    y += 36;
    const vol = state.get('volume');
    const step = (d) => () => state.set('volume', Math.round(Math.max(0, Math.min(1, vol + d)) * 10) / 10);
    const round = (id, x, label, action) =>
      button(id, x, y, 96, 96, action, (hov) => {
        g.fillStyle = hov ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.09)';
        roundRect(g, x, y, 96, 96, 48);
        g.fill();
        g.fillStyle = '#f2f6ff';
        g.font = '400 56px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(label, x + 48, y + 50);
        g.textAlign = 'left';
      });
    round('vol-', 40, '−', step(-0.1));
    round('vol+', W - 136, '+', step(0.1));
    g.fillStyle = 'rgba(255, 255, 255, 0.12)';
    roundRect(g, 168, y + 38, W - 336, 20, 10);
    g.fill();
    if (vol > 0.01) {
      g.fillStyle = '#a9d2ff';
      roundRect(g, 168, y + 38, (W - 336) * vol, 20, 10);
      g.fill();
    }

    // breathing guide + close
    y = 840;
    const half = (W - 100) / 2;
    const pill = (id, x, label, on, action) =>
      button(id, x, y, half, 110, action, (hov) => {
        g.fillStyle = on ? 'rgba(120, 180, 255, 0.26)' : hov ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.07)';
        roundRect(g, x, y, half, 110, 30);
        g.fill();
        g.fillStyle = '#f2f6ff';
        g.font = '500 34px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(label, x + half / 2, y + 57);
        g.textAlign = 'left';
      });
    const breath = state.get('breath');
    pill('breath', 40, `Breathing guide: ${breath ? 'on' : 'off'}`, breath, () => state.set('breath', !breath));
    pill('close', 60 + half, 'Close', false, () => this.close());

    // re-link hover references to the freshly built hit boxes
    this.hits = hits;
    this.hover = prevHover.map((id) => (id === 'panel' ? 'panel' : id ? hits.find((b) => b.id === id) || null : null));
    this.texture.needsUpdate = true;
  }
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
