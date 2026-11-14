// Where a run not on the board yet would land on it.
import { assert, test } from 'orca/testing'
import { TOP_PLAYERS, type BoardEntry } from '../ranking/api'
import { placeOf } from './ranking-view'

function board(...scores: number[]): BoardEntry[] {
  return scores.map((score, i) => ({ rank: i + 1, score, name: `p${i}`, me: false }))
}

test('a run lands after every score as high as it, the first to reach a score keeps it', () => {
  assert.equal(placeOf(board(), 12), 1)
  assert.equal(placeOf(board(90, 50, 20), 60), 2)
  assert.equal(placeOf(board(90, 50, 20), 50), 3)
  assert.equal(placeOf(board(90, 50, 20), 5), 4)
})

test('a run below a full board lands on no place of it', () => {
  const full = board(...Array.from({ length: TOP_PLAYERS }, (_, i) => 100 - i))
  assert.equal(placeOf(full, 50), null)
  assert.equal(placeOf(full, 95), 7)
})
