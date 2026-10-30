/**
 * Translation dictionary tests.
 *
 * Covers all 20 model classes in all 3 output languages, plus the sentence
 * pipeline that the Translator page renders.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  TRANSLATIONS,
  TRANSLATION_MAP,
  TTS_LANGUAGE,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGES,
  isLanguage,
  parseSignId,
  translateSign,
  translateSentence,
  getTtsLang,
  speechPlanForSentence,
  speechPlanForSign,
  type Language,
  type SignId,
} from '../src/services/translation.ts'

/** The model's 20 classes, exactly as in models/word_classes.json. */
const MODEL_CLASSES: SignId[] = [
  'STILL', 'HELLO', 'THANK_YOU', 'GOOD_MORNING', 'GOOD_AFTERNOON',
  'WHAT_IS_YOUR_NAME', 'MAYBE', 'COME', 'DRINK', 'GIVE', 'CLEAN', 'COOK',
  'CLOSE', 'BREAK', 'POUR', 'CRY', 'JUMP', 'TEA', 'KEY', 'WIFE',
]

/** Signs that produce visible text (STILL and SPACE are not displayable). */
const SPEAKABLE: SignId[] = MODEL_CLASSES.filter((id) => id !== 'STILL')

const DEVANAGARI = /[ऀ-ॿ]/
const KANNADA = /[ಀ-೿]/
const LATIN_WORD = /^[A-Za-z][A-Za-z\s'?]*$/

describe('model vocabulary contract', () => {
  it('contains exactly the 20 model classes plus SPACE', () => {
    const ids = TRANSLATIONS.map((t) => t.id)
    assert.equal(ids.length, 21)
    for (const cls of MODEL_CLASSES) assert.ok(ids.includes(cls), `missing ${cls}`)
    assert.ok(ids.includes('SPACE'))
  })

  it('never renames or transliterates the model class identifiers', () => {
    for (const cls of MODEL_CLASSES) {
      assert.equal(translateSign(cls, 'en'), TRANSLATION_MAP.get(cls)!.en)
      // identifiers must survive a round trip through parseSignId
      assert.equal(parseSignId(cls), cls)
    }
  })

  it('parses unknown identifiers to null instead of guessing', () => {
    assert.equal(parseSignId('NOT_A_SIGN'), null)
    assert.equal(parseSignId(''), null)
  })
})

describe('Hindi translations', () => {
  it('has a Hindi translation for every one of the 20 classes', () => {
    const missing = MODEL_CLASSES.filter((cls) => {
      const value = TRANSLATION_MAP.get(cls)!.hi
      return cls === 'STILL' ? value !== '' : value.trim().length === 0
    })
    assert.deepEqual(missing, [], 'Hindi translations missing')
  })

  it('uses Devanagari script and never falls back to English', () => {
    for (const cls of SPEAKABLE) {
      const entry = TRANSLATION_MAP.get(cls)!
      assert.ok(DEVANAGARI.test(entry.hi), `${cls} Hindi is not Devanagari: ${entry.hi}`)
      assert.notEqual(entry.hi, entry.en, `${cls} Hindi equals English`)
      assert.ok(!LATIN_WORD.test(entry.hi.trim()), `${cls} Hindi looks Romanized: ${entry.hi}`)
    }
  })

  it('translates multi-word signs as a complete phrase', () => {
    const goodMorning = TRANSLATION_MAP.get('GOOD_MORNING')!
    assert.equal(goodMorning.hi, 'सुप्रभात')

    const question = TRANSLATION_MAP.get('WHAT_IS_YOUR_NAME')!
    assert.ok(question.hi.includes('नाम'), 'name question should mention नाम')
    assert.ok(question.hi.includes('क्या'), 'question should use क्या')
    assert.ok(DEVANAGARI.test(question.hi))
  })
})

describe('Kannada translations', () => {
  it('has a Kannada translation for every one of the 20 classes', () => {
    const missing = MODEL_CLASSES.filter((cls) => {
      const value = TRANSLATION_MAP.get(cls)!.kn
      return cls === 'STILL' ? value !== '' : value.trim().length === 0
    })
    assert.deepEqual(missing, [], 'Kannada translations missing')
  })

  it('uses Kannada script and never falls back to English', () => {
    for (const cls of SPEAKABLE) {
      const entry = TRANSLATION_MAP.get(cls)!
      assert.ok(KANNADA.test(entry.kn), `${cls} Kannada is not Kannada script: ${entry.kn}`)
      assert.notEqual(entry.kn, entry.en, `${cls} Kannada equals English`)
      assert.ok(!LATIN_WORD.test(entry.kn.trim()), `${cls} Kannada looks Romanized: ${entry.kn}`)
    }
  })

  it('translates the afternoon greeting as a phrase', () => {
    const afternoon = TRANSLATION_MAP.get('GOOD_AFTERNOON')!
    assert.ok(KANNADA.test(afternoon.kn))
    assert.ok(afternoon.kn.includes('ಶುಭ'), 'Kannada greeting should include ಶುಭ')
  })
})

describe('explicitly required signs', () => {
  const CASES: { id: SignId; en: string; hi: string; kn: string }[] = [
    { id: 'HELLO', en: 'Hello', hi: 'नमस्ते', kn: 'ನಮಸ್ಕಾರ' },
    { id: 'THANK_YOU', en: 'Thank you', hi: 'धन्यवाद', kn: 'ಧನ್ಯವಾದ' },
    { id: 'GOOD_MORNING', en: 'Good morning', hi: 'सुप्रभात', kn: 'ಶುಭೋದಯ' },
    { id: 'GOOD_AFTERNOON', en: 'Good afternoon', hi: 'शुभ दोपहर', kn: 'ಶುಭ ಮಧ್ಯಾಹ್ನ' },
    { id: 'WHAT_IS_YOUR_NAME', en: 'What is your name?', hi: 'आपका नाम क्या है?', kn: 'ನಿಮ್ಮ ಹೆಸರೇನು?' },
    { id: 'STILL', en: '', hi: '', kn: '' },
    { id: 'CLOSE', en: 'Close', hi: 'बंद करो', kn: 'ಮುಚ್ಚಿ' },
    { id: 'BREAK', en: 'Break', hi: 'तोड़ो', kn: 'ತೋಡಿ' },
    { id: 'POUR', en: 'Pour', hi: 'डालो', kn: 'ಹಾಕಿ' },
  ]

  for (const c of CASES) {
    it(`${c.id} -> en/hi/kn`, () => {
      const entry = TRANSLATION_MAP.get(c.id)!
      assert.equal(entry.en, c.en)
      assert.equal(entry.hi, c.hi)
      assert.equal(entry.kn, c.kn)
    })
  }
})

describe('language configuration', () => {
  it('defaults to English', () => {
    assert.equal(DEFAULT_LANGUAGE, 'en')
  })

  it('exposes exactly en/hi/kn', () => {
    assert.deepEqual([...LANGUAGES], ['en', 'hi', 'kn'])
    assert.deepEqual(SUPPORTED_LANGUAGES.map((l) => l.code), ['en', 'hi', 'kn'])
  })

  it('validates language codes', () => {
    assert.equal(isLanguage('hi'), true)
    assert.equal(isLanguage('kn'), true)
    assert.equal(isLanguage('en'), true)
    assert.equal(isLanguage('fr'), false)
    assert.equal(isLanguage(undefined), false)
  })

  it('maps each language to the right speech tag', () => {
    assert.equal(TTS_LANGUAGE.en, 'en-US')
    assert.equal(TTS_LANGUAGE.hi, 'hi-IN')
    assert.equal(TTS_LANGUAGE.kn, 'kn-IN')
    assert.equal(getTtsLang('HELLO', 'hi'), 'hi-IN')
    assert.equal(getTtsLang('UNKNOWN', 'kn'), 'kn-IN')
  })
})

describe('sentence pipeline', () => {
  const ids = ['HELLO', 'THANK_YOU']

  it('English mode is unchanged', () => {
    assert.equal(translateSentence(ids, 'en'), 'Hello Thank you')
  })

  it('Hindi mode renders Devanagari only', () => {
    const out = translateSentence(ids, 'hi')
    assert.equal(out, 'नमस्ते धन्यवाद')
    assert.ok(!/[A-Za-z]/.test(out), 'English leaked into Hindi output')
  })

  it('Kannada mode renders Kannada script only', () => {
    const out = translateSentence(ids, 'kn')
    assert.equal(out, 'ನಮಸ್ಕಾರ ಧನ್ಯವಾದ')
    assert.ok(KANNADA.test(out), 'Kannada script missing')
    assert.ok(!/[A-Za-z]/.test(out), 'English leaked into Kannada output')
  })

  it('re-renders the whole sentence from IDs when the language changes', () => {
    // Source of truth is the ID array, never the previously translated string.
    const buffer = [...ids]
    const en = translateSentence(buffer, 'en')
    const hi = translateSentence(buffer, 'hi')
    const kn = translateSentence(buffer, 'kn')
    const backToEn = translateSentence(buffer, 'en')

    assert.equal(en, 'Hello Thank you')
    assert.equal(hi, 'नमस्ते धन्यवाद')
    assert.equal(kn, translateSentence(buffer, 'kn'))
    assert.equal(backToEn, en, 'switching back to English must restore English output')
    assert.notEqual(hi, en)
    assert.notEqual(kn, en)
  })

  it('drops STILL (hand-down pause) from visible output in every language', () => {
    for (const lang of LANGUAGES) {
      assert.equal(translateSentence(['STILL', 'HELLO', 'STILL'], lang), translateSign('HELLO', lang))
    }
  })

  it('handles empty and single-element buffers', () => {
    assert.equal(translateSentence([], 'hi'), '')
    assert.equal(translateSentence(['TEA'], 'kn'), 'ಚಹಾ')
  })

  it('ignores unknown identifiers rather than leaking raw English', () => {
    assert.equal(translateSentence(['HELLO', 'BOGUS_SIGN'], 'hi'), 'नमस्ते')
  })

  it('produces no doubled whitespace when SPACE is inserted', () => {
    assert.equal(translateSentence(['HELLO', 'SPACE', 'TEA'], 'en'), 'Hello Tea')
    assert.equal(translateSentence(['HELLO', 'SPACE', 'TEA'], 'hi'), 'नमस्ते चाय')
  })
})

describe('speech plans', () => {
  it('sends translated text and the matching language tag', () => {
    const cases: { lang: Language; text: string; tag: string }[] = [
      { lang: 'en', text: 'Hello', tag: 'en-US' },
      { lang: 'hi', text: 'नमस्ते', tag: 'hi-IN' },
      { lang: 'kn', text: 'ನಮಸ್ಕಾರ', tag: 'kn-IN' },
    ]
    for (const { lang, text, tag } of cases) {
      const plan = speechPlanForSign('HELLO', lang)
      assert.equal(plan.text, text)
      assert.equal(plan.lang, tag)
      assert.deepEqual(plan.signIds, ['HELLO'])
    }
  })

  it('never sends an English class label as speech text', () => {
    for (const lang of LANGUAGES) {
      for (const cls of SPEAKABLE) {
        const plan = speechPlanForSign(cls, lang)
        assert.ok(!/[A-Z_]{3,}/.test(plan.text), `${cls} leaked a class label: ${plan.text}`)
      }
    }
  })

  it('speaks the whole translated sentence', () => {
    const plan = speechPlanForSentence(['HELLO', 'THANK_YOU'], 'hi')
    assert.equal(plan.text, 'नमस्ते धन्यवाद')
    assert.equal(plan.lang, 'hi-IN')

    const kn = speechPlanForSentence(['HELLO', 'THANK_YOU'], 'kn')
    assert.equal(kn.lang, 'kn-IN')
    assert.ok(KANNADA.test(kn.text))
  })

  it('produces an empty plan for an empty sentence', () => {
    assert.equal(speechPlanForSentence([], 'hi').text, '')
    assert.equal(speechPlanForSentence([], 'hi').lang, 'hi-IN')
  })
})