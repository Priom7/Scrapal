// Deterministic fixtures for the Research Opportunity Radar.
//
// The topic strings here are drawn from the same vocabulary the fingerprint
// produces, because that is the join: a match is a named overlap between what a
// student wrote and what a researcher, call or position is about. Inventing
// topics that the fingerprint can never emit would make the matcher look
// cleverer than it is and hide real bugs.
import type {
  FundingCall, Lab, PhdPosition, Publication, Researcher,
} from '../api'

function rng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function pick<T>(random: () => number, values: T[]): T {
  return values[Math.floor(random() * values.length)]
}

/** Offline-safe portrait: initials on a brand-family ground. The UI puts a real
    photo in front of this where one loads. */
function initialsPlate(initials: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">`
    + `<rect width="96" height="96" fill="${color}"/>`
    + `<text x="48" y="59" font-family="Inter,system-ui,sans-serif" font-size="32" font-weight="600" `
    + `fill="#fff" text-anchor="middle">${initials}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const PLACES = [
  { institution: 'University of Oxford', city: 'Oxford', country: 'GB', domain: 'ox.ac.uk' },
  { institution: 'University of Cambridge', city: 'Cambridge', country: 'GB', domain: 'cam.ac.uk' },
  { institution: 'Imperial College London', city: 'London', country: 'GB', domain: 'imperial.ac.uk' },
  { institution: 'University of Edinburgh', city: 'Edinburgh', country: 'GB', domain: 'ed.ac.uk' },
  { institution: 'ETH Zurich', city: 'Zurich', country: 'CH', domain: 'ethz.ch' },
  { institution: 'The University of Tokyo', city: 'Tokyo', country: 'JP', domain: 'u-tokyo.ac.jp' },
  { institution: 'University of Toronto', city: 'Toronto', country: 'CA', domain: 'utoronto.ca' },
  { institution: 'TU Delft', city: 'Delft', country: 'NL', domain: 'tudelft.nl' },
  { institution: 'KTH Royal Institute of Technology', city: 'Stockholm', country: 'SE', domain: 'kth.se' },
  { institution: 'Trinity College Dublin', city: 'Dublin', country: 'IE', domain: 'tcd.ie' },
]

const COLORS = ['#465cff', '#3fa7e8', '#34a8d8', '#20c998', '#42cfa0', '#6532d9']

/** Name, title, and the topics that researcher actually works on. */
const PEOPLE: { name: string; title: string; topics: string[]; discipline: string; portrait: string }[] = [
  { name: 'Prof. Sarah Mitchell', title: 'Professor of Computer Science', discipline: 'Computer Science', topics: ['machine learning', 'explainable AI', 'responsible AI', 'graph neural networks'] , portrait: 'women/44' },
  { name: 'Prof. Kenji Tanaka', title: 'Professor of Environmental Science', discipline: 'Environmental Science', topics: ['climate science', 'sustainability', 'simulation'] , portrait: 'men/46' },
  { name: 'Dr Aisha Rahman', title: 'Senior Research Fellow', discipline: 'Computer Science', topics: ['healthcare', 'machine learning', 'explainable AI'] , portrait: 'women/68' },
  { name: 'Prof. Daniel Weber', title: 'Professor of Robotics', discipline: 'Engineering', topics: ['robotics', 'reinforcement learning', 'computer vision'] , portrait: 'men/32' },
  { name: 'Dr Mei Lin', title: 'Reader in Data Science', discipline: 'Statistics', topics: ['causal inference', 'social good', 'responsible AI'] , portrait: 'women/79' },
  { name: 'Prof. James Carter', title: 'Professor of Quantum Technologies', discipline: 'Physics', topics: ['quantum computing', 'materials science'] , portrait: 'men/52' },
  { name: 'Dr Priya Nair', title: 'Lecturer in Financial Computing', discipline: 'Computer Science', topics: ['graph neural networks', 'financial fraud detection', 'anomaly detection', 'network science'] , portrait: 'women/26' },
  { name: 'Prof. Lucas Moreau', title: 'Professor of Network Science', discipline: 'Computer Science', topics: ['network science', 'graph neural networks', 'time series analysis'] , portrait: 'men/75' },
  { name: 'Dr Hannah Okafor', title: 'Associate Professor of Security', discipline: 'Computer Science', topics: ['cybersecurity', 'anomaly detection', 'machine learning'] , portrait: 'women/12' },
  { name: 'Prof. Elena Rossi', title: 'Chair in Applied Statistics', discipline: 'Statistics', topics: ['bayesian statistics', 'time series analysis', 'causal inference'] , portrait: 'women/56' },
  { name: 'Dr Omar Haddad', title: 'Research Fellow in FinTech', discipline: 'Computer Science', topics: ['financial fraud detection', 'network science', 'responsible AI'] , portrait: 'men/86' },
  { name: 'Prof. Ingrid Larsen', title: 'Professor of Climate Modelling', discipline: 'Environmental Science', topics: ['climate science', 'simulation', 'time series analysis'] , portrait: 'women/33' },
  { name: 'Dr Marcus Bell', title: 'Senior Lecturer in NLP', discipline: 'Computer Science', topics: ['natural language processing', 'transformers', 'responsible AI'] , portrait: 'men/29' },
  { name: 'Prof. Yuki Sato', title: 'Professor of Bioinformatics', discipline: 'Biochemistry', topics: ['drug discovery', 'deep learning', 'graph neural networks'] , portrait: 'men/11' },
  { name: 'Dr Clara Novak', title: 'Assistant Professor of Public Policy', discipline: 'Social Science', topics: ['public policy', 'causal inference', 'social good'] , portrait: 'women/90' },
  { name: 'Prof. Adeola Balogun', title: 'Professor of Medical Imaging', discipline: 'Medicine', topics: ['healthcare', 'computer vision', 'deep learning'] , portrait: 'men/40' },
  { name: 'Dr Tomasz Kowalski', title: 'Lecturer in Machine Learning', discipline: 'Computer Science', topics: ['federated learning', 'machine learning', 'responsible AI'] , portrait: 'men/18' },
  { name: 'Prof. Sofia Almeida', title: 'Professor of Education Technology', discipline: 'Education', topics: ['education', 'qualitative methods', 'machine learning'] , portrait: 'women/50' },
  { name: 'Dr Rajesh Iyer', title: 'Reader in Materials Informatics', discipline: 'Materials Science', topics: ['materials science', 'deep learning', 'simulation'] , portrait: 'men/94' },
  { name: 'Prof. Nadia Petrova', title: 'Professor of Health Data Science', discipline: 'Medicine', topics: ['healthcare', 'randomised controlled trials', 'causal inference'] , portrait: 'women/8' },
  { name: 'Dr Felix Andersson', title: 'Research Fellow in Anomaly Detection', discipline: 'Computer Science', topics: ['anomaly detection', 'time series analysis', 'graph neural networks'] , portrait: 'men/60' },
  { name: 'Prof. Grace Adeyemi', title: 'Professor of Sustainable Engineering', discipline: 'Environmental Science', topics: ['sustainability', 'materials science', 'simulation'] , portrait: 'women/72' },
  { name: 'Dr Leo Fontaine', title: 'Lecturer in Human-Robot Interaction', discipline: 'Engineering', topics: ['robotics', 'qualitative methods', 'responsible AI'] , portrait: 'men/22' },
  { name: 'Prof. Wei Zhang', title: 'Professor of Financial Mathematics', discipline: 'Statistics', topics: ['financial fraud detection', 'bayesian statistics', 'time series analysis'] , portrait: 'men/83' },
]

const BIOS: Record<string, string> = {
  'graph neural networks': 'Building graph learning methods that hold up on messy, real-world networks.',
  'financial fraud detection': 'Detecting fraud and laundering patterns in large transaction networks.',
  'climate science': 'Modelling climate resilience with data science and environmental policy.',
  robotics: 'Creating robots that work alongside people, with several PhD positions available.',
  healthcare: 'Developing AI tools for earlier diagnosis, with clinical partners.',
  'quantum computing': 'Exploring the next generation of quantum technologies and materials.',
  'natural language processing': 'Language models that can be inspected, corrected and trusted.',
  cybersecurity: 'Finding intrusions and novel attacks before they become incidents.',
  'public policy': 'Using causal methods to test what policy actually changes.',
  education: 'Studying how learning technology helps, and where it quietly does not.',
}

/** Only the lead topic may set the summary. Scanning the whole list for any
    known topic gave a bioinformatician the graph-learning blurb, because
    "graph neural networks" appeared third in their list — a description that
    was quietly wrong about the person it named. */
function bioFor(topics: string[]): string {
  return BIOS[topics[0]] ?? `Working across ${topics.slice(0, 2).join(' and ')}, and open to new collaborations.`
}

export const researchers: Researcher[] = PEOPLE.map((person, index) => {
  const random = rng(9001 + index * 37)
  const place = PLACES[index % PLACES.length]
  const initials = person.name.replace(/^(Prof\.|Dr)\s+/, '').split(/\s+/).map((part) => part[0]).join('')
  const slug = person.name.toLowerCase().replace(/^(prof\.|dr)\s+/, '').replace(/[^a-z]+/g, '-')
  return {
    id: `r-${slug}`,
    name: person.name,
    title: person.title,
    institution: place.institution,
    city: place.city,
    country_code: place.country,
    // A real photograph, with the initials plate behind it. randomuser.me is a
    // network call, so nothing depends on it loading.
    photo_url: `https://randomuser.me/api/portraits/${person.portrait}.jpg`,
    avatar_url: initialsPlate(initials, COLORS[index % COLORS.length]),
    website_url: `https://www.${place.domain}/~${slug.split('-')[0]}`,
    orcid: `0000-000${1 + (index % 9)}-${1000 + index * 7}-${2000 + index * 3}`,
    verified: index % 4 !== 3,
    discipline: person.discipline,
    topics: person.topics,
    bio: bioFor(person.topics),
    publication_count: 40 + Math.floor(random() * 140),
    h_index: 12 + Math.floor(random() * 48),
    years_active: 4 + Math.floor(random() * 26),
    open_to_supervise: index % 3 !== 2,
    hiring_phd: index % 4 === 0 || index % 7 === 1,
    has_funding: index % 3 === 0,
    open_to_collaborate: index % 2 === 0,
  }
})

const VENUES = ['NeurIPS', 'ICML', 'ICLR', 'KDD', 'Nature Communications', 'PNAS', 'AAAI', 'The Web Conference']

/** Titles are assembled from the topics themselves so a publication list always
    justifies the match it is offered as evidence for. */
function paperTitle(random: () => number, topics: string[]): string {
  const shapes = [
    (a: string, b: string) => `${cap(a)} for ${b}`,
    (a: string, b: string) => `Towards robust ${a} in ${b}`,
    (a: string, b: string) => `A benchmark for ${a} and ${b}`,
    (a: string, b: string) => `Scaling ${a} to real-world ${b}`,
  ]
  const [a, b] = [topics[0], topics[1] ?? topics[0]]
  return pick(random, shapes)(a, b)
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export const publications: Publication[] = researchers.flatMap((researcher, index) => {
  const random = rng(4400 + index * 91)
  const count = 3 + Math.floor(random() * 3)
  return Array.from({ length: count }, (_, n) => {
    const topics = [...researcher.topics].sort(() => random() - 0.5).slice(0, 2)
    return {
      id: `p-${researcher.id}-${n}`,
      researcher_id: researcher.id,
      title: paperTitle(random, topics),
      year: 2019 + Math.floor(random() * 7),
      venue: pick(random, VENUES),
      citations: Math.floor(random() * 420),
      doi: `10.5555/scrapal.${index}.${n}`,
      topics,
    }
  })
})

const FUNDERS = [
  { name: 'UKRI — EPSRC', short: 'EPSRC', country: 'GB' },
  { name: 'European Commission — Horizon Europe', short: 'Horizon', country: 'EU' },
  { name: 'Wellcome Trust', short: 'Wellcome', country: 'GB' },
  { name: 'Leverhulme Trust', short: 'Leverhulme', country: 'GB' },
  { name: 'Swiss National Science Foundation', short: 'SNSF', country: 'CH' },
  { name: 'Science Foundation Ireland', short: 'SFI', country: 'IE' },
]

const CALLS: { name: string; kind: FundingCall['kind']; topics: string[]; funded: boolean }[] = [
  { name: 'Doctoral Training Partnership', kind: 'phd', topics: ['machine learning', 'responsible AI', 'graph neural networks'], funded: true },
  { name: 'Marie Skłodowska-Curie Postdoctoral Fellowship', kind: 'fellowship', topics: ['machine learning', 'network science', 'climate science'], funded: true },
  { name: 'PhD Studentships in Health Data Science', kind: 'phd', topics: ['healthcare', 'causal inference', 'machine learning'], funded: true },
  { name: 'Future Leaders Fellowship', kind: 'fellowship', topics: ['responsible AI', 'explainable AI', 'public policy'], funded: true },
  { name: 'Open Research Grant in Financial Computing', kind: 'grant', topics: ['financial fraud detection', 'anomaly detection', 'network science'], funded: false },
  { name: 'Sustainability and Net Zero Programme', kind: 'grant', topics: ['sustainability', 'climate science', 'materials science'], funded: false },
  { name: 'Quantum Technologies Doctoral Award', kind: 'phd', topics: ['quantum computing', 'materials science'], funded: true },
  { name: 'Robotics and Autonomous Systems Call', kind: 'grant', topics: ['robotics', 'reinforcement learning', 'computer vision'], funded: false },
  { name: 'Language Technology Studentship', kind: 'phd', topics: ['natural language processing', 'transformers'], funded: true },
  { name: 'Cyber Resilience Research Fund', kind: 'grant', topics: ['cybersecurity', 'anomaly detection'], funded: false },
  { name: 'Early Career Fellowship in Statistics', kind: 'fellowship', topics: ['bayesian statistics', 'time series analysis', 'causal inference'], funded: true },
  { name: 'Education Futures Scholarship', kind: 'scholarship', topics: ['education', 'qualitative methods'], funded: true },
  { name: 'Drug Discovery Accelerator', kind: 'grant', topics: ['drug discovery', 'deep learning'], funded: false },
  { name: 'Global Challenges Scholarship', kind: 'scholarship', topics: ['social good', 'public policy', 'sustainability'], funded: true },
  { name: 'Federated Learning Industrial Partnership', kind: 'grant', topics: ['federated learning', 'responsible AI'], funded: false },
  { name: 'Graph Learning Doctoral Cluster', kind: 'phd', topics: ['graph neural networks', 'network science', 'anomaly detection'], funded: true },
]

/** Deadlines are generated relative to now so "closes in 18 days" is always
    true when it is read, rather than true on the day the fixture was written. */
function deadlineIn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

export const fundingCalls: FundingCall[] = CALLS.map((call, index) => {
  const random = rng(7700 + index * 53)
  const funder = FUNDERS[index % FUNDERS.length]
  return {
    id: `f-${index}`,
    name: `${funder.short} ${call.name}`,
    funder: funder.name,
    kind: call.kind,
    country_code: funder.country,
    topics: call.topics,
    fully_funded: call.funded,
    amount: call.kind === 'grant'
      ? 150_000 + Math.floor(random() * 20) * 25_000
      : 18_000 + Math.floor(random() * 12) * 1_000,
    // Ireland is in the euro area; falling through to GBP had Science
    // Foundation Ireland quoting sterling.
    currency: funder.country === 'CH' ? 'CHF' : funder.country === 'EU' || funder.country === 'IE' ? 'EUR' : 'GBP',
    // A spread from "closes this month" to "next year", so the urgency sorting
    // has something to sort.
    deadline: deadlineIn(9 + index * 17 + Math.floor(random() * 9)),
    url: `https://example.org/funding/${index}`,
    summary: `Supports ${call.topics.slice(0, 2).join(' and ')} across ${
      call.kind === 'phd' ? 'doctoral training' : call.kind === 'fellowship' ? 'early-career fellowships' : 'research projects'
    }.`,
  }
})

export const labs: Lab[] = researchers
  .filter((_, index) => index % 2 === 0)
  .map((researcher, index) => ({
    id: `l-${index}`,
    name: `${researcher.topics[0].split(' ').map(cap).join(' ')} Group`,
    institution: researcher.institution,
    lead_id: researcher.id,
    topics: researcher.topics,
    recruiting: index % 3 !== 1,
  }))

export const phdPositions: PhdPosition[] = researchers
  .filter((researcher) => researcher.hiring_phd)
  .map((researcher, index) => {
    const random = rng(3300 + index * 29)
    return {
      id: `phd-${index}`,
      title: `PhD in ${researcher.topics.slice(0, 2).map(cap).join(' and ')}`,
      supervisor_id: researcher.id,
      institution: researcher.institution,
      country_code: researcher.country_code,
      topics: researcher.topics,
      fully_funded: index % 3 !== 2,
      stipend: 19_000 + Math.floor(random() * 6) * 500,
      currency: researcher.country_code === 'CH' ? 'CHF' : 'GBP',
      deadline: deadlineIn(14 + index * 23 + Math.floor(random() * 11)),
      url: `https://example.org/phd/${index}`,
    }
  })
