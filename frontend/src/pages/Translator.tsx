import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useWebcam } from '../hooks/useWebcam'
import { useSignRecognition } from '../hooks/useSignRecognition'
import { API_BASE, checkBackendHealth } from '../services/api'
import { SUPPORTED_LANGUAGES, type Language } from '../services/translation'
import HandOverlay from '../components/HandOverlay'
import PrimaryUserDebugOverlay from '../components/PrimaryUserDebugOverlay'
import SampleCollector from '../components/SampleCollector'
import CameraPanel from '../components/translator/CameraPanel'
import DetectedSignCard from '../components/translator/DetectedSignCard'
import TranslationCard from '../components/translator/TranslationCard'
import ControlsCard from '../components/translator/ControlsCard'
import PageHeader from '../components/ui/PageHeader'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Callout from '../components/ui/Callout'
import EmptyState from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Card, Shell } from '../components/ui/Card'
import Icon from '../components/ui/Icon'
import StatusPill, { type StatusTone } from '../components/ui/StatusPill'
import {
  cameraLabel,
  cameraTone,
  recognitionLabel,
  recognitionTone,
  socketLabel,
  type BackendState,
} from '../lib/statusLabels'
import { LANGUAGE_FONT_CLASS } from '../lib/projectData'

export default function Translator() {
  useEffect(() => {
    document.title = 'Translator · ISL to Speech'
  }, [])

  const { videoRef, status: camStatus, error: camError, start: startCam, stop: stopCam } = useWebcam({
    width: 640,
    height: 480,
  })

  const [backend, setBackend] = useState<BackendState>('checking')
  const [backendModelLoaded, setBackendModelLoaded] = useState(false)
  const [numClasses, setNumClasses] = useState<number | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const rec = useSignRecognition({ apiBase: API_BASE, videoRef })

  // Debug overlay toggle (Shift+D) — preserved from the original build.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && (event.key === 'D' || event.key === 'd')) {
        setDebugMode((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // One backend health probe on mount; the socket status also promotes to online.
  useEffect(() => {
    let cancelled = false
    checkBackendHealth().then((res) => {
      if (cancelled) return
      setBackend(res ? 'online' : 'offline')
      setBackendModelLoaded(Boolean(res?.model_loaded))
      if (res?.num_classes) setNumClasses(res.num_classes)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (rec.socketStatus === 'open' && backend !== 'online') setBackend('online')
  }, [rec.socketStatus, backend])

  const startTranslation = useCallback(async () => {
    if (camStatus !== 'active') {
      await startCam()
    }
    rec.start()
  }, [camStatus, startCam, rec])

  const stopTranslation = useCallback(() => {
    rec.stop()
    stopCam()
  }, [rec, stopCam])

  const isRecognizing = rec.status === 'running' || rec.status === 'paused'
  const canSpeak = rec.sentence.trim().length > 0
  const wordCount = rec.sentence.trim() ? rec.sentence.trim().split(/\s+/).length : 0
  const languageClass = LANGUAGE_FONT_CLASS[rec.language]

  const faceCount = rec.primaryUserResult?.allFaces.length ?? 0

  const cameraStatusItems: { tone: StatusTone; label: string; key: string }[] = [
    { key: 'camera', tone: cameraTone(camStatus), label: cameraLabel(camStatus) },
    {
      key: 'model',
      tone: rec.modelReady ? 'ok' : 'neutral',
      label: rec.modelReady ? 'Hand model loaded' : 'Hand model not loaded',
    },
  ]

  const personStatus = ((): ReactNode => {
    if (!isRecognizing || !rec.primaryUserResult) return null
    if (faceCount > 1) {
      return (
        <StatusPill tone="warn" label={`${faceCount} people detected — tracking the primary user`} />
      )
    }
    if (faceCount === 1) return <StatusPill tone="ok" label="1 person detected" />
    return <StatusPill tone="warn" label="No face detected — waiting for the user" />
  })()

  const video = camStatus === 'active' ? (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="video-mirror h-full w-full object-cover"
        aria-label="Live webcam preview with hand-landmark overlay"
      />
        <HandOverlay videoRef={videoRef} landmarksRef={rec.landmarksRef} active={rec.status === 'running'} />
      <PrimaryUserDebugOverlay
        videoRef={videoRef}
        primaryUserResult={rec.primaryUserResult}
        active={rec.status === 'running'}
        debugMode={debugMode}
      />
      {debugMode ? (
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-[rgba(36,28,24,0.82)] px-2.5 py-1.5 text-[11px] font-medium text-warm-100">
          Debug: primary-user tracking · Shift+D to toggle
        </p>
      ) : null}
    </>
  ) : undefined

  const placeholder = camStatus === 'active' ? undefined : (
    <EmptyState
      icon={camStatus === 'denied' || camStatus === 'unavailable' ? 'alert' : 'camera'}
      title={
        camStatus === 'requesting'
          ? 'Waiting for camera permission…'
          : camStatus === 'denied'
            ? 'Camera permission denied'
            : camStatus === 'unavailable'
              ? 'No camera detected'
              : camStatus === 'error'
                ? 'Camera unavailable'
                : 'Camera is off'
      }
      description={
        camStatus === 'denied'
          ? 'Allow camera access in your browser settings, then press Start translation again.'
          : camStatus === 'unavailable'
            ? 'No webcam was found on this device. Connect one and try again.'
            : 'Press Start translation to turn on your webcam and begin recognising signs.'
      }
      className="h-full justify-center [&>span]:border-white/25 [&>span]:bg-white/10 [&>span]:text-white/70 [&_[data-empty-state-title]]:text-white/90 [&_p]:text-white/75"
    />
  )

  const alerts = (
    <div className="space-y-3">
      {camError ? (
        <Callout tone="danger" title="Camera error">
          {camError.message}
        </Callout>
      ) : null}

      {rec.error ? (
        <Callout tone="danger" title="Recognition error">
          {rec.error}
        </Callout>
      ) : null}

      {backend === 'offline' ? (
        <Callout tone="warn" title="Backend offline">
          Start the API from the <code className="code-inline">backend</code> folder with{' '}
          <code className="code-inline">.\run.bat</code>. The camera preview and hand-landmark
          overlay still work; recognition resumes once the server is reachable.
        </Callout>
      ) : null}

      {backend === 'online' && !backendModelLoaded ? (
        <Callout tone="warn" title="No trained model on the backend">
          Run <code className="code-inline">python scripts/train_lstm.py</code> to train one, then
          restart the backend.
        </Callout>
      ) : null}
    </div>
  )

  return (
    <Shell className="band-ivory py-8 sm:py-10">
      <PageHeader
        eyebrow="Live workspace"
        title="Sign Translator"
        lead="Perform a sign — the app reads your hand in real time, adds the word to your sentence and can speak it aloud."
        actions={
          <Button variant="secondary" size="md" onClick={() => setDebugMode((value) => !value)}>
            <Icon name="sliders" size={17} />
            {debugMode ? 'Hide debug overlay' : 'Show debug overlay'}
          </Button>
        }
      />

      {/* System status strip */}
      <Card variant="glass" className="mt-6 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            System
          </span>
          <StatusPill
            tone={backend === 'online' ? 'ok' : backend === 'offline' ? 'danger' : 'warn'}
            label={
              backend === 'online'
                ? `Backend online${numClasses ? ` · ${numClasses} classes` : ''}`
                : backend === 'offline'
                  ? 'Backend offline'
                  : 'Checking backend'
            }
          />
          <StatusPill
            tone={rec.socketStatus === 'open' ? 'ok' : rec.socketStatus === 'error' ? 'danger' : 'neutral'}
            label={socketLabel(rec.socketStatus)}
          />
          <StatusPill tone={recognitionTone(rec.status)} label={recognitionLabel(rec.status)} />
        </div>
      </Card>

      {/* Workspace */}
      <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="min-w-0 space-y-5">
          <CameraPanel
            headingId="camera-heading"
            title="Camera & recognition"
            description="Live webcam with hand-landmark overlay"
            status={cameraStatusItems}
            headerActions={personStatus ? <div className="flex flex-wrap gap-2">{personStatus}</div> : null}
            video={video}
            placeholder={placeholder}
            alerts={alerts}
            controls={
              <>
                {isRecognizing ? (
                  <Button variant="danger" onClick={stopTranslation}>
                    <Icon name="stop" size={17} />
                    Stop translation
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => void startTranslation()}>
                    <Icon name="play" size={17} />
                    Start translation
                  </Button>
                )}

                {isRecognizing ? (
                  <Button
                    variant="secondary"
                    onClick={rec.status === 'running' ? rec.pause : rec.resume}
                  >
                    <Icon name={rec.status === 'running' ? 'pause' : 'play'} size={17} />
                    {rec.status === 'running' ? 'Pause' : 'Resume'}
                  </Button>
                ) : null}

              </>
            }
            footnote={
              camStatus === 'active' ? (
                <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-secondary">
                  <Icon name="shield" size={16} className="mt-0.5 text-brand-500" />
                  <span>
                    Only hand-landmark coordinates are sent to the backend —{' '}
                    <strong className="font-semibold text-ink">video frames never leave your device</strong>.
                  </span>
                </p>
              ) : null
            }
          />

          <SampleCollector collectHandsRef={rec.collectHandsRef} recognizing={rec.status === 'running'} />
        </div>

        <div className="min-w-0 space-y-5">
          <DetectedSignCard
            headingId="detected-heading"
            detectedSign={rec.detectedSign}
            confidence={rec.confidence}
            language={rec.language}
            languageClass={languageClass}
            footnote="A sign is only accepted once you complete it by lowering your hand — that is the boundary the model was trained on."
          />

          <TranslationCard
            headingId="translation-heading"
            sentence={rec.sentence}
            language={rec.language}
            languageClass={languageClass}
            languageOptions={SUPPORTED_LANGUAGES.map((item) => ({
              value: item.code,
              label:
                item.nativeLabel === item.label ? item.nativeLabel : `${item.nativeLabel} · ${item.label}`,
            }))}
            onLanguageChange={(value) => rec.setLanguage(value as Language)}
            languageLabel="Output language"
            wordCount={wordCount}
            hint="Each accepted sign adds a word automatically. Use Space to separate words, Undo to remove the last one."
          />

          <ControlsCard
            headingId="controls-heading"
            canSpeak={canSpeak}
            onSpeak={rec.speakAll}
            onStopSpeech={rec.stopSpeechAll}
            onRetrySpeech={() => void rec.retrySpeech()}
            onAddSpace={rec.addSpace}
            onUndo={rec.undo}
            onClear={() => setConfirmClear(true)}
            canUndo={Boolean(rec.sentence)}
            canSpace={isRecognizing}
            autoSpeak={rec.autoSpeak}
            onAutoSpeakChange={(value) => {
              rec.setAutoSpeak(value)
              if (value && rec.sentence.trim()) rec.speakAll()
            }}
            speechPhase={rec.speech.phase}
            speechProvider={rec.speech.provider}
            speechError={rec.speech.error}
            speechAvailable={rec.speechAvailable}
            speechProbed={rec.speechProbed}
            language={rec.language}
            languageLabel={
              SUPPORTED_LANGUAGES.find((item) => item.code === rec.language)?.label ?? 'this language'
            }
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear the sentence?"
        description="This removes every word that has been translated so far. It cannot be undone."
        confirmLabel="Clear sentence"
        cancelLabel="Keep it"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          rec.clear()
          setConfirmClear(false)
        }}
      />
    </Shell>
  )
}
