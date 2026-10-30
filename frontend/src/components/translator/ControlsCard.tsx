import { Card, CardHeader } from '../ui/Card'
import { Button } from '../ui/Button'
import Callout from '../ui/Callout'
import Icon from '../ui/Icon'
import { Switch } from '../ui/Form'
import type { ProviderId, SpeakPhase, SpeechLanguage, TtsError } from '../../services/tts'

/** Which audio engine is currently producing speech. */
const PROVIDER_LABEL: Record<ProviderId, string> = {
  browser: 'System voice',
  local: 'Offline speech service',
}

/**
 * Sentence + speech controls. Every action here maps to an existing capability
 * of `useSignRecognition`; nothing is simulated.
 *
 * The speech block only claims audio is playing when the controller says so,
 * and only shows an error when a provider genuinely could not produce sound.
 */
export default function ControlsCard({
  headingId,
  canSpeak,
  onSpeak,
  onStopSpeech,
  onRetrySpeech,
  onAddSpace,
  onUndo,
  onClear,
  canUndo,
  canSpace,
  autoSpeak,
  onAutoSpeakChange,
  speechPhase,
  speechProvider,
  speechError,
  speechAvailable,
  speechProbed,
  language,
  languageLabel,
}: {
  headingId: string
  canSpeak: boolean
  onSpeak: () => void
  onStopSpeech: () => void
  onRetrySpeech: () => void
  onAddSpace: () => void
  onUndo: () => void
  onClear: () => void
  canUndo: boolean
  canSpace: boolean
  autoSpeak: boolean
  onAutoSpeakChange: (value: boolean) => void
  speechPhase: SpeakPhase
  speechProvider: ProviderId | null
  speechError: TtsError | null
  speechAvailable: boolean
  /** True once every provider has been probed at least once. */
  speechProbed: boolean
  language: SpeechLanguage
  languageLabel: string
}) {
  const busy = speechPhase === 'generating' || speechPhase === 'speaking'

  const statusText = ((): string | null => {
    if (speechPhase === 'generating') return `Generating ${languageLabel} speech…`
    if (speechPhase === 'speaking') {
      return `Speaking ${languageLabel}${speechProvider ? ` · ${PROVIDER_LABEL[speechProvider]}` : ''}…`
    }
    return null
  })()

  return (
    <Card as="section" aria-labelledby={headingId} accent="teal">
      <div className="p-4 sm:p-5">
        <CardHeader
          titleId={headingId}
          title="Controls"
          description="Speech and sentence actions"
          accent="teal"
          icon={<Icon name="speaker" size={20} />}
          titleAs="h2"
        />

        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button
            variant="primary"
            onClick={onSpeak}
            disabled={!canSpeak || speechPhase === 'generating'}
            className="flex-1 sm:flex-none"
          >
            <Icon name="speaker" size={17} />
            Speak
          </Button>
          <Button variant="secondary" onClick={onStopSpeech} disabled={!busy}>
            <Icon name="stop" size={16} />
            Stop
          </Button>
        </div>

        {statusText ? (
          <p role="status" aria-live="polite" className="mt-2.5 text-[12.5px] text-ink-secondary">
            {statusText}
          </p>
        ) : null}

        <div className="mt-2.5 grid grid-cols-3 gap-2.5">
          <Button variant="secondary" onClick={onAddSpace} disabled={!canSpace}>
            Space
          </Button>
          <Button variant="secondary" onClick={onUndo} disabled={!canUndo}>
            <Icon name="undo" size={16} />
            Undo
          </Button>
          <Button variant="secondary" onClick={onClear} disabled={!canUndo}>
            <Icon name="trash" size={16} />
            Clear
          </Button>
        </div>

        <div className="surface-flat mt-4 px-4 py-3.5">
          <Switch
            label="Auto-speak"
            description="Speak each word the moment it is accepted."
            checked={autoSpeak}
            onChange={onAutoSpeakChange}
          />
        </div>

        {/*
          Only shown when a provider genuinely failed. The translated text above
          is never removed because audio could not be produced.
        */}
        {speechError ? (
          <div className="mt-4">
            <Callout
              tone={speechError.kind === 'empty-text' ? 'info' : 'warn'}
              title={
                speechError.kind === 'empty-text'
                  ? 'Nothing to read aloud'
                  : `No ${languageLabel} audio was produced`
              }
            >
              <p>{speechError.message}</p>
              {speechError.action ? <p className="mt-1">{speechError.action}</p> : null}
              {speechError.needsNetwork ? (
                <p className="mt-1">This step needs an internet connection.</p>
              ) : null}
              {speechError.retryable ? (
                <Button variant="secondary" size="sm" className="mt-2" onClick={onRetrySpeech}>
                  <Icon name="undo" size={15} />
                  Try again
                </Button>
              ) : null}
              <p className="mt-2">
                The {languageLabel} translation above is unaffected and stays on screen.
              </p>
            </Callout>
          </div>
        ) : speechProbed && !speechAvailable ? (
          /*
            No warning while we are still probing, and never a claim that the
            user must install a voice when a working alternative exists.
          */
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-secondary">
            {language === 'en'
              ? `No system voice is available for English on this device. Start the offline speech service (tools\\tts-service\\run.bat) to generate audio instead — the English text below is displayed either way.`
              : `This device has no ${languageLabel} system voice, and the offline speech service is not answering. Start it with tools\\tts-service\\run.bat to generate ${languageLabel} audio locally. The ${languageLabel} text below is displayed either way.`}
          </p>
        ) : null}
      </div>
    </Card>
  )
}