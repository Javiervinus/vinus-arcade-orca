// What the panel keeps between sessions, by key. The coins, what they bought and the settings
// are the arcade's, shared by every game; a best score is its game's.
export const STORE = {
  coins: 'coins',
  skin: 'skin',
  accessory: 'accessory',
  bought: 'bought',
  sound: 'sound',
  hideNames: 'hideNames',
  pauseOnNeed: 'pauseOnNeed',
  pauseOnDone: 'pauseOnDone',
  language: 'language'
} as const

/** Where a game's best score is kept. */
export function bestKey(gameId: string): string {
  return `best:${gameId}`
}
