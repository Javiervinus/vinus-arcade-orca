// The window of the world ranking: the best of the week and of all time in the game being
// played, and how to join it with a nickname. It asks the worker for everything; the worker is
// the only part that talks to the server.
import type { Board, BoardEntry, Standing } from '../ranking/api'
import { NICKNAME, TOP_PLAYERS } from '../ranking/api'
import type { JoinResult, RankingView } from '../ranking/client'
import { fill, type Strings } from './strings'

const LOOK = {
  /** How long the leave button waits for the second press. */
  confirmMs: 3000
} as const

const HOUR_MS = 60 * 60 * 1000

export interface RankingActions {
  /** The game whose boards are shown. */
  game(): { id: string; name: string }
  read(game: string): Promise<RankingView>
  join(name: string): Promise<JoinResult>
  leave(): Promise<{ left: boolean }>
}

type Tab = 'week' | 'all'

export interface RankingParts {
  root: HTMLElement
  title: HTMLElement
  ends: HTMLElement
  week: HTMLButtonElement
  all: HTMLButtonElement
  list: HTMLOListElement
  me: HTMLElement
  status: HTMLElement
  player: HTMLElement
  playingAs: HTMLElement
  rename: HTMLButtonElement
  leave: HTMLButtonElement
  form: HTMLFormElement
  pitch: HTMLElement
  name: HTMLInputElement
  join: HTMLButtonElement
  privacy: HTMLElement
}

/** How long until a moment, as the window says it: days and hours, or hours alone. */
function timeUntil(at: number, now: number): string {
  const hours = Math.max(1, Math.ceil((at - now) / HOUR_MS))
  const days = Math.floor(hours / 24)
  return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`
}

export class RankingSheet {
  private tab: Tab = 'week'
  private view: RankingView | null = null
  private loading = false
  /** Says what went wrong or what just happened, until the next thing does. */
  private message = ''
  private renaming = false
  private leaveTimer = 0

  constructor(
    private readonly parts: RankingParts,
    private readonly strings: Strings,
    private readonly actions: RankingActions
  ) {
    parts.name.maxLength = NICKNAME.max
    parts.week.addEventListener('click', () => this.choose('week'))
    parts.all.addEventListener('click', () => this.choose('all'))
    parts.form.addEventListener('submit', (event) => {
      event.preventDefault()
      void this.submitName()
    })
    parts.rename.addEventListener('click', () => {
      this.renaming = true
      this.refresh()
      parts.name.value = this.view?.name ?? ''
      parts.name.focus()
      parts.name.select()
    })
    parts.leave.addEventListener('click', () => void this.pressLeave())
  }

  get open(): boolean {
    return !this.parts.root.hidden
  }

  show(): void {
    this.parts.root.hidden = false
    this.message = ''
    this.renaming = false
    this.refresh()
    void this.load()
  }

  hide(): void {
    this.parts.root.hidden = true
    this.disarmLeave()
  }

  /** The worker said the server forgot the player: they have to join again. */
  forget(): void {
    if (this.view) this.view = { ...this.view, name: null }
    if (this.open) this.refresh()
  }

  /** Reads the boards again, when the window is open. */
  reload(): void {
    if (this.open) void this.load()
  }

  refresh(): void {
    const { parts, strings } = this
    const game = this.actions.game()
    parts.title.textContent = `${strings.rankingTitle} · ${game.name}`
    parts.week.textContent = strings.rankingWeek
    parts.all.textContent = strings.rankingAll
    parts.week.setAttribute('aria-selected', String(this.tab === 'week'))
    parts.all.setAttribute('aria-selected', String(this.tab === 'all'))
    parts.pitch.textContent = strings.rankingPitch
    parts.name.placeholder = strings.rankingPlaceholder
    parts.join.textContent = this.renaming ? strings.rankingSave : strings.rankingJoin
    parts.privacy.textContent = strings.rankingPrivacy
    parts.rename.textContent = strings.rankingRename
    if (!this.leaveTimer) parts.leave.textContent = strings.rankingLeave

    const board = this.view?.board ?? null
    const name = this.view?.name ?? null
    parts.ends.textContent =
      board && this.tab === 'week'
        ? fill(strings.rankingEnds, { time: timeUntil(board.week.endsAt, Date.now()) })
        : ''
    this.showList(board)
    parts.player.hidden = name === null || this.renaming
    parts.playingAs.textContent = name ? fill(strings.rankingPlayingAs, { name }) : ''
    parts.form.hidden = this.view === null || (name !== null && !this.renaming)
    parts.pitch.hidden = this.renaming
    parts.privacy.hidden = this.renaming
    parts.status.textContent = this.loading
      ? strings.rankingLoading
      : this.view && !board
        ? strings.rankingOffline
        : this.message
    parts.status.hidden = parts.status.textContent === ''
  }

  private showList(board: Board | null): void {
    const { parts, strings } = this
    const side = board ? board[this.tab] : null
    const rows: HTMLLIElement[] = []
    for (const entry of side?.top ?? []) rows.push(this.row(entry))
    if (side && side.top.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'rank-empty'
      empty.textContent = strings.rankingEmpty
      rows.push(empty)
    }
    parts.list.replaceChildren(...rows)
    parts.list.hidden = !side
    const me: Standing | null = side?.me ?? null
    const shown = side?.top.some((entry) => entry.me) ?? false
    parts.me.textContent =
      me && !shown && me.rank > TOP_PLAYERS ? fill(strings.rankingYou, { rank: me.rank, score: me.score }) : ''
    parts.me.hidden = parts.me.textContent === ''
  }

  private row(entry: BoardEntry): HTMLLIElement {
    const item = document.createElement('li')
    item.className = entry.me ? 'rank-row me' : 'rank-row'
    const rank = document.createElement('span')
    rank.className = 'rank-place'
    rank.textContent = String(entry.rank)
    const name = document.createElement('span')
    name.className = 'rank-name'
    name.textContent = entry.name
    const score = document.createElement('span')
    score.className = 'rank-score'
    score.textContent = String(entry.score)
    item.append(rank, name, score)
    return item
  }

  private choose(tab: Tab): void {
    this.tab = tab
    this.refresh()
  }

  private async load(): Promise<void> {
    this.loading = true
    this.refresh()
    try {
      this.view = await this.actions.read(this.actions.game().id)
    } catch {
      this.view = { name: this.view?.name ?? null, board: null }
    }
    this.loading = false
    this.refresh()
  }

  private async submitName(): Promise<void> {
    const { parts, strings } = this
    parts.join.disabled = true
    try {
      const result = await this.actions.join(parts.name.value)
      if (result.ok) {
        const joining = this.view?.name == null
        this.view = { name: result.name, board: this.view?.board ?? null }
        this.renaming = false
        this.message = joining ? strings.rankingFromNow : ''
        parts.name.value = ''
        void this.load()
      } else {
        this.message =
          result.problem === 'name'
            ? strings.rankingBadName
            : result.problem === 'soon'
              ? strings.rankingSoon
              : strings.rankingOffline
      }
    } catch {
      this.message = strings.rankingOffline
    } finally {
      parts.join.disabled = false
      this.refresh()
    }
  }

  /** Leaving deletes every score of the player: it takes a second press. */
  private async pressLeave(): Promise<void> {
    const { parts, strings } = this
    if (!this.leaveTimer) {
      parts.leave.textContent = strings.rankingLeaveSure
      this.leaveTimer = window.setTimeout(() => {
        this.disarmLeave()
        this.refresh()
      }, LOOK.confirmMs)
      return
    }
    this.disarmLeave()
    parts.leave.disabled = true
    try {
      const { left } = await this.actions.leave()
      if (left) {
        this.view = { name: null, board: this.view?.board ?? null }
        this.message = strings.rankingLeft
        void this.load()
      } else {
        this.message = strings.rankingOffline
      }
    } catch {
      this.message = strings.rankingOffline
    } finally {
      parts.leave.disabled = false
      this.refresh()
    }
  }

  private disarmLeave(): void {
    window.clearTimeout(this.leaveTimer)
    this.leaveTimer = 0
  }
}
