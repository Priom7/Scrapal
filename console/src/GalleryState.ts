export type GalleryFilters = {
  q: string
  level?: string
  institutionIds: string[]
  countries: string[]
  intakeMonths: string[]
  studyModes: string[]
  durations: string[]
  feeMax?: number
  sort: 'updated' | 'title' | 'coverage'
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
  | { type: 'toggle-study-mode'; value: string }
  | { type: 'toggle-duration'; value: string }
  | { type: 'set-fee-max'; value?: number }
  | { type: 'set-sort'; value: GalleryFilters['sort'] }
  | { type: 'clear-country' }
  | { type: 'apply-ai'; values: Partial<GalleryFilters> }
  | { type: 'clear' }

export const initialGalleryFilters: GalleryFilterState = {
  filters: { q: '', institutionIds: [], countries: [], intakeMonths: [], studyModes: [], durations: [], sort: 'updated' },
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
  if (action.type === 'set-fee-max') return { filters: { ...state.filters, feeMax: action.value }, aiSet: state.aiSet.filter((x) => x !== 'feeMax') }
  if (action.type === 'set-sort') return { ...state, filters: { ...state.filters, sort: action.value } }
  if (action.type === 'clear-country') return { filters: { ...state.filters, countries: [] }, aiSet: state.aiSet.filter((x) => x !== 'countries') }
  const field = action.type === 'toggle-institution' ? 'institutionIds'
    : action.type === 'toggle-country' ? 'countries'
      : action.type === 'toggle-intake' ? 'intakeMonths'
        : action.type === 'toggle-study-mode' ? 'studyModes' : 'durations'
  return {
    filters: { ...state.filters, [field]: toggle(state.filters[field], action.value) },
    aiSet: state.aiSet.filter((item) => item !== field),
  }
}
