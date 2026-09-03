import { Layers } from 'lucide-react'
import { ICON } from './lib'

export function CollectionPicker(
  { collections, scope, onChange }: {
    collections: { id: string; name: string }[]
    scope: string | undefined
    onChange: (id: string | undefined) => void
  },
) {
  if (collections.length < 2) return null
  return (
    <label className="collection-picker">
      <Layers size={ICON.md} aria-hidden="true" />
      <span className="sr-only">Collection</span>
      <select value={scope ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">All collections</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>{collection.name}</option>
        ))}
      </select>
    </label>
  )
}
