// "What it really costs" (student/MoneyPage). The whole degree added up —
// tuition, living, visa, health surcharge, travel — against the student's own
// budget, with the gap named. Figures read from a university page carry a solid
// dot; reference figures a hollow one, as the product marks them.
import { ArrowRight, ChevronDown, Wallet } from 'lucide-react'
import { glide, map, pop, progress, rise } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import type { Cue } from '../../components/Sfx'
import { Avatar, Button, IconTile } from '../../components/ui'
import { COSTS, COURSE, STUDENT } from '../../data'
import { s } from '../../timeline'
import { vo } from '../../vo'
import { C, FONT, R, SHADOW } from '../../theme'

const PAD = 36
const INNER = CONTENT.width - PAD * 2
const BAR_W = INNER - 52
const TOTAL = COSTS.reduce((sum, cost) => sum + cost.amount, 0)
const COLORS = [C.blue, C.sky, C.cyan, C.mint, C.emerald]
const GAP = TOTAL - STUDENT.budget

const money = (value: number) => `£${Math.round(value).toLocaleString('en-GB')}`

export function Money({ frame }: { frame: number }) {
  // The total builds under "Then, the real cost"; the gap is named with "£7,800 short".
  const costAt = vo('money.cost', 0.1)
  const gapAt = vo('money.gap')
  const segP = COSTS.map((_, i) => progress(frame, costAt + s(i * 0.28), s(i < 2 ? 0.7 : 0.35), glide))
  const running = COSTS.reduce((sum, cost, i) => sum + cost.amount * segP[i], 0)

  const budget = progress(frame, gapAt + s(0.1), s(0.5), glide)
  const hatch = progress(frame, gapAt + s(0.5), s(0.5))
  const gapCard = progress(frame, gapAt + s(1.0), 22)
  const gapCount = progress(frame, gapAt + s(1.1), s(0.9))
  const scholarships = gapAt + s(3.0)
  const legend = progress(frame, gapAt + s(3.8), 18)
  const push = map(frame, [0, s(10)], [1, 1.045])

  const budgetX = (STUDENT.budget / TOTAL) * BAR_W

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT, transform: `scale(${push})`, transformOrigin: '50% 40%' }}>
    {/* Which course this is for */}
    <div style={{
      position: 'absolute', left: PAD, top: 22, display: 'flex', alignItems: 'center', gap: 12,
      height: 46, padding: '0 16px 0 8px', borderRadius: R.pill, background: C.surface, border: `1px solid ${C.line}`,
      ...rise(progress(frame, 0, 18), 12),
    }}>
      <Avatar initials={COURSE.initials} color={COURSE.color} size={32} style={{ borderRadius: 10 }} />
      <span style={{ color: C.ink, font: `600 17px/1 ${FONT}` }}>{COURSE.title} · {COURSE.institution}</span>
      <ChevronDown size={18} color={C.inkFaint} />
    </div>

    {/* The total */}
    <div style={{
      position: 'absolute', left: PAD, top: 86, width: INNER, padding: '24px 26px 26px',
      borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`, boxShadow: SHADOW.lift,
      ...rise(progress(frame, s(0.1), 22), 18),
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <span style={{ color: C.inkFaint, font: `600 14px/1 ${FONT}`, letterSpacing: '0.04em', textTransform: 'uppercase' }}>The whole degree, all in</span>
          <span style={{ color: C.ink, font: `700 64px/0.95 ${FONT}`, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{money(running)}</span>
        </div>
        <span style={{ color: C.inkSoft, font: `400 16px/1.4 ${FONT}`, textAlign: 'right', maxWidth: 300, paddingBottom: 4 }}>
          for one year in London, from application to arrival
        </span>
      </div>

      <div style={{ position: 'relative', marginTop: 34, height: 30 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: C.surface2 }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', borderRadius: 10, overflow: 'hidden', gap: 2 }}>
          {COSTS.map((cost, i) => (
            <span key={cost.label} style={{ width: (cost.amount / TOTAL) * BAR_W * segP[i], background: COLORS[i], flex: 'none' }} />
          ))}
        </div>
        {/* Beyond the budget: what is still to find. */}
        <div style={{
          position: 'absolute', left: budgetX, right: 0, top: -4, bottom: -4, borderRadius: '0 12px 12px 0',
          border: `2px solid ${C.amber}`, borderLeft: 0, opacity: hatch,
          backgroundImage: `repeating-linear-gradient(135deg, rgba(228, 167, 44, 0.32) 0 6px, transparent 6px 12px)`,
        }} />
        <div style={{
          position: 'absolute', left: budgetX - 1, top: -16, width: 3, height: 62 * budget, borderRadius: 3, background: C.navy,
        }} />
        <span style={{
          position: 'absolute', left: budgetX, top: 52, transform: 'translateX(-50%)', whiteSpace: 'nowrap',
          color: C.ink, font: `600 15px/1 ${FONT}`, opacity: budget,
        }}>Your budget · {money(STUDENT.budget)}</span>
      </div>
      <div style={{ height: 26 }} />
    </div>

    {/* What it is made of */}
    <div style={{
      position: 'absolute', left: PAD, top: 330, width: INNER, padding: '10px 26px 12px',
      borderRadius: R.card, background: C.surface, border: `1px solid ${C.line}`,
      ...rise(progress(frame, s(0.35), 22), 18),
    }}>
      {COSTS.map((cost, i) => {
        const r = progress(frame, costAt + s(i * 0.28), 16)
        const read = cost.source === 'university'
        return <div key={cost.label} style={{
          height: 38, display: 'flex', alignItems: 'center', gap: 14,
          borderBottom: i < COSTS.length - 1 ? `1px solid ${C.line}` : undefined, opacity: 0.25 + 0.75 * r,
        }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: COLORS[i] }} />
          <span style={{ flex: 1, color: C.inkSoft, font: `500 17px/1 ${FONT}` }}>{cost.label}</span>
          <span style={{
            width: 9, height: 9, borderRadius: '50%',
            background: read ? C.blue : 'transparent', border: `1.5px solid ${read ? C.blue : C.inkFaint}`,
          }} />
          <span style={{ width: 100, textAlign: 'right', color: C.ink, font: `600 17px/1 ${FONT}`, fontVariantNumeric: 'tabular-nums' }}>{money(cost.amount)}</span>
        </div>
      })}
      <div style={{ display: 'flex', gap: 22, paddingTop: 10, color: C.inkFaint, font: `500 13.5px/1 ${FONT}`, opacity: legend }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Dot solid /> Read from the university’s page</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Dot /> Reference figure, checked October 2026</span>
      </div>
    </div>

    {/* The gap, named, with somewhere to go next. */}
    <div style={{
      position: 'absolute', left: PAD, top: 598, width: INNER, height: 74, padding: '0 14px 0 16px',
      display: 'flex', alignItems: 'center', gap: 16,
      borderRadius: R.panel, background: C.warningWash, border: '1px solid #f1dfb8',
      ...rise(gapCard, 20),
    }}>
      <IconTile icon={Wallet} tone="close" size={46} />
      <div style={{ flex: 1, display: 'grid', gap: 6 }}>
        <span style={{ color: C.warningInk, font: `700 21px/1 ${FONT}`, fontVariantNumeric: 'tabular-nums' }}>{money(GAP * gapCount)} still to find</span>
        <span style={{ color: C.inkSoft, font: `400 15.5px/1 ${FONT}` }}>2 scholarships match what you still need</span>
      </div>
      <span style={{ transform: `scale(${0.9 + 0.1 * pop(frame, scholarships)})`, opacity: progress(frame, scholarships - 3, 12) }}>
        <Button icon={ArrowRight} size={16}>See funding</Button>
      </span>
    </div>
  </div>
}

function Dot({ solid }: { solid?: boolean }) {
  return <span style={{
    width: 9, height: 9, borderRadius: '50%',
    background: solid ? C.blue : 'transparent', border: `1.5px solid ${solid ? C.blue : C.inkFaint}`,
  }} />
}

export const MONEY_CUES: Cue[] = [
  { at: vo('money.cost', 0.1), name: 'count', volume: 0.3 },
  { at: vo('money.gap', 0.1), name: 'pop-low', volume: 0.24 },
  { at: vo('money.gap', 0.5), name: 'highlight', volume: 0.18 },
  { at: vo('money.gap', 1.0), name: 'pop', volume: 0.2 },
  { at: vo('money.gap', 3.0), name: 'pop-hi', volume: 0.16 },
]
