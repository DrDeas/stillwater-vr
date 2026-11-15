// Procedural sound layers built from Web Audio nodes. Each generator is
//   (ctx, params) => { output: AudioNode, stop(): void }
// Register new ones in GENERATORS and reference them from soundscapes.js.

const noiseCache = new WeakMap();

function noiseBuffer(ctx, kind) {
  let perCtx = noiseCache.get(ctx);
  if (!perCtx) noiseCache.set(ctx, (perCtx = {}));
  if (perCtx[kind]) return perCtx[kind];
  const seconds = 6;
  const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      } else {
        d[i] = w * 0.5;
      }
    }
    // Crossfade the tail into the head so the loop is seamless.
    const fade = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[i] = d[i] * t + d[d.length - fade + i] * (1 - t);
    }
  }
  perCtx[kind] = buf;
  return buf;
}

function noiseSource(ctx, kind) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, kind);
  src.loop = true;
  src.loopEnd = src.buffer.duration - 0.25;
  src.start(0, Math.random() * 4);
  return src;
}

/** Slow sine LFO connected to an AudioParam. Returns the oscillator. */
function lfo(ctx, param, rate, depth) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = rate;
  g.gain.value = depth;
  osc.connect(g).connect(param);
  osc.start();
  return osc;
}

function impulseResponse(ctx, seconds = 3.5) {
  const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
  }
  return buf;
}

// --- generators ------------------------------------------------------------

function wind(ctx, { tone = 420 } = {}) {
  const out = ctx.createGain();
  const src = noiseSource(ctx, 'pink');
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = tone;
  band.Q.value = 0.55;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 1400;
  const swell = ctx.createGain();
  swell.gain.value = 0.7;
  src.connect(band).connect(low).connect(swell).connect(out);
  const nodes = [
    src,
    lfo(ctx, band.frequency, 0.043, tone * 0.35),
    lfo(ctx, band.frequency, 0.111, tone * 0.15),
    lfo(ctx, swell.gain, 0.067, 0.22),
    lfo(ctx, swell.gain, 0.029, 0.14),
  ];
  return { output: out, stop: () => nodes.forEach((n) => n.stop()) };
}

function water(ctx) {
  const out = ctx.createGain();
  const nodes = [];
  // two lapping voices at slightly different rhythms, panned apart
  [
    { f: 620, rate: 0.19, pan: -0.5 },
    { f: 980, rate: 0.27, pan: 0.5 },
  ].forEach(({ f, rate, pan }) => {
    const src = noiseSource(ctx, 'brown');
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = f;
    band.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.value = 0.55;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(band).connect(g).connect(p).connect(out);
    nodes.push(src, lfo(ctx, g.gain, rate, 0.4), lfo(ctx, band.frequency, rate * 0.6, f * 0.25));
  });
  return { output: out, stop: () => nodes.forEach((n) => n.stop()) };
}

function rain(ctx) {
  const out = ctx.createGain();
  const hiss = noiseSource(ctx, 'white');
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 8500;
  const hg = ctx.createGain();
  hg.gain.value = 0.3;
  hiss.connect(hp).connect(lp).connect(hg).connect(out);
  const body = noiseSource(ctx, 'pink');
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.4;
  const bg = ctx.createGain();
  bg.gain.value = 0.5;
  body.connect(bp).connect(bg).connect(out);
  const nodes = [hiss, body, lfo(ctx, hg.gain, 0.05, 0.07), lfo(ctx, bg.gain, 0.031, 0.12)];
  return { output: out, stop: () => nodes.forEach((n) => n.stop()) };
}

function bowls(ctx, { notes = [174.6, 196, 220, 261.6, 293.7], minGap = 7, maxGap = 14 } = {}) {
  const out = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  const verb = ctx.createConvolver();
  verb.buffer = impulseResponse(ctx);
  dry.connect(out);
  dry.connect(verb).connect(wet).connect(out);

  // warm drone underneath
  const drone = [110, 110.4, 164.9].map((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.value = i === 2 ? 0.03 : 0.07;
    o.connect(g).connect(dry);
    o.start();
    return o;
  });

  const PARTIALS = [
    [1, 1, 12],
    [2.71, 0.45, 8],
    [5.15, 0.2, 5],
    [8.4, 0.08, 3],
  ];
  let timer = null;
  let stopped = false;
  function strike() {
    if (stopped) return;
    const base = notes[Math.floor(Math.random() * notes.length)];
    const now = ctx.currentTime + 0.05;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;
    pan.connect(dry);
    for (const [ratio, level, decay] of PARTIALS) {
      for (const detune of [0, 0.7]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = base * ratio + detune; // paired partials beat slowly
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(level * 0.16, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        o.connect(g).connect(pan);
        o.start(now);
        o.stop(now + decay + 0.1);
      }
    }
    timer = setTimeout(strike, (minGap + Math.random() * (maxGap - minGap)) * 1000);
  }
  timer = setTimeout(strike, 1200);

  return {
    output: out,
    stop() {
      stopped = true;
      clearTimeout(timer);
      drone.forEach((o) => o.stop());
    },
  };
}

export const GENERATORS = { wind, water, rain, bowls };
