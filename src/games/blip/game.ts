// Blip as the arcade plays it: the rules of src/games/blip/engine.ts, drawn by render.ts.
import type { GameDefinition, GameHost, GamePhase, GameSession, RunProof } from '../../core/game'
import type { Paint } from '../../core/paint'
import {
  RULES,
  advance,
  createGame,
  deliver,
  press,
  resize,
  restart,
  type GameEvent
} from './engine'
import { Effects, render } from './render'
import { Recorder } from './replay'
import { BLIP_SOUNDS } from './sounds'

class BlipSession implements GameSession {
  private readonly game = createGame(1, 1, Date.now())
  private readonly effects: Effects
  /** Writes down each run, for the ranking's server to fly it again. */
  private readonly recorder = new Recorder()
  /** Seconds not yet played: the rules move in steps of a fixed length. */
  private carry = 0

  constructor(private readonly host: GameHost) {
    this.effects = new Effects(host.calm)
  }

  get phase(): GamePhase {
    return this.game.phase === 'dead' ? 'over' : this.game.phase
  }

  get score(): number {
    return this.game.score
  }

  get atRest(): boolean {
    return this.game.phase === 'dead' && this.game.landed && this.effects.settled
  }

  resize(width: number, height: number): void {
    if (width === this.game.width && height === this.game.height) return
    resize(this.game, width, height)
    this.recorder.resized(this.game)
  }

  press(): void {
    this.recorder.pressing(this.game)
    for (const event of press(this.game)) this.handle(event)
  }

  restart(): void {
    restart(this.game)
    this.recorder.reset()
    this.effects.reset()
    this.carry = 0
  }

  advance(dt: number): void {
    this.carry += dt
    while (this.carry >= RULES.step) {
      this.carry -= RULES.step
      this.recorder.stepping(this.game)
      for (const event of advance(this.game, RULES.step)) this.handle(event)
    }
    this.effects.update(dt)
  }

  draw(ctx: Paint): void {
    render(ctx, this.game, this.host.look(), this.effects, this.host.office)
  }

  deliver(project: string): boolean {
    const taken = deliver(this.game, project)
    if (taken) this.recorder.delivered(this.game)
    return taken
  }

  celebrate(moment: 'beaten' | 'record'): void {
    if (moment === 'beaten') this.effects.beat(this.game)
    else this.effects.rain(this.game)
  }

  proof(): RunProof | null {
    const record = this.recorder.record(this.game)
    return record ? { ruleset: record.ruleset, score: record.score, record } : null
  }

  private handle(event: GameEvent): void {
    this.effects.handle(event, this.game, this.host.look().skin)
    if (event.type === 'land') return
    if (event.type !== 'token') {
      this.host.play(BLIP_SOUNDS[event.type])
    } else if (event.prize === undefined) {
      this.host.play(BLIP_SOUNDS.token)
      this.host.coin(event, event.times)
    } else {
      this.host.delivery(event)
    }
  }
}

export const blip: GameDefinition = {
  id: 'blip',
  name: 'Blip',
  texts: {
    en: {
      label: 'Blip: fly the agent between the bookshelves',
      start: 'Space or click to fly'
    },
    es: {
      label: 'Blip: lleva al agente entre las estanterías',
      start: 'Espacio o clic para volar'
    }
  },
  create: (host) => new BlipSession(host)
}
