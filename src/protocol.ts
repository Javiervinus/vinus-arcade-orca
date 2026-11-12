// The panel <-> worker contract, declared once: src/main.ts and src/worker.ts both read it.
import type { IconFile } from './agents/disk'
import type { OfficeChange, OfficeView } from './agents/ledger'

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
  }
  interface PluginPanelEvents {
    /** An agent changed state: the view after it, and the change to tell the person. */
    'office.changed': OfficeChange
  }
}
