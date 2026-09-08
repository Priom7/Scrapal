// A localStorage that actually stores things, for tests.
//
// Node has no localStorage, and the app guards every access with optional
// chaining so it works without one. That meant every persistence path — saved
// courses, the planner thread, remembered Radar terms — quietly no-opped in
// tests and was never really covered. This gives the suite a real one.
class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length(): number { return this.data.size }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null }
  getItem(key: string): string | null { return this.data.get(key) ?? null }
  setItem(key: string, value: string): void { this.data.set(key, String(value)) }
  removeItem(key: string): void { this.data.delete(key) }
  clear(): void { this.data.clear() }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
})
