import { ArrowUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { GalleryCourse } from '../../api'
import { ICON } from '../../lib'
import { ScrapalAvatar, StudentAvatar } from '../Avatar'
import { saveProfile, type StudentProfile } from '../profile'
import { CardView } from './cards'
import { answer, chipsFor, initialState, resume, start } from './engine'
import { clearThread, loadThread, saveThread, sinceLabel } from './persist'
import type { Message, PlannerState } from './types'

export function Planner({ courses, loading, profile, onProfile }: {
  courses: GalleryCourse[]
  loading: boolean
  profile: StudentProfile
  onProfile: (profile: StudentProfile) => void
}) {
  const [state, setState] = useState<PlannerState>(() => initialState(profile))
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const threadEnd = useRef<HTMLDivElement>(null)
  const opened = useRef(false)

  // Scrapal speaks first. Waiting for the student to open is the cold-start
  // problem a blank form has, wearing different clothes.
  useEffect(() => {
    if (opened.current || loading) return
    opened.current = true
    const saved = loadThread()
    setState(saved
      ? resume(saved.state, sinceLabel(saved.savedAt), { state: saved.state, courses })
      : start({ state: initialState(profile), courses }))
    // profile is the seed only; later edits flow the other way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Every turn is saved, so closing the tab costs nothing.
  useEffect(() => {
    if (state.messages.length) saveThread(state)
  }, [state])

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [state.messages, thinking])

  const send = (text: string, display?: string) => {
    const said = text.trim()
    if (!said || thinking) return
    setDraft('')
    // A short pause reads as considered; a long one reads as broken.
    setThinking(true)
    const next = answer(state, said, { state, courses }, display)
    window.setTimeout(() => {
      setState(next)
      setThinking(false)
      onProfile(next.profile)
      saveProfile(next.profile)
    }, 420)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    send(draft)
  }

  const chips = useMemo(() => (thinking ? [] : chipsFor(state)), [state, thinking])
  // A conversation that has barely started is a welcome screen, not a
  // transcript: centring it stops the premium surface opening on a void.
  const opening = state.messages.length <= 2

  return <div className={`planner ${opening ? 'is-opening' : ''}`}>
    <div className="thread" role="log" aria-live="polite" aria-label="Your conversation with Scrapal">
      {state.messages.map((message, index) => (
        <Bubble
          key={message.id}
          message={message}
          courses={courses}
          profile={state.profile}
          onSend={send}
          // Only the first bubble in a run is badged, so a sequence reads as
          // one voice rather than a queue of notifications.
          showMark={state.messages[index - 1]?.from !== message.from}
        />
      ))}
      {thinking && (
        <div className="bubble scrapal thinking" aria-hidden="true"><span /><span /><span /></div>
      )}
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={chip.tone === 'skip' ? 'skip' : ''}
              onClick={() => send(chip.value ?? chip.label, chip.label)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
      <div ref={threadEnd} />
    </div>

    <form className="composer" onSubmit={submit}>
      <label className="sr-only" htmlFor="planner-input">Your reply</label>
      <input
        id="planner-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Type your answer, or tap one above"
        autoComplete="off"
      />
      <button type="submit" aria-label="Send" disabled={!draft.trim() || thinking}>
        <ArrowUp size={ICON.md} />
      </button>
    </form>

    {!opening && (
      <div className="thread-tools">
        <button
          type="button"
          onClick={() => {
            clearThread()
            setState(start({ state: initialState(profile), courses }))
          }}
        >
          Start a new conversation
        </button>
      </div>
    )}
  </div>
}

function Bubble({ message, courses, profile, onSend, showMark }: {
  message: Message
  courses: GalleryCourse[]
  profile: StudentProfile
  onSend: (text: string, display?: string) => void
  showMark: boolean
}) {
  if (message.card) {
    // A card is not speech, so it takes the full width rather than sitting in
    // the speaker column with an empty badge beside it.
    return <div className="turn card">
      <div className="bubble card-bubble">
        <CardView card={message.card} courses={courses} profile={profile} onSend={onSend} />
      </div>
    </div>
  }
  return <div className={`turn ${message.from}`}>
    <span className={`turn-face ${showMark ? '' : 'hidden'}`}>
      {message.from === 'scrapal'
        ? <ScrapalAvatar />
        : <StudentAvatar src={profile.avatarUrl} name={profile.name} />}
    </span>
    <div className={`bubble ${message.from}`}><p>{message.text}</p></div>
  </div>
}
