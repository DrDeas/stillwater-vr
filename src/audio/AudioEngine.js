import * as THREE from 'three';
import { findSoundscape } from './soundscapes.js';
import { GENERATORS } from './synth.js';

// Soundscape playback.
//
//   layers ─► soundscape gain (crossfade) ─► bus ─► limiter ─► listener ─► out
//
// The THREE.AudioListener rides on the camera, so positioned layers are
// spatialised relative to the visitor's head — including inside a headset.
// Browsers only allow audio after a user gesture: call unlock() from a click.

const CROSSFADE = 3.5; // seconds

export class AudioEngine {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;

    this.bus = this.ctx.createGain();
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.4;
    this.bus.connect(limiter).connect(this.listener.getInput());

    this.buffers = new Map(); // url -> Promise<AudioBuffer>
    this.current = null;
    this.currentId = null;
    this.unlocked = false;
    this.volume = 0.7;
    this.bus.gain.value = this.volume;

    document.addEventListener('visibilitychange', () => {
      if (!this.unlocked) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  /** Must be called from a user gesture (click / tap / Enter VR). */
  async unlock() {
    this.unlocked = true;
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('[audio] could not start audio context', err);
      }
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    // perceptual curve: the slider feels even from quiet to loud
    this.bus.gain.setTargetAtTime(this.volume * this.volume, this.ctx.currentTime, 0.08);
  }

  /** Crossfade to the soundscape with this id (see soundscapes.js). */
  setSoundscape(id) {
    const def = findSoundscape(id);
    if (def.id === this.currentId) return;
    this.currentId = def.id;
    const now = this.ctx.currentTime;

    const old = this.current;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE);
      setTimeout(() => this.#dispose(old), (CROSSFADE + 0.3) * 1000);
    }

    const scape = { id: def.id, gain: this.ctx.createGain(), stops: [], disposed: false };
    scape.gain.gain.setValueAtTime(0, now);
    scape.gain.gain.linearRampToValueAtTime(1, now + CROSSFADE);
    scape.gain.connect(this.bus);
    for (const layer of def.layers) this.#startLayer(scape, layer);
    this.current = scape;
  }

  #startLayer(scape, layer) {
    const gain = this.ctx.createGain();
    gain.gain.value = layer.gain ?? 1;

    // Optional world position -> HRTF panner
    let dest = scape.gain;
    if (layer.position) {
      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = layer.refDistance ?? 4;
      panner.positionX.value = layer.position[0];
      panner.positionY.value = layer.position[1];
      panner.positionZ.value = layer.position[2];
      panner.connect(scape.gain);
      dest = panner;
    }
    gain.connect(dest);

    if (layer.type === 'synth') {
      const make = GENERATORS[layer.generator];
      if (!make) return console.warn(`[audio] unknown generator "${layer.generator}"`);
      const voice = make(this.ctx, layer.params);
      voice.output.connect(gain);
      scape.stops.push(() => voice.stop());
    } else if (layer.type === 'file') {
      this.#load(layer.url)
        .then((buffer) => {
          if (scape.disposed) return;
          const src = this.ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = layer.loop ?? true;
          src.connect(gain);
          src.start();
          scape.stops.push(() => src.stop());
        })
        .catch((err) => console.warn(`[audio] could not load ${layer.url}`, err));
    } else {
      console.warn(`[audio] unknown layer type "${layer.type}"`);
    }
  }

  #load(url) {
    if (!this.buffers.has(url)) {
      const p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((data) => this.ctx.decodeAudioData(data));
      p.catch(() => this.buffers.delete(url)); // allow a retry later
      this.buffers.set(url, p);
    }
    return this.buffers.get(url);
  }

  #dispose(scape) {
    scape.disposed = true;
    for (const stop of scape.stops) {
      try {
        stop();
      } catch {
        /* already stopped */
      }
    }
    scape.gain.disconnect();
  }
}
