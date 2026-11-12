import { assert, test } from 'orca/testing'
import {
  ACCESSORIES,
  ACCESSORY_IDS,
  AGENT_HEIGHT,
  AGENT_WIDTH,
  FLAME_FRAMES,
  SKINS,
  SKIN_IDS,
  agentRows,
  cellColor,
  type Pose
} from './sprites'

const POSES: readonly Pose[] = ['rising', 'falling', 'out']

test('every character is a full sprite in every pose, with or without something on', () => {
  for (const skinId of SKIN_IDS) {
    for (const pose of POSES) {
      for (const accessoryId of [null, ...ACCESSORY_IDS]) {
        const accessory = accessoryId ? ACCESSORIES[accessoryId] : null
        const rows = agentRows(SKINS[skinId], pose, accessory)
        assert.equal(rows.length, AGENT_HEIGHT)
        for (const row of rows) {
          assert.equal(row.length, AGENT_WIDTH, `${skinId} ${pose} ${accessoryId}: "${row}"`)
          for (const cell of row) {
            if (cell === '.') continue
            assert.ok(cellColor(SKINS[skinId], cell, accessory), `${skinId}: no colour for "${cell}"`)
          }
        }
      }
    }
  }
})

test('the characters can be told apart, and each pose from the others', () => {
  const seen = new Set<string>()
  for (const skinId of SKIN_IDS) {
    for (const pose of POSES) seen.add(agentRows(SKINS[skinId], pose).join('\n'))
  }
  assert.equal(seen.size, SKIN_IDS.length * POSES.length)
})

test('glasses are worn on the eyes, wherever a skin carries them', () => {
  const eyeRow = (skinId: 'blip' | 'frog'): number =>
    agentRows(SKINS[skinId], 'falling').findIndex((row) => row.includes('w'))
  const glassesRow = (skinId: 'blip' | 'frog'): number =>
    agentRows(SKINS[skinId], 'falling', ACCESSORIES.glasses).findIndex((row) => row.includes('K'))
  assert.equal(eyeRow('frog') - glassesRow('frog'), eyeRow('blip') - glassesRow('blip'))
  assert.ok(eyeRow('frog') < eyeRow('blip'))
})

test('the exhaust is as wide as the character', () => {
  for (const frame of FLAME_FRAMES) for (const row of frame) assert.equal(row.length, AGENT_WIDTH)
})
