import { describe, expect, it } from 'vitest'
import { galleryFilterReducer, initialGalleryFilters } from './GalleryState'

describe('gallery filter state', () => {
  it('marks planned slots as AI-set and clears that mark after a manual edit', () => {
    const planned = galleryFilterReducer(initialGalleryFilters, {
      type: 'apply-ai',
      values: { level: 'postgraduate', countries: ['GB'] },
    })
    expect(planned.aiSet).toEqual(['level', 'countries'])
    const edited = galleryFilterReducer(planned, { type: 'set-level', value: 'undergraduate' })
    expect(edited.filters.level).toBe('undergraduate')
    expect(edited.aiSet).toEqual(['countries'])
  })

  it('toggles counted filters without losing the rest of the query', () => {
    const queried = galleryFilterReducer(initialGalleryFilters, { type: 'set-query', value: 'law' })
    const filtered = galleryFilterReducer(queried, { type: 'toggle-country', value: 'GB' })
    expect(filtered.filters.q).toBe('law')
    expect(filtered.filters.countries).toEqual(['GB'])
  })
})
