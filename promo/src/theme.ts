// The brand, as the video uses it. Every value is copied from
// console/src/brand.css (the code authority for Scrapal Brand Guidelines v1.1)
// or from the light-theme aliases in styles.css / student.css. A scene must not
// invent a colour, radius or font — add it here first, with where it came from.

export const C = {
  // Core palette (guidelines p.04)
  blue: '#465cff',
  blueDeep: '#3145d6',
  sky: '#3fa7e8',
  cyan: '#34a8d8',
  mint: '#42cfa0',
  emerald: '#20c998',
  amber: '#e4a72c',
  navy: '#101820',
  cloud: '#f8fafc',

  // Semantic colours and their text-contrast inks
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#8b5cf6',
  successInk: '#087255',
  warningInk: '#956100',
  infoInk: '#6532d9',

  // Washes for badge and banner fills (p.05, p.06)
  blueWash: '#eef1ff',
  successWash: '#e7f8ef',
  warningWash: '#fdf2e2',
  infoWash: '#f2ecfe',

  // Light product surfaces (styles.css :root)
  ink: '#101820',
  inkSoft: '#34424d',
  /** student.css --s-faint: ink-soft mixed 74% into the surface. */
  inkFaint: '#6b757e',
  paper: '#f8fafc',
  surface: '#ffffff',
  surface2: '#eff2f8',
  line: '#dfe3ec',
  /** student.css --s-met-soft / --s-close-soft: mint and amber at 16% on white. */
  metSoft: '#e0f8ef',
  closeSoft: '#fbf2e0',

  // Dark surfaces (styles.css :root[data-theme='dark']) — built on wordmark navy
  darkPaper: '#0a1016',
  darkSurface2: '#17222d',
  darkLine: '#263440',
  darkInk: '#edf6f2',
  darkInkSoft: '#adbbb5',
} as const

export const R = {
  card: 22,
  panel: 18,
  control: 16,
  input: 14,
  small: 10,
  pill: 999,
} as const

/** "Avoid heavy shadows; let spacing do the work." Only floating things lift. */
export const SHADOW = {
  lift: '0 1px 2px rgb(16 24 32 / 0.04), 0 8px 24px rgb(16 24 32 / 0.05)',
  liftHigh: '0 24px 60px rgb(16 24 32 / 0.18)',
  /** The product window: lift-high, softened for a 1080p frame. */
  window: '0 2px 4px rgb(16 24 32 / 0.04), 0 30px 80px rgb(16 24 32 / 0.14)',
} as const

/** Inter carries every word; Comfortaa lives only inside the wordmark artwork. */
export const FONT = "'Inter', system-ui, -apple-system, sans-serif"
/** The console's run-data face (brand.css --sc-font-mono). Operator film only. */
export const MONO = "'IBM Plex Mono', ui-monospace, monospace"

/** The brand's thread gradients, from the master logo artwork. */
export const THREAD = {
  blue: [C.blue, C.sky],
  mint: [C.cyan, C.mint],
  lower: [C.emerald, C.mint],
  full: [C.blue, C.sky, C.mint],
} as const

/** The product's surfaces in one theme. Light is the student app's default;
    dark is the console's (styles.css :root[data-theme='dark'], brand.css dark
    block). Components read these through useTokens() so a window can be set in
    either theme without a second set of components. */
export type Tokens = {
  ink: string
  inkSoft: string
  inkFaint: string
  paper: string
  surface: string
  surface2: string
  line: string
  blue: string
  /** Primary button fill (styles.css .button.primary uses --cobalt-dark). */
  primary: string
  primaryPressed: string
  onAccent: string
  blueWash: string
  blueLine: string
  successInk: string
  metSoft: string
  metLine: string
  warningInk: string
  closeSoft: string
  closeLine: string
  infoInk: string
  infoWash: string
  infoLine: string
  errorInk: string
  errorWash: string
  shadow: string
  shadowHigh: string
}

export const LIGHT: Tokens = {
  ink: C.ink, inkSoft: C.inkSoft, inkFaint: C.inkFaint,
  paper: C.paper, surface: C.surface, surface2: C.surface2, line: C.line,
  blue: C.blue, primary: C.blue, primaryPressed: C.blueDeep, onAccent: '#ffffff',
  blueWash: C.blueWash, blueLine: '#d9dfff',
  successInk: C.successInk, metSoft: C.metSoft, metLine: '#c4eedd',
  warningInk: C.warningInk, closeSoft: C.closeSoft, closeLine: '#f1dfb8',
  infoInk: C.infoInk, infoWash: C.infoWash, infoLine: '#e2d6fb',
  errorInk: '#b42318', errorWash: '#fdeceb',
  shadow: SHADOW.lift, shadowHigh: SHADOW.liftHigh,
}

export const DARK: Tokens = {
  ink: C.darkInk, inkSoft: C.darkInkSoft, inkFaint: '#7f8d89',
  paper: C.darkPaper, surface: C.navy, surface2: C.darkSurface2, line: C.darkLine,
  blue: '#7384ff', primary: '#93a0ff', primaryPressed: '#7384ff', onAccent: C.darkPaper,
  blueWash: '#1a2340', blueLine: '#2c3a6b',
  successInk: '#58ddb0', metSoft: '#102b23', metLine: '#1d4a3b',
  warningInk: '#f0b74e', closeSoft: '#2e2312', closeLine: '#5a4420',
  infoInk: '#b79bff', infoWash: '#241c3d', infoLine: '#3d3166',
  errorInk: '#ff9b95', errorWash: '#35191b',
  shadow: '0 18px 60px rgb(0 0 0 / 0.3)', shadowHigh: '0 28px 80px rgb(0 0 0 / 0.5)',
}
