// A player for the tests: it looks ahead and presses no faster than a person, so a run lasts
// long enough to test what happens in one.
import { RULES, advance, press, type Game } from './engine'

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
function pilot(act: (game: Game) => void): (game: Game) => void {
  let pressedAt = 0
  return (game) => {
    if (game.phase !== 'playing' || game.time - pressedAt < PRESS_EVERY) return
    const hold = survives(game, false)
    const go = survives(game, true)
    if (hold === go ? wantsPress(game) : go) {
      act(game)
      pressedAt = game.time
    }
  }
}

/** The pilot of one game. `act` is its press: the rules' own, unless a test watches it. */
export function pilotOf(game: Game, act: (game: Game) => void = press): () => void {
  const fly = pilot(act)
  return () => fly(game)
}
