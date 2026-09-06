import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { ICON } from '../lib'
import { useToast } from '../toast'
import { StudentAvatar } from './Avatar'
import { CLASS_LABELS, type Classification } from './match'
import {
  clearProfile, defaultAvatar, EMPTY_PROFILE, hasAnything, saveProfile, type StudentProfile,
} from './profile'

const MONTHS = ['January', 'May', 'September']

export function ProfilePage({ profile, onChange }: {
  profile: StudentProfile
  onChange: (profile: StudentProfile) => void
}) {
  const notify = useToast()
  const [draft, setDraft] = useState<StudentProfile>(profile)
  const set = <K extends keyof StudentProfile>(key: K, value: StudentProfile[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  return <div className="profile-page">
    {/* A profile with a face reads as yours; a column of inputs reads as a
        form someone is making you fill in. */}
    <header className="profile-identity">
      <StudentAvatar src={draft.avatarUrl} name={draft.name} size={76} />
      <div>
        <label className="profile-name">
          <span className="sr-only">Your name</span>
          <input
            value={draft.name ?? ''}
            onChange={(event) => set('name', event.target.value || null)}
            placeholder="Add your name"
          />
        </label>
        <p className="profile-lead">
          Four answers are enough to check most requirements. This stays in this browser — it is
          never sent anywhere, and you can delete it below.
        </p>
        <button
          type="button"
          className="student-link"
          onClick={() => set('avatarUrl', defaultAvatar(`${draft.name ?? 'you'}-${Date.now()}`))}
        >
          <RefreshCw size={ICON.xs} aria-hidden="true" /> Change picture
        </button>
      </div>
    </header>

    <form
      onSubmit={(event) => {
        event.preventDefault()
        onChange(draft)
        saveProfile(draft)
        notify({ title: 'Details saved', detail: 'Courses are now matched against them.' })
      }}
    >
      <fieldset>
        <legend>Where you are from</legend>
        <label>
          Home country
          <input
            value={draft.homeCountry ?? ''}
            onChange={(event) => set('homeCountry', event.target.value || null)}
            placeholder="e.g. Bangladesh"
          />
          <small>Used for fee status and visa rules, never shared.</small>
        </label>
      </fieldset>

      <fieldset>
        <legend>Your qualification</legend>
        <label>
          Degree result
          <select
            value={draft.classification ?? ''}
            onChange={(event) => set('classification', (event.target.value || null) as Classification | null)}
          >
            <option value="">Not saying yet</option>
            {(Object.keys(CLASS_LABELS) as Classification[]).map((key) => (
              <option key={key} value={key}>{CLASS_LABELS[key]}</option>
            ))}
          </select>
        </label>
        <label>
          UCAS points, if you are applying for a bachelor&rsquo;s
          <input
            type="number"
            min={0}
            max={300}
            inputMode="numeric"
            value={draft.ucasPoints ?? ''}
            onChange={(event) => set('ucasPoints', event.target.value === '' ? null : Number(event.target.value))}
            placeholder="e.g. 112"
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>English test</legend>
        <label>
          IELTS overall
          <input
            type="number" min={0} max={9} step={0.5} inputMode="decimal"
            value={draft.ieltsOverall ?? ''}
            onChange={(event) => set('ieltsOverall', event.target.value === '' ? null : Number(event.target.value))}
            placeholder="e.g. 6.5"
          />
        </label>
        <label>
          Your lowest single band
          <input
            type="number" min={0} max={9} step={0.5} inputMode="decimal"
            value={draft.ieltsLowest ?? ''}
            onChange={(event) => set('ieltsLowest', event.target.value === '' ? null : Number(event.target.value))}
            placeholder="e.g. 6.0"
          />
          <small>Most universities set a minimum for each band, not just the overall score.</small>
        </label>
      </fieldset>

      <fieldset>
        <legend>Money and timing</legend>
        <label>
          Most you can pay in tuition per year
          <input
            type="number" min={0} step={500} inputMode="numeric"
            value={draft.budget ?? ''}
            onChange={(event) => set('budget', event.target.value === '' ? null : Number(event.target.value))}
            placeholder="e.g. 20000"
          />
          <small>Tuition only. Living costs and the visa health surcharge come on top.</small>
        </label>
        <label>
          When you want to start
          <select value={draft.intake ?? ''} onChange={(event) => set('intake', event.target.value || null)}>
            <option value="">No preference</option>
            {MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
          </select>
        </label>
      </fieldset>

      <div className="profile-actions">
        <button type="submit" className="student-button primary">Save details</button>
        {hasAnything(profile) && (
          <button
            type="button"
            className="student-link danger"
            onClick={() => {
              clearProfile()
              setDraft(EMPTY_PROFILE)
              onChange(EMPTY_PROFILE)
              notify({ tone: 'info', title: 'Details deleted', detail: 'Nothing about you is stored on this device now.' })
            }}
          >
            Delete everything
          </button>
        )}
      </div>
    </form>
  </div>
}
