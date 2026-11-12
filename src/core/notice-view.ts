// What an agent tells the person in the middle of a game: a box at the foot of the room, as a
// character speaking, with the face of the agent it is.
import type { AgentNote } from '../agents/ledger'
import { skinForAgent } from './sprites'
import { paintLook, sizePreview } from './wardrobe-view'

export interface NoticeParts {
  root: HTMLElement
  face: HTMLCanvasElement
  text: HTMLElement
  /** A second line, for what the person can do about it. */
  extra: HTMLElement
  go: HTMLButtonElement
}

export class Notice {
  /** The agent the box is about, while it is up. */
  private about: { paneKey: string; workspaceId: string | null } | null = null
  private timer = 0

  constructor(private readonly parts: NoticeParts) {
    sizePreview(parts.face)
  }

  /** The workspace of the agent the box is about, when Orca can be taken to it. */
  get workspaceId(): string | null {
    return this.about?.workspaceId ?? null
  }

  contains(target: Node): boolean {
    return this.parts.root.contains(target)
  }

  /**
   * Shows what an agent says. `urgent` is an agent that needs the person, which stays until it
   * is answered; any other goes away by itself after `lastsMs`.
   */
  show(note: AgentNote, text: string, extra: string, urgent: boolean, lastsMs: number | null): void {
    window.clearTimeout(this.timer)
    const { root, face, go } = this.parts
    // Orca cannot be taken to the floating window: there is no workspace to open.
    const reachable = note.workspaceId !== null && !note.floating
    this.about = { paneKey: note.paneKey, workspaceId: reachable ? note.workspaceId : null }
    paintLook(face, skinForAgent(note.agent), null)
    this.parts.text.textContent = text
    this.parts.extra.textContent = extra
    this.parts.extra.hidden = extra === ''
    go.hidden = !reachable
    root.classList.toggle('urgent', urgent)
    root.hidden = false
    if (lastsMs !== null) this.timer = window.setTimeout(() => this.hide(), lastsMs)
  }

  /** Says something went wrong, in the box that is up. */
  fail(text: string): void {
    this.parts.text.textContent = text
    this.parts.extra.hidden = true
  }

  hide(): void {
    window.clearTimeout(this.timer)
    this.about = null
    this.parts.root.hidden = true
  }

  /** Takes the box down if it is about this agent. */
  hideFor(paneKey: string): void {
    if (this.about?.paneKey === paneKey) this.hide()
  }
}
