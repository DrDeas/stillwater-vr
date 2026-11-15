// Tiny observable settings store shared by the page HUD, the in-VR menu and
// the audio engine. Persists to localStorage when available.

const KEY = 'stillwater.settings.v1';
const defaults = { soundscape: 'lakeside', volume: 0.7, breath: true };

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

const values = load();
const listeners = new Set();

export const state = {
  get: (key) => values[key],
  set(key, value) {
    if (values[key] === value) return;
    values[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(values));
    } catch {
      /* storage unavailable: settings simply don't persist */
    }
    listeners.forEach((fn) => fn(key, value));
  },
  /** fn(key, value) is called on every change. Returns an unsubscribe function. */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
