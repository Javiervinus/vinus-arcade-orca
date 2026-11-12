// The window where coins are spent: the characters and what they wear, as tiles to press.
import {
  ACCESSORIES,
  ACCESSORY_IDS,
  AGENT_HEIGHT,
  AGENT_WIDTH,
  SKINS,
  SKIN_IDS,
  agentRows,
  cellColor,
  type AccessoryId,
  type SkinId
} from './sprites'
import { fill, type Strings } from './strings'
import { PRICES, owns, type ItemId } from './wardrobe'

export type SkinChoice = SkinId | 'auto'

/** How many screen pixels each pixel of a preview takes. */
const PREVIEW_SCALE = 3
/** How long a tile says how many coins are missing. */
const SHORT_MS = 1600

export interface WardrobeState {
  choice: SkinChoice
  /** The skin `auto` stands for right now. */
  autoSkin: SkinId
  accessory: AccessoryId | null
  bought: readonly ItemId[]
  coins: number
}

export interface WardrobeActions {
  state(): WardrobeState
  chooseSkin(choice: SkinChoice): void
  chooseAccessory(accessory: AccessoryId | null): void
  /** Takes the coins and keeps the thing. */
  buy(id: ItemId): void
}

interface Tile {
  button: HTMLButtonElement
  preview: HTMLCanvasElement
  price: HTMLSpanElement
  /** The thing it sells, or null for the free choices (`auto`, no accessory). */
  item: ItemId | null
}

/** Paints a character, wearing something or nothing, on a canvas of the sprite's size. */
export function paintLook(
  canvas: HTMLCanvasElement,
  skinId: SkinId,
  accessoryId: AccessoryId | null
): void {
  const paint = canvas.getContext('2d')
  if (!paint) return
  const skin = SKINS[skinId]
  const accessory = accessoryId ? ACCESSORIES[accessoryId] : null
  paint.clearRect(0, 0, canvas.width, canvas.height)
  agentRows(skin, 'falling', accessory).forEach((row, j) => {
    for (let i = 0; i < row.length; i += 1) {
      const color = cellColor(skin, row[i] ?? '.', accessory)
      if (!color) continue
      paint.fillStyle = color
      paint.fillRect(i, j, 1, 1)
    }
  })
}

/** Gives a canvas the size of a character's preview. */
export function sizePreview(canvas: HTMLCanvasElement): void {
  canvas.width = AGENT_WIDTH
  canvas.height = AGENT_HEIGHT
  canvas.style.width = `${AGENT_WIDTH * PREVIEW_SCALE}px`
  canvas.style.height = `${AGENT_HEIGHT * PREVIEW_SCALE}px`
}

export class Wardrobe {
  private readonly skinTiles = new Map<SkinChoice, Tile>()
  private readonly accessoryTiles = new Map<AccessoryId | 'none', Tile>()
  /** The thing a first press asked to buy; a second press on it buys. */
  private armed: ItemId | null = null
  private short: ItemId | null = null
  private shortTimer = 0

  constructor(
    private readonly root: HTMLElement,
    private readonly count: HTMLElement,
    characters: HTMLElement,
    accessories: HTMLElement,
    private readonly strings: Strings,
    private readonly actions: WardrobeActions
  ) {
    const choices: SkinChoice[] = ['auto', ...SKIN_IDS]
    for (const choice of choices) {
      const name = choice === 'auto' ? strings.auto : strings.items[choice]
      const tile = this.tile(name, choice === 'auto' ? null : choice)
      if (choice === 'auto') tile.button.title = strings.autoHint
      tile.button.addEventListener('click', () => this.press(tile, () => actions.chooseSkin(choice)))
      this.skinTiles.set(choice, tile)
      characters.append(tile.button)
    }
    const worn: (AccessoryId | 'none')[] = ['none', ...ACCESSORY_IDS]
    for (const id of worn) {
      const tile = this.tile(id === 'none' ? strings.none : strings.items[id], id === 'none' ? null : id)
      tile.button.addEventListener('click', () =>
        this.press(tile, () => actions.chooseAccessory(id === 'none' ? null : id))
      )
      this.accessoryTiles.set(id, tile)
      accessories.append(tile.button)
    }
  }

  get open(): boolean {
    return !this.root.hidden
  }

  show(): void {
    this.armed = null
    this.root.hidden = false
    this.refresh()
  }

  hide(): void {
    this.root.hidden = true
  }

  /** Redraws every tile from the state: what is in use, what is owned, what each thing costs. */
  refresh(): void {
    if (!this.open) return
    const state = this.actions.state()
    const skin = state.choice === 'auto' ? state.autoSkin : state.choice
    this.count.textContent = String(state.coins)
    for (const [choice, tile] of this.skinTiles) {
      paintLook(tile.preview, choice === 'auto' ? state.autoSkin : choice, null)
      this.mark(tile, state, choice === state.choice)
    }
    for (const [id, tile] of this.accessoryTiles) {
      const accessory = id === 'none' ? null : id
      paintLook(tile.preview, skin, accessory)
      this.mark(tile, state, accessory === state.accessory)
    }
  }

  private tile(name: string, item: ItemId | null): Tile {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tile'
    const preview = document.createElement('canvas')
    sizePreview(preview)
    const label = document.createElement('span')
    label.className = 'tile-name'
    label.textContent = name
    const price = document.createElement('span')
    price.className = 'tile-price'
    button.append(preview, label, price)
    return { button, preview, price, item }
  }

  private mark(tile: Tile, state: WardrobeState, inUse: boolean): void {
    const { item } = tile
    const locked = item !== null && !owns(state.bought, item)
    tile.button.setAttribute('aria-pressed', String(inUse))
    tile.button.classList.toggle('locked', locked)
    tile.button.classList.toggle('armed', locked && this.armed === item)
    tile.price.classList.toggle('coins', locked && this.armed !== item && this.short !== item)
    if (!locked || item === null) {
      tile.price.textContent = ''
    } else if (this.armed === item) {
      tile.price.textContent = this.strings.buy
    } else if (this.short === item) {
      tile.price.textContent = fill(this.strings.short, { coins: PRICES[item] - state.coins })
    } else {
      tile.price.textContent = String(PRICES[item])
    }
  }

  private press(tile: Tile, choose: () => void): void {
    const { item } = tile
    const state = this.actions.state()
    window.clearTimeout(this.shortTimer)
    this.short = null
    if (item === null || owns(state.bought, item)) {
      this.armed = null
      choose()
    } else if (state.coins < PRICES[item]) {
      this.armed = null
      this.short = item
      this.shortTimer = window.setTimeout(() => {
        this.short = null
        this.refresh()
      }, SHORT_MS)
    } else if (this.armed === item) {
      this.armed = null
      this.actions.buy(item)
      choose()
    } else {
      this.armed = item
    }
    this.refresh()
  }
}
