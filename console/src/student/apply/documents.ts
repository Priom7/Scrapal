// What a university actually asks a student to send.
//
// The list is built from the course's own published requirements where they
// exist, plus the set every international application needs. Anything derived
// from the course page is marked, so a student can tell what Scrapal read from
// what it assumed.
import type { GalleryCourse } from '../../api'

export type DocStatus = 'missing' | 'have' | 'attached'

export type RequiredDoc = {
  id: string
  label: string
  why: string
  /** Read from this course's page, rather than a general requirement. */
  fromCourse: boolean
  /** Documents that expire, which is a routine cause of visa refusal. */
  expires?: boolean
}

const ALWAYS: RequiredDoc[] = [
  { id: 'passport', label: 'Passport', why: 'Identity, and the visa application later. It must not expire before your course ends.', fromCourse: false, expires: true },
  { id: 'transcript', label: 'Academic transcript', why: 'Your marks, module by module. Universities want the official one.', fromCourse: false },
  { id: 'certificate', label: 'Degree or school certificate', why: 'Proof you finished. A provisional letter works if you have not graduated.', fromCourse: false },
  { id: 'statement', label: 'Personal statement', why: 'Why this course, and why you. Scrapal can draft the structure from what you tell it.', fromCourse: false },
  { id: 'reference', label: 'Reference letter', why: 'Usually one academic referee. Ask early — late references sink more applications than weak ones.', fromCourse: false },
  { id: 'cv', label: 'CV', why: 'Study and work history on one page.', fromCourse: false },
]

export function requiredDocuments(course: GalleryCourse): RequiredDoc[] {
  const docs = [...ALWAYS]

  if (course.english_requirements) {
    docs.push({
      id: 'english',
      label: 'English test result',
      why: `This course asks for ${course.english_requirements.replace(/\s+/g, ' ').trim()}`,
      fromCourse: true,
      expires: true,
    })
  }

  // A course that publishes a fee is a course with money to prove.
  if (course.fees.some((fee) => fee.amount != null)) {
    docs.push({
      id: 'funds',
      label: 'Proof of funds',
      why: 'Bank statements showing the money held for the required period. Needed for the visa, not the offer.',
      fromCourse: false,
    })
  }

  return docs
}

/** A passport that expires before the course ends is a routine refusal. */
export function expiryWarning(expiresAt: string | null, courseEndsAt: Date): string | null {
  if (!expiresAt) return null
  const expiry = new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) return null
  if (expiry <= courseEndsAt) {
    return `This expires before your course would end (${courseEndsAt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}). Renew it before you apply for the visa.`
  }
  return null
}
