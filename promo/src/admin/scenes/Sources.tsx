// "Connected sources" → Add source (console/src/App.tsx, the blueprint dialog).
// Guided setup, then the blueprint preview: a representative sample, projected
// field coverage, the page families on offer and the scope rules — and nothing
// crawls until "Approve scope & start". Wording is the console's own.
import { CircleCheckBig, FileSearch, Globe2, GraduationCap, Play, Plus, X } from 'lucide-react'
import { exit, glide, keyframes, pop, progress, rise, typed } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import { Cursor, pressAt, type CursorKey } from '../../components/Cursor'
import type { Cue } from '../../components/Sfx'
import { useTokens } from '../../components/tokens'
import { Badge, Button, Dots, IconTile } from '../../components/ui'
import { FPS, s } from '../../timeline'
import { FONT, MONO, R } from '../../theme'
import { BLUEPRINT, SITE } from '../data'
import { vo, voEnd } from '../film'

const PAD = 36
const DIALOG = { left: 40, top: 22, width: CONTENT.width - 80, height: CONTENT.height - 44 }

// Beats, in seconds from the top of the scene.
const OPEN = vo('sources.follow', 1.4) / FPS
const TYPE_FROM = OPEN + 0.55
const PREVIEW = vo('sources.point', 0.2) / FPS
const SAMPLED = vo('sources.point', 1.4) / FPS
const APPROVE = voEnd('sources.approve', -0.9) / FPS

export function Sources({ frame }: { frame: number }) {
  const t = useTokens()
  const dialog = progress(frame, s(OPEN), s(0.4), glide)
  const sampled = frame >= s(SAMPLED)

  const keys: CursorKey[] = [
    { f: s(OPEN - 0.8), x: 520, y: 520 },
    { f: s(OPEN - 0.15), x: 415, y: 392 },
    { f: s(OPEN), x: 415, y: 392, click: true },
    { f: s(PREVIEW - 0.5), x: DIALOG.left + DIALOG.width - 120, y: DIALOG.top + DIALOG.height - 38 },
    { f: s(PREVIEW), x: DIALOG.left + DIALOG.width - 120, y: DIALOG.top + DIALOG.height - 38, click: true },
    { f: s(APPROVE - 0.6), x: DIALOG.left + DIALOG.width - 150, y: DIALOG.top + DIALOG.height - 38 },
    { f: s(APPROVE), x: DIALOG.left + DIALOG.width - 150, y: DIALOG.top + DIALOG.height - 38, click: true },
    { f: s(APPROVE + 0.8), x: 560, y: 760 },
  ]

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    <SourceGrid frame={frame} />

    {dialog > 0 && <>
      <div style={{ position: 'absolute', inset: 0, background: `rgba(6, 10, 15, ${0.62 * dialog})` }} />
      <div style={{
        position: 'absolute', ...DIALOG, borderRadius: R.card, overflow: 'hidden',
        background: t.surface, border: `1px solid ${t.line}`, boxShadow: t.shadowHigh,
        opacity: dialog, transform: `translateY(${(1 - dialog) * 10}px) scale(${0.98 + 0.02 * dialog})`,
        display: 'flex', flexDirection: 'column',
      }}>
        <Header frame={frame} sampled={sampled} />
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          {!sampled ? <Form frame={frame} /> : <Preview frame={frame} />}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: `1px solid ${t.line}` }}>
          <Button variant="secondary" size={15}>{sampled ? 'Edit objective' : 'Cancel'}</Button>
          {sampled
            ? <Button icon={Play} size={15} pressed={pressAt(frame, s(APPROVE))}>{frame >= s(APPROVE) ? 'Saving scope…' : 'Approve scope & start'}</Button>
            : <Button size={15} pressed={pressAt(frame, s(PREVIEW))}>{frame >= s(PREVIEW) ? 'Sampling evidence…' : 'Preview crawl plan'}</Button>}
        </div>
      </div>
    </>}

    {/* "Crawl started" — the console's toast after approval. */}
    {(() => {
      const toast = pop(frame, s(APPROVE + 0.35), { damping: 16, stiffness: 160 })
      if (toast <= 0.01) return null
      return <div style={{
        position: 'absolute', right: 24, bottom: 24, width: 400, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center',
        borderRadius: R.panel, background: t.surface2, border: `1px solid ${t.metLine}`, boxShadow: t.shadowHigh,
        opacity: Math.min(1, toast * 1.4), transform: `translateY(${(1 - toast) * 30}px)`,
      }}>
        <IconTile icon={CircleCheckBig} tone="met" size={40} />
        <span style={{ display: 'grid', gap: 5 }}>
          <span style={{ color: t.ink, font: `700 16px/1 ${FONT}` }}>Crawl started</span>
          <span style={{ color: t.inkSoft, font: `400 14px/1.3 ${FONT}` }}>Progress appears below as pages are checked.</span>
        </span>
      </div>
    })()}

    <Cursor keys={keys} frame={frame} opacity={Math.min(progress(frame, s(OPEN - 0.8), 10), 1 - progress(frame, s(APPROVE + 0.6), 12, exit))} />
  </div>
}

/** The page behind the dialog: sources already connected. */
function SourceGrid({ frame }: { frame: number }) {
  const t = useTokens()
  const cards = [
    { name: 'Lakeshore University — course catalogue', url: 'https://www.lakeshore.ie/postgraduate/', state: 'Completed', tone: 'met' as const, last: '2d ago' },
    { name: 'Ashford Metropolitan — course catalogue', url: 'https://www.ashford.ac.uk/study/', state: 'Completed', tone: 'met' as const, last: '3d ago' },
    { name: 'Riverside Institute — course catalogue', url: 'https://www.riverside.ac.uk/courses/', state: 'Failed', tone: 'error' as const, last: '5d ago' },
    { name: 'Hartwell College — course catalogue', url: 'https://www.hartwell.ac.uk/study/', state: 'Ready', tone: 'met' as const, last: 'Not run' },
  ]
  return <div style={{ position: 'absolute', left: PAD, right: PAD, top: 26, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
    {cards.map((card, i) => <div key={card.name} style={{
      padding: '18px 20px', borderRadius: R.card, background: t.surface, border: `1px solid ${t.line}`, display: 'grid', gap: 14,
      ...rise(progress(frame, s(0.05 + i * 0.08), 18), 14),
    }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <IconTile icon={Globe2} size={42} />
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <span style={{ color: t.inkFaint, font: `600 12.5px/1 ${FONT}` }}>website</span>
          <span style={{ color: t.ink, font: `700 17px/1.2 ${FONT}` }}>{card.name}</span>
          <span style={{ color: t.inkSoft, font: `400 13.5px/1 ${FONT}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.url}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 30 }}>
        <span style={{ display: 'grid', gap: 6 }}><span style={{ color: t.inkFaint, font: `500 11px/1 ${MONO}`, letterSpacing: '0.06em' }}>LAST RUN</span><span style={{ color: t.ink, font: `500 16px/1 ${FONT}` }}>{card.last}</span></span>
        <span style={{ display: 'grid', gap: 6 }}><span style={{ color: t.inkFaint, font: `500 11px/1 ${MONO}`, letterSpacing: '0.06em' }}>STATE</span><Badge tone={card.tone} size={12.5}>{card.state}</Badge></span>
      </div>
    </div>)}
    <div style={{
      gridColumn: '1 / -1', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      borderRadius: R.card, border: `1.5px dashed ${t.line}`, color: t.inkFaint, font: `600 16px/1 ${FONT}`,
      ...rise(progress(frame, s(0.4), 18), 14),
    }}><Plus size={18} /> Add a source to start a new collection</div>
  </div>
}

function Header({ frame, sampled }: { frame: number; sampled: boolean }) {
  const t = useTokens()
  const swap = progress(frame, s(SAMPLED), 12)
  return <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '22px 24px 16px', borderBottom: `1px solid ${t.line}` }}>
    <div style={{ display: 'grid', gap: 8, opacity: sampled ? swap : 1 }}>
      <span style={{ color: t.blue, font: `600 12.5px/1 ${FONT}`, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{sampled ? 'Crawl blueprint · preview' : 'New input · guided setup'}</span>
      <span style={{ color: t.ink, font: `700 26px/1.1 ${FONT}`, letterSpacing: '-0.02em' }}>{sampled ? 'Review before crawling' : 'Tell Scrapal what to find'}</span>
      <span style={{ color: t.inkSoft, font: `400 15px/1.35 ${FONT}` }}>{sampled ? 'Approve the proposed scope only when it matches your research objective.' : 'Start with a homepage and an outcome. Scrapal will propose a safe crawl plan.'}</span>
    </div>
    <X size={20} color={t.inkFaint} />
  </div>
}

function Form({ frame }: { frame: number }) {
  const t = useTokens()
  const url = typed(SITE.start, frame, s(TYPE_FROM), 34)
  const sampling = frame >= s(PREVIEW)
  const kinds: [string, typeof Globe2][] = [['university', GraduationCap], ['website', Globe2], ['sitemap', Globe2], ['document', FileSearch]]
  const label = (text: string) => <span style={{ color: t.inkSoft, font: `600 14px/1 ${FONT}` }}>{text}</span>
  const input = (value: string, active: boolean, height = 46) => <span style={{
    display: 'flex', alignItems: height > 46 ? 'flex-start' : 'center', minHeight: height, padding: height > 46 ? '12px 14px' : '0 14px',
    borderRadius: R.input, background: t.paper, border: `1.5px solid ${active ? t.blue : t.line}`, color: t.ink, font: `400 16px/1.4 ${FONT}`,
  }}>{value}</span>

  return <div style={{ position: 'absolute', inset: 0, padding: '18px 24px', display: 'grid', gap: 14, alignContent: 'start', opacity: sampling ? 0.55 : 1 }}>
    <div style={{ display: 'grid', gap: 8 }}>
      {label('Source type')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {kinds.map(([kind, Icon], i) => <span key={kind} style={{
          display: 'flex', alignItems: 'center', gap: 9, height: 46, padding: '0 14px', borderRadius: R.input,
          border: `1.5px solid ${i === 0 ? t.blue : t.line}`, background: i === 0 ? t.blueWash : t.paper,
          color: i === 0 ? t.blue : t.inkSoft, font: `600 15px/1 ${FONT}`,
        }}><Icon size={17} />{kind}</span>)}
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
      <div style={{ display: 'grid', gap: 8 }}>{label('Name')}{input('Northbridge University', false)}</div>
      <div style={{ display: 'grid', gap: 8 }}>{label('Starting URL')}{input(url || ' ', frame >= s(TYPE_FROM) && frame < s(PREVIEW))}</div>
    </div>
    <div style={{ display: 'grid', gap: 8 }}>{label('Research objective')}{input('Every postgraduate course: fees, intakes and entry requirements, each with the sentence it came from.', false, 78)}</div>
    <div style={{ display: 'grid', gap: 8 }}>
      {label('Required evidence')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {BLUEPRINT.fields.slice(0, 5).map(([field]) => <Badge key={field} tone="blue" size={14}>✓ {field}</Badge>)}
      </div>
    </div>
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: t.inkFaint, font: `400 14px/1.4 ${FONT}` }}>
      {sampling ? <><Dots frame={frame} size={9} /> Sampling representative public pages and crawl-policy metadata…</> : 'Preview samples representative public pages and crawl-policy metadata. It does not start a bulk crawl.'}
    </span>
  </div>
}

function Preview({ frame }: { frame: number }) {
  const t = useTokens()
  const at = s(SAMPLED)
  const ring = progress(frame, at + 6, s(0.9))
  // The dialog body scrolls from the verdict down to the scope rules while the narrator talks.
  const scroll = keyframes(frame, [[vo('sources.point', 3.0), 0], [vo('sources.approve', -0.1), 250]])
  const meterTone = (rate: number) => (rate >= 0.75 ? t.successInk : rate >= 0.35 ? t.warningInk : t.errorInk)

  return <div style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: '16px 24px', display: 'grid', gap: 14, transform: `translateY(${-scroll}px)`, opacity: progress(frame, at, 12) }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', borderRadius: R.panel, background: t.metSoft, border: `1px solid ${t.metLine}` }}>
      <CircleCheckBig size={28} color={t.successInk} />
      <div style={{ flex: 1, display: 'grid', gap: 6 }}>
        <span style={{ color: t.successInk, font: `600 13px/1 ${FONT}` }}>Representative sample complete</span>
        <span style={{ color: t.ink, font: `700 19px/1.15 ${FONT}` }}>{BLUEPRINT.sampled} pages sampled from {BLUEPRINT.links} eligible links</span>
        <span style={{ color: t.inkSoft, font: `400 14px/1.3 ${FONT}` }}>1 sitemap discovered. Robots returned 200.</span>
      </div>
      <div style={{ position: 'relative', width: 82, height: 82 }}>
        <svg width={82} height={82} viewBox="0 0 82 82"><circle cx={41} cy={41} r={34} fill="none" stroke={t.line} strokeWidth={7} />
          <circle cx={41} cy={41} r={34} fill="none" stroke={t.successInk} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 34 * (BLUEPRINT.projected / 100) * ring} 999`} transform="rotate(-90 41 41)" /></svg>
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center', color: t.ink, font: `700 20px/1 ${FONT}` }}>
          {Math.round(BLUEPRINT.projected * ring)}%<small style={{ color: t.inkFaint, font: `500 10px/1.4 ${MONO}` }}>projected</small>
        </span>
      </div>
    </div>

    <div style={{ padding: '14px 18px', borderRadius: R.panel, border: `1px solid ${t.line}`, display: 'grid', gap: 10 }}>
      <span style={{ display: 'grid', gap: 5 }}>
        <span style={{ color: t.inkFaint, font: `600 12.5px/1 ${FONT}` }}>Coverage projection</span>
        <span style={{ color: t.ink, font: `700 17px/1 ${FONT}` }}>Likely evidence gaps before a full crawl</span>
      </span>
      {BLUEPRINT.fields.map(([field, rate], i) => {
        const p = progress(frame, at + s(0.5 + i * 0.12), s(0.6), glide)
        return <div key={field} style={{ display: 'grid', gridTemplateColumns: '190px 1fr 50px', alignItems: 'center', gap: 12 }}>
          <span style={{ color: t.inkSoft, font: `500 14.5px/1 ${FONT}` }}>{field}</span>
          <span style={{ height: 8, borderRadius: 8, background: t.surface2, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${rate * 100 * p}%`, borderRadius: 8, background: meterTone(rate) }} /></span>
          <span style={{ color: t.ink, font: `600 14.5px/1 ${MONO}`, textAlign: 'right' }}>{Math.round(rate * 100 * p)}%</span>
        </div>
      })}
    </div>

    <div style={{ padding: '14px 18px', borderRadius: R.panel, border: `1px solid ${t.line}`, display: 'grid', gap: 10 }}>
      <span style={{ color: t.ink, font: `700 17px/1 ${FONT}` }}>Page families available to the crawl</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        {BLUEPRINT.families.map(([family, count]) => <span key={family} style={{ display: 'grid', gap: 5, padding: '10px 10px', borderRadius: 12, background: t.surface2 }}>
          <span style={{ color: t.ink, font: `700 18px/1 ${FONT}` }}>{count}</span>
          <span style={{ color: t.inkSoft, font: `500 13px/1 ${FONT}` }}>{family}</span>
        </span>)}
      </div>
    </div>

    <div style={{ padding: '14px 18px', borderRadius: R.panel, border: `1.5px solid ${t.blueLine}`, background: t.blueWash, display: 'grid', gap: 10 }}>
      <span style={{ display: 'grid', gap: 5 }}>
        <span style={{ color: t.blue, font: `600 12.5px/1 ${FONT}` }}>Approved scope</span>
        <span style={{ color: t.ink, font: `700 17px/1 ${FONT}` }}>Edit the rules Scrapal will enforce</span>
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px', gap: 12 }}>
        {[['Include paths', BLUEPRINT.include], ['Exclude paths', BLUEPRINT.exclude]].map(([name, paths]) => <span key={name as string} style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: t.inkSoft, font: `600 13px/1 ${FONT}` }}>{name as string}</span>
          <span style={{ padding: '9px 12px', borderRadius: 10, background: t.paper, border: `1px solid ${t.line}`, color: t.ink, font: `400 14px/1.5 ${MONO}` }}>{(paths as string[]).map((path) => <span key={path} style={{ display: 'block' }}>{path}</span>)}</span>
        </span>)}
        <span style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
          <span style={{ color: t.inkSoft, font: `600 13px/1 ${FONT}` }}>Maximum pages</span>
          <span style={{ padding: '9px 12px', borderRadius: 10, background: t.paper, border: `1px solid ${t.line}`, color: t.ink, font: `500 15px/1 ${MONO}` }}>{BLUEPRINT.maxPages}</span>
          <span style={{ color: t.inkSoft, font: `600 13px/1 ${FONT}` }}>Link depth</span>
          <span style={{ padding: '9px 12px', borderRadius: 10, background: t.paper, border: `1px solid ${t.line}`, color: t.ink, font: `500 15px/1 ${MONO}` }}>{BLUEPRINT.depth}</span>
        </span>
      </div>
    </div>
  </div>
}

export const SOURCES_CUES: Cue[] = [
  { at: s(OPEN), name: 'click', volume: 0.32 },
  { at: s(OPEN), name: 'whoosh-soft', volume: 0.2 },
  { at: s(TYPE_FROM), name: 'typing', volume: 0.24, length: s(1.1) },
  { at: s(PREVIEW), name: 'click', volume: 0.32 },
  { at: s(SAMPLED), name: 'success', volume: 0.2 },
  { at: s(APPROVE), name: 'click', volume: 0.32 },
  { at: s(APPROVE + 0.35), name: 'notify', volume: 0.26 },
]
