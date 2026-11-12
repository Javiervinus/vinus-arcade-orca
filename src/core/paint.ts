// The few drawing tools every picture in the game is made with: rectangles of whole pixels.
import { GLYPHS, GLYPH_WIDTH } from './sprites'

export type Paint = CanvasRenderingContext2D

/** A stable pseudo-random number for a grid cell, so the scenery never flickers. */
export function hash(a: number, b: number): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

/** A stable number for a text, to give each name its own colour. */
export function hashText(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i += 1) h = hash(h, text.charCodeAt(i))
  return h
}

export function box(ctx: Paint, color: string, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/** Draws a sprite: rows of one-letter cells, each letter a colour or nothing. */
export function drawRows(
  ctx: Paint,
  rows: readonly string[],
  left: number,
  top: number,
  colorOf: (cell: string) => string | null
): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i += 1) {
      const color = colorOf(row[i] ?? '.')
      if (color) box(ctx, color, left + i, top + j, 1, 1)
    }
  })
}

export function textWidth(text: string, scale: number): number {
  return (text.length * (GLYPH_WIDTH + 1) - 1) * scale
}

export function drawText(
  ctx: Paint,
  text: string,
  left: number,
  top: number,
  scale: number,
  color: string
): void {
  for (let n = 0; n < text.length; n += 1) {
    const glyph = GLYPHS[text[n] ?? '']
    if (!glyph) continue
    const x = left + n * (GLYPH_WIDTH + 1) * scale
    glyph.forEach((row, j) => {
      for (let i = 0; i < row.length; i += 1) {
        if (row[i] === '1') box(ctx, color, x + i * scale, top + j * scale, scale, scale)
      }
    })
  }
}

const OUTLINE: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [1, 1]
]

/** Text with a dark edge, readable over any part of the room. */
export function drawOutlinedText(
  ctx: Paint,
  text: string,
  left: number,
  top: number,
  scale: number,
  color: string,
  edge: string
): void {
  for (const [dx, dy] of OUTLINE) drawText(ctx, text, left + dx, top + dy, scale, edge)
  drawText(ctx, text, left, top, scale, color)
}

/** A colour between two `#rrggbb` colours: 0 is the first, 1 the second. */
export function mix(from: string, to: string, share: number): string {
  const channel = (color: string, at: number): number => parseInt(color.slice(at, at + 2), 16)
  return `#${[1, 3, 5]
    .map((at) => Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * share))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}

/** A coin seen from the front or turning: `half` is its half width, from 0 (edge on) to 3. */
export function drawCoin(
  ctx: Paint,
  x: number,
  y: number,
  half: number,
  colors: { face: string; light: string; edge: string }
): void {
  const cx = Math.round(x)
  const cy = Math.round(y)
  for (let j = -3; j <= 3; j += 1) {
    const rim = Math.abs(j) === 3
    const reach = Math.min(half, rim ? 1 : 3)
    box(ctx, rim ? colors.edge : colors.face, cx - reach, cy + j, reach * 2 + 1, 1)
  }
  if (half > 0) box(ctx, colors.light, cx - Math.min(half, 1), cy - 2, 1, 3)
}
