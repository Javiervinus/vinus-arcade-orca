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

/** Where a score not on the board yet would stand on it: after every score as high, since the
 *  first to reach a score keeps the place. Null when it would fall below the board. */
export function placeOf(top: readonly BoardEntry[], score: number): number | null {
  const ahead = top.filter((entry) => entry.score >= score).length
  return ahead < TOP_PLAYERS ? ahead + 1 : null
}

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
  /** The held score the person joined with, until the boards say whether it went in. */
  private joinedWith: number | null = null
  /** Whether the nickname box takes the focus once it shows: the person came to join. */
  private toJoin = false

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

  /** Opens the window; `toJoin` when the person came from the card to put their run on it. */
  show(toJoin = false): void {
    this.parts.root.hidden = false
    this.message = ''
    this.renaming = false
    this.toJoin = toJoin
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
    parts.pitch.textContent = this.pitch()
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
    const held = this.view?.held ?? null
    parts.status.textContent = this.loading
      ? strings.rankingLoading
      : this.view && !board
        ? strings.rankingOffline
        : name !== null && held !== null
          ? fill(strings.rankingHeldWaiting, { score: held })
          : this.message
    parts.status.hidden = parts.status.textContent === ''
  }

  /** The score held on this computer, for a person who has not joined: it is what they would
   *  bring in with a nickname. */
  private waiting(): number | null {
    return this.view && this.view.name === null ? this.view.held : null
  }

  /** How the window asks for a nickname: with the person's own run and where it would land,
   *  when there is one. */
  private pitch(): string {
    const { strings } = this
    const score = this.waiting()
    if (score === null) return strings.rankingPitch
    const side = this.view?.board?.[this.tab]
    const rank = side ? placeOf(side.top, score) : null
    if (rank === null) return fill(strings.rankingPitchHeld, { score })
    return fill(this.tab === 'week' ? strings.rankingPitchWeek : strings.rankingPitchAll, { score, rank })
  }

  private showList(board: Board | null): void {
    const { parts, strings } = this
    const side = board ? board[this.tab] : null
    const score = this.waiting()
    const rank = side && score !== null ? placeOf(side.top, score) : null
    const rows = (side?.top ?? []).map((entry) =>
      this.row(rank !== null && entry.rank >= rank ? { ...entry, rank: entry.rank + 1 } : entry)
    )
    // The person's own run, in the place it would take, and the board below it one place down.
    if (rank !== null && score !== null) {
      rows.splice(rank - 1, 0, this.ghost(rank, score))
      rows.length = Math.min(rows.length, TOP_PLAYERS)
    }
    if (side && rows.length === 0) {
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

  /** The row of a run that is not on the board yet. */
  private ghost(rank: number, score: number): HTMLLIElement {
    const item = this.row({ rank, score, name: this.strings.rankingGhost, me: true })
    item.classList.add('ghost')
    return item
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
      this.view = { name: this.view?.name ?? null, board: null, held: this.view?.held ?? null }
    }
    this.loading = false
    if (this.joinedWith !== null) {
      // The run held went in with the nickname when the board has it; if it still waits, the
      // window says so on its own.
      const counted = (this.view.board?.week.me?.score ?? 0) >= this.joinedWith
      if (counted) this.message = fill(this.strings.rankingInWith, { score: this.joinedWith })
      this.joinedWith = null
    }
    this.refresh()
    if (this.toJoin && !this.parts.form.hidden) {
      this.toJoin = false
      this.parts.name.focus()
    }
  }

  private async submitName(): Promise<void> {
    const { parts, strings } = this
    parts.join.disabled = true
    try {
      const result = await this.actions.join(parts.name.value)
      if (result.ok) {
        const joining = this.view?.name == null
        const held = this.view?.held ?? null
        this.view = { name: result.name, board: this.view?.board ?? null, held }
        this.renaming = false
        this.message = joining ? strings.rankingFromNow : ''
        this.joinedWith = joining ? held : null
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
        this.view = { name: null, board: this.view?.board ?? null, held: null }
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
