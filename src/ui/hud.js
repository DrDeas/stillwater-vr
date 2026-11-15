import { state } from '../state.js';
import { SOUNDSCAPES } from '../audio/soundscapes.js';

// Page-level interface: the welcome veil, the settings bar and the VR button.

const $ = (id) => document.getElementById(id);

export function createHud({ onBegin, onEnterVR }) {
  const intro = $('intro');
  const hud = $('hud');
  const chips = $('soundscapes');
  const volume = $('volume');
  const breath = $('breath');
  const vrButtons = [...document.querySelectorAll('[data-enter-vr]')];
  const vrNote = $('vr-note');

  // --- soundscape chips
  for (const s of SOUNDSCAPES) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = s.name;
    b.title = s.description || '';
    b.dataset.id = s.id;
    b.addEventListener('click', () => state.set('soundscape', s.id));
    chips.appendChild(b);
  }

  const sync = () => {
    for (const b of chips.children) b.setAttribute('aria-pressed', String(b.dataset.id === state.get('soundscape')));
    volume.value = String(Math.round(state.get('volume') * 100));
    breath.setAttribute('aria-pressed', String(state.get('breath')));
  };
  state.subscribe(sync);
  sync();

  volume.addEventListener('input', () => state.set('volume', Number(volume.value) / 100));
  breath.addEventListener('click', () => state.set('breath', !state.get('breath')));

  // --- begin
  let begun = false;
  const begin = () => {
    if (begun) return;
    begun = true;
    intro.classList.add('hidden');
    hud.classList.remove('hidden');
    onBegin();
    wake();
  };
  $('begin').addEventListener('click', begin);

  // --- VR availability
  const setVR = (supported, note) => {
    vrButtons.forEach((b) => (b.hidden = !supported));
    vrNote.textContent = note;
  };
  if (!navigator.xr) {
    setVR(false, window.isSecureContext ? 'Open this page in a VR headset browser to step inside.' : 'VR needs a secure (https) connection.');
  } else {
    navigator.xr
      .isSessionSupported('immersive-vr')
      .then((ok) => setVR(ok, ok ? '' : 'Open this page in a VR headset browser to step inside.'))
      .catch(() => setVR(false, 'VR is not available in this browser.'));
  }
  vrButtons.forEach((b) =>
    b.addEventListener('click', () => {
      begin();
      onEnterVR().catch((err) => {
        console.warn('[xr] could not start session', err);
        vrNote.textContent = 'Could not start VR: ' + (err?.message || err);
      });
    })
  );

  // --- the bar fades away when you are still
  let idle = null;
  function wake() {
    if (!begun) return;
    hud.classList.remove('idle');
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (!hud.matches(':hover') && !hud.contains(document.activeElement)) hud.classList.add('idle');
      else wake();
    }, 5000);
  }
  ['pointermove', 'pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));

  return {
    setInVR(active) {
      document.body.classList.toggle('in-vr', active);
    },
  };
}
