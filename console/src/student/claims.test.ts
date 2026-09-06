import { describe, expect, it } from 'vitest'
import type { SearchHit } from '../api'
import { amountsIn, analyseClaim } from './claims'

function hit(excerpt: string, heading = 'Fees and funding'): SearchHit {
  return {
    chunk_id: `c-${excerpt.slice(0, 8)}`, document_id: 'doc-1',
    title: 'Business Management — Coventry University',
    url: 'https://coventry.ac.uk/course#fees',
    heading, excerpt, score: 0.8,
    document_version_id: 'v1', section_path: [], anchor: 'fees',
    lexical_score: 0.8, vector_score: 0.4, structured_score: 0.9, fused_score: 0.8,
  }
}

describe('reading a claim', () => {
  it('picks amounts out of the wording a person would use', () => {
    expect(amountsIn('a £5,000 scholarship')).toEqual([5000])
    expect(amountsIn('they said 18000 GBP a year')).toEqual([18000])
    expect(amountsIn('no numbers here')).toEqual([])
  })
})

describe('checking a claim against published pages', () => {
  // The rule the whole tool stands or falls on.
  it('never calls an unmentioned claim false', () => {
    const result = analyseClaim('Coventry guarantees a £5,000 scholarship', [])
    expect(result.verdict).toBe('unmentioned')
    expect(result.headline).toBe('Nothing published says this')
    expect(result.detail).toContain('does not make it untrue')
    expect(result.detail.toLowerCase()).not.toContain('false')
  })

  it('flags a figure that disagrees with the published one', () => {
    const result = analyseClaim(
      'The agent said tuition is £9,000 a year',
      [hit('International tuition: £18,708 per year. Fees are reviewed annually.')],
    )
    expect(result.verdict).toBe('conflicting')
    expect(result.conflicts[0]).toMatchObject({ claimed: 9000, published: 18708 })
  })

  // Two numbers about different things are not a contradiction.
  it('does not treat an unrelated number as a conflict', () => {
    const result = analyseClaim(
      'They promised a £5,000 scholarship',
      [hit('Core modules include Research Methods and Capstone Project.', 'Modules')],
    )
    expect(result.verdict).not.toBe('conflicting')
    expect(result.conflicts).toEqual([])
  })

  it('does not claim support when pages are merely on the topic', () => {
    const result = analyseClaim(
      'They guarantee a £3,000 award for every international student',
      [hit('Scholarships are awarded on academic merit and are competitive.', 'Fees and funding')],
    )
    expect(result.verdict).toBe('related')
    expect(result.absolutes).toContain('guarantee')
  })

  // The bug this feature exists to avoid making itself: a tuition figure is not
  // a rebuttal of a scholarship claim.
  it('does not pit a tuition figure against a scholarship claim', () => {
    const result = analyseClaim(
      'The agent said there is a £5,000 scholarship',
      [hit('International tuition: £18,708 per year.', 'Fees and funding')],
    )
    expect(result.verdict).toBe('related')
    expect(result.conflicts).toEqual([])
  })

  it('confirms a figure only when the same kind of amount matches', () => {
    const result = analyseClaim(
      'I was told tuition is £18,708 a year',
      [hit('International tuition: £18,708 per year. Fees are reviewed annually.')],
    )
    expect(result.verdict).toBe('supported')
  })

  it('will not call a claim supported just because pages came back', () => {
    const result = analyseClaim(
      'The university refunds the deposit if a visa is refused',
      [hit('Core modules include Research Methods.', 'Modules')],
    )
    expect(result.verdict).toBe('related')
  })

  it('notices the promise words published pages avoid', () => {
    const result = analyseClaim('You are guaranteed an offer with no IELTS', [])
    expect(result.absolutes).toEqual(expect.arrayContaining(['guaranteed', 'no ielts']))
  })
})

describe('scoping a claim to the university it names', () => {
  const coventry = (excerpt: string): SearchHit => ({
    ...hit(excerpt), title: 'Business Management — Coventry University', chunk_id: 'cov',
  })
  const dublin = (excerpt: string): SearchHit => ({
    ...hit(excerpt), title: 'Data Science — TU Dublin', chunk_id: 'dub',
  })

  it('ignores another university’s fees when the claim names one', () => {
    const result = analyseClaim(
      'I was told tuition at Coventry is £9,000 a year',
      [dublin('International: £17,082 per year.'), coventry('International: £18,708 per year.')],
      ['Coventry University', 'TU Dublin'],
    )
    expect(result.conflicts.every((conflict) => conflict.published === 18708)).toBe(true)
    expect(result.evidence.every((item) => item.title.includes('Coventry'))).toBe(true)
  })

  it('says nothing was found when no page is from the named university', () => {
    const result = analyseClaim(
      'I was told tuition at Coventry is £9,000 a year',
      [dublin('International: £17,082 per year.')],
      ['Coventry University', 'TU Dublin'],
    )
    expect(result.verdict).toBe('unmentioned')
    expect(result.detail).toContain('Coventry University')
  })

  it('uses everything when the claim names no university', () => {
    const result = analyseClaim(
      'I was told tuition is £9,000 a year',
      [dublin('International: £17,082 per year.')],
    )
    expect(result.evidence.length).toBe(1)
  })
})
