// "Decisions waiting for you" (console Reviews). The agent proposes, with its
// reason and its risk; nothing runs until a person approves. The approval is
// recorded — who, what, when — alongside earlier decisions; the card and the
// log are the confirmation, so no toast competes with them.
import { Check, Info, ScrollText, TriangleAlert } from 'lucide-react'
import type { CSSProperties } from 'react'
import { pop, progress, rise } from '../../anim'
import { CONTENT } from '../../components/AppWindow'
import { Cursor, pressAt, type CursorKey } from '../../components/Cursor'
import type { Cue } from '../../components/Sfx'
import { useTokens } from '../../components/tokens'
import { Badge, Button, Dots } from '../../components/ui'
import { FPS, s } from '../../timeline'
import { FONT, MONO, R } from '../../theme'
import { PROPOSALS } from '../data'
import { vo } from '../film'

const PAD = 36
const COL = (CONTENT.width - PAD * 2 - 18) / 2
const CARD_H = 310
const slot = (index: number) => ({ x: PAD + (index % 2) * (COL + 18), y: 22 + Math.floor(index / 2) * (CARD_H + 18) })

const WAITING = vo('agent.alone', 0.3) / FPS
const RISK = vo('agent.alone', 3.9) / FPS
const APPROVE = vo('agent.alone', 5.0) / FPS
const APPROVE_BUTTON = { x: slot(0).x + COL - 94, y: slot(0).y + CARD_H - 36 }

export function Agent({ frame }: { frame: number }) {
  const t = useTokens()
  const approved = progress(frame, s(APPROVE), 10)
  const keys: CursorKey[] = [
    { f: s(APPROVE - 1.0), x: 560, y: 720 },
    { f: s(APPROVE - 0.2), x: APPROVE_BUTTON.x, y: APPROVE_BUTTON.y },
    { f: s(APPROVE), x: APPROVE_BUTTON.x, y: APPROVE_BUTTON.y, click: true },
    { f: s(APPROVE + 0.9), x: 560, y: 760 },
  ]

  return <div style={{ position: 'absolute', inset: 0, fontFamily: FONT }}>
    {PROPOSALS.map((proposal, index) => {
      const { x, y } = slot(index)
      const p = progress(frame, vo('agent.suggest', 0.8 + index * 0.3), 20)
      const risk = proposal.risk === 'medium'
      const glow = Math.max(0, Math.sin((frame - s(RISK)) / 8)) * (frame > s(RISK) && frame < s(RISK + 1.6) ? 1 : 0)
      const isApproved = index === 0 && approved > 0.5
      return <div key={proposal.type} style={{
        position: 'absolute', left: x, top: y, width: COL, height: CARD_H, padding: '18px 20px',
        borderRadius: R.card, background: t.surface, border: `1px solid ${isApproved ? t.metLine : t.line}`,
        display: 'flex', flexDirection: 'column', gap: 12, ...rise(p, 20),
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ minWidth: 0, color: t.inkFaint, font: `600 12.5px/1 ${FONT}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Agent proposal · <span style={{ fontFamily: MONO, fontWeight: 500 }}>{proposal.type}</span></span>
          <span style={{
            marginLeft: 'auto', flex: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 99,
            color: risk ? t.warningInk : t.successInk, font: `500 11.5px/1 ${MONO}`, letterSpacing: '0.06em',
            background: glow > 0 ? (risk ? t.closeSoft : t.metSoft) : 'transparent', transform: `scale(${1 + glow * 0.12})`,
          }}>{risk ? <TriangleAlert size={12} /> : <Info size={12} />} {risk ? 'MEDIUM RISK' : 'LOW RISK'}</span>
        </span>
        <span style={{ color: t.ink, font: `700 22px/1.18 ${FONT}`, letterSpacing: '-0.02em' }}>{proposal.title}</span>
        <span style={{ color: t.inkSoft, font: `400 15.5px/1.45 ${FONT}` }}>{proposal.why}</span>
        <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
          {isApproved
            ? <Badge tone="met" icon={Check} size={13.5} style={{ justifySelf: 'start' }}>Approved · runs next</Badge>
            : <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', color: t.inkFaint, font: `500 13.5px/1 ${FONT}`, opacity: progress(frame, s(WAITING + index * 0.12), 14) }}>
              <Dots frame={frame} size={7} /> Waiting for you
            </span>}
          <span style={{ justifySelf: 'end', display: 'flex', gap: 8, opacity: isApproved ? 0.4 : 1 }}>
            <Button variant="secondary" size={14}>Reject</Button>
            <Button icon={Check} size={14} pressed={index === 0 ? pressAt(frame, s(APPROVE)) : 0}>Approve action</Button>
          </span>
        </div>
      </div>
    })}

    {/* Every decision on record. */}
    {(() => {
      const { x, y } = slot(3)
      const p = progress(frame, vo('agent.suggest', 1.7), 20)
      const fresh = pop(frame, s(APPROVE + 0.25), { damping: 15, stiffness: 180 })
      const rows = [
        { verb: 'Approved', what: 'Throttle riverside.ac.uk to 1 request/s', who: 'admin', when: '2d ago', tone: 'met' as const },
        { verb: 'Rejected', what: 'Re-run the full Hartwell crawl', who: 'editor', when: '4d ago', tone: 'neutral' as const },
      ]
      return <div style={{ position: 'absolute', left: x, top: y, width: COL, height: CARD_H, padding: '18px 20px', borderRadius: R.card, border: `1.5px dashed ${t.line}`, display: 'grid', gap: 12, alignContent: 'start', ...rise(p, 20) }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: t.ink, font: `700 17px/1 ${FONT}` }}><ScrollText size={18} color={t.blue} /> Decision log</span>
        {fresh > 0.01 && <LogRow verb="Approved" what="Widen the Northbridge crawl to the fees pages" who="you" when="just now" tone="met" style={{ opacity: Math.min(1, fresh * 1.4), transform: `translateY(${(1 - fresh) * -14}px)` }} />}
        {rows.map((row) => <LogRow key={row.what} {...row} />)}
      </div>
    })()}

    <Cursor keys={keys} frame={frame} opacity={progress(frame, s(APPROVE - 1.0), 10)} />
  </div>
}

function LogRow({ verb, what, who, when, tone, style }: { verb: string; what: string; who: string; when: string; tone: 'met' | 'neutral'; style?: CSSProperties }) {
  const t = useTokens()
  return <div style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 12, background: t.surface2, ...style }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Badge tone={tone} size={12}>{verb}</Badge>
      <span style={{ marginLeft: 'auto', color: t.inkFaint, font: `500 12px/1 ${MONO}` }}>{who} · {when}</span>
    </span>
    <span style={{ color: t.ink, font: `600 14.5px/1.3 ${FONT}` }}>{what}</span>
  </div>
}

export function agentCues(): Cue[] {
  return [
    ...PROPOSALS.map((_, index) => ({ at: vo('agent.suggest', 0.8 + index * 0.3), name: 'pop' as const, volume: 0.16 })),
    { at: s(RISK), name: 'alert', volume: 0.12 },
    { at: s(APPROVE), name: 'click', volume: 0.3 },
    { at: s(APPROVE + 0.2), name: 'notify', volume: 0.24 },
  ]
}
