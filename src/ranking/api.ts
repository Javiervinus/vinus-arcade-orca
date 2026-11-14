// The ranking's contract: what the server (server/) answers and what it takes, read by the
// plugin's worker, the panel and the server alike, so the three never disagree.

/** How many players each board shows. */
export const TOP_PLAYERS = 10

const DAY_MS = 24 * 60 * 60 * 1000

/** The week of a moment, Monday to Sunday in UTC, named as ISO 8601 names it. */
export function weekOf(now: number): { period: string; endsAt: number } {
  const date = new Date(now)
  const sinceMonday = (date.getUTCDay() + 6) % 7
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - sinceMonday)
  const thursday = new Date(monday + 3 * DAY_MS)
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  const week = Math.floor((thursday.getTime() - yearStart) / DAY_MS / 7) + 1
  return {
    period: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
    endsAt: monday + 7 * DAY_MS
  }
}

/** A nickname: letters and numbers of any language, and a few marks between them. */
export const NICKNAME = {
  min: 2,
  max: 16,
  pattern: /^[\p{L}\p{N}](?:[\p{L}\p{N} ._-]*[\p{L}\p{N}])?$/u
} as const

/** The nickname as it is kept, or null when it cannot be one. */
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ')
  const length = [...name].length
  if (length < NICKNAME.min || length > NICKNAME.max) return null
  return NICKNAME.pattern.test(name) ? name : null
}

/** Where a player stands on a board. */
export interface Standing {
  rank: number
  score: number
}

export interface BoardEntry extends Standing {
  name: string
  /** Whether this is the player who asked. */
  me: boolean
}

export interface Board {
  game: string
  /** This week's board, Monday to Sunday in UTC. */
  week: { period: string; endsAt: number; top: BoardEntry[]; me: Standing | null }
  /** The board of all time. */
  all: { top: BoardEntry[]; me: Standing | null }
}

/** What the server says of a run sent to it. A long run is flown again over a few requests. */
export type RunVerdict =
  | { status: 'checking'; run: string }
  | {
      status: 'counted'
      score: number
      /** Where the player's best stands now, this week and of all time. */
      week: Standing
      all: Standing
      /** The week it counted in, and when that week ends. */
      period: string
      endsAt: number
    }
  | { status: 'refused'; reason: string }

/** A run sent to the server: the game, and its record as the game wrote it. */
export interface RunSubmission {
  game: string
  record: unknown
}
