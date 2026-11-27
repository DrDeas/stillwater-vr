import * as THREE from 'three';
import { state, actions } from '../state.js';
import { SOUNDSCAPES } from '../audio/soundscapes.js';
import { SCENES } from '../scenes.js';

// In-headset settings panel, drawn on a canvas and pointed at with the
// controller ray (or a hand pinch). A small "menu orb" floats near the visitor
// so the panel can be opened without any buttons at all.

const W = 1920;
const COLS = 5;
const CELL_H = 54;

// Scenes are listed under the same category headings as the page's picker.
// Entries flow down each column in turn; a heading never sits alone at the
// foot of a column, and the panel grows as tall as the list needs.
const ENTRIES = [];
{
  let group = null;
  for (const s of SCENES) {
    if (s.group !== group) ENTRIES.push({ heading: (group = s.group) });
    ENTRIES.push({ scene: s });
  }
}
function flow(rows) {
  const cols = [[]];
  for (const e of ENTRIES) {
    let col = cols[cols.length - 1];
    if (col.length >= rows || (e.heading && col.length >= rows - 1)) cols.push((col = []));
    col.push(e);
  }
  return cols;
}
let ROWS = Math.ceil(ENTRIES.length / COLS);
while (flow(ROWS).length > COLS) ROWS++;
const COLUMNS = flow(ROWS);
const H = Math.max(1000, 60 + ROWS * CELL_H + 300);
const SIZE_H = (0.72 * H) / 1000; // metres
const STEEP = 0.6; // |gaze.y| beyond which the visitor is treated as lying back
const SIZE_W = (SIZE_H * W) / H;

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
      new THREE.PlaneGeometry(SIZE_W, SIZE_H),
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
    if (Math.abs(fwd.y) > STEEP) {
      // lying back or looking well up: hang the panel straight along the gaze
      this.panel.up.set(0, 1, 0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
      this.panel.position.copy(head).addScaledVector(fwd, 1.2);
      this.panel.lookAt(head);
    } else {
      fwd.y = 0;
      fwd.normalize();
      this.panel.up.set(0, 1, 0);
      this.panel.position.copy(head).addScaledVector(fwd, 1.2);
      this.panel.position.y -= 0.12;
      this.panel.lookAt(head.x, this.panel.position.y, head.z);
    }
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
        this.cursor.position.set((hit.uv.x - 0.5) * SIZE_W, (hit.uv.y - 0.5) * SIZE_H, 0.002);
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
    let target;
    if (Math.abs(fwd.y) > STEEP) {
      // lying back: keep the orb low-left in the visitor's own frame
      const q = this.camera.getWorldQuaternion(new THREE.Quaternion());
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      target = head.clone().addScaledVector(fwd, 0.55).addScaledVector(right, -0.38).addScaledVector(up, -0.4);
    } else {
      fwd.y = 0;
      fwd.normalize();
      const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
      target = head.clone().addScaledVector(fwd, 0.55).addScaledVector(left, 0.38);
      target.y = head.y - 0.48;
    }
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

    // Rebuild hit boxes each draw; keep hover identity by matching ids.
    const prevHover = this.hover.map((h) => (h && h !== 'panel' ? h.id : h));
    const button = (id, x, y, w, h, action, paint) => {
      hits.push({ id, x, y, w, h, action });
      paint(prevHover.includes(id));
    };
    const heading = (text, x, y) => {
      g.fillStyle = 'rgba(200, 220, 255, 0.6)';
      g.font = '600 30px system-ui, sans-serif';
      g.fillText(text, x, y);
    };

    // scenes, by category
    const COL_W = (W - 120) / 2;
    const rows = ROWS;
    const top = 44;
    const cellW = (W - 80 - (COLS - 1) * 14) / COLS;
    const cellH = CELL_H;
    COLUMNS.forEach((col, c) => {
      const x = 40 + c * (cellW + 14);
      col.forEach((entry, r) => {
        const y = top + r * cellH;
        const h = cellH - 8;
        if (entry.heading) {
          g.fillStyle = 'rgba(190, 215, 255, 0.72)';
          g.font = '600 24px system-ui, sans-serif';
          g.fillText(entry.heading.toUpperCase(), x + 6, y + h / 2 + 8, cellW - 12);
          return;
        }
        const it = entry.scene;
        const selected = state.get('scene') === it.id;
        button(`scene:${it.id}`, x, y, cellW, h, () => state.set('scene', it.id), (hov) => {
          g.fillStyle = selected ? 'rgba(120, 180, 255, 0.30)' : hov ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)';
          roundRect(g, x, y, cellW, h, 14);
          g.fill();
          g.fillStyle = selected ? '#ffffff' : '#e6edff';
          g.font = `${selected ? 600 : 500} 29px system-ui, sans-serif`;
          g.fillText(it.name, x + 20, y + h / 2 + 2, cellW - 36);
        });
      });
    });

    // soundscapes: one row of pills
    const sy = top + rows * cellH + 50;
    heading('SOUNDSCAPE', 64, sy - 26);
    const sw = (W - 80 - (SOUNDSCAPES.length - 1) * 14) / SOUNDSCAPES.length;
    SOUNDSCAPES.forEach((it, n) => {
      const x = 40 + n * (sw + 14);
      const selected = state.get('soundscape') === it.id;
      button(`soundscape:${it.id}`, x, sy, sw, 66, () => state.set('soundscape', it.id), (hov) => {
        g.fillStyle = selected ? 'rgba(120, 180, 255, 0.30)' : hov ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)';
        roundRect(g, x, sy, sw, 66, 20);
        g.fill();
        g.fillStyle = '#f2f6ff';
        g.font = '500 30px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(it.name, x + sw / 2, sy + 35, sw - 30);
        g.textAlign = 'left';
      });
    });

    // volume (left half of the bottom row)
    let y = sy + 66 + 50;
    heading('VOLUME', 64, y - 26);
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
    round('vol+', 40 + COL_W - 96, '+', step(0.1));
    const barX = 160;
    const barW = COL_W - 240;
    g.fillStyle = 'rgba(255, 255, 255, 0.12)';
    roundRect(g, barX, y + 38, barW, 20, 10);
    g.fill();
    if (vol > 0.01) {
      g.fillStyle = '#a9d2ff';
      roundRect(g, barX, y + 38, barW * vol, 20, 10);
      g.fill();
    }

    // breathing guide + close (right half)
    const half = (COL_W - 20) / 2;
    const pill = (id, x, label, on, action) =>
      button(id, x, y, half, 96, action, (hov) => {
        g.fillStyle = on ? 'rgba(120, 180, 255, 0.26)' : hov ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.07)';
        roundRect(g, x, y, half, 96, 30);
        g.fill();
        g.fillStyle = '#f2f6ff';
        g.font = '500 30px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(label, x + half / 2, y + 50, half - 24);
        g.textAlign = 'left';
      });
    const breath = state.get('breath');
    const here = SCENES.find((sc) => sc.id === state.get('scene')) || SCENES[0];
    if (here.id === 'lake') {
      pill('breath', 80 + COL_W, `Breathing guide: ${breath ? 'on' : 'off'}`, breath, () => state.set('breath', !breath));
    } else if (here.create) {
      // journeys: point the path wherever you are looking (e.g. after lying down)
      pill('reaim', 80 + COL_W, 'Re-aim path', false, () => actions.reaim());
    }
    pill('close', 100 + COL_W + half, 'Close', false, () => this.close());

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
