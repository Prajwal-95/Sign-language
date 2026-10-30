import { useEffect, useRef } from 'react'
import type { PrimaryUserResult } from '../services/primaryUserTracker'

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
  primaryUserResult: PrimaryUserResult | null
  active: boolean
  debugMode: boolean
}

export default function PrimaryUserDebugOverlay({ 
  videoRef, 
  primaryUserResult, 
  active, 
  debugMode 
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!active || !debugMode) return
    let raf = 0

    const draw = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas || !video || !video.videoWidth || !primaryUserResult) {
        raf = requestAnimationFrame(draw)
        return
      }

      const w = video.clientWidth || video.videoWidth
      const h = video.clientHeight || video.videoHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        raf = requestAnimationFrame(draw)
        return
      }

      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 2
      ctx.font = '11px system-ui, sans-serif'
      ctx.textBaseline = 'top'

      // Draw torso region if available
      const torso = primaryUserResult.debugInfo.torsoRegion
      if (torso && primaryUserResult.primaryFace) {
        const tx = (1 - torso.centerX - torso.width / 2) * w
        const ty = torso.topY * h
        const tw = torso.width * w
        const th = torso.height * h

        ctx.strokeStyle = '#06b6d4'
        ctx.lineWidth = 1.5
        ctx.setLineDash([8, 4])
        ctx.strokeRect(tx, ty, tw, th)
        ctx.setLineDash([])

        ctx.fillStyle = '#06b6d4'
        ctx.fillRect(tx, ty - 16, 80, 14)
        ctx.fillStyle = '#0f172a'
        ctx.fillText('TORSO REGION', tx + 4, ty - 14)
      }

      // Draw all faces
      for (const face of primaryUserResult.allFaces) {
        const isPrimary = primaryUserResult.primaryFace && 
          face.x === primaryUserResult.primaryFace.x && 
          face.y === primaryUserResult.primaryFace.y

        const x = (1 - face.x - face.width) * w
        const y = face.y * h
        const fw = face.width * w
        const fh = face.height * h

        const color = isPrimary ? '#06b6d4' : '#64748b'
        const label = isPrimary ? 'PRIMARY USER' : 'BACKGROUND'

        ctx.strokeStyle = color
        ctx.lineWidth = isPrimary ? 3 : 1.5
        ctx.setLineDash(isPrimary ? [] : [5, 5])
        ctx.strokeRect(x, y, fw, fh)
        ctx.setLineDash([])

        const labelW = ctx.measureText(label).width + 8
        ctx.fillStyle = color
        ctx.fillRect(x, y - 20, labelW, 18)
        ctx.fillStyle = '#0f172a'
        ctx.fillText(label, x + 4, y - 18)

        const scoreText = `${(face.score * 100).toFixed(0)}%`
        const scoreW = ctx.measureText(scoreText).width + 8
        ctx.fillStyle = color
        ctx.fillRect(x + fw - scoreW, y - 20, scoreW, 18)
        ctx.fillStyle = '#0f172a'
        ctx.fillText(scoreText, x + fw - scoreW + 4, y - 18)

        const areaText = `${(face.area * 100).toFixed(1)}%`
        const areaW = ctx.measureText(areaText).width + 8
        ctx.fillStyle = color
        ctx.fillRect(x, y + fh + 2, areaW, 16)
        ctx.fillStyle = '#0f172a'
        ctx.fillText(areaText, x + 4, y + fh + 4)
      }

      // Draw all hands with association status
      for (let hi = 0; hi < primaryUserResult.allHands.length; hi++) {
        const hand = primaryUserResult.allHands[hi]
        const assoc = primaryUserResult.handAssociations[hi]
        
        if (!assoc) continue

        const isPrimaryHand = assoc.isPrimary
        const color = isPrimaryHand ? '#22c55e' : '#ef4444'
        const confidence = Math.round(assoc.confidence * 100)
        const label = isPrimaryHand 
          ? `PRIMARY HAND (${confidence}%)` 
          : `BG HAND (${confidence}%)`

        const pts = hand.landmarks.map(([x, y]) => ({ x: (1 - x) * w, y: y * h }))
        
        const wrist = pts[0]
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(wrist.x, wrist.y, 8, 0, Math.PI * 2)
        ctx.fill()
        
        const labelW = ctx.measureText(label).width + 8
        ctx.fillStyle = color
        ctx.fillRect(wrist.x + 12, wrist.y - 16, labelW, 18)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, wrist.x + 16, wrist.y - 14)

        // Draw velocity indicator
        if (assoc.velocity > 0) {
          const velText = `v:${assoc.velocity.toFixed(3)}`
          const velW = ctx.measureText(velText).width + 8
          ctx.fillStyle = color
          ctx.fillRect(wrist.x + 12, wrist.y + 4, velW, 14)
          ctx.fillStyle = '#ffffff'
          ctx.fillText(velText, wrist.x + 16, wrist.y + 6)
        }

        // Draw key connections
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        const keyConnections: [number, number][] = [
          [0, 5], [5, 9], [9, 13], [13, 17],
          [0, 1], [1, 2], [2, 3], [3, 4],
        ]
        keyConnections.forEach(([a, b]) => {
          if (pts[a] && pts[b]) {
            ctx.beginPath()
            ctx.moveTo(pts[a].x, pts[a].y)
            ctx.lineTo(pts[b].x, pts[b].y)
            ctx.stroke()
          }
        })
      }

      // Draw debug info panel
      if (primaryUserResult.debugInfo) {
        const info = primaryUserResult.debugInfo
        const lines = [
          `Faces: ${info.candidateCount}`,
          `Primary: ${info.selectedReason}`,
          `Track Age: ${info.trackAge}`,
          `Stable: ${primaryUserResult.isStable ? 'YES' : 'NO'}`,
          `Primary Conf: ${(info.primaryConfidence * 100).toFixed(0)}%`,
          `Selection Conf: ${(primaryUserResult.primaryUserConfidence * 100).toFixed(0)}%`,
          `Primary Hands: ${primaryUserResult.primaryHands.length}`,
          `Total Hands: ${primaryUserResult.allHands.length}`,
        ]

        const panelX = 10
        const panelY = 10
        const lineHeight = 16
        const panelW = 240
        const panelH = lines.length * lineHeight + 10

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
        ctx.fillRect(panelX, panelY, panelW, panelH)
        ctx.strokeStyle = primaryUserResult.isStable ? '#22c55e' : '#f59e0b'
        ctx.lineWidth = 2
        ctx.strokeRect(panelX, panelY, panelW, panelH)

        ctx.fillStyle = '#e2e8f0'
        lines.forEach((line, i) => {
          ctx.fillText(line, panelX + 8, panelY + 6 + i * lineHeight)
        })
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [active, debugMode, videoRef, primaryUserResult])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  )
}