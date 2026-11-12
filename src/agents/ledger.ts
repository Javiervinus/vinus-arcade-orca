// What the plugin knows about the person's agents: where each one runs, what it is doing, and
// the tasks they finished that the person has not been shown yet.
// The worker keeps it, because it hears agents even while the panel is closed; the panel only
// reads the view. Everything here is pure, so the rules can be tested without Orca.

export type AgentState = 'working' | 'blocked' | 'waiting' | 'done'
/** How a turn ended, when Orca knows. */
export type AgentOutcome =
  | 'success'
  | 'failure'
  | 'cancellation'
  | 'superseded'
  | 'interruption'
  | 'unconfirmed'

const HOUR = 60 * 60 * 1000

export const LEDGER = {
  /** A turn that ended one of these ways is not a finished task. */
  unfinishedOutcomes: ['failure', 'cancellation', 'superseded', 'interruption'] as readonly string[],
  /** Orca does not say when a terminal closes, so a state nobody refreshed expires. */
  keepMs: { working: 6 * HOUR, blocked: 24 * HOUR, waiting: 24 * HOUR, done: 12 * HOUR },
  maxPanes: 200,
  /** Agents sitting at the office's desks at once: the ones that need the person first. */
  maxCrew: 6,
  /** An agent that finished stays at its desk, resting, this long. */
  restMs: HOUR,
  /** Projects shown on the wall at once: the ones with agents first, then the ones last worked in. */
  maxProjects: 8
} as const

type Pane = {
  workspaceId: string | null
  state: AgentState
  at: number
  /** Which agent it is, as Orca calls it (`claude`, `codex`...): empty when Orca did not say,
   *  and missing while nobody asked. */
  agent?: string
}

export type Ledger = {
  panes: Record<string, Pane>
  /** Workspace id to project name; an empty name is a workspace Orca did not list. */
  names: Record<string, string>
  /** Tasks finished that the person has not been shown yet, by project name ('' when unknown). */
  unseen: Record<string, number>
  /** Project name to its folder on this machine, where its icon is looked for. */
  folders: Record<string, string>
  /** The projects last worked in, the latest first: they hang on the wall with no agent too. */
  recent: string[]
}

/** The part of `agent.status.changed` the ledger reads. */
export type StatusChange = {
  workspaceId: string | null
  paneKey: string
  state: AgentState
  receivedAt: number
  mainAgent?: { outcome?: AgentOutcome }
}

export type ProjectState = 'working' | 'waiting' | 'idle'
export type ProjectView = {
  name: string
  state: ProjectState
}
/** One agent at its desk in the office. */
export type CrewMember = {
  /** Its terminal in Orca: what tells one agent from another. */
  key: string
  /** Which agent it is, as Orca calls it; empty when unknown. */
  agent: string
  state: AgentState
  project: string | null
}
export type OfficeView = {
  /** The agents at the desks: the ones that need the person, the ones at work and the ones
   *  that just finished. */
  crew: CrewMember[]
  /** Projects with agents lately: the ones the wall shows. */
  projects: ProjectView[]
  /** What happened while nobody was looking; a null name is a project Orca did not name. */
  unseen: { name: string | null; tasks: number }[]
}
/** One agent changing state, as the panel tells it to the person. */
export type AgentNote = {
  paneKey: string
  workspaceId: string | null
  project: string | null
  /** Which agent it is, as Orca calls it; empty when unknown. */
  agent: string
  /** Whether it runs in Orca's floating window, which is no workspace Orca can be taken to. */
  floating: boolean
  state: AgentState
  /** Whether this change is a task the agent finished. */
  finished: boolean
}
export type OfficeChange = {
  view: OfficeView
  note: AgentNote | null
}

export function emptyLedger(): Ledger {
  return { panes: {}, names: {}, unseen: {}, folders: {}, recent: [] }
}

const STATES: readonly string[] = ['working', 'blocked', 'waiting', 'done']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads a stored ledger, dropping whatever is not what this version wrote. */
export function parseLedger(stored: unknown): Ledger {
  const ledger = emptyLedger()
  if (!isRecord(stored)) return ledger
  if (isRecord(stored.panes)) {
    for (const [key, pane] of Object.entries(stored.panes)) {
      if (!isRecord(pane) || typeof pane.at !== 'number') continue
      if (typeof pane.state !== 'string' || !STATES.includes(pane.state)) continue
      const workspaceId = typeof pane.workspaceId === 'string' ? pane.workspaceId : null
      ledger.panes[key] = { workspaceId, state: pane.state as AgentState, at: pane.at }
      if (typeof pane.agent === 'string') ledger.panes[key].agent = pane.agent
    }
  }
  if (isRecord(stored.names)) {
    for (const [id, name] of Object.entries(stored.names)) {
      if (typeof name === 'string') ledger.names[id] = name
    }
  }
  if (isRecord(stored.unseen)) {
    for (const [name, tasks] of Object.entries(stored.unseen)) {
      if (typeof tasks === 'number' && tasks > 0) ledger.unseen[name] = Math.floor(tasks)
    }
  }
  if (isRecord(stored.folders)) {
    for (const [name, folder] of Object.entries(stored.folders)) {
      if (typeof folder === 'string') ledger.folders[name] = folder
    }
  }
  if (Array.isArray(stored.recent)) {
    ledger.recent = stored.recent.filter((name): name is string => typeof name === 'string')
  }
  return ledger
}

function projectOf(ledger: Ledger, workspaceId: string | null): string {
  return workspaceId ? (ledger.names[workspaceId] ?? '') : ''
}

/** Whether the ledger has no name yet for the workspace a change comes from. */
export function needsNames(ledger: Ledger, workspaceId: string | null): boolean {
  return workspaceId !== null && !(workspaceId in ledger.names)
}

/** The last folder of a path, on any system. */
function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? ''
}

/** What a workspace's project is called: the project Orca gives it (its repository), or, for a
 *  workspace without one (a plain folder), the folder's own name; Orca's name for such a
 *  workspace is a generic one the person never chose. */
function projectName(workspace: { name: string; project?: string | null; path: string }): string {
  return (workspace.project || folderName(workspace.path) || workspace.name).trim()
}

/** A workspace as Orca lists it. */
export type Workspace = {
  id: string
  name: string
  project?: string | null
  path: string
  hostId?: string | null
}

/** Whether a workspace's folder is on this machine, where the worker can read it. */
function isLocal(workspace: Workspace): boolean {
  return !workspace.hostId || workspace.hostId === 'local'
}

/** What Orca calls the workspace of the agents in its floating window. */
const FLOATING_WORKSPACE = 'global-floating-terminal'

/** An agent's status names its workspace as `<project id>::<path>`, which is not the id Orca's
 *  list of workspaces gives it: the path is what ties the two. */
const PATH_MARK = '::'
function pathOf(workspaceId: string): string | null {
  const at = workspaceId.indexOf(PATH_MARK)
  return at < 0 ? null : workspaceId.slice(at + PATH_MARK.length)
}

function samePath(path: string): string {
  return path.replace(/[\\/]+$/, '')
}

/**
 * Takes the names of Orca's workspaces, and names the workspaces the agents run in (and `alsoFor`,
 * one about to be recorded): by id when Orca lists it, else by the path in the id, else by that
 * path's folder. One with no name at all keeps an empty one, so it is not asked for again.
 */
export function setNames(
  ledger: Ledger,
  workspaces: readonly Workspace[],
  alsoFor: string | null = null
): void {
  const names: Record<string, string> = {}
  const folders: Record<string, string> = {}
  const byPath = new Map<string, string>()
  for (const workspace of workspaces) {
    const name = projectName(workspace)
    names[workspace.id] = name
    byPath.set(samePath(workspace.path), name)
    // A project's first workspace on this machine is its own folder; the rest are worktrees.
    if (name && isLocal(workspace) && !(name in folders)) folders[name] = workspace.path
  }
  if (workspaces.length > 0) ledger.folders = folders
  const wanted = [...Object.values(ledger.panes).map((pane) => pane.workspaceId), alsoFor]
  for (const id of wanted) {
    if (!id || id in names) continue
    const path = pathOf(id)
    names[id] = path ? (byPath.get(samePath(path)) ?? folderName(path)) : ''
  }
  ledger.names = names
}

/** Names one workspace without Orca's list: by the folder in its id, when it has one. */
export function nameUnlisted(ledger: Ledger, workspaceId: string): void {
  const path = pathOf(workspaceId)
  ledger.names[workspaceId] = path ? folderName(path) : ''
}

/** Forgets states too old to still be true, and the oldest ones past the limit. */
export function prune(ledger: Ledger, now: number): boolean {
  let changed = false
  for (const [key, pane] of Object.entries(ledger.panes)) {
    if (now - pane.at > LEDGER.keepMs[pane.state]) {
      delete ledger.panes[key]
      changed = true
    }
  }
  const keys = Object.keys(ledger.panes)
  if (keys.length > LEDGER.maxPanes) {
    keys
      .sort((a, b) => (ledger.panes[a]?.at ?? 0) - (ledger.panes[b]?.at ?? 0))
      .slice(0, keys.length - LEDGER.maxPanes)
      .forEach((key) => delete ledger.panes[key])
    changed = true
  }
  return changed
}

/**
 * Records one agent changing state. A task is finished when an agent the ledger saw at work
 * reaches `done`: the first sight of an agent counts for nothing, and neither does a turn the
 * person interrupted. Returns the note to tell the person, or null when nothing changed.
 */
export function recordStatus(ledger: Ledger, change: StatusChange): AgentNote | null {
  const before = ledger.panes[change.paneKey]
  if (before && before.state === change.state && before.workspaceId === change.workspaceId) {
    return null
  }
  ledger.panes[change.paneKey] = {
    workspaceId: change.workspaceId,
    state: change.state,
    at: change.receivedAt
  }
  if (before?.agent !== undefined) ledger.panes[change.paneKey].agent = before.agent
  const project = projectOf(ledger, change.workspaceId)
  const outcome = change.mainAgent?.outcome
  const finished =
    change.state === 'done' &&
    before !== undefined &&
    before.state !== 'done' &&
    !(outcome && LEDGER.unfinishedOutcomes.includes(outcome))
  if (finished) ledger.unseen[project] = (ledger.unseen[project] ?? 0) + 1
  prune(ledger, change.receivedAt)
  return {
    paneKey: change.paneKey,
    workspaceId: change.workspaceId,
    project: project || null,
    agent: before?.agent ?? '',
    floating: change.workspaceId === FLOATING_WORKSPACE,
    state: change.state,
    finished
  }
}

/** Takes the projects last worked in, the latest first. */
export function setRecent(ledger: Ledger, names: readonly string[]): void {
  ledger.recent = names.slice(0, LEDGER.maxProjects)
}

/** An agent as the app's own CLI lists it. */
export type SeenAgent = {
  paneKey: string
  workspaceId: string
  state: AgentState
  /** Which agent it is, as Orca calls it; null when it did not say. */
  agent: string | null
  /** When it was last heard of, when Orca says. */
  at: number | null
}

/**
 * Takes every agent Orca has right now, so the office is whole without waiting for each agent
 * to change state. Nothing counts as finished here: an agent first seen this way is only known
 * from now on. An agent the ledger had in a workspace this answer covers, and that is not in it, is gone.
 */
export function seedAgents(
  ledger: Ledger,
  seen: { workspaceIds: readonly string[]; agents: readonly SeenAgent[] },
  now: number
): void {
  const covered = new Set(seen.workspaceIds)
  const live = new Set(seen.agents.map((agent) => agent.paneKey))
  for (const [key, pane] of Object.entries(ledger.panes)) {
    if (pane.workspaceId && covered.has(pane.workspaceId) && !live.has(key)) delete ledger.panes[key]
  }
  for (const agent of seen.agents) {
    const known = ledger.panes[agent.paneKey]
    const at = Math.min(now, agent.at ?? now)
    if (known && known.state === agent.state && known.workspaceId === agent.workspaceId) {
      known.at = Math.max(known.at, at)
      known.agent = agent.agent ?? ''
      continue
    }
    ledger.panes[agent.paneKey] = {
      workspaceId: agent.workspaceId,
      state: agent.state,
      at,
      agent: agent.agent ?? ''
    }
  }
}

/** Whether nobody asked yet which agent runs in a terminal the ledger knows. */
export function needsKind(ledger: Ledger, paneKey: string): boolean {
  const pane = ledger.panes[paneKey]
  return pane !== undefined && pane.agent === undefined
}

/** Takes which agent runs in each terminal the ledger knows; one Orca does not list keeps an
 *  empty kind, so it is not asked for again. */
export function setKinds(ledger: Ledger, agents: readonly SeenAgent[]): void {
  const kinds = new Map(agents.map((agent) => [agent.paneKey, agent.agent ?? '']))
  for (const [key, pane] of Object.entries(ledger.panes)) {
    if (pane.agent === undefined) pane.agent = kinds.get(key) ?? ''
  }
}

/** Forgets a workspace Orca removed. */
export function removeWorkspace(ledger: Ledger, workspaceId: string): boolean {
  let changed = workspaceId in ledger.names
  delete ledger.names[workspaceId]
  for (const [key, pane] of Object.entries(ledger.panes)) {
    if (pane.workspaceId !== workspaceId) continue
    delete ledger.panes[key]
    changed = true
  }
  return changed
}

/** The person saw what their agents finished. */
export function markSeen(ledger: Ledger): boolean {
  if (Object.keys(ledger.unseen).length === 0) return false
  ledger.unseen = {}
  return true
}

/** Which agents come first at the desks: the ones that need the person, then the ones at work. */
const CREW_ORDER: Record<AgentState, number> = { waiting: 0, blocked: 1, working: 2, done: 3 }

function crewOf(ledger: Ledger, now: number): CrewMember[] {
  return Object.entries(ledger.panes)
    .filter(([, pane]) => pane.state !== 'done' || now - pane.at <= LEDGER.restMs)
    .sort(
      ([keyA, a], [keyB, b]) =>
        CREW_ORDER[a.state] - CREW_ORDER[b.state] || b.at - a.at || keyA.localeCompare(keyB)
    )
    .slice(0, LEDGER.maxCrew)
    .map(([key, pane]) => ({
      key,
      agent: pane.agent ?? '',
      state: pane.state,
      project: projectOf(ledger, pane.workspaceId) || null
    }))
}

export function viewOf(ledger: Ledger, now: number = Date.now()): OfficeView {
  const projects = new Map<string, { state: ProjectState; at: number }>()
  for (const pane of Object.values(ledger.panes)) {
    const name = projectOf(ledger, pane.workspaceId)
    if (!name) continue
    const state: ProjectState =
      pane.state === 'working' ? 'working' : pane.state === 'done' ? 'idle' : 'waiting'
    const known = projects.get(name)
    if (!known) {
      projects.set(name, { state, at: pane.at })
      continue
    }
    known.at = Math.max(known.at, pane.at)
    // An agent that needs the person matters more than one at work, and that more than a quiet one.
    if (state === 'waiting' || (state === 'working' && known.state === 'idle')) known.state = state
  }
  const shown: ProjectView[] = [...projects.entries()]
    .sort((a, b) => b[1].at - a[1].at || a[0].localeCompare(b[0]))
    .map(([name, { state }]) => ({ name, state }))
  // The wall is the person's own office: with few agents, it fills with what they last worked in.
  for (const name of ledger.recent) {
    if (!projects.has(name)) shown.push({ name, state: 'idle' })
  }
  return {
    crew: crewOf(ledger, now),
    projects: shown.slice(0, LEDGER.maxProjects),
    unseen: Object.entries(ledger.unseen)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, tasks]) => ({ name: name || null, tasks }))
  }
}
