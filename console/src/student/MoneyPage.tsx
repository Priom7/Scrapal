import { Info, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { GalleryCourse } from '../api'
import { ICON } from '../lib'
import { linkTo } from '../router'
import { useToast } from '../toast'
import { modelCost, type CostModel } from './costs'
import { currencySwing, fundingPosition, maintenanceCheck, permittedWorkIncome, type FundingSource } from './funding'
import { saveProfile, type StudentProfile } from './profile'
import { useSaved } from './saved'

const money = (amount: number) => `£${Math.round(amount).toLocaleString('en-GB')}`

export function MoneyPage({ courses, loading, profile, onChange }: {
  courses: GalleryCourse[]
  loading: boolean
  profile: StudentProfile
  onChange: (profile: StudentProfile) => void
}) {
  const saved = useSaved()
  const notify = useToast()
  const find = linkTo('/student/find')
  const mine = courses.filter((course) => saved.includes(course.id))
  const [selectedId, setSelectedId] = useState<string>()
  const course = mine.find((item) => item.id === selectedId) ?? mine[0]

  const update = (patch: Partial<StudentProfile>) => {
    const next = { ...profile, ...patch }
    onChange(next)
    saveProfile(next)
  }

  if (loading) return <p className="find-count">Loading…</p>

  if (!mine.length) {
    return <div className="student-empty">
      <h2>Save a course first</h2>
      <p>
        Money only means something against a specific course. Save one and this works out what it
        costs across the whole degree — tuition, living, visa and health surcharge — and what you
        still need to find.
      </p>
      <a className="student-button" {...find}>Find courses</a>
    </div>
  }

  const cost = modelCost(course, { flights: profile.flights ?? undefined })
  const position = fundingPosition(profile.funding, cost.total)
  const visa = maintenanceCheck(course, profile.heldFunds)
  const work = permittedWorkIncome()

  return <div className="money-page">
    <p className="money-lead">
      Over the whole course, not the first year. Figures read from the university are marked apart
      from reference figures.
    </p>

    {mine.length > 1 && (
      <label className="money-picker">
        <span className="sr-only">Course to work out</span>
        <select value={course.id} onChange={(event) => setSelectedId(event.target.value)}>
          {mine.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.institution.name}</option>)}
        </select>
      </label>
    )}

    <CostBreakdown cost={cost} course={course} />

    <Funding
      sources={profile.funding}
      total={cost.total}
      position={position}
      onChange={(funding) => update({ funding })}
      notify={(title, detail) => notify({ title, detail })}
    />

    <section className="money-block">
      <h2>Working while you study</h2>
      <p className="money-note">
        A student visa allows {work.hoursPerWeek} hours a week in term time. At £{work.wage.toFixed(2)} an hour
        over about {work.weeks} teaching weeks, that is around <strong>{money(work.perYear)} a year</strong>.
      </p>
      {/* The point students are most often misled on, so it is stated plainly
          rather than left as a footnote. */}
      <p className="money-warn">
        <Info size={ICON.xs} aria-hidden="true" />
        This cannot be counted toward the money a visa requires you to hold. Plan without it, then treat it as relief.
      </p>
    </section>

    <VisaCheck check={visa} heldFunds={profile.heldFunds} onHeld={(heldFunds) => update({ heldFunds })} />

    <Currency
      totalGbp={cost.total}
      currency={profile.homeCurrency}
      rate={profile.exchangeRate}
      onChange={(patch) => update(patch)}
    />
  </div>
}

function CostBreakdown({ cost, course }: { cost: CostModel; course: GalleryCourse }) {
  return <section className="money-block">
    <h2>{course.title}, over {cost.years === 1 ? 'one year' : `${cost.years} years`}</h2>
    <ul className="cost-lines">
      {cost.lines.map((line) => (
        <li key={line.id} className={line.origin}>
          <span className="cost-label">
            {line.label}
            <span className={`origin-tag ${line.origin}`}>
              {line.origin === 'course' ? 'from the university' : 'reference figure'}
            </span>
          </span>
          <span className="cost-detail">{line.detail}</span>
          <span className="cost-amount">{money(line.amount)}</span>
          {line.source && <span className="cost-source">{line.source}{line.checked ? `, checked ${line.checked}` : ''}</span>}
        </li>
      ))}
    </ul>
    <p className="cost-total"><span>Total</span> <strong>{money(cost.total)}</strong></p>
    {cost.feeMissing && (
      <p className="money-warn">
        <Info size={ICON.xs} aria-hidden="true" />
        This university has not published a tuition fee, so the total above leaves it out.
      </p>
    )}
  </section>
}

function Funding({ sources, total, position, onChange, notify }: {
  sources: FundingSource[]
  total: number
  position: ReturnType<typeof fundingPosition>
  onChange: (sources: FundingSource[]) => void
  notify: (title: string, detail: string) => void
}) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')

  return <section className="money-block">
    <h2>What you can cover</h2>
    <ul className="funding-list">
      {sources.map((source) => (
        <li key={source.id}>
          <span>{source.label}</span>
          <span className="funding-amount">{money(source.amount)}</span>
          <button
            type="button"
            aria-label={`Remove ${source.label}`}
            onClick={() => {
              onChange(sources.filter((item) => item.id !== source.id))
              notify('Removed', `${source.label} is no longer counted.`)
            }}
          >
            <X size={ICON.xs} />
          </button>
        </li>
      ))}
      {sources.length === 0 && <li className="funding-empty">Nothing added yet.</li>}
    </ul>

    <form
      className="funding-add"
      onSubmit={(event) => {
        event.preventDefault()
        const value = Number(amount)
        if (!label.trim() || !Number.isFinite(value) || value <= 0) return
        onChange([...sources, { id: `f-${Date.now()}`, label: label.trim(), amount: value, countsForVisa: true }])
        notify('Added', `${label.trim()}, ${money(value)}.`)
        setLabel('')
        setAmount('')
      }}
    >
      <label>
        <span className="sr-only">Where the money comes from</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Savings, family, loan…" />
      </label>
      <label>
        <span className="sr-only">Amount</span>
        <input
          type="number" min={0} step={100} inputMode="numeric"
          value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount"
        />
      </label>
      <button type="submit" className="student-button"><Plus size={ICON.xs} aria-hidden="true" /> Add</button>
    </form>

    {/* The same idiom as the entry requirements: a named gap, never a score. */}
    <p className={`funding-verdict ${position.covered ? 'good' : 'short'}`}>
      {position.covered
        ? `Covered. You have ${money(position.funded)} against ${money(total)}.`
        : `${money(position.gap)} short. You have ${money(position.funded)} against ${money(total)}.`}
    </p>
  </section>
}

function VisaCheck({ check, heldFunds, onHeld }: {
  check: ReturnType<typeof maintenanceCheck>
  heldFunds: number | null
  onHeld: (value: number | null) => void
}) {
  return <section className="money-block">
    <h2>Money a visa asks you to hold</h2>
    {!check.applies
      ? <p className="money-note">{check.reason}</p>
      : <>
          <p className="money-note">
            Separate from whether you can afford the course: a visa officer checks you have held a
            specific amount for {check.heldForDays} days in a row.
          </p>
          <label className="held-input">
            What you hold now
            <input
              type="number" min={0} step={500} inputMode="numeric"
              value={heldFunds ?? ''}
              onChange={(event) => onHeld(event.target.value === '' ? null : Number(event.target.value))}
              placeholder="e.g. 22000"
            />
          </label>
          <ul className="visa-lines">
            <li><span>Living, {check.months} months</span><span>{money(check.livingElement)}</span></li>
            <li><span>First-year tuition still owed</span><span>{money(check.tuitionElement)}</span></li>
            <li className="visa-total"><span>Required</span><span>{money(check.required)}</span></li>
          </ul>
          <p className={`funding-verdict ${check.passes ? 'good' : 'short'}`}>
            {check.passes
              ? `You hold enough, as long as it has been in the account for ${check.heldForDays} days.`
              : `${money(check.shortfall)} short of the amount you must hold.`}
          </p>
          <p className="cost-source">{check.source}, checked {check.checked}</p>
        </>}
  </section>
}

function Currency({ totalGbp, currency, rate, onChange }: {
  totalGbp: number
  currency: string | null
  rate: number | null
  onChange: (patch: Partial<StudentProfile>) => void
}) {
  const swing = rate ? currencySwing(totalGbp, rate) : null
  return <section className="money-block">
    <h2>If the exchange rate moves</h2>
    <p className="money-note">
      The course is priced in pounds; your savings are not. A rate move changes what this costs you
      even when nothing about the course changes.
    </p>
    <div className="currency-inputs">
      <label>
        Your currency
        <input
          value={currency ?? ''}
          onChange={(event) => onChange({ homeCurrency: event.target.value.toUpperCase().slice(0, 4) || null })}
          placeholder="BDT"
        />
      </label>
      <label>
        Per £1
        <input
          type="number" min={0} step={0.01} inputMode="decimal"
          value={rate ?? ''}
          onChange={(event) => onChange({ exchangeRate: event.target.value === '' ? null : Number(event.target.value) })}
          placeholder="e.g. 148"
        />
      </label>
    </div>
    {swing && currency && (
      <ul className="swing-lines">
        <li><span>At today&rsquo;s rate</span><span>{swing.now.toLocaleString('en-GB')} {currency}</span></li>
        <li className="worse">
          <span>If the pound rises {swing.movePercent}%</span>
          <span>{swing.worse.toLocaleString('en-GB')} {currency}</span>
        </li>
        <li><span>If it falls {swing.movePercent}%</span><span>{swing.better.toLocaleString('en-GB')} {currency}</span></li>
      </ul>
    )}
  </section>
}
