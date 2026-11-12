// The plugin's worker. It does what a panel cannot do: it takes the person to the agent that
// needs them (a panel cannot change what Orca shows), it hears agents while the panel is closed,
// so what they finished is waiting to be told when the person comes back, it asks the app's
// own CLI for every agent (src/cli.ts), to sit them at the office's desks, and it reads each
// project's own icon from its folder (src/disk.ts) to hang it on the office wall.
import type { OrcaWorkerApi } from 'orca/worker'
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

/** The storage key the worker alone writes. */
const LEDGER_KEY = 'ledger'

/** What the worker reads outside Orca's plugin API: the app's own CLI and the projects'
 *  folders. The tests put their own in its place. */
export const outside = { readAgents, readProjectIcons, lastWorked, readIcon }

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
}
