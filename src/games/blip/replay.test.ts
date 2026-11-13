// The record of a run and its replay: what the panel writes down is what the server flies again.
import { assert, test } from 'orca/testing'
import type { GameHost } from '../../core/game'
import { Office } from '../../core/office'
import { SKINS } from '../../core/sprites'
import { RULES, advance, createGame, press, type Game } from './engine'
import { blip } from './game'
import { pilotOf } from './pilot'
import {
  MOVE,
  Recorder,
  checkRecord,
  continueReplay,
  startReplay,
  type ReplayResult,
  type RunRecord
} from './replay'

const host: GameHost = {
  calm: true,
  office: new Office(true),
  look: () => ({ skin: SKINS.blip, accessory: null }),
  play: () => {},
  coin: () => {},
  delivery: () => {}
}

/** Flies a whole run with the pilot, recording it as the panel does. */
function flown(seed: number, seconds = 40): { game: Game; record: RunRecord } {
  const game = createGame(160, 240, seed)
  const recorder = new Recorder()
  // The hover before the run: the start of the record keeps where it left the agent.
  for (let i = 0; i < 37; i += 1) advance(game, RULES.step)
  recorder.pressing(game)
  press(game)
  const fly = pilotOf(game, (pressed) => {
    recorder.pressing(pressed)
    press(pressed)
  })
  for (let i = 0; i < seconds / RULES.step && game.phase === 'playing'; i += 1) {
    fly()
    recorder.stepping(game)
    advance(game, RULES.step)
  }
  // Nobody presses any more: the run ends on the floor.
  while (game.phase === 'playing') {
    recorder.stepping(game)
    advance(game, RULES.step)
  }
  const record = recorder.record(game)
  assert.ok(record)
  return { game, record }
}

/** Replays a record to its end, `budget` steps at a time, through JSON as the server keeps it. */
function replayed(record: RunRecord, budget = 500): ReplayResult & { done: true } {
  let result = startReplay(record)
  while (!result.done) {
    const kept = JSON.parse(JSON.stringify(result.state)) as typeof result.state
    result = continueReplay(kept, record, budget)
  }
  return result
}

test('a record flies again to the same score, in pieces', () => {
  const { record } = flown(42)
  assert.equal(checkRecord(record), null)
  assert.ok(record.score > 5, `the pilot scored ${record.score}`)
  const result = replayed(record)
  assert.equal(result.valid, true, result.reason)
  assert.equal(result.score, record.score)
})

test('a made-up score does not count', () => {
  const { record } = flown(7)
  const result = replayed({ ...record, score: record.score + 10 })
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'score')
})

test('a run said to last longer than it did does not count', () => {
  const { record } = flown(9)
  assert.equal(replayed({ ...record, steps: record.steps + 100 }).valid, false)
})

test('a start the hover could not give does not count', () => {
  const { record } = flown(11)
  const result = replayed({ ...record, start: { ...record.start, y: record.start.y + 40 } })
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'start height')
})

test('records out of shape are turned down before any replay', () => {
  const { record } = flown(3, 5)
  assert.equal(checkRecord({ ...record, ruleset: 99 }), 'other rules')
  assert.equal(checkRecord({ ...record, moves: [5, MOVE.press] }), 'first move')
  assert.equal(checkRecord({ ...record, moves: [...record.moves, 0, 9] }), 'unknown move')
  assert.equal(
    checkRecord({ ...record, moves: [...record.moves, 0, MOVE.resize, 2, 2] }),
    'resize'
  )
  const many = [0, MOVE.press, ...Array.from({ length: 10 }, () => [0, MOVE.deliver]).flat()]
  assert.equal(checkRecord({ ...record, moves: many }), 'too many deliveries')
  assert.equal(checkRecord(null), 'not a record')
})

test('Blip records its runs with resizes and deliveries, and the record flies again', () => {
  const session = blip.create(host)
  session.resize(150, 250)
  session.advance(0.4)
  assert.equal(session.proof(), null)
  session.press()
  // Uneven frames, as a browser gives them, with presses between them.
  const frames = [0.016, 0.017, 0.033, 0.008, 0.021]
  for (let i = 0; i < 400 && session.phase === 'playing'; i += 1) {
    session.advance(frames[i % frames.length] ?? 0.016)
    if (i % 11 === 0) session.press()
    if (i === 60) session.resize(180, 260)
    if (i === 90) session.deliver('orbit')
  }
  for (let i = 0; i < 2000 && session.phase === 'playing'; i += 1) session.advance(0.016)
  assert.equal(session.phase, 'over')
  const proof = session.proof()
  assert.ok(proof)
  const record = proof.record as RunRecord
  assert.ok(record.moves.includes(MOVE.resize))
  assert.equal(checkRecord(record), null)
  const result = replayed(record)
  assert.equal(result.valid, true, result.reason)
  assert.equal(result.score, session.score)
  session.restart()
  assert.equal(session.proof(), null)
})
