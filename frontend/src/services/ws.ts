/**
 * WebSocket client for real-time sign prediction.
 *
 * The browser sends ONLY compact landmark data (never video frames):
 *   { "hands": [{ handedness, handedness_score, landmarks: [21][3] }] }
 * and receives a prediction per frame:
 *   { sign, confidence, accepted, num_hands }
 */

export interface HandPayload {
  handedness: string
  handedness_score: number
  landmarks: number[][]
}

export interface FramePayload {
  hands: HandPayload[]
}

export interface Prediction {
  sign: string | null
  confidence: number
  accepted: boolean
  num_hands: number
  error?: string
}

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

const PING_INTERVAL_MS = 10_000

export class PredictSocket {
  private ws: WebSocket | null = null
  private url: string
  private pingTimer: number | null = null
  private onStatus: (s: SocketStatus) => void
  private onPrediction: (p: Prediction) => void

  constructor(
    apiBase: string,
    onStatus: (s: SocketStatus) => void,
    onPrediction: (p: Prediction) => void,
  ) {
    // http://host:8000 -> ws://host:8000/ws/predict
    this.url = apiBase.replace(/^http/, 'ws') + '/ws/predict'
    this.onStatus = onStatus
    this.onPrediction = onPrediction
  }

  connect(): void {
    this.onStatus('connecting')
    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this.onStatus('error')
      return
    }

    this.ws.onopen = () => {
      this.onStatus('open')
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping' }), PING_INTERVAL_MS)
    }
    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string)
        if (data.type === 'pong') return
        this.onPrediction(data as Prediction)
      } catch {
        /* ignore malformed frames */
      }
    }
    this.ws.onclose = () => {
      this.stopPing()
      this.onStatus('closed')
    }
    this.ws.onerror = () => {
      this.stopPing()
      this.onStatus('error')
    }
  }

  sendFrame(hands: HandPayload[]): void {
    this.send({ hands })
  }

  sendReset(): void {
    this.send({ type: 'reset' })
  }

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  close(): void {
    this.stopPing()
    this.ws?.close()
    this.ws = null
  }
}
