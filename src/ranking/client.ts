// The plugin's side of the world ranking. Only the worker talks to the server, and only for a
// person who joined: until they choose a nickname nothing is sent. What it sends is that
// nickname, the record of a run and a secret that tells the server it is the same player; the
// person's projects and agents never leave their computer.
import type { JsonValue } from 'orca'
import { weekOf, type Board, type RunSubmission, type RunVerdict, type Standing } from './api'

export const RANKING = {
  /** The ranking's server: server/ in this repository, on Cloudflare. */
  server: 'https://vinus-arcade.javiervinueza.workers.dev',
  timeoutMs: 10_000,
  /** A long run is flown again over a few requests; past this many the worker lets it go. */
  maxRequestsPerRun: 80,
  secretBytes: 32
} as const

/** Why a run was let go after flying it again took more requests than a run may take. */
export const TOO_LONG = 'replay took too long'

/** The storage key the worker alone writes: who the person is in the ranking. */
export const PLAYER_KEY = 'ranking'

// A type, not an interface: storage takes only what is plainly JSON.
export type Player = {
  /** Proves to the server that runs come from the same player. Never shown, never logged. */
  secret: string
  name: string
  /** The best score the server kept for each game this week, to send only runs that beat it. */
  weekBest: Record<string, { period: string; endsAt: number; score: number }>
}

export function parsePlayer(value: unknown): Player | null {
  if (typeof value !== 'object' || value === null) return null
  const stored = value as Partial<Player>
  if (typeof stored.secret !== 'string' || typeof stored.name !== 'string') return null
  const weekBest = typeof stored.weekBest === 'object' && stored.weekBest !== null ? stored.weekBest : {}
  return { secret: stored.secret, name: stored.name, weekBest }
}

/** The storage key the worker alone writes: the best run of the week of each game that has not
 *  reached the ranking yet, because the person had not joined or the server could not be
 *  reached. It stays on this computer until it is sent. */
export const HELD_KEY = 'heldRuns'

export type HeldRun = { period: string; endsAt: number; score: number; record: JsonValue }
export type HeldRuns = Record<string, HeldRun>

/** The runs held, without those of a week gone by: they would count in no week. */
export function parseHeld(value: unknown, now: number): HeldRuns {
  const held: HeldRuns = {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return held
  for (const [game, run] of Object.entries(value as Record<string, unknown>)) {
    if (typeof run !== 'object' || run === null) continue
    const { period, endsAt, score, record } = run as Partial<HeldRun>
    if (typeof period !== 'string' || typeof endsAt !== 'number' || typeof score !== 'number') continue
    if (record === undefined || now >= endsAt) continue
    held[game] = { period, endsAt, score, record }
  }
  return held
}

/** Holds a run that just ended when it is the best of the week not sent. Returns whether it did. */
export function holdRun(held: HeldRuns, game: string, score: number, record: JsonValue, now: number): boolean {
  if (score <= 0) return false
  const current = held[game]
  if (current && current.score >= score) return false
  held[game] = { ...weekOf(now), score, record }
  return true
}

export function newSecret(): string {
  const bytes = new Uint8Array(RANKING.secretBytes)
  crypto.getRandomValues(bytes)
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** What the panel learns of the ranking: who the person is in it, and the board; a null board
 *  is a server that could not be reached. */
export interface RankingView {
  name: string | null
  board: Board | null
  /** The score of the game's run held on this computer, waiting to be sent; null without one. */
  held: number | null
}

export type JoinResult = { ok: true; name: string } | { ok: false; problem: 'name' | 'soon' | 'offline' }

/** What became of a run: `skipped` when there was no need to send it, `held` when it waits on
 *  this computer for the person to join. A run the server could not be reached for waits too. */
export type SubmitResult = RunVerdict | { status: 'skipped' } | { status: 'held' } | { status: 'offline' }

/** Why the server would not do what it was asked. */
export class RankingError extends Error {
  constructor(
    /** The HTTP status; 0 when the server could not be reached. */
    readonly status: number,
    readonly reason: string
  ) {
    super(`ranking: ${status} ${reason}`)
  }
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>

export class RankingClient {
  constructor(private readonly send: Fetch) {}

  board(game: string, player: Player | null): Promise<Board> {
    return this.call<Board>('GET', `/v1/boards/${encodeURIComponent(game)}`, player)
  }

  join(player: Player): Promise<{ name: string }> {
    return this.call('PUT', '/v1/me', player, { name: player.name })
  }

  async leave(player: Player): Promise<void> {
    await this.call('DELETE', '/v1/me', player)
  }

  /** Sends a run and keeps asking until the server has flown it again. */
  async submit(player: Player, run: RunSubmission): Promise<RunVerdict> {
    let verdict = await this.call<RunVerdict>('POST', '/v1/runs', player, run)
    for (let i = 1; verdict.status === 'checking' && i < RANKING.maxRequestsPerRun; i += 1) {
      verdict = await this.call<RunVerdict>('POST', `/v1/runs/${verdict.run}`, player)
    }
    if (verdict.status === 'checking') throw new RankingError(0, TOO_LONG)
    return verdict
  }

  private async call<T>(method: string, path: string, player: Player | null, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (player) headers.authorization = `Bearer ${player.secret}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    let response: Response
    try {
      response = await this.send(`${RANKING.server}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(RANKING.timeoutMs)
      })
    } catch (error) {
      throw new RankingError(0, error instanceof Error ? error.name : 'unreachable')
    }
    if (response.status === 204) return undefined as T
    const answer = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      const reason = (answer as { error?: unknown } | null)?.error
      throw new RankingError(response.status, typeof reason === 'string' ? reason : 'error')
    }
    return answer as T
  }
}

/** Whether a run could change the player's place this week: a run that does not beat their
 *  best of the week is not sent. */
export function worthSending(player: Player, game: string, score: number, now: number): boolean {
  if (score <= 0) return false
  const best = player.weekBest[game]
  if (!best || now >= best.endsAt) return true
  return score > best.score
}

/** Keeps what the server said of the player's best this week. */
export function rememberWeek(
  player: Player,
  game: string,
  week: { period: string; endsAt: number },
  standing: Standing | null
): void {
  player.weekBest[game] = { period: week.period, endsAt: week.endsAt, score: standing?.score ?? 0 }
}
