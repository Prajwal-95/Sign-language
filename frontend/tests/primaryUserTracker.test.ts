/**
 * Primary-user tracking tests.
 *
 * These drive the REAL `PrimaryUserTracker.processFrame` entry point - the same
 * function the recognition hook calls every animation frame - with a fake face
 * detector and a structurally-valid video stub. That matters: the bug these
 * cover lived in the association logic inside processFrame, and testing only an
 * extracted helper would not have caught it.
 *
 * All coordinates are normalised 0..1 with the origin at the top-left, exactly
 * as MediaPipe reports them. The mirrored CSS preview is a display concern and
 * is deliberately NOT applied here.
 */
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  PrimaryUserTracker,
  depthMismatch,
  getHandScale,
  scoreFace,
  type FaceDetectorLike,
  type FaceDetectionLike,
  type HandData,
  type VideoLike,
} from '../src/services/primaryUserTracker.ts'

const FW = 640
const FH = 480

const VIDEO: VideoLike = { videoWidth: FW, videoHeight: FH }

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

interface FaceSpec {
  cx: number
  cy: number
  w: number
  h: number
  score?: number
}

function face(spec: FaceSpec): FaceDetectionLike {
  return {
    boundingBox: {
      originX: (spec.cx - spec.w / 2) * FW,
      originY: (spec.cy - spec.h / 2) * FH,
      width: spec.w * FW,
      height: spec.h * FH,
    },
    categories: [{ score: spec.score ?? 0.9 }],
  }
}

/** A face detector that returns a fixed detection list. */
function detector(faces: FaceDetectionLike[]): FaceDetectorLike {
  return { detectForVideo: () => ({ detections: faces }) }
}

/** The same face as the tracker will derive it, for direct score assertions. */
function faceBox(spec: FaceSpec) {
  return {
    x: spec.cx - spec.w / 2,
    y: spec.cy - spec.h / 2,
    width: spec.w,
    height: spec.h,
    score: spec.score ?? 0.9,
    centerX: spec.cx,
    centerY: spec.cy,
    area: spec.w * spec.h,
  }
}

/**
 * A hand with its wrist at (x, y) and an apparent width of `scale`
 * (landmark 9 = middle-finger MCP), which is what the depth cue measures.
 */
function hand(x: number, y: number, scale: number, handedness = 'Right'): HandData {
  const landmarks: number[][] = []
  for (let i = 0; i < 21; i++) landmarks.push([x, y, 0])
  landmarks[9] = [x + scale, y, 0]
  return { handedness, handedness_score: 0.98, landmarks }
}

/** The signed-in user, centred in frame. */
const CENTRED: FaceSpec = { cx: 0.5, cy: 0.3, w: 0.2, h: 0.24 }
/** Expected hand width for that user, from the tracker's seeded 0.6 ratio. */
const CENTRED_HAND_SCALE = 0.12
/** Somebody standing behind, off to the left and further from the camera. */
const BEHIND_LEFT: FaceSpec = { cx: 0.15, cy: 0.2, w: 0.09, h: 0.108 }
/** Their hands appear correspondingly smaller. */
const BEHIND_HAND_SCALE = 0.054

async function prime(tracker: PrimaryUserTracker, faces: FaceDetectionLike[], frames = 4) {
  for (let i = 0; i < frames; i++) {
    await tracker.processFrame(detector(faces), VIDEO, [], 100 + i * 33)
  }
}

let tracker: PrimaryUserTracker
beforeEach(() => {
  tracker = new PrimaryUserTracker()
})

/* ------------------------------------------------------------------ */
/* Face selection                                                      */
/* ------------------------------------------------------------------ */

describe('choosing the centre user', () => {
  it('prefers the horizontally centred face over a larger off-centre one', async () => {
    // The background person is CLOSER, so their face is much bigger. Centring
    // must still win: walking toward the camera is not a claim to the session.
    const bigOffCentre: FaceSpec = { cx: 0.12, cy: 0.35, w: 0.3, h: 0.36 }
    await prime(tracker, [face(bigOffCentre), face(CENTRED)], 4)

    const result = await tracker.processFrame(
      detector([face(bigOffCentre), face(CENTRED)]),
      VIDEO,
      [],
      500,
    )
    assert.ok(result.primaryFace)
    assert.equal(result.primaryFace.centerX, CENTRED.cx, 'the centred user must be primary')
  })

  it('holds one identity across many frames of jitter', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    const first = tracker.getTrackInfo().trackId

    for (let i = 0; i < 12; i++) {
      const jitter: FaceSpec = { ...CENTRED, cx: CENTRED.cx + (i % 3) * 0.004 }
      await tracker.processFrame(detector([face(jitter)]), VIDEO, [], 600 + i * 33)
    }
    assert.equal(tracker.getTrackInfo().trackId, first, 'identity must not flap')
    assert.equal(tracker.getTrackInfo().stabilityFrames, 16)
  })

  it('does not swap to a second person who scores briefly higher', async () => {
    const passer: FaceSpec = { cx: 0.44, cy: 0.3, w: 0.26, h: 0.3 }
    await prime(tracker, [face(CENTRED)], 4)
    const original = tracker.getTrackInfo().trackId
    // The passer-by is present for many frames while the real user stays visible.
    for (let i = 0; i < 10; i++) {
      await tracker.processFrame(detector([face(CENTRED), face(passer)]), VIDEO, [], 700 + i * 33)
    }
    assert.equal(
      tracker.getTrackInfo().trackId,
      original,
      'a visible incumbent must not be displaced',
    )
  })

  it('retains identity through a temporary loss of face detection', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    const before = tracker.getTrackInfo().trackId

    const result = await tracker.processFrame(detector([]), VIDEO, [], 900)
    assert.ok(result.primaryFace, 'the face must be held during the dropout')
    assert.equal(result.debugInfo.selectedReason, 'track_maintained_no_detections')
    assert.equal(tracker.getTrackInfo().trackId, before)
  })

  it('keeps accepting that user\'s hands while the face is briefly missing', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    const result = await tracker.processFrame(
      detector([]),
      VIDEO,
      [hand(0.5, 0.55, CENTRED_HAND_SCALE)],
      950,
    )
    assert.equal(
      result.primaryHands.length,
      1,
      'a momentary face dropout must not silence the signer',
    )
  })

  it('sends nothing once the face is gone for longer than the grace period', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    // Beyond MAX_LOST_FRAMES the identity is dropped and nothing is claimed.
    let last: Awaited<ReturnType<typeof tracker.processFrame>> | null = null
    for (let i = 0; i < 25; i++) {
      last = await tracker.processFrame(
        detector([]),
        VIDEO,
        [hand(0.5, 0.55, CENTRED_HAND_SCALE)],
        1000 + i * 33,
      )
    }
    assert.equal(tracker.getTrackInfo().hasTrack, false, 'the identity must be released')
    assert.equal(last!.primaryFace, null)
    assert.equal(last!.primaryHands.length, 0, 'uncertain identity must reject, not guess')
  })
})

/* ------------------------------------------------------------------ */
/* Hand association                                                    */
/* ------------------------------------------------------------------ */

describe('rejecting other people\'s hands', () => {
  it('accepts the centre user\'s hand', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    const result = await tracker.processFrame(
      detector([face(CENTRED)]),
      VIDEO,
      [hand(0.5, 0.55, CENTRED_HAND_SCALE)],
      500,
    )
    assert.equal(result.primaryHands.length, 1)
    assert.equal(result.handAssociations[0].reason, 'inside_primary_torso')
  })

  it('rejects a background person\'s hand', async () => {
    await prime(tracker, [face(CENTRED), face(BEHIND_LEFT)], 4)
    const result = await tracker.processFrame(
      detector([face(CENTRED), face(BEHIND_LEFT)]),
      VIDEO,
      [hand(0.15, 0.45, BEHIND_HAND_SCALE)],
      500,
    )
    assert.equal(result.primaryHands.length, 0, 'a stranger\'s hand must not be recognised')
    assert.equal(result.handAssociations[0].reason, 'hand_belongs_to_another_person')
  })

  it('rejects a background hand that has crossed into the centre of the frame', async () => {
    await prime(tracker, [face(CENTRED), face(BEHIND_LEFT)], 4)
    // The hand is deep inside the primary's torso box, so geometry alone cannot
    // reject it. Only the apparent-size cue says whose arm this is.
    const result = await tracker.processFrame(
      detector([face(CENTRED), face(BEHIND_LEFT)]),
      VIDEO,
      [hand(0.45, 0.45, BEHIND_HAND_SCALE)],
      500,
    )
    assert.equal(result.primaryHands.length, 0)
    assert.equal(result.handAssociations[0].reason, 'depth_mismatch')
  })

  it('accepts both of the centre user\'s hands', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    const result = await tracker.processFrame(
      detector([face(CENTRED)]),
      VIDEO,
      [hand(0.4, 0.5, CENTRED_HAND_SCALE, 'Right'), hand(0.6, 0.5, CENTRED_HAND_SCALE, 'Left')],
      500,
    )
    assert.equal(result.primaryHands.length, 2, 'two-handed signs must still work')
  })

  it('accepts hands raised out towards the edges of the frame', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    // Raised hands come slightly closer to the camera, so they read a little
    // larger than the resting estimate.
    const result = await tracker.processFrame(
      detector([face(CENTRED)]),
      VIDEO,
      [hand(0.18, 0.4, CENTRED_HAND_SCALE * 1.08, 'Right'),
       hand(0.82, 0.4, CENTRED_HAND_SCALE * 1.08, 'Left')],
      500,
    )
    assert.equal(result.primaryHands.length, 2, 'wide arm positions are still ours')
    assert.equal(result.handAssociations[0].reason, 'within_primary_reach')
  })

  it('rejects a hand far outside the user\'s reach', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    const result = await tracker.processFrame(
      detector([face(CENTRED)]),
      VIDEO,
      [hand(0.03, 0.25, CENTRED_HAND_SCALE)],
      500,
    )
    assert.equal(result.primaryHands.length, 0)
    assert.equal(result.handAssociations[0].reason, 'outside_primary_reach')
  })

  it('sends no hands at all before the identity is stable', async () => {
    // Only two frames: below MIN_STABILITY_FRAMES, so nothing is claimed.
    await tracker.processFrame(detector([face(CENTRED)]), VIDEO, [], 100)
    const result = await tracker.processFrame(
      detector([face(CENTRED)]),
      VIDEO,
      [hand(0.5, 0.55, CENTRED_HAND_SCALE)],
      133,
    )
    assert.equal(result.isStable, false)
    assert.equal(result.primaryHands.length, 0, 'an unstable identity must reject')
    assert.equal(result.handAssociations[0].reason, 'identity_not_stable_yet')
  })

  it('rejects everything when no face is visible and no track survives', async () => {
    const result = await tracker.processFrame(
      detector([]),
      VIDEO,
      [hand(0.5, 0.55, CENTRED_HAND_SCALE)],
      100,
    )
    assert.equal(result.primaryFace, null)
    assert.equal(result.primaryHands.length, 0)
    assert.equal(result.handAssociations[0].reason, 'no_primary_face')
  })

  it('still accepts a user whose hands are much larger than the seeded guess', async () => {
    // A big-handed user: their hand is 1.6x wider relative to their face than the
    // 0.6 seed assumes. A fixed tight gate would reject every hand, and because
    // rejected hands never adapt the estimate, the user would be locked out.
    const bigHandScale = CENTRED.w * 0.96
    await prime(tracker, [face(CENTRED)], 4)
    const result = await tracker.processFrame(
      detector([face(CENTRED)]),
      VIDEO,
      [hand(0.5, 0.55, bigHandScale)],
      500,
    )
    assert.equal(
      result.primaryHands.length,
      1,
      'the gate must relax while it is still learning this person',
    )
    assert.equal(result.handAssociations[0].reason, 'inside_primary_torso')
  })

  it('keeps rejecting a background hand whose size never matches', async () => {
    // The tolerance relaxes while learning, but a background person's hand is
    // far enough off to stay outside it even at its widest.
    await prime(tracker, [face(CENTRED), face(BEHIND_LEFT)], 4)
    const result = await tracker.processFrame(
      detector([face(CENTRED), face(BEHIND_LEFT)]),
      VIDEO,
      [hand(0.45, 0.45, CENTRED.w * 0.08)],
      500,
    )
    assert.equal(result.primaryHands.length, 0)
    assert.equal(result.handAssociations[0].reason, 'depth_mismatch')
  })
})

/* ------------------------------------------------------------------ */
/* Stale state                                                         */
/* ------------------------------------------------------------------ */

describe('no stale hands leak through', () => {
  it('never carries a rejected hand into a later frame', async () => {
    await prime(tracker, [face(CENTRED), face(BEHIND_LEFT)], 4)

    const first = await tracker.processFrame(
      detector([face(CENTRED), face(BEHIND_LEFT)]),
      VIDEO,
      [hand(0.5, 0.55, CENTRED_HAND_SCALE), hand(0.15, 0.45, BEHIND_HAND_SCALE)],
      500,
    )
    assert.equal(first.primaryHands.length, 1)
    assert.equal(first.primaryHands[0].handedness, 'Right')
    assert.equal(first.primaryHands[0].landmarks[0][0], 0.5)

    // The stranger lowers their hand. The payload must contain only the primary.
    const second = await tracker.processFrame(
      detector([face(CENTRED), face(BEHIND_LEFT)]),
      VIDEO,
      [hand(0.5, 0.55, CENTRED_HAND_SCALE)],
      533,
    )
    assert.equal(second.primaryHands.length, 1)
    for (const h of second.primaryHands) {
      assert.notEqual(h.landmarks[0][0], 0.15, 'the rejected hand must be gone, not cached')
    }
  })

  it('reports an empty payload rather than repeating the last accepted hand', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    await tracker.processFrame(
      detector([face(CENTRED)]),
      VIDEO,
      [hand(0.5, 0.55, CENTRED_HAND_SCALE)],
      500,
    )
    const idle = await tracker.processFrame(detector([face(CENTRED)]), VIDEO, [], 533)
    assert.equal(idle.primaryHands.length, 0, 'no hands must mean an empty array')
    assert.equal(idle.allHands.length, 0)
  })

  it('forgets a hand track once the hand leaves the frame', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    await tracker.processFrame(
      detector([face(CENTRED)]),
      VIDEO,
      [hand(0.5, 0.55, CENTRED_HAND_SCALE)],
      500,
    )
    assert.equal(tracker.getTrackInfo().handTrackCount, 1)
    await tracker.processFrame(detector([face(CENTRED)]), VIDEO, [], 533)
    assert.equal(tracker.getTrackInfo().handTrackCount, 0)
  })

  it('keeps a stable id for a hand that moves between frames', async () => {
    await prime(tracker, [face(CENTRED)], 4)
    const a = await tracker.processFrame(
      detector([face(CENTRED)]),
      VIDEO,
      [hand(0.5, 0.5, CENTRED_HAND_SCALE)],
      500,
    )
    const b = await tracker.processFrame(
      detector([face(CENTRED)]),
      VIDEO,
      [hand(0.52, 0.53, CENTRED_HAND_SCALE)],
      533,
    )
    assert.ok(a.handAssociations[0].trackId > 0)
    assert.equal(
      b.handAssociations[0].trackId,
      a.handAssociations[0].trackId,
      'a moving hand must keep its identity so velocity is real',
    )
    assert.ok(b.handAssociations[0].velocity > 0, 'velocity must actually be measured')
  })
})

/* ------------------------------------------------------------------ */
/* Coordinate system                                                   */
/* ------------------------------------------------------------------ */

describe('coordinates', () => {
  it('uses MediaPipe model space, not the mirrored preview', async () => {
    // A person at model x = 0.2 is on the model-left. Mirroring is applied by CSS
    // for display only, so the tracker must treat 0.2 as off-centre - if it
    // mirrored internally, this face would look centred and win.
    const modelLeft: FaceSpec = { cx: 0.2, cy: 0.3, w: 0.2, h: 0.24 }
    await prime(tracker, [face(modelLeft)], 4)
    const result = await tracker.processFrame(detector([face(modelLeft)]), VIDEO, [], 500)
    assert.ok(result.primaryFace)
    assert.equal(result.primaryFace.centerX, 0.2)
    // A truly centred face must out-score the model-left one.
    const centredScore = scoreFace(faceBox(CENTRED))
    const leftScore = scoreFace(faceBox(modelLeft))
    assert.ok(
      centredScore > leftScore,
      `centred ${centredScore} must beat model-left ${leftScore}`,
    )
  })

  it('normalises face boxes from pixel detector output', async () => {
    const result = await tracker.processFrame(detector([face(CENTRED)]), VIDEO, [], 100)
    const f = result.allFaces[0]
    assert.ok(Math.abs(f.centerX - CENTRED.cx) < 1e-6)
    assert.ok(Math.abs(f.width - CENTRED.w) < 1e-6)
  })

  it('measures hand scale wrist-to-middle-MCP, like the feature extractor', () => {
    assert.ok(Math.abs(getHandScale(hand(0.4, 0.4, 0.1)) - 0.1) < 1e-9)
    assert.equal(getHandScale({ handedness: 'Right', handedness_score: 1, landmarks: [] }), 0)
  })

  it('scores a depth mismatch of zero when sizes agree', () => {
    const f = faceBox(CENTRED)
    assert.ok(depthMismatch(0.12, f, 0.6) < 1e-9)
    assert.ok(depthMismatch(0.06, f, 0.6) > 0.5, 'half-size hand is a clear mismatch')
  })
})

/* ------------------------------------------------------------------ */
/* The real transmission path                                          */
/* ------------------------------------------------------------------ */

describe('what actually reaches the backend', () => {
  it('sends only the centre user\'s landmarks over the real socket', async () => {
    const { PredictSocket } = await import('../src/services/ws.ts')

    class FakeSocket {
      static OPEN = 1
      static last: FakeSocket | null = null
      readyState = FakeSocket.OPEN
      readonly sent: string[] = []
      onopen: (() => void) | null = null
      onclose: (() => void) | null = null
      onerror: (() => void) | null = null
      readonly url: string
      constructor(url: string) {
        this.url = url
        FakeSocket.last = this
      }
      send(data: string) {
        this.sent.push(data)
      }
      close() {
        this.readyState = 3
      }
    }
    const globals = globalThis as unknown as Record<string, unknown>
    const savedWebSocket = globals.WebSocket
    const savedWindow = globals.window
    globals.WebSocket = FakeSocket
    globals.window = { setInterval, clearInterval }

    try {
      await prime(tracker, [face(CENTRED), face(BEHIND_LEFT)], 4)

      const socket = new PredictSocket('http://localhost:8000', () => {}, () => {})
      socket.connect()

      // Exactly what useSignRecognition does each frame.
      const frame = await tracker.processFrame(
        detector([face(CENTRED), face(BEHIND_LEFT)]),
        VIDEO,
        [hand(0.5, 0.55, CENTRED_HAND_SCALE, 'Right'), hand(0.15, 0.45, BEHIND_HAND_SCALE, 'Left')],
        500,
      )
      socket.sendFrame(frame.primaryHands)

      assert.equal(FakeSocket.last!.url, 'ws://localhost:8000/ws/predict')
      assert.equal(FakeSocket.last!.sent.length, 1)

      // Parse the actual JSON that would travel to the GRU.
      const payload = JSON.parse(FakeSocket.last!.sent[0])
      assert.equal(payload.hands.length, 1, 'only one person may be transmitted')
      assert.equal(payload.hands[0].handedness, 'Right')
      assert.equal(payload.hands[0].landmarks.length, 21, 'payload shape is unchanged')
      assert.equal(payload.hands[0].landmarks[0][0], 0.5)
      // The stranger's landmarks must be nowhere in the frame.
      const wire = FakeSocket.last!.sent[0]
      assert.equal(wire.includes('0.15'), false, 'background landmarks must not be sent')
      socket.close()
    } finally {
      globals.WebSocket = savedWebSocket
      globals.window = savedWindow
    }
  })

  it('sends an explicit empty payload when no hand is accepted', async () => {
    const { PredictSocket } = await import('../src/services/ws.ts')
    class FakeSocket {
      static OPEN = 1
      static last: FakeSocket | null = null
      readyState = FakeSocket.OPEN
      readonly sent: string[] = []
      onopen: (() => void) | null = null
      onclose: (() => void) | null = null
      onerror: (() => void) | null = null
      readonly url: string
      constructor(url: string) {
        this.url = url
        FakeSocket.last = this
      }
      send(data: string) {
        this.sent.push(data)
      }
      close() {
        this.readyState = 3
      }
    }
    const globals = globalThis as unknown as Record<string, unknown>
    const savedWebSocket = globals.WebSocket
    const savedWindow = globals.window
    globals.WebSocket = FakeSocket
    globals.window = { setInterval, clearInterval }

    try {
      await prime(tracker, [face(CENTRED), face(BEHIND_LEFT)], 4)
      const socket = new PredictSocket('http://localhost:8000', () => {}, () => {})
      socket.connect()

      // Only the stranger's hand is visible this frame.
      const frame = await tracker.processFrame(
        detector([face(CENTRED), face(BEHIND_LEFT)]),
        VIDEO,
        [hand(0.15, 0.45, BEHIND_HAND_SCALE)],
        500,
      )
      assert.equal(frame.primaryHands.length, 0)
      socket.sendFrame(frame.primaryHands)

      const payload = JSON.parse(FakeSocket.last!.sent[0])
      assert.deepEqual(payload, { hands: [] }, 'an empty array, never a stale hand')
      socket.close()
    } finally {
      globals.WebSocket = savedWebSocket
      globals.window = savedWindow
    }
  })
})

/* ------------------------------------------------------------------ */
/* Result shape                                                       */
/* ------------------------------------------------------------------ */

describe('result shape', () => {
  it('keeps handAssociations index-aligned with allHands', async () => {
    await prime(tracker, [face(CENTRED), face(BEHIND_LEFT)], 4)
    const hands = [
      hand(0.15, 0.45, BEHIND_HAND_SCALE, 'Left'),
      hand(0.5, 0.55, CENTRED_HAND_SCALE, 'Right'),
    ]
    const result = await tracker.processFrame(
      detector([face(CENTRED), face(BEHIND_LEFT)]),
      VIDEO,
      hands,
      500,
    )
    assert.equal(result.handAssociations.length, result.allHands.length)
    // The debug overlay pairs these two arrays by index, so this must hold.
    for (let i = 0; i < hands.length; i++) {
      assert.equal(result.handAssociations[i].hand, hands[i])
      assert.equal(result.handAssociations[i].hand.handedness, hands[i].handedness)
    }
    assert.equal(result.handAssociations[0].isPrimary, false)
    assert.equal(result.handAssociations[1].isPrimary, true)
  })
})