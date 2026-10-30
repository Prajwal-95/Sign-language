import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker, FaceDetector } from '@mediapipe/tasks-vision'
import { PredictSocket, type Prediction, type SocketStatus } from '../services/ws'
import {
  translateSentence,
  translateSign,
  speechPlanForSentence,
  speechPlanForSign,
} from '../services/translation'
import { createLatestHandler } from '../services/latestHandler'
import { useOutputLanguage } from './useOutputLanguage'
import type { SpeechLanguage } from '../services/tts'
import { useSpeech } from './useSpeech'
import { primaryUserTracker, type HandData, type PrimaryUserResult } from '../services/primaryUserTracker'

export type RecStatus =
  | 'idle'
  | 'loading-model'
  | 'running'
  | 'paused'
  | 'error'

/**
 * Real-time sign recognition:
 *
 *   webcam video -> MediaPipe HandLandmarker (local, private)
 *     -> compact landmarks -> WebSocket -> backend model
 *     -> prediction -> temporal smoothing (majority window)
 *     -> accepted sign ID -> sentence buffer (sign IDs) -> translation -> TTS
 */
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const LANDMARKER_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const COOLDOWN_MS = 700 // min time between two accepted signs
// NOTE: We must send EVERY frame to the backend because PredictSession relies on
// seeing consecutive no-hand frames (_no_hand_frames >= 6) to detect sign completion.
// Throttling here breaks segment detection. Only throttle expensive LOCAL work (face det).
const SEND_EVERY = 1
const FACE_DETECT_EVERY = 3 // run face detection every Nth frame (expensive)
const AUTO_SPEAK_DEBOUNCE_MS = 300 // coalesce auto-speak requests within this window

interface UseSignRecognitionArgs {
  apiBase: string
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export function useSignRecognition({ apiBase, videoRef }: UseSignRecognitionArgs) {
  const { language, setLanguage, supportedLanguages } = useOutputLanguage()
  const speech = useSpeech()
  // Stable callbacks, safe to use in effect/callback dependency lists.
  const { speak: speakText, stop: stopSpeechOutput, refresh: refreshSpeech } = speech
  const [status, setStatus] = useState<RecStatus>('idle')
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('idle')
  const [modelReady, setModelReady] = useState(false)
  // Only the internal class ID is stored; the displayed word is derived from it
  // on every render so a language switch updates it immediately.
  const [detectedSignId, setDetectedSignId] = useState<string | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [sentence, setSentence] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      const raw = localStorage.getItem('isl-settings')
      if (raw) return Boolean(JSON.parse(raw).autoSpeak)
    } catch { /* ignore */ }
    return false
  })
  const [primaryUserResult, setPrimaryUserResult] = useState<PrimaryUserResult | null>(null)

  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const faceDetectorRef = useRef<FaceDetector | null>(null)
  const socketRef = useRef<PredictSocket | null>(null)
  const rafRef = useRef<number | null>(null)
  const runningRef = useRef(false)

  // Store sign IDs internally for language-agnostic sentence buffer
  const sentenceIdsRef = useRef<string[]>([])
  const landmarksRef = useRef<number[][][] | null>(null)  // [hand][21][x,y,z] for drawing
  const collectHandsRef = useRef<((hands: unknown[]) => void) | null>(null)
  const lastAcceptedRef = useRef<string | null>(null)
  const lastAcceptTimeRef = useRef(0)
  const frameCounterRef = useRef(0)
  const prevTrackIdRef = useRef<number | null>(null)

  const autoSpeakRef = useRef(false)
  // Guard against overlapping async frames — prevents queue buildup when a
  // frame takes longer than the RAF interval (common on slower machines).
  const processingRef = useRef(false)
  // Cache the last tracker result so we only push React state on meaningful changes.
  const lastTrackerSigRef = useRef('')
  // Auto-speak debounce: coalesce rapid consecutive sign recognitions.
  const autoSpeakTimerRef = useRef(0)
  const autoSpeakPendingRef = useRef<{ signId: string; language: SpeechLanguage } | null>(null)

  useEffect(() => {
    autoSpeakRef.current = autoSpeak
  }, [autoSpeak])

  // The sentence is ALWAYS rebuilt from the stored internal sign IDs, so
  // switching language re-renders the whole sentence instead of translating an
  // already-translated string.
  useEffect(() => {
    setSentence(translateSentence(sentenceIdsRef.current, language))
  }, [language])

  // Switching output language must not leave stale speech running or a stale
  // voice decision behind: stop playback and re-probe what can be spoken.
  useEffect(() => {
    stopSpeechOutput()
    void refreshSpeech()
  }, [language, stopSpeechOutput, refreshSpeech])

  const updateSentenceFromIds = useCallback((ids: string[]) => {
    sentenceIdsRef.current = ids
    setSentence(translateSentence(ids, language))
  }, [language])

  const resetAcceptState = useCallback(() => {
    lastAcceptedRef.current = null
    lastAcceptTimeRef.current = 0
    setDetectedSignId(null)
    setConfidence(0)
  }, [])

  // ------------------------------------------------------------------ #
  // Called for every prediction received from the backend.
  const onPrediction = useCallback(
    (pred: Prediction) => {
      if (!runningRef.current) return
      if (pred.error) return

      // Segment-based: the backend only sends an accepted sign when the
      // hand was lowered (sign completed). Append it directly — no more
      // guessing on mid-sign frames.
      if (pred.accepted && pred.sign) {
        const signId = pred.sign
        const now = performance.now()
        if (signId === lastAcceptedRef.current) return
        if (now - lastAcceptTimeRef.current < COOLDOWN_MS) return
        lastAcceptedRef.current = signId
        lastAcceptTimeRef.current = now

        // Store the English class label; the visible word is derived from it.
        setDetectedSignId(signId)
        setConfidence(Math.round(pred.confidence * 100))

        const newIds = [...sentenceIdsRef.current, signId]
        updateSentenceFromIds(newIds)

        if (autoSpeakRef.current) {
          // Debounce auto-speak: rapid consecutive signs (within 300 ms) are
          // coalesced into a single utterance to avoid TTS queue pile-up.
          const now = performance.now()
          const last = autoSpeakTimerRef.current
          if (last && now - last < AUTO_SPEAK_DEBOUNCE_MS) {
            autoSpeakTimerRef.current = now
            autoSpeakPendingRef.current = { signId, language }
            return
          }
          autoSpeakTimerRef.current = now
          autoSpeakPendingRef.current = null

          const plan = speechPlanForSign(signId, language)
          if (plan.text) {
            void speakText(plan.text, language, { dedupeKey: `${language}:${signId}` })
          }
        }
      }
    },
    [language, updateSentenceFromIds, speakText],
  )

  // The socket is created once per session but must always invoke the newest
  // prediction handler, otherwise it keeps using the language that was
  // selected when the session started. See services/latestHandler.ts.
  const predictionHandler = useMemo(() => createLatestHandler(onPrediction), [])
  useEffect(() => {
    predictionHandler.set(onPrediction)
  }, [onPrediction, predictionHandler])

  // ------------------------------------------------------------------ #
  const loop = useCallback(() => {
    if (!runningRef.current) return
    const lm = landmarkerRef.current
    const fd = faceDetectorRef.current
    const video = videoRef.current

    if (lm && fd && video && video.readyState >= 2 && video.videoWidth > 0) {
      frameCounterRef.current += 1

      // Guard against overlapping async work — prevents queue buildup when
      // MediaPipe inference takes longer than the RAF interval.
      if (processingRef.current) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // Always attempt to process this frame; SEND_EVERY is kept at 1 for correctness
      // (backend needs continuous stream to detect hand-down transitions).
      if (frameCounterRef.current % SEND_EVERY === 0) {
        processingRef.current = true
        ;(async () => {
          try {
            const timestamp = performance.now()
            const handResult = lm.detectForVideo(video, timestamp)

            // Get all detected hands
            const allHands: HandData[] = (handResult.landmarks ?? []).map((lmList, i) => ({
              handedness: handResult.handedness?.[i]?.[0]?.categoryName ?? 'Right',
              handedness_score: handResult.handedness?.[i]?.[0]?.score ?? 1,
              landmarks: lmList.map((p) => [p.x, p.y, p.z ?? 0]),
            }))

            // Update landmarks for drawing (all hands for visualization)
            landmarksRef.current = (handResult.landmarks ?? []).map((lmList) =>
              lmList.map((p) => [p.x, p.y, p.z ?? 0]),
            )

            // Determine which hands belong to the primary user.
            // Face detection is expensive — run it only every FACE_DETECT_EVERY-th frame.
            let primaryHands: HandData[] = allHands
            if (frameCounterRef.current % FACE_DETECT_EVERY === 0 && allHands.length > 0) {
              const trackerResult = await primaryUserTracker.processFrame(fd, video, allHands, timestamp)
              primaryHands = trackerResult.primaryHands
              // Build a cheap signature so we only push React state on meaningful changes.
              const sig = `${trackerResult.isStable}|${trackerResult.primaryHands.length}|${trackerResult.allFaces.length}`
              if (sig !== lastTrackerSigRef.current) {
                lastTrackerSigRef.current = sig
                setPrimaryUserResult(trackerResult)
              }

              // Check if track ID changed (primary user switched) - send reset to backend
              const trackInfo = primaryUserTracker.getTrackInfo()
              if (trackInfo.hasTrack && trackInfo.trackId !== undefined && trackInfo.trackId !== prevTrackIdRef.current) {
                if (prevTrackIdRef.current !== null) {
                  socketRef.current?.sendReset()
                }
                prevTrackIdRef.current = trackInfo.trackId ?? null
              }
            } else if (allHands.length === 0) {
              // No hands visible: clear primary selection so backend sees an empty list
              primaryHands = []
            }

            // CRITICAL: Send EVERY frame to the backend, even empty ones.
            // PredictSession counts consecutive no-hand frames to trigger prediction.
            socketRef.current?.sendFrame(primaryHands)

            // If a sample collector is active, feed it the primary hands only
            if (collectHandsRef.current) {
              collectHandsRef.current(primaryHands)
            }
          } catch (err) {
            console.warn('[SignRec] Frame processing error:', err)
          } finally {
            processingRef.current = false
          }
        })()
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [videoRef])

  // ------------------------------------------------------------------ #
  const init = useCallback(async () => {
    setError(null)
    setStatus('loading-model')
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL)
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: LANDMARKER_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      })
      landmarkerRef.current = landmarker

      // Initialize FaceDetector for primary user tracking
      const faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3,
      })
      faceDetectorRef.current = faceDetector

      // Reset primary user tracker
      primaryUserTracker.reset()

      setModelReady(true)

      // The stable wrapper always forwards to the newest onPrediction.
      socketRef.current = new PredictSocket(apiBase, setSocketStatus, predictionHandler)
      socketRef.current.connect()

      runningRef.current = true
      resetAcceptState()
      setStatus('running')
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('Could not load the hand-tracking model. Check your internet connection: ' + msg)
      setStatus('error')
      setModelReady(false)
    }
  }, [apiBase, loop, predictionHandler, resetAcceptState])

  const start = useCallback(() => {
    if (status === 'idle' || status === 'error') void init()
  }, [status, init])

  const pause = useCallback(() => {
    if (status !== 'running') return
    runningRef.current = false
    setStatus('paused')
  }, [status])

  const resume = useCallback(() => {
    if (status !== 'paused') return
    runningRef.current = true
    setStatus('running')
    rafRef.current = requestAnimationFrame(loop)
  }, [status, loop])

  const stop = useCallback(() => {
    runningRef.current = false
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    socketRef.current?.close()
    socketRef.current = null
    landmarkerRef.current?.close()
    landmarkerRef.current = null
    faceDetectorRef.current?.close()
    faceDetectorRef.current = null
    setModelReady(false)
    setStatus('idle')
    primaryUserTracker.reset()
    prevTrackIdRef.current = null
    setPrimaryUserResult(null)
    resetAcceptState()
    stopSpeechOutput()
  }, [resetAcceptState, stopSpeechOutput])

  // ------------------------------------------------------------------ #
  // Sentence buffer actions.
  const addSpace = useCallback(() => {
    updateSentenceFromIds([...sentenceIdsRef.current, 'SPACE'])
    lastAcceptedRef.current = null
    lastAcceptTimeRef.current = 0
  }, [updateSentenceFromIds])

  const undo = useCallback(() => {
    const ids = [...sentenceIdsRef.current]
    if (ids.length > 0) {
      ids.pop()
      updateSentenceFromIds(ids)
    }
  }, [updateSentenceFromIds])

  const clear = useCallback(() => {
    updateSentenceFromIds([])
    resetAcceptState()
    stopSpeechOutput()
  }, [updateSentenceFromIds, resetAcceptState, stopSpeechOutput])

  const speakAll = useCallback(() => {
    // Always speak the TRANSLATED sentence with the selected language tag.
    // `force` lets the user re-read the same sentence on demand instead of
    // having it silently swallowed by the auto-speak dedupe window.
    const plan = speechPlanForSentence(sentenceIdsRef.current, language)
    if (!plan.text.trim()) return
    void speakText(plan.text, language, { force: true })
  }, [language, speakText])

  const stopSpeechAll = useCallback(() => {
    stopSpeechOutput()
  }, [stopSpeechOutput])

  const retrySpeech = useCallback(async () => {
    await speech.retry()
  }, [speech])

  // Flush any pending auto-speak after a short idle period.
  useEffect(() => {
    const timer = setInterval(() => {
      const pending = autoSpeakPendingRef.current
      if (pending && performance.now() - autoSpeakTimerRef.current >= AUTO_SPEAK_DEBOUNCE_MS) {
        autoSpeakPendingRef.current = null
        const plan = speechPlanForSign(pending.signId, pending.language)
        if (plan.text) {
          void speakText(plan.text, pending.language, { dedupeKey: `${pending.language}:${pending.signId}` })
        }
      }
    }, AUTO_SPEAK_DEBOUNCE_MS + 50)
    return () => clearInterval(timer)
  }, [speakText])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      runningRef.current = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      socketRef.current?.close()
      landmarkerRef.current?.close()
      faceDetectorRef.current?.close()
      stopSpeechOutput()
    }
  }, [stopSpeechOutput])

  return {
    landmarksRef,
    collectHandsRef,
    status,
    socketStatus,
    modelReady,
    // Derived from the stored class ID on every render, so switching language
    // updates the visible word immediately.
    detectedSign: detectedSignId ? translateSign(detectedSignId, language) || null : null,
    detectedSignId,
    confidence,
    sentence,
    error,
    autoSpeak,
    setAutoSpeak,
    /** Shared speech state: phase, provider, per-language availability, error. */
    speech,
    /** True once every provider has been probed at least once. */
    speechProbed: speech.voicesReady,
    /** True when the currently selected language can actually be spoken. */
    speechAvailable: speech.voicesReady && speech.availability[language],
    retrySpeech,
    start,
    pause,
    resume,
    stop,
    addSpace,
    undo,
    clear,
    speakAll,
    stopSpeechAll,
    language,
    setLanguage,
    supportedLanguages,
    primaryUserResult,
  }
}
