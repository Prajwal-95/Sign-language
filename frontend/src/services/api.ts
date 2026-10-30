/**
 * Base URL for every REST call.
 *
 * Resolution order:
 *   1. VITE_API_BASE_URL — the documented, supported configuration.
 *   2. http://127.0.0.1:8000 during `npm run dev` only.
 *   3. The current origin in production, so a same-origin deployment needs no
 *      hardcoded URL and an HTTPS deployment automatically produces wss://
 *      WebSocket connections (see services/ws.ts).
 */
export const API_BASE: string =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://127.0.0.1:8000' : window.location.origin)

export interface HealthResponse {
  status: string
  environment: string
  model_loaded: boolean
  model_path: string
  num_classes?: number
  version: string
}
export async function checkBackendHealth(timeoutMs = 3000): Promise<HealthResponse | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: controller.signal })
    if (!res.ok) return null
    return (await res.json()) as HealthResponse
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface RecordResult {
  saved: string
  sign: string
  sample_index: number
  frames_used: number
}

/** List the current vocabulary signs from the backend. */
export async function fetchVocab(timeoutMs = 5000): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/vocab`, { signal: controller.signal })
    if (!res.ok) return []
    const data = (await res.json()) as { vocab: string[] }
    return data.vocab ?? []
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** Send one user-recorded landmark sequence to be added to the training data. */
export async function recordSample(
  sign: string,
  frames: { hands: unknown[] }[],
  timeoutMs = 10_000,
): Promise<RecordResult | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/record-sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sign, frames }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail ?? `HTTP ${res.status}`)
    }
    return (await res.json()) as RecordResult
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch how many user-recorded samples exist per sign (from the backend). */
export async function fetchSampleCounts(timeoutMs = 5000): Promise<Record<string, number>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/sample-counts`, { signal: controller.signal })
    if (!res.ok) return {}
    const data = (await res.json()) as { counts: Record<string, number> }
    return data.counts ?? {}
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
  }
}

/** Result of registering a new user-defined sign. */
export interface AddVocabResult {
  sign: string
  vocab: string[]
}

/**
 * Register a user-defined sign so the Sample Collector can record samples
 * for it. The word is normalised to UPPER_SNAKE_CASE and persisted on the
 * backend; it appears in `/api/vocab` immediately and is picked up by the
 * next training run.
 */
export async function addCustomSign(sign: string, timeoutMs = 10_000): Promise<AddVocabResult | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/add-vocab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sign: sign.trim() }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail ?? `HTTP ${res.status}`)
    }
    return (await res.json()) as AddVocabResult
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  } finally {
    clearTimeout(timer)
  }
}
