// Synthesises the film's music bed and its UI sound effects from nothing —
// no samples, no licences — so the promo can be published anywhere.
//
//   node scripts/soundtrack.mjs
//
// Writes public/audio/music.wav and public/audio/sfx/*.wav. The arrangement is
// laid on the same bar grid as the picture (src/timeline.json): dark and
// ticking under the chaos, an impact as the light floods in, then a bright
// D-major groove for the walkthrough, a build into the montage and a held
// chord under the end card.
//
// Pure JavaScript, one pass, a few seconds on an M1. Replace music.wav with a
// licensed track any time; the effects are independent of it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// Which film: `node scripts/soundtrack.mjs --film=admin` scores the operator film.
const FILM = process.argv.find((a) => a.startsWith('--film='))?.split('=')[1] ?? 'student'
const FILMS = {
  student: { timeline: 'src/timeline.json', music: 'music.wav' },
  admin: { timeline: 'src/admin/timeline.json', music: 'music-admin.wav' },
}
const timeline = JSON.parse(readFileSync(path.join(root, FILMS[FILM].timeline), 'utf8'))
const SR = 48000
const BEAT = 60 / timeline.bpm
const BAR = BEAT * timeline.beatsPerBar
const BARS = timeline.scenes.reduce((sum, scene) => sum + scene.bars, 0)
const TOTAL = BARS * BAR
const N = Math.ceil(TOTAL * SR)

/** Bar at which each scene starts. */
const AT = {}
{ let bar = 0; for (const scene of timeline.scenes) { AT[scene.id] = bar; bar += scene.bars } }

// What each part of the score does, by scene. Both films open dark, flood
// into 'brand', and close with 'montage' and 'outro'; between, the groove
// starts, gets busier, drops its drums for one bar, carries a counter-melody
// and lifts into the last feature.
const ROLES = {
  student: { groove: 'plan', busy: 'match', breath: 'check', melody: [['match', 'money'], ['radar', 'montage']], lift: 'radar' },
  admin: { groove: 'sources', busy: 'run', breath: 'agent', melody: [['extract', 'review'], ['ask', 'montage']], lift: 'ask' },
}[FILM]
Object.assign(AT, { groove: AT[ROLES.groove], busy: AT[ROLES.busy], breath: AT[ROLES.breath], lift: AT[ROLES.lift] })
const inMelody = (b) => ROLES.melody.some(([from, to]) => b >= AT[from] && b < AT[to])

// ------------------------------------------------------------------ helpers

const TAU = Math.PI * 2
const midi = (n) => 440 * 2 ** ((n - 69) / 12)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t

function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

class Bus {
  constructor(length = N) { this.L = new Float32Array(length); this.R = new Float32Array(length) }
  add(i, l, r = l) { if (i >= 0 && i < this.L.length) { this.L[i] += l; this.R[i] += r } }
}

/** Equal-power pan: -1 left … 1 right. */
const pan = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)]

/** RBJ biquad; coefficients can be re-set per block for sweeps. */
class Biquad {
  constructor(type, freq, q = 0.707) { this.type = type; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(freq, q) }
  set(freq, q = this.q) {
    this.q = q
    const w = TAU * clamp(freq, 10, SR * 0.45) / SR
    const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q)
    let b0, b1, b2
    const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha
    if (this.type === 'lp') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0 }
    else if (this.type === 'hp') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0 }
    else { b0 = alpha; b1 = 0; b2 = -alpha } // band-pass, 0 dB peak
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y
    return y
  }
}

/** Band-limited saw (polyBLEP), phase in [0, 1). */
function saw(phase, dt) {
  let v = 2 * phase - 1
  if (phase < dt) { const t = phase / dt; v -= t + t - t * t - 1 }
  else if (phase > 1 - dt) { const t = (phase - 1) / dt; v -= t * t + t + t + 1 }
  return v
}

const tri = (phase) => 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25))

/** Attack/decay/sustain/release envelope at time t for a note of length len. */
function adsr(t, len, a, d, s, r) {
  if (t < 0) return 0
  let v
  if (t < a) v = t / a
  else if (t < a + d) v = 1 - (1 - s) * ((t - a) / d)
  else v = s
  if (t > len) v *= Math.max(0, 1 - (t - len) / r)
  return v
}

// ------------------------------------------------------------------ reverb

/** Freeverb, the classic Schroeder–Moorer network, stereo. */
function reverb(input, { room = 0.86, damp = 0.35, wet = 1 } = {}) {
  const scale = SR / 44100
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => Math.round(n * scale))
  const alls = [556, 441, 341, 225].map((n) => Math.round(n * scale))
  const out = new Bus(input.L.length)
  for (const [ch, spread] of [['L', 0], ['R', Math.round(23 * scale)]]) {
    const x = input[ch]
    const y = out[ch]
    const cbufs = combs.map((n) => ({ b: new Float32Array(n + spread), i: 0, f: 0 }))
    const abufs = alls.map((n) => ({ b: new Float32Array(n + spread), i: 0 }))
    for (let i = 0; i < x.length; i++) {
      const s = x[i] * 0.015
      let acc = 0
      for (const c of cbufs) {
        const o = c.b[c.i]
        c.f = o * (1 - damp) + c.f * damp
        c.b[c.i] = s + c.f * room
        c.i = (c.i + 1) % c.b.length
        acc += o
      }
      for (const a of abufs) {
        const o = a.b[a.i]
        a.b[a.i] = acc + o * 0.5
        a.i = (a.i + 1) % a.b.length
        acc = o - acc
      }
      y[i] = acc * wet
    }
  }
  return out
}

/** Ping-pong delay. */
function delay(input, seconds, feedback = 0.38, mix = 0.5) {
  const n = Math.round(seconds * SR)
  const out = new Bus(input.L.length)
  const bl = new Float32Array(n), br = new Float32Array(n)
  let j = 0
  for (let i = 0; i < input.L.length; i++) {
    const dl = bl[j], dr = br[j]
    bl[j] = input.L[i] + dr * feedback
    br[j] = input.R[i] * 0.6 + dl * feedback
    out.L[i] = dl * mix
    out.R[i] = dr * mix
    j = (j + 1) % n
  }
  return out
}

// ------------------------------------------------------------------ instruments

/** Warm detuned-saw pad through a swept low-pass. */
function padChord(bus, notes, start, len, { cutoff = 1800, gain = 0.1, attack = 0.5, release = 1.4, sweepTo } = {}) {
  const s0 = Math.round(start * SR)
  const total = Math.round((len + release) * SR)
  notes.forEach((note, k) => {
    const f = midi(note)
    const detunes = [-0.12, 0, 0.11]
    const phases = detunes.map((_, i) => (k * 0.37 + i * 0.21) % 1)
    const [pl, pr] = pan((k / Math.max(1, notes.length - 1)) * 1.2 - 0.6)
    const lp = new Biquad('lp', cutoff, 0.8)
    for (let i = 0; i < total; i++) {
      const t = i / SR
      if (i % 64 === 0) lp.set(sweepTo ? lerp(cutoff, sweepTo, clamp(t / len, 0, 1)) : cutoff, 0.8)
      let v = 0
      detunes.forEach((cents, d) => {
        const fd = f * 2 ** (cents / 12)
        const dt = fd / SR
        phases[d] = (phases[d] + dt) % 1
        v += saw(phases[d], dt)
      })
      v = lp.run(v / 3 + Math.sin(TAU * f * 0.5 * t) * 0.25)
      const e = adsr(t, len, attack, 0.6, 0.85, release) * gain
      bus.add(s0 + i, v * e * pl, v * e * pr)
    }
  })
}

function pluck(bus, note, start, { gain = 0.16, decay = 0.22, pan: p = 0, bright = 3200 } = {}) {
  const f = midi(note)
  const s0 = Math.round(start * SR)
  const total = Math.round(decay * 6 * SR)
  const lp = new Biquad('lp', bright, 0.7)
  const [pl, pr] = pan(p)
  for (let i = 0; i < total; i++) {
    const t = i / SR
    const env = Math.exp(-t / decay) * Math.min(1, t / 0.003)
    const v = lp.run(tri((f * t) % 1) * 0.7 + Math.sin(TAU * f * 2 * t) * 0.25 * Math.exp(-t / (decay * 0.4)))
    bus.add(s0 + i, v * env * gain * pl, v * env * gain * pr)
  }
}

/** FM bell: bright, glassy, decays long. */
function bell(bus, note, start, { gain = 0.1, decay = 1.6, ratio = 3.5, index = 2.2, pan: p = 0 } = {}) {
  const f = midi(note)
  const s0 = Math.round(start * SR)
  const total = Math.round(decay * 4 * SR)
  const [pl, pr] = pan(p)
  for (let i = 0; i < total; i++) {
    const t = i / SR
    const env = Math.exp(-t / decay) * Math.min(1, t / 0.004)
    const mod = Math.sin(TAU * f * ratio * t) * index * Math.exp(-t / (decay * 0.35))
    const v = Math.sin(TAU * f * t + mod)
    bus.add(s0 + i, v * env * gain * pl, v * env * gain * pr)
  }
}

function bassNote(bus, note, start, len, gain = 0.22) {
  const f = midi(note)
  const s0 = Math.round(start * SR)
  const total = Math.round((len + 0.08) * SR)
  const lp = new Biquad('lp', 420, 0.9)
  let ph = 0
  for (let i = 0; i < total; i++) {
    const t = i / SR
    const dt = f / SR
    ph = (ph + dt) % 1
    const env = adsr(t, len, 0.006, 0.12, 0.7, 0.06)
    const v = Math.sin(TAU * f * t) * 0.75 + lp.run(saw(ph, dt)) * 0.35
    bus.add(s0 + i, v * env * gain)
  }
}

const kickNoise = rng(2024)
function kick(bus, start, gain = 0.6) {
  const s0 = Math.round(start * SR)
  const total = Math.round(0.45 * SR)
  let ph = 0
  for (let i = 0; i < total; i++) {
    const t = i / SR
    const f = 46 + 84 * Math.exp(-t / 0.035)
    ph += f / SR
    const body = Math.sin(TAU * ph) * Math.exp(-t / 0.18)
    const click = (kickNoise() * 2 - 1) * Math.exp(-t / 0.0025) * 0.25
    bus.add(s0 + i, (body + click) * gain)
  }
}

function noiseHit(bus, start, { len = 0.05, gain = 0.1, type = 'hp', freq = 8000, q = 0.7, p = 0, seed = 1, bursts = 1 } = {}) {
  const r = rng(seed)
  const s0 = Math.round(start * SR)
  const total = Math.round((len * 5 + bursts * 0.012) * SR)
  const f = new Biquad(type, freq, q)
  const [pl, pr] = pan(p)
  for (let i = 0; i < total; i++) {
    const t = i / SR
    let env = 0
    for (let b = 0; b < bursts; b++) {
      const tb = t - b * 0.011
      if (tb >= 0) env = Math.max(env, Math.exp(-tb / (b === bursts - 1 ? len : 0.006)))
    }
    const v = f.run(r() * 2 - 1) * env * gain
    bus.add(s0 + i, v * pl, v * pr)
  }
}

/** Filtered-noise riser with a climbing tone; ends on `end`. */
function riser(bus, start, end, gain = 0.12, seed = 7) {
  const r = rng(seed)
  const s0 = Math.round(start * SR)
  const total = Math.round((end - start) * SR)
  const bp = new Biquad('bp', 300, 1.2)
  let ph = 0
  for (let i = 0; i < total; i++) {
    const t = i / total
    if (i % 64 === 0) bp.set(300 * 2 ** (t * 4.3), 1.4)
    const amp = t ** 2.2
    ph += (180 * 2 ** (t * 2.2)) / SR
    const v = bp.run(r() * 2 - 1) * 1.6 + Math.sin(TAU * ph) * 0.18
    const wobble = 0.5 + 0.5 * Math.sin(t * 40)
    bus.add(s0 + i, v * amp * gain * (0.8 + 0.2 * wobble), v * amp * gain * (1 - 0.2 * wobble))
  }
}

function impact(bus, start, gain = 0.8, seed = 3) {
  const r = rng(seed)
  const s0 = Math.round(start * SR)
  const total = Math.round(2.2 * SR)
  const lp = new Biquad('lp', 900, 0.7)
  let ph = 0
  for (let i = 0; i < total; i++) {
    const t = i / SR
    ph += (34 + 40 * Math.exp(-t / 0.12)) / SR
    const sub = Math.sin(TAU * ph) * Math.exp(-t / 0.65)
    const air = lp.run(r() * 2 - 1) * Math.exp(-t / 0.22) * 0.6
    bus.add(s0 + i, (sub + air) * gain)
  }
}

// ------------------------------------------------------------------ the arrangement

function music() {
  const pad = new Bus(), bass = new Bus(), plk = new Bus(), drums = new Bus(), bells = new Bus(), fx = new Bus(), sends = new Bus()
  const bar = (b) => b * BAR

  // Chords, voiced in the pad's register. D – Bm – G – A: optimistic, open.
  const CH = {
    Bm: { pad: [47, 54, 57, 61, 62], root: 35, arp: [71, 74, 78, 81, 83, 81, 78, 74] },
    D: { pad: [50, 57, 61, 64, 66], root: 38, arp: [74, 78, 81, 85, 86, 85, 81, 78] },
    G: { pad: [43, 50, 54, 57, 59], root: 31, arp: [67, 71, 74, 78, 79, 78, 74, 71] },
    A: { pad: [45, 52, 59, 61, 64], root: 33, arp: [69, 73, 76, 80, 81, 80, 76, 73] },
  }
  const LOOP = ['D', 'Bm', 'G', 'A']
  const chordAt = (b) => LOOP[((b - AT.brand) % 4 + 4) % 4]

  // --- Chaos (bars 0–4): a dark B-minor drone opening up, a clock that speeds.
  padChord(pad, [35, 47, 50, 54, 57], 0, bar(AT.brand) - 0.05, { cutoff: 380, sweepTo: 2600, gain: 0.1, attack: 1.2, release: 0.05 })
  for (let i = 0; i < 8 * (AT.brand - 1); i++) {
    const t = bar(1) + i * BEAT / 2
    const fast = t > bar(3)
    noiseHit(drums, t, { len: 0.02, gain: 0.05 + 0.03 * (i / 24), freq: 9000, p: i % 2 ? 0.35 : -0.35, seed: 100 + i })
    if (fast) noiseHit(drums, t + BEAT / 4, { len: 0.015, gain: 0.04, freq: 10000, p: i % 2 ? -0.3 : 0.3, seed: 200 + i })
  }
  for (let b = 2; b < AT.brand; b++) for (let q = 0; q < 4; q++) kick(drums, bar(b) + q * BEAT, 0.16 + 0.05 * (b - 2))
  riser(fx, bar(AT.brand) - 2.6, bar(AT.brand) - 0.04, 0.16)

  // --- The light (bar 4): impact and a shimmer in D major.
  impact(fx, bar(AT.brand), 0.9)
  ;[74, 78, 81, 86].forEach((n, i) => bell(bells, n, bar(AT.brand) + 0.02 + i * 0.05, { gain: 0.07, decay: 2.4, pan: (i - 1.5) * 0.4 }))

  // --- Brand (bars 4–8): the progression, airy, an 8th-note pluck from bar 5.
  for (let b = AT.brand; b < AT.groove; b++) {
    const c = CH[chordAt(b)]
    padChord(pad, c.pad, bar(b), BAR, { cutoff: 3200, gain: 0.09, attack: 0.35, release: 0.9 })
    bassNote(bass, c.root, bar(b), BAR - 0.1, 0.16)
    if (b > AT.brand) c.arp.forEach((n, k) => pluck(plk, n, bar(b) + k * BEAT / 2, { gain: 0.13, decay: 0.22, pan: (k % 2 ? 0.4 : -0.4) }))
  }
  riser(fx, bar(AT.groove) - 1.5, bar(AT.groove) - 0.02, 0.08, 11)

  // --- Walkthrough (bars 8–36): the groove.
  const end = AT.montage
  for (let b = AT.groove; b < end; b++) {
    const c = CH[chordAt(b)]
    const breath = b === AT.breath // one bar with the drums out
    padChord(pad, c.pad, bar(b), BAR, { cutoff: 3800, gain: 0.07, attack: 0.25, release: 0.7 })
    // Bass: root on the beat, octave answer on the off-beats.
    for (let e = 0; e < 8; e++) {
      const note = e % 2 ? c.root + 12 : c.root
      if (breath && e > 0) continue
      bassNote(bass, note, bar(b) + e * BEAT / 2, BEAT / 2 - 0.04, e % 2 ? 0.08 : 0.13)
    }
    // Pluck: 16ths, arpeggiating the chord.
    for (let k = 0; k < 16; k++) {
      const n = c.arp[k % 8] + (k >= 8 && b % 2 ? 12 : 0)
      pluck(plk, n, bar(b) + k * BEAT / 4, { gain: k % 4 === 0 ? 0.15 : 0.1, decay: 0.16, pan: Math.sin(k * 0.9) * 0.6, bright: 4200 })
    }
    if (!breath) {
      kick(drums, bar(b), 0.38)
      kick(drums, bar(b) + 2 * BEAT, 0.34)
      if (b % 2) kick(drums, bar(b) + 2.75 * BEAT, 0.2)
      for (const beat of [1, 3]) noiseHit(drums, bar(b) + beat * BEAT, { type: 'bp', freq: 1700, q: 0.9, len: 0.12, gain: 0.24, bursts: 3, seed: b * 10 + beat })
    }
    const hats = b >= AT.busy ? 16 : 8
    for (let h = 0; h < hats; h++) {
      const t = bar(b) + h * (BAR / hats) + (h % 2 ? 0.012 : 0)
      noiseHit(drums, t, { len: 0.02, gain: (h % (hats / 4) === hats / 8 ? 0.11 : 0.065) * (breath ? 0.6 : 1), freq: 8000, p: h % 2 ? 0.3 : -0.2, seed: b * 100 + h })
    }
    if (b % 2 && !breath) noiseHit(drums, bar(b) + 3.5 * BEAT, { len: 0.2, gain: 0.08, freq: 7000, seed: b + 999 })
    // A counter-melody in the middle stretch and under the Radar.
    if (inMelody(b)) {
      const motif = { D: [[78, 0], [76, 2]], Bm: [[74, 0]], G: [[71, 0], [74, 2]], A: [[73, 0], [76, 3]] }[chordAt(b)]
      motif.forEach(([n, beat]) => bell(bells, n, bar(b) + beat * BEAT, { gain: 0.07, decay: 1.2, pan: 0.25 }))
    }
  }
  // A lift into the Radar.
  riser(fx, bar(AT.lift) - 1, bar(AT.lift) - 0.02, 0.06, 21)

  // --- Montage (bars 36–39): build.
  for (let b = AT.montage; b < AT.outro; b++) {
    const c = CH[chordAt(b)]
    padChord(pad, c.pad, bar(b), BAR, { cutoff: 3200, gain: 0.075, attack: 0.15, release: 0.5 })
    for (let e = 0; e < 8; e++) bassNote(bass, e % 2 ? c.root + 12 : c.root, bar(b) + e * BEAT / 2, BEAT / 2 - 0.04, 0.12)
    for (let k = 0; k < 16; k++) pluck(plk, c.arp[k % 8] + 12 * (k % 2), bar(b) + k * BEAT / 4, { gain: 0.11, decay: 0.15, pan: Math.sin(k) * 0.6, bright: 4800 })
    for (let q = 0; q < 4; q++) kick(drums, bar(b) + q * BEAT, 0.34)
    const claps = b === AT.outro - 1 ? [0, 1, 2, 3, 3.5] : [1, 3]
    claps.forEach((beat) => noiseHit(drums, bar(b) + beat * BEAT, { type: 'bp', freq: 1700, q: 0.9, len: 0.12, gain: 0.22, bursts: 3, seed: b * 7 + beat * 3 }))
    for (let h = 0; h < 16; h++) noiseHit(drums, bar(b) + h * BEAT / 4, { len: 0.018, gain: 0.08, freq: 8500, p: h % 2 ? 0.35 : -0.35, seed: b * 50 + h })
  }
  riser(fx, bar(AT.outro) - 2.2, bar(AT.outro) - 0.05, 0.13, 31)

  // --- Outro (bars 39–43): impact, then one long D major chord.
  impact(fx, bar(AT.outro), 0.7, 9)
  padChord(pad, CH.D.pad.concat([69, 74]), bar(AT.outro), BAR * 3.2, { cutoff: 2400, gain: 0.08, attack: 0.05, release: 1.6 })
  bassNote(bass, CH.D.root, bar(AT.outro), BAR * 2.5, 0.2)
  ;[74, 78, 81, 85, 86, 90].forEach((n, i) => pluck(plk, n, bar(AT.outro) + 0.02 + i * BEAT / 2, { gain: 0.09, decay: 0.5, pan: (i - 2.5) * 0.25 }))
  ;[[86, 0.6], [81, 2.6], [78, 4.6]].forEach(([n, t]) => bell(bells, n, bar(AT.outro) + t, { gain: 0.05, decay: 2.2, pan: -0.2 }))

  // --- Sidechain: pad and bass breathe with the kick.
  const duck = new Float32Array(N).fill(1)
  const kicks = []
  for (let b = AT.groove; b < AT.outro; b++) {
    if (b === AT.breath) continue
    const beats = b >= AT.montage ? [0, 1, 2, 3] : [0, 2]
    beats.forEach((q) => kicks.push(bar(b) + q * BEAT))
  }
  for (const k of kicks) {
    const s0 = Math.round(k * SR)
    for (let i = 0; i < 0.3 * SR; i++) {
      const v = 1 - 0.45 * Math.exp(-i / SR / 0.09)
      if (s0 + i < N) duck[s0 + i] = Math.min(duck[s0 + i], v)
    }
  }
  for (let i = 0; i < N; i++) { pad.L[i] *= duck[i]; pad.R[i] *= duck[i]; bass.L[i] *= duck[i]; bass.R[i] *= duck[i] }

  // --- Space: delay on the pluck, one shared hall for everything airy.
  const echoes = delay(plk, BEAT * 0.75, 0.35, 0.35)
  for (let i = 0; i < N; i++) {
    sends.L[i] = pad.L[i] * 0.5 + plk.L[i] * 0.6 + echoes.L[i] * 0.5 + bells.L[i] * 0.9 + fx.L[i] * 0.4 + drums.L[i] * 0.08
    sends.R[i] = pad.R[i] * 0.5 + plk.R[i] * 0.6 + echoes.R[i] * 0.5 + bells.R[i] * 0.9 + fx.R[i] * 0.4 + drums.R[i] * 0.08
  }
  const hall = reverb(sends, { room: 0.88, damp: 0.3 })

  // --- Mix and master.
  const mix = new Bus()
  const hp = [new Biquad('hp', 32), new Biquad('hp', 32)]
  const air = [new Biquad('hp', 5500), new Biquad('hp', 5500)]
  for (let i = 0; i < N; i++) {
    for (const [c, ch] of [[0, 'L'], [1, 'R']]) {
      let v = pad[ch][i] * 0.95 + bass[ch][i] * 0.7 + plk[ch][i] * 1.1 + echoes[ch][i] * 0.7 + drums[ch][i] * 0.85 + bells[ch][i] * 0.85 + fx[ch][i] * 0.7 + hall[ch][i] * 0.6
      v = hp[c].run(v)
      v += air[c].run(v) * 0.35 // a gentle high shelf: brightness without harshness
      mix[ch][i] = v
    }
  }
  // The beat of silence before the light, then a gentle fade at the very end.
  const gap = [Math.round((bar(AT.brand) - 0.07) * SR), Math.round(bar(AT.brand) * SR)]
  for (let i = gap[0]; i < gap[1]; i++) { const k = 0.08; mix.L[i] *= k; mix.R[i] *= k }
  const fadeFrom = Math.round((TOTAL - 1.4) * SR)
  for (let i = fadeFrom; i < N; i++) { const k = 1 - (i - fadeFrom) / (N - fadeFrom); mix.L[i] *= k * k; mix.R[i] *= k * k }

  return limit(mix, { rmsTarget: -15.5, from: bar(AT.groove), to: bar(AT.montage), ceiling: -1.5 })
}

/** Make up to a target loudness over the groove, then a look-ahead peak limiter
    so impacts are caught rather than setting the level of everything else. */
function limit(bus, { rmsTarget, from, to, ceiling }) {
  const a = Math.round(from * SR), b = Math.round(to * SR)
  let sum = 0
  for (let i = a; i < b; i++) sum += bus.L[i] ** 2 + bus.R[i] ** 2
  const rms = Math.sqrt(sum / ((b - a) * 2))
  const makeup = 10 ** (rmsTarget / 20) / rms
  const ceil = 10 ** (ceiling / 20)
  const n = bus.L.length
  const want = new Float32Array(n)
  for (let i = 0; i < n; i++) want[i] = Math.min(1, ceil / Math.max(1e-9, Math.abs(bus.L[i] * makeup), Math.abs(bus.R[i] * makeup)))
  // Sliding-window minimum over the look-ahead, O(n) with a deque.
  const look = Math.round(0.005 * SR)
  const ahead = new Float32Array(n)
  const dq = new Int32Array(n)
  let head = 0, tail = 0
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && want[dq[tail - 1]] >= want[i]) tail--
    dq[tail++] = i
    while (dq[head] > i + look) head++
    ahead[i] = want[dq[head]]
  }
  const release = 1 - Math.exp(-1 / (0.12 * SR))
  let g = 1
  for (let i = 0; i < n; i++) {
    g = ahead[i] < g ? ahead[i] : g + (ahead[i] - g) * release
    bus.L[i] *= makeup * g
    bus.R[i] *= makeup * g
  }
  return bus
}

/** Soft-knee saturation, then normalise the peak. */
function master(bus, peak) {
  let max = 0
  for (const ch of ['L', 'R']) for (let i = 0; i < bus[ch].length; i++) {
    const v = Math.tanh(bus[ch][i] * 1.4) / 1.4
    bus[ch][i] = v
    max = Math.max(max, Math.abs(v))
  }
  const g = max > 0 ? peak / max : 1
  for (const ch of ['L', 'R']) for (let i = 0; i < bus[ch].length; i++) bus[ch][i] *= g
  return bus
}

// ------------------------------------------------------------------ sound effects

function sfx() {
  const make = (seconds) => new Bus(Math.round(seconds * SR))
  const out = {}

  // A crisp UI click: a tiny tick and a short high blip.
  out.click = (() => {
    const b = make(0.12)
    noiseHit(b, 0, { len: 0.004, gain: 0.5, type: 'bp', freq: 3500, q: 1.2, seed: 4 })
    for (let i = 0; i < 0.03 * SR; i++) { const t = i / SR; b.add(i, Math.sin(TAU * 2100 * t) * Math.exp(-t / 0.008) * 0.25) }
    return b
  })()

  // A soft pop for bubbles and cards: a falling sine.
  const popAt = (startHz, endHz, gain, len = 0.09) => {
    const b = make(len + 0.1)
    let ph = 0
    for (let i = 0; i < (len + 0.05) * SR; i++) {
      const t = i / SR
      ph += lerp(startHz, endHz, Math.min(1, t / len)) / SR
      b.add(i, Math.sin(TAU * ph) * Math.exp(-t / (len * 0.45)) * Math.min(1, t / 0.002) * gain)
    }
    return b
  }
  out.pop = popAt(880, 420, 0.5)
  out['pop-hi'] = popAt(1300, 700, 0.45, 0.07)
  out['pop-low'] = popAt(520, 260, 0.55, 0.11)

  // Keystrokes: a single tick, and a run of them for typing.
  out.typing = (() => {
    const b = make(3.2)
    const r = rng(77)
    let t = 0.01
    while (t < 3.0) {
      noiseHit(b, t, { len: 0.006 + r() * 0.004, gain: 0.28 + r() * 0.18, type: 'bp', freq: 2600 + r() * 1800, q: 1.5, seed: Math.floor(r() * 1e6) })
      t += 0.055 + r() * 0.06
    }
    return b
  })()

  // Air moving: band-passed noise swept up and back, panning across.
  const whoosh = (len, gain, lo, hi, seed) => {
    const b = make(len + 0.2)
    const r = rng(seed)
    const bp = new Biquad('bp', lo, 0.9)
    const total = Math.round(len * SR)
    for (let i = 0; i < total; i++) {
      const t = i / total
      const shape = Math.sin(Math.PI * t) ** 1.6
      if (i % 64 === 0) bp.set(lo * (hi / lo) ** Math.sin(Math.PI * t * 0.85), 0.9)
      const v = bp.run(r() * 2 - 1) * shape * gain * 2.2
      const [pl, pr] = pan(lerp(-0.6, 0.6, t))
      b.add(i, v * pl, v * pr)
    }
    return b
  }
  out.whoosh = whoosh(0.75, 0.55, 250, 3800, 5)
  out['whoosh-soft'] = whoosh(0.5, 0.35, 400, 2600, 6)

  // A felt-tip highlighter stroke.
  out.highlight = (() => {
    const b = make(0.5)
    const r = rng(12)
    const bp = new Biquad('bp', 1800, 2)
    const total = Math.round(0.36 * SR)
    for (let i = 0; i < total; i++) {
      const t = i / total
      if (i % 64 === 0) bp.set(1800 + 2600 * t, 2)
      b.add(i, bp.run(r() * 2 - 1) * Math.sin(Math.PI * t) * 0.5)
    }
    return b
  })()

  // A thread drawing: a rising glassy glide.
  out.thread = (() => {
    const b = make(0.9)
    let ph = 0
    for (let i = 0; i < 0.7 * SR; i++) {
      const t = i / SR
      ph += (600 * 2 ** (t * 2.4)) / SR
      const env = Math.sin(Math.PI * Math.min(1, t / 0.7)) ** 1.5
      b.add(i, (Math.sin(TAU * ph) * 0.6 + Math.sin(TAU * ph * 2.01) * 0.25) * env * 0.16)
    }
    noiseHit(b, 0, { len: 0.25, gain: 0.08, freq: 6000, seed: 13 })
    return b
  })()

  // Bells: notification, success and a sparkle.
  const bells = (notes, gap, seconds, gain, decay) => {
    const b = make(seconds)
    notes.forEach((n, i) => bell(b, n, i * gap, { gain, decay, ratio: 3.5, index: 1.6, pan: (i - (notes.length - 1) / 2) * 0.3 }))
    return b
  }
  out.notify = bells([81, 88], 0.11, 1.8, 0.28, 0.45)
  out.success = bells([84, 88, 91], 0.07, 1.4, 0.22, 0.3)
  out.shimmer = bells([86, 90, 93, 98, 102], 0.06, 2.6, 0.12, 0.7)
  out.alert = bells([76, 72], 0.12, 1.4, 0.26, 0.35)

  // Money counting up: a quick run of soft ticks that slows as it lands.
  out.count = (() => {
    const b = make(1.6)
    let t = 0
    let k = 0
    while (t < 1.35) {
      noiseHit(b, t, { len: 0.004, gain: 0.22, type: 'bp', freq: 4200 - k * 30, q: 2, seed: 300 + k })
      t += 0.03 + (t / 1.35) ** 2 * 0.09
      k++
    }
    return b
  })()

  // A rising pull, for the moment everything is drawn into one point.
  out.gather = (() => {
    const b = make(2.0)
    riser(b, 0, 1.9, 0.5, 41)
    return b
  })()

  for (const bus of Object.values(out)) master(bus, 0.85)
  return out
}

// ------------------------------------------------------------------ output

function writeWav(file, bus) {
  const n = bus.L.length
  const buf = Buffer.alloc(44 + n * 4)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(clamp(bus.L[i], -1, 1) * 32767), 44 + i * 4)
    buf.writeInt16LE(Math.round(clamp(bus.R[i], -1, 1) * 32767), 46 + i * 4)
  }
  writeFileSync(file, buf)
}

function stats(name, bus) {
  let peak = 0, sum = 0
  for (let i = 0; i < bus.L.length; i++) { peak = Math.max(peak, Math.abs(bus.L[i]), Math.abs(bus.R[i])); sum += bus.L[i] ** 2 + bus.R[i] ** 2 }
  const rms = Math.sqrt(sum / (bus.L.length * 2))
  console.log(`${name.padEnd(14)} ${(bus.L.length / SR).toFixed(2).padStart(6)}s  peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS  rms ${(20 * Math.log10(rms)).toFixed(1)} dBFS`)
}

const audioDir = path.join(root, 'public', 'audio')
mkdirSync(path.join(audioDir, 'sfx'), { recursive: true })
const started = performance.now()
const bed = music()
writeWav(path.join(audioDir, FILMS[FILM].music), bed)
stats('music', bed)
// The effects library is shared; only the student run (the default) rewrites it.
for (const [name, bus] of FILM === 'student' ? Object.entries(sfx()) : []) {
  writeWav(path.join(audioDir, 'sfx', `${name}.wav`), bus)
  stats(name, bus)
}
console.log(`done in ${((performance.now() - started) / 1000).toFixed(1)}s`)
