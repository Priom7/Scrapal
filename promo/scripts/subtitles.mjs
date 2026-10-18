// Writes subtitles for the narration, from the same placements the film uses.
//
//   node scripts/subtitles.mjs               → out/scrapal-promo.srt and .vtt
//   node scripts/subtitles.mjs --film=admin  → out/scrapal-admin.srt and .vtt
//
// Upload the .srt next to the video (YouTube, LinkedIn, X all accept it) so the
// film reads with the sound off, which is how most people first meet it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'))
const FILM = process.argv.find((a) => a.startsWith('--film='))?.split('=')[1] ?? 'student'
const paths = {
  student: { timeline: 'src/timeline.json', vo: 'src/vo', out: 'scrapal-promo' },
  admin: { timeline: 'src/admin/timeline.json', vo: 'src/admin/vo', out: 'scrapal-admin' },
}[FILM]
const timeline = read(paths.timeline)
const script = read(`${paths.vo}/script.json`)
const durations = read(`${paths.vo}/durations.json`)

const bar = (60 / timeline.bpm) * timeline.beatsPerBar
const sceneStart = {}
let at = 0
for (const scene of timeline.scenes) { sceneStart[scene.id] = at; at += scene.bars * bar }

// Keep each caption on screen a touch longer than the voice, never into the next.
const cues = script.lines.map((line) => ({ start: sceneStart[line.scene] + line.at, end: sceneStart[line.scene] + line.at + durations[line.id], text: line.text }))
cues.forEach((cue, i) => { cue.end = Math.min(cue.end + 0.35, cues[i + 1] ? cues[i + 1].start - 0.05 : cue.end + 0.35) })

const stamp = (t, sep) => {
  const ms = Math.round(t * 1000)
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0')
  const sec = String(Math.floor(ms / 1000) % 60).padStart(2, '0')
  return `${h}:${m}:${sec}${sep}${String(ms % 1000).padStart(3, '0')}`
}

// Two balanced lines at most, ~42 characters each, as broadcast captions are set.
const wrap = (text) => {
  if (text.length <= 42) return text
  const words = text.split(' ')
  let best = text, score = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ')
    const s = Math.abs(a.length - b.length)
    if (s < score && a.length <= 46 && b.length <= 46) { best = `${a}\n${b}`; score = s }
  }
  return best
}

mkdirSync(path.join(root, 'out'), { recursive: true })
const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${wrap(c.text)}\n`).join('\n')
const vtt = 'WEBVTT\n\n' + cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${wrap(c.text)}\n`).join('\n')
writeFileSync(path.join(root, 'out', `${paths.out}.srt`), srt)
writeFileSync(path.join(root, 'out', `${paths.out}.vtt`), vtt)
console.log(`${cues.length} captions → out/${paths.out}.srt, out/${paths.out}.vtt`)
