import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchVocab, fetchSampleCounts, recordSample, addCustomSign } from '../services/api'
import { Card, CardHeader } from './ui/Card'
import { Button } from './ui/Button'
import Icon from './ui/Icon'
import { Input, Select } from './ui/Form'

interface Props {
  collectHandsRef: React.MutableRefObject<((hands: unknown[]) => void) | null>
  recognizing: boolean
}

const TARGET_FRAMES = 40
const MIN_FRAMES = 14

/**
 * Calibration recorder.
 *
 * Recording logic, frame counts, endpoints and thresholds are unchanged from
 * the original implementation — only the presentation was rebuilt.
 */
export default function SampleCollector({ collectHandsRef, recognizing }: Props) {
  const [vocab, setVocab] = useState<string[]>([])
  const [sign, setSign] = useState('')
  const [customDraft, setCustomDraft] = useState('')
  const [addingCustom, setAddingCustom] = useState(false)
  const [recording, setRecording] = useState(false)
  const [frames, setFrames] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const bufferRef = useRef<unknown[][]>([])
  const signRef = useRef('')
  const finishRef = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    fetchVocab().then((v) => {
      if (cancelled) return
      setVocab(v)
      setSign(v[0] ?? '')
    })
    fetchSampleCounts().then((c) => {
      if (!cancelled) setCounts(c)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    signRef.current = sign
  }, [sign])

  const handleHands = useCallback((hands: unknown[]) => {
    bufferRef.current.push(hands)
    setFrames(bufferRef.current.length)
    if (bufferRef.current.length >= TARGET_FRAMES) {
      void finishRef.current()
    }
  }, [])

  const finishAndSend = useCallback(async () => {
    const buf = bufferRef.current
    bufferRef.current = []
    setRecording(false)
    if (buf.length < MIN_FRAMES) {
      setMessage({ ok: false, text: `Too few frames (${buf.length}). Keep your hand visible.` })
      return
    }
    const currentSign = signRef.current
    if (!currentSign) {
      setMessage({ ok: false, text: 'Pick a sign first.' })
      return
    }
    try {
      const res = await recordSample(currentSign, buf.map((hands) => ({ hands })))
      if (!res) {
        setMessage({ ok: false, text: 'Backend did not save the sample.' })
        return
      }
      const c = res.sample_index + 1
      setCounts((prev) => ({ ...prev, [res.sign]: c }))
      if (res.sign === signRef.current) {
        setSavedCount(c)
      }
      setMessage({
        ok: true,
        text: `Saved sample #${res.sample_index} for ${res.sign} (${res.frames_used} frames). Keep going — aim for ~10 per sign.`,
      })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  useEffect(() => {
    finishRef.current = finishAndSend
  }, [finishAndSend])

  const addCustomWord = async () => {
    const draft = customDraft.trim()
    if (!draft) {
      setMessage({ ok: false, text: 'Type a word first.' })
      return
    }
    if (vocab.map((v) => v.toUpperCase()).includes(draft.toUpperCase())) {
      setMessage({ ok: true, text: `"${draft}" is already in the vocabulary.` })
      setCustomDraft('')
      return
    }
    setAddingCustom(true)
    setMessage(null)
    try {
      const res = await addCustomSign(draft)
      if (!res) {
        setMessage({ ok: false, text: 'Backend did not add the word.' })
        return
      }
      setVocab(res.vocab)
      setSign(res.sign)
      setSavedCount(0)
      setCustomDraft('')
      setMessage({
        ok: true,
        text: `Added "${res.sign}" — now record ~10 samples, then retrain.`,
      })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setAddingCustom(false)
    }
  }

  const startRecording = () => {
    if (!recognizing) {
      setMessage({ ok: false, text: 'Start translation first (the camera must be running).' })
      return
    }
    if (recording) return
    bufferRef.current = []
    setFrames(0)
    setMessage(null)
    setRecording(true)
  }

  useEffect(() => {
    collectHandsRef.current = recording ? handleHands : null
    return () => {
      collectHandsRef.current = null
    }
  }, [recording, handleHands, collectHandsRef])

  const progress = Math.min(100, Math.round((frames / TARGET_FRAMES) * 100))
  const totalSaved = Object.values(counts).reduce((sum, value) => sum + value, 0)

  return (
    <Card as="section" aria-labelledby="calibration-heading">
      <div className="p-4 sm:p-5">
        <CardHeader
          titleId="calibration-heading"
          title="Record your hand"
          description="Add your own webcam samples so the model learns your hand in your setup"
          accent="coral"
          icon={<Icon name="layers" size={20} />}
          titleAs="h2"
          actions={
            vocab.length === 0 ? (
              <span className="text-[12px] text-ink-muted">Vocabulary unavailable — backend offline</span>
            ) : (
              <span className="text-[12px] text-ink-muted">
                {totalSaved} recorded {totalSaved === 1 ? 'sample' : 'samples'}
              </span>
            )
          }
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <div>
            <label className="field-label" htmlFor="collector-sign">
              Sign to record
            </label>
            <Select
              id="collector-sign"
              value={sign}
              onChange={(value) => {
                if (value !== sign) {
                  setSign(value)
                  setSavedCount(counts[value] ?? 0)
                }
              }}
              options={vocab.map((value) => ({ value, label: value.replace(/_/g, ' ') }))}
              disabled={vocab.length === 0}
            />
          </div>

          <Button variant="primary" onClick={startRecording} disabled={recording || vocab.length === 0}>
            {recording ? 'Recording…' : 'Record sample'}
          </Button>

          <p className="text-[13px] text-ink-secondary sm:pb-3">
            Saved for this sign: <strong className="text-ink">{savedCount}</strong>
          </p>
        </div>

        {/* Custom-word row: add a word the model was never trained on. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label className="field-label" htmlFor="collector-custom">
              Add a new word
            </label>
            <Input
              id="collector-custom"
              type="text"
              placeholder="e.g. my name, coffee, laptop"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              disabled={addingCustom}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addCustomWord()
              }}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => void addCustomWord()}
            disabled={addingCustom || !customDraft.trim()}
          >
            {addingCustom ? 'Adding…' : 'Add word'}
          </Button>
        </div>

        {recording ? (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 text-[12.5px] text-ink-secondary">
              <span>
                Recording {sign.replace(/_/g, ' ')}… perform the sign and hold it steady.
              </span>
              <span className="font-semibold tabular-nums text-ink">
                {frames}/{TARGET_FRAMES}
              </span>
            </div>
            <div
              className="progress mt-2"
              role="progressbar"
              aria-valuenow={frames}
              aria-valuemin={0}
              aria-valuemax={TARGET_FRAMES}
              aria-label="Recording progress in frames"
            >
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {message ? (
          <p
            className={`mt-3 text-[12.5px] leading-relaxed ${message.ok ? 'text-status-ok' : 'text-status-danger'}`}
            role="status"
          >
            {message.text}
          </p>
        ) : null}

        <p className="mt-4 border-t border-line pt-3.5 text-[12px] leading-relaxed text-ink-secondary">
          The model was trained on studio footage, so live results improve once you add samples
          from your own camera. Record roughly 10 per sign with small variations in distance and
          angle, then run{' '}
          <code className="code-inline">python scripts/train_lstm.py --augment --epochs 120 --hidden 256 --lr 5e-4 --patience 40</code>{' '}
          and restart the backend.
        </p>
      </div>
    </Card>
  )
}