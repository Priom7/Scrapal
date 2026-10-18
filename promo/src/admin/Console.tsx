// 0:22–1:38 — the operator console, following one number. One console window
// (in the product's dark theme) stays on screen while its pages change, with
// captions on the left in the banner pattern. At the end of the Ask beat the
// student's view of the same fact rises beside it, wired by a thread: the
// whole point of the engine room, in one picture.
import {
  Activity, ExternalLink, Globe, Globe2, GraduationCap, Network, ShieldCheck, Sparkles, UserCheck,
} from 'lucide-react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { exit, glide, progress, settle } from '../anim'
import { Beat } from '../components/Beat'
import { AppWindow, WINDOW, type Page } from '../components/AppWindow'
import { Caption } from '../components/Caption'
import { Cues } from '../components/Sfx'
import { Thread } from '../components/Thread'
import { ThemeScope } from '../components/tokens'
import { Avatar } from '../components/ui'
import { COURSE, PERSONA } from '../data'
import { FPS, s } from '../timeline'
import { C, DARK, FONT, LIGHT, R } from '../theme'
import { scene, vo } from './film'
import { Agent, agentCues } from './scenes/Agent'
import { Ask, askCues, EMITTED_ANCHOR } from './scenes/Ask'
import { Extract, extractCues } from './scenes/Extract'
import { Review, reviewCues } from './scenes/Review'
import { Run, runCues } from './scenes/Run'
import { SOURCES_CUES, Sources } from './scenes/Sources'
import { LOCAL_AT, Watch, watchCues } from './scenes/Watch'
import { consoleShell } from './shell'

const start = scene('sources').from
const AT = {
  sources: 0,
  run: scene('run').from - start,
  extract: scene('extract').from - start,
  review: scene('review').from - start,
  agent: scene('agent').from - start,
  ask: scene('ask').from - start,
  watch: scene('watch').from - start,
  end: scene('watch').from + scene('watch').duration - start,
}

const PAGES: Page[] = [
  { at: AT.sources, nav: 'sources', title: 'Connected sources' },
  { at: AT.run, nav: 'overview', title: 'Follow the knowledge thread' },
  { at: AT.extract, nav: 'course-intelligence', title: 'Turn course pages into trusted facts' },
  { at: AT.review, nav: 'course-intelligence', title: 'Turn course pages into trusted facts' },
  { at: AT.agent, nav: 'reviews', title: 'Decisions waiting for you' },
  { at: AT.ask, nav: 'retrieval-lab', title: 'Trace an answer back to evidence' },
  { at: AT.watch, nav: 'observability', title: 'See where every crawl spends its time' },
]

/** When the student's view takes the left of the stage, in stage frames. */
const ECHO_AT = AT.ask + vo('ask.student', -0.25)

const CAPTIONS = [
  { from: AT.sources, to: AT.run, kicker: 'Sources', icon: Globe2, lines: ['Approve the plan', 'before the crawl.'], highlight: 'before the crawl.', support: 'Scrapal samples a site, projects what it will find, and waits for your sign-off.' },
  { from: AT.run, to: AT.extract, kicker: 'Runs', icon: Activity, lines: ['Every page', 'leaves a trail.'], highlight: 'leaves a trail.', support: 'Discovered, fetched, extracted and saved, counted from durable crawler events.' },
  { from: AT.extract, to: AT.review, kicker: 'Course intelligence', icon: GraduationCap, lines: ['Pages become', 'facts with proof.'], highlight: 'facts with proof.', support: 'Typed fields, each pinned to the exact excerpt that supports it.' },
  { from: AT.review, to: AT.agent, kicker: 'Review', icon: UserCheck, lines: ['A person decides', 'what goes live.'], highlight: 'what goes live.', support: 'See exactly what changed since the last publish. Publish, reject, or undo.' },
  { from: AT.agent, to: AT.ask, kicker: 'Agent proposals', icon: ShieldCheck, lines: ['AI suggests.', 'You decide.'], highlight: 'You decide.', support: 'Every action carries its reason and its risk. Nothing runs without a decision.' },
  { from: AT.ask, to: ECHO_AT, kicker: 'Ask Scrapal', icon: Sparkles, lines: ['Answers with', 'receipts.'], highlight: 'receipts.', support: 'Three retrieval lanes, fused, then checked sentence by sentence. Unsupported claims are withheld.' },
  { from: AT.watch, to: AT.end, kicker: 'Observability', icon: Network, lines: ['Find what broke.', 'Run it locally.'], highlight: 'Run it locally.', support: 'Every failure keeps its stage, page, worker and trace. The models run on your own hardware.' },
]

const WINDOW_X = 740
const WINDOW_Y = 140

export function Console() {
  const frame = useCurrentFrame()
  const enter = settle(frame, 0, s(1.1))
  const leave = progress(frame, AT.end - s(0.75), s(0.75), exit)
  const float = Math.sin((frame / FPS) * 0.7) * 4
  const localGlow = frame >= AT.watch ? progress(frame, AT.watch + LOCAL_AT(), s(0.5)) * (1 - progress(frame, AT.end - s(1.2), s(0.6))) : 0

  return <AbsoluteFill style={{ fontFamily: FONT }}>
    {CAPTIONS.map((caption, index) => {
      if (frame < caption.from - 2 || frame > caption.to + 4) return null
      return <div key={index} style={{ position: 'absolute', left: 120, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
        <Caption frame={frame} inAt={caption.from + (index === 0 ? s(0.35) : 6)} outAt={caption.to - 18}
          kicker={caption.kicker} icon={caption.icon} lines={caption.lines} highlight={caption.highlight} support={caption.support} size={70} width={560} />
      </div>
    })}

    <div style={{ position: 'absolute', left: WINDOW_X, top: WINDOW_Y, perspective: 2400 }}>
      <div style={{
        transformOrigin: '50% 100%',
        transform: [
          `translate3d(${leave * -250}px, ${(1 - enter) * 160 + float * (1 - leave)}px, 0)`,
          `rotateX(${(1 - enter) * 16}deg)`,
          `scale(${(0.9 + 0.1 * enter) * (1 - leave * 0.25)})`,
        ].join(' '),
        opacity: Math.min(1, enter * 1.6) * (1 - leave),
      }}>
        <ThemeScope tokens={DARK}>
          <AppWindow frame={frame} pages={PAGES} shell={consoleShell(localGlow)}>
            <Beat frame={frame} from={AT.sources} to={AT.run} first>{(f) => <Sources frame={f} />}</Beat>
            <Beat frame={frame} from={AT.run} to={AT.extract}>{(f) => <Run frame={f} />}</Beat>
            <Beat frame={frame} from={AT.extract} to={AT.review}>{(f) => <Extract frame={f} />}</Beat>
            <Beat frame={frame} from={AT.review} to={AT.agent}>{(f) => <Review frame={f} />}</Beat>
            <Beat frame={frame} from={AT.agent} to={AT.ask}>{(f) => <Agent frame={f} />}</Beat>
            <Beat frame={frame} from={AT.ask} to={AT.watch}>{(f) => <Ask frame={f} />}</Beat>
            <Beat frame={frame} from={AT.watch} to={AT.end} last>{(f) => <Watch frame={f} />}</Beat>
          </AppWindow>
        </ThemeScope>
      </div>
    </div>

    <StudentEcho frame={frame} />

    <Cues cues={SOURCES_CUES} offset={AT.sources} />
    <Cues cues={runCues()} offset={AT.run} />
    <Cues cues={extractCues()} offset={AT.extract} />
    <Cues cues={reviewCues()} offset={AT.review} />
    <Cues cues={agentCues()} offset={AT.agent} />
    <Cues cues={askCues()} offset={AT.ask} />
    <Cues cues={watchCues()} offset={AT.watch} />
    <Cues cues={[{ at: 0, name: 'whoosh', volume: 0.3 }, { at: ECHO_AT, name: 'whoosh-soft', volume: 0.22 }, { at: AT.end - s(0.75), name: 'whoosh', volume: 0.28 }]} />
  </AbsoluteFill>
}

/** The same fact, as Amara saw it in the student film. */
function StudentEcho({ frame }: { frame: number }) {
  const p = settle(frame, ECHO_AT, s(0.9))
  const out = progress(frame, AT.watch - s(0.4), s(0.4), exit)
  if (p <= 0.001 || out >= 1) return null
  const card = { x: 120, y: 300, w: 560 }
  // The emitted sentence inside the console window, in stage coordinates.
  const from = { x: WINDOW_X + WINDOW.sidebar + EMITTED_ANCHOR.x, y: WINDOW_Y + WINDOW.topbar + EMITTED_ANCHOR.y }
  const to = { x: card.x + card.w - 18, y: card.y + 300 }
  const d = `M ${from.x} ${from.y} C ${from.x - 140} ${from.y}, ${to.x + 140} ${to.y}, ${to.x} ${to.y}`
  const thread = progress(frame, ECHO_AT + s(0.5), s(0.6), glide)

  return <AbsoluteFill style={{ opacity: 1 - out }}>
    <div style={{ position: 'absolute', left: card.x, top: card.y - 64, display: 'flex', alignItems: 'center', gap: 12, opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
      <Avatar initials={PERSONA.initials} color={C.blue} size={44} style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.sky} 60%, ${C.mint})` }} />
      <span style={{ color: C.blue, font: `600 23px/1 ${FONT}` }}>What {PERSONA.name} sees</span>
    </div>
    <ThemeScope tokens={LIGHT}>
      <div style={{
        position: 'absolute', left: card.x, top: card.y, width: card.w, padding: 26, display: 'grid', gap: 16,
        borderRadius: R.card, background: LIGHT.surface, border: `1px solid ${LIGHT.line}`, boxShadow: LIGHT.shadowHigh,
        opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${0.96 + 0.04 * p})`, transformOrigin: 'left center',
      }}>
        <span style={{ color: LIGHT.inkFaint, font: `600 13.5px/1 ${FONT}` }}>Scrapal / student · {COURSE.institution}, {COURSE.city}</span>
        <span style={{ color: LIGHT.ink, font: `700 22px/1 ${FONT}` }}>Where this came from</span>
        <span style={{ display: 'grid', gap: 8 }}>
          <span style={{ color: LIGHT.inkFaint, font: `500 15px/1 ${FONT}` }}>Tuition · international students</span>
          <span style={{ color: LIGHT.ink, font: `700 46px/1 ${FONT}`, letterSpacing: '-0.03em' }}>{COURSE.tuition}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, color: LIGHT.blue, background: LIGHT.blueWash, font: `600 14.5px/1.2 ${FONT}` }}>
          <Globe size={16} /> <span style={{ flex: 1 }}>{COURSE.source}</span> <ExternalLink size={15} />
        </span>
        <blockquote style={{ margin: 0, padding: '14px 16px', borderLeft: `3px solid ${LIGHT.blue}`, borderRadius: '4px 12px 12px 4px', background: LIGHT.surface2, color: LIGHT.ink, font: `400 18px/1.5 ${FONT}` }}>
          “Tuition for international students is <b style={{ background: 'rgba(70, 92, 255, 0.18)', padding: '1px 3px', borderRadius: 4 }}>£17,500</b> for the full course (2027/28 entry).”
        </blockquote>
      </div>
    </ThemeScope>
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <Thread d={d} to={thread} width={5} tailNode nodeScale={1.5}
        particles={frame > ECHO_AT + s(1.1) ? [0, 1, 2].map((i) => ((frame - ECHO_AT) / s(1.3) + i / 3) % 1) : []} />
    </svg>
  </AbsoluteFill>
}
