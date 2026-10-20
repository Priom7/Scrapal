// Renders chosen frames as PNGs with one bundle, for reviewing a cut without
// rendering the film. Prints the time per frame, which is the number that
// decides whether a full render fits on this machine.
//
//   node scripts/stills.mjs 150 396 510          # frame numbers
//   node scripts/stills.mjs 2.5s 6.6s            # or seconds
//   node scripts/stills.mjs --scale=0.5 12s
//   node scripts/stills.mjs --comp=ScrapalAdmin 30s     # the operator film
import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const scale = Number(args.find((a) => a.startsWith('--scale='))?.split('=')[1] ?? 1)
const outDir = args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? path.join(root, 'out', 'stills')
const comp = args.find((a) => a.startsWith('--comp='))?.split('=')[1] ?? 'ScrapalPromo'
const wanted = args.filter((a) => !a.startsWith('--'))
mkdirSync(outDir, { recursive: true })

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public') })
const composition = await selectComposition({ serveUrl, id: comp })
const frames = wanted.map((w) => (w.endsWith('s') ? Math.round(parseFloat(w) * composition.fps) : Number(w)))

for (const frame of frames) {
  const started = performance.now()
  const output = path.join(outDir, `${comp === 'ScrapalPromo' ? 'f' : 'a'}${String(frame).padStart(5, '0')}.png`)
  await renderStill({ serveUrl, composition, frame, output, scale, imageFormat: 'png' })
  console.log(`${output}  ${(performance.now() - started).toFixed(0)} ms`)
}
