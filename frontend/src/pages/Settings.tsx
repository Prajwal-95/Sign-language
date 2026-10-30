import { useEffect, useState } from 'react'
import PageHeader from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import Callout from '../components/ui/Callout'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { Field, Select, Slider, Switch } from '../components/ui/Form'
import { Card, Shell, accentIconClass, type Accent } from '../components/ui/Card'
import Icon, { type IconName } from '../components/ui/Icon'
import { useAppSettings } from '../hooks/useAppSettings'
import { useOutputLanguage } from '../hooks/useOutputLanguage'
import { speechSupported, loadVoices, LANGUAGE_LABELS } from '../services/tts'
import { TTS_LANGUAGE } from '../services/translation'
import { API_BASE } from '../services/api'
import { useSpeech } from '../hooks/useSpeech'
import type { Language } from '../services/translation'

interface GroupProps {
  headingId: string
  title: string
  description: string
  accent: Accent
  icon: IconName
  children: React.ReactNode
}

function Group({ headingId, title, description, accent, icon, children }: GroupProps) {
  return (
    <Card as="section" aria-labelledby={headingId} accent={accent} className="flex flex-col">
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span
            className={`grid h-10 w-10 flex-none place-items-center rounded-xl border ${accentIconClass(accent)}`}
          >
            <Icon name={icon} size={20} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={headingId} className="text-base font-semibold text-ink sm:text-[17px]">
            {title}
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{description}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-1 flex-col gap-5">{children}</div>
      </div>
    </Card>
  )
}

export default function SettingsPage() {
  useEffect(() => {
    document.title = 'Settings · ISL to Speech'
  }, [])

  const { settings, update, reset } = useAppSettings()
  const { language, setLanguage, supportedLanguages } = useOutputLanguage()
  const speech = useSpeech()
  const [status, setStatus] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const ttsSupported = speechSupported()
  // The voice list is populated asynchronously by the browser; reading it
  // during render almost always returns [] and hides Hindi/Kannada voices.
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!ttsSupported) return
    let cancelled = false
    loadVoices().then((list) => {
      if (!cancelled) setVoices(list)
    })
    return () => {
      cancelled = true
    }
  }, [ttsSupported])

  // Offer voices that can actually speak the selected output language, plus
  // English voices, so the dropdown is never empty for hi/kn users.
  const languagePrefix = TTS_LANGUAGE[language].split('-')[0]
  const relevantVoices = voices.filter((voice) => {
    const prefix = voice.lang.toLowerCase().split('-')[0]
    return prefix === languagePrefix || prefix === 'en'
  })

  const languageName = supportedLanguages.find((item) => item.code === language)?.label ?? 'the selected language'
  const browserHasVoice = relevantVoices.some(
    (voice) => voice.lang.toLowerCase().split('-')[0] === languagePrefix,
  )
  const speechUsable = speech.availability[language] && speech.voicesReady
  const usesLocalService = !browserHasVoice && speech.availability[language]

  /**
   * The backend in this repository does not expose an /api/settings route.
   * We still attempt the call, but only report success when the server really
   * confirms it — otherwise the value stays local to this device.
   */
  const pushConfidence = async (value: number) => {
    try {
      const response = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confidence_threshold: value }),
      })
      setStatus(
        response.ok
          ? `Confidence threshold saved on the backend (${Math.round(value * 100)}%).`
          : 'Saved on this device only — the backend did not confirm the change.',
      )
    } catch {
      setStatus('Saved on this device only — the backend is unreachable.')
    }
  }

  // A test phrase must use the target script — the MMS checkpoints are
  // monolingual and reject Latin text with a 400. Pick a phrase that belongs
  // to the selected language; for English we keep the full explanatory line.
  const testPhrase = (() => {
    if (language === 'hi') return 'नमस्ते। यह आवाज़ परीक्षण है।'
    if (language === 'kn') return 'ನಮಸ್ಕಾರ. ಈ ಆವಾಜ್ ಪರೀಕ್ಷೆಯಾಗಿದೆ.'
    return `${languageName} voice test. This is how your translation will sound at rate ${settings.rate.toFixed(1)} and pitch ${settings.pitch.toFixed(1)}.`
  })()

  const testVoice = () => {
    void speech.speak(testPhrase, language, {
      rate: settings.rate,
      pitch: settings.pitch,
      force: true,
    })
  }

  return (
    <Shell className="band-ivory py-10 sm:py-14">
      <PageHeader
        eyebrow="Settings"
        title="Make it yours"
        lead="Speech, language and accessibility preferences. Everything is saved on this device automatically and stays in sync across open tabs."
        actions={
          <Button variant="secondary" size="md" onClick={() => setConfirmReset(true)}>
            <Icon name="undo" size={16} />
            Reset to defaults
          </Button>
        }
      />

      <div className="mt-9 grid min-w-0 gap-5 lg:grid-cols-2">
        <Group
          headingId="speech-heading"
          title="Speech"
          description="How the text is read aloud"
          accent="brand"
          icon="speaker"
        >
          <Slider
            label="Speaking rate"
            value={settings.rate}
            min={0.5}
            max={2}
            step={0.1}
            display={`${settings.rate.toFixed(1)}x`}
            onChange={(value) => update({ rate: value })}
            disabled={!ttsSupported}
            hint="1.0x is the normal speaking speed."
          />
          <Slider
            label="Pitch"
            value={settings.pitch}
            min={0.5}
            max={2}
            step={0.1}
            display={settings.pitch.toFixed(1)}
            onChange={(value) => update({ pitch: value })}
            disabled={!ttsSupported}
            hint="Applies to every language. Some voices ignore it."
          />
          <Field
            label="Voice"
            htmlFor="settings-voice"
            hint={
              ttsSupported
                ? relevantVoices.length > 0
                  ? `Listing voices that can speak ${languageName}, plus English.`
                  : browserHasVoice
                    ? `Listing English voices. ${languageName} speech uses the offline service.`
                    : `No ${languageName} system voice is installed. Speech is produced by the offline local speech service.`
                : 'Speech synthesis is unavailable in this browser.'
            }
          >
            <Select
              id="settings-voice"
              value={settings.voice}
              onChange={(value) => update({ voice: value })}
              disabled={!ttsSupported || relevantVoices.length === 0}
              options={[
                { value: 'auto', label: 'Automatic (best match for the selected language)' },
                ...relevantVoices.map((voice) => ({
                  value: voice.name,
                  label: `${voice.name} (${voice.lang})`,
                })),
              ]}
            />
          </Field>

          {/* Honest, per-provider status. Nothing here is guessed. */}
          <div className="surface-sunken px-4 py-3.5">
            <p className="text-[12.5px] font-semibold text-ink">Speech engine for {languageName}</p>
            <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink-secondary">
              {(['en', 'hi', 'kn'] as const).map((code) => (
                <li key={code} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 flex-none rounded-full ${
                      speech.availability[code] ? 'bg-status-ok' : 'bg-ink-muted'
                    }`}
                  />
                  <span>
                    {LANGUAGE_LABELS[code]} —{' '}
                    {speech.availability[code]
                      ? 'ready'
                      : code === language
                        ? 'not available yet'
                        : 'unavailable'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-secondary">
              {speechUsable
                ? usesLocalService
                  ? `${languageName} speech is generated offline by the local speech service (tools\\tts-service). No internet access is used.`
                  : `${languageName} speech uses a voice installed on this system.`
                : `No engine can speak ${languageName} right now. Start the offline local speech service (tools\\tts-service\\run.bat) or install a ${languageName} system voice.`}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2.5"
              onClick={() => void speech.retry()}
              disabled={speech.isGenerating}
            >
              <Icon name="undo" size={15} />
              Re-check speech engines
            </Button>
          </div>

          <Button variant="violet" onClick={testVoice} disabled={!ttsSupported || !speechUsable}>
            <Icon name="play" size={16} />
            Test voice
          </Button>
        </Group>

        <Group
          headingId="language-heading"
          title="Language"
          description="Language used for translation and speech"
          accent="violet"
          icon="globe"
        >
          <Field
            label="Output language"
            htmlFor="settings-language"
            hint="Applies immediately to the translator. Your choice is remembered on this device."
          >
            <Select
              id="settings-language"
              value={language}
              onChange={(value) => setLanguage(value as Language)}
              options={supportedLanguages.map((item) => ({
                value: item.code,
                label:
                  item.nativeLabel === item.label ? item.nativeLabel : `${item.nativeLabel} · ${item.label}`,
              }))}
            />
          </Field>

          <div className="surface-sunken px-4 py-3.5">
            <Switch
              label="Auto-speak"
              description="Speak each accepted sign as soon as it is recognised."
              checked={settings.autoSpeak}
              onChange={(value) => update({ autoSpeak: value })}
            />
          </div>
        </Group>

        <Group
          headingId="display-heading"
          title="Display"
          description="Accessibility preferences"
          accent="teal"
          icon="sliders"
        >
          <div className="surface-sunken px-4 py-3.5">
            <Switch
              label="High-contrast mode"
              description="Opaque surfaces, black borders and maximum text contrast. Decorative colour washes are disabled."
              checked={settings.highContrast}
              onChange={(value) => update({ highContrast: value })}
            />
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-secondary">
            Your operating system “reduce motion” setting is respected automatically — there are
            no entrance animations to disable.
          </p>
        </Group>

        <Group
          headingId="recognition-heading"
          title="Recognition"
          description="Model acceptance threshold"
          accent="coral"
          icon="cpu"
        >
          <Slider
            label="Minimum confidence"
            value={settings.confidenceThreshold}
            min={0.3}
            max={0.9}
            step={0.05}
            display={`${Math.round(settings.confidenceThreshold * 100)}%`}
            onChange={(value) => {
              update({ confidenceThreshold: value })
              void pushConfidence(value)
            }}
            hint="A higher value means fewer false positives but requires a cleaner, more complete sign."
          />
          <Callout tone="info">
            The threshold is stored in this browser. The bundled backend does not expose an{' '}
            <code className="code-inline">/api/settings</code> route, so unless your server accepts
            the request the running backend keeps using its own{' '}
            <code className="code-inline">CONFIDENCE_THRESHOLD</code> value.
          </Callout>
        </Group>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <p role="status" aria-live="polite" className="text-[13px] text-ink-secondary">
          {status || 'Changes save automatically on this device.'}
        </p>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset all settings?"
        description="Speech, language, contrast and recognition preferences return to their defaults. Saved on this device only."
        confirmLabel="Reset settings"
        cancelLabel="Cancel"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          reset()
          setLanguage('en')
          setConfirmReset(false)
          setStatus('Settings reset to defaults.')
        }}
      />
    </Shell>
  )
}