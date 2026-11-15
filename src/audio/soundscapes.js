// ---------------------------------------------------------------------------
// Soundscape manifest
//
// Every entry appears automatically in the page HUD and in the in-VR menu.
// A soundscape is a list of layers that are mixed and looped together:
//
//   { type: 'file', url: 'assets/audio/forest.ogg', gain: 0.8 }
//       A looping audio file (ogg / mp3 / m4a / wav). Optional fields:
//         loop: false            play once instead of looping
//         position: [x, y, z]    place the sound in the world (HRTF spatialised,
//                                so it stays put as you turn your head in VR)
//         refDistance: 4         distance (m) at which a positioned sound is
//                                at full volume
//
//   { type: 'synth', generator: 'wind', gain: 0.5, params: { ... } }
//       A procedural layer from src/audio/synth.js — no files needed.
//
// To add your own: drop files in assets/audio/ and add an entry below, e.g.
//
//   {
//     id: 'forest-dawn',
//     name: 'Forest Dawn',
//     description: 'Birdsong and a distant stream',
//     layers: [
//       { type: 'file', url: 'assets/audio/forest-dawn.ogg', gain: 0.9 },
//       { type: 'file', url: 'assets/audio/stream.ogg', gain: 0.5, position: [9, 0.5, -13] },
//     ],
//   },
// ---------------------------------------------------------------------------

export const SOUNDSCAPES = [
  {
    id: 'lakeside',
    name: 'Lakeside Night',
    description: 'Soft wind and water lapping at the stones',
    layers: [
      { type: 'synth', generator: 'wind', gain: 0.5 },
      { type: 'synth', generator: 'water', gain: 0.4 },
    ],
  },
  {
    id: 'bowls',
    name: 'Singing Bowls',
    description: 'Slow resonant tones over a warm drone',
    layers: [
      { type: 'synth', generator: 'bowls', gain: 0.6 },
      { type: 'synth', generator: 'wind', gain: 0.12 },
    ],
  },
  {
    id: 'rain',
    name: 'Gentle Rain',
    description: 'Steady rainfall on still water',
    layers: [
      { type: 'synth', generator: 'rain', gain: 0.5 },
      { type: 'synth', generator: 'wind', gain: 0.15, params: { tone: 280 } },
    ],
  },
  {
    id: 'silence',
    name: 'Silence',
    description: 'Just the stillness',
    layers: [],
  },
];

export const findSoundscape = (id) => SOUNDSCAPES.find((s) => s.id === id) || SOUNDSCAPES[0];
