// Sounds, made on the spot with the Web Audio API: the plugin ships no audio files.
// A sound is a few short notes; a note may slide from one pitch to another.

export interface Note {
  wave: OscillatorType
  /** Pitch in hertz at the start, and at the end when the note slides. */
  from: number
  to?: number
  /** Seconds after the sound starts. */
  at: number
  length: number
  /** Loudness from 0 to 1. These are kept low: the game sits beside someone's work. */
  gain: number
}

/** The sounds every game shares: what the arcade itself says. A game brings its own. */
export const SOUNDS = {
  /** The run just passed the best score. */
  best: [
    { wave: 'triangle', from: 784, at: 0, length: 0.1, gain: 0.06 },
    { wave: 'triangle', from: 988, at: 0.1, length: 0.1, gain: 0.06 },
    { wave: 'triangle', from: 1319, at: 0.2, length: 0.22, gain: 0.06 }
  ],
  /** A run that ended as the new best. */
  fanfare: [
    { wave: 'triangle', from: 523, at: 0.35, length: 0.1, gain: 0.06 },
    { wave: 'triangle', from: 659, at: 0.45, length: 0.1, gain: 0.06 },
    { wave: 'triangle', from: 784, at: 0.55, length: 0.1, gain: 0.06 },
    { wave: 'triangle', from: 1047, at: 0.65, length: 0.16, gain: 0.06 },
    { wave: 'square', from: 784, at: 0.83, length: 0.08, gain: 0.03 },
    { wave: 'triangle', from: 1319, at: 0.91, length: 0.4, gain: 0.07 }
  ],
  /** An agent finished a task. */
  agentDone: [
    { wave: 'triangle', from: 784, at: 0, length: 0.09, gain: 0.06 },
    { wave: 'triangle', from: 1047, at: 0.08, length: 0.09, gain: 0.06 },
    { wave: 'triangle', from: 1568, at: 0.16, length: 0.2, gain: 0.06 }
  ],
  /** An agent needs the person. */
  agentNeeds: [
    { wave: 'sine', from: 660, at: 0, length: 0.16, gain: 0.07 },
    { wave: 'sine', from: 880, at: 0.14, length: 0.24, gain: 0.07 }
  ],
  /** One coin landing in the counter. */
  coin: [{ wave: 'triangle', from: 1760, at: 0, length: 0.05, gain: 0.035 }],
  /** Something bought. */
  buy: [
    { wave: 'square', from: 523, at: 0, length: 0.07, gain: 0.03 },
    { wave: 'square', from: 784, at: 0.07, length: 0.07, gain: 0.03 },
    { wave: 'triangle', from: 1047, at: 0.14, length: 0.2, gain: 0.06 }
  ],
  /** A setting switched. */
  tick: [{ wave: 'triangle', from: 988, at: 0, length: 0.08, gain: 0.05 }]
} as const satisfies Record<string, readonly Note[]>

/** The quietest a note fades to; an exponential fade cannot reach zero. */
const SILENCE = 0.0001

export class Sound {
  enabled = true
  private context: AudioContext | null = null

  /** Browsers let audio start only from a key press or a click: call this from one. */
  unlock(): void {
    if (!this.enabled) return
    try {
      this.context ??= new AudioContext()
      if (this.context.state === 'suspended') void this.context.resume()
    } catch (error) {
      this.fail(error)
    }
  }

  /** Plays a sound if sound is on. Until the first `unlock` there is nothing to play on, so a
   *  sound asked for before the person's first input is dropped. */
  play(notes: readonly Note[]): void {
    const context = this.context
    if (!this.enabled || !context) return
    try {
      for (const note of notes) this.note(context, note)
    } catch (error) {
      this.fail(error)
    }
  }

  private fail(error: unknown): void {
    console.warn('A sound could not be played', error)
    this.enabled = false
  }

  private note(context: AudioContext, note: Note): void {
    const start = context.currentTime + note.at
    const end = start + note.length
    const oscillator = context.createOscillator()
    const volume = context.createGain()
    oscillator.type = note.wave
    oscillator.frequency.setValueAtTime(note.from, start)
    if (note.to) oscillator.frequency.exponentialRampToValueAtTime(note.to, end)
    volume.gain.setValueAtTime(note.gain, start)
    volume.gain.exponentialRampToValueAtTime(SILENCE, end)
    oscillator.connect(volume).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(end)
  }
}
