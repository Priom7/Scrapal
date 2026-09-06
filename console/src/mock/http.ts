// A fetch-shaped stand-in for the API. Swapping the transport rather than the
// api.ts helpers keeps the real request builder, error unwrapping and SSE
// parsing on the tested path — the mock only decides what comes back.
import { mockConfig, type MockConfig } from './config'
import { MockHttpError, resolve } from './handlers'

export { mockConfig }
export type { MockConfig }

export const mockEnabled = import.meta.env.VITE_MOCK === '1'

function delay(): Promise<void> {
  const { minLatencyMs, maxLatencyMs } = mockConfig
  const span = Math.max(0, maxLatencyMs - minLatencyMs)
  const wait = minLatencyMs + Math.random() * span
  return new Promise((resolve) => setTimeout(resolve, wait))
}

function json(data: unknown, status = 200): Response {
  if (data === undefined) return new Response(null, { status: 204 })
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(status: number, detail: string): Response {
  return json({ detail }, status)
}

export const mockFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : null
  const raw = request ? request.url : String(input)
  const url = new URL(raw, globalThis.location?.origin ?? 'http://localhost')
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
  // api.ts prefixes every path with the /api base; routes are declared without it.
  const path = url.pathname.replace(/^\/api/, '')

  await delay()

  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (mockConfig.failPathContains && path.includes(mockConfig.failPathContains)) {
    return problem(503, `Mock fault injected for ${path}`)
  }
  if (mockConfig.errorRate > 0 && Math.random() < mockConfig.errorRate) {
    return problem(500, 'Mock transport injected a failure')
  }

  const handler = resolve(path, method)
  if (!handler) {
    return problem(501, `No mock handler for ${method} ${path}. Add one in src/mock/handlers.ts.`)
  }

  try {
    const result = handler(url, init ?? undefined)
    // A handler may answer with a stream; that is how the run endpoint stands in
    // for server-sent events, so api.ts parses real frames off a real body.
    if (result instanceof ReadableStream) {
      return new Response(result, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      })
    }
    return json(result)
  } catch (error) {
    if (error instanceof MockHttpError) return problem(error.status, error.message)
    return problem(500, error instanceof Error ? error.message : 'Mock handler failed')
  }
}

export const http: typeof fetch = mockEnabled
  ? mockFetch
  : (input, init) => fetch(input, init)
