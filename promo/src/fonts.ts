// Inter, from the same @fontsource files the product ships, so type in the
// video is the type in the app. Loaded from disk: no network during a render.
import { loadFont } from '@remotion/fonts'
import { staticFile } from 'remotion'

const WEIGHTS = ['400', '500', '600', '700', '800'] as const

export const fontsReady = Promise.all([
  ...WEIGHTS.map((weight) => loadFont({
    family: 'Inter',
    url: staticFile(`fonts/inter-latin-${weight}-normal.woff2`),
    weight,
    display: 'block',
  })),
  // The console keeps IBM Plex Mono for tabular run data — the brand's one
  // documented exception to Inter, used only inside the operator film.
  ...(['400', '500'] as const).map((weight) => loadFont({
    family: 'IBM Plex Mono',
    url: staticFile(`fonts/ibm-plex-mono-latin-${weight}-normal.woff2`),
    weight,
    display: 'block',
  })),
])
