// The researcher card, shared by the Radar and the People directory.
import {
  Banknote, Building2, CalendarClock, CircleCheck, ExternalLink, FileText, GraduationCap,
  Handshake, MapPin, Sparkles, UserCheck, Users,
} from 'lucide-react'
import type { MatchReason, Publication, Researcher } from '../../api'
import { ICON } from '../../lib'
import { linkTo } from '../../router'
import { SafeImage } from '../Avatar'
import { SaveButton } from './SaveButton'

export function Score({ value }: { value: number }) {
  // A ring rather than a bar: it sits beside a name without taking a row, and
  // the number is always written out so the shape is never the only signal.
  return <span
    className="fit-ring"
    // A bare number: the stylesheet turns it into a percentage with
    // calc(var(--fit) * 1%). Setting "82%" here made that calc percentage times
    // percentage, which is invalid, so the whole conic gradient was dropped and
    // the ring silently never drew.
    style={{ ['--fit' as string]: value }}
    role="img"
    aria-label={`${value} per cent research fit`}
  >
    <b>{value}%</b>
    <small>fit</small>
  </span>
}

const REASON_ICONS: Record<string, typeof FileText> = {
  'Shared research area': Sparkles,
  'Matches your topics': Sparkles,
  'Related publications': FileText,
  'Open position': GraduationCap,
  Availability: UserCheck,
  'Same discipline': Building2,
  Supervisor: UserCheck,
  Deadline: CalendarClock,
  Funding: Banknote,
  Cover: Banknote,
  'Led by': UserCheck,
  Recruiting: Users,
}

export function Reasons({ reasons }: { reasons: MatchReason[] }) {
  return <ul className="why">
    {reasons.map((reason) => {
      const Icon = REASON_ICONS[reason.label] ?? Sparkles
      return <li key={reason.label}>
        <Icon size={ICON.xs} aria-hidden="true" />
        <b>{reason.label}</b>
        <span>{reason.detail}</span>
      </li>
    })}
  </ul>
}

/**
 * One researcher, as a card.
 *
 * The Radar hands it a score and the reasons behind it; the People directory
 * has neither, because nothing has been matched against. Both need the same
 * person rendered the same way, so the match is what is optional here rather
 * than there being two cards that drift apart.
 */
export function PersonCard({ person, score, reasons, publications = [] }: {
  person: Researcher
  score?: number
  reasons?: MatchReason[]
  publications?: Publication[]
}) {
  // The strongest signal first, not the most common one. Most people here are
  // open to supervise, so leading with that made every card say the same thing;
  // money and an advertised place are rarer and decide more.
  const standing = person.hiring_phd
    ? { label: 'Hiring PhD students', tone: 'hiring', icon: GraduationCap }
    : person.has_funding
      ? { label: 'Has funding', tone: 'funded', icon: Banknote }
      : person.open_to_supervise
        ? { label: 'Open to supervise', tone: 'supervise', icon: UserCheck }
        : { label: 'Open to collaborate', tone: 'collab', icon: Handshake }
  const Standing = standing.icon

  return <article className="match-card person">
    <span className={`card-standing ${standing.tone}`}>
      <Standing size={ICON.xs} aria-hidden="true" /> {standing.label}
    </span>

    <header>
      <span className="match-portrait">
        <SafeImage
          src={person.photo_url}
          alt=""
          fallback={<img src={person.avatar_url} alt="" />}
        />
      </span>
      <div className="match-title">
        <h3>
          <a {...linkTo(`/student/researchers/${person.id}`)}>{person.name}</a>
          {person.verified && <CircleCheck size={ICON.xs} className="verified" aria-label="Verified profile" />}
        </h3>
        <p>{person.title}</p>
        <p className="match-where">
          <Building2 size={ICON.xs} aria-hidden="true" /> {person.institution}
        </p>
        <p className="match-where">
          <MapPin size={ICON.xs} aria-hidden="true" /> {person.city}
        </p>
      </div>
      {score !== undefined && <Score value={score} />}
    </header>

    <ul className="topic-pills">
      {person.topics.slice(0, 3).map((topic) => <li key={topic}>{topic}</li>)}
      {person.topics.length > 3 && <li className="more">+{person.topics.length - 3}</li>}
    </ul>

    <p className="match-bio">{person.bio}</p>

    {reasons && reasons.length > 0 && <Reasons reasons={reasons} />}

    {publications.length > 0 && <details className="match-evidence">
      <summary><FileText size={ICON.xs} aria-hidden="true" /> {publications.length} related publication{publications.length === 1 ? '' : 's'}</summary>
      <ul>
        {publications.map((paper) => (
          <li key={paper.id}>
            <span>{paper.title}</span>
            <small>{paper.venue} · {paper.year} · {paper.citations} citations</small>
          </li>
        ))}
      </ul>
    </details>}

    <div className="match-actions">
      <a className="student-button primary" {...linkTo(`/student/researchers/${person.id}`)}>
        <UserCheck size={ICON.xs} aria-hidden="true" /> View profile
      </a>
      <a className="student-button" href={person.website_url} target="_blank" rel="noreferrer">
        <ExternalLink size={ICON.xs} aria-hidden="true" /> Their page
      </a>
      <SaveButton id={person.id} kind="researcher" label={person.name} />
    </div>
  </article>
}
