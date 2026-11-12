// The arcade's panel: what every game shares. It owns the input, the frame loop and the pause,
// the card between runs, the coins and what they buy, each game's best score, the settings, and
// what it tells the person about their agents. The game being played does the rest (src/games).
import type { AgentNote, OfficeChange, OfficeView } from './agents/ledger'
import {
  ARCADE_NAME,
  type GameDefinition,
  type GameHost,
  type GameSession,
  type GameTexts,
  type Look
} from './core/game'
import { GamesMenu } from './core/games-view'
import { Icons } from './core/icons'
import { Notice } from './core/notice-view'
import { Office } from './core/office'
import { Options } from './core/options-view'
import { PIXEL_ICONS, pixelIcon } from './core/pixel-icons'
import { SOUNDS, Sound } from './core/sound'
import { ACCESSORIES, SKINS, skinForAgent, type AccessoryId, type SkinId } from './core/sprites'
import { STORE, bestKey } from './core/store'
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_NAMES,
  fill,
  isLanguage,
  newsText,
  stringsFor,
  type Language,
  type Strings
} from './core/strings'
import {
  COINS_PER_DELIVERY,
  COINS_PER_TOKEN,
  PRICES,
  isAccessoryId,
  isSkinId,
  parseBought,
  walletOf,
  type ItemId
} from './core/wardrobe'
import { Wardrobe, paintLook, sizePreview, type SkinChoice } from './core/wardrobe-view'
import { GAMES } from './games/index'

const VIEW = {
  /** The panel's height is cut into at least this many logical pixels, each a whole number of
   *  screen pixels, so the pixel art stays crisp at any panel size. */
  targetHeight: 240,
  maxFrameSeconds: 0.05,
  /** After a run ends, presses are ignored this long so a late press does not start a new one. */
  retryLockMs: 400,
  /** A "finished" notice goes away on its own; one that needs the person stays. */
  doneNoticeMs: 8000,
  /** While the run is still, the agents at the desks move this often and no more. */
  idleFrameMs: 250,
  /** How many screen pixels each pixel of a button's drawing takes. */
  iconScale: 2
} as const
const PLAY_KEYS: readonly string[] = ['Space', 'ArrowUp', 'KeyW', 'Enter']
const PAUSE_KEYS: readonly string[] = ['KeyP', 'Escape']
const SOUND_KEYS: readonly string[] = ['KeyM']

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`panel.html has no #${id}`)
  return node as T
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This Orca cannot draw on a 2D canvas')
  return context
}

/** The language of the panel: English until the person chooses another in the options. */
let language: Language = DEFAULT_LANGUAGE
/** The texts in that language. One object for the whole panel, filled again when the language
 *  changes, so every view that holds it follows. */
const strings: Strings = stringsFor(language)
const stage = element<HTMLDivElement>('stage')
const canvas = element<HTMLCanvasElement>('game')
const ctx = context2d(canvas)
const card = element<HTMLDivElement>('card')
const cardBrand = element<HTMLParagraphElement>('card-brand')
const cardTitle = element<HTMLParagraphElement>('card-title')
const cardNote = element<HTMLParagraphElement>('card-note')
const cardSub = element<HTMLParagraphElement>('card-sub')
const cardNews = element<HTMLParagraphElement>('card-news')
const cardHint = element<HTMLParagraphElement>('card-hint')
const wardrobeButton = element<HTMLButtonElement>('wardrobe-open')
const wardrobePreview = element<HTMLCanvasElement>('wardrobe-preview')
const wardrobeWallet = element<HTMLSpanElement>('wardrobe-wallet')
const wardrobeBox = element<HTMLDivElement>('wardrobe')
const wardrobeClose = element<HTMLButtonElement>('wardrobe-close')
const soundButton = element<HTMLButtonElement>('sound')
const optionsButton = element<HTMLButtonElement>('options-open')
const optionsBox = element<HTMLDivElement>('options')
const optionsClose = element<HTMLButtonElement>('options-close')
const gamesButton = element<HTMLButtonElement>('games-open')
const gamesBox = element<HTMLDivElement>('games')
const gamesClose = element<HTMLButtonElement>('games-close')
const noticeGo = element<HTMLButtonElement>('notice-go')
const noticeClose = element<HTMLButtonElement>('notice-close')

const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const office = new Office(calm)
const sound = new Sound()
const icons = new Icons(() => draw())
office.iconOf = (name) => icons.get(name)
const notice = new Notice({
  root: element('notice'),
  face: element<HTMLCanvasElement>('notice-face'),
  text: element('notice-text'),
  extra: element('notice-extra'),
  go: noticeGo
})

/** Coins earned playing, in every game, ever. */
let earned = 0
let bought: ItemId[] = []
let choice: SkinChoice = 'auto'
let autoSkin: SkinId = 'blip'
let accessory: AccessoryId | null = null
/** Whether the game stops when an agent needs the person, and when one finishes. */
let pauseOnNeed = true
let pauseOnDone = false

/** The best score of the game being played, and what this run did to it. */
let best = 0
let bestBefore = 0
let beaten = false
let newBest = false

let news = ''
/** Whether what the person saved has been read: the card waits for it, so it never shows in a
 *  language and then changes. */
let loaded = false
let paused = false
let running = false
let lastFrame = 0
let endedAt = 0
let idleTimer = 0

/** Which character plays, and what it wears. */
function wearing(): { skin: SkinId; accessory: AccessoryId | null } {
  return { skin: choice === 'auto' ? autoSkin : choice, accessory }
}

function look(): Look {
  const worn = wearing()
  return {
    skin: SKINS[worn.skin],
    accessory: worn.accessory ? ACCESSORIES[worn.accessory] : null
  }
}

function coins(): number {
  return walletOf(earned, bought)
}

function save(key: string, value: string | number | boolean | string[] | null): void {
  orca.storage.set(key, value).catch((error: unknown) => {
    console.warn(`${ARCADE_NAME} could not save "${key}"`, error)
  })
}

function pay(worth: number, at: { x: number; y: number }): void {
  earned += worth
  save(STORE.coins, earned)
  office.setCoins(coins())
  office.fly(worth, at)
}

const host: GameHost = {
  calm,
  office,
  look,
  play: (notes) => sound.play(notes),
  coin: (at, times = 1) => pay(COINS_PER_TOKEN * times, at),
  delivery(at) {
    sound.play(SOUNDS.agentDone)
    pay(COINS_PER_DELIVERY, at)
  }
}

/** The game being played. With one game there is nothing to choose; the arcade is made so the
 *  next one only has to be added to src/games. */
const definition: GameDefinition = GAMES[0]
let texts: GameTexts = definition.texts[language]
const session: GameSession = definition.create(host)

function draw(): void {
  session.draw(ctx)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  office.drawHud(ctx)
}

function fit(): void {
  const box = stage.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  const deviceWidth = Math.max(1, Math.round(box.width * ratio))
  const deviceHeight = Math.max(1, Math.round(box.height * ratio))
  const scale = Math.max(1, Math.floor(deviceHeight / VIEW.targetHeight))
  const width = Math.ceil(deviceWidth / scale)
  const height = Math.ceil(deviceHeight / scale)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  canvas.style.width = `${(width * scale) / ratio}px`
  canvas.style.height = `${(height * scale) / ratio}px`
  ctx.imageSmoothingEnabled = false
  session.resize(width, height)
  draw()
}

/** Puts a button's drawing and what it says. */
function showButton(
  button: HTMLButtonElement,
  drawing: readonly string[],
  label: string,
  says: string
): void {
  button.querySelector('.glyph')?.replaceChildren(pixelIcon(drawing, VIEW.iconScale))
  const text = button.querySelector('.label')
  if (text) text.textContent = label
  button.setAttribute('aria-label', says)
}

function showCard(): void {
  const playing = session.phase === 'playing' && !paused
  card.hidden = playing || !loaded
  if (card.hidden) return
  const over = session.phase === 'over'
  const record = over && newBest
  const bestLine = `${strings.best} ${best}`
  card.classList.toggle('record', record)
  cardTitle.textContent = paused
    ? strings.paused
    : record
      ? String(best)
      : over
        ? bestLine
        : definition.name
  cardNote.textContent = strings.newBest
  cardNote.hidden = !record
  cardBrand.textContent = ARCADE_NAME
  cardBrand.hidden = record || paused
  cardSub.textContent = record ? fill(strings.was, { best: bestBefore }) : bestLine
  cardSub.hidden = record ? bestBefore === 0 : !(session.phase === 'ready' && best > 0)
  cardNews.textContent = news
  cardNews.hidden = news === ''
  cardHint.textContent = paused ? strings.resume : over ? strings.retry : texts.start
  const worn = wearing()
  paintLook(wardrobePreview, worn.skin, worn.accessory)
  wardrobeWallet.textContent = String(coins())
  showButton(
    soundButton,
    sound.enabled ? PIXEL_ICONS.soundOn : PIXEL_ICONS.soundOff,
    strings.sound,
    sound.enabled ? strings.soundOn : strings.soundOff
  )
  soundButton.setAttribute('aria-pressed', String(sound.enabled))
}

/** Whether the game itself still moves: not paused, and not a finished run come to rest. */
function gameMoves(): boolean {
  return !paused && !session.atRest
}

function shouldRun(): boolean {
  return document.visibilityState === 'visible' && (gameMoves() || office.busy)
}

/** What the last press or the last frame did to the run: passed the best score, or ended. */
function follow(before: GameSession['phase']): void {
  if (session.phase === 'playing' && best > 0 && session.score > best && !beaten) {
    beaten = true
    session.celebrate('beaten')
    sound.play(SOUNDS.best)
  }
  if (before === 'over' || session.phase !== 'over') return
  endedAt = performance.now()
  if (session.score > best) {
    bestBefore = best
    best = session.score
    newBest = true
    save(bestKey(definition.id), best)
    session.celebrate('record')
    sound.play(SOUNDS.fanfare)
  }
  showCard()
}

function frame(now: number): void {
  const dt = Math.min(VIEW.maxFrameSeconds, Math.max(0, (now - lastFrame) / 1000))
  lastFrame = now
  if (gameMoves()) {
    const before = session.phase
    session.advance(dt)
    follow(before)
  }
  // The coins keep flying to the counter while the run is paused.
  office.update(dt)
  draw()
  if (shouldRun()) {
    requestAnimationFrame(frame)
    return
  }
  running = false
  rest()
}

function idle(): void {
  idleTimer = 0
  if (running) return
  office.update(VIEW.idleFrameMs / 1000)
  draw()
  rest()
}

/** While nothing else moves, the agents at the desks still do: a few frames a second. */
function rest(): void {
  if (idleTimer !== 0 || running) return
  if (document.visibilityState !== 'visible' || !office.lively) return
  idleTimer = window.setTimeout(idle, VIEW.idleFrameMs)
}

/** Starts the frame loop unless it already runs. It stops by itself when nothing moves. */
function run(): void {
  if (running) return
  if (!shouldRun()) {
    rest()
    return
  }
  running = true
  lastFrame = performance.now()
  requestAnimationFrame(frame)
}

function setPaused(value: boolean): void {
  if (session.phase !== 'playing' || paused === value) return
  paused = value
  showCard()
  if (paused) draw()
  else run()
}

async function refreshAutoSkin(): Promise<void> {
  try {
    const { agents } = await orca.host.call('agents.list', {})
    const agent = agents.find((entry) => entry.state === 'working') ?? agents[0]
    const next = skinForAgent(agent?.agent)
    if (next === autoSkin) return
    autoSkin = next
    wardrobe.refresh()
    if (!card.hidden) showCard()
    draw()
  } catch {
    // No agent list (an older Orca, or no workspace in focus): keep the skin there is.
  }
}

/** The one action every game has: play, start, try again or go on after a pause. */
function act(): void {
  if (sheetOpen()) return
  sound.unlock()
  news = ''
  if (paused) {
    setPaused(false)
    return
  }
  if (session.phase === 'over') {
    if (performance.now() - endedAt < VIEW.retryLockMs) return
    session.restart()
    newBest = false
    beaten = false
    bestBefore = 0
    void refreshAutoSkin()
  }
  const before = session.phase
  session.press()
  follow(before)
  showCard()
  run()
}

const wardrobe = new Wardrobe(
  wardrobeBox,
  element<HTMLSpanElement>('wardrobe-count'),
  element<HTMLDivElement>('characters'),
  element<HTMLDivElement>('accessories'),
  strings,
  {
    state: () => ({ choice, autoSkin, accessory, bought, coins: coins() }),
    chooseSkin(next) {
      choice = next
      save(STORE.skin, choice)
      showCard()
      draw()
    },
    chooseAccessory(next) {
      accessory = next
      save(STORE.accessory, accessory)
      showCard()
      draw()
    },
    buy(id) {
      if (coins() < PRICES[id]) return
      bought = [...bought, id]
      save(STORE.bought, bought)
      office.setCoins(coins())
      showCard()
      sound.unlock()
      sound.play(SOUNDS.buy)
    }
  }
)

function setSound(on: boolean): void {
  sound.enabled = on
  save(STORE.sound, on)
  sound.unlock()
  sound.play(SOUNDS.tick)
  showCard()
}

const options = new Options(optionsBox, element('options-list'), strings, [
  {
    label: () => strings.optionLanguage,
    value: () => LANGUAGE_NAMES[language],
    next() {
      const following = LANGUAGES[(LANGUAGES.indexOf(language) + 1) % LANGUAGES.length]
      setLanguage(following ?? DEFAULT_LANGUAGE)
      save(STORE.language, language)
    }
  },
  { label: () => strings.optionSound, get: () => sound.enabled, set: setSound },
  {
    label: () => strings.optionNames,
    hint: () => strings.optionNamesHint,
    get: () => !office.hideNames,
    set(shown) {
      office.hideNames = !shown
      save(STORE.hideNames, office.hideNames)
      draw()
    }
  },
  {
    label: () => strings.optionPauseNeed,
    get: () => pauseOnNeed,
    set(on) {
      pauseOnNeed = on
      save(STORE.pauseOnNeed, on)
    }
  },
  {
    label: () => strings.optionPauseDone,
    get: () => pauseOnDone,
    set(on) {
      pauseOnDone = on
      save(STORE.pauseOnDone, on)
    }
  }
])

const games = new GamesMenu(gamesBox, element('games-list'), strings, GAMES, {
  current: () => definition.id,
  worn: wearing,
  // With one game, choosing it is going back to it.
  choose: () => closeSheets()
})

function sheetOpen(): boolean {
  return wardrobe.open || options.open || games.open
}

/** Writes everything the panel says once, in the language of the moment. */
function applyTexts(): void {
  document.documentElement.lang = language
  canvas.setAttribute('aria-label', texts.label)
  element('wardrobe-label').textContent = strings.characters
  element('wardrobe-title').textContent = strings.characters
  element('accessories-title').textContent = strings.accessories
  element('wardrobe-how').textContent = fill(strings.howToEarn, {
    delivery: COINS_PER_DELIVERY,
    token: COINS_PER_TOKEN
  })
  wardrobeClose.textContent = strings.dismiss
  element('options-title').textContent = strings.options
  optionsClose.textContent = strings.dismiss
  showButton(optionsButton, PIXEL_ICONS.options, strings.options, strings.options)
  element('games-title').textContent = strings.gamesTitle
  element('games-soon').textContent = strings.soonHint
  gamesClose.textContent = strings.dismiss
  showButton(gamesButton, PIXEL_ICONS.games, strings.games, strings.games)
  noticeGo.textContent = strings.goToAgent
  noticeClose.textContent = strings.dismiss
  wardrobe.refresh()
  options.refresh()
  games.refresh()
  showCard()
}

function setLanguage(next: Language): void {
  language = next
  Object.assign(strings, stringsFor(language))
  texts = definition.texts[language]
  applyTexts()
}

function markSeen(): void {
  orca.plugin.request('office.seen').catch((error: unknown) => {
    console.warn(`${ARCADE_NAME} could not mark the finished tasks as seen`, error)
  })
}

/** Tells the person about one agent that changed state. */
function onNote(note: AgentNote): void {
  const visible = document.visibilityState === 'visible'
  // The floating window is not a project: saying where the agent is gives nothing away.
  const name = note.floating ? strings.floating : office.hideNames ? null : note.project
  if (note.state === 'working') {
    notice.hideFor(note.paneKey)
    return
  }
  if (note.state === 'done') {
    notice.hideFor(note.paneKey)
    // A task finished out of sight stays for the summary the person gets when they come back.
    if (!note.finished || !visible) return
    // In the middle of a run, the agent sends its project in: catching it pays.
    const sent = !paused && session.deliver(note.project ?? '')
    const text = name ? fill(strings.finishedIn, { name }) : strings.finished
    notice.show(note, text, sent ? strings.catchIt : '', false, VIEW.doneNoticeMs)
    sound.play(SOUNDS.agentDone)
    if (pauseOnDone) setPaused(true)
    markSeen()
    return
  }
  const waiting = note.state === 'waiting'
  const text = name
    ? fill(waiting ? strings.waitingIn : strings.blockedIn, { name })
    : waiting
      ? strings.waiting
      : strings.blocked
  notice.show(note, text, '', true, null)
  if (visible) sound.play(SOUNDS.agentNeeds)
  if (pauseOnNeed) setPaused(true)
}

function applyView(view: OfficeView): void {
  office.setCrew(view.crew)
  office.setProjects(view.projects)
  // The projects on the wall, and the ones on the desks of the agents.
  const shown = new Set(view.projects.map((project) => project.name))
  for (const member of view.crew) if (member.project) shown.add(member.project)
  icons.want([...shown])
  office.setCoins(coins())
  wardrobe.refresh()
  if (!card.hidden) showCard()
}

function onOfficeChange(change: OfficeChange): void {
  applyView(change.view)
  draw()
  if (change.note) onNote(change.note)
  run()
}

/** Reads what the worker knows, and tells the person what their agents finished meanwhile. */
async function readOffice(): Promise<void> {
  try {
    const view = await orca.plugin.request('office.read')
    applyView(view)
    draw()
    run()
    if (view.unseen.length === 0 || document.visibilityState !== 'visible') return
    news = newsText(strings, view.unseen, !office.hideNames)
    sound.play(SOUNDS.agentDone)
    showCard()
    markSeen()
  } catch (error) {
    // Without the worker the games still play; they only know nothing about the agents.
    console.warn(`${ARCADE_NAME} could not read the office`, error)
  }
}

async function goToAgent(): Promise<void> {
  const workspaceId = notice.workspaceId
  if (!workspaceId) return
  noticeGo.disabled = true
  try {
    const { opened } = await orca.plugin.request('agent.open', { workspaceId })
    if (opened) notice.hide()
    else notice.fail(strings.openFailed)
  } catch (error) {
    console.warn(`${ARCADE_NAME} could not open the workspace`, error)
    notice.fail(strings.openFailed)
  } finally {
    noticeGo.disabled = false
  }
}

async function loadStored(): Promise<void> {
  try {
    const [
      storedBest,
      storedCoins,
      storedBought,
      storedSkin,
      storedAccessory,
      storedSound,
      hidden,
      onNeed,
      onDone,
      storedLanguage
    ] = await Promise.all([
      orca.storage.get(bestKey(definition.id)),
      orca.storage.get(STORE.coins),
      orca.storage.get(STORE.bought),
      orca.storage.get(STORE.skin),
      orca.storage.get(STORE.accessory),
      orca.storage.get(STORE.sound),
      orca.storage.get(STORE.hideNames),
      orca.storage.get(STORE.pauseOnNeed),
      orca.storage.get(STORE.pauseOnDone),
      orca.storage.get(STORE.language)
    ])
    if (typeof storedBest === 'number' && storedBest > 0) best = Math.floor(storedBest)
    if (typeof storedCoins === 'number' && storedCoins > 0) earned = Math.floor(storedCoins)
    bought = parseBought(storedBought)
    if (storedSkin === 'auto' || isSkinId(storedSkin)) choice = storedSkin
    if (isAccessoryId(storedAccessory)) accessory = storedAccessory
    if (typeof storedSound === 'boolean') sound.enabled = storedSound
    if (typeof hidden === 'boolean') office.hideNames = hidden
    if (typeof onNeed === 'boolean') pauseOnNeed = onNeed
    if (typeof onDone === 'boolean') pauseOnDone = onDone
    if (isLanguage(storedLanguage)) language = storedLanguage
    await icons.load()
  } catch (error) {
    console.warn(`${ARCADE_NAME} could not read what it saved`, error)
  }
  loaded = true
  office.setCoins(coins())
  setLanguage(language)
  draw()
}

function closeSheets(): void {
  wardrobe.hide()
  options.hide()
  games.hide()
  showCard()
  stage.focus()
}

function insideButton(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button') !== null
}

sizePreview(wardrobePreview)
applyTexts()
office.onCoin = () => sound.play(SOUNDS.coin)

window.addEventListener('keydown', (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
  if (sheetOpen()) {
    if (event.code === 'Escape') {
      event.preventDefault()
      closeSheets()
    }
    return
  }
  if (insideButton(event.target)) return
  if (PLAY_KEYS.includes(event.code)) {
    event.preventDefault()
    act()
  } else if (PAUSE_KEYS.includes(event.code)) {
    event.preventDefault()
    setPaused(!paused)
  } else if (SOUND_KEYS.includes(event.code)) {
    event.preventDefault()
    setSound(!sound.enabled)
  }
})
stage.addEventListener('pointerdown', (event) => {
  const target = event.target as Node
  if (insideButton(target) || notice.contains(target)) return
  if (wardrobeBox.contains(target) || optionsBox.contains(target) || gamesBox.contains(target)) return
  stage.focus()
  act()
})
wardrobeButton.addEventListener('click', () => {
  sound.unlock()
  wardrobe.show()
  wardrobeClose.focus()
})
wardrobeClose.addEventListener('click', closeSheets)
optionsButton.addEventListener('click', () => {
  sound.unlock()
  options.show()
  optionsClose.focus()
})
optionsClose.addEventListener('click', closeSheets)
gamesButton.addEventListener('click', () => {
  sound.unlock()
  games.show()
  gamesClose.focus()
})
gamesClose.addEventListener('click', closeSheets)
soundButton.addEventListener('click', () => {
  setSound(!sound.enabled)
  stage.focus()
})
noticeGo.addEventListener('click', () => void goToAgent())
noticeClose.addEventListener('click', () => {
  notice.hide()
  stage.focus()
})
// Typing in a terminal or switching the sidebar must not cost a run.
window.addEventListener('blur', () => setPaused(true))
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    setPaused(true)
    return
  }
  run()
  void readOffice()
})
new ResizeObserver(fit).observe(stage)

try {
  orca.plugin.on('office.changed', onOfficeChange)
} catch (error) {
  console.warn(`${ARCADE_NAME} cannot hear its worker on this Orca`, error)
}

fit()
showCard()
stage.focus()
run()
void loadStored().then(readOffice)
void refreshAutoSkin()
