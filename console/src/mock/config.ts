// Mock behaviour knobs, in their own module so the transport, the simulators
// and (later) a dev panel can all read them without importing each other.
export type MockConfig = {
  /** Floor and ceiling for the artificial round trip, in milliseconds. */
  minLatencyMs: number
  maxLatencyMs: number
  /** Fraction of requests that fail with a 500, 0 to 1. */
  errorRate: number
  /** Paths matching this substring always fail. Empty disables it. */
  failPathContains: string
  /** Overrides the pace of streamed events; null keeps the natural cadence. */
  streamTickMs: number | null
}

export const mockConfig: MockConfig = {
  minLatencyMs: 150,
  maxLatencyMs: 600,
  errorRate: 0,
  failPathContains: '',
  streamTickMs: null,
}

export function tick(natural: number): number {
  return mockConfig.streamTickMs ?? natural
}
