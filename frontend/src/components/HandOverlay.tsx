import { useEffect, useRef } from 'react'

/**
 * Draws the live MediaPipe hand skeleton (21 points + connections) on top of
 * the webcam video. This gives instant visual feedback that the hand is
 * being tracked — great for demos and debugging.
 *
 * MediaPipe hand landmark connections (21 points, index pairs):
 *  - thumb:   0-1, 1-2, 2-3, 3-4
 *  - index:   0-5, 5-6, 6-7, 7-8
 *  - middle:  0-9, 9-10, 10-11, 11-12
 *  - ring:    0-13, 13-14, 14-15, 15-16
 *  - pinky:   0-17, 17-18, 18-19, 19-20
 *  - palm:    5-9, 9-13, 13-17
 */
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

const FINGER_COLORS = [
  '#22c55e', // thumb - green
  '#3b82f6', // index - blue
  '#f59e0b', // middle - amber
  '#ef4444', // ring - red
  '#fb7185', // pinky - rose
]

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
  landmarksRef: React.MutableRefObject<number[][][] | null>
  active: boolean
}

export default function HandOverlay({ videoRef, landmarksRef, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!active) return
    let raf = 0

    const draw = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (canvas && video && video.videoWidth > 0) {
        // Match canvas size to the video's rendered size.
        const w = video.clientWidth || video.videoWidth
        const h = video.clientHeight || video.videoHeight
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, w, h)
          const hands = landmarksRef.current
          if (hands) {
            for (let hi = 0; hi < hands.length; hi++) {
              const lm = hands[hi]
              // The video is DISPLAYED mirrored (scaleX(-1) CSS), but MediaPipe
              // reads the unflipped frame data. So flip the x coordinate to
              // align the skeleton with what the user sees (selfie view).
              const pts = lm.map(([x, y]) => ({ x: (1 - x) * w, y: y * h }))
              // connections
              ctx.lineWidth = 2.5
              ctx.lineCap = 'round'
              CONNECTIONS.forEach(([a, b], i) => {
                const finger = Math.min(4, Math.floor(i / 4))
                ctx.strokeStyle = FINGER_COLORS[finger]
                ctx.beginPath()
                ctx.moveTo(pts[a].x, pts[a].y)
                ctx.lineTo(pts[b].x, pts[b].y)
                ctx.stroke()
              })
              // landmark dots
              pts.forEach((p) => {
                ctx.beginPath()
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
                ctx.fillStyle = '#ffffff'
                ctx.fill()
                ctx.strokeStyle = '#0f172a'
                ctx.lineWidth = 1
                ctx.stroke()
              })
            }
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [active, videoRef, landmarksRef])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  )
}
