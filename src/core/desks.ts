// The office's desks, where the person's agents sit: typing while they work, with a sign up
// when they wait for the person, sweating when they are blocked, and asleep once they finish.
import type { AgentState } from '../agents/ledger'
import { box, drawRows, drawText, hash, type Paint } from './paint'
import { AGENT_HEIGHT, AGENT_WIDTH, agentRows, cellColor, type Pose, type Skin } from './sprites'

/** Where a desk's parts sit, from its left edge and up from the floor. */
export const DESK = {
  width: 34,
  /** The project's sticker, on the desk's front. */
  stickerLeft: 20,
  stickerUp: 9,
  stickerSize: 8,

  chairBackHeight: 11,
  seatUp: 7,
  seatWidth: 15,
  /** The chair's post and its foot, under the seat. */
  postLeft: 7,
  footLeft: 3,
  footWidth: 10,
  sitterLeft: 1,
  topLeft: 14,
  topUp: 12,
  topWidth: 20,
  legs: [15, 31],
  keysLeft: 16,
  keysWidth: 6,
  monitorLeft: 22,
  monitorUp: 22,
  monitorWidth: 11,
  monitorHeight: 8,
  standLeft: 27,
  signWidth: 7,
  signHeight: 9,
  signGap: 2
} as const

const LOOK = {
  chair: '#55638a',
  chairShade: '#3c4768',
  top: '#8a6040',
  leg: '#5f412b',
  keys: '#1c2238',
  monitor: '#1c2238',
  screenOff: '#2a3350',
  screen: '#8fd3e0',
  screenLine: '#3f7f95',
  ask: '#ffd166',
  askInk: '#1d2540',
  stuck: '#e35d5b',
  stuckInk: '#ffffff',
  rest: '#7fb069',
  sweat: '#a6e3f0',
  sleep: '#c9d2f5'
} as const

/** How fast each thing moves, in changes a second. */
const PACE = {
  typing: 7,
  code: 3,
  bob: 4,
  hopSeconds: 0.9,
  shake: 12,
  sweat: 5,
  breathSeconds: 2.4,
  sleep: 1.2,
  signBob: 3
} as const

/** The cross a blocked agent's screen shows, and the tick of one that finished. */
const CROSS: readonly string[] = ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x']
const TICK: readonly string[] = ['....x', '...x.', 'x.x..', '.x...']

export interface Sitter {
  skin: Skin
  state: AgentState
}

const POSES: Record<AgentState, Pose> = {
  working: 'falling',
  waiting: 'rising',
  blocked: 'rising',
  done: 'out'
}

function drawScreen(ctx: Paint, state: AgentState | null, left: number, top: number, clock: number): void {
  const width = DESK.monitorWidth - 2
  const height = DESK.monitorHeight - 2
  if (state === null) {
    box(ctx, LOOK.screenOff, left, top, width, height)
  } else if (state === 'working') {
    box(ctx, LOOK.screen, left, top, width, height)
    const page = Math.floor(clock * PACE.code)
    for (let line = 0; line < 3; line += 1) {
      box(ctx, LOOK.screenLine, left + 1, top + 1 + line * 2, 2 + (hash(page + line, 7) % 6), 1)
    }
  } else if (state === 'waiting') {
    box(ctx, LOOK.ask, left, top, width, height)
    for (const dot of [2, 4, 6]) box(ctx, LOOK.askInk, left + dot, top + 3, 1, 1)
  } else if (state === 'blocked') {
    box(ctx, LOOK.stuck, left, top, width, height)
    drawRows(ctx, CROSS, left + 2, top, (cell) => (cell === 'x' ? LOOK.stuckInk : null))
  } else {
    box(ctx, LOOK.screenOff, left, top, width, height)
    drawRows(ctx, TICK, left + 2, top + 1, (cell) => (cell === 'x' ? LOOK.rest : null))
  }
}

/** How far the one sitting is from where it rests, and what moves around it. */
function drawSitter(ctx: Paint, sitter: Sitter, x: number, floor: number, clock: number): void {
  const { skin, state } = sitter
  let dx = 0
  let dy = 0
  if (state === 'working') {
    dy = Math.floor(clock * PACE.bob) % 2
  } else if (state === 'waiting') {
    const hop = (clock % PACE.hopSeconds) / PACE.hopSeconds
    dy = hop < 0.15 ? -2 : hop < 0.3 ? -1 : 0
  } else if (state === 'blocked') {
    dx = (Math.floor(clock * PACE.shake) % 2) * 2 - 1
  } else {
    dy = clock % PACE.breathSeconds < PACE.breathSeconds / 2 ? 0 : 1
  }
  const left = x + DESK.sitterLeft + (clock > 0 ? dx : 0)
  const top = floor - DESK.seatUp - AGENT_HEIGHT + dy
  drawRows(ctx, agentRows(skin, POSES[state]), left, top, (cell) => cellColor(skin, cell))

  if (state === 'waiting') {
    const bob = Math.round(Math.sin(clock * PACE.signBob))
    const signLeft = x + DESK.sitterLeft + Math.floor((AGENT_WIDTH - DESK.signWidth) / 2)
    const signTop = top - DESK.signGap - DESK.signHeight + bob
    box(ctx, LOOK.ask, signLeft, signTop, DESK.signWidth, DESK.signHeight)
    box(ctx, LOOK.ask, signLeft + 3, signTop + DESK.signHeight, 1, 1)
    drawText(ctx, '!', signLeft + 2, signTop + 2, 1, LOOK.askInk)
  } else if (state === 'blocked') {
    const fall = Math.floor(clock * PACE.sweat) % 3
    box(ctx, LOOK.sweat, left - 1 - fall, top + 2 + fall, 1, 2)
    box(ctx, LOOK.sweat, left + AGENT_WIDTH + fall, top + 3 + fall, 1, 2)
  } else if (state === 'done') {
    const rise = Math.floor(clock * PACE.sleep) % 3
    drawText(ctx, 'Z', left + AGENT_WIDTH - 2 + rise * 2, top - 3 - rise * 3, 1, LOOK.sleep)
  }
}

/**
 * A desk with its chair and its monitor, and the agent that sits at it, if any. `x` is its left
 * edge, `floor` where it stands and `clock` the seconds that drive what moves (zero keeps it still).
 */
export function drawDesk(
  ctx: Paint,
  x: number,
  floor: number,
  sitter: Sitter | null,
  clock: number
): void {
  box(ctx, LOOK.chair, x, floor - DESK.seatUp - DESK.chairBackHeight + 1, 2, DESK.chairBackHeight)
  box(ctx, LOOK.chair, x, floor - DESK.seatUp, DESK.seatWidth, 2)
  box(ctx, LOOK.chairShade, x + DESK.postLeft, floor - DESK.seatUp + 2, 2, DESK.seatUp - 3)
  box(ctx, LOOK.chairShade, x + DESK.footLeft, floor - 1, DESK.footWidth, 1)
  if (sitter) drawSitter(ctx, sitter, x, floor, clock)

  for (const leg of DESK.legs) box(ctx, LOOK.leg, x + leg, floor - DESK.topUp + 2, 2, DESK.topUp - 2)
  box(ctx, LOOK.top, x + DESK.topLeft, floor - DESK.topUp, DESK.topWidth, 2)
  box(ctx, LOOK.keys, x + DESK.keysLeft, floor - DESK.topUp - 1, DESK.keysWidth, 1)
  if (sitter?.state === 'working') {
    // Two hands that take turns on the keys.
    const hand = Math.floor(clock * PACE.typing) % 2
    box(ctx, sitter.skin.palette.light, x + DESK.keysLeft + 1 + hand * 3, floor - DESK.topUp - 2, 1, 1)
  }
  box(ctx, LOOK.monitor, x + DESK.standLeft, floor - DESK.topUp - 2, 1, 2)
  box(
    ctx,
    LOOK.monitor,
    x + DESK.monitorLeft,
    floor - DESK.monitorUp,
    DESK.monitorWidth,
    DESK.monitorHeight
  )
  drawScreen(ctx, sitter?.state ?? null, x + DESK.monitorLeft + 1, floor - DESK.monitorUp + 1, clock)
}
