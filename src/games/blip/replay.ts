// A run of Blip as a record, and how to fly it again from that record. The rules are the same
// for the same seed and the same presses (src/games/blip/engine.ts), so the ranking's server
// plays each run again before it counts: a score cannot be made up, it has to be flown.
// No DOM and no clock: the panel records with it and the server replays with it.
import { RULES, advance, createGame, deliver, press, resize, type Game } from './engine'

/** Which rules a record was flown with. It goes up when a change to the rules would fly the
 *  same presses differently; the server then turns down records of the rules before. */
export const RULESET = 1

/** What a move of the record is: the first number of its entry. */
export const MOVE = { press: 0, resize: 1, deliver: 2 } as const

/** The game the moment the run began, just before its first press. */
export interface RunStart {
  width: number
  height: number
  rng: number
  /** Seconds the game had hovered before the run: where the agent bobbed to. */
  time: number
  y: number
}

/**
 * A run: where it began and what happened in it. `moves` is flat, one entry after another: the
 * steps since the entry before, the move, and for a resize its width and height. `steps` is how
 * many steps the run lasted, the one that ended it included.
 */
export interface RunRecord {
  ruleset: number
  start: RunStart
  moves: number[]
  steps: number
  score: number
}

/** What a record has to stay within to be played again. */
export const LIMITS = {
  /** An hour of flight. */
  maxSteps: Math.round(60 * 60 / RULES.step),
  maxMoves: 20000,
  maxResizes: 200,
  /** An agent sends at most this many, plus one more for every `stepsPerDelivery`. */
  baseDeliveries: 3,
  stepsPerDelivery: Math.round(30 / RULES.step),
  minWidth: 32,
  maxWidth: 4096,
  minHeight: 64,
  maxHeight: 1024,
  maxReadySeconds: 60 * 60 * 24,
  /** How far the agent may be from where the hover puts it: a resize can nudge it. */
  startSlack: RULES.readyBobSize * 2
} as const

/** Writes down a run while it is flown: the panel calls it beside each rule it applies. */
export class Recorder {
  private start: RunStart | null = null
  private moves: number[] = []
  private steps = 0
  private lastMove = 0

  /** Before every press: the first one of a run begins the record. */
  pressing(game: Game): void {
    if (game.phase === 'ready') {
      this.start = {
        width: game.width,
        height: game.height,
        rng: game.rng,
        time: game.time,
        y: game.agent.y
      }
      this.moves = []
      this.steps = 0
      this.lastMove = 0
    }
    if (game.phase !== 'dead') this.note(MOVE.press)
  }

  /** After a resize that changed the size of the game. */
  resized(game: Game): void {
    if (game.phase === 'playing') this.note(MOVE.resize, game.width, game.height)
  }

  /** After a delivery the game took. */
  delivered(game: Game): void {
    if (game.phase === 'playing') this.note(MOVE.deliver)
  }

  /** Before every step of the rules. */
  stepping(game: Game): void {
    if (this.start && game.phase === 'playing') this.steps += 1
  }

  /** Back to the hover: the record of the last run is let go. */
  reset(): void {
    this.start = null
    this.moves = []
    this.steps = 0
    this.lastMove = 0
  }

  /** The record of the run, once it is over. */
  record(game: Game): RunRecord | null {
    if (!this.start || game.phase !== 'dead') return null
    return {
      ruleset: RULESET,
      start: { ...this.start },
      moves: [...this.moves],
      steps: this.steps,
      score: game.score
    }
  }

  private note(move: number, ...values: number[]): void {
    if (!this.start) return
    this.moves.push(this.steps - this.lastMove, move, ...values)
    this.lastMove = this.steps
  }
}

/** A replay part of the way through: plain values, to be kept between two requests. */
export interface ReplayState {
  game: Game
  /** Where the next move starts in `moves`. */
  cursor: number
  /** Steps played so far. */
  step: number
  /** The step at which the next move happens; -1 when there are none left. */
  due: number
}

export type ReplayResult =
  | { done: false; state: ReplayState }
  | { done: true; valid: boolean; score: number; reason?: string }

function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isSize(width: unknown, height: unknown): boolean {
  return (
    isWhole(width, LIMITS.minWidth, LIMITS.maxWidth) &&
    isWhole(height, LIMITS.minHeight, LIMITS.maxHeight)
  )
}

/** Checks the shape of a record from outside. Returns why it is refused, or null. */
export function checkRecord(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return 'not a record'
  const record = value as Partial<RunRecord>
  if (record.ruleset !== RULESET) return 'other rules'
  if (!isWhole(record.steps, 1, LIMITS.maxSteps)) return 'steps'
  if (!isWhole(record.score, 0, LIMITS.maxSteps)) return 'score'
  const start = record.start
  if (typeof start !== 'object' || start === null) return 'start'
  if (!isSize(start.width, start.height)) return 'size'
  if (!isWhole(start.rng, -2147483648, 2147483647)) return 'seed'
  if (typeof start.time !== 'number' || !(start.time >= 0 && start.time <= LIMITS.maxReadySeconds)) {
    return 'time'
  }
  if (typeof start.y !== 'number' || !Number.isFinite(start.y)) return 'start height'
  const moves = record.moves
  if (!Array.isArray(moves) || moves.length < 2 || moves.length > LIMITS.maxMoves * 4) return 'moves'
  let count = 0
  let resizes = 0
  let deliveries = 0
  let at = 0
  for (let i = 0; i < moves.length; count += 1) {
    if (count >= LIMITS.maxMoves) return 'too many moves'
    const gap = moves[i]
    const move = moves[i + 1]
    if (!isWhole(gap, 0, LIMITS.maxSteps)) return 'move step'
    at += gap
    if (at > record.steps) return 'move after the end'
    if (move === MOVE.press) {
      i += 2
    } else if (move === MOVE.deliver) {
      deliveries += 1
      i += 2
    } else if (move === MOVE.resize) {
      if (!isSize(moves[i + 2], moves[i + 3])) return 'resize'
      resizes += 1
      i += 4
    } else {
      return 'unknown move'
    }
  }
  if (moves[0] !== 0 || moves[1] !== MOVE.press) return 'first move'
  if (resizes > LIMITS.maxResizes) return 'too many resizes'
  const allowed = LIMITS.baseDeliveries + Math.floor(record.steps / LIMITS.stepsPerDelivery)
  if (deliveries > allowed) return 'too many deliveries'
  return null
}

/** The game as it was the moment the run began, built by the rules from the record's start. */
export function startReplay(record: RunRecord): ReplayResult {
  const { start } = record
  const game = createGame(start.width, start.height, start.rng)
  game.time = start.time
  // A step of no time puts the hovering agent where the rules put it at that time.
  advance(game, 0)
  if (Math.abs(game.agent.y - start.y) > LIMITS.startSlack) {
    return { done: true, valid: false, score: 0, reason: 'start height' }
  }
  game.agent.y = start.y
  return { done: false, state: { game, cursor: 0, step: 0, due: record.moves[0] ?? -1 } }
}

/** Plays the record on from `state`, at most `budget` steps. */
export function continueReplay(
  state: ReplayState,
  record: RunRecord,
  budget: number
): ReplayResult {
  const { game } = state
  const { moves } = record
  let { cursor, step, due } = state
  let played = 0
  for (;;) {
    while (due === step) {
      const move = moves[cursor + 1]
      if (move === MOVE.press) {
        press(game)
        cursor += 2
      } else if (move === MOVE.deliver) {
        deliver(game, '')
        cursor += 2
      } else {
        resize(game, moves[cursor + 2] ?? game.width, moves[cursor + 3] ?? game.height)
        cursor += 4
      }
      due = cursor < moves.length ? step + (moves[cursor] ?? 0) : -1
    }
    if (game.phase !== 'playing') break
    if (step >= record.steps) {
      return { done: true, valid: false, score: game.score, reason: 'did not end' }
    }
    if (played >= budget) return { done: false, state: { game, cursor, step, due } }
    advance(game, RULES.step)
    step += 1
    played += 1
  }
  if (game.phase !== 'dead') return { done: true, valid: false, score: 0, reason: 'never began' }
  if (step !== record.steps) return { done: true, valid: false, score: game.score, reason: 'ended elsewhere' }
  if (cursor < moves.length) return { done: true, valid: false, score: game.score, reason: 'moves after the end' }
  if (game.score !== record.score) return { done: true, valid: false, score: game.score, reason: 'score' }
  return { done: true, valid: true, score: game.score }
}
