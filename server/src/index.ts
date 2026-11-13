// The server of Vinus Arcade's world ranking, a Cloudflare Worker with a D1 database.
// It keeps only what the ranking needs: a nickname and the best scores of each player. A score
// counts once the server has flown the run again from its record and got the same score; a
// long run is flown over a few requests, because each request has little CPU time to spend.
import { checkRecord, continueReplay, startReplay, type ReplayResult, type ReplayState, type RunRecord } from '../../src/games/blip/replay'
import {
  TOP_PLAYERS,
  cleanNickname,
  type Board,
  type BoardEntry,
  type RunVerdict,
  type Standing
} from '../../src/ranking/api'

interface Env {
  DB: D1Database
}

const LIMITS = {
  /** Steps of a run flown again in one request: about 2 ms of CPU once the isolate is warm,
   *  within the 10 ms of Workers Free when it is not. */
  stepsPerRequest: 4000,
  maxBodyBytes: 512 * 1024,
  /** A player sends at most one run this often, and has at most this many being flown. */
  runEveryMs: 2000,
  openRuns: 3,
  renameEveryMs: 10_000,
  /** A run not finished within this time is let go. */
  runLifeMs: 60 * 60 * 1000
} as const

const DAY_MS = 24 * 60 * 60 * 1000
const ALL_TIME = 'all'

/** The games the server can fly again, by id. */
const GAMES: Record<
  string,
  {
    check(record: unknown): string | null
    start(record: RunRecord): ReplayResult
    resume(state: ReplayState, record: RunRecord, budget: number): ReplayResult
  }
> = {
  blip: { check: checkRecord, start: startReplay, resume: continueReplay }
}

class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  })
}

/** The week of a moment, Monday to Sunday in UTC, named as ISO 8601 names it. */
function weekOf(now: number): { period: string; endsAt: number } {
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

/** The player behind a request: the hash of the secret their plugin keeps, never the secret. */
async function playerOf(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? ''
  const secret = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(header)?.[1]
  if (!secret) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function requirePlayer(request: Request, env: Env): Promise<string> {
  const id = await playerOf(request)
  if (!id) throw new Refusal(401, 'no player')
  const known = await env.DB.prepare('SELECT 1 FROM players WHERE id = ?').bind(id).first()
  if (!known) throw new Refusal(403, 'not in the ranking')
  return id
}

async function bodyOf(request: Request): Promise<unknown> {
  const text = await request.text()
  if (text.length > LIMITS.maxBodyBytes) throw new Refusal(413, 'too big')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Refusal(400, 'not json')
  }
}

function gameOf(id: string): (typeof GAMES)[string] {
  const game = GAMES[id]
  if (!game) throw new Refusal(404, 'no such game')
  return game
}

/** Where a player's best score of a period stands on its board; null without one. */
async function standingOf(env: Env, game: string, period: string, player: string): Promise<Standing | null> {
  const row = await env.DB.prepare(
    `SELECT score, at,
       (SELECT COUNT(*) FROM scores o
         WHERE o.game = s.game AND o.period = s.period
           AND (o.score > s.score OR (o.score = s.score AND o.at < s.at))) + 1 AS rank
     FROM scores s WHERE game = ? AND period = ? AND player_id = ?`
  )
    .bind(game, period, player)
    .first<{ score: number; rank: number }>()
  return row ? { rank: row.rank, score: row.score } : null
}

async function topOf(env: Env, game: string, period: string, player: string | null): Promise<BoardEntry[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.score, p.name, s.player_id AS id FROM scores s JOIN players p ON p.id = s.player_id
     WHERE s.game = ? AND s.period = ? ORDER BY s.score DESC, s.at ASC LIMIT ?`
  )
    .bind(game, period, TOP_PLAYERS)
    .all<{ score: number; name: string; id: string }>()
  return results.map((row, index) => ({
    rank: index + 1,
    name: row.name,
    score: row.score,
    me: row.id === player
  }))
}

async function readBoard(env: Env, game: string, player: string | null): Promise<Board> {
  gameOf(game)
  const week = weekOf(Date.now())
  const [weekTop, allTop, weekMe, allMe] = await Promise.all([
    topOf(env, game, week.period, player),
    topOf(env, game, ALL_TIME, player),
    player ? standingOf(env, game, week.period, player) : null,
    player ? standingOf(env, game, ALL_TIME, player) : null
  ])
  return {
    game,
    week: { period: week.period, endsAt: week.endsAt, top: weekTop, me: weekMe },
    all: { top: allTop, me: allMe }
  }
}

async function join(request: Request, env: Env): Promise<Response> {
  const id = await playerOf(request)
  if (!id) throw new Refusal(401, 'no player')
  const body = (await bodyOf(request)) as { name?: unknown }
  const name = cleanNickname(body.name)
  if (!name) throw new Refusal(400, 'bad name')
  const now = Date.now()
  const known = await env.DB.prepare('SELECT renamed_at FROM players WHERE id = ?')
    .bind(id)
    .first<{ renamed_at: number }>()
  if (known && now - known.renamed_at < LIMITS.renameEveryMs) throw new Refusal(429, 'too soon')
  await env.DB.prepare(
    `INSERT INTO players (id, name, created_at, renamed_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, renamed_at = excluded.renamed_at`
  )
    .bind(id, name, now, now)
    .run()
  return json({ name })
}

async function leave(request: Request, env: Env): Promise<Response> {
  const id = await playerOf(request)
  if (!id) throw new Refusal(401, 'no player')
  await env.DB.batch([
    env.DB.prepare('DELETE FROM scores WHERE player_id = ?').bind(id),
    env.DB.prepare('DELETE FROM runs WHERE player_id = ?').bind(id),
    env.DB.prepare('DELETE FROM players WHERE id = ?').bind(id)
  ])
  return new Response(null, { status: 204 })
}

/** Keeps a run that was flown again to its score, as the player's best when it is. */
async function count(env: Env, game: string, player: string, score: number): Promise<RunVerdict> {
  const now = Date.now()
  const { period: week, endsAt } = weekOf(now)
  const keep = env.DB.prepare(
    `INSERT INTO scores (game, period, player_id, score, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (game, period, player_id) DO UPDATE SET score = excluded.score, at = excluded.at
     WHERE excluded.score > scores.score`
  )
  await env.DB.batch([
    keep.bind(game, week, player, score, now),
    keep.bind(game, ALL_TIME, player, score, now)
  ])
  const [weekStanding, allStanding] = await Promise.all([
    standingOf(env, game, week, player),
    standingOf(env, game, ALL_TIME, player)
  ])
  if (!weekStanding || !allStanding) throw new Refusal(500, 'score not kept')
  return { status: 'counted', score, week: weekStanding, all: allStanding, period: week, endsAt }
}

/** Flies a run on as far as one request may, and says where it is. */
async function fly(
  env: Env,
  run: { id: string; player: string; game: string },
  result: ReplayResult
): Promise<RunVerdict> {
  if (!result.done) {
    await env.DB.prepare('UPDATE runs SET state = ? WHERE id = ?')
      .bind(JSON.stringify(result.state), run.id)
      .run()
    return { status: 'checking', run: run.id }
  }
  await env.DB.prepare('DELETE FROM runs WHERE id = ?').bind(run.id).run()
  if (!result.valid) return { status: 'refused', reason: result.reason ?? 'replay' }
  return count(env, run.game, run.player, result.score)
}

async function submit(request: Request, env: Env): Promise<Response> {
  const player = await requirePlayer(request, env)
  const body = (await bodyOf(request)) as { game?: unknown; record?: unknown }
  if (typeof body.game !== 'string') throw new Refusal(400, 'no game')
  const game = gameOf(body.game)
  const reason = game.check(body.record)
  if (reason) return json({ status: 'refused', reason } satisfies RunVerdict)
  const record = body.record as RunRecord
  const now = Date.now()
  // One run every so often: the player's own row says when the last one came, and only one
  // request at a time can move it on.
  const turn = await env.DB.prepare('UPDATE players SET last_run_at = ? WHERE id = ? AND last_run_at <= ?')
    .bind(now, player, now - LIMITS.runEveryMs)
    .run()
  if (turn.meta.changes === 0) throw new Refusal(429, 'too soon')
  await env.DB.prepare('DELETE FROM runs WHERE created_at < ?').bind(now - LIMITS.runLifeMs).run()
  const open = await env.DB.prepare('SELECT COUNT(*) AS open FROM runs WHERE player_id = ?')
    .bind(player)
    .first<{ open: number }>()
  if (open && open.open >= LIMITS.openRuns) throw new Refusal(429, 'too many runs')
  const started = game.start(record)
  const result = started.done ? started : game.resume(started.state, record, LIMITS.stepsPerRequest)
  // A run that ends in this request is never written down.
  if (result.done) {
    if (!result.valid) return json({ status: 'refused', reason: result.reason ?? 'replay' } satisfies RunVerdict)
    return json(await count(env, body.game, player, result.score))
  }
  const id = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO runs (id, player_id, game, record, state, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, player, body.game, JSON.stringify(record), JSON.stringify(result.state), now)
    .run()
  return json({ status: 'checking', run: id } satisfies RunVerdict)
}

async function resume(request: Request, env: Env, id: string): Promise<Response> {
  const player = await requirePlayer(request, env)
  const row = await env.DB.prepare('SELECT game, record, state FROM runs WHERE id = ? AND player_id = ?')
    .bind(id, player)
    .first<{ game: string; record: string; state: string }>()
  if (!row) throw new Refusal(404, 'no such run')
  const record = JSON.parse(row.record) as RunRecord
  const state = JSON.parse(row.state) as ReplayState
  const result = gameOf(row.game).resume(state, record, LIMITS.stepsPerRequest)
  return json(await fly(env, { id, player, game: row.game }, result))
}

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url)
  const method = request.method
  const board = /^\/v1\/boards\/([a-z0-9-]{1,32})$/.exec(pathname)
  if (board?.[1] && method === 'GET') {
    return json(await readBoard(env, board[1], await playerOf(request)))
  }
  if (pathname === '/v1/me' && method === 'PUT') return join(request, env)
  if (pathname === '/v1/me' && method === 'DELETE') return leave(request, env)
  if (pathname === '/v1/runs' && method === 'POST') return submit(request, env)
  const run = /^\/v1\/runs\/([0-9a-f-]{36})$/.exec(pathname)
  if (run?.[1] && method === 'POST') return resume(request, env, run[1])
  if (pathname === '/' && method === 'GET') {
    return json({ name: 'Vinus Arcade ranking', source: 'https://github.com/Javiervinus/vinus-arcade-orca' })
  }
  throw new Refusal(404, 'not found')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env)
    } catch (error) {
      if (error instanceof Refusal) return json({ error: error.message }, error.status)
      console.error(error)
      return json({ error: 'server' }, 500)
    }
  }
} satisfies ExportedHandler<Env>
