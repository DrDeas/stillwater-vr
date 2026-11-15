// Mouse / touch / keyboard navigation for flat screens.
//   drag            look around
//   W A S D / arrows glide across the water (Shift = faster)

export class DesktopControls {
  constructor({ dom, camera, locomotion, renderer }) {
    this.camera = camera;
    this.locomotion = locomotion;
    this.renderer = renderer;
    this.yaw = 0;
    this.pitch = 0.04;
    this.keys = new Set();
    camera.rotation.order = 'YXZ';

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    dom.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const k = e.pointerType === 'touch' ? 0.005 : 0.003;
      this.yaw += (e.clientX - lastX) * k;
      this.pitch = Math.max(-1.2, Math.min(1.3, this.pitch + (e.clientY - lastY) * k));
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const end = () => (dragging = false);
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Put the camera back at standing height after leaving VR. */
  reset(eyeHeight) {
    this.camera.position.set(0, eyeHeight, 0);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  update(dt) {
    if (this.renderer.xr.isPresenting) return;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const k = this.keys;
    const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (forward || strafe) {
      const fast = k.has('ShiftLeft') || k.has('ShiftRight');
      this.locomotion.glide(strafe, forward, dt, fast ? 6 : 2.2);
    }
  }
}
