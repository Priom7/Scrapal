// 0:20–1:38 — the walkthrough, following Amara. One app window stays on screen
// for the whole stretch while its pages change underneath, captions on the
// left in the banner pattern, every beat keyed to the narration.
import { BellRing, Coins, FileSearch, FileText, ListChecks, MessagesSquare, Radar as RadarIcon, ShieldQuestion } from 'lucide-react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { exit, progress, settle } from '../anim'
import { Beat } from '../components/Beat'
import { AppWindow, type Page } from '../components/AppWindow'
import { Caption } from '../components/Caption'
import { Cues } from '../components/Sfx'
import { FPS, s, scene } from '../timeline'
import { FONT } from '../theme'
import { Apply, applyCues } from './product/Apply'
import { CHECK_CUES, Check, WATCH_AT } from './product/Check'
import { COURSE_CUES, CoursePage } from './product/CoursePage'
import { MONEY_CUES, Money } from './product/Money'
import { PLAN_CUES, Plan } from './product/Plan'
import { RADAR_CUES, Radar } from './product/Radar'

const start = scene('plan').from
/** Stage-local frame where each beat starts. */
const AT = {
  plan: 0,
  match: scene('match').from - start,
  evidence: scene('evidence').from - start,
  money: scene('money').from - start,
  check: scene('check').from - start,
  apply: scene('apply').from - start,
  radar: scene('radar').from - start,
  end: scene('radar').from + scene('radar').duration - start,
}

const PAGES: Page[] = [
  { at: AT.plan, nav: 'plan', title: 'Plan your study' },
  { at: AT.match, nav: 'find', title: 'Northbridge University, London' },
  { at: AT.money, nav: 'money', title: 'What it really costs' },
  { at: AT.check, nav: 'check', title: 'Check what you were told' },
  { at: AT.apply, nav: 'applications', title: 'Your applications' },
  { at: AT.radar, nav: 'radar', title: 'Research Opportunity Radar' },
]

const CAPTIONS = [
  { from: AT.plan, to: AT.match, kicker: 'Plan', icon: MessagesSquare, lines: ['Plan it in one', 'conversation.'], highlight: 'conversation.', support: 'Scrapal asks one question at a time and builds your shortlist as you answer.' },
  { from: AT.match, to: AT.evidence, kicker: 'Match', icon: ListChecks, lines: ['Know exactly', 'where you stand.'], highlight: 'where you stand.', support: 'Every entry requirement checked, and every gap named. Never a mystery score.' },
  { from: AT.evidence, to: AT.money, kicker: 'Evidence', icon: FileSearch, lines: ['Every fact', 'has a source.'], highlight: 'has a source.', support: 'Fees, deadlines and requirements link back to the page they were read from. No source? Scrapal says so.' },
  { from: AT.money, to: AT.check, kicker: 'Money', icon: Coins, lines: ['See what it', 'really costs.'], highlight: 'really costs.', support: 'Tuition, living, visa and health surcharge for the whole degree, and what you still need to find.' },
  { from: AT.check, to: AT.check + s(WATCH_AT), kicker: 'Check a claim', icon: ShieldQuestion, lines: ['Check what', 'you were told.'], highlight: 'you were told.', support: 'Paste what an agent said. Scrapal compares it with what the university actually published.' },
  { from: AT.check + s(WATCH_AT), to: AT.apply, kicker: 'Change watch', icon: BellRing, lines: ['Hear the moment', 'a page changes.'], highlight: 'a page changes.', support: 'Scrapal keeps every earlier version, so when a university edits a page you see exactly what moved.' },
  { from: AT.apply, to: AT.radar, kicker: 'Apply', icon: FileText, lines: ['Apply in', 'your own words.'], highlight: 'your own words.', support: 'Every document each university asks for, in one pack, and a statement Scrapal never makes up.' },
  { from: AT.radar, to: AT.end, kicker: 'Research radar', icon: RadarIcon, lines: ['Find the people', 'behind the work.'], highlight: 'behind the work.', support: 'Your research stays on your device. Only its topics are searched, to find supervisors, labs and funded PhDs.' },
]

const WINDOW_X = 740
const WINDOW_Y = 140

export function Product() {
  const frame = useCurrentFrame()

  // Window arrives from below with a little depth, and leaves into the montage.
  const enter = settle(frame, 0, s(1.1))
  const leave = progress(frame, AT.end - s(0.75), s(0.75), exit)
  const float = Math.sin((frame / FPS) * 0.7) * 4

  return <AbsoluteFill style={{ fontFamily: FONT }}>
    {CAPTIONS.map((caption, index) => {
      if (frame < caption.from - 2 || frame > caption.to + 4) return null
      return <div key={index} style={{ position: 'absolute', left: 120, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
        <Caption
          frame={frame}
          inAt={caption.from + (index === 0 ? s(0.35) : 6)}
          outAt={caption.to - 18}
          kicker={caption.kicker}
          icon={caption.icon}
          lines={caption.lines}
          highlight={caption.highlight}
          support={caption.support}
          size={70}
          width={560}
        />
      </div>
    })}

    <div style={{
      position: 'absolute', left: WINDOW_X, top: WINDOW_Y,
      perspective: 2400,
    }}>
      <div style={{
        transformOrigin: '50% 100%',
        transform: [
          `translate3d(${leave * -250}px, ${(1 - enter) * 160 + float * (1 - leave)}px, 0)`,
          `rotateX(${(1 - enter) * 16}deg)`,
          `scale(${(0.9 + 0.1 * enter) * (1 - leave * 0.25)})`,
        ].join(' '),
        opacity: Math.min(1, enter * 1.6) * (1 - leave),
      }}>
        <AppWindow frame={frame} pages={PAGES}>
          <Beat frame={frame} from={AT.plan} to={AT.match} first>{(f) => <Plan frame={f} />}</Beat>
          <Beat frame={frame} from={AT.match} to={AT.money}>{(f) => <CoursePage frame={f} />}</Beat>
          <Beat frame={frame} from={AT.money} to={AT.check}>{(f) => <Money frame={f} />}</Beat>
          <Beat frame={frame} from={AT.check} to={AT.apply}>{(f) => <Check frame={f} />}</Beat>
          <Beat frame={frame} from={AT.apply} to={AT.radar}>{(f) => <Apply frame={f} />}</Beat>
          <Beat frame={frame} from={AT.radar} to={AT.end} last>{(f) => <Radar frame={f} />}</Beat>
        </AppWindow>
      </div>
    </div>

    <Cues cues={PLAN_CUES} offset={AT.plan} />
    <Cues cues={COURSE_CUES} offset={AT.match} />
    <Cues cues={MONEY_CUES} offset={AT.money} />
    <Cues cues={CHECK_CUES} offset={AT.check} />
    <Cues cues={applyCues()} offset={AT.apply} />
    <Cues cues={RADAR_CUES} offset={AT.radar} />
    <Cues cues={[{ at: AT.end - s(0.75), name: 'whoosh', volume: 0.28 }]} />
  </AbsoluteFill>
}
