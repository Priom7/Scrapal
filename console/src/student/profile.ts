// The student's own data. The product spec says it is owned by the student,
// portable, exportable and deletable — so it lives in their browser, never
// gates the results, and can be cleared in one action.
import type { FundingSource } from './funding'
import type { Classification } from './match'

export type StudentProfile = {
  /** Who the student is. Their own to set, change or clear. */
  name: string | null
  avatarUrl: string | null
  homeCountry: string | null
  classification: Classification | null
  ucasPoints: number | null
  ieltsOverall: number | null
  ieltsLowest: number | null
  budget: number | null
  intake: string | null
  /** Undergraduate or Postgraduate, as the courses label it. */
  level: string | null
  countries: string[]
  /** Money. Kept in the same store because it is the same person's data, and
      the spec says they own all of it together. */
  homeCurrency: string | null
  exchangeRate: number | null
  heldFunds: number | null
  flights: number | null
  funding: FundingSource[]
}

export const EMPTY_PROFILE: StudentProfile = {
  name: null,
  avatarUrl: null,
  homeCountry: null,
  classification: null,
  ucasPoints: null,
  ieltsOverall: null,
  ieltsLowest: null,
  budget: null,
  intake: null,
  level: null,
  countries: [],
  homeCurrency: null,
  exchangeRate: null,
  heldFunds: null,
  flights: null,
  funding: [],
}

const KEY = 'scrapal.student.profile'

export function loadProfile(): StudentProfile {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    return raw ? { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<StudentProfile>) } : EMPTY_PROFILE
  } catch {
    return EMPTY_PROFILE
  }
}

export function saveProfile(profile: StudentProfile): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(profile))
  } catch {
    // A blocked storage API must not stop someone browsing courses.
  }
}

export function clearProfile(): void {
  try {
    globalThis.localStorage?.removeItem(KEY)
  } catch {
    // Nothing to do; the in-memory profile is reset by the caller either way.
  }
}

export function hasAnything(profile: StudentProfile): boolean {
  return Object.values(profile).some((value) => Array.isArray(value) ? value.length > 0 : value != null)
}

/** Whether enough is known to say anything about money. */
export function hasFunding(profile: StudentProfile): boolean {
  return profile.funding.length > 0 || profile.heldFunds != null
}

/** A one-line summary of what results are being matched against. */
export function describeProfile(profile: StudentProfile): string {
  const parts = [
    profile.classification && profile.classification.toUpperCase().replace('FIRST', '1st'),
    profile.ieltsOverall != null && `IELTS ${profile.ieltsOverall}`,
    profile.budget != null && `up to £${profile.budget.toLocaleString('en-GB')}`,
    profile.intake && `${profile.intake} start`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No details yet'
}

/** A default face, so a new profile is not an empty grey circle. Deterministic
    per person so it does not change on every render. Falls back to initials if
    the placeholder service cannot be reached. */
export function defaultAvatar(seed: string): string {
  const index = Math.abs([...seed].reduce((hash, char) => hash * 31 + char.charCodeAt(0), 7)) % 99
  const set = index % 2 === 0 ? 'women' : 'men'
  return `https://randomuser.me/api/portraits/${set}/${index}.jpg`
}
