# Scrapal promo films

Two narrated films share this Remotion project, its brand system, logo, motion language and
sound design:

| Composition | Length | Audience | Story |
|---|---|---|---|
| `ScrapalPromo` | 1:52 | students and researchers | Amara, from a hundred open tabs to an application pack |
| `ScrapalAdmin` | 1:56 | universities, agencies, operators | one number, the £17,500 fee Amara saw, traced back through the operator console |

## The student film

A 1:52, 1920×1080, 60 fps narrated product film built with [Remotion](https://www.remotion.dev)
on the Scrapal brand system v1.1. It follows one student, Amara, from a hundred open tabs to an
application pack. Everything in it is code: the logo animates from the master artwork's own
paths, the app is rebuilt from the product's tokens and copy, the narration is generated locally
with Kokoro-82M (Apache-2.0), and the music and sound effects are synthesised by a script.
Nothing is licensed from anyone else, so the output can be published anywhere.

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | Chaos | A hundred tabs, numbers that disagree, advice nobody can check |
| 0:10 | Brand | Light floods in, the S mark draws itself, *Discover People. Opportunities.* |
| 0:20 | Plan | Meet Amara; the chat-first planner fills her plan and returns a shortlist |
| 0:34 | Match | One verdict per requirement, the gap named, no mystery score |
| 0:44 | Evidence | Every figure opens onto the page and wording it was read from |
| 0:54 | Money | The whole degree added up against her budget, the gap named |
| 1:04 | Check · Watch | Her agent's claim checked against the published page; a deadline that moved |
| 1:14 | Apply | Every document the university asks for, and a statement that never invents |
| 1:26 | Research radar | The writing stays on the device; only its topics cross to the search |
| 1:38 | Montage | All eight features on one thread |
| 1:44 | End card | *Scrapal. Knowledge opens doors.*, a call to action |

## The operator film

`ScrapalAdmin` follows the same fictional fee from a university's web page to a cited answer. The
console window is drawn in the product's dark theme on the light stage.

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | Opening | University pages misbehave on cue: they move, 404, and quietly change a fee |
| 0:12 | Brand | The mark draws; *Every fact. Every source. Every decision, on record.* |
| 0:22 | Sources | Add source → crawl blueprint: sample, projected coverage, scope, *Approve scope & start* |
| 0:36 | Runs | The run path completes stage by stage; the durable crawler events behind the counts |
| 0:46 | Course intelligence | Typed facts, each wired by a thread to the sentence it was read from |
| 0:58 | Review | What changed since the last publish; Publish, with Undo |
| 1:08 | Agent proposals | Reasons and risk; nothing runs until a person approves; the decision log |
| 1:18 | Retrieval Lab | Three lanes fused (RRF), sentences emitted or withheld, then the same fact in the student app |
| 1:30 | Observability | An incident pinned to stage, page, worker and trace; models running locally |
| 1:42 | Montage, end card | Crawl → extract → evidence → review → publish → index → retrieve → answer |

Its files live in `src/admin/`: `timeline.json`, `vo/script.json` (narration), `data.ts` (what is
on screen), `Console.tsx` (the walkthrough stage) and `scenes/`. The end card defaults to
"Request a demo"; change it with `--props='{"cta":"…","url":"…"}'` on render.

```bash
npm run render:admin                              # → out/scrapal-admin.mp4 (~9 min on the M1)
npm run voice:admin                               # regenerate its narration
npm run render:admin:audio && npm run remux:admin # re-mix sound only (~2 min)
node scripts/stills.mjs --comp=ScrapalAdmin 40s   # check a frame
```

## Run it

```bash
cd promo
npm install
npm run studio          # live preview and scrubbing in the browser
npm run render          # → out/scrapal-promo.mp4 (full quality, ~8 min on the M1)
npm run subtitles       # → .srt and .vtt for both films, for upload beside the videos
```

Changed only the sound (a voice line, an effect's volume, the music)? Skip the picture:
`npm run render:audio && npm run remux` re-mixes in about two minutes and swaps the new audio
into the existing MP4.

`npm run render:draft` renders at half size in a few minutes, for checking timing.
`node scripts/stills.mjs 12s 40s 75s` renders single frames to `out/stills/` with one bundle.

### On an 8 GB M1

`remotion.config.ts` is already tuned for it: two frames render in parallel and the output is
H.264 at CRF 16 (visually lossless for flat UI colour) in BT.709. A full render took 8½ minutes
on the M1 Air; a half-size draft about 3½. Close Chrome and other heavy apps first, because swapping slows the render far more
than anything in the film does. On a bigger machine, raise `Config.setConcurrency`.

## Change it

- **End card text:** without touching code,
  `npx remotion render ScrapalPromo out/scrapal-promo.mp4 --props='{"cta":"Join the beta","url":"example.com"}'`.
  An empty `url` is hidden.
- **Scene lengths:** `src/timeline.json`, in bars of the music (one bar = 2 s). Re-run
  `npm run audio` after changing it so the music follows.
- **Brand values:** `src/theme.ts` mirrors `console/src/brand.css`. Change the brand there first.
- **What appears on screen:** `src/data.ts`. Universities, people and programmes are fictional on
  purpose, so the film never implies an endorsement nobody gave.
- **Logo:** `src/brand/logo-data.ts` is generated from `public/brand/scrapal-logo.svg` by
  `node scripts/extract-logo.mjs`. Edit the SVG, never the generated file.

## Narration

The script is `src/vo/script.json`: one sentence per entry, each placed at `at` seconds into its
scene. Scenes key their beats to the lines (`vo('plan.asks')`), so the picture follows the voice.
If a line runs into the next one or past its scene, the film refuses to render and names the line.

```bash
python3.13 -m venv tts/.venv && tts/.venv/bin/pip install -r tts/requirements.txt   # once
# model files, once (~340 MB) — from github.com/thewh1teagle/kokoro-onnx releases, tag model-files-v1.0:
#   tts/models/kokoro-v1.0.onnx, tts/models/voices-v1.0.bin
npm run voice                          # every line → public/audio/vo/, lengths → src/vo/durations.json
npm run voice -- plan.meet money.gap   # just these
```

To re-word a line, edit its `text` (or `say`, where the spoken form differs from the caption,
such as numbers), run `npm run voice -- <id>`, then `npm run subtitles`. To change the narrator,
set `voice` (`af_heart`, `am_michael`, `bf_emma`, `bm_george`, …) and regenerate. To use a human
recording, replace the WAVs in `public/audio/vo/` with one file per line and update their lengths
in `durations.json`.

The music dips about 10 dB under every line and returns in the gaps (`src/components/Voiceover.tsx`).
The finished mix measures −15 LUFS integrated with a true peak under −1 dBTP.

## Sound

`npm run audio` (`scripts/soundtrack.mjs`) writes `public/audio/music.wav`,
`public/audio/music-admin.wav` and `public/audio/sfx/*.wav` in about twenty seconds. Each film's
score follows its own scene grid through a small role map at the top of the script. The music follows the scene grid: a ticking
B-minor drone under the chaos, an impact as the light comes up, a D-major groove through the
walkthrough, a build into the montage and a held chord under the end card.

To use a licensed track instead, replace `public/audio/music.wav` with any file at least as long as the film.
For the cuts to land, it should be 120 BPM with the downbeat at 0:00. The film is 1:52. Its volume is set in
`src/Promo.tsx`. The sound effects stay as they are.

## Layout

```
src/
  Promo.tsx            the student film: scenes on the bar grid, backgrounds, narration, music
  admin/               the operator film (AdminFilm.tsx, Console.tsx, scenes/, vo/, data.ts)
  timeline.json/.ts    one clock for picture and sound
  vo/                  script.json (the narration), durations.json, vo() for scenes to sync to
  theme.ts, anim.ts    brand tokens; the motion language (--sc-ease, springs)
  brand/Logo.tsx       the animated mark, from the master artwork's geometry
  components/          AppWindow (the student app's chrome), Caption, Thread,
                       Cursor, Sfx, UI primitives
  scenes/              Chaos, Brand, Product (+ product/*: Plan, CoursePage, Money, Check,
                       Apply, Radar), Montage, Outro
tts/
  generate.py          narration lines with Kokoro, trimmed and levelled
scripts/
  soundtrack.mjs       music and sound effects
  extract-logo.mjs     logo geometry from the SVG
  stills.mjs           render chosen frames
  subtitles.mjs        .srt / .vtt from the narration placements
```
