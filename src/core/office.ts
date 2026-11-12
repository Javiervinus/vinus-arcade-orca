// What the game shows of the person's own work in Orca: a plaque on the office wall for each
// project, their agents sitting at the office's desks, and the coins caught in the runs, flying
// to the counter.
import { DESK, drawDesk } from './desks'
import type { CrewMember, ProjectView } from '../agents/ledger'
import {
  box,
  drawCoin,
  drawOutlinedText,
  drawText,
  hashText,
  mix,
  textWidth,
  type Paint
} from './paint'
import { GLYPH_HEIGHT, GLYPH_WIDTH, SKINS, initialOf, skinForAgent } from './sprites'

const LOOK = {
  /** A plaque hangs in a wooden frame, like the room's own pictures. */
  frame: '#c98f62',
  frameShade: '#9a6a44',
  wall: '#3c4a70',
  /** A project keeps the colour its name falls on. White letters read on all of them. */
  plaques: ['#d9534f', '#d98a2b', '#3f9a9c', '#5b7bd5', '#5f9a4e', '#b5679b', '#8a6fd1', '#c7703f'],
  letter: '#ffffff',
  dot: '#5b6b96',
  dotLit: '#fff1cf',
  sign: '#ffd166',
  signInk: '#1d2540',
  coin: { face: '#ffd166', light: '#fff3c4', edge: '#b9812f' },
  coinPop: { face: '#fff3c4', light: '#ffffff', edge: '#ffd166' },
  count: '#ffffff',
  countEdge: '#1d2540',
  /** The frame of a delivery: gold, and lighter as it blinks. */
  prize: ['#ffd166', '#fff3c4']
} as const

const LAYOUT = {
  /** A plaque is a frame of one pixel around the project's icon. */
  plaqueSize: 18,
  letterScale: 2,
  /** Of every this many pillars, the last keeps the room's own decoration. */
  wallRhythm: 3,
  dotSize: 2,
  dotGap: 2,
  dotSeconds: 0.3,
  signWidth: 7,
  signHeight: 9,
  signGap: 3,
  signBobSeconds: 0.45,
  counterLeft: 6,
  counterTop: 9,
  coinHalf: 3,
  countGap: 3,
  flightSeconds: 0.7,
  flightStagger: 0.09,
  flightLift: 24,
  /** A big sum flies as this many coins at most, each worth more. */
  maxFlights: 10,
  spinPerSecond: 8,
  prizeBlinkSeconds: 0.18,
  prizeBob: 2,
  prizeBobSpeed: 5,
  popSeconds: 0.12
} as const

const SPIN: readonly number[] = [3, 2, 0, 2]

interface Flight {
  fromX: number
  fromY: number
  /** Seconds since it left; negative while it waits its turn. */
  age: number
  value: number
}

function mod(value: number, by: number): number {
  return ((value % by) + by) % by
}

export class Office {
  /** Plaques without icon or letter, for when the screen is shared. */
  hideNames = false
  /** Gives a project's own icon as a picture of the plaque's inner size, when it has one. */
  iconOf: ((name: string) => CanvasImageSource | null) | null = null
  /** Called as each flying coin reaches the counter. */
  onCoin: (() => void) | null = null

  /** A project keeps its place on the wall while it stays; a hole is a project that left. */
  private slots: (ProjectView | null)[] = []
  private flights: Flight[] = []
  private coins = 0
  private pop = 0
  private clock = 0
  /** The agents at the desks; an agent keeps its desk while it is there. */
  private desks: (CrewMember | null)[] = []

  constructor(private readonly calm: boolean) {}

  /** Whether the agents at the desks move, which takes a few frames a second and no more. */
  get lively(): boolean {
    return !this.calm && this.desks.some((member) => member !== null)
  }

  setCrew(crew: readonly CrewMember[]): void {
    const byKey = new Map(crew.map((member) => [member.key, member]))
    this.desks = this.desks.map((desk) => (desk ? (byKey.get(desk.key) ?? null) : null))
    const seated = new Set(this.desks.map((desk) => desk?.key))
    for (const member of crew) {
      if (seated.has(member.key)) continue
      const free = this.desks.indexOf(null)
      if (free >= 0) this.desks[free] = member
      else this.desks.push(member)
    }
    while (this.desks.length > 0 && this.desks[this.desks.length - 1] === null) this.desks.pop()
  }

  /** The `nth` desk along the room, with the agent that sits at it: the agents take turns at
   *  the desks, so there is always one in sight. With no agents, the desks are empty. */
  drawDesk(ctx: Paint, nth: number, x: number, floor: number): void {
    const member = this.desks.length > 0 ? (this.desks[mod(nth, this.desks.length)] ?? null) : null
    const sitter = member
      ? { skin: SKINS[skinForAgent(member.agent)], state: member.state }
      : null
    drawDesk(ctx, x, floor, sitter, this.calm ? 0 : this.clock)
    if (member?.project) {
      this.drawSticker(ctx, member.project, x + DESK.stickerLeft, floor - DESK.stickerUp)
    }
  }

  /** A project's mark on the front of a desk: its icon, small, or its initial on its colour. */
  private drawSticker(ctx: Paint, name: string, left: number, top: number): void {
    const size = DESK.stickerSize
    const icon = this.hideNames ? null : (this.iconOf?.(name) ?? null)
    if (icon) {
      ctx.drawImage(icon, left, top, size, size)
      return
    }
    box(ctx, LOOK.plaques[hashText(name) % LOOK.plaques.length] ?? LOOK.plaques[0], left, top, size, size)
    const initial = this.hideNames ? null : initialOf(name)
    if (!initial) return
    drawText(
      ctx,
      initial,
      left + Math.floor((size - GLYPH_WIDTH) / 2),
      top + Math.floor((size - GLYPH_HEIGHT) / 2),
      1,
      LOOK.letter
    )
  }

  /** Whether something still moves and needs frames. */
  get busy(): boolean {
    return this.flights.length > 0 || this.pop > 0
  }

  setProjects(projects: readonly ProjectView[]): void {
    const byName = new Map(projects.map((project) => [project.name, project]))
    this.slots = this.slots.map((slot) => (slot ? (byName.get(slot.name) ?? null) : null))
    const placed = new Set(this.slots.map((slot) => slot?.name))
    for (const project of projects) {
      if (placed.has(project.name)) continue
      const hole = this.slots.indexOf(null)
      if (hole >= 0) this.slots[hole] = project
      else this.slots.push(project)
    }
    while (this.slots.length > 0 && this.slots[this.slots.length - 1] === null) this.slots.pop()
  }

  /** The coins there are to spend. Coins still in the air are not counted until they land. */
  setCoins(coins: number): void {
    this.coins = coins
  }

  /** The project whose plaque hangs on a pillar of the wall, if any. The projects take turns
   *  along the wall, and now and then a pillar keeps the room's own decoration. */
  plaqueAt(pillar: number): ProjectView | null {
    if (this.slots.length === 0) return null
    const place = mod(pillar, LAYOUT.wallRhythm)
    if (place === LAYOUT.wallRhythm - 1) return null
    const nth = Math.floor(pillar / LAYOUT.wallRhythm) * (LAYOUT.wallRhythm - 1) + place
    return this.slots[mod(nth, this.slots.length)] ?? null
  }

  /** Sends coins flying to the counter from where they were caught. */
  fly(coins: number, origin: { x: number; y: number }): void {
    if (coins <= 0 || this.calm) return
    const count = Math.min(coins, LAYOUT.maxFlights)
    let left = coins
    for (let n = 0; n < count; n += 1) {
      const value = Math.ceil(left / (count - n))
      left -= value
      this.flights.push({
        fromX: origin.x,
        fromY: origin.y,
        age: -n * LAYOUT.flightStagger,
        value
      })
    }
  }

  update(dt: number): void {
    this.clock += dt
    this.pop = Math.max(0, this.pop - dt)
    for (const flight of this.flights) flight.age += dt
    const landed = this.flights.filter((flight) => flight.age >= LAYOUT.flightSeconds)
    if (landed.length === 0) return
    this.flights = this.flights.filter((flight) => flight.age < LAYOUT.flightSeconds)
    this.pop = LAYOUT.popSeconds
    for (let n = 0; n < landed.length; n += 1) this.onCoin?.()
  }

  /** The square a project is known by: its own icon, or its initial on its own colour. */
  private drawBadge(ctx: Paint, name: string, left: number, top: number, frame: string): void {
    const size = LAYOUT.plaqueSize
    const inner = size - 2
    const color = LOOK.plaques[hashText(name) % LOOK.plaques.length] ?? LOOK.plaques[0]
    box(ctx, frame, left, top, size, size)
    const icon = this.hideNames || !name ? null : (this.iconOf?.(name) ?? null)
    if (icon) {
      ctx.drawImage(icon, left + 1, top + 1, inner, inner)
      return
    }
    box(ctx, color, left + 1, top + 1, inner, inner)
    box(ctx, mix(color, LOOK.letter, 0.3), left + 1, top + 1, inner, 1)
    const initial = this.hideNames ? null : initialOf(name)
    if (!initial) return
    const scale = LAYOUT.letterScale
    drawText(
      ctx,
      initial,
      left + (size - GLYPH_WIDTH * scale) / 2,
      top + (size - GLYPH_HEIGHT * scale) / 2,
      scale,
      LOOK.letter
    )
  }

  /** A delivery in the run: the project's square in a blinking gold frame, bobbing. */
  drawDelivery(ctx: Paint, name: string, x: number, y: number): void {
    const size = LAYOUT.plaqueSize
    const blink = Math.floor(this.clock / LAYOUT.prizeBlinkSeconds) % LOOK.prize.length
    const bob = Math.round(Math.sin(this.clock * LAYOUT.prizeBobSpeed) * LAYOUT.prizeBob)
    const left = Math.round(x - size / 2)
    const top = Math.round(y - size / 2) + bob
    const frame = LOOK.prize[blink] ?? LOOK.prize[0]
    box(ctx, frame, left - 1, top - 1, size + 2, size + 2)
    this.drawBadge(ctx, name, left, top, frame)
  }

  /** A project's plaque, centred on `middle`: its square in a wooden frame; lit dots under it
   *  while an agent works there, and a sign over it when one waits for the person. */
  drawPlaque(ctx: Paint, project: ProjectView, middle: number, top: number): void {
    const size = LAYOUT.plaqueSize
    const left = middle - size / 2
    this.drawBadge(ctx, project.name, left, top, LOOK.frame)
    box(ctx, LOOK.frameShade, left, top + size - 1, size, 1)
    box(ctx, LOOK.frameShade, left + size - 1, top, 1, size)

    if (project.state === 'working') {
      const lit = Math.floor(this.clock / LAYOUT.dotSeconds) % 3
      const step = LAYOUT.dotSize + LAYOUT.dotGap
      const first = middle - (step * 3 - LAYOUT.dotGap) / 2
      for (let n = 0; n < 3; n += 1) {
        box(
          ctx,
          n === lit ? LOOK.dotLit : LOOK.dot,
          first + n * step,
          top + LAYOUT.plaqueSize + 2,
          LAYOUT.dotSize,
          LAYOUT.dotSize
        )
      }
    } else if (project.state === 'waiting') {
      const bob = Math.floor(this.clock / LAYOUT.signBobSeconds) % 2
      const signLeft = middle - Math.floor(LAYOUT.signWidth / 2) - 1
      const signTop = top - LAYOUT.signHeight - LAYOUT.signGap - bob
      box(ctx, LOOK.frame, signLeft - 1, signTop - 1, LAYOUT.signWidth + 2, LAYOUT.signHeight + 2)
      box(ctx, LOOK.sign, signLeft, signTop, LAYOUT.signWidth, LAYOUT.signHeight)
      box(ctx, LOOK.sign, middle - 1, signTop + LAYOUT.signHeight + 1, 1, 1)
      drawText(ctx, '!', signLeft + 2, signTop + 2, 1, LOOK.signInk)
    }
  }

  /** The coin counter, and the coins on their way to it. Drawn over the room, unshaken. */
  drawHud(ctx: Paint): void {
    const coinX = LAYOUT.counterLeft + LAYOUT.coinHalf
    const coinY = LAYOUT.counterTop + LAYOUT.coinHalf
    const inAir = this.flights.reduce((sum, flight) => sum + flight.value, 0)
    drawCoin(ctx, coinX, coinY, LAYOUT.coinHalf, this.pop > 0 ? LOOK.coinPop : LOOK.coin)
    const count = String(Math.max(0, this.coins - inAir))
    const countLeft = coinX + LAYOUT.coinHalf + 1 + LAYOUT.countGap
    drawOutlinedText(ctx, count, countLeft, LAYOUT.counterTop + 1, 1, LOOK.count, LOOK.countEdge)

    for (const flight of this.flights) {
      if (flight.age < 0) continue
      const t = flight.age / LAYOUT.flightSeconds
      const eased = t * t * (3 - 2 * t)
      const lift = Math.sin(Math.PI * eased) * LAYOUT.flightLift
      const x = flight.fromX + (coinX - flight.fromX) * eased
      const y = flight.fromY + (coinY - flight.fromY) * eased - lift
      const turn = Math.floor(this.clock * LAYOUT.spinPerSecond) % SPIN.length
      drawCoin(ctx, x, Math.max(LAYOUT.coinHalf, y), SPIN[turn] ?? LAYOUT.coinHalf, LOOK.coin)
    }
  }
}
