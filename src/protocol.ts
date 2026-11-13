// The panel <-> worker contract, declared once: src/main.ts and src/worker.ts both read it.
import type { IconFile } from './agents/disk'
import type { OfficeChange, OfficeView } from './agents/ledger'
import type { JoinResult, RankingView, SubmitResult } from './ranking/client'

declare module 'orca' {
  interface PluginRequests {
    /** Shows the workspace an agent runs in, as clicking it in Orca's sidebar does. */
    'agent.open': { input: { workspaceId: string }; output: { opened: boolean } }
    /** The projects, the agents at the desks and what they finished that the person has not seen. */
    'office.read': { output: OfficeView }
    /** A project's own icon, read from its folder; null when it has none. */
    'project.icon': { input: { name: string }; output: IconFile | null }
    /** The panel showed the person what their agents finished. */
    'office.seen': { output: { seen: boolean } }
    /** A game's boards in the world ranking, and the person's nickname if they joined. */
    'ranking.read': { input: { game: string }; output: RankingView }
    /** Joins the ranking with a nickname, or changes it. */
    'ranking.join': { input: { name: string }; output: JoinResult }
    /** Leaves the ranking: the server forgets the nickname and every score. */
    'ranking.leave': { output: { left: boolean } }
    /** A run that just ended, for the server to fly again and count. */
    'ranking.submit': { input: { game: string; score: number; record: unknown }; output: SubmitResult }
  }
  interface PluginPanelEvents {
    /** An agent changed state: the view after it, and the change to tell the person. */
    'office.changed': OfficeChange
  }
}
