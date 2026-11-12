// Every agent in every workspace, right now. Orca's plugin API tells a plugin when an agent
// changes state, but it lists only the agents of the workspace in focus; the `orca` CLI that
// comes inside the app lists them all, as Orca's sidebar does. The worker asks it when the panel
// opens, so the wall is complete from the first second.
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import type { IconFile } from './disk'
import type { AgentState, SeenAgent } from './ledger'

const CLI = {
  /** The CLI's names inside the running app's resources, by system; then whatever is on PATH. */
  names: ['orca', 'orca.cmd', 'orca.exe'],
  fallback: 'orca',
  agents: ['worktree', 'ps', '--json'],
  projects: ['repo', 'list', '--json'],
  timeoutMs: 5000,
  maxBytes: 32 * 1024 * 1024
} as const

const STATES: readonly string[] = ['working', 'blocked', 'waiting', 'done']

export type SeenAgents = {
  /** The workspaces this answer covers: an agent missing from one of them is gone. */
  workspaceIds: string[]
  agents: SeenAgent[]
}

function run(file: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: CLI.timeoutMs, maxBuffer: CLI.maxBytes }, (error, stdout) =>
      error ? reject(error) : resolve(stdout)
    )
  })
}

/** Runs the app's own CLI: the one inside the running app, else whatever `orca` is on PATH. */
async function ask(args: readonly string[]): Promise<string> {
  const inApp = process.resourcesPath
    ? CLI.names.map((name) => join(process.resourcesPath ?? '', 'bin', name))
    : []
  let failure: unknown = new Error('no orca CLI')
  for (const file of [...inApp, CLI.fallback]) {
    try {
      return await run(file, args)
    } catch (error) {
      failure = error
    }
  }
  throw failure
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads the CLI's answer. Of each agent it keeps where it runs, which agent it is, its state
 *  and when it was last heard of, and drops the rest (its prompt and its last message are there
 *  too, and are none of the game's business). */
export function parseAgents(output: string): SeenAgents {
  const seen: SeenAgents = { workspaceIds: [], agents: [] }
  const answer: unknown = JSON.parse(output)
  const result = isRecord(answer) ? answer.result : null
  const worktrees = isRecord(result) && Array.isArray(result.worktrees) ? result.worktrees : []
  for (const worktree of worktrees) {
    if (!isRecord(worktree) || typeof worktree.worktreeId !== 'string') continue
    seen.workspaceIds.push(worktree.worktreeId)
    for (const agent of Array.isArray(worktree.agents) ? worktree.agents : []) {
      if (!isRecord(agent) || typeof agent.paneKey !== 'string') continue
      if (typeof agent.state !== 'string' || !STATES.includes(agent.state)) continue
      seen.agents.push({
        paneKey: agent.paneKey,
        workspaceId: worktree.worktreeId,
        state: agent.state as AgentState,
        agent: typeof agent.agentType === 'string' ? agent.agentType : null,
        at:
          typeof agent.updatedAt === 'number'
            ? agent.updatedAt
            : typeof agent.stateStartedAt === 'number'
              ? agent.stateStartedAt
              : null
      })
    }
  }
  return seen
}

/** Asks the app's own CLI for every agent. Rejects when there is no CLI to ask. */
export async function readAgents(): Promise<SeenAgents> {
  return parseAgents(await ask(CLI.agents))
}

const DATA_IMAGE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i

/** The icons the person gave their projects in Orca, by project folder. Orca's other icons (an
 *  account's picture on GitHub, shared by all its repositories) are not a project's own, and
 *  are on the network, where the plugin never goes. */
export function parseProjectIcons(output: string): Record<string, IconFile> {
  const icons: Record<string, IconFile> = {}
  const answer: unknown = JSON.parse(output)
  const result = isRecord(answer) ? answer.result : null
  const repos = isRecord(result) && Array.isArray(result.repos) ? result.repos : []
  for (const repo of repos) {
    if (!isRecord(repo) || typeof repo.path !== 'string' || !isRecord(repo.repoIcon)) continue
    const { type, src } = repo.repoIcon
    const image = type === 'image' && typeof src === 'string' ? DATA_IMAGE.exec(src) : null
    if (image?.[1] && image[2]) icons[repo.path] = { type: image[1].toLowerCase(), data: image[2] }
  }
  return icons
}

export async function readProjectIcons(): Promise<Record<string, IconFile>> {
  return parseProjectIcons(await ask(CLI.projects))
}
