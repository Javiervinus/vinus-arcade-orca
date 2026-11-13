// The small drawings on the card's buttons, made of pixels like the rest of the game.
// A drawing is rows of cells: `x` is ink, in the button's own text colour.

export const PIXEL_ICONS = {
  soundOn: [
    '....x......',
    '...xx...x..',
    'xxxxx.x..x.',
    'xxxxx..x.x.',
    'xxxxx..x.x.',
    'xxxxx..x.x.',
    'xxxxx.x..x.',
    '...xx...x..',
    '....x......'
  ],
  soundOff: [
    '....x......',
    '...xx......',
    'xxxxx.x...x',
    'xxxxx..x.x.',
    'xxxxx...x..',
    'xxxxx..x.x.',
    'xxxxx.x...x',
    '...xx......',
    '....x......'
  ],
  games: [
    '.xxxxxxxxxxx.',
    'xxx.xxxxxxxxx',
    'xx...xxxx.xxx',
    'xxx.xxxxxxx.x',
    'xxxxxxxxxxxxx',
    'xxxx.....xxxx',
    '.xx.......xx.'
  ],
  ranking: [
    '..xxxxxxx..',
    'xxxxxxxxxxx',
    'x.xxxxxxx.x',
    'x.xxxxxxx.x',
    '.xxxxxxxxx.',
    '...xxxxx...',
    '....xxx....',
    '...xxxxx...',
    '..xxxxxxx..'
  ],
  options: [
    '...xxx...',
    '.x.xxx.x.',
    '.xxxxxxx.',
    'xxx...xxx',
    'xxx...xxx',
    'xxx...xxx',
    '.xxxxxxx.',
    '.x.xxx.x.',
    '...xxx...'
  ]
} as const satisfies Record<string, readonly string[]>

const SVG = 'http://www.w3.org/2000/svg'

/** A drawing as a picture whose pixels are `scale` screen pixels wide. */
export function pixelIcon(rows: readonly string[], scale: number): SVGSVGElement {
  const width = rows[0]?.length ?? 0
  const picture = document.createElementNS(SVG, 'svg')
  picture.setAttribute('viewBox', `0 0 ${width} ${rows.length}`)
  picture.setAttribute('width', String(width * scale))
  picture.setAttribute('height', String(rows.length * scale))
  picture.setAttribute('shape-rendering', 'crispEdges')
  picture.setAttribute('aria-hidden', 'true')
  rows.forEach((row, j) => {
    // One rectangle for each run of ink in a row.
    for (let i = 0; i < row.length; i += 1) {
      if (row[i] !== 'x') continue
      let end = i
      while (row[end + 1] === 'x') end += 1
      const run = document.createElementNS(SVG, 'rect')
      run.setAttribute('x', String(i))
      run.setAttribute('y', String(j))
      run.setAttribute('width', String(end - i + 1))
      run.setAttribute('height', '1')
      run.setAttribute('fill', 'currentColor')
      picture.append(run)
      i = end
    }
  })
  return picture
}
