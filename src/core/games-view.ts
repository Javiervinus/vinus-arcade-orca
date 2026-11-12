// The window of the arcade's games: the ones there are, and the room kept for the ones to come.
import type { GameDefinition } from './game'
import { drawText, textWidth } from './paint'
import { AGENT_HEIGHT, AGENT_WIDTH, GLYPH_HEIGHT, type AccessoryId, type SkinId } from './sprites'
import type { Strings } from './strings'
import { paintLook, sizePreview } from './wardrobe-view'

const LOOK = {
  /** How many tiles say that a game is on its way. */
  soonTiles: 2,
  soonText: '?',
  soonScale: 2,
  soonInk: '#8b97c9'
} as const

export interface GamesActions {
  /** The id of the game being played. */
  current(): string
  /** The character in use: each game's tile shows it. */
  worn(): { skin: SkinId; accessory: AccessoryId | null }
  /** The person chose a game. */
  choose(id: string): void
}

interface GameTile {
  game: GameDefinition
  button: HTMLButtonElement
  preview: HTMLCanvasElement
  state: HTMLSpanElement
}

export class GamesMenu {
  private readonly gameTiles: GameTile[] = []
  private readonly soonStates: HTMLSpanElement[] = []

  constructor(
    private readonly root: HTMLElement,
    list: HTMLElement,
    private readonly strings: Strings,
    games: readonly GameDefinition[],
    private readonly actions: GamesActions
  ) {
    for (const game of games) {
      const { button, preview, state } = this.tile(game.name)
      button.addEventListener('click', () => actions.choose(game.id))
      this.gameTiles.push({ game, button, preview, state })
      list.append(button)
    }
    for (let i = 0; i < LOOK.soonTiles; i += 1) {
      const { button, preview, state } = this.tile(LOOK.soonText.repeat(3))
      button.disabled = true
      button.classList.add('locked')
      this.paintSoon(preview)
      this.soonStates.push(state)
      list.append(button)
    }
  }

  get open(): boolean {
    return !this.root.hidden
  }

  show(): void {
    this.root.hidden = false
    this.refresh()
  }

  hide(): void {
    this.root.hidden = true
  }

  refresh(): void {
    if (!this.open) return
    const current = this.actions.current()
    const worn = this.actions.worn()
    for (const { game, button, preview, state } of this.gameTiles) {
      const playing = game.id === current
      paintLook(preview, worn.skin, worn.accessory)
      button.setAttribute('aria-pressed', String(playing))
      state.textContent = playing ? this.strings.playing : ''
    }
    for (const state of this.soonStates) state.textContent = this.strings.soon
  }

  private tile(name: string): Pick<GameTile, 'button' | 'preview' | 'state'> {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tile'
    const preview = document.createElement('canvas')
    sizePreview(preview)
    const label = document.createElement('span')
    label.className = 'tile-name'
    label.textContent = name
    const state = document.createElement('span')
    state.className = 'tile-price'
    button.append(preview, label, state)
    return { button, preview, state }
  }

  /** A game nobody has seen yet: a question mark where its character will be. */
  private paintSoon(preview: HTMLCanvasElement): void {
    const paint = preview.getContext('2d')
    if (!paint) return
    const width = textWidth(LOOK.soonText, LOOK.soonScale)
    const left = Math.floor((AGENT_WIDTH - width) / 2)
    const top = Math.floor((AGENT_HEIGHT - GLYPH_HEIGHT * LOOK.soonScale) / 2)
    drawText(paint, LOOK.soonText, left, top, LOOK.soonScale, LOOK.soonInk)
  }
}
