// What coins buy: characters and what they wear. The agent characters are free, because
// taking the colour of the agent you run is the game's first wink; the rest is earned.
import { ACCESSORY_IDS, SKIN_IDS, type AccessoryId, type SkinId } from './sprites'

export type ItemId = SkinId | AccessoryId

/** Coins each thing costs; zero is owned from the start. */
export const PRICES: Record<ItemId, number> = {
  blip: 0,
  claude: 0,
  codex: 0,
  gemini: 0,
  cat: 150,
  frog: 300,
  gold: 900,
  cap: 75,
  glasses: 180,
  headphones: 300,
  crown: 700
}

/** What things cost up to 0.2.0, when what was spent was not kept: what someone bought then
 *  cost them this, and their coins are worked out at these prices once. */
export const PRICES_UNTIL_0_2: Record<ItemId, number> = {
  ...PRICES,
  cat: 40,
  frog: 90,
  gold: 250,
  cap: 20,
  glasses: 50,
  headphones: 90,
  crown: 200
}

/** Coins are earned only by playing: this many for each coin caught in a run. */
export const COINS_PER_TOKEN = 1

/** Coins for catching what an agent sends into the run when it finishes a task. */
export const COINS_PER_DELIVERY = 5

const ITEM_IDS: readonly string[] = [...SKIN_IDS, ...ACCESSORY_IDS]

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && (SKIN_IDS as readonly string[]).includes(value)
}

export function isAccessoryId(value: unknown): value is AccessoryId {
  return typeof value === 'string' && (ACCESSORY_IDS as readonly string[]).includes(value)
}

/** The bought things a stored value names, without what this version does not sell. */
export function parseBought(stored: unknown): ItemId[] {
  if (!Array.isArray(stored)) return []
  return stored.filter(
    (id): id is ItemId => typeof id === 'string' && ITEM_IDS.includes(id) && PRICES[id as ItemId] > 0
  )
}

export function owns(bought: readonly ItemId[], id: ItemId): boolean {
  return PRICES[id] === 0 || bought.includes(id)
}

/** What the things bought cost, at the given prices. */
export function spentOn(bought: readonly ItemId[], prices: Record<ItemId, number> = PRICES): number {
  return bought.reduce((sum, id) => sum + prices[id], 0)
}

/** Coins left to spend: what the runs earned, less what was spent. */
export function walletOf(runCoins: number, spent: number): number {
  return Math.max(0, runCoins - spent)
}
