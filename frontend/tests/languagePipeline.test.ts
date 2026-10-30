/**
 * Regression tests for the multilingual pipeline.
 *
 * The bug: `PredictSocket` is created once per recognition session and stores
 * its callback permanently. The callback was the `useCallback` from the render
 * in which the socket was created, so it kept closing over the output language
 * of that render. Switching to Hindi or Kannada mid-session therefore kept
 * producing — and speaking — English.
 *
 * These tests exercise the two mechanisms that prevent it:
 *   1. `createLatestHandler` — a stable dispatcher always calling the newest handler.
 *   2. `translateSentence` — the single builder for the visible sentence, which
 *      always reads the internal sign IDs.
 */
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { createLatestHandler } from '../src/services/latestHandler.ts'
import { translateSentence, speechPlanForSentence, speechPlanForSign, type Language, type SignId } from '../src/services/translation.ts'

/** Mirrors PredictSocket: the callback is stored once and kept forever. */
class PredictionSocket<T> {
  private readonly handler: (payload: T) => void
  constructor(handler: (payload: T) => void) {
    this.handler = handler
  }
  emit(payload: T) {
    this.handler(payload)
  }
}

describe('stale-closure regression (socket created before language switch)', () => {
  interface State {
    sentence: string
    spoken: string[]
  }

  function makeSession(initial: Language) {
    let language = initial
    const state: State = { sentence: '', spoken: [] }

    const handler = createLatestHandler((signId: SignId) => {
      const displayWord = translateSentence([signId], language)
      state.sentence = displayWord
      state.spoken.push(speechPlanForSign(signId, language).text)
    })

    // Exactly what useSignRecognition does: one socket for the whole session.
    const socket = new PredictionSocket<SignId>(handler)

    return {
      socket,
      state,
      setLanguage(next: Language) {
        language = next
        // React re-creates onPrediction on language change and installs it.
        handler.set((signId: SignId) => {
          const displayWord = translateSentence([signId], language)
          state.sentence = displayWord
          state.spoken.push(speechPlanForSign(signId, language).text)
        })
      },
    }
  }

  it('a socket built in English keeps speaking English (the original bug)', () => {
    const s = makeSession('en')
    s.socket.emit('HELLO')
    assert.equal(s.state.sentence, 'Hello')
    assert.deepEqual(s.state.spoken, ['Hello'])
  })

  it('the same socket produces Hindi after switching language mid-session', () => {
    const s = makeSession('en')
    s.socket.emit('HELLO') // English prediction arrives
    assert.equal(s.state.sentence, 'Hello')

    s.setLanguage('hi')
    s.socket.emit('HELLO') // same socket, new prediction

    assert.equal(s.state.sentence, 'नमस्ते', 'sentence must switch to Hindi')
    assert.deepEqual(s.state.spoken, ['Hello', 'नमस्ते'], 'auto-speak must switch to Hindi')
    assert.ok(!/[A-Za-z]/.test(s.state.sentence), 'no English may leak into Hindi output')
  })

  it('the same socket produces Kannada after switching language mid-session', () => {
    const s = makeSession('en')
    s.socket.emit('HELLO')
    s.setLanguage('kn')
    s.socket.emit('THANK_YOU')

    assert.equal(s.state.sentence, 'ಧನ್ಯವಾದ')
    assert.equal(s.state.spoken[1], 'ಧನ್ಯವಾದ')
  })

  it('switching back to English restores the original English output', () => {
    const s = makeSession('en')
    s.socket.emit('HELLO')
    s.setLanguage('hi')
    s.socket.emit('HELLO')
    s.setLanguage('en')
    s.socket.emit('HELLO')

    assert.equal(s.state.sentence, 'Hello')
    assert.deepEqual(s.state.spoken, ['Hello', 'नमस्ते', 'Hello'])
  })

  it('changing language repeatedly never leaves English in a hi/kn session', () => {
    const s = makeSession('hi')
    s.setLanguage('kn')
    s.socket.emit('HELLO')
    s.setLanguage('hi')
    s.socket.emit('TEA')

    assert.equal(s.state.sentence, 'चाय')
    assert.deepEqual(s.state.spoken, ['ನಮಸ್ಕಾರ', 'चाय'])
  })
})

describe('createLatestHandler', () => {
  it('forwards to the installed handler', () => {
    const calls: string[] = []
    const h = createLatestHandler<string>((v) => calls.push(`a:${v}`))
    h('x')
    assert.deepEqual(calls, ['a:x'])
  })

  it('forwards to the newest handler after set()', () => {
    const calls: string[] = []
    const h = createLatestHandler<string>(() => calls.push('old'))
    h.set((v) => calls.push(`new:${v}`))
    h('y')
    assert.deepEqual(calls, ['new:y'])
  })

  it('keeps the same function identity across set()', () => {
    const h = createLatestHandler<string>(() => {})
    const before = h
    h.set(() => {})
    assert.equal(h, before, 'the dispatcher must stay stable for long-lived subscriptions')
  })

  it('forwards all arguments', () => {
    let received: number[] = []
    const h = createLatestHandler<[number, number]>((a, b) => { received = [a, b] })
    h(1, 2)
    assert.deepEqual(received, [1, 2])
  })
})

describe('sentence buffer operations (undo / clear / space)', () => {
  /** Mirrors the hook's buffer: internal IDs are the source of truth. */
  function makeBuffer(initial: Language) {
    let language = initial
    let ids: string[] = []
    const view = () => translateSentence(ids, language)
    return {
      get ids() { return [...ids] },
      get sentence() { return view() },
      setLanguage(next: Language) { language = next },
      add(id: string) { ids = [...ids, id] },
      addSpace() { ids = [...ids, 'SPACE'] },
      undo() { ids = ids.slice(0, -1) },
      clear() { ids = [] },
    }
  }

  it('adds recognised signs', () => {
    const b = makeBuffer('en')
    b.add('HELLO'); b.add('TEA')
    assert.equal(b.sentence, 'Hello Tea')
  })

  it('undo removes the last sign in every language', () => {
    for (const lang of ['en', 'hi', 'kn'] as Language[]) {
      const b = makeBuffer(lang)
      b.add('HELLO'); b.add('TEA')
      b.undo()
      assert.equal(b.sentence, translateSentence(['HELLO'], lang))
    }
  })

  it('undo on an empty buffer is a no-op', () => {
    const b = makeBuffer('hi')
    b.undo()
    assert.equal(b.sentence, '')
  })

  it('clear empties the sentence', () => {
    const b = makeBuffer('kn')
    b.add('HELLO'); b.clear()
    assert.equal(b.sentence, '')
  })

  it('Space inserts a separator without duplicating whitespace', () => {
    const b = makeBuffer('hi')
    b.add('HELLO'); b.addSpace(); b.add('TEA')
    assert.equal(b.sentence, 'नमस्ते चाय')
  })

  it('a language switch re-renders the whole existing sentence from IDs', () => {
    const b = makeBuffer('en')
    b.add('HELLO'); b.add('THANK_YOU')

    assert.equal(b.sentence, 'Hello Thank you')
    b.setLanguage('hi')
    assert.equal(b.sentence, 'नमस्ते धन्यवाद')
    b.setLanguage('kn')
    assert.equal(b.sentence, 'ನಮಸ್ಕಾರ ಧನ್ಯವಾದ')
    b.setLanguage('en')
    assert.equal(b.sentence, 'Hello Thank you')
    // the internal IDs were never touched
    assert.deepEqual(b.ids, ['HELLO', 'THANK_YOU'])
  })
})

describe('speak button uses the translated sentence', () => {
  it('sends Hindi text with hi-IN', () => {
    const plan = speechPlanForSentence(['HELLO', 'THANK_YOU'], 'hi')
    assert.equal(plan.text, 'नमस्ते धन्यवाद')
    assert.equal(plan.lang, 'hi-IN')
    assert.ok(!/HELLO|THANK_YOU/.test(plan.text), 'class labels must never be spoken')
  })

  it('sends Kannada text with kn-IN', () => {
    const plan = speechPlanForSentence(['HELLO', 'THANK_YOU'], 'kn')
    assert.equal(plan.lang, 'kn-IN')
    assert.ok(/[ಀ-೿]/.test(plan.text))
    assert.ok(!/HELLO|THANK_YOU/.test(plan.text))
  })

  it('sends English text with en-US (unchanged behaviour)', () => {
    const plan = speechPlanForSentence(['HELLO', 'THANK_YOU'], 'en')
    assert.equal(plan.text, 'Hello Thank you')
    assert.equal(plan.lang, 'en-US')
  })
})

describe('real PredictSocket honours a language change after it was created', () => {
  // Drives the actual src/services/ws.ts implementation against a fake
  // WebSocket, so the permanent-callback behaviour is genuinely exercised.
  interface FakeSocket {
    url: string
    onmessage: ((e: { data: string }) => void) | null
    onclose: (() => void) | null
    onerror: (() => void) | null
    onopen: (() => void) | null
    deliver: (payload: unknown) => void
  }

  let live: FakeSocket | null = null

  class FakeWebSocket {
    onmessage: ((e: { data: string }) => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onopen: (() => void) | null = null
    readyState = 1
    send() {}
    close() {
      this.readyState = 3
      this.onclose?.()
    }
    deliver(payload: unknown) {
      this.onmessage?.({ data: JSON.stringify(payload) })
    }
    url: string
    constructor(url: string) {
      this.url = url
      live = this
    }
  }

  beforeEach(() => {
    const g = globalThis as Record<string, unknown>
    g.window = { setInterval: () => 0, clearInterval: () => {} }
    g.WebSocket = FakeWebSocket
    live = null
  })

  afterEach(() => {
    const g = globalThis as Record<string, unknown>
    delete g.window
    delete g.WebSocket
  })

  async function socketFactory() {
    const { PredictSocket } = await import('../src/services/ws.ts')
    return PredictSocket
  }

  it('uses the newest handler after the language changes mid-session', async () => {
    const PredictSocket = await socketFactory()

    let language: Language = 'en'
    const seen: string[] = []
    const render = () => (pred: { sign: string | null; accepted: boolean }) => {
      if (pred.accepted && pred.sign) seen.push(translateSentence([pred.sign], language))
    }

    // Session starts in English.
    const handler = createLatestHandler(render())
    const socket = new PredictSocket('http://localhost:8000', () => {}, handler)
    socket.connect()
    assert.ok(live, 'WebSocket should have been constructed')
    assert.equal(live!.url, 'ws://localhost:8000/ws/predict')

    live!.deliver({ sign: 'HELLO', accepted: true })
    assert.equal(seen[0], 'Hello')

    // User switches the output language while the socket stays connected.
    language = 'hi'
    handler.set(render())

    live!.deliver({ sign: 'HELLO', accepted: true })
    assert.equal(seen[1], 'नमस्ते', 'socket must use the NEW language handler')
    assert.ok(!/[A-Za-z]/.test(seen[1]), 'no English may leak into Hindi output')

    language = 'kn'
    handler.set(render())
    live!.deliver({ sign: 'THANK_YOU', accepted: true })
    assert.equal(seen[2], 'ಧನ್ಯವಾದ')

    socket.close()
  })
})