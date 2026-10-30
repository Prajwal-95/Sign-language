/**
 * Text-to-speech tests.
 *
 * A fake `window.speechSynthesis` is installed so the real `speakDetailed()`
 * code path runs in Node and we can assert on the exact text and language tag
 * that would reach the speech engine.
 */
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  installLocalStorage,
  installSpeech,
  removeSpeechSupport,
  type FakeVoice,
  type SpeechHarness,
} from './helpers/browser.ts'

const ALL_VOICES: FakeVoice[] = [
  { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US' },
  { name: 'Google UK English Female', lang: 'en-GB' },
  { name: 'Microsoft Swara Online (Natural) - Hindi (India)', lang: 'hi-IN' },
  { name: 'Google Hindi', lang: 'hi' },
]

let harness: SpeechHarness
let spoken: SpeechHarness['spoken']

// Imported after the browser shims exist so module-level checks pass.
const { selectVoice, speakDetailed, speak, hasVoiceForLang, getVoicesForLang, speechSupported } =
  await import('../src/services/tts.ts')

beforeEach(() => {
  installLocalStorage()
  harness = installSpeech([...ALL_VOICES])
  spoken = harness.spoken
})

afterEach(() => {
  harness.uninstall()
})

describe('speech support detection', () => {
  it('reports support when speechSynthesis exists', () => {
    assert.equal(speechSupported(), true)
  })

  it('reports no support when the browser lacks speechSynthesis', () => {
    removeSpeechSupport()
    assert.equal(speechSupported(), false)
  })
})

describe('voice selection', () => {
  it('prefers an exact language match', () => {
    const { voice, match } = selectVoice(ALL_VOICES, 'hi-IN')
    assert.equal(match, 'exact')
    assert.equal(voice!.lang, 'hi-IN')
  })

  it('falls back to a language-prefix match', () => {
    const { voice, match } = selectVoice([{ name: 'Google Hindi', lang: 'hi' }], 'hi-IN')
    assert.equal(match, 'prefix')
    assert.equal(voice!.lang, 'hi')
  })

  it('accepts an explicitly configured voice first', () => {
    const { voice, match } = selectVoice(ALL_VOICES, 'en-US', 'Google UK English Female')
    assert.equal(match, 'explicit')
    assert.equal(voice!.name, 'Google UK English Female')
  })

  it('matches a regional English voice by prefix', () => {
    const { voice, match } = selectVoice([{ name: 'Google UK English Female', lang: 'en-GB' }], 'en-US')
    assert.equal(match, 'prefix')
    assert.equal(voice!.lang, 'en-GB')
  })

  it('does NOT substitute an English voice for Hindi', () => {
    const englishOnly = ALL_VOICES.filter((v) => v.lang.startsWith('en'))
    const { voice, match } = selectVoice(englishOnly, 'hi-IN')
    assert.equal(voice, null)
    assert.equal(match, 'unavailable')
  })

  it('does NOT substitute an English voice for Kannada', () => {
    const englishOnly = ALL_VOICES.filter((v) => v.lang.startsWith('en'))
    const { voice, match } = selectVoice(englishOnly, 'kn-IN')
    assert.equal(voice, null)
    assert.equal(match, 'unavailable')
  })

  it('finds Kannada voices when present', () => {
    const withKannada = [...ALL_VOICES, { name: 'Microsoft Naveen - Kannada (India)', lang: 'kn-IN' }]
    const { voice, match } = selectVoice(withKannada, 'kn-IN')
    assert.equal(match, 'exact')
    assert.equal(voice!.lang, 'kn-IN')
  })

  it('reports platform-default when the voice list has not loaded', () => {
    const { voice, match } = selectVoice([], 'hi-IN')
    assert.equal(voice, null)
    assert.equal(match, 'platform-default')
  })
})

describe('language availability helpers', () => {
  it('detects Hindi and English voices', () => {
    assert.equal(hasVoiceForLang('hi'), true)
    assert.equal(hasVoiceForLang('en'), true)
  })

  it('detects the absence of Kannada voices on this device', () => {
    assert.equal(hasVoiceForLang('kn'), false)
    assert.equal(getVoicesForLang('hi').length, 2)
  })
})

describe('speak() receives translated text and the right locale', () => {
  it('English mode speaks English with en-US', () => {
    const r = speakDetailed('Hello Thank you', { lang: 'en-US' })
    assert.equal(spoken.length, 1)
    assert.equal(spoken[0].text, 'Hello Thank you')
    assert.equal(spoken[0].lang, 'en-US')
    assert.equal(r.ok, true)
    assert.equal(r.missingVoice, false)
  })

  it('Hindi mode speaks Devanagari with hi-IN', () => {
    speakDetailed('नमस्ते धन्यवाद', { lang: 'hi-IN' })
    assert.equal(spoken[0].text, 'नमस्ते धन्यवाद')
    assert.equal(spoken[0].lang, 'hi-IN')
    assert.equal(spoken[0].voice!.lang.startsWith('hi'), true)
  })

  it('Kannada mode speaks Kannada script with kn-IN when a voice exists', () => {
    harness.setVoices([...ALL_VOICES, { name: 'Kannada Voice', lang: 'kn-IN' }])
    const r = speakDetailed('ನಮಸ್ಕಾರ ಧನ್ಯವಾದ', { lang: 'kn-IN' })
    assert.equal(spoken[0].lang, 'kn-IN')
    assert.equal(spoken[0].voice!.lang, 'kn-IN')
    assert.equal(r.ok, true)
  })

  it('does NOT dispatch Kannada text to the engine when no Kannada voice exists', () => {
    // Regression: the old implementation called speechSynthesis.speak() with
    // lang="kn-IN" and no voice, so Windows read Kannada letters out with the
    // English default voice. Nothing may be dispatched at all.
    const r = speakDetailed('ನಮಸ್ಕಾರ', { lang: 'kn-IN' })
    assert.equal(spoken.length, 0, 'must not hand Kannada text to an English voice')
    assert.equal(r.voiceName, null, 'must not attach an English voice')
    assert.equal(r.voiceMatch, 'unavailable')
    assert.equal(r.missingVoice, true)
    assert.equal(r.ok, false, 'must not report success with no Kannada voice')
    assert.equal(r.error?.kind, 'no-voice')
  })

  it('does NOT dispatch Hindi text to the engine when no Hindi voice exists', () => {
    harness.setVoices(ALL_VOICES.filter((v) => v.lang.startsWith('en')))
    const r = speakDetailed('नमस्ते', { lang: 'hi-IN' })
    assert.equal(spoken.length, 0)
    assert.equal(r.ok, false)
    assert.equal(r.missingVoice, true)
  })

  it('never speaks English text when Hindi is selected', () => {
    speakDetailed('नमस्ते', { lang: 'hi-IN' })
    assert.ok(!/[A-Za-z]/.test(spoken[0].text))
    assert.notEqual(spoken[0].lang, 'en-US')
  })

  it('ignores an explicitly chosen English voice for Hindi', () => {
    harness.setVoices(ALL_VOICES.filter((v) => v.lang.startsWith('en')))
    localStorage.setItem('isl-settings', JSON.stringify({ voice: 'Google UK English Female' }))
    const r = speakDetailed('नमस्ते', { lang: 'hi-IN' })
    assert.equal(spoken.length, 0, 'a user-picked English voice must not read Devanagari')
    assert.equal(r.ok, false)
  })

  it('still honours an explicitly chosen English voice for English', () => {
    localStorage.setItem('isl-settings', JSON.stringify({ voice: 'Google UK English Female' }))
    const r = speakDetailed('Hello', { lang: 'en-US' })
    assert.equal(spoken[0].voice!.name, 'Google UK English Female')
    assert.equal(r.ok, true)
  })

  it('does not dispatch anything for empty text', () => {
    const r = speakDetailed('   ', { lang: 'hi-IN' })
    assert.equal(spoken.length, 0)
    assert.equal(r.ok, false)
  })

  it('returns false when speech synthesis is unavailable', () => {
    removeSpeechSupport()
    assert.equal(speak('Hello'), false)
  })

  it('cancels any queued speech before speaking', () => {
    speakDetailed('Hello', { lang: 'en-US' })
    assert.equal(harness.cancelled(), 1)
  })

  it('applies rate and pitch from settings', () => {
    localStorage.setItem('isl-settings', JSON.stringify({ rate: 1.5, pitch: 0.8 }))
    speakDetailed('Hello', { lang: 'en-US' })
    assert.equal(spoken[0].rate, 1.5)
    assert.equal(spoken[0].pitch, 0.8)
  })

  it('respects an explicit voice chosen in Settings', () => {
    localStorage.setItem('isl-settings', JSON.stringify({ voice: 'Google UK English Female' }))
    speakDetailed('Hello', { lang: 'en-US' })
    assert.equal(spoken[0].voice!.name, 'Google UK English Female')
  })
})