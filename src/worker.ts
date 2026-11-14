// The plugin's worker. It does what a panel cannot do: it takes the person to the agent that
// needs them (a panel cannot change what Orca shows), it hears agents while the panel is closed,
// so what they finished is waiting to be told when the person comes back, it asks the app's
// own CLI for every agent (src/cli.ts), to sit them at the office's desks, and it reads each
// project's own icon from its folder (src/disk.ts) to hang it on the office wall. And it is
// the only part that talks to the world ranking's server (src/ranking/client.ts), for a person
// who joined it.
import type { JsonValue, OrcaWorkerApi } from 'orca/worker'
import { readAgents, readProjectIcons } from './agents/cli'
import { lastWorked, readIcon } from './agents/disk'
import {
  markSeen,
  nameUnlisted,
  needsKind,
  needsNames,
  parseLedger,
  prune,
  recordStatus,
  removeWorkspace,
  seedAgents,
  setKinds,
  setNames,
  setRecent,
  viewOf,
  type Ledger
} from './agents/ledger'
import { cleanNickname } from './ranking/api'
import {
  HELD_KEY,
  PLAYER_KEY,
  RankingClient,
  RankingError,
  TOO_LONG,
  holdRun,
  newSecret,
  parseHeld,
  parsePlayer,
  rememberWeek,
  worthSending,
  type Fetch,
  type HeldRuns,
  type JoinResult,
  type Player,
  type SubmitResult
} from './ranking/client'

/** The storage key the worker alone writes. */
const LEDGER_KEY = 'ledger'

/** What the worker reaches outside Orca's plugin API: the app's own CLI, the projects' folders
 *  and the ranking's server. The tests put their own in its place. */
export const outside: {
  readAgents: typeof readAgents
  readProjectIcons: typeof readProjectIcons
  lastWorked: typeof lastWorked
  readIcon: typeof readIcon
  fetch: Fetch
} = {
  readAgents,
  readProjectIcons,
  lastWorked,
  readIcon,
  fetch: (url, init) => fetch(url, init)
}

export default function activate(orca: OrcaWorkerApi): void {
  let ledger: Ledger | null = null
  // Orca stops an idle worker, so the ledger lives in storage; one change is applied at a time.
  let queue: Promise<unknown> = Promise.resolve()

  function inTurn<T>(work: (ledger: Ledger) => Promise<T>): Promise<T> {
    const turn = queue.then(async () => {
      ledger ??= parseLedger(await orca.storage.get(LEDGER_KEY))
      return work(ledger)
    })
    queue = turn.catch((error: unknown) => orca.log(`ledger: ${String(error)}`))
    return turn
  }

  function save(current: Ledger): Promise<void> {
    return orca.storage.set(LEDGER_KEY, current)
  }

  const ranking = new RankingClient((url, init) => outside.fetch(url, init))
  // Who the person is in the ranking changes one request at a time, like the ledger.
  let rankingQueue: Promise<unknown> = Promise.resolve()

  function rankingTurn<T>(work: (player: Player | null) => Promise<T>): Promise<T> {
    const turn = rankingQueue.then(async () => work(parsePlayer(await orca.storage.get(PLAYER_KEY))))
    rankingQueue = turn.catch((error: unknown) => orca.log(`ranking: ${String(error)}`))
    return turn
  }

  function keepPlayer(player: Player | null): Promise<void> {
    return player ? orca.storage.set(PLAYER_KEY, player) : orca.storage.delete(PLAYER_KEY)
  }

  /** The runs held on this computer, and what storage had, to write them only if they changed. */
  async function readHeld(): Promise<{ held: HeldRuns; stored: string }> {
    const value = await orca.storage.get(HELD_KEY)
    return { held: parseHeld(value, Date.now()), stored: JSON.stringify(value ?? {}) }
  }

  async function keepHeld(held: HeldRuns, stored: string): Promise<void> {
    if (JSON.stringify(held) === stored) return
    await (Object.keys(held).length > 0 ? orca.storage.set(HELD_KEY, held) : orca.storage.delete(HELD_KEY))
  }

  /** Whether a run the server did not take may be sent again later: only when the server could
   *  not be reached, was busy or failed. A run it turned down is let go. */
  function worthRetrying(error: unknown): boolean {
    if (!(error instanceof RankingError)) return true
    if (error.status === 0) return error.reason !== TOO_LONG
    return error.status === 429 || error.status >= 500
  }

  /** Sends the game's held run when it could move the player this week. The run is let go once
   *  the server has had its say; it stays only when it can be sent again later. */
  async function sendHeld(player: Player, game: string, held: HeldRuns): Promise<SubmitResult> {
    const run = held[game]
    if (!run) return { status: 'skipped' }
    if (!worthSending(player, game, run.score, Date.now())) {
      delete held[game]
      return { status: 'skipped' }
    }
    try {
      const verdict = await ranking.submit(player, { game, record: run.record })
      delete held[game]
      if (verdict.status === 'counted') {
        rememberWeek(player, game, verdict, verdict.week)
        await keepPlayer(player)
      }
      return verdict
    } catch (error) {
      orca.log(String(error))
      // The server no longer knows this player: they join again from the panel, and the run
      // goes in with them.
      if (error instanceof RankingError && error.status === 403) {
        await keepPlayer(null)
        return { status: 'refused', reason: 'not in the ranking' }
      }
      if (worthRetrying(error)) return { status: 'offline' }
      delete held[game]
      return { status: 'refused', reason: error instanceof RankingError ? error.reason : 'error' }
    }
  }

  /** Asks Orca what its workspaces are called; `alsoFor` is one an agent was just seen in. */
  async function readNames(current: Ledger, alsoFor: string | null = null): Promise<void> {
    try {
      const { workspaces } = await orca.host.call('workspace.list')
      setNames(current, workspaces, alsoFor)
    } catch (error) {
      // Without the list the agent is still recorded; its project is named by its folder, if it can.
      orca.log(`workspace.list: ${String(error)}`)
      if (alsoFor) nameUnlisted(current, alsoFor)
    }
  }

  /** Finds which projects the person last worked in, from their folders. */
  async function readRecent(current: Ledger): Promise<void> {
    const worked = await Promise.all(
      Object.entries(current.folders).map(async ([name, folder]) => ({
        name,
        at: await outside.lastWorked(folder)
      }))
    )
    setRecent(
      current,
      worked
        .filter((project) => project.at > 0)
        .sort((a, b) => b.at - a.at)
        .map((project) => project.name)
    )
  }

  orca.events.on('agent.status.changed', (status) =>
    inTurn(async (current) => {
      if (needsNames(current, status.workspaceId)) await readNames(current, status.workspaceId)
      const note = recordStatus(current, status)
      if (!note) return
      // The event does not say which agent it is; the app's CLI does, and is asked once.
      if (needsKind(current, status.paneKey)) {
        try {
          setKinds(current, (await outside.readAgents()).agents)
        } catch (error) {
          orca.log(`orca worktree ps: ${String(error)}`)
        }
      }
      await save(current)
      orca.panels.post('office.changed', { view: viewOf(current), note })
    })
  )

  orca.events.on('workspace.removed', ({ workspaceId }) =>
    inTurn(async (current) => {
      if (!removeWorkspace(current, workspaceId)) return
      await save(current)
      orca.panels.post('office.changed', { view: viewOf(current), note: null })
    })
  )

  orca.panels.handle('agent.open', async ({ workspaceId }) => {
    const { opened } = await orca.host.call('workspace.open', { workspaceId })
    return { opened }
  })

  orca.panels.handle('office.read', () =>
    inTurn(async (current) => {
      try {
        seedAgents(current, await outside.readAgents(), Date.now())
      } catch (error) {
        // No CLI to ask: the wall still fills in as each agent changes state.
        orca.log(`orca worktree ps: ${String(error)}`)
      }
      await readNames(current)
      await readRecent(current)
      prune(current, Date.now())
      await save(current)
      return viewOf(current)
    })
  )

  orca.panels.handle('project.icon', ({ name }) =>
    inTurn(async (current) => {
      // Only the folder of a project Orca listed is read: the panel cannot ask for any path.
      const folder = current.folders[name]
      if (!folder) return null
      // The icon the person gave the project in Orca comes first: it is the one they know.
      try {
        const chosen = (await outside.readProjectIcons())[folder]
        if (chosen) return chosen
      } catch (error) {
        orca.log(`orca repo list: ${String(error)}`)
      }
      return outside.readIcon(folder)
    })
  )

  orca.panels.handle('office.seen', () =>
    inTurn(async (current) => {
      const seen = markSeen(current)
      if (seen) await save(current)
      return { seen }
    })
  )

  orca.panels.handle('ranking.read', ({ game }) =>
    rankingTurn(async (stored) => {
      let player = stored
      const { held, stored: before } = await readHeld()
      // A run held while the person had not joined, or could not reach the server, goes first.
      if (player && held[game]) {
        const sent = await sendHeld(player, game, held)
        if (sent.status === 'refused' && sent.reason === 'not in the ranking') player = null
        await keepHeld(held, before)
      }
      const waiting = held[game]?.score ?? null
      try {
        const board = await ranking.board(game, player)
        if (player) {
          rememberWeek(player, game, board.week, board.week.me)
          await keepPlayer(player)
        }
        return { name: player?.name ?? null, board, held: waiting }
      } catch (error) {
        orca.log(String(error))
        return { name: player?.name ?? null, board: null, held: waiting }
      }
    })
  )

  orca.panels.handle('ranking.join', ({ name }) =>
    rankingTurn(async (player): Promise<JoinResult> => {
      const nickname = cleanNickname(name)
      if (!nickname) return { ok: false, problem: 'name' }
      const next: Player = player
        ? { ...player, name: nickname }
        : { secret: newSecret(), name: nickname, weekBest: {} }
      try {
        await ranking.join(next)
      } catch (error) {
        orca.log(String(error))
        const status = error instanceof RankingError ? error.status : 0
        return { ok: false, problem: status === 400 ? 'name' : status === 429 ? 'soon' : 'offline' }
      }
      await keepPlayer(next)
      return { ok: true, name: nickname }
    })
  )

  orca.panels.handle('ranking.leave', () =>
    rankingTurn(async (player) => {
      if (!player) return { left: true }
      try {
        await ranking.leave(player)
      } catch (error) {
        orca.log(String(error))
        return { left: false }
      }
      await keepPlayer(null)
      // Leaving deletes it all: a run that was still to be sent goes too.
      await orca.storage.delete(HELD_KEY)
      return { left: true }
    })
  )

  orca.panels.handle('ranking.submit', ({ game, score, record }) =>
    rankingTurn(async (player): Promise<SubmitResult> => {
      const { held, stored } = await readHeld()
      // What the panel sends came over as JSON, and is JSON still.
      const kept = holdRun(held, game, score, record as JsonValue, Date.now())
      if (!player) {
        await keepHeld(held, stored)
        return { status: kept ? 'held' : 'skipped' }
      }
      const result = await sendHeld(player, game, held)
      await keepHeld(held, stored)
      return result
    })
  )
}
