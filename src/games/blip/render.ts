// Draws one frame of the game on a canvas whose pixels are the game's logical pixels.
// The world is an office at dusk: tall windows over a city, a wooden floor, and bookshelves
// to fly between. Everything is drawn here with rectangles; the plugin ships no images.
import { DESK } from '../../core/desks'
import type { Look } from '../../core/game'
import { RULES, floorY, type Game, type GameEvent, type Gate } from './engine'
import type { Office } from '../../core/office'
import {
  box,
  drawCoin,
  drawOutlinedText,
  drawRows,
  drawText,
  hash,
  textWidth,
  type Paint
} from '../../core/paint'
import {
  AGENT_HEIGHT,
  AGENT_WIDTH,
  CREST_ROWS,
  FLAME_COLORS,
  FLAME_FRAMES,
  GLYPH_HEIGHT,
  agentRows,
  cellColor,
  type Accessory,
  type Pose,
  type Skin
} from '../../core/sprites'

/** What the character looks like: who it is and what it wears. */
/** The game keeps its own colours in both of Orca's themes. */
const WORLD = {
  /** The sky through the windows, from the top down to the horizon. */
  sky: ['#222a5e', '#303d7d', '#4a5aa2', '#7577b8', '#ab8cc0', '#f0a78f'],
  star: '#c9d2f5',
  moon: '#fff1cf',
  farTown: '#4b4f90',
  nearTown: '#282b5a',
  townLight: '#ffd27a',

  ceiling: '#1f2640',
  ceilingEdge: '#5b6b96',
  wall: '#3c4a70',
  wallShade: '#34415f',
  wainscot: '#2e3a5c',
  wainscotLine: '#27314f',
  rail: '#5b6b96',
  baseboard: '#1d2540',
  windowFrame: '#e6d8b8',
  windowSill: '#f5ecd4',

  lampCord: '#1d2540',
  lampShade: '#f2b84b',
  lampGlow: '#fff1cf',
  pictureFrame: '#c98f62',
  pictureSky: '#8fc7c2',
  pictureHill: '#4f8f6b',
  clockFace: '#f5ecd4',
  clockHand: '#2e3a5c',

  potRim: '#b56f55',
  pot: '#9a5b45',
  leafDark: '#2f6b4f',
  leaf: '#3f8a5f',
  leafLight: '#5aa873',
  cabinet: '#55638a',
  cabinetLine: '#3c4768',
  cabinetHandle: '#c9d2ea',
  box: '#c98f62',

  floor: '#9c6846',
  floorEdge: '#c98f62',
  floorSeam: '#7d5137',

  shelfBack: '#2a1a12',
  books: ['#e35d5b', '#f2b84b', '#4fa3a5', '#5b7bd5', '#7fb069', '#f0e6d2', '#b5679b'],
  bookBand: '#fff1cf',

  token: '#ffd166',
  tokenLight: '#fff3c4',
  tokenEdge: '#b9812f',
  score: '#ffffff',
  scoreShadow: '#1d2540',
  flash: '#ffffff'
} as const

/** The woods a bookshelf can be made of: its frame, its lit edge, its boards and its trim. */
const SHELF_WOODS: readonly { frame: string; edge: string; board: string; trim: string }[] = [
  { frame: '#5b3a22', edge: '#7a4f30', board: '#8a5a3b', trim: '#c58a5e' },
  { frame: '#7d5a34', edge: '#a07a48', board: '#b08a58', trim: '#dcb47a' },
  { frame: '#46557a', edge: '#62739c', board: '#7786ad', trim: '#aab6d6' }
]

const LAYOUT = {
  ceilingHeight: 6,
  windowTop: 22,
  windowWidth: 42,
  windowCell: 64,
  /** Wall left between the bottom of a window and the wainscot. */
  windowFoot: 18,
  /** How far under the top of the windows a project's plaque hangs. */
  plaqueDrop: 14,
  wainscotHeight: 30,
  wainscotPanel: 12,
  baseboardHeight: 3,
  wallParallax: 0.3,
  starParallax: 0.02,
  starCell: 19,
  farTownParallax: 0.05,
  nearTownParallax: 0.11,
  farTownCell: 13,
  nearTownCell: 17,
  propParallax: 0.6,
  propCell: 54,
  shelfRow: 11,
  trimHeight: 4,
  trimOverhang: 2,
  plankHeight: 5,
  plankLength: 22,
  scoreScale: 2,
  scoreTop: 14,
  /** The boost in the air: a gold tile that says what it does, bobbing and blinking. */
  boostHalfWidth: 5,
  boostHalfHeight: 4,
  boostBob: 2,
  boostBobSpeed: 6,
  boostBlinkSeconds: 0.18,
  /** The boost running: its sign under the score, and a bar that empties with its time. */
  boostTop: 30,
  boostBarWidth: 24,
  boostBarGap: 3,
  boostEndingSeconds: 3,
  boostEndingBlink: 0.15,
  flameSeconds: 0.14,
  risingVelocity: -30
} as const

const EFFECTS = {
  shakeSeconds: 0.25,
  shakeSize: 2,
  flashSeconds: 0.09,
  flashAlpha: 0.55,
  particleGravity: 260,
  flapPuffs: 2,
  tokenSparks: 7,
  boostSparks: 18,
  hitShards: 12,
  recordSparks: 16,
  confetti: 60,
  confettiSeconds: 2.4,
  confettiWeight: 0.12
} as const

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
  /** How much of gravity pulls it: confetti drifts down, shards drop. */
  weight: number
}

/** Short-lived decoration around the rules: particles, the hit shake and flash. */
export class Effects {
  private particles: Particle[] = []
  private shake = 0
  private flash = 0
  private sinceFlap = Number.POSITIVE_INFINITY

  /** Whether this run already beat the best score: the score is drawn in gold, crowned. */
  record = false

  constructor(private readonly calm: boolean) {}

  /** The moment a run beats the best score: sparks around the score. */
  beat(game: Game): void {
    this.record = true
    this.burst(
      game.width / 2,
      LAYOUT.scoreTop + 5,
      EFFECTS.recordSparks,
      90,
      [WORLD.token, WORLD.tokenLight],
      0.7
    )
  }

  /** A run that ended as the new best: confetti over the whole room. */
  rain(game: Game): void {
    if (this.calm) return
    for (let i = 0; i < EFFECTS.confetti; i += 1) {
      this.particles.push({
        x: Math.random() * game.width,
        y: -Math.random() * game.height * 0.4,
        vx: (Math.random() * 2 - 1) * 14,
        vy: 20 + Math.random() * 30,
        life: EFFECTS.confettiSeconds * (0.6 + Math.random() * 0.4),
        color: WORLD.books[i % WORLD.books.length] ?? WORLD.token,
        weight: EFFECTS.confettiWeight
      })
    }
  }

  get settled(): boolean {
    return this.particles.length === 0 && this.shake <= 0 && this.flash <= 0
  }

  get flameAge(): number {
    return this.sinceFlap
  }

  reset(): void {
    this.particles = []
    this.shake = 0
    this.flash = 0
    this.sinceFlap = Number.POSITIVE_INFINITY
    this.record = false
  }

  handle(event: GameEvent, game: Game, skin: Skin): void {
    if (event.type === 'flap') {
      this.sinceFlap = 0
      this.burst(game.agent.x, game.agent.y + 5, EFFECTS.flapPuffs, 30, [FLAME_COLORS.f], 0.25)
    } else if (event.type === 'token') {
      this.burst(event.x, event.y, EFFECTS.tokenSparks, 70, [WORLD.token, WORLD.tokenLight], 0.45)
    } else if (event.type === 'boost') {
      this.burst(event.x, event.y, EFFECTS.boostSparks, 120, [WORLD.token, WORLD.tokenLight], 0.6)
    } else if (event.type === 'hit') {
      const { body, light, shade, accent } = skin.palette
      this.burst(event.x, event.y, EFFECTS.hitShards, 110, [body, light, shade, accent], 0.6)
      if (!this.calm) {
        this.shake = EFFECTS.shakeSeconds
        this.flash = EFFECTS.flashSeconds
      }
    }
  }

  update(dt: number): void {
    this.sinceFlap += dt
    this.shake = Math.max(0, this.shake - dt)
    this.flash = Math.max(0, this.flash - dt)
    for (const particle of this.particles) {
      particle.vy += EFFECTS.particleGravity * particle.weight * dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.life -= dt
    }
    this.particles = this.particles.filter((particle) => particle.life > 0)
  }

  offset(): { x: number; y: number } {
    if (this.shake <= 0) return { x: 0, y: 0 }
    const size = EFFECTS.shakeSize
    return {
      x: Math.round((Math.random() * 2 - 1) * size),
      y: Math.round((Math.random() * 2 - 1) * size)
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.particles) {
      ctx.fillStyle = particle.color
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), 1, 1)
    }
  }

  drawFlash(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.flash <= 0) return
    ctx.globalAlpha = EFFECTS.flashAlpha * (this.flash / EFFECTS.flashSeconds)
    ctx.fillStyle = WORLD.flash
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1
  }

  private burst(
    x: number,
    y: number,
    count: number,
    speed: number,
    colors: readonly string[],
    life: number
  ): void {
    if (this.calm) return
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const push = speed * (0.4 + Math.random() * 0.6)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * push,
        vy: Math.sin(angle) * push,
        life: life * (0.6 + Math.random() * 0.4),
        color: colors[i % colors.length] ?? WORLD.token,
        weight: 1
      })
    }
  }
}

/** Calls `each` for every cell of a scrolling strip that touches the screen. */
function eachCell(
  game: Game,
  parallax: number,
  cell: number,
  each: (index: number, left: number) => void
): void {
  const shift = game.scroll * parallax
  const first = Math.floor(shift / cell) - 1
  const last = first + Math.ceil(game.width / cell) + 2
  for (let index = first; index <= last; index += 1) {
    each(index, Math.round(index * cell - shift))
  }
}

/** Where the room's parts sit for this panel height. */
function room(game: Game): { windowTop: number; windowBottom: number; wainscotTop: number } {
  const wainscotTop = floorY(game) - LAYOUT.wainscotHeight
  const windowBottom = Math.max(
    LAYOUT.windowTop + LAYOUT.windowFoot,
    wainscotTop - LAYOUT.windowFoot
  )
  return { windowTop: LAYOUT.windowTop, windowBottom, wainscotTop }
}

/** The dusk and the city behind the glass. The wall is painted over it, leaving the windows. */
function drawOutside(ctx: Paint, game: Game, top: number, bottom: number): void {
  const height = bottom - top
  const band = Math.ceil(height / WORLD.sky.length)
  WORLD.sky.forEach((color, i) => box(ctx, color, 0, top + i * band, game.width, band))

  eachCell(game, LAYOUT.starParallax, LAYOUT.starCell, (index, left) => {
    const h = hash(index, 5)
    if (h % 2 === 0) {
      box(ctx, WORLD.star, left + (h % LAYOUT.starCell), top + 3 + ((h >>> 6) % band), 1, 1)
    }
  })
  const moonX = Math.round(game.width * 0.7)
  const moonY = top + Math.round(band * 0.9)
  box(ctx, WORLD.moon, moonX - 2, moonY - 4, 5, 9)
  box(ctx, WORLD.moon, moonX - 4, moonY - 2, 9, 5)
  box(ctx, WORLD.moon, moonX - 3, moonY - 3, 7, 7)

  eachCell(game, LAYOUT.farTownParallax, LAYOUT.farTownCell, (index, left) => {
    const h = hash(index, 11)
    const tall = 8 + (h % Math.max(1, Math.round(height * 0.3)))
    box(ctx, WORLD.farTown, left, bottom - tall, LAYOUT.farTownCell - ((h >>> 7) % 4), tall)
  })
  eachCell(game, LAYOUT.nearTownParallax, LAYOUT.nearTownCell, (index, left) => {
    const h = hash(index, 23)
    const tall = 6 + (h % Math.max(1, Math.round(height * 0.18)))
    const wide = LAYOUT.nearTownCell - ((h >>> 7) % 3)
    box(ctx, WORLD.nearTown, left, bottom - tall, wide, tall)
    for (let row = 0; row * 4 + 3 < tall; row += 1) {
      for (let col = 0; col * 3 + 2 < wide - 1; col += 1) {
        if (hash(index * 53 + col, row) % 3 === 0) {
          box(ctx, WORLD.townLight, left + 2 + col * 3, bottom - tall + 3 + row * 4, 1, 2)
        }
      }
    }
  })
}

function drawLamp(ctx: Paint, x: number): void {
  const top = LAYOUT.ceilingHeight
  box(ctx, WORLD.lampCord, x, top, 1, 9)
  box(ctx, WORLD.lampShade, x - 1, top + 9, 3, 1)
  box(ctx, WORLD.lampShade, x - 2, top + 10, 5, 1)
  box(ctx, WORLD.lampShade, x - 3, top + 11, 7, 1)
  box(ctx, WORLD.lampShade, x - 4, top + 12, 9, 1)
  box(ctx, WORLD.lampGlow, x - 2, top + 13, 5, 1)
}

function drawPicture(ctx: Paint, x: number, y: number): void {
  box(ctx, WORLD.pictureFrame, x - 6, y, 12, 10)
  box(ctx, WORLD.pictureSky, x - 5, y + 1, 10, 8)
  box(ctx, WORLD.pictureHill, x - 5, y + 6, 10, 3)
  box(ctx, WORLD.pictureHill, x - 2, y + 4, 4, 2)
}

function drawClock(ctx: Paint, x: number, y: number): void {
  box(ctx, WORLD.clockHand, x - 3, y, 7, 9)
  box(ctx, WORLD.clockHand, x - 4, y + 1, 9, 7)
  box(ctx, WORLD.clockFace, x - 2, y + 1, 5, 7)
  box(ctx, WORLD.clockFace, x - 3, y + 2, 7, 5)
  box(ctx, WORLD.clockHand, x, y + 2, 1, 3)
  box(ctx, WORLD.clockHand, x, y + 4, 3, 1)
}

/** The office wall, painted around its windows, with what hangs on it: the plaques of the
 *  person's projects first, and the room's own pictures, clocks and lamps on the other pillars. */
function drawWall(ctx: Paint, game: Game, office: Office): void {
  const { windowTop, windowBottom, wainscotTop } = room(game)
  const floor = floorY(game)
  const pillar = LAYOUT.windowCell - LAYOUT.windowWidth
  const tall = windowBottom - windowTop

  drawOutside(ctx, game, windowTop, windowBottom)
  box(ctx, WORLD.wall, 0, 0, game.width, windowTop)
  box(ctx, WORLD.wall, 0, windowBottom, game.width, wainscotTop - windowBottom)

  eachCell(game, LAYOUT.wallParallax, LAYOUT.windowCell, (index, left) => {
    // Each cell is a pillar and then a window.
    const glass = left + pillar
    box(ctx, WORLD.wall, left, windowTop, pillar, tall)
    box(ctx, WORLD.wallShade, left + pillar - 1, windowTop, 1, tall)

    box(ctx, WORLD.windowFrame, glass, windowTop, LAYOUT.windowWidth, 2)
    box(ctx, WORLD.windowFrame, glass, windowTop, 2, tall)
    box(ctx, WORLD.windowFrame, glass + LAYOUT.windowWidth - 2, windowTop, 2, tall)
    box(ctx, WORLD.windowFrame, glass + Math.floor(LAYOUT.windowWidth / 2) - 1, windowTop, 2, tall)
    box(ctx, WORLD.windowFrame, glass, windowTop + Math.round(tall * 0.38), LAYOUT.windowWidth, 1)
    box(ctx, WORLD.windowSill, glass - 2, windowBottom - 2, LAYOUT.windowWidth + 4, 3)

    const middle = left + Math.floor(pillar / 2)
    const project = office.plaqueAt(index)
    if (project) {
      office.drawPlaque(ctx, project, middle, windowTop + LAYOUT.plaqueDrop)
      return
    }
    const what = hash(index, 3) % 4
    if (what === 0) drawPicture(ctx, middle, windowTop + 16)
    else if (what === 1) drawClock(ctx, middle, windowTop + 14)
    else if (what === 2) drawLamp(ctx, middle)
  })

  box(ctx, WORLD.wainscot, 0, wainscotTop, game.width, floor - wainscotTop)
  box(ctx, WORLD.rail, 0, wainscotTop, game.width, 1)
  eachCell(game, LAYOUT.wallParallax, LAYOUT.wainscotPanel, (_index, left) => {
    box(ctx, WORLD.wainscotLine, left, wainscotTop + 3, 1, floor - wainscotTop - 6)
  })
  box(ctx, WORLD.baseboard, 0, floor - LAYOUT.baseboardHeight, game.width, LAYOUT.baseboardHeight)

  box(ctx, WORLD.ceiling, 0, 0, game.width, LAYOUT.ceilingHeight)
  box(ctx, WORLD.ceilingEdge, 0, LAYOUT.ceilingHeight - 1, game.width, 1)
}

function drawPlant(ctx: Paint, x: number, floor: number): void {
  box(ctx, WORLD.leafDark, x + 3, floor - 10, 4, 4)
  box(ctx, WORLD.leaf, x + 1, floor - 15, 8, 6)
  box(ctx, WORLD.leaf, x + 2, floor - 18, 6, 3)
  box(ctx, WORLD.leafLight, x + 3, floor - 17, 2, 2)
  box(ctx, WORLD.leafLight, x + 6, floor - 13, 2, 2)
  box(ctx, WORLD.leafDark, x + 1, floor - 11, 2, 2)
  box(ctx, WORLD.potRim, x + 1, floor - 6, 8, 1)
  box(ctx, WORLD.pot, x + 2, floor - 5, 6, 5)
}

function drawCabinet(ctx: Paint, x: number, floor: number): void {
  box(ctx, WORLD.box, x + 3, floor - 21, 6, 3)
  box(ctx, WORLD.cabinet, x, floor - 18, 13, 18)
  for (const drawer of [12, 6]) {
    box(ctx, WORLD.cabinetLine, x, floor - drawer, 13, 1)
  }
  for (const handle of [15, 9, 3]) {
    box(ctx, WORLD.cabinetHandle, x + 5, floor - handle, 3, 1)
  }
}

/** Furniture along the wall, behind the play field: a desk for the person's agents in every
 *  other place, and the room's plants and cabinets between them. */
function drawFurniture(ctx: Paint, game: Game, office: Office): void {
  const floor = floorY(game)
  eachCell(game, LAYOUT.propParallax, LAYOUT.propCell, (index, left) => {
    const h = hash(index, 41)
    if (index % 2 === 0) {
      const room = LAYOUT.propCell - DESK.width - 2
      office.drawDesk(ctx, index / 2, left + ((h >>> 4) % room), floor)
      return
    }
    const x = left + ((h >>> 4) % 22)
    const what = h % 3
    if (what === 0) drawPlant(ctx, x, floor)
    else if (what === 1) drawCabinet(ctx, x, floor)
  })
}

/** One bookshelf, from `top` to `bottom`, with its trim on the side that faces the gap. */
function drawShelf(
  ctx: Paint,
  gate: Gate,
  left: number,
  top: number,
  bottom: number,
  trimAtBottom: boolean
): void {
  const wood = SHELF_WOODS[gate.variant % SHELF_WOODS.length]
  if (bottom <= top || !wood) return
  const width = RULES.gateWidth
  box(ctx, wood.frame, left, top, width, bottom - top)
  box(ctx, wood.edge, left, top, 1, bottom - top)
  box(ctx, WORLD.shelfBack, left + 2, top, width - 4, bottom - top)

  // Shelves are counted from the trim, so a book never floats at the gap.
  const anchor = trimAtBottom ? bottom - LAYOUT.trimHeight : bottom
  const inner = left + width - 3
  for (let row = 0; anchor - row * LAYOUT.shelfRow > top; row += 1) {
    const boardY = anchor - row * LAYOUT.shelfRow - 1
    box(ctx, wood.board, left + 2, boardY, width - 4, 1)
    let x = left + 3
    for (let n = 0; x < inner; n += 1) {
      const h = hash(gate.id * 97 + row * 13 + (trimAtBottom ? 500 : 0), n)
      const wide = Math.min(2 + (h % 2), inner - x)
      const empty = h % 9 === 0
      if (!empty) {
        const bookTop = Math.max(top, boardY - 6 - ((h >>> 3) % 4))
        const color = WORLD.books[(h >>> 6) % WORLD.books.length] ?? WORLD.bookBand
        box(ctx, color, x, bookTop, wide, boardY - bookTop)
        if (h % 4 === 0 && boardY - bookTop > 4) box(ctx, WORLD.bookBand, x, bookTop + 2, wide, 1)
      }
      x += wide + ((h >>> 10) % 5 === 0 ? 1 : 0)
    }
  }

  const trimTop = trimAtBottom ? bottom - LAYOUT.trimHeight : top
  const trimLeft = left - LAYOUT.trimOverhang
  const trimWidth = width + LAYOUT.trimOverhang * 2
  box(ctx, wood.trim, trimLeft, trimTop, trimWidth, LAYOUT.trimHeight)
  box(ctx, wood.frame, trimLeft, trimAtBottom ? bottom - 1 : top, trimWidth, 1)
}

function drawGate(ctx: Paint, game: Game, gate: Gate): void {
  const left = Math.round(gate.x)
  drawShelf(ctx, gate, left, 0, Math.round(gate.gapY - gate.gap / 2), true)
  drawShelf(ctx, gate, left, Math.round(gate.gapY + gate.gap / 2), floorY(game), false)
}

/** A coin that turns: its width follows the time. */
function drawToken(ctx: Paint, x: number, y: number, time: number): void {
  const halfWidths = [3, 2, 0, 2]
  const half = halfWidths[Math.floor(time * 8) % halfWidths.length] ?? 3
  drawCoin(ctx, x, y, half, { face: WORLD.token, light: WORLD.tokenLight, edge: WORLD.tokenEdge })
}

/** What a boost says, on the tile to catch and on its sign while it runs. */
const BOOST_TEXT = `X${RULES.boostTimes}`

/** A boost to catch: a gold tile with what it does written on it. */
function drawBoost(ctx: Paint, x: number, y: number, time: number): void {
  const cx = Math.round(x)
  const cy = Math.round(y + Math.sin(time * LAYOUT.boostBobSpeed) * LAYOUT.boostBob)
  const halfWidth = LAYOUT.boostHalfWidth
  const halfHeight = LAYOUT.boostHalfHeight
  const lit = Math.floor(time / LAYOUT.boostBlinkSeconds) % 2 === 0
  // The edge, with its corners cut; then the face.
  box(ctx, WORLD.tokenEdge, cx - halfWidth + 1, cy - halfHeight, halfWidth * 2 - 1, halfHeight * 2 + 1)
  box(ctx, WORLD.tokenEdge, cx - halfWidth, cy - halfHeight + 1, halfWidth * 2 + 1, halfHeight * 2 - 1)
  box(
    ctx,
    lit ? WORLD.tokenLight : WORLD.token,
    cx - halfWidth + 1,
    cy - halfHeight + 1,
    halfWidth * 2 - 1,
    halfHeight * 2 - 1
  )
  drawText(
    ctx,
    BOOST_TEXT,
    cx - Math.floor(textWidth(BOOST_TEXT, 1) / 2),
    cy - Math.floor(GLYPH_HEIGHT / 2),
    1,
    WORLD.scoreShadow
  )
}

/** A boost running: its sign and the time it has left, under the score. It blinks as it ends. */
function drawBoostLeft(ctx: Paint, game: Game): void {
  if (game.boostLeft <= 0) return
  const ending = game.boostLeft < LAYOUT.boostEndingSeconds
  if (ending && Math.floor(game.boostLeft / LAYOUT.boostEndingBlink) % 2 === 0) return
  const textW = textWidth(BOOST_TEXT, 1)
  const left = Math.floor((game.width - textW - LAYOUT.boostBarGap - LAYOUT.boostBarWidth) / 2)
  const top = LAYOUT.boostTop
  drawOutlinedText(ctx, BOOST_TEXT, left, top, 1, WORLD.token, WORLD.scoreShadow)
  const barLeft = left + textW + LAYOUT.boostBarGap
  const full = Math.ceil((LAYOUT.boostBarWidth * game.boostLeft) / RULES.boostSeconds)
  box(ctx, WORLD.scoreShadow, barLeft - 1, top, LAYOUT.boostBarWidth + 2, GLYPH_HEIGHT)
  box(ctx, WORLD.token, barLeft, top + 1, full, GLYPH_HEIGHT - 2)
}

function drawFloor(ctx: Paint, game: Game): void {
  const top = floorY(game)
  box(ctx, WORLD.floor, 0, top, game.width, RULES.floorHeight)
  box(ctx, WORLD.floorEdge, 0, top, game.width, 1)
  for (let row = 0; row * LAYOUT.plankHeight < RULES.floorHeight; row += 1) {
    const y = top + row * LAYOUT.plankHeight
    if (row > 0) box(ctx, WORLD.floorSeam, 0, y, game.width, 1)
    const stagger = (row % 2) * (LAYOUT.plankLength / 2)
    const first = Math.floor(game.scroll / LAYOUT.plankLength) - 1
    const cells = Math.ceil(game.width / LAYOUT.plankLength) + 2
    for (let c = first; c <= first + cells; c += 1) {
      const x = Math.round(c * LAYOUT.plankLength + stagger - game.scroll)
      box(ctx, WORLD.floorSeam, x, y + 1, 1, LAYOUT.plankHeight - 1)
    }
  }
}

function agentPose(game: Game): Pose {
  if (game.phase === 'dead') return 'out'
  return game.agent.vy < LAYOUT.risingVelocity ? 'rising' : 'falling'
}

function drawAgent(ctx: Paint, game: Game, look: Look, flameAge: number): void {
  const { skin, accessory } = look
  const left = Math.round(game.agent.x - AGENT_WIDTH / 2)
  // The crest takes the top rows; the hit box is centred on the body below it.
  const top = Math.round(game.agent.y - (CREST_ROWS + AGENT_HEIGHT) / 2)
  drawRows(ctx, agentRows(skin, agentPose(game), accessory), left, top, (cell) =>
    cellColor(skin, cell, accessory)
  )
  if (game.phase === 'playing' && flameAge < LAYOUT.flameSeconds) {
    const frame = FLAME_FRAMES[flameAge < LAYOUT.flameSeconds / 2 ? 0 : 1] ?? []
    drawRows(ctx, frame, left, top + AGENT_HEIGHT, (cell) =>
      cell === 'f' ? FLAME_COLORS.f : cell === 'g' ? FLAME_COLORS.g : null
    )
  }
}

/** A small crown, drawn over the score of a run that beat the best. */
const CROWN: readonly string[] = ['y.y.y.y', 'yyyyyyy', 'yyyyyyy']

function drawScore(ctx: Paint, game: Game, record: boolean): void {
  if (game.phase === 'ready') return
  const text = String(game.score)
  const scale = LAYOUT.scoreScale
  const left = Math.floor((game.width - textWidth(text, scale)) / 2)
  const color = record ? WORLD.token : WORLD.score
  drawOutlinedText(ctx, text, left, LAYOUT.scoreTop, scale, color, WORLD.scoreShadow)
  if (!record) return
  const crownLeft = Math.floor((game.width - (CROWN[0]?.length ?? 0)) / 2)
  drawRows(ctx, CROWN, crownLeft, LAYOUT.scoreTop - CROWN.length - 2, (cell) =>
    cell === 'y' ? WORLD.token : null
  )
}

export function render(
  ctx: Paint,
  game: Game,
  look: Look,
  effects: Effects,
  office: Office
): void {
  const shake = effects.offset()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  box(ctx, WORLD.wall, 0, 0, game.width, game.height)
  ctx.translate(shake.x, shake.y)

  drawWall(ctx, game, office)
  drawFurniture(ctx, game, office)
  for (const gate of game.gates) drawGate(ctx, game, gate)
  for (const token of game.tokens) {
    if (token.boost) drawBoost(ctx, token.x, token.y, game.time)
    else if (token.prize === undefined) drawToken(ctx, token.x, token.y, game.time)
    else office.drawDelivery(ctx, token.prize, token.x, token.y)
  }
  drawFloor(ctx, game)
  effects.draw(ctx)
  drawAgent(ctx, game, look, effects.flameAge)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  drawScore(ctx, game, effects.record)
  drawBoostLeft(ctx, game)
  effects.drawFlash(ctx, game.width, game.height)
}
