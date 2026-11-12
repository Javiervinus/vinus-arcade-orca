// What a game is to the arcade. The arcade owns what every game shares: the panel, the frame
// loop, the pause, the coins and what they buy, the best scores, and what Orca tells about the
// person's agents. A game owns its rules, its world and its sounds, and lives in its own folder
// under src/games.
import type { Office } from './office'
import type { Paint } from './paint'
import type { Note } from './sound'
import type { Accessory, Skin } from './sprites'

/** The plugin's own name, for what it writes to the console. */
export const ARCADE_NAME = 'Vinus Arcade'

/** The character the person plays with, and what it wears. */
export interface Look {
  skin: Skin
  accessory: Accessory | null
}

export type Point = { x: number; y: number }

/** `ready` waits for the first press, `playing` is a run, `over` is a run that ended. */
export type GamePhase = 'ready' | 'playing' | 'over'

/** What the arcade gives a game. */
export interface GameHost {
  /** Whether the person asked for less motion. */
  readonly calm: boolean
  /** The person's projects and agents, for the game to draw in its world. */
  readonly office: Office
  /** The character in use right now. */
  look(): Look
  play(sound: readonly Note[]): void
  /** The person caught a coin at this point of the screen: the arcade pays it. `times` is how
   * many times it counts, when the game has a way to make coins count more (1 if left out). */
  coin(at: Point, times?: number): void
  /** The person caught what an agent sent into the run: the arcade pays it. */
  delivery(at: Point): void
}

/** One game being played: the arcade drives it and draws it. */
export interface GameSession {
  readonly phase: GamePhase
  readonly score: number
  /** Whether a run that is over has come to rest, so no frame is needed until the next press. */
  readonly atRest: boolean
  resize(width: number, height: number): void
  /** The game's one action: it starts a run, and plays in it. */
  press(): void
  /** Back to `ready` after a run is over. */
  restart(): void
  /** Moves the game `dt` seconds on. The arcade does not call it while the game is paused. */
  advance(dt: number): void
  draw(ctx: Paint): void
  /** An agent finished a task in the middle of a run and sends its project in, for the person
   *  to catch. Returns whether the game took it. */
  deliver(project: string): boolean
  /** The run just passed the best score (`beaten`), or ended as the new best (`record`). */
  celebrate(moment: 'beaten' | 'record'): void
}

/** The texts of a game that the arcade shows for it. */
export interface GameTexts {
  /** What the canvas is, for who cannot see it. */
  label: string
  /** How to start a run. */
  start: string
}

export interface GameDefinition {
  /** Names what the game keeps between sessions: it never changes once published. */
  id: string
  /** A game's name is a name: it is not translated. */
  name: string
  texts: { en: GameTexts; es: GameTexts }
  create(host: GameHost): GameSession
}
