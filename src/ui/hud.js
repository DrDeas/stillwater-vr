import { state, actions, isFavourite, toggleFavourite } from '../state.js';
import { SOUNDSCAPES } from '../audio/soundscapes.js';
import { SCENES } from '../scenes.js';

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

  const star = (kind, id, label) => {
    const b = document.createElement('button');
    b.className = 'star';
    b.type = 'button';
    b.dataset.kind = kind;
    b.dataset.id = id;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavourite(kind, b.dataset.id || id);
    });
    b.dataset.label = label;
    return b;
  };

  // --- soundscape chips, each with a star; favourites come first
  for (const s of SOUNDSCAPES) {
    const wrap = document.createElement('span');
    wrap.className = 'chip-wrap';
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = s.name;
    b.title = s.description || '';
    b.dataset.id = s.id;
    b.addEventListener('click', () => state.set('soundscape', s.id));
    wrap.append(b, star('sound', s.id, s.name));
    chips.appendChild(wrap);
  }

  // --- scene picker: the bar shows the current scene; the full list opens above it
  const picker = $('scene-picker');
  const sceneList = $('scenes');
  const current = $('scene-current');
  const currentStar = star('scene', '', '');
  current.after(currentStar);
  const card = (s) => {
    const wrap = document.createElement('div');
    wrap.className = 'scene-card';
    const b = document.createElement('button');
    b.className = 'scene';
    b.type = 'button';
    b.dataset.id = s.id;
    b.innerHTML = '<strong></strong><span></span>';
    b.firstChild.textContent = s.name;
    b.lastChild.textContent = s.description || '';
    b.addEventListener('click', () => {
      state.set('scene', s.id);
      openPicker(false);
    });
    wrap.append(b, star('scene', s.id, s.name));
    return wrap;
  };
  // favourites get their own group at the top
  const favHead = document.createElement('h2');
  favHead.textContent = 'Favorites';
  const favGrid = document.createElement('div');
  favGrid.className = 'scene-grid';
  sceneList.append(favHead, favGrid);
  let lastGroup = null;
  let grid = null;
  for (const s of SCENES) {
    if (s.group !== lastGroup) {
      const h = document.createElement('h2');
      h.textContent = s.group;
      grid = document.createElement('div');
      grid.className = 'scene-grid';
      sceneList.append(h, grid);
      lastGroup = s.group;
    }
    grid.appendChild(card(s));
  }
  let shownFavs = null;
  const syncFavourites = () => {
    const favs = SCENES.filter((s) => isFavourite('scene', s.id));
    const key = favs.map((s) => s.id).join();
    if (key !== shownFavs) {
      shownFavs = key;
      favGrid.replaceChildren(...favs.map(card));
      favHead.hidden = favGrid.hidden = favs.length === 0;
    }
    for (const b of document.querySelectorAll('.star')) {
      const id = b === currentStar ? state.get('scene') : b.dataset.id;
      const name = b === currentStar ? (SCENES.find((sc) => sc.id === id) || SCENES[0]).name : b.dataset.label;
      const on = isFavourite(b.dataset.kind, id);
      if (b === currentStar) b.dataset.id = id;
      b.textContent = on ? '\u2605' : '\u2606';
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${name} ${on ? 'from' : 'to'} favorites`);
      b.title = on ? 'Remove from favorites' : 'Add to favorites';
    }
    for (const wrap of chips.children) wrap.style.order = isFavourite('sound', wrap.firstChild.dataset.id) ? 0 : 1;
  };
  const openPicker = (open) => {
    // sit just above the bar, however tall the bar is on this screen
    if (open) picker.style.bottom = `${window.innerHeight - hud.getBoundingClientRect().top + 10}px`;
    picker.classList.toggle('hidden', !open);
    current.setAttribute('aria-expanded', String(open));
    if (open) sceneList.querySelector(`.scene[data-id="${state.get('scene')}"]`)?.focus();
  };
  current.addEventListener('click', () => openPicker(picker.classList.contains('hidden')));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && openPicker(false));
  document.getElementById('stage').addEventListener('pointerdown', () => openPicker(false));
  const step = (d) => {
    const i = SCENES.findIndex((s) => s.id === state.get('scene'));
    state.set('scene', SCENES[(i + d + SCENES.length) % SCENES.length].id);
  };
  $('scene-prev').addEventListener('click', () => step(-1));
  $('scene-next').addEventListener('click', () => step(1));

  const sync = () => {
    syncFavourites();
    for (const wrap of chips.children) wrap.firstChild.setAttribute('aria-pressed', String(wrap.firstChild.dataset.id === state.get('soundscape')));
    for (const b of sceneList.querySelectorAll('.scene')) b.setAttribute('aria-pressed', String(b.dataset.id === state.get('scene')));
    current.textContent = (SCENES.find((sc) => sc.id === state.get('scene')) || SCENES[0]).name;
    volume.value = String(Math.round(state.get('volume') * 100));
    breath.setAttribute('aria-pressed', String(state.get('breath')));
  };
  state.subscribe(sync);
  sync();

  volume.addEventListener('input', () => state.set('volume', Number(volume.value) / 100));
  breath.addEventListener('click', () => state.set('breath', !state.get('breath')));
  $('reaim').addEventListener('click', () => actions.reaim());

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
      const busy = hud.matches(':hover') || hud.contains(document.activeElement) || !picker.classList.contains('hidden');
      if (!busy) hud.classList.add('idle');
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
