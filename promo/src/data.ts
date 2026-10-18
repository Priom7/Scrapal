// What the film shows. Institutions, people and programmes are fictional on
// purpose: a promo naming real universities would read as an endorsement they
// never gave (the product's own mock data uses real names; the film must not).
// Figures are illustrative and add up: 17,500 + 13,350 + 524 + 776 + 650 = 32,800.

/** The student the film follows. Her details match what the match panel checks. */
export const PERSONA = {
  name: 'Amara',
  initials: 'A',
  from: 'Accra, Ghana',
  facts: ['BSc Mathematics, 2:1', 'IELTS 7.0', 'Budget £25,000'],
}

export const STUDENT = {
  subject: 'Data Science',
  level: 'Master’s',
  country: 'United Kingdom',
  intake: 'Sept 2027',
  budget: 25_000,
}

export const COURSE = {
  institution: 'Northbridge University',
  city: 'London',
  initials: 'NU',
  color: '#1f3a8a',
  title: 'MSc Data Science',
  award: 'MSc',
  tuition: '£17,500',
  length: '1 year',
  starts: 'September 2027',
  mode: 'Full-time',
  source: 'northbridge.ac.uk/study/msc-data-science/fees',
  excerpt: ['Tuition for international students is ', '£17,500', ' for the full course (2027/28 entry).'],
}

export const SHORTLIST = [
  { institution: 'Lakeshore University', city: 'Dublin', initials: 'LU', color: '#0f766e', title: 'MSc Data Analytics', tuition: '€18,900', verdict: 'met' as const, headline: 'You meet 4 requirements we could check' },
  { institution: 'Ashford Metropolitan University', city: 'Manchester', initials: 'AM', color: '#7c3aed', title: 'MSc Applied Data Science', tuition: '£16,200', verdict: 'met' as const, headline: 'You meet 3 requirements we could check' },
  { institution: COURSE.institution, city: COURSE.city, initials: COURSE.initials, color: COURSE.color, title: COURSE.title, tuition: COURSE.tuition, verdict: 'close' as const, headline: 'You are close: 1 requirement to go' },
]

/** student/match.ts wording: one verdict per requirement, the shortfall named. */
export const REQUIREMENTS = [
  { verdict: 'met' as const, label: 'Degree', detail: 'Your 2:1 in Mathematics meets the 2:1 asked for' },
  { verdict: 'met' as const, label: 'IELTS overall', detail: 'Your 7.0 meets the 6.5 asked for' },
  { verdict: 'close' as const, label: 'Lowest IELTS band', detail: 'Your lowest band is 5.5, 0.5 below the 6.0 minimum', asks: 'IELTS 6.5 overall, no band below 6.0' },
  { verdict: 'met' as const, label: 'Intake', detail: 'September 2027 is open for applications' },
]

export const COSTS = [
  { label: 'Tuition', amount: 17_500, source: 'university' as const },
  { label: 'Living in London, 12 months', amount: 13_350, source: 'reference' as const },
  { label: 'Visa application', amount: 524, source: 'reference' as const },
  { label: 'Health surcharge', amount: 776, source: 'reference' as const },
  { label: 'Flights and arrival', amount: 650, source: 'reference' as const },
]

export const RESEARCH = {
  text: 'We develop graph neural networks that detect financial fraud in large transaction networks, and explain each alert in terms an investigator can audit. Current work studies anomaly detection when spending patterns drift over time.',
  terms: ['graph neural networks', 'financial fraud', 'transaction networks', 'anomaly detection', 'explain each alert'],
  /** The chips the fingerprint shows, in the same order as `terms`. */
  labels: ['graph neural networks', 'fraud detection', 'transaction networks', 'anomaly detection', 'explainable AI'],
}

export const PEOPLE = [
  { name: 'Dr Lena Okafor', role: 'Senior Lecturer in Machine Learning', place: 'Northbridge University', initials: 'LO', color: '#465cff', badge: 'Open to supervise', tone: 'met' as const, why: ['graph neural networks', 'fraud detection'] },
  { name: 'Prof. Tomás Reyes', role: 'Professor of Data Science', place: 'Lakeshore University', initials: 'TR', color: '#0e7490', badge: 'Hiring PhD students', tone: 'blue' as const, why: ['anomaly detection', 'transaction networks'] },
]

export const FUNDING = {
  title: 'Doctoral Studentship in Trustworthy AI',
  funder: 'Centre for Responsible Computing',
  amount: '£21,000 a year',
  closes: 'Closes in 15 days',
  why: ['explainable AI', 'anomaly detection'],
}
