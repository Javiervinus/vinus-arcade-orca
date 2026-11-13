// The rules of the game. No DOM, no clock and no randomness of its own: the same seed and the
// same presses always give the same run, so the rules can be tested in Node.
// Distances are logical pixels (one drawn pixel of the pixel art), times are seconds.

export const RULES = {
  /** Fixed simulation step. */
  step: 1 / 120,
  gravity: 520,
  flapVelocity: -168,
  maxFallVelocity: 270,
  speedStart: 52,
  speedMax: 82,
  speedPerPoint: 0.9,
  gapStart: 70,
  gapMin: 52,
  gapPerPoint: 0.5,
  gateWidth: 22,
  gateSpacing: 82,
  /** How many looks a gate can wear. */
  gateVariants: 3,
  /** How far the first gate starts beyond the right edge. */
  firstGateLead: 30,
  /** Most a gap may move up or down from the previous one, so every gap is reachable. */
  maxGapShift: 56,
  topMargin: 16,
  bottomMargin: 12,
  floorHeight: 14,
  /** Half the size of the agent's hit box. */
  hitHalfWidth: 5,
  hitHalfHeight: 5,
  /** The chance that a token sits between two gates: where the coins are is never known. */
  tokenChance: 0.5,
  tokenRadius: 7,
  tokenSpread: 24,
  /** The chance that a token is a boost instead of a coin. It is small at the start, so a
   *  boost there is luck, and grows with each gate up to a most; many runs see none. */
  boostChanceStart: 0.01,
  boostChancePerGate: 0.001,
  boostChanceMax: 0.08,
  /** Gates after one boost before another can come. */
  boostGap: 40,
  /** A boost never sits on the easy line between two gaps: this far above or below it. */
  boostOffset: 18,
  /** How long a boost lasts, and how many times a coin caught meanwhile counts. */
  boostSeconds: 12,
  boostTimes: 2,
  /** Where the agent flies, as a share of the width, and the least distance from the left edge. */
  agentXShare: 0.28,
  agentXMin: 26,
  /** Hover of the agent before a run starts. */
  readyHeightShare: 0.42,
  readyBobSpeed: 5,
  readyBobSize: 3,
  readyScrollShare: 0.5
} as const

export type Phase = 'ready' | 'playing' | 'dead'

export interface Gate {
  id: number
  /** Left edge. */
  x: number
  /** Centre of the gap. */
  gapY: number
  gap: number
  /** Which look the gate wears; it changes nothing in the rules. */
  variant: number
  passed: boolean
}

export interface Token {
  id: number
  x: number
  y: number
  /** Set on a delivery: what an agent that just finished sends into the run, by project. */
  prize?: string
  /** Set on a boost: caught, it makes the coins of the next seconds count more. */
  boost?: true
}

export interface Game {
  phase: Phase
  width: number
  height: number
  /** Seconds since the game was created or restarted. */
  time: number
  /** Distance the world has moved, for the background. */
  scroll: number
  agent: { x: number; y: number; vy: number }
  /** True once a dead agent has reached the floor. */
  landed: boolean
  gates: Gate[]
  tokens: Token[]
  score: number
  /** Seconds of boost left; 0 without one. It ends with the run. */
  boostLeft: number
  /** The gate the last boost came with. */
  lastBoostGate: number
  speed: number
  /** Gates made so far in this run. */
  gateCount: number
  rng: number
}

export type GameEvent =
  | { type: 'flap' }
  | { type: 'gate' }
  /** A coin or a delivery caught. `times` is how many times a coin counts: more under a boost. */
  | { type: 'token'; x: number; y: number; times: number; prize?: string }
  | { type: 'boost'; x: number; y: number }
  | { type: 'hit'; x: number; y: number }
  | { type: 'land' }

/**
 * Sends a delivery into the run: a token with a prize, coming in from the right at the height
 * of the gap nearest to it, where the agent has to pass anyway. Only a run in progress takes one.
 */
export function deliver(game: Game, prize: string): boolean {
  if (game.phase !== 'playing') return false
  const x = game.width + RULES.tokenRadius
  let nearest: Gate | null = null
  for (const gate of game.gates) {
    const middle = gate.x + RULES.gateWidth / 2
    if (!nearest || Math.abs(middle - x) < Math.abs(nearest.x + RULES.gateWidth / 2 - x)) {
      nearest = gate
    }
  }
  game.gateCount += 1
  game.tokens.push({
    id: -game.gateCount,
    x,
    y: nearest ? nearest.gapY : game.height * RULES.readyHeightShare,
    prize
  })
  return true
}

export function floorY(game: Game): number {
  return game.height - RULES.floorHeight
}

function agentX(width: number): number {
  return Math.max(RULES.agentXMin, Math.round(width * RULES.agentXShare))
}

/** mulberry32: small, fast and good enough to place gates. */
function random(game: Game): number {
  game.rng = (game.rng + 0x6d2b79f5) | 0
  let t = game.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function clamp(value: number, min: number, max: number): number {
  return max < min ? (min + max) / 2 : Math.min(max, Math.max(min, value))
}

export function createGame(width: number, height: number, seed: number): Game {
  return {
    phase: 'ready',
    width,
    height,
    time: 0,
    scroll: 0,
    agent: { x: agentX(width), y: height * RULES.readyHeightShare, vy: 0 },
    landed: false,
    gates: [],
    tokens: [],
    score: 0,
    boostLeft: 0,
    lastBoostGate: -RULES.boostGap,
    speed: RULES.speedStart,
    gateCount: 0,
    rng: seed | 0
  }
}

/** Back to the hover before a run. The random sequence carries on, so each run differs. */
export function restart(game: Game): void {
  game.phase = 'ready'
  game.time = 0
  game.agent = { x: agentX(game.width), y: game.height * RULES.readyHeightShare, vy: 0 }
  game.landed = false
  game.gates = []
  game.tokens = []
  game.score = 0
  game.boostLeft = 0
  game.lastBoostGate = -RULES.boostGap
  game.speed = RULES.speedStart
  game.gateCount = 0
}

function gapRange(game: Game, gap: number): { min: number; max: number } {
  return {
    min: RULES.topMargin + gap / 2,
    max: floorY(game) - RULES.bottomMargin - gap / 2
  }
}

/** The panel was resized: keep everything inside the new bounds. */
export function resize(game: Game, width: number, height: number): void {
  game.width = width
  game.height = height
  game.agent.x = agentX(width)
  game.agent.y = clamp(game.agent.y, RULES.hitHalfHeight, floorY(game) - RULES.hitHalfHeight)
  for (const gate of game.gates) {
    const range = gapRange(game, gate.gap)
    gate.gapY = clamp(gate.gapY, range.min, range.max)
  }
}

function spawnGate(game: Game, x: number): void {
  const previous = game.gates[game.gates.length - 1]
  const gap = Math.max(RULES.gapMin, RULES.gapStart - game.score * RULES.gapPerPoint)
  const range = gapRange(game, gap)
  let gapY = range.min + random(game) * Math.max(0, range.max - range.min)
  if (previous) {
    gapY = clamp(gapY, previous.gapY - RULES.maxGapShift, previous.gapY + RULES.maxGapShift)
  }
  gapY = clamp(gapY, range.min, range.max)
  const variant = Math.floor(random(game) * RULES.gateVariants)
  const id = game.gateCount
  game.gateCount += 1
  game.gates.push({ id, x, gapY, gap, variant, passed: false })

  if (previous && random(game) < RULES.tokenChance) {
    const y = (previous.gapY + gapY) / 2 + (random(game) - 0.5) * RULES.tokenSpread
    // One boost at a time: none while one is running or already on its way, and few in a run.
    const free = game.boostLeft <= 0 && !game.tokens.some((token) => token.boost)
    const due = id - game.lastBoostGate >= RULES.boostGap
    const chance = Math.min(RULES.boostChanceMax, RULES.boostChanceStart + id * RULES.boostChancePerGate)
    const boost = random(game) < chance && free && due
    if (boost) game.lastBoostGate = id
    // The boost hangs off the line the agent would fly anyway: catching it is a risk.
    const middle = (previous.gapY + gapY) / 2
    const side = random(game) < 0.5 ? -1 : 1
    game.tokens.push({
      id,
      x: x - RULES.gateSpacing / 2 + RULES.gateWidth / 2,
      y: clamp(boost ? middle + side * RULES.boostOffset : y, RULES.topMargin, floorY(game) - RULES.bottomMargin),
      ...(boost ? { boost: true as const } : {})
    })
  }
}

function fillGates(game: Game): void {
  let last = game.gates[game.gates.length - 1]
  if (!last) {
    spawnGate(game, game.width + RULES.firstGateLead)
    last = game.gates[game.gates.length - 1]
  }
  while (last && last.x < game.width + RULES.gateWidth) {
    spawnGate(game, last.x + RULES.gateSpacing)
    last = game.gates[game.gates.length - 1]
  }
}

/** The one input of the game: starts a run from the hover, flaps during one. */
export function press(game: Game): GameEvent[] {
  if (game.phase === 'dead') return []
  if (game.phase === 'ready') {
    game.phase = 'playing'
    fillGates(game)
  }
  game.agent.vy = RULES.flapVelocity
  return [{ type: 'flap' }]
}

function hitsGate(game: Game, gate: Gate): boolean {
  const { x, y } = game.agent
  const overlapsColumn =
    x + RULES.hitHalfWidth > gate.x && x - RULES.hitHalfWidth < gate.x + RULES.gateWidth
  if (!overlapsColumn) return false
  return (
    y - RULES.hitHalfHeight < gate.gapY - gate.gap / 2 ||
    y + RULES.hitHalfHeight > gate.gapY + gate.gap / 2
  )
}

function fall(game: Game, dt: number): void {
  game.agent.vy = Math.min(RULES.maxFallVelocity, game.agent.vy + RULES.gravity * dt)
  game.agent.y += game.agent.vy * dt
}

/** Moves the game forward by `dt` seconds; call it with `RULES.step`. */
export function advance(game: Game, dt: number): GameEvent[] {
  const events: GameEvent[] = []
  const restingY = floorY(game) - RULES.hitHalfHeight
  game.time += dt

  if (game.phase === 'ready') {
    game.scroll += RULES.speedStart * RULES.readyScrollShare * dt
    game.agent.vy = 0
    game.agent.y =
      game.height * RULES.readyHeightShare +
      Math.sin(game.time * RULES.readyBobSpeed) * RULES.readyBobSize
    return events
  }

  if (game.phase === 'dead') {
    if (game.landed) return events
    fall(game, dt)
    if (game.agent.y >= restingY) {
      game.agent.y = restingY
      game.agent.vy = 0
      game.landed = true
      events.push({ type: 'land' })
    }
    return events
  }

  fall(game, dt)
  if (game.agent.y < RULES.hitHalfHeight) {
    game.agent.y = RULES.hitHalfHeight
    game.agent.vy = 0
  }

  game.boostLeft = Math.max(0, game.boostLeft - dt)
  const dx = game.speed * dt
  game.scroll += dx
  for (const gate of game.gates) gate.x -= dx
  for (const token of game.tokens) token.x -= dx

  for (const gate of game.gates) {
    if (!gate.passed && gate.x + RULES.gateWidth < game.agent.x - RULES.hitHalfWidth) {
      gate.passed = true
      game.score += 1
      events.push({ type: 'gate' })
    }
  }

  game.tokens = game.tokens.filter((token) => {
    const taken =
      Math.hypot(token.x - game.agent.x, token.y - game.agent.y) <=
      RULES.tokenRadius + RULES.hitHalfWidth
    if (taken) {
      game.score += 1
      if (token.boost) {
        game.boostLeft = RULES.boostSeconds
        events.push({ type: 'boost', x: token.x, y: token.y })
      } else {
        const times = game.boostLeft > 0 ? RULES.boostTimes : 1
        events.push({ type: 'token', x: token.x, y: token.y, times, prize: token.prize })
      }
    }
    return !taken && token.x > -RULES.tokenRadius
  })

  game.speed = Math.min(RULES.speedMax, RULES.speedStart + game.score * RULES.speedPerPoint)
  game.gates = game.gates.filter((gate) => gate.x + RULES.gateWidth > -RULES.gateWidth)
  fillGates(game)

  const onFloor = game.agent.y >= restingY
  if (onFloor || game.gates.some((gate) => hitsGate(game, gate))) {
    game.phase = 'dead'
    game.boostLeft = 0
    events.push({ type: 'hit', x: game.agent.x, y: game.agent.y })
    if (onFloor) {
      game.agent.y = restingY
      game.agent.vy = 0
      game.landed = true
      events.push({ type: 'land' })
    } else {
      // A short hop before the fall, so the hit reads.
      game.agent.vy = RULES.flapVelocity * 0.6
    }
  }
  return events
}
