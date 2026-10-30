/**
 * Minimal browser shims for running the real service modules under Node.
 *
 * These mirror only the surface the services actually touch, so the tests
 * exercise production code paths rather than re-implementations.
 */

export interface FakeVoice {
  name: string
  lang: string
}

export interface SpokenUtterance {
  text: string
  lang: string
  voice: FakeVoice | null
  rate: number
  pitch: number
  volume: number
}

export class FakeUtterance {
  text: string
  lang = ''
  voice: FakeVoice | null = null
  rate = 1
  pitch = 1
  volume = 1
  onstart: ((event?: unknown) => void) | null = null
  onend: ((event?: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  constructor(text: string) {
    this.text = text
  }

  /** Simulate the engine starting playback. */
  fireStart(): void {
    this.onstart?.()
  }

  /** Simulate the utterance finishing normally. */
  fireEnd(): void {
    this.onend?.()
  }

  /** Simulate an engine error, e.g. `{ error: 'synthesis-failed' }`. */
  fireError(code: string): void {
    this.onerror?.({ error: code })
  }
}

/** In-memory localStorage. */
export function installLocalStorage() {
  const store = new Map<string, string>()
  const shim = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
  ;(globalThis as Record<string, unknown>).localStorage = shim
  return shim
}

export interface SpeechHarness {
  spoken: SpokenUtterance[]
  /** Live utterance objects, for firing lifecycle events. */
  utterances: FakeUtterance[]
  cancelled: () => number
  setVoices: (list: FakeVoice[]) => void
  /** Make getVoices() return [] until voices are published. */
  deferVoices: () => void
  /** Publish a voice list and fire `voiceschanged`. */
  emitVoicesChanged: (list?: FakeVoice[]) => void
  /** Fire `onstart` on every utterance (models a working engine). */
  startAll: () => void
  finishLast: () => void
  failLast: (code: string) => void
  uninstall: () => void
}

/** Install a fake window.speechSynthesis so `speechSupported()` returns true. */
export function installSpeech(initialVoices: FakeVoice[] = [], options: { autoStart?: boolean } = {}): SpeechHarness {
  const g = globalThis as Record<string, unknown>
  const autoStart = options.autoStart ?? true
  // `null` means "the browser has not published its voice list yet", which is
  // what Chrome and Edge do on first load.
  let voices: FakeVoice[] | null = initialVoices
  const spoken: SpokenUtterance[] = []
  const utterances: FakeUtterance[] = []
  let cancelCount = 0
  const listeners = new Map<string, Set<() => void>>()

  const fire = (event: string) => {
    for (const handler of listeners.get(event) ?? []) handler()
  }

  g.SpeechSynthesisUtterance = FakeUtterance
  g.window = {
    speechSynthesis: {
      getVoices: () => voices ?? [],
      speak: (u: FakeUtterance) => {
        utterances.push(u)
        spoken.push({
          text: u.text,
          lang: u.lang,
          voice: u.voice as FakeVoice | null,
          rate: u.rate,
          pitch: u.pitch,
          volume: u.volume,
        })
        if (autoStart) setTimeout(() => u.fireStart(), 0)
      },
      cancel: () => {
        cancelCount++
      },
      addEventListener: (event: string, handler: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)!.add(handler)
      },
      removeEventListener: (event: string, handler: () => void) => {
        listeners.get(event)?.delete(handler)
      },
    },
  }

  return {
    spoken,
    utterances,
    cancelled: () => cancelCount,
    setVoices: (list) => {
      voices = list
    },
    deferVoices: () => {
      voices = null
    },
    emitVoicesChanged: (list) => {
      if (list) voices = list
      fire('voiceschanged')
    },
    startAll: () => {
      for (const utterance of utterances) utterance.fireStart()
    },
    finishLast: () => utterances[utterances.length - 1]?.fireEnd(),
    failLast: (code) => utterances[utterances.length - 1]?.fireError(code),
    uninstall: () => {
      delete g.window
      delete g.SpeechSynthesisUtterance
    },
  }
}

/** Remove any speech support (browser without speechSynthesis). */
export function removeSpeechSupport() {
  delete (globalThis as Record<string, unknown>).window
}

/* ------------------------------------------------------------------ */
/* Local speech service doubles                                        */
/* ------------------------------------------------------------------ */

export interface FakeAudio {
  src: string
  currentTime: number
  played: number
  paused: number
  handlers: Map<string, Set<() => void>>
  play: () => Promise<void>
  pause: () => void
  addEventListener: (type: string, handler: () => void) => void
  removeEventListener: (type: string, handler: () => void) => void
  fire: (type: string) => void
}

/** A stand-in for HTMLAudioElement that records what it was asked to do. */
export function createFakeAudio(playImpl?: () => Promise<void>): FakeAudio {
  const handlers = new Map<string, Set<() => void>>()
  const audio: FakeAudio = {
    src: '',
    currentTime: 0,
    played: 0,
    paused: 0,
    handlers,
    play: () => {
      audio.played++
      return playImpl ? playImpl() : Promise.resolve()
    },
    pause: () => {
      audio.paused++
    },
    addEventListener: (type, handler) => {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
    },
    removeEventListener: (type, handler) => {
      handlers.get(type)?.delete(handler)
    },
    fire: (type) => {
      for (const handler of handlers.get(type) ?? []) handler()
    },
  }
  return audio
}

export interface SpeakRequestRecord {
  url: string
  text: string
  lang: string
  rate: number
  pitch: number
}

export interface FakeService {
  fetch: typeof fetch
  requests: SpeakRequestRecord[]
  /** Object URLs handed out, in order. */
  created: string[]
  /** Object URLs revoked, in order. */
  revoked: string[]
  audio: FakeAudio
  createObjectUrl: (blob: Blob) => string
  revokeObjectUrl: (url: string) => void
  /** Configure what /health reports. Pass null to simulate "service offline". */
  setEngines: (engines: Record<string, string | null> | null) => void
  /** Make POST /speak answer with this status instead of audio. */
  setSpeakStatus: (status: number | null) => void
  setSpeakContentType: (contentType: string) => void
}

const HEALTH_OK = { ok: true, engines: { en: null, hi: 'mms', kn: 'mms' }, version: 'test' }

/**
 * A loopback speech service double: /health plus /speak returning WAV bytes.
 * No network and no real audio element — everything is observable.
 */
export function createFakeService(
  options: {
    audio?: FakeAudio
    objectUrlPrefix?: string
  } = {},
): FakeService {
  const audio = options.audio ?? createFakeAudio()
  const prefix = options.objectUrlPrefix ?? 'blob:test/'
  const state: {
    engines: Record<string, string | null> | null
    speakStatus: number | null
    contentType: string
  } = { engines: HEALTH_OK.engines, speakStatus: null, contentType: 'audio/wav' }

  const requests: SpeakRequestRecord[] = []
  const created: string[] = []
  const revoked: string[] = []
  let urlCounter = 0

  const jsonResponse = (body: unknown, status = 200) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      json: async () => body,
    }) as unknown as Response

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/health')) {
      if (!state.engines) throw new TypeError('Failed to fetch')
      return jsonResponse({ ...HEALTH_OK, engines: state.engines })
    }
    if (url.endsWith('/speak')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        text?: string
        lang?: string
        rate?: number
        pitch?: number
      }
      requests.push({
        url,
        text: body.text ?? '',
        lang: body.lang ?? '',
        rate: body.rate ?? 1,
        pitch: body.pitch ?? 1,
      })
      if (state.speakStatus !== null) {
        return {
          ok: false,
          status: state.speakStatus,
          headers: { get: () => 'text/plain' },
        } as unknown as Response
      }
      if (init?.signal?.aborted) {
        const error = new Error('aborted')
        error.name = 'AbortError'
        throw error
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => state.contentType },
        blob: async () => new Blob([new Uint8Array([82, 73, 70, 70])]),
      } as unknown as Response
    }
    throw new TypeError(`Unexpected request: ${url}`)
  }) as unknown as typeof fetch

  return {
    fetch: fetchImpl,
    requests,
    created,
    revoked,
    audio,
    createObjectUrl: () => {
      urlCounter += 1
      const url = `${prefix}${urlCounter}`
      created.push(url)
      return url
    },
    revokeObjectUrl: (url) => {
      revoked.push(url)
    },
    setEngines: (engines) => {
      state.engines = engines
    },
    setSpeakStatus: (status) => {
      state.speakStatus = status
    },
    setSpeakContentType: (contentType) => {
      state.contentType = contentType
    },
  }
}