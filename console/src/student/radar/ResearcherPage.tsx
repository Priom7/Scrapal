// One researcher, in enough depth to decide whether to write to them.
//
// The "At a glance" column exists because that is the decision: can they
// supervise, do they have money, are they recruiting. Those three facts are
// buried in prose on almost every real faculty page, and digging them out is
// the work this page is meant to save.
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Banknote, Building2, CircleCheck, Clock, ExternalLink, FileText,
  GraduationCap, Handshake, MapPin, Quote, UserCheck,
} from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api'
import { ErrorState, Loading } from '../../brand'
import { ICON } from '../../lib'
import { linkTo, navigate } from '../../router'
import { useToast } from '../../toast'
import { SafeImage } from '../Avatar'
import { copyText } from '../clipboard'
import { TabList, TabPanel } from '../Tabs'
import { relativeDeadline } from './deadlines'

type ResearcherTab = 'Overview' | 'Publications' | 'PhD positions'

export function ResearcherPage({ id }: { id: string }) {
  const notify = useToast()
  const [tab, setTab] = useState<ResearcherTab>('Overview')
  const query = useQuery({
    queryKey: ['researcher', id],
    queryFn: () => api.researcher(id),
    retry: false,
  })

  if (query.isLoading) return <Loading>Opening this profile…</Loading>
  if (query.error || !query.data) {
    return <ErrorState
      title="That researcher could not be found"
      actions={<button type="button" className="student-button" onClick={() => navigate('/student/radar')}>
        Back to the Radar
      </button>}
    >
      The link may be out of date.
    </ErrorState>
  }

  const { researcher: person, publications, positions, labs } = query.data

  return <div className="researcher">
    <button type="button" className="student-back" onClick={() => history.back()}>
      <ArrowLeft size={ICON.sm} aria-hidden="true" /> Back
    </button>

    <header className="researcher-head">
      <span className="researcher-avatar">
        <SafeImage src={person.photo_url} alt="" fallback={<img src={person.avatar_url} alt="" />} />
      </span>
      <div className="researcher-identity">
        <h1>
          {person.name}
          {person.verified && <CircleCheck size={ICON.sm} className="verified" aria-label="Verified profile" />}
        </h1>
        <p>{person.title}</p>
        <p className="researcher-org">{person.institution}</p>
        <p className="researcher-meta">
          <span><MapPin size={ICON.xs} aria-hidden="true" /> {person.city}</span>
          <a href={person.website_url} target="_blank" rel="noreferrer">
            <ExternalLink size={ICON.xs} aria-hidden="true" /> {person.website_url.replace(/^https?:\/\//, '')}
          </a>
        </p>
        <ul className="researcher-topics">
          {person.topics.map((topic) => <li key={topic}>{topic}</li>)}
        </ul>
      </div>
      <div className="researcher-actions">
        {person.open_to_supervise && <span className="badge supervise">Open to supervise</span>}
        <button
          type="button"
          className="student-button primary"
          onClick={() => copyText(
            `${person.name}\n${person.title}, ${person.institution}\n${person.website_url}\nORCID ${person.orcid}`,
            'Copied',
            'Their details are on your clipboard.',
            notify,
          )}
        >
          <Quote size={ICON.sm} aria-hidden="true" /> Copy their details
        </button>
      </div>
    </header>

    <TabList
      className="researcher-tabs"
      label="About this researcher"
      active={tab}
      onChange={setTab}
      tabs={[
        { id: 'Overview' as const, label: 'Overview' },
        { id: 'Publications' as const, label: 'Publications', badge: publications.length },
        ...(positions.length > 0
          ? [{ id: 'PhD positions' as const, label: 'PhD positions', badge: positions.length }]
          : [{ id: 'PhD positions' as const, label: 'PhD positions' }]),
      ]}
    />

    <div className="researcher-body">
      <div className="researcher-main">
        <TabPanel id="Overview" active={tab === 'Overview'}>
          <>
          <section className="money-block">
            <h2>About</h2>
            <p className="researcher-about">{person.bio}</p>
            <p className="money-note">
              This summary is built from the topics on their published work. It is not a statement
              they have written about themselves, so read their own page before writing to them.
            </p>
          </section>
          {labs.length > 0 && <section className="money-block">
            <h2>Research group</h2>
            {labs.map((lab) => (
              <p key={lab.id} className="researcher-lab">
                <strong>{lab.name}</strong> · {lab.institution}
                {lab.recruiting && <span className="badge hiring">Recruiting</span>}
              </p>
            ))}
          </section>}
          </>
        </TabPanel>

        <TabPanel id="Publications" active={tab === 'Publications'}>
          <section className="money-block">
          <h2><FileText size={ICON.sm} aria-hidden="true" /> Publications</h2>
          <ul className="pub-list">
            {publications.map((paper) => (
              <li key={paper.id}>
                <strong>{paper.title}</strong>
                <span>{paper.venue} · {paper.year} · {paper.citations} citations</span>
                <ul className="pub-topics">
                  {paper.topics.map((topic) => <li key={topic}>{topic}</li>)}
                </ul>
              </li>
            ))}
          </ul>
          </section>
        </TabPanel>

        <TabPanel id="PhD positions" active={tab === 'PhD positions'}>
          <section className="money-block">
          <h2><GraduationCap size={ICON.sm} aria-hidden="true" /> Open positions</h2>
          {positions.length === 0
            ? <p className="money-note">
                Nothing advertised right now.
                {person.open_to_supervise && ' They are listed as open to supervise, so an enquiry is still worth sending.'}
              </p>
            : <ul className="pub-list">
                {positions.map((position) => (
                  <li key={position.id}>
                    <strong>{position.title}</strong>
                    <span>
                      {position.fully_funded ? 'Fully funded' : 'Self-funded'} ·{' '}
                      {position.currency} {position.stipend.toLocaleString('en-GB')} a year ·{' '}
                      {relativeDeadline(position.deadline)}
                    </span>
                    <a className="student-link" href={position.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={ICON.xs} aria-hidden="true" /> The listing
                    </a>
                  </li>
                ))}
              </ul>}
          </section>
        </TabPanel>
      </div>

      <aside className="at-a-glance">
        <h2>At a glance</h2>
        <ul>
          <li><Building2 size={ICON.sm} aria-hidden="true" /> {person.institution}</li>
          <li><MapPin size={ICON.sm} aria-hidden="true" /> {person.city}</li>
          <li><Clock size={ICON.sm} aria-hidden="true" /> {person.years_active} years in research</li>
          <li><FileText size={ICON.sm} aria-hidden="true" /> {person.publication_count} publications</li>
          <li><Quote size={ICON.sm} aria-hidden="true" /> h-index {person.h_index}</li>
          <li className={person.open_to_supervise ? 'yes' : 'no'}>
            <UserCheck size={ICON.sm} aria-hidden="true" />
            {person.open_to_supervise ? 'Open to supervise' : 'Not listed as supervising'}
          </li>
          <li className={person.has_funding ? 'yes' : 'no'}>
            <Banknote size={ICON.sm} aria-hidden="true" />
            {person.has_funding ? 'Has active funding' : 'No funding listed'}
          </li>
          <li className={person.open_to_collaborate ? 'yes' : 'no'}>
            <Handshake size={ICON.sm} aria-hidden="true" />
            {person.open_to_collaborate ? 'Open to collaborate' : 'Collaboration not stated'}
          </li>
        </ul>
        <p className="cost-source">ORCID {person.orcid}</p>
        <a className="student-button" {...linkTo('/student/radar')}>Back to your matches</a>
      </aside>
    </div>
  </div>
}
