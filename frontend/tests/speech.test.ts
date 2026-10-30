/**
 * Speech pipeline tests.
 *
 * These drive the real provider stack (browser + local service) against
 * stand-ins for `window.speechSynthesis`, `fetch` and the audio element. They
 * prove WHICH text and WHICH language tag reach an engine, and that the app
 * never claims audio it did not produce.
 *
 * They do NOT prove that a human hears correct Kannada — that needs the real
 * models and a real sound card. See tools/tts-service/README.md.
 */
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  createFakeAudio,
  createFakeService,
  installLocalStorage,
  installSpeech,
  type FakeVoice,
  type FakeService,
} from './helpers/browser.ts'

const EN_VOICES: FakeVoice[] = [
  { name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US' },
  { name: 'Google UK English Female', lang: 'en-GB' },
]
const HI_VOICE: FakeVoice[] = [{ name: 'Microsoft Swara - Hindi (India)', lang: 'hi-IN' }]
const KN_VOICE: FakeVoice[] = [{ name: 'Microsoft Naveen - Kannada (India)', lang: 'kn-IN' }]

let harness: ReturnType<typeof installSpeech>

const {
  BrowserTtsProvider,
  LocalTtsProvider,
  TtsController,
  selectVoice,
  loadVoices,
  invalidateVoices,
  ensureVoices,
} = await import('../src/services/speech/index.ts')
const { translateSentence, speechPlanForSentence } = await import('../src/services/translation.ts')

const SERVICE_ENGINES = { en: 'mms', hi: 'mms', kn: 'mms' }

function build(voices: FakeVoice[], engines: Record<string, string | null> | null = SERVICE_ENGINES) {
  // The harness holds the browser's voice list; `build` describes the device.
  harness.setVoices(voices)
  invalidateVoices()
  const service = createFakeService()
  service.setEngines(engines)
  const browser = new BrowserTtsProvider()
  const local = new LocalTtsProvider({
    baseUrl: 'http://127.0.0.1:8765',
    fetchImpl: service.fetch,
    audioFactory: () => service.audio,
    createObjectUrl: service.createObjectUrl,
    revokeObjectUrl: service.revokeObjectUrl,
    probeTtlMs: 0,
  })
  return { controller: new TtsController([browser, local]), service, browser, local }
}

beforeEach(() => {
  installLocalStorage()
  harness = installSpeech([...EN_VOICES])
  invalidateVoices()
})

afterEach(() => {
  harness.uninstall()
  invalidateVoices()
})

/* ------------------------------------------------------------------ */
/* 1-3: native browser voices                                          */
/* ------------------------------------------------------------------ */

describe('English / Hindi / Kannada with a native browser voice', () => {
  it('speaks English with an en-US voice and never calls the local service', async () => {
    const { controller, service } = build([...EN_VOICES])
    const outcome = await controller.speak('Hello Thank you', 'en')

    assert.equal(outcome.ok, true)
    assert.equal(outcome.provider, 'browser')
    assert.equal(harness.spoken.length, 1)
    assert.equal(harness.spoken[0].text, 'Hello Thank you')
    assert.equal(harness.spoken[0].lang, 'en-US')
    assert.ok(harness.spoken[0].voice!.lang.startsWith('en'))
    assert.equal(service.requests.length, 0, 'native voice must not trigger a local request')
  })

  it('speaks Hindi with a Hindi voice when the device has one', async () => {
    const { controller, service } = build([...EN_VOICES, ...HI_VOICE])
    const outcome = await controller.speak('नमस्ते धन्यवाद', 'hi')

    assert.equal(outcome.ok, true)
    assert.equal(outcome.provider, 'browser')
    assert.equal(harness.spoken[0].lang, 'hi-IN')
    assert.equal(harness.spoken[0].voice!.lang, 'hi-IN')
    assert.equal(harness.spoken[0].text, 'नमस्ते धन्यवाद')
    assert.equal(service.requests.length, 0)
  })

  it('speaks Kannada with a Kannada voice when the device has one', async () => {
    const { controller, service } = build([...EN_VOICES, ...KN_VOICE])
    const outcome = await controller.speak('ನಮಸ್ಕಾರ ಧನ್ಯವಾದ', 'kn')

    assert.equal(outcome.ok, true)
    assert.equal(outcome.provider, 'browser')
    assert.equal(harness.spoken[0].lang, 'kn-IN')
    assert.equal(harness.spoken[0].voice!.lang, 'kn-IN')
    assert.equal(service.requests.length, 0)
  })
})

/* ------------------------------------------------------------------ */
/* 4-5: no native voice -> local offline provider                      */
/* ------------------------------------------------------------------ */

describe('Hindi / Kannada with no native browser voice', () => {
  it('falls back to the local service for Hindi and sends nothing to the browser engine', async () => {
    const { controller, service } = build([...EN_VOICES])
    const outcome = await controller.speak('नमस्ते', 'hi')

    assert.equal(outcome.ok, true)
    assert.equal(outcome.provider, 'local')
    assert.equal(harness.spoken.length, 0, 'no Hindi text may reach the English browser engine')
    assert.equal(service.requests.length, 1)
    assert.equal(service.requests[0].lang, 'hi')
    assert.equal(service.requests[0].text, 'नमस्ते')
    assert.equal(service.audio.played, 1, 'the returned audio must actually be played')
  })

  it('falls back to the local service for Kannada', async () => {
    const { controller, service } = build([...EN_VOICES])
    const outcome = await controller.speak('ಧನ್ಯವಾದ', 'kn')

    assert.equal(outcome.ok, true)
    assert.equal(outcome.provider, 'local')
    assert.equal(harness.spoken.length, 0)
    assert.equal(service.requests[0].lang, 'kn')
    assert.equal(service.requests[0].text, 'ಧನ್ಯವಾದ')
    assert.equal(service.audio.played, 1)
  })

  it('still prefers a native voice over the local service when both exist', async () => {
    const { controller, service } = build([...EN_VOICES, ...HI_VOICE])
    const outcome = await controller.speak('चाय', 'hi')

    assert.equal(outcome.provider, 'browser')
    assert.equal(service.requests.length, 0)
  })
})

/* ------------------------------------------------------------------ */
/* 6-7: asynchronous voice list + voiceschanged                        */
/* ------------------------------------------------------------------ */

describe('voice discovery', () => {
  it('waits for an initially empty voice list to be published', async () => {
    harness.deferVoices()
    invalidateVoices()

    let resolved = false
    const pending = loadVoices(2000).then((voices) => {
      resolved = true
      return voices
    })

    // The 50 ms "some engines never fire the event" nudge must NOT be treated
    // as "there are no voices" — we keep waiting while time is left.
    await new Promise((resolve) => setTimeout(resolve, 120))
    assert.equal(resolved, false, 'must not give up while the list is still empty')

    harness.emitVoicesChanged([...EN_VOICES, ...HI_VOICE])
    const voices = await pending
    assert.equal(voices.length, 3)
  })

  it('re-reads voices after voiceschanged so a newly installed voice is used', async () => {
    const { controller, service } = build([...EN_VOICES])
    assert.equal((await controller.speak('ಚಹಾ', 'kn')).provider, 'local')
    const before = service.requests.length

    // The user installs a Kannada voice while the app is open.
    invalidateVoices()
    harness.emitVoicesChanged([...EN_VOICES, ...KN_VOICE])

    const outcome = await controller.speak('ಚಹಾ', 'kn')
    assert.equal(outcome.provider, 'browser', 'a newly installed voice must be picked up')
    assert.equal(harness.spoken.at(-1)!.lang, 'kn-IN')
    assert.equal(service.requests.length, before)
  })

  it('resolves immediately when the list is already populated', async () => {
    const voices = await loadVoices()
    assert.equal(voices.length, 2)
  })
})

/* ------------------------------------------------------------------ */
/* 8: provider unavailable / service offline                           */
/* ------------------------------------------------------------------ */

describe('honest failure states', () => {
  it('reports service-offline for Hindi when the local service is not running', async () => {
    const { controller, service } = build([...EN_VOICES], null)
    const outcome = await controller.speak('नमस्ते', 'hi')

    assert.equal(outcome.ok, false)
    assert.equal(outcome.missingVoice, true)
    assert.equal(outcome.error!.kind, 'service-offline')
    assert.equal(outcome.error!.retryable, true)
    assert.match(outcome.error!.action ?? '', /tts-service/i)
    assert.equal(harness.spoken.length, 0)
    assert.equal(service.requests.length, 0, 'a dead service must not be called')
    assert.equal(controller.getState().phase, 'idle')
    assert.equal(controller.getState().error, outcome.error)
  })

  it('reports unsupported-language when the service has no engine for the language', async () => {
    const { controller } = build([...EN_VOICES], { en: null, hi: null, kn: null })
    const outcome = await controller.speak('ಧನ್ಯವಾದ', 'kn')

    assert.equal(outcome.ok, false)
    assert.equal(outcome.error!.kind, 'unsupported-language')
    assert.equal(outcome.error!.retryable, false)
    assert.equal(
      outcome.error!.needsNetwork,
      true,
      'the first model download needs internet; the UI must say so',
    )
    assert.match(outcome.error!.action ?? '', /install\.bat/)
  })

  it('reports a TTS request failure when the service returns an error status', async () => {
    const { controller, service } = build([...EN_VOICES])
    service.setSpeakStatus(500)
    const outcome = await controller.speak('नमस्ते', 'hi')

    assert.equal(outcome.ok, false)
    assert.equal(outcome.error!.kind, 'request-failed')
    assert.equal(outcome.error!.retryable, true)
    assert.equal(service.audio.played, 0, 'no audio may be claimed when synthesis failed')
  })

  it('reports a request failure when the service does not return audio', async () => {
    const { controller, service } = build([...EN_VOICES])
    service.setSpeakContentType('text/html')
    const outcome = await controller.speak('नमस्ते', 'hi')

    assert.equal(outcome.ok, false)
    assert.equal(outcome.error!.kind, 'request-failed')
    assert.equal(service.audio.played, 0)
  })

  it('reports a playback failure when the browser blocks audio', async () => {
    const service = createFakeService({
      audio: createFakeAudio(() =>
        Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })),
      ),
    })
    const local = new LocalTtsProvider({
      baseUrl: 'http://127.0.0.1:8765',
      fetchImpl: service.fetch,
      audioFactory: () => service.audio,
      createObjectUrl: service.createObjectUrl,
      revokeObjectUrl: service.revokeObjectUrl,
      probeTtlMs: 0,
    })
    const controller = new TtsController([new BrowserTtsProvider(), local])

    const outcome = await controller.speak('नमस्ते', 'hi')

    // play() returning is not proof of audio: a blocked element must surface.
    assert.equal(outcome.ok, false)
    assert.equal(outcome.error!.kind, 'playback-failed')
    assert.equal(outcome.error!.retryable, true)
    assert.equal(controller.getState().error?.kind, 'playback-failed')
    assert.equal(service.revoked.length >= 1, true, 'the object URL must be released')
  })

  it('refuses empty text instead of speaking or failing loudly', async () => {
    const { controller, service } = build([...EN_VOICES])
    const outcome = await controller.speak('   ', 'hi')

    assert.equal(outcome.ok, false)
    assert.equal(outcome.error!.kind, 'empty-text')
    assert.equal(outcome.error!.retryable, false)
    assert.equal(harness.spoken.length, 0)
    assert.equal(service.requests.length, 0)
  })

  it('still uses the local service for English when the browser has no engine', async () => {
    harness.uninstall()
    invalidateVoices()
    const { controller, service } = build([...EN_VOICES])
    const outcome = await controller.speak('Hello', 'en')

    assert.equal(outcome.ok, true)
    assert.equal(outcome.provider, 'local')
    assert.equal(service.requests[0].lang, 'en')
  })
})

/* ------------------------------------------------------------------ */
/* 10 + 15: language switching                                         */
/* ------------------------------------------------------------------ */

describe('switching English -> Hindi -> Kannada', () => {
  it('routes each language to the right engine and the right text', async () => {
    const ids = ['HELLO', 'THANK_YOU', 'TEA']
    const { controller, service } = build([...EN_VOICES])

    assert.equal((await controller.speak(translateSentence(ids, 'en'), 'en')).provider, 'browser')
    assert.equal((await controller.speak(translateSentence(ids, 'hi'), 'hi')).provider, 'local')
    assert.equal((await controller.speak(translateSentence(ids, 'kn'), 'kn')).provider, 'local')

    assert.equal(harness.spoken[0].lang, 'en-US')
    assert.equal(service.requests[0].text, 'नमस्ते धन्यवाद चाय')
    assert.equal(service.requests[0].lang, 'hi')
    assert.equal(service.requests[1].text, 'ನಮಸ್ಕಾರ ಧನ್ಯವಾದ ಚಹಾ')
    assert.equal(service.requests[1].lang, 'kn')
  })

  it('does not alter the translated text when the language changes', async () => {
    const ids = ['HELLO', 'WHAT_IS_YOUR_NAME', 'WIFE']
    const english = translateSentence(ids, 'en')
    const hindi = translateSentence(ids, 'hi')
    const kannada = translateSentence(ids, 'kn')

    assert.equal(english, 'Hello What is your name? Wife')
    assert.equal(hindi, 'नमस्ते आपका नाम क्या है? पत्नी')
    // Script check rather than a copied literal: no Latin may leak into hi/kn.
    assert.ok(/[ऀ-ॿ]/.test(hindi) && !/[A-Za-z]/.test(hindi))
    assert.ok(/[ಀ-೿]/.test(kannada) && !/[A-Za-z]/.test(kannada))

    // The buffer is never re-translated from a translated string.
    assert.deepEqual(ids, ['HELLO', 'WHAT_IS_YOUR_NAME', 'WIFE'])
    assert.equal(speechPlanForSentence(ids, 'kn').text, kannada)
    assert.equal(speechPlanForSentence(ids, 'kn').lang, 'kn-IN')
  })

  it('re-publishes availability when the language changes', async () => {
    const { controller } = build([...EN_VOICES])
    const state = await controller.refreshAvailability()

    assert.equal(state.voicesReady, true)
    assert.equal(state.availability.en, true, 'English must always work')
    assert.equal(state.availability.hi, true, 'Hindi comes from the local service')
    assert.equal(state.availability.kn, true, 'Kannada comes from the local service')
  })

  it('publishes honest availability when nothing can speak a language', async () => {
    const { controller } = build([...EN_VOICES], null)
    const state = await controller.refreshAvailability()

    assert.equal(state.availability.en, true)
    assert.equal(state.availability.hi, false)
    assert.equal(state.availability.kn, false)
  })
})

/* ------------------------------------------------------------------ */
/* 11: cancellation                                                    */
/* ------------------------------------------------------------------ */

describe('cancelling speech', () => {
  it('stops local playback and releases the object URL', async () => {
    const { controller, service } = build([...EN_VOICES])
    await controller.speak('नमस्ते', 'hi')
    assert.equal(service.audio.paused, 0)

    controller.stop()

    assert.equal(service.audio.paused, 1)
    assert.equal(service.revoked.length, 1)
    assert.equal(service.revoked[0], service.created[0])
    assert.equal(controller.getState().phase, 'idle')
    assert.equal(controller.getState().error, null)
  })

  it('cancels the browser queue before every new request', async () => {
    const { controller } = build([...EN_VOICES])
    await controller.speak('Hello', 'en')
    const afterFirst = harness.cancelled()

    await controller.speak('Good morning', 'en')
    assert.ok(harness.cancelled() > afterFirst, 'a queued utterance must never stack up')
  })

  it('a superseded request never reports success to a stale caller', async () => {
    const { controller, service } = build([...EN_VOICES])
    const first = controller.speak('चाय', 'hi')
    const second = controller.speak('ಚಹಾ', 'kn')

    const [firstOutcome, secondOutcome] = await Promise.all([first, second])

    assert.equal(firstOutcome.ok, false)
    assert.equal(firstOutcome.error!.kind, 'superseded', 'an overtaken request must not claim success')
    assert.equal(secondOutcome.ok, true)
    assert.equal(service.requests.length, 1, 'an overtaken request is never even synthesised')
    assert.equal(service.requests[0].text, 'ಚಹಾ')
    assert.equal(controller.getState().text, 'ಚಹಾ')
    assert.equal(controller.getState().error, null, 'a supersede must not leave an error behind')
  })
})

/* ------------------------------------------------------------------ */
/* 12: duplicate prevention                                            */
/* ------------------------------------------------------------------ */

describe('duplicate speech prevention', () => {
  it('drops an identical auto-speak request inside the dedupe window', async () => {
    const { controller, service } = build([...EN_VOICES])

    await controller.speak('नमस्ते', 'hi', { dedupeKey: 'hi:HELLO' })
    await controller.speak('नमस्ते', 'hi', { dedupeKey: 'hi:HELLO' })
    await controller.speak('नमस्ते', 'hi', { dedupeKey: 'hi:HELLO' })

    assert.equal(service.requests.length, 1, 'the same sign must not be spoken three times')
  })

  it('still speaks a repeated sign once the dedupe window has passed', async () => {
    const { controller, service } = build([...EN_VOICES])
    await controller.speak('नमस्ते', 'hi', { dedupeKey: 'hi:HELLO' })
    await new Promise((resolve) => setTimeout(resolve, 1600))
    await controller.speak('नमस्ते', 'hi', { dedupeKey: 'hi:HELLO' })

    assert.equal(service.requests.length, 2)
  })

  it('does not dedupe different signs or the same sign in another language', async () => {
    const { controller, service } = build([...EN_VOICES])
    await controller.speak('नमस्ते', 'hi', { dedupeKey: 'hi:HELLO' })
    await controller.speak('धन्यवाद', 'hi', { dedupeKey: 'hi:THANK_YOU' })
    await controller.speak('ನಮಸ್ಕಾರ', 'kn', { dedupeKey: 'kn:HELLO' })

    assert.deepEqual(service.requests.map((r) => r.text), ['नमस्ते', 'धन्यवाद', 'ನಮಸ್ಕಾರ'])
  })

  it('does not dedupe the manual Speak button', async () => {
    const { controller, service } = build([...EN_VOICES])
    await controller.speak('नमस्ते', 'hi')
    await controller.speak('नमस्ते', 'hi')

    assert.equal(service.requests.length, 2)
  })
})

/* ------------------------------------------------------------------ */
/* 13: Unicode preservation                                            */
/* ------------------------------------------------------------------ */

describe('Unicode preservation', () => {
  it('hands Hindi text to the service unchanged', async () => {
    const text = translateSentence(['HELLO', 'WHAT_IS_YOUR_NAME'], 'hi')
    const { controller, service } = build([...EN_VOICES])
    await controller.speak(text, 'hi')

    assert.equal(service.requests[0].text, text)
    assert.equal(service.requests[0].text, 'नमस्ते आपका नाम क्या है?')
    assert.ok(/[ऀ-ॿ]/.test(service.requests[0].text))
    assert.ok(!/[A-Za-z]/.test(service.requests[0].text), 'no class labels may leak in')
  })

  it('hands Kannada text to the service unchanged', async () => {
    const text = translateSentence(['HELLO', 'TEA'], 'kn')
    const { controller, service } = build([...EN_VOICES])
    await controller.speak(text, 'kn')

    assert.equal(service.requests[0].text, 'ನಮಸ್ಕಾರ ಚಹಾ')
    assert.ok(/[ಀ-೿]/.test(service.requests[0].text))
    assert.ok(!/[A-Za-z]/.test(service.requests[0].text))
  })

  it('normalises to NFC so combining marks survive the JSON round trip', async () => {
    const decomposed = 'नमस्ते' // nfd: न म स ् त े
    const { controller, service } = build([...EN_VOICES])
    await controller.speak(decomposed, 'hi')

    assert.equal(service.requests[0].text, decomposed)
    assert.equal(service.requests[0].text, 'नमस्ते')
  })

  it('keeps punctuation used by the sign table', async () => {
    const text = translateSentence(['WHAT_IS_YOUR_NAME'], 'kn')
    const { controller, service } = build([...EN_VOICES])
    await controller.speak(text, 'kn')

    assert.equal(service.requests[0].text, 'ನಿಮ್ಮ ಹೆಸರೇನು?')
  })
})

/* ------------------------------------------------------------------ */
/* 14: no cross-language voice borrowing                               */
/* ------------------------------------------------------------------ */

describe('an English voice is never used for an Indian language', () => {
  it('selectVoice returns nothing for Hindi and Kannada', () => {
    assert.deepEqual(selectVoice(EN_VOICES, 'hi-IN'), { voice: null, match: 'unavailable' })
    assert.deepEqual(selectVoice(EN_VOICES, 'kn-IN'), { voice: null, match: 'unavailable' })
  })

  it('an explicitly chosen English voice is ignored for Hindi', () => {
    const result = selectVoice(EN_VOICES, 'hi-IN', 'Google UK English Female')
    assert.equal(result.voice, null)
    assert.equal(result.match, 'unavailable')
  })

  it('an explicitly chosen English voice is still honoured for English', () => {
    const result = selectVoice(EN_VOICES, 'en-US', 'Google UK English Female')
    assert.equal(result.match, 'explicit')
    assert.equal(result.voice!.name, 'Google UK English Female')
  })

  it('nothing is dispatched to the browser engine for Kannada text', async () => {
    const { controller, service } = build([...EN_VOICES], null)
    const outcome = await controller.speak('ನಮಸ್ಕಾರ', 'kn')

    assert.equal(outcome.ok, false)
    assert.equal(harness.spoken.length, 0, 'Kannada must not be read out by an English voice')
    assert.equal(service.requests.length, 0)
  })

  it('the browser provider reports the real capability per language', async () => {
    const browser = new BrowserTtsProvider()
    await ensureVoices()

    assert.equal(await browser.supportsLanguage('en'), true)
    assert.equal(await browser.supportsLanguage('hi'), false)
    assert.equal(await browser.supportsLanguage('kn'), false)

    harness.setVoices([...EN_VOICES, ...HI_VOICE, ...KN_VOICE])
    invalidateVoices()
    assert.equal(await browser.supportsLanguage('hi'), true)
    assert.equal(await browser.supportsLanguage('kn'), true)
  })
})

/* ------------------------------------------------------------------ */
/* settings + service configuration                                    */
/* ------------------------------------------------------------------ */

describe('speech settings reach every provider', () => {
  it('applies rate and pitch from localStorage to local requests', async () => {
    localStorage.setItem('isl-settings', JSON.stringify({ rate: 1.4, pitch: 0.8, autoSpeak: true }))
    const { controller, service } = build([...EN_VOICES])
    await controller.speak('नमस्ते', 'hi')

    assert.equal(service.requests[0].rate, 1.4)
    assert.equal(service.requests[0].pitch, 0.8)
  })

  it('applies rate and pitch from localStorage to browser utterances', async () => {
    localStorage.setItem('isl-settings', JSON.stringify({ rate: 1.2, pitch: 0.9 }))
    const { controller } = build([...EN_VOICES])
    await controller.speak('Hello', 'en')

    assert.equal(harness.spoken[0].rate, 1.2)
    assert.equal(harness.spoken[0].pitch, 0.9)
  })

  it('sends rate/pitch overrides when the caller supplies them', async () => {
    const { controller, service } = build([...EN_VOICES])
    await controller.speak('नमस्ते', 'hi', { rate: 1.5, pitch: 1 })

    assert.equal(service.requests[0].rate, 1.5)
  })
})

describe('service availability is cached and refreshable', () => {
  it('probes once and reuses the answer', async () => {
    const service: FakeService = createFakeService()
    let probes = 0
    const countingFetch = ((...args: Parameters<typeof fetch>) => {
      if (String(args[0]).endsWith('/health')) probes++
      return service.fetch(...args)
    }) as typeof fetch

    const local = new LocalTtsProvider({
      baseUrl: 'http://127.0.0.1:8765',
      fetchImpl: countingFetch,
      audioFactory: () => service.audio,
      createObjectUrl: service.createObjectUrl,
      revokeObjectUrl: service.revokeObjectUrl,
      probeTtlMs: 30_000,
    })

    await local.supportsLanguage('hi')
    await local.supportsLanguage('kn')
    assert.equal(probes, 1, 'the health probe must be cached')

    local.invalidate()
    await local.supportsLanguage('hi')
    assert.equal(probes, 2, 'retry() must be able to force a fresh probe')
  })

  it('reports the engine name the service advertises', async () => {
    const service = createFakeService()
    service.setEngines({ en: null, hi: 'mms', kn: 'piper' })
    const local = new LocalTtsProvider({
      baseUrl: 'http://127.0.0.1:8765',
      fetchImpl: service.fetch,
      probeTtlMs: 0,
    })

    assert.equal(await local.engineFor('hi'), 'mms')
    assert.equal(await local.engineFor('kn'), 'piper')
    assert.equal(await local.engineFor('en'), null)
  })
})

/* ------------------------------------------------------------------ */
/* Regression: the Kannada failure                                     */
/* ------------------------------------------------------------------ */

describe('regression - Kannada depends entirely on the local service', () => {
  // Chrome ships an online hi-IN voice but NO Kannada voice, so this device
  // reports exactly { en: true, hi: true, kn: false } when the service is down.
  const systemVoices = [...EN_VOICES, ...HI_VOICE]

  it('shows Kannada as the only missing language when the service is down', async () => {
    const { controller } = build(systemVoices, null)
    const state = await controller.refreshAvailability()

    assert.deepEqual(state.availability, { en: true, hi: true, kn: false })
    controller.dispose()
  })

  it('names the real reason instead of a generic failure', async () => {
    const { controller } = build(systemVoices, null)
    const outcome = await controller.speak('ನಮಸ್ಕಾರ', 'kn')

    assert.equal(outcome.ok, false)
    assert.equal(outcome.error!.kind, 'service-offline')
    assert.match(outcome.error!.message, /Kannada/)
    assert.match(outcome.error!.message, /not running/)
    assert.equal(outcome.error!.retryable, true)
    controller.dispose()
  })

  it('keeps Hindi working through the system voice while Kannada is unavailable', async () => {
    const { controller, service } = build(systemVoices, null)
    const hindi = await controller.speak('नमस्ते', 'hi')

    assert.equal(hindi.ok, true, 'Hindi must not depend on the local service')
    assert.equal(hindi.provider, 'browser')
    assert.equal(hindi.voiceLang, 'hi-IN')
    assert.equal(service.requests.length, 0)
    controller.dispose()
  })

  it('recovers Kannada on its own once the service comes up (no reload)', async () => {
    const { controller, service } = build(systemVoices, null)

    const before = await controller.refreshAvailability()
    assert.equal(before.availability.kn, false)

    // The user starts run.bat in another window.
    service.setEngines(SERVICE_ENGINES)

    // No further calls: the controller must keep re-probing by itself.
    let after = before
    for (let i = 0; i < 20 && !after.availability.kn; i++) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      after = controller.getState()
    }

    assert.equal(after.availability.kn, true, 'availability must self-heal without a reload')
    const outcome = await controller.speak('ನಮಸ್ಕಾರ', 'kn')
    assert.equal(outcome.ok, true)
    assert.equal(outcome.provider, 'local')
    assert.equal(service.audio.played, 1, 'Kannada audio must actually be played')
    controller.dispose()
  })

  it('does not cache a failed probe for the full 30s TTL', async () => {
    const service = createFakeService()
    service.setEngines(null)
    let probes = 0
    const countingFetch = ((...args: Parameters<typeof fetch>) => {
      if (String(args[0]).endsWith('/health')) probes++
      return service.fetch(...args)
    }) as typeof fetch

    const local = new LocalTtsProvider({
      baseUrl: 'http://127.0.0.1:8765',
      fetchImpl: countingFetch,
      probeTtlMs: 30_000,
    })

    assert.equal(await local.supportsLanguage('kn'), false)
    const afterFirst = probes

    // A service that is still booting must be picked up quickly, not in 30s.
    service.setEngines(SERVICE_ENGINES)
    await new Promise((resolve) => setTimeout(resolve, 2100))
    assert.equal(
      await local.supportsLanguage('kn'),
      true,
      'a failed probe must expire quickly so a starting service is noticed',
    )
    assert.ok(probes > afterFirst)
  })
})