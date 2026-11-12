import { assert, test } from 'orca/testing'
import {
  RULES,
  advance,
  createGame,
  deliver,
  floorY,
  press,
  resize,
  restart,
  type Game
} from './engine'

const WIDTH = 136
const HEIGHT = 256

function steps(game: Game, seconds: number, onStep?: () => void): string[] {
  const seen: string[] = []
  for (let i = 0; i < Math.round(seconds / RULES.step); i += 1) {
    onStep?.()
    for (const event of advance(game, RULES.step)) seen.push(event.type)
  }
  return seen
}

const PRESS_EVERY = 0.12
const FORESIGHT = 1.5

/** A player that only reacts: flaps when the agent sinks to the bottom of the gap ahead. */
function wantsPress(game: Game): boolean {
  const next = game.gates.find(
    (gate) => gate.x + RULES.gateWidth > game.agent.x - RULES.hitHalfWidth
  )
  const limit = next ? next.gapY + next.gap / 2 - RULES.hitHalfHeight - 3 : game.height / 2
  return game.agent.y + game.agent.vy * 0.03 >= limit
}

/** Does the run last if the player presses now, or holds off, and then only reacts? */
function survives(game: Game, pressNow: boolean): boolean {
  const copy = structuredClone(game)
  let pressedAt = copy.time
  if (pressNow) press(copy)
  for (let i = 0; i < FORESIGHT / RULES.step; i += 1) {
    if (copy.time - pressedAt >= PRESS_EVERY && wantsPress(copy)) {
      press(copy)
      pressedAt = copy.time
    }
    advance(copy, RULES.step)
    if (copy.phase !== 'playing') return false
  }
  return true
}

/** A player that looks ahead, at most one press every PRESS_EVERY seconds like a person. */
function pilot(): (game: Game) => void {
  let pressedAt = 0
  return (game) => {
    if (game.phase !== 'playing' || game.time - pressedAt < PRESS_EVERY) return
    const hold = survives(game, false)
    const go = survives(game, true)
    if (hold === go ? wantsPress(game) : go) {
      press(game)
      pressedAt = game.time
    }
  }
}

function pilotOf(game: Game): () => void {
  const fly = pilot()
  return () => fly(game)
}

test('hovers until the first press and never falls before it', () => {
  const game = createGame(WIDTH, HEIGHT, 1)
  assert.deepEqual(steps(game, 3), [])
  assert.equal(game.phase, 'ready')
  assert.equal(game.gates.length, 0)
})

test('the same seed and presses give the same run', () => {
  const run = (): Game => {
    const game = createGame(WIDTH, HEIGHT, 42)
    press(game)
    steps(game, 20, pilotOf(game))
    return game
  }
  assert.deepEqual(run(), run())
})

test('a press starts the run and lifts the agent', () => {
  const game = createGame(WIDTH, HEIGHT, 7)
  const before = game.agent.y
  assert.deepEqual(press(game), [{ type: 'flap' }])
  assert.equal(game.phase, 'playing')
  assert.ok(game.gates.length > 0)
  steps(game, 0.1)
  assert.ok(game.agent.y < before)
})

test('without presses the agent falls to the floor and the run ends', () => {
  const game = createGame(WIDTH, HEIGHT, 7)
  press(game)
  const seen = steps(game, 3)
  assert.equal(game.phase, 'dead')
  assert.ok(seen.includes('hit'))
  assert.ok(seen.includes('land'))
  assert.equal(game.agent.y, floorY(game) - RULES.hitHalfHeight)
  assert.deepEqual(press(game), [])
})

test('every gap can be reached: a player that looks ahead flies for a minute', () => {
  for (const seed of [1, 2, 3, 99, 2026]) {
    const game = createGame(WIDTH, HEIGHT, seed)
    press(game)
    steps(game, 60, pilotOf(game))
    assert.equal(game.phase, 'playing', `seed ${seed} crashed at ${game.score}`)
    assert.ok(game.score > 50, `seed ${seed} scored ${game.score}`)
  }
})

test('the game gets harder with the score, up to a limit', () => {
  const game = createGame(WIDTH, HEIGHT, 5)
  press(game)
  steps(game, 45, pilotOf(game))
  assert.equal(game.speed, RULES.speedMax)
  const newest = game.gates[game.gates.length - 1]
  assert.equal(newest?.gap, RULES.gapMin)
})

test('hitting a gate ends the run', () => {
  const game = createGame(WIDTH, HEIGHT, 3)
  press(game)
  const gate = game.gates[0]
  assert.ok(gate)
  gate.x = game.agent.x - RULES.gateWidth / 2
  gate.gapY = game.agent.y + gate.gap * 2
  assert.ok(advance(game, RULES.step).some((event) => event.type === 'hit'))
  assert.equal(game.phase, 'dead')
})

test('a token adds a point', () => {
  const game = createGame(WIDTH, HEIGHT, 3)
  press(game)
  game.tokens = [{ id: 0, x: game.agent.x, y: game.agent.y }]
  const events = advance(game, RULES.step)
  assert.ok(events.some((event) => event.type === 'token'))
  assert.equal(game.score, 1)
  assert.equal(game.tokens.length, 0)
})

test('restart goes back to the hover with a clean run', () => {
  const game = createGame(WIDTH, HEIGHT, 7)
  press(game)
  steps(game, 3)
  restart(game)
  assert.equal(game.phase, 'ready')
  assert.equal(game.score, 0)
  assert.equal(game.gates.length, 0)
  assert.equal(game.landed, false)
})

test('a smaller panel keeps the agent and the gaps inside it', () => {
  const game = createGame(WIDTH, HEIGHT, 7)
  press(game)
  steps(game, 0.5, pilotOf(game))
  resize(game, 90, 120)
  assert.ok(game.agent.y <= floorY(game) - RULES.hitHalfHeight)
  for (const gate of game.gates) {
    assert.ok(gate.gapY + gate.gap / 2 <= floorY(game))
    assert.ok(gate.gapY - gate.gap / 2 >= 0)
  }
})

test('a delivery comes into a run in progress at the height of a gap, and nowhere else', () => {
  const game = createGame(160, 240, 7)
  assert.equal(deliver(game, 'orbit'), false)
  press(game)
  assert.equal(deliver(game, 'orbit'), true)
  const delivery = game.tokens.find((token) => token.prize === 'orbit')
  assert.ok(delivery)
  assert.ok(game.gates.some((gate) => gate.gapY === delivery.y))
  assert.ok(delivery.x > game.width)
})

/** Puts a token where the agent is and plays one step: what catching it gives. */
function catchNow(game: Game, token: { boost?: true }): ReturnType<typeof advance> {
  game.tokens.push({ id: -1, x: game.agent.x, y: game.agent.y, ...token })
  return advance(game, RULES.step)
}

test('a boost caught makes the coins of the next seconds count more, and then it runs out', () => {
  const game = createGame(WIDTH, HEIGHT, 7)
  press(game)
  const plain = catchNow(game, {}).find((event) => event.type === 'token')
  assert.equal(plain?.type === 'token' && plain.times, 1)

  assert.ok(catchNow(game, { boost: true }).some((event) => event.type === 'boost'))
  assert.equal(game.boostLeft, RULES.boostSeconds)
  const boosted = catchNow(game, {}).find((event) => event.type === 'token')
  assert.equal(boosted?.type === 'token' && boosted.times, RULES.boostTimes)

  game.boostLeft = RULES.step / 2
  advance(game, RULES.step)
  assert.equal(game.boostLeft, 0)
  const after = catchNow(game, {}).find((event) => event.type === 'token')
  assert.equal(after?.type === 'token' && after.times, 1)
})

test('a boost ends with the run', () => {
  const game = createGame(WIDTH, HEIGHT, 7)
  press(game)
  catchNow(game, { boost: true })
  steps(game, 3)
  assert.equal(game.phase, 'dead')
  assert.equal(game.boostLeft, 0)
  restart(game)
  assert.equal(game.boostLeft, 0)
})

test('boosts are found in the run, one at a time and never while one is running', () => {
  const game = createGame(WIDTH, HEIGHT, 3)
  press(game)
  const fly = pilotOf(game)
  let found = 0
  let known = new Set<number>()
  steps(game, 60, () => {
    fly()
    const boosts = game.tokens.filter((token) => token.boost)
    assert.ok(boosts.length <= 1)
    for (const token of boosts) {
      if (known.has(token.id)) continue
      known = new Set([token.id])
      found += 1
      assert.equal(game.boostLeft, 0)
    }
  })
  assert.ok(found > 0, 'no boost in a minute')
})
