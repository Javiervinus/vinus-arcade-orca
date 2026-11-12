// Every drawing in the game is made here, in code: the plugin ships no image files.
// A sprite is rows of one-letter cells; each letter names a colour of the skin's palette.

export type SkinId = 'blip' | 'claude' | 'codex' | 'gemini' | 'cat' | 'frog' | 'gold'
export const SKIN_IDS: readonly SkinId[] = ['blip', 'claude', 'codex', 'gemini', 'cat', 'frog', 'gold']

export const AGENT_WIDTH = 16
export const AGENT_HEIGHT = 16
/** The rows above the body, where each skin wears what tells it apart from afar. */
export const CREST_ROWS = 3
/** Where the eyes sit unless a skin says otherwise: their first row. */
const EYES_TOP = 7

export interface Skin {
  /** The rows above the body: an antenna, a tuft, ears. A hat takes their place. */
  crest: readonly [string, string, string]
  /** What the skin draws over the shared body, by sprite row: a visor, a muzzle, a belly. */
  marks: Readonly<Record<number, string>>
  /** The first row of the eyes, for a skin that carries them elsewhere. */
  eyesTop?: number
  palette: {
    outline: string
    body: string
    light: string
    shade: string
    accent: string
    /** A second accent: the blush of a cheek. */
    extra: string
    /** The eyes, for a skin whose eyes are not white on dark. */
    eye?: string
    pupil?: string
  }
}

/** Original characters. The agent skins only borrow a colour that recalls each agent. */
export const SKINS: Record<SkinId, Skin> = {
  blip: {
    crest: ['.......aa.......', '.......aa.......', '.......oo.......'],
    marks: {
      10: '.............ee.',
      12: '.....hhhhhh.....',
      13: '......hhhh......'
    },
    palette: {
      outline: '#0b2a3a',
      body: '#3fd0c9',
      light: '#a6f3ee',
      shade: '#1f8f97',
      accent: '#ffd166',
      extra: '#ff9fb0'
    }
  },
  claude: {
    crest: ['.....a..a..a....', '......a.a.a.....', '.......aaa......'],
    marks: {
      10: '.............ee.',
      12: '......aaaa......',
      13: '.......aa.......'
    },
    palette: {
      outline: '#3a1a10',
      body: '#d97757',
      light: '#f0a98c',
      shade: '#a9512f',
      accent: '#f5e6d3',
      extra: '#ff9d8a'
    }
  },
  codex: {
    crest: ['................', '......aaaa......', '.....oaaaao.....'],
    marks: {
      6: '.....ooooooooo..',
      7: '....ooooooooooo.',
      8: '....ooooooooooo.',
      9: '....ooooooooooo.',
      10: '.....ooooooooo..'
    },
    palette: {
      outline: '#1a1d26',
      body: '#e8eaf0',
      light: '#ffffff',
      shade: '#9aa3b5',
      accent: '#5b8cff',
      extra: '#5b8cff',
      eye: '#5b8cff',
      pupil: '#dfe8ff'
    }
  },
  gemini: {
    crest: ['...a........a...', '....o......o....', '.....o....o.....'],
    marks: {
      4: '.........a......',
      5: '........aaa.....',
      6: '.........a......',
      10: '.............ee.',
      12: '..sssssssssss...'
    },
    palette: {
      outline: '#171a3a',
      body: '#6d8bff',
      light: '#b3c3ff',
      shade: '#5a45c2',
      accent: '#ff8ad0',
      extra: '#ff8ad0'
    }
  },
  cat: {
    crest: ['...o........o...', '..oao......oao..', '..oabo....obao..'],
    marks: {
      3: '..obboooooobbo..',
      4: '...b....s.s.b...',
      5: '.........s......',
      10: '.......aaaaaa...',
      11: '.......aaaaaa...',
      12: '........aaaa....'
    },
    palette: {
      outline: '#3a2110',
      body: '#e8963a',
      light: '#f7c98b',
      shade: '#b06a22',
      accent: '#fff1cf',
      extra: '#ff9d8a'
    }
  },
  frog: {
    crest: ['................', '......ooo..ooo..', '.....obbboobbbo.'],
    marks: {
      3: '....oobbbbbbbbo.',
      4: '............bbo.',
      11: '......mmmmmmmm..',
      12: '....hhhhhhhh....',
      13: '.....hhhhhh.....'
    },
    eyesTop: 4,
    palette: {
      outline: '#173a1c',
      body: '#6fbf5a',
      light: '#b4e89f',
      shade: '#3f8a3a',
      accent: '#ffd166',
      extra: '#ffd166'
    }
  },
  gold: {
    crest: ['.......a........', '......aaa.......', '.......a........'],
    marks: {
      5: '...aa...........',
      6: '..a.............',
      13: '...........a....'
    },
    palette: {
      outline: '#4a3210',
      body: '#ffd43b',
      light: '#fff3b0',
      shade: '#c9941a',
      accent: '#ffffff',
      extra: '#ffffff'
    }
  }
}

export type AccessoryId = 'cap' | 'glasses' | 'headphones' | 'crown'
export const ACCESSORY_IDS: readonly AccessoryId[] = ['cap', 'glasses', 'headphones', 'crown']

export interface Accessory {
  /** Whether it sits where the crest is, which then is not drawn. */
  coversCrest: boolean
  /** Whether it is worn on the eyes, and so moves with them on a skin that carries them elsewhere. */
  onEyes?: boolean
  /** Which sprite rows it draws on. Its cells are capital letters, so they never read as a
   *  colour of the skin. */
  rows: Readonly<Record<number, string>>
  colors: Readonly<Record<string, string>>
}

/** Things a character wears, drawn over it. The agent flies to the right. */
export const ACCESSORIES: Record<AccessoryId, Accessory> = {
  cap: {
    coversCrest: true,
    rows: {
      1: '.....RRRRRR.....',
      2: '....RLRRRRRR....',
      3: '...RRRRRRRRRDDDD'
    },
    colors: { R: '#e35d5b', L: '#f39a98', D: '#a83a39' }
  },
  glasses: {
    coversCrest: false,
    onEyes: true,
    rows: {
      6: '.....KKKKKKKKKK.',
      7: '.KKKKK...KK...K.',
      8: '.....K...KK...K.',
      9: '.....K...KK...K.',
      10: '.....KKKKKKKKKK.'
    },
    colors: { K: '#14172a' }
  },
  headphones: {
    coversCrest: true,
    rows: {
      2: '....KKKKKKKK....',
      3: '..KK........KK..',
      4: '.K............K.',
      5: 'K..............K',
      6: 'CC............CC',
      7: 'CD............DC',
      8: 'CD............DC',
      9: 'CD............DC',
      10: 'CC............CC'
    },
    colors: { K: '#1d2540', C: '#ff6b6b', D: '#c94545' }
  },
  crown: {
    coversCrest: true,
    rows: {
      0: '....Y..YY..Y....',
      1: '....YY.YY.YY....',
      2: '....YYGYYGYY....'
    },
    colors: { Y: '#ffd166', G: '#e35d5b' }
  }
}

/** Which skin recalls an agent, from the agent kind Orca reports (`claude`, `codex`, ...). */
export function skinForAgent(agent: string | null | undefined): SkinId {
  const kind = (agent ?? '').toLowerCase()
  if (kind.includes('claude')) return 'claude'
  if (kind.includes('codex')) return 'codex'
  if (kind.includes('gemini') || kind.includes('antigravity')) return 'gemini'
  return 'blip'
}

export type Pose = 'rising' | 'falling' | 'out'

/** The body every character shares, by sprite row: a round one, lit from the top left. */
const BODY: Readonly<Record<number, string>> = {
  3: '....oooooooo....',
  4: '..oohhhhbbbboo..',
  5: '.ohhhbbbbbbbbbo.',
  6: '.ohbbbbbbbbbbbo.',
  7: 'ohbbbbbbbbbbbbbo',
  8: 'obbbbbbbbbbbbbbo',
  9: 'obbbbbbbbbbbbbbo',
  10: 'obbbbbbbbbbbbbbo',
  11: 'obbbbbbbbbbbbbso',
  12: '.obbbbbbbbbbbso.',
  13: '.osbbbbbbbbbsso.',
  14: '..oossssssssoo..',
  15: '....oooooooo....'
}

/** The eyes in each pose, three rows from the skin's `eyesTop`. The character looks where it goes. */
const EYES: Record<Pose, readonly [string, string, string]> = {
  rising: ['......wpp..wpp..', '......wpp..wpp..', '......www..www..'],
  falling: ['......www..www..', '......wpp..wpp..', '......wpp..wpp..'],
  out: ['......p.p..p.p..', '.......p....p...', '......p.p..p.p..']
}

/** The rest of the face in each pose, by sprite row: the wing on its back, up or down, and the
 *  mouth, which smiles on the way up. */
const FACE: Record<Pose, Readonly<Record<number, string>>> = {
  rising: {
    9: '.sss............',
    10: '.ssso...m..m....',
    11: '..oo.....mm.....'
  },
  falling: {
    7: '..oo............',
    8: '.ssso...........',
    9: '.sss............',
    11: '.........mm.....'
  },
  out: {
    9: '.sss............',
    10: '.ssso....m.m....',
    11: '..oo....m.m.m...'
  }
}

const EMPTY_ROW = '.'.repeat(AGENT_WIDTH)

/** `row` with the drawn cells of `top` over it. */
function over(row: string, top: string | undefined): string {
  if (!top) return row
  return Array.from(row, (cell, i) => (top[i] && top[i] !== '.' ? top[i] : cell)).join('')
}

/** The character's sprite in a pose, wearing an accessory or nothing. */
export function agentRows(skin: Skin, pose: Pose, accessory: Accessory | null = null): string[] {
  const eyesTop = skin.eyesTop ?? EYES_TOP
  const lift = accessory?.onEyes ? eyesTop - EYES_TOP : 0
  const rows: string[] = []
  for (let j = 0; j < AGENT_HEIGHT; j += 1) {
    const hidden = j < CREST_ROWS && accessory?.coversCrest
    let row = hidden ? EMPTY_ROW : (skin.crest[j] ?? EMPTY_ROW)
    row = over(row, BODY[j])
    if (!hidden) row = over(row, skin.marks[j])
    row = over(row, FACE[pose][j])
    row = over(row, EYES[pose][j - eyesTop])
    row = over(row, accessory?.rows[j - lift])
    rows.push(row)
  }
  return rows
}

/** The exhaust under the agent right after a flap, two frames. */
export const FLAME_FRAMES: readonly (readonly string[])[] = [
  ['......fggf......', '.......ff.......'],
  ['......ffff......', '.......gf.......', '........f.......']
]
export const FLAME_COLORS = { f: '#ff9f43', g: '#fff1b8' } as const

const WHITE = '#ffffff'

export function cellColor(
  skin: Skin,
  cell: string,
  accessory: Accessory | null = null
): string | null {
  const worn = accessory?.colors[cell]
  if (worn) return worn
  switch (cell) {
    case 'o':
    case 'm':
      return skin.palette.outline
    case 'p':
      return skin.palette.pupil ?? skin.palette.outline
    case 'b':
      return skin.palette.body
    case 'h':
      return skin.palette.light
    case 's':
      return skin.palette.shade
    case 'a':
      return skin.palette.accent
    case 'e':
      return skin.palette.extra
    case 'w':
      return skin.palette.eye ?? WHITE
    default:
      return null
  }
}

/** A 3×5 pixel font for what the game writes on the canvas: the score, the coins and the
 *  initial on each project's plaque. */
export const GLYPH_WIDTH = 3
export const GLYPH_HEIGHT = 5
export const GLYPHS: Record<string, readonly string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['110', '101', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '110', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '!': ['010', '010', '010', '000', '010']
}

/** The letter or digit that stands for a name on a plaque, or null when the font has none
 *  (a name in another script): the plaque is then drawn without a letter. */
export function initialOf(name: string): string | null {
  const plain = name.normalize('NFD').toUpperCase()
  for (const char of plain) {
    if (GLYPHS[char] && char !== '!') return char
  }
  return null
}
