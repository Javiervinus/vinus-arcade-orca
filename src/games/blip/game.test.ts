// Blip as the arcade plays it: what it asks of the arcade and what it answers.
import { assert, test } from 'orca/testing'
import type { GameHost, Point } from '../../core/game'
import { Office } from '../../core/office'
import { SKINS } from '../../core/sprites'
import { blip } from './game'

function arcade(): { host: GameHost; coins: Point[]; deliveries: Point[] } {
  const coins: Point[] = []
  const deliveries: Point[] = []
  const host: GameHost = {
    calm: true,
    office: new Office(true),
    look: () => ({ skin: SKINS.blip, accessory: null }),
    play: () => {},
    coin: (at) => coins.push(at),
    delivery: (at) => deliveries.push(at)
  }
  return { host, coins, deliveries }
}

test('a run starts with the first press and ends on the floor', () => {
  const session = blip.create(arcade().host)
  session.resize(160, 240)
  assert.equal(session.phase, 'ready')
  session.press()
  assert.equal(session.phase, 'playing')
  // Nobody presses again: the agent falls.
  for (let second = 0; second < 10 && session.phase === 'playing'; second += 1) session.advance(1)
  assert.equal(session.phase, 'over')
  for (let second = 0; second < 10 && !session.atRest; second += 1) session.advance(1)
  assert.equal(session.atRest, true)
  session.restart()
  assert.equal(session.phase, 'ready')
  assert.equal(session.score, 0)
})

test('only a run in progress takes what an agent sends', () => {
  const session = blip.create(arcade().host)
  session.resize(160, 240)
  assert.equal(session.deliver('orbit'), false)
  session.press()
  assert.equal(session.deliver('orbit'), true)
})

test('every game has its texts in both languages and an id of its own', () => {
  assert.equal(blip.id, 'blip')
  assert.ok(blip.texts.en.start && blip.texts.es.start)
  assert.ok(blip.texts.en.label && blip.texts.es.label)
})
