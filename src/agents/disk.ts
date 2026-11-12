// What the worker reads from the person's disk, and nothing else: each project's own icon, to
// hang it on the office wall, and when its folder was last worked in, to know which projects
// are the current ones. Only folders of Orca's workspaces are read, and nothing leaves Orca.
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const SEARCH = {
  /** How deep under a project's folder an icon is looked for: monorepos keep it in `apps/x/public`. */
  maxDepth: 5,
  /** Folders opened at most for one project, so a huge repository costs little. */
  maxFolders: 600,
  /** A bigger file is not an icon worth sending to the panel. */
  maxBytes: 600 * 1024,
  /** Icons read at most for one project, while they turn out to be a template's or too big. */
  maxTried: 8,
  /** Folders that hold copies, builds or other people's code. Hidden folders are skipped too. */
  skip: [
    'node_modules',
    'dist',
    'build',
    'out',
    'target',
    'vendor',
    'coverage',
    'Pods',
    'DerivedData',
    'tmp',
    'temp',
    '__pycache__',
    'venv'
  ] as readonly string[]
} as const

/** File names an icon goes by, the best first: small pictures made to be an icon, then app
 *  icons and logos, and drawings last because not every Orca can turn one into pixels. */
const ICON_NAMES: readonly string[] = [
  'favicon-32x32.png',
  '32x32.png',
  'favicon.png',
  'icon.png',
  'apple-touch-icon.png',
  'favicon.ico',
  'app-icon.png',
  'logo.png',
  'favicon.svg',
  'icon.svg',
  'app-icon.svg',
  'logo.svg'
]

/**
 * Icons that project templates come with (SHA-256 of the file). A project that still has one
 * has no icon of its own yet, and the template's says nothing about it, so it is passed over.
 * The list is the templates met so far, not all there are.
 */
const TEMPLATE_ICONS: readonly string[] = [
  // create-next-app: app/favicon.ico
  '2b8ad2d33455a8f736fc3a8ebf8f0bdea8848ad4c0db48a2833bd0f9cd775932',
  '1c3a7c8d7e85c225ce9e4da5c0aec4675f9a7935ec5d8f1c438a727c94751547',
  // create-tauri-app: src-tauri/icons
  'd151f11e325f7502de0c739a2e51697aa569fd4701ae6e11fae1a3b4c7d5f157',
  'b5d93c8ec365c08b11bd006e46a46e227c681d30bb295af3d017573bfc752a83',
  '1f3689f6374b0553996fdc99743799216703835070145d7f0e6ec11e6280139e',
  // create-expo-app: assets/images
  '74c64047eb557b1341bba7a2831eedde9ddb705e6451a9ad9f5552bf558f13de',
  '24272cdaeff82cc5facdaccd982a6f05b60c4504704bbf94c19a6388659880bb'
]

const TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  ico: 'image/x-icon',
  svg: 'image/svg+xml'
}

export type IconFile = { data: string; type: string }

interface Found {
  path: string
  rank: number
  depth: number
}

/** Every file under `root` that goes by an icon's name, the best first. */
export async function findIcons(root: string): Promise<string[]> {
  const found: Found[] = []
  let opened = 0
  let level: string[] = [root]
  for (let depth = 0; depth <= SEARCH.maxDepth && level.length > 0; depth += 1) {
    const next: string[] = []
    for (const folder of level) {
      if (opened >= SEARCH.maxFolders) break
      opened += 1
      let entries
      try {
        entries = await readdir(folder, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && !SEARCH.skip.includes(entry.name)) {
            next.push(join(folder, entry.name))
          }
          continue
        }
        const rank = ICON_NAMES.indexOf(entry.name.toLowerCase())
        if (rank >= 0 && entry.isFile()) found.push({ path: join(folder, entry.name), rank, depth })
      }
    }
    level = next
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.path.length - b.path.length)
    .map((icon) => icon.path)
}

/** The project's own icon as a file to hand to the panel, or null when it has none: nothing
 *  found, or only icons too big or that came with a template. */
export async function readIcon(root: string): Promise<IconFile | null> {
  for (const path of (await findIcons(root)).slice(0, SEARCH.maxTried)) {
    try {
      const type = TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()]
      const { size } = await stat(path)
      if (!type || size === 0 || size > SEARCH.maxBytes) continue
      const bytes = await readFile(path)
      if (TEMPLATE_ICONS.includes(createHash('sha256').update(bytes).digest('hex'))) continue
      return { data: bytes.toString('base64'), type }
    } catch {
      // Unreadable: try the next one.
    }
  }
  return null
}

/** When a project's folder was last worked in, in milliseconds, or 0 when it cannot be read:
 *  Git's index changes with each commit, checkout or staged file. */
export async function lastWorked(root: string): Promise<number> {
  for (const path of [join(root, '.git', 'index'), join(root, '.git'), root]) {
    try {
      return (await stat(path)).mtimeMs
    } catch {
      // Not a repository, or a worktree whose `.git` is a file: try the next.
    }
  }
  return 0
}
