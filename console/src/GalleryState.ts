export type GalleryFilters = {
  q: string
  level?: string
  institutionIds: string[]
  countries: string[]
  intakeMonths: string[]
}

export type GalleryFilterState = {
  filters: GalleryFilters
  aiSet: string[]
}

export type GalleryFilterAction =
  | { type: 'set-query'; value: string }
  | { type: 'set-level'; value?: string }
  | { type: 'toggle-institution'; value: string }
  | { type: 'toggle-country'; value: string }
  | { type: 'toggle-intake'; value: string }
  | { type: 'apply-ai'; values: Partial<GalleryFilters> }
  | { type: 'clear' }

export const initialGalleryFilters: GalleryFilterState = {
  filters: { q: '', institutionIds: [], countries: [], intakeMonths: [] },
  aiSet: [],
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

export function galleryFilterReducer(
  state: GalleryFilterState,
  action: GalleryFilterAction,
): GalleryFilterState {
  if (action.type === 'clear') return initialGalleryFilters
  if (action.type === 'apply-ai') {
    const names = Object.keys(action.values)
    return {
      filters: { ...state.filters, ...action.values },
      aiSet: [...new Set([...state.aiSet, ...names])],
    }
  }
  if (action.type === 'set-query') {
    return { filters: { ...state.filters, q: action.value }, aiSet: state.aiSet.filter((x) => x !== 'q') }
  }
  if (action.type === 'set-level') {
    return { filters: { ...state.filters, level: action.value }, aiSet: state.aiSet.filter((x) => x !== 'level') }
  }
  const field = action.type === 'toggle-institution' ? 'institutionIds'
    : action.type === 'toggle-country' ? 'countries' : 'intakeMonths'
  return {
    filters: { ...state.filters, [field]: toggle(state.filters[field], action.value) },
    aiSet: state.aiSet.filter((item) => item !== field),
  }
}
