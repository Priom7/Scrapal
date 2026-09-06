// Deterministic fixtures for VITE_MOCK=1. Every value is derived from a seeded
// PRNG so a reload shows the same catalogue: screenshots stay comparable and a
// filter bug cannot hide behind reshuffled data.
import type {
  Collection,
  GalleryCourse,
  GalleryInstitution,
  Institution,
  Source,
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

function sample<T>(random: () => number, values: T[], min: number, max: number): T[] {
  const count = min + Math.floor(random() * (max - min + 1))
  const pool = [...values]
  const out: T[] = []
  for (let i = 0; i < count && pool.length; i += 1) {
    out.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  }
  return out
}

// Inline SVG keeps the console fully offline — no CDN, no broken image frames.
function logo(initials: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="${color}"/><text x="48" y="60" font-family="Sora,system-ui,sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function banner(color: string, seed: number): string {
  const random = rng(seed)
  const bars = Array.from({ length: 14 }, (_, i) => {
    const height = 40 + random() * 160
    return `<rect x="${i * 60}" y="${240 - height}" width="44" height="${height}" fill="#fff" opacity="${(0.06 + random() * 0.14).toFixed(2)}"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 240"><rect width="840" height="240" fill="${color}"/>${bars}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

type InstitutionSeed = {
  name: string
  slug: string
  domain: string
  country: string
  city: string
  color: string
  initials: string
}

const INSTITUTION_SEEDS: InstitutionSeed[] = [
  { name: 'University of Greenwich', slug: 'greenwich', domain: 'gre.ac.uk', country: 'GB', city: 'London', color: '#00558f', initials: 'GR' },
  { name: 'Coventry University', slug: 'coventry', domain: 'coventry.ac.uk', country: 'GB', city: 'Coventry', color: '#00263a', initials: 'CU' },
  { name: 'University of Sussex', slug: 'sussex', domain: 'sussex.ac.uk', country: 'GB', city: 'Brighton', color: '#00558a', initials: 'SX' },
  { name: 'Northumbria University', slug: 'northumbria', domain: 'northumbria.ac.uk', country: 'GB', city: 'Newcastle', color: '#0c2340', initials: 'NU' },
  { name: 'Swansea University', slug: 'swansea', domain: 'swansea.ac.uk', country: 'GB', city: 'Swansea', color: '#a6192e', initials: 'SW' },
  { name: 'University College Dublin', slug: 'ucd', domain: 'ucd.ie', country: 'IE', city: 'Dublin', color: '#12395b', initials: 'UD' },
  { name: 'TU Dublin', slug: 'tud', domain: 'tudublin.ie', country: 'IE', city: 'Dublin', color: '#00857d', initials: 'TD' },
  { name: 'University of Auckland', slug: 'auckland', domain: 'auckland.ac.nz', country: 'NZ', city: 'Auckland', color: '#00467f', initials: 'AK' },
]

const SUBJECTS = [
  'Computer Science', 'Data Science', 'Artificial Intelligence', 'Cyber Security',
  'Software Engineering', 'Business Management', 'International Business',
  'Finance', 'Accounting', 'Marketing', 'Civil Engineering',
  'Mechanical Engineering', 'Electrical Engineering', 'Biomedical Science',
  'Psychology', 'Nursing', 'Public Health', 'Architecture', 'Law',
  'Economics', 'Environmental Science', 'Graphic Design', 'Digital Media',
  'Education', 'Robotics', 'Supply Chain Management',
]

const LEVELS = ['Undergraduate', 'Postgraduate'] as const
const CAMPUSES = ['Main Campus', 'City Campus', 'Medway', 'Avery Hill', 'Online']
const STUDY_MODES = ['Full-time', 'Part-time', 'Sandwich', 'Distance learning']
const INTAKES = ['January', 'May', 'September']
const UG_DURATIONS = ['3 years', '4 years with placement']
const PG_DURATIONS = ['1 year', '2 years part-time']

const MODULES: Record<string, string[]> = {
  default: [
    'Research Methods', 'Professional Practice', 'Capstone Project',
    'Data Analysis', 'Systems Thinking', 'Ethics and Governance',
    'Industry Placement', 'Dissertation',
  ],
}

const SCHOLARSHIPS = [
  'International Merit Scholarship (£3,000)',
  'Vice-Chancellor Excellence Award',
  'Alumni Progression Discount (15%)',
  'Regional Partner Bursary',
]

function evidenceFor(url: string, fields: string[]) {
  return {
    source_url: url,
    method: 'css-selector',
    fields: Object.fromEntries(
      fields.map((field) => [
        field,
        [{
          source_url: url,
          field,
          method: 'css-selector',
          excerpt: `…${field.replace(/_/g, ' ')} details published on the course page…`,
          section: 'Course details',
          selector: `.course-detail__${field.replace(/_/g, '-')}`,
          confidence: 0.82,
        }],
      ]),
    ),
  }
}

export const collections: Collection[] = [
  { id: 'col-uk-courses', name: 'UK & Ireland course catalogue', description: 'Undergraduate and postgraduate listings across partner institutions.' },
  { id: 'col-anz-courses', name: 'ANZ pilot', description: 'Australia and New Zealand expansion pilot.' },
]

// Photography, matched to the subject rather than picked at random. A stock
// image with no relationship to the course reads as filler and is worse than
// none — the first attempt served a plane wreck for a data science degree.
//
// These are Unsplash CDN ids, verified to resolve, standing in until a
// university supplies its own imagery through the institution portal. Every one
// falls back to the institution's brand colour when the network is unavailable.
const SUBJECT_PHOTOS: { match: string[]; id: string }[] = [
  { match: ['computer', 'software', 'artificial', 'data', 'robotic'], id: 'photo-1518770660439-4636190af475' },
  { match: ['cyber', 'security'], id: 'photo-1526628953301-3e589a6a8b74' },
  { match: ['business', 'management', 'marketing', 'supply'], id: 'photo-1454165804606-c3d57bc86b40' },
  { match: ['finance', 'accounting', 'economics'], id: 'photo-1551288049-bebda4e38f71' },
  { match: ['engineering', 'mechanical', 'electrical', 'civil'], id: 'photo-1581091226825-a6a2a5aee158' },
  { match: ['nursing', 'health', 'biomedical'], id: 'photo-1576091160399-112ba8d25d1d' },
  { match: ['psychology', 'education'], id: 'photo-1497366216548-37526070297c' },
  { match: ['architecture'], id: 'photo-1503387762-592deb58ef4e' },
  { match: ['law'], id: 'photo-1589829545856-d10d557cf95f' },
  { match: ['environmental'], id: 'photo-1470071459604-3b5ec3a7fe05' },
  { match: ['design', 'media', 'graphic'], id: 'photo-1481277542470-605612bd2d61' },
]

const CAMPUS_PHOTOS = [
  'photo-1524178232363-1fb2b075b655',
  'photo-1517048676732-d65bc937f952',
  'photo-1497366216548-37526070297c',
]

function unsplash(id: string, width: number, height: number): string {
  return `https://images.unsplash.com/${id}?w=${width}&h=${height}&fit=crop&q=70`
}

/** An image that has something to do with the subject being studied. */
function subjectPhoto(subject: string, width: number, height: number): string {
  const lower = subject.toLowerCase()
  const found = SUBJECT_PHOTOS.find((entry) => entry.match.some((word) => lower.includes(word)))
  return unsplash(found?.id ?? CAMPUS_PHOTOS[0], width, height)
}

/** A campus banner, stable per institution. */
function campusPhoto(index: number, width: number, height: number): string {
  return unsplash(CAMPUS_PHOTOS[index % CAMPUS_PHOTOS.length], width, height)
}

export const institutions: Institution[] = INSTITUTION_SEEDS.map((seed, index) => ({
  id: `inst-${seed.slug}`,
  name: seed.name,
  slug: seed.slug,
  domain: seed.domain,
  country_code: seed.country,
  city: seed.city,
  website_url: `https://www.${seed.domain}`,
  logo_url: logo(seed.initials, seed.color),
  banner_url: campusPhoto(index, 1200, 420),
  brand_color: seed.color,
}))

/** The generated banner, used when the placeholder service cannot be reached. */
export const fallbackBanners: Record<string, string> = Object.fromEntries(
  INSTITUTION_SEEDS.map((seed, index) => [`inst-${seed.slug}`, banner(seed.color, index + 7)]),
)

export const galleryInstitutions: GalleryInstitution[] = institutions.map((inst) => ({
  id: inst.id,
  name: inst.name,
  country_code: inst.country_code,
  city: inst.city,
  logo_url: inst.logo_url,
  banner_url: inst.banner_url,
  brand_color: inst.brand_color,
  published_courses: 0,
}))

export const sources: Source[] = INSTITUTION_SEEDS.slice(0, 5).map((seed, index) => ({
  id: `src-${seed.slug}`,
  collection_id: 'col-uk-courses',
  name: `${seed.name} — course catalogue`,
  kind: index === 0 ? 'greenwich' : 'website',
  url: `https://www.${seed.domain}/study/courses`,
  enabled: index !== 4,
  last_run_at: index < 3 ? new Date(Date.UTC(2026, 7, 28 - index, 9, 15)).toISOString() : null,
}))

function buildCourses(): GalleryCourse[] {
  const random = rng(20260905)
  const courses: GalleryCourse[] = []

  institutions.forEach((inst, instIndex) => {
    const subjects = sample(random, SUBJECTS, 9, 13)
    subjects.forEach((subject, subjectIndex) => {
      const level = pick(random, [...LEVELS])
      const undergrad = level === 'Undergraduate'
      const award = undergrad ? pick(random, ['BSc (Hons)', 'BA (Hons)', 'BEng (Hons)']) : pick(random, ['MSc', 'MA', 'MBA'])
      const slug = subject.toLowerCase().replace(/\s+/g, '-')
      const url = `https://www.${INSTITUTION_SEEDS[instIndex].domain}/study/courses/${undergrad ? 'ug' : 'pg'}/${slug}`
      const modes = sample(random, STUDY_MODES, 1, 3)
      const coverage = Number((0.52 + random() * 0.46).toFixed(2))
      const feeBase = undergrad ? 14000 : 16500
      const filled = [
        'title', 'award', 'level', 'campuses', 'study_modes', 'durations',
        'intake_months', 'fees', 'entry_requirements', 'modules',
      ]

      courses.push({
        id: `rec-${inst.slug ?? instIndex}-${slug}`,
        institution_id: inst.id,
        institution: galleryInstitutions[instIndex],
        title: `${subject}${undergrad ? '' : pick(random, ['', ' and Management', ' (Advanced Practice)'])}`,
        award,
        level,
        campuses: sample(random, CAMPUSES, 1, 2),
        study_modes: modes,
        durations: sample(random, undergrad ? UG_DURATIONS : PG_DURATIONS, 1, 2),
        intake_months: sample(random, INTAKES, 1, 3),
        fees: [
          { residency: 'home', label: 'Home', amount: feeBase - 4500, currency: 'GBP', study_mode: 'Full-time' },
          { residency: 'international', label: 'International', amount: feeBase + Math.round(random() * 8000), currency: 'GBP', study_mode: 'Full-time' },
        ],
        entry_requirements: undergrad
          ? `${pick(random, ['112', '120', '128'])} UCAS points including a relevant subject at A-level or equivalent.`
          : `A second-class honours degree (2:1) in ${subject} or a closely related discipline.`,
        english_requirements: random() > 0.2
          ? `IELTS ${pick(random, ['6.0', '6.5', '7.0'])} overall with no component below ${pick(random, ['5.5', '6.0'])}.`
          : null,
        modules: sample(random, MODULES.default, 4, 7).map((m) => `${subject}: ${m}`),
        scholarships: sample(random, SCHOLARSHIPS, 0, 2),
        course_content: `This ${award} in ${subject} combines taught modules with applied project work at ${inst.name}. Students build practical capability alongside the theory that underpins it, finishing with an independent piece of work assessed by academic and industry reviewers.`,
        careers: `Graduates progress into ${pick(random, ['consultancy', 'the public sector', 'startups', 'research', 'industry'])} roles such as ${subject} analyst, project lead, or specialist practitioner.`,
        image_url: subjectPhoto(subject, 640, 360),
        source_url: url,
        coverage,
        evidence: evidenceFor(url, filled),
        updated_at: new Date(Date.UTC(2026, 8, 1 + (subjectIndex % 4), 8 + instIndex, 30)).toISOString(),
      })
    })
  })

  galleryInstitutions.forEach((inst) => {
    inst.published_courses = courses.filter((course) => course.institution_id === inst.id).length
  })

  return courses
}

export const courses: GalleryCourse[] = buildCourses()
