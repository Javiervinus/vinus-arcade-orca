// Each project's own icon, shrunk to the few pixels of a plaque on the office wall. The worker
// reads the file from the project's folder; here it is turned into pixels once and kept, so the
// file is not read again until the kept copy is old.
import type { IconFile } from '../agents/disk'
import { ARCADE_NAME } from './game'

const ICONS = {
  /** A plaque shows the icon at the size icons are drawn for: one game pixel per icon pixel. */
  size: 16,
  storeKey: 'icons',
  /** Which way of choosing a project's icon the worker has. A kept icon chosen another way is
   *  read again: raise it when the worker's choice changes. */
  choice: 2,
  /** A kept icon is read again after this long, in case the project changed it. */
  keepMs: 7 * 24 * 60 * 60 * 1000,
  /** What shows through an icon with holes: dark behind a light icon, light behind a dark one. */
  lightMat: [245, 236, 212],
  darkMat: [29, 37, 64],
  lightFrom: 0.6
} as const

type Kept = Record<string, { pixels: string | null; at: number; choice: number }>

function toBytes(base64: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64)
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i)
  return bytes
}

function toBase64(bytes: Uint8ClampedArray): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const paint = canvas.getContext('2d', { willReadFrequently: true })
  if (!paint) throw new Error('no 2D canvas')
  return [canvas, paint]
}

/** Shrinks a picture to the plaque's size, whole and centred. It is halved step by step, which
 *  keeps a big app icon from turning into noise. */
function shrink(picture: ImageBitmap): Uint8ClampedArray {
  const size = ICONS.size
  const scale = Math.min(size / picture.width, size / picture.height)
  const width = Math.max(1, Math.round(picture.width * scale))
  const height = Math.max(1, Math.round(picture.height * scale))
  let source: CanvasImageSource = picture
  let sourceWidth = picture.width
  let sourceHeight = picture.height
  while (sourceWidth >= width * 4 && sourceHeight >= height * 4) {
    sourceWidth = Math.ceil(sourceWidth / 2)
    sourceHeight = Math.ceil(sourceHeight / 2)
    const [half, paint] = canvasOf(sourceWidth, sourceHeight)
    paint.imageSmoothingQuality = 'high'
    paint.drawImage(source, 0, 0, sourceWidth, sourceHeight)
    source = half
  }
  const [, paint] = canvasOf(size, size)
  // A picture smaller than the plaque keeps its hard pixels.
  paint.imageSmoothingEnabled = scale < 1
  paint.imageSmoothingQuality = 'high'
  paint.drawImage(
    source,
    Math.floor((size - width) / 2),
    Math.floor((size - height) / 2),
    width,
    height
  )
  return paint.getImageData(0, 0, size, size).data
}

/** Puts a mat behind an icon with holes, so every pixel is solid. Null for an empty picture. */
function flatten(pixels: Uint8ClampedArray): Uint8ClampedArray | null {
  let light = 0
  let solid = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = (pixels[i + 3] ?? 0) / 255
    const red = pixels[i] ?? 0
    const green = pixels[i + 1] ?? 0
    const blue = pixels[i + 2] ?? 0
    light += ((0.299 * red + 0.587 * green + 0.114 * blue) / 255) * alpha
    solid += alpha
  }
  if (solid < 1) return null
  const mat = light / solid > ICONS.lightFrom ? ICONS.darkMat : ICONS.lightMat
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = (pixels[i + 3] ?? 0) / 255
    for (let c = 0; c < 3; c += 1) {
      pixels[i + c] = Math.round((pixels[i + c] ?? 0) * alpha + (mat[c] ?? 0) * (1 - alpha))
    }
    pixels[i + 3] = 255
  }
  return pixels
}

async function pixelsOf(file: IconFile): Promise<string | null> {
  try {
    const picture = await createImageBitmap(new Blob([toBytes(file.data)], { type: file.type }))
    const pixels = flatten(shrink(picture))
    picture.close()
    return pixels ? toBase64(pixels) : null
  } catch {
    // A kind of picture this Orca cannot turn into pixels: the plaque shows the initial.
    return null
  }
}

function drawingOf(pixels: string): HTMLCanvasElement | null {
  const bytes = toBytes(pixels)
  if (bytes.length !== ICONS.size * ICONS.size * 4) return null
  const [canvas, paint] = canvasOf(ICONS.size, ICONS.size)
  paint.putImageData(new ImageData(new Uint8ClampedArray(bytes), ICONS.size, ICONS.size), 0, 0)
  return canvas
}

export class Icons {
  private kept: Kept = {}
  private readonly drawings = new Map<string, HTMLCanvasElement | null>()
  private readonly asking = new Set<string>()

  /** `onReady` is called when a project's icon arrives, to draw the wall again. */
  constructor(private readonly onReady: () => void) {}

  /** Takes the icons kept from earlier sessions. */
  async load(): Promise<void> {
    const stored = await orca.storage.get(ICONS.storeKey)
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return
    for (const [name, entry] of Object.entries(stored)) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
      const { pixels, at, choice } = entry
      if (typeof at !== 'number' || (pixels !== null && typeof pixels !== 'string')) continue
      if (choice !== ICONS.choice) continue
      this.kept[name] = { pixels, at, choice }
    }
  }

  /** A project's icon as a small picture to draw, or null: none, or not here yet. */
  get(name: string): HTMLCanvasElement | null {
    const drawing = this.drawings.get(name)
    if (drawing !== undefined) return drawing
    const pixels = this.kept[name]?.pixels
    const made = pixels ? drawingOf(pixels) : null
    this.drawings.set(name, made)
    return made
  }

  /** Asks the worker for the icons of these projects that are not kept, or kept too long ago. */
  want(names: readonly string[]): void {
    const now = Date.now()
    for (const name of names) {
      const kept = this.kept[name]
      if ((kept && now - kept.at < ICONS.keepMs) || this.asking.has(name)) continue
      this.asking.add(name)
      void this.fetch(name)
    }
  }

  private async fetch(name: string): Promise<void> {
    try {
      const file = await orca.plugin.request('project.icon', { name })
      this.kept[name] = {
        pixels: file ? await pixelsOf(file) : null,
        at: Date.now(),
        choice: ICONS.choice
      }
      this.drawings.delete(name)
      await orca.storage.set(ICONS.storeKey, this.kept)
      this.onReady()
    } catch (error) {
      console.warn(`${ARCADE_NAME} could not read the icon of ${name}`, error)
    } finally {
      this.asking.delete(name)
    }
  }
}
