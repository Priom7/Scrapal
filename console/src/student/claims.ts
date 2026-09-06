// Checking a claim against the published record.
//
// The hard rule here is asymmetry. Finding a passage that states something is
// evidence it is true; finding nothing is NOT evidence it is false — the
// university may simply not publish it, or the crawler may not have reached it.
// So "unmentioned" is its own verdict and never phrased as a contradiction.
// Getting that wrong would make this tool the thing it exists to catch.
import type { SearchHit } from '../api'

export type ClaimVerdict = 'supported' | 'conflicting' | 'related' | 'unmentioned'

export type AmountConflict = {
  claimed: number
  published: number
  hit: SearchHit
}

export type ClaimAnalysis = {
  verdict: ClaimVerdict
  headline: string
  detail: string
  /** Amounts stated in the claim itself. */
  amounts: number[]
  /** Absolute promises, which published pages almost never make. */
  absolutes: string[]
  conflicts: AmountConflict[]
  evidence: SearchHit[]
}

/** Words that promise certainty. Universities hedge; sales does not. */
const ABSOLUTES = [
  'guarantee', 'guaranteed', 'guarantees', 'always', 'never', 'definitely',
  'certain', 'promise', 'promised', 'assured', 'automatic', 'automatically',
  '100%', 'no interview', 'no ielts', 'waived', 'free of charge',
]

// Two amounts are only comparable when they are amounts of the same thing. A
// tuition figure does not contradict a scholarship claim, and treating it as if
// it did is precisely the overclaiming this tool exists to catch.
const MONEY_CATEGORIES: Record<string, string[]> = {
  tuition: ['tuition', 'fee', 'fees', 'course cost'],
  scholarship: ['scholarship', 'bursary', 'award', 'discount', 'waiver', 'funding'],
  deposit: ['deposit', 'refund', 'refundable'],
  living: ['living cost', 'accommodation', 'rent'],
}

/** Search titles read "Course — Institution". */
function institutionOf(hit: SearchHit): string {
  const parts = hit.title.split('—')
  return parts.length > 1 ? parts[parts.length - 1].trim() : ''
}

const NAME_NOISE = new Set(['university', 'college', 'of', 'the', 'institute', 'school'])

/** Does the claim name this institution? Matched on the distinctive words, so
    "Coventry" finds "Coventry University" without "University" matching all. */
function claimNames(claim: string, institution: string): boolean {
  const lower = claim.toLowerCase()
  return institution
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !NAME_NOISE.has(word))
    .some((word) => lower.includes(word))
}

export function amountsIn(text: string): number[] {
  const found: number[] = []
  const pattern = /£\s?([\d][\d,]*(?:\.\d+)?)|\b([\d][\d,]{2,})\s*(?:pounds|gbp)\b/gi
  let match = pattern.exec(text)
  while (match) {
    const raw = (match[1] ?? match[2]).replace(/,/g, '')
    const value = Number(raw)
    if (Number.isFinite(value) && value > 0) found.push(value)
    match = pattern.exec(text)
  }
  return found
}

function absolutesIn(text: string): string[] {
  const lower = text.toLowerCase()
  const found = ABSOLUTES.filter((word) => lower.includes(word))
  // "guarantee" and "guarantees" both match the same phrase; keep the longest
  // so the reader sees one term rather than a run of stems.
  return found.filter((word) => !found.some((other) => other !== word && other.includes(word)))
}

function moneyCategory(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [category, words] of Object.entries(MONEY_CATEGORIES)) {
    if (words.some((word) => lower.includes(word))) return category
  }
  return null
}

export function analyseClaim(
  claim: string,
  hits: SearchHit[],
  /** Known institution names, so a claim naming one can be scoped to it even
      when nothing from that institution came back. */
  institutions: string[] = [],
): ClaimAnalysis {
  const amounts = amountsIn(claim)
  const absolutes = absolutesIn(claim)
  const claimCategory = moneyCategory(claim)

  // A claim that names a university is a claim about that university. Checking
  // it against another one's fees is the same overclaiming error as comparing
  // a scholarship to a tuition figure, one level up.
  const pool = institutions.length
    ? institutions
    : [...new Set(hits.map(institutionOf).filter(Boolean))]
  const namedInClaim = pool.filter((name) => claimNames(claim, name))
  const scoped = namedInClaim.length
    ? hits.filter((hit) => namedInClaim.some(
      (name) => institutionOf(hit).toLowerCase() === name.toLowerCase(),
    ))
    : hits
  const evidence = scoped.slice(0, 4)

  const conflicts: AmountConflict[] = []
  let amountConfirmed = false

  if (amounts.length && claimCategory) {
    evidence.forEach((hit) => {
      // Only compare against a passage about the same kind of money.
      if (moneyCategory(`${hit.heading} ${hit.excerpt}`) !== claimCategory) return
      amountsIn(hit.excerpt).forEach((published) => {
        if (amounts.includes(published)) amountConfirmed = true
        else conflicts.push({ claimed: amounts[0], published, hit })
      })
    })
  }

  if (!evidence.length) {
    return {
      verdict: 'unmentioned',
      headline: 'Nothing published says this',
      // Deliberately not "this is false".
      detail: namedInClaim.length
        ? `No page Scrapal has read from ${namedInClaim[0]} mentions it. That does not make it untrue — it means nobody has put it in writing where a student can check it. Ask whoever told you to point at the page.`
        : 'No page Scrapal has read mentions it. That does not make it untrue — it means nobody has put it in writing where a student can check it. Ask whoever told you to point at the page.',
      amounts, absolutes, conflicts: [], evidence: [],
    }
  }

  if (amountConfirmed && !conflicts.length) {
    return {
      verdict: 'supported',
      headline: 'A published page states this figure',
      detail: 'The amount you were told appears on the page below, in the same context.',
      amounts, absolutes, conflicts, evidence,
    }
  }

  if (conflicts.length) {
    return {
      verdict: 'conflicting',
      headline: 'The published pages give a different figure',
      detail: 'What you were told and what the university published do not match, and they are about the same thing. The passages below are what the pages actually say.',
      amounts, absolutes, conflicts, evidence,
    }
  }

  // The honest default. Retrieval finding something on the topic is not the
  // same as a page saying what the student was told, so this never claims it is.
  return {
    verdict: 'related',
    headline: 'Related pages, but none of them says this',
    detail: 'Scrapal found pages on this topic. None of them states what you were told. Read them below, then ask for the exact page it comes from.',
    amounts, absolutes, conflicts, evidence,
  }
}
