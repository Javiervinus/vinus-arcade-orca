// Blip's own sounds: what happens in a run.
import type { Note } from '../../core/sound'

export const BLIP_SOUNDS = {
  flap: [{ wave: 'square', from: 520, to: 720, at: 0, length: 0.07, gain: 0.03 }],
  gate: [{ wave: 'triangle', from: 880, at: 0, length: 0.07, gain: 0.05 }],
  token: [
    { wave: 'triangle', from: 988, at: 0, length: 0.08, gain: 0.06 },
    { wave: 'triangle', from: 1319, at: 0.07, length: 0.14, gain: 0.06 }
  ],
  boost: [
    { wave: 'square', from: 659, at: 0, length: 0.07, gain: 0.04 },
    { wave: 'square', from: 880, at: 0.07, length: 0.07, gain: 0.04 },
    { wave: 'square', from: 1319, at: 0.14, length: 0.18, gain: 0.04 }
  ],
  hit: [{ wave: 'sawtooth', from: 220, to: 55, at: 0, length: 0.3, gain: 0.07 }]
} as const satisfies Record<string, readonly Note[]>
