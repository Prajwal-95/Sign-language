import { useMemo } from 'react'

/**
 * Static 21-point hand skeleton used purely as an illustration (logo-adjacent
 * decoration on informational pages). The LIVE hand overlay is a separate
 * canvas component — see `HandOverlay.tsx`.
 *
 * The `animated` prop that the previous design carried was removed: this
 * component has no motion and must never imply a live camera feed.
 */

export type HandPose = 'open' | 'peace' | 'fist' | 'point' | 'pinky' | 'thumb'

const BASE: [number, number][] = [
  [50, 80], [38, 70], [30, 58], [27, 47], [26, 37], // 0 wrist, 1-4 thumb
  [48, 48], [50, 33], [51, 23], [52, 16],           // 5-8 index
  [58, 46], [61, 29], [62, 18], [63, 10],           // 9-12 middle
  [67, 48], [71, 32], [72, 23], [73, 16],           // 13-16 ring
  [75, 52], [80, 40], [81, 32], [82, 26],           // 17-20 pinky
]

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

const TIPS: Record<string, number> = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 }

function posedLandmarks(pose: HandPose): [number, number][] {
  const points = BASE.map((point) => [...point] as [number, number])
  const up = (index: number, lift: number) => {
    points[index][1] -= lift
  }
  const down = (index: number, drop: number) => {
    points[index][1] += drop
  }
  switch (pose) {
    case 'peace':
      up(TIPS.index, 26); up(TIPS.middle, 24)
      down(TIPS.ring, 18); down(TIPS.pinky, 22); down(TIPS.thumb, 12)
      break
    case 'fist':
      down(TIPS.index, 26); down(TIPS.middle, 26); down(TIPS.ring, 24); down(TIPS.pinky, 22); down(TIPS.thumb, 12)
      break
    case 'point':
      up(TIPS.index, 30)
      down(TIPS.middle, 22); down(TIPS.ring, 24); down(TIPS.pinky, 26); down(TIPS.thumb, 12)
      break
    case 'pinky':
      up(TIPS.pinky, 26)
      down(TIPS.index, 22); down(TIPS.middle, 24); down(TIPS.ring, 22); down(TIPS.thumb, 12)
      break
    case 'thumb':
      up(TIPS.thumb, 20); points[TIPS.thumb][0] -= 4
      down(TIPS.index, 16); down(TIPS.middle, 20); down(TIPS.ring, 22); down(TIPS.pinky, 26)
      break
    default:
      break
  }
  return points
}

interface Props {
  pose?: HandPose
  size?: number
  color?: string
  className?: string
  mirror?: boolean
  dotSize?: number
}

export default function HandSkeleton({
  pose = 'open',
  size = 120,
  color = '#078B68',
  className = '',
  mirror = false,
  dotSize = 2.1,
}: Props) {
  const points = useMemo(() => posedLandmarks(pose), [pose])

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={{ color, transform: mirror ? 'scaleX(-1)' : undefined }}
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" fill="none">
        {CONNECTIONS.map(([a, b], index) => (
          <line
            key={index}
            x1={points[a][0]}
            y1={points[a][1]}
            x2={points[b][0]}
            y2={points[b][1]}
            className="hs-line"
          />
        ))}
      </g>
      {points.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r={dotSize} className="hs-dot" />
      ))}
    </svg>
  )
}