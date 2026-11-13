// The panel's texts, in the language the person chose in the options. English until they choose.
import type { ItemId } from './wardrobe'

const EN = {
  retry: 'Space or click to try again',
  resume: 'Space or click to go on',
  paused: 'Paused',
  best: 'Best',
  newBest: 'New best',
  was: 'Was {best}',

  characters: 'Characters',
  accessories: 'Accessories',
  auto: 'Auto',
  autoHint: 'Takes the colour of the agent you are running',
  none: 'None',
  buy: 'Buy?',
  short: '{coins} to go',
  howToEarn:
    'Coins are earned playing: each one you catch is worth {token}. If an agent finishes while you play, it sends you its project: catch it for {delivery}.',
  sound: 'Sound',
  soundOn: 'Sound: on',
  soundOff: 'Sound: off',
  options: 'Options',
  optionSound: 'Sound',
  optionNames: 'Project names',
  optionNamesHint: 'Off hides the icons and the names of your projects, for when you share your screen',
  optionPauseNeed: 'Pause when an agent needs you',
  optionPauseDone: 'Pause when an agent finishes',
  optionLanguage: 'Language (Idioma)',
  on: 'On',
  off: 'Off',

  games: 'More games',
  gamesTitle: 'Games',
  playing: 'Playing',
  soon: 'Soon',
  soonHint: 'More games are on the way. They arrive with the updates of the plugin.',

  waitingIn: 'An agent in {name} is waiting for you',
  waiting: 'An agent is waiting for you',
  blockedIn: 'An agent in {name} is blocked',
  blocked: 'An agent is blocked',
  finishedIn: 'An agent in {name} finished',
  finished: 'An agent finished',
  floating: 'the floating window',
  catchIt: 'It sent you its project: catch it!',
  awayOne: 'While you were away, your agents finished 1 task',
  awayMany: 'While you were away, your agents finished {count} tasks',
  goToAgent: 'Go to agent',
  dismiss: 'Close',
  openFailed: 'Orca could not open that workspace',

  ranking: 'Ranking',
  rankingTitle: 'World ranking',
  rankingWeek: 'This week',
  rankingAll: 'All time',
  rankingEnds: 'New week in {time}',
  rankingEmpty: 'No scores yet: the first run that counts takes first place.',
  rankingYou: 'You: #{rank} with {score}',
  rankingPlayingAs: 'You play as {name}',
  rankingRename: 'Change name',
  rankingLeave: 'Leave',
  rankingLeaveSure: 'Sure? Press again',
  rankingLeft: 'You left the ranking and your scores were deleted.',
  rankingPitch: 'Pick a nickname to put your runs on the world ranking.',
  rankingPlaceholder: 'Nickname',
  rankingJoin: 'Join',
  rankingSave: 'Save',
  rankingPrivacy:
    'Only your nickname and your runs are sent, and each run is played again on the server before it counts. Your projects and agents never leave your computer. Leaving deletes it all.',
  rankingBadName: 'Use 2 to 16 letters or numbers.',
  rankingSoon: 'Wait a few seconds and try again.',
  rankingOffline: 'The ranking cannot be reached right now.',
  rankingLoading: 'Loading…',
  rankingFromNow: 'You are in. Your runs count from now on.',
  rankingCardWeek: '#{rank} of the week',
  rankingCardAll: '#{rank} of all time'
}

const ES: typeof EN = {
  retry: 'Espacio o clic para reintentar',
  resume: 'Espacio o clic para seguir',
  paused: 'En pausa',
  best: 'Mejor',
  newBest: 'Nuevo récord',
  was: 'Antes: {best}',

  characters: 'Personajes',
  accessories: 'Accesorios',
  auto: 'Auto',
  autoHint: 'Toma el color del agente que tienes corriendo',
  none: 'Ninguno',
  buy: '¿Comprar?',
  short: 'Faltan {coins}',
  howToEarn:
    'Las monedas se ganan jugando: cada una que atrapas vale {token}. Si un agente termina mientras juegas, te manda su proyecto: atrápalo y son {delivery}.',
  sound: 'Sonido',
  soundOn: 'Sonido: sí',
  soundOff: 'Sonido: no',
  options: 'Opciones',
  optionSound: 'Sonido',
  optionNames: 'Nombres de proyectos',
  optionNamesHint: 'En «no» se ocultan los íconos y los nombres de tus proyectos, para cuando compartes pantalla',
  optionPauseNeed: 'Pausar cuando un agente te necesita',
  optionPauseDone: 'Pausar cuando un agente termina',
  optionLanguage: 'Idioma (Language)',
  on: 'Sí',
  off: 'No',

  games: 'Más juegos',
  gamesTitle: 'Juegos',
  playing: 'Jugando',
  soon: 'Pronto',
  soonHint: 'Vienen más juegos en camino. Llegan con las actualizaciones del plugin.',

  waitingIn: 'Un agente de {name} te está esperando',
  waiting: 'Un agente te está esperando',
  blockedIn: 'Un agente de {name} está bloqueado',
  blocked: 'Un agente está bloqueado',
  finishedIn: 'Un agente de {name} terminó',
  finished: 'Un agente terminó',
  floating: 'la ventana flotante',
  catchIt: 'Te mandó su proyecto: ¡atrápalo!',
  awayOne: 'Mientras no mirabas, tus agentes terminaron 1 tarea',
  awayMany: 'Mientras no mirabas, tus agentes terminaron {count} tareas',
  goToAgent: 'Ir al agente',
  dismiss: 'Cerrar',
  openFailed: 'Orca no pudo abrir ese workspace',

  ranking: 'Ranking',
  rankingTitle: 'Ranking mundial',
  rankingWeek: 'Esta semana',
  rankingAll: 'Histórico',
  rankingEnds: 'Nueva semana en {time}',
  rankingEmpty: 'Aún no hay puntajes: la primera partida que cuente se queda con el primer lugar.',
  rankingYou: 'Tú: #{rank} con {score}',
  rankingPlayingAs: 'Juegas como {name}',
  rankingRename: 'Cambiar nombre',
  rankingLeave: 'Salir',
  rankingLeaveSure: '¿Seguro? Pulsa otra vez',
  rankingLeft: 'Saliste del ranking y se borraron tus puntajes.',
  rankingPitch: 'Elige un apodo para que tus partidas entren al ranking mundial.',
  rankingPlaceholder: 'Apodo',
  rankingJoin: 'Entrar',
  rankingSave: 'Guardar',
  rankingPrivacy:
    'Solo se envían tu apodo y tus partidas, y cada partida se vuelve a jugar en el servidor antes de contar. Tus proyectos y agentes nunca salen de tu computadora. Al salir se borra todo.',
  rankingBadName: 'Usa de 2 a 16 letras o números.',
  rankingSoon: 'Espera unos segundos y vuelve a intentar.',
  rankingOffline: 'No se puede llegar al ranking ahora mismo.',
  rankingLoading: 'Cargando…',
  rankingFromNow: 'Ya estás dentro. Tus partidas cuentan desde ahora.',
  rankingCardWeek: '#{rank} de la semana',
  rankingCardAll: '#{rank} histórico'
}

/** What each character and accessory is called. An agent's name is a name: it is not translated. */
const ITEMS_EN: Record<ItemId, string> = {
  blip: 'Blip',
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  cat: 'Cat',
  frog: 'Frog',
  gold: 'Golden',
  cap: 'Cap',
  glasses: 'Shades',
  headphones: 'Headphones',
  crown: 'Crown'
}

const ITEMS_ES: Record<ItemId, string> = {
  ...ITEMS_EN,
  cat: 'Gato',
  frog: 'Rana',
  gold: 'Dorado',
  cap: 'Gorra',
  glasses: 'Lentes',
  headphones: 'Audífonos',
  crown: 'Corona'
}

export type Strings = typeof EN & { items: Record<ItemId, string> }

export type Language = 'en' | 'es'
export const LANGUAGES: readonly Language[] = ['en', 'es']
/** The language of a panel nobody has set yet. */
export const DEFAULT_LANGUAGE: Language = 'en'
/** What each language calls itself: a name is read by who speaks it, so it is not translated. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', es: 'Español' }

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

export function stringsFor(language: Language): Strings {
  return language === 'es' ? { ...ES, items: ITEMS_ES } : { ...EN, items: ITEMS_EN }
}

/** Puts values in a text's `{places}`. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (place, key: string) =>
    key in values ? String(values[key]) : place
  )
}

/**
 * What the person is told when they come back: how many tasks their agents finished meanwhile,
 * and in which projects (a null name is a project Orca did not name, and `named` false leaves
 * them all out).
 */
export function newsText(
  strings: Strings,
  unseen: readonly { name: string | null; tasks: number }[],
  named: boolean
): string {
  const tasks = unseen.reduce((sum, entry) => sum + entry.tasks, 0)
  const head = fill(tasks === 1 ? strings.awayOne : strings.awayMany, { count: tasks })
  const projects = named ? unseen.filter((entry) => entry.name !== null) : []
  const detail =
    projects.length > 0
      ? `: ${projects.map((entry) => `${entry.name} ${entry.tasks}`).join(', ')}`
      : ''
  return `${head}${detail}`
}
