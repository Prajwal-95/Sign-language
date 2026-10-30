/**
 * Primary User Tracker.
 *
 * Picks the person the user is actually sitting in front of, and hands the
 * recognition pipeline ONLY that person's hands. Everyone else's hands are
 * dropped before the landmarks ever reach the WebSocket.
 *
 * Why this exists
 * ---------------
 * MediaPipe detects every hand in frame. A person standing behind the signer
 * therefore feeds their landmarks into the GRU exactly like the signer's own,
 * which corrupts the sliding-window sequence and produces confident nonsense.
 * Portrait blur does not help: it only changes what is *displayed*, never what
 * MediaPipe *sees*.
 *
 * How a hand is claimed
 * ---------------------
 *  1. Face selection prefers the horizontally centred, stable, reasonably large
 *     face, and holds that identity through brief detection dropouts.
 *  2. Every hand is costed against EVERY face's torso, and assigned to the
 *     cheapest one. A hand that belongs to somebody else is therefore assigned
 *     to that other person and rejected, rather than merely "not near the
 *     primary".
 *  3. Apparent hand scale is compared with the scale implied by the owning
 *     face. Hands and faces shrink together with distance, so this is a
 *     depth cue that rejects a background person's hand even when it wanders
 *     across the centre of the frame.
 *  4. Hand identity is tracked across frames by nearest-neighbour matching, so
 *     the temporal-consistency signals actually carry between frames.
 *
 * Every dependency is structural rather than a concrete MediaPipe type, so the
 * whole `processFrame` path is exercisable under the project's Node test
 * runner. The real FaceDetector and HTMLVideoElement satisfy them unchanged.
 */

import { FilesetResolver, FaceDetector } from '@mediapipe/tasks-vision'

/* ------------------------------------------------------------------ */
/* Structural types (real MediaPipe types satisfy these)              */
/* ------------------------------------------------------------------ */

export interface FaceDetectionLike {
  boundingBox?: { originX: number; originY: number; width: number; height: number }
  categories?: Array<{ score?: number }>
}

export interface FaceDetectorLike {
  detectForVideo(
    video: unknown,
    timestamp: number,
  ): { detections?: FaceDetectionLike[] }
}

export interface VideoLike {
  readonly videoWidth: number
  readonly videoHeight: number
}

/* ------------------------------------------------------------------ */
/* Public data shapes (unchanged contract)                            */
/* ------------------------------------------------------------------ */

export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
  score: number
  centerX: number
  centerY: number
  area: number
}

export interface HandData {
  handedness: string
  handedness_score: number
  landmarks: number[][]
}

export interface HandAssociation {
  hand: HandData
  isPrimary: boolean
  confidence: number
  distanceFromFace: number
  distanceFromTorso: number
  velocity: number
  wasPrimaryPrevFrame: boolean
  /** Stable cross-frame id for this hand. -1 when it could not be tracked. */
  trackId: number
  /** Whose torso this hand was assigned to. null when there are no faces. */
  ownerFace: FaceBox | null
  /** Apparent hand scale as measured in the frame. */
  handScale: number
  /** |ln(handScale / expected for the owning face)|. 0 = perfect depth match. */
  depthMismatch: number
  /** Short human-readable reason, surfaced by the debug overlay. */
  reason: string
}

export interface TrackedUser {
  face: FaceBox
  estimatedTorso: TorsoRegion | null
  faceIndex: number
  lastSeenFrame: number
  trackId: number
  stabilityFrames: number
  selectionConfidence: number
  /**
   * Running estimate of handScale / faceWidth for this person. Self-calibrating,
   * so the depth gate does not depend on a hard-coded anatomical constant.
   */
  handToFaceRatio: number
}

export interface TorsoRegion {
  centerX: number
  centerY: number
  width: number
  height: number
  topY: number
  bottomY: number
}

export interface HandTrack {
  id: number
  x: number
  y: number
  wasPrimary: boolean
  framesTracked: number
  lastSeenFrame: number
  positions: Array<{ x: number; y: number }>
}

export interface PrimaryUserResult {
  primaryFace: FaceBox | null
  primaryHands: HandData[]
  allFaces: FaceBox[]
  allHands: HandData[]
  /** Index-aligned with `allHands`: `handAssociations[i]` describes `allHands[i]`. */
  handAssociations: HandAssociation[]
  isStable: boolean
  primaryUserConfidence: number
  debugInfo: {
    candidateCount: number
    selectedReason: string
    trackAge: number
    primaryConfidence: number
    torsoRegion: TorsoRegion | null
  }
}

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

const FACE_DETECTOR_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

const MIN_FACE_AREA_RATIO = 0.008
const MAX_FACE_AREA_RATIO = 0.85

/**
 * Face scoring weights. Horizontal centring is deliberately the strongest term:
 * the user sits in the middle of their own webcam, while a passer-by is off to
 * one side. Size saturates early so that simply moving toward the camera cannot
 * out-rank being centred.
 */
const CENTER_WEIGHT = 0.5
const SIZE_WEIGHT = 0.25
const CONFIDENCE_WEIGHT = 0.25
const SIZE_SATURATION_AREA = 0.05

/** A challenger must beat the incumbent by this factor before identity flips. */
const SWITCH_FACTOR = 1.2
const MIN_STABILITY_FRAMES = 3
/** ~0.6s at 30fps: holds identity through a blink or a brief occlusion. */
const MAX_LOST_FRAMES = 18
const FACE_IOU_THRESHOLD = 0.3

const TORSO_HEIGHT_MULTIPLIER = 2.5
const TORSO_WIDTH_MULTIPLIER = 1.8

/** How far outside the torso a raised or outstretched hand may still count. */
const REACH_WIDTH_MULTIPLIER = 2.0
const REACH_ABOVE_FACE = 0.6
const REACH_BELOW_TORSO = 2.0

/** Relative weight of the depth cue when assigning a hand to a face. */
const DEPTH_OWNER_WEIGHT = 0.15
const INITIAL_HAND_TO_FACE_RATIO = 0.6
const HAND_RATIO_ADAPT = 0.1
/**
 * The depth cue exists to tell people APART, so it is only meaningful when
 * there is more than one person in frame. With a single face, geometry alone
 * decides and the seeded hand/face ratio cannot lock anybody out.
 *
 * With a competitor present the gate is tight from the start - that is exactly
 * the case it was added for - and relaxes only marginally as this person's real
 * proportions are learned from the hands already accepted.
 */
const DEPTH_TOLERANCE_CONTESTED = 0.65
const DEPTH_TOLERANCE_SETTLED = 0.45
const DEPTH_TOLERANCE_SETTLE_FRAMES = 20

/** Gate for matching a detection to an existing hand track. */
const HAND_MATCH_GATE = 0.12
const HAND_HISTORY_LENGTH = 5
/** Losing a track costs this much confidence; keeps identity from flapping. */
const TRACK_STABILITY_BONUS = 0.12

let faceDetector: FaceDetector | null = null
let faceDetectorInitialized = false

export async function initFaceDetector(): Promise<FaceDetector> {
  if (faceDetectorInitialized && faceDetector) return faceDetector
  const vision = await FilesetResolver.forVisionTasks(WASM_URL)
  faceDetector = await FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.45,
    minSuppressionThreshold: 0.3,
  })
  faceDetectorInitialized = true
  return faceDetector
}

/* ------------------------------------------------------------------ */
/* Geometry helpers (all coordinates normalised 0..1, origin top-left) */
/* ------------------------------------------------------------------ */

function convertFaceDetection(
  detection: FaceDetectionLike,
  frameWidth: number,
  frameHeight: number,
): FaceBox {
  const bbox = detection.boundingBox
  if (!bbox || frameWidth <= 0 || frameHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0, score: 0, centerX: 0.5, centerY: 0.5, area: 0 }
  }
  const x = bbox.originX / frameWidth
  const y = bbox.originY / frameHeight
  const width = bbox.width / frameWidth
  const height = bbox.height / frameHeight
  const centerX = x + width / 2
  const centerY = y + height / 2
  const area = width * height
  const score = detection.categories?.[0]?.score ?? 0
  return { x, y, width, height, score, centerX, centerY, area }
}

function estimateTorsoFromFace(face: FaceBox): TorsoRegion {
  const torsoHeight = face.height * TORSO_HEIGHT_MULTIPLIER
  const torsoWidth = face.width * TORSO_WIDTH_MULTIPLIER
  const topY = face.y + face.height * 0.3
  return {
    centerX: face.centerX,
    centerY: topY + torsoHeight / 2,
    width: torsoWidth,
    height: torsoHeight,
    topY,
    bottomY: topY + torsoHeight,
  }
}

/**
 * Score a face for "is this the person using the app".
 *
 * Centredness is measured HORIZONTALLY only. A seated user's face sits above the
 * vertical midpoint in every normal webcam framing, so including y would apply
 * the same penalty to everyone and just add noise.
 */
export function scoreFace(face: FaceBox, frameCenterX = 0.5): number {
  const horizontalOffset = Math.abs(face.centerX - frameCenterX)
  const centeredness = 1 - Math.min(1, horizontalOffset / 0.5)
  // Saturating: past SIZE_SATURATION_AREA a bigger face adds nothing, so a
  // person who steps closer cannot out-score someone who is properly centred.
  const sizeScore = Math.min(1, face.area / SIZE_SATURATION_AREA)
  const confidenceScore = Math.min(1, Math.max(0, face.score))
  return (
    CENTER_WEIGHT * centeredness + SIZE_WEIGHT * sizeScore + CONFIDENCE_WEIGHT * confidenceScore
  )
}

function getHandCenter(hand: HandData): { x: number; y: number } {
  const wrist = hand.landmarks[0]
  if (!wrist) return { x: 0.5, y: 0.5 }
  return { x: wrist[0], y: wrist[1] }
}

/**
 * Apparent size of a hand: wrist (landmark 0) to middle-finger MCP
 * (landmark 9) - the same reference ml/features.py normalises by, so a hand
 * measured here is directly comparable to a measured face.
 */
export function getHandScale(hand: HandData): number {
  const wrist = hand.landmarks[0]
  const mcp = hand.landmarks[9]
  if (!wrist || !mcp) return 0
  return Math.hypot(mcp[0] - wrist[0], mcp[1] - wrist[1])
}

/**
 * How badly a hand's apparent size disagrees with the size its owner's face
 * implies. Both shrink together with distance from the camera, so a large
 * mismatch means the hand and the face belong to people at different depths.
 */
export function depthMismatch(handScale: number, face: FaceBox, ratio: number): number {
  if (handScale <= 1e-6 || face.width <= 1e-6) return 0
  const expected = Math.max(1e-6, ratio * face.width)
  return Math.abs(Math.log(handScale / expected))
}

function pointInTorso(torso: TorsoRegion | null, point: { x: number; y: number }): boolean {
  if (!torso) return false
  return (
    point.x >= torso.centerX - torso.width / 2 &&
    point.x <= torso.centerX + torso.width / 2 &&
    point.y >= torso.topY &&
    point.y <= torso.bottomY
  )
}

function pointInReach(
  torso: TorsoRegion | null,
  face: FaceBox,
  point: { x: number; y: number },
): boolean {
  if (!torso) return false
  const halfWidth = (torso.width * REACH_WIDTH_MULTIPLIER) / 2
  const top = torso.topY - face.height * REACH_ABOVE_FACE
  const bottom = Math.min(1, torso.bottomY + face.height * REACH_BELOW_TORSO)
  return point.x >= torso.centerX - halfWidth && point.x <= torso.centerX + halfWidth &&
    point.y >= top && point.y <= bottom
}

function distanceToTorso(torso: TorsoRegion | null, point: { x: number; y: number }): number {
  if (!torso) return Infinity
  const clampedX = Math.max(
    torso.centerX - torso.width / 2,
    Math.min(torso.centerX + torso.width / 2, point.x),
  )
  const clampedY = Math.max(torso.topY, Math.min(torso.bottomY, point.y))
  return Math.hypot(point.x - clampedX, point.y - clampedY)
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/* ------------------------------------------------------------------ */
/* Tracker                                                             */
/* ------------------------------------------------------------------ */

interface FaceCandidate {
  face: FaceBox
  torso: TorsoRegion
  score: number
}

export class PrimaryUserTracker {
  private currentTrack: TrackedUser | null = null
  private frameCount = 0
  private nextTrackId = 1
  private debugMode = false
  private handTracks: HandTrack[] = []
  private nextHandTrackId = 1

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled
  }

  /**
   * One frame of the real pipeline.
   *
   * `hands` is every hand MediaPipe saw. The returned `primaryHands` is the
   * subset that may be sent to the classifier; when identity cannot be
   * established confidently it is empty, which the protocol already reads as
   * "no hand" rather than as stale landmarks.
   */
  async processFrame(
    faceDetector: FaceDetectorLike,
    video: VideoLike,
    hands: HandData[],
    timestamp: number,
  ): Promise<PrimaryUserResult> {
    this.frameCount++

    const faceResult = faceDetector.detectForVideo(video, timestamp)
    const rawDetections = faceResult.detections ?? []

    const allFaces: FaceBox[] = rawDetections
      .map((d) => convertFaceDetection(d, video.videoWidth, video.videoHeight))
      .filter((f) => f.area >= MIN_FACE_AREA_RATIO && f.area <= MAX_FACE_AREA_RATIO)

    const candidates: FaceCandidate[] = allFaces.map((face) => ({
      face,
      torso: estimateTorsoFromFace(face),
      score: scoreFace(face),
    }))
    const byScore = [...candidates].sort((a, b) => b.score - a.score)

    let selectedFace: FaceBox | null = null
    let selectedReason = 'no_faces'
    let isStable = false
    let trackAge = 0
    let primaryConfidence = 0

    /* ---------------- 1. identity ---------------- */
    if (byScore.length > 0) {
      const best = byScore[0]

      if (this.currentTrack) {
        const match = candidates.find((c) => this.facesMatch(this.currentTrack!.face, c.face))
        if (match) {
          // Incumbent is still visible: keep it. Identity does not move because
          // somebody else briefly scored higher on one frame.
          this.currentTrack.face = match.face
          this.currentTrack.estimatedTorso = match.torso
          this.currentTrack.lastSeenFrame = this.frameCount
          this.currentTrack.stabilityFrames++
          this.currentTrack.selectionConfidence = scoreFace(match.face)
          selectedFace = match.face
          selectedReason = 'track_continued'
        } else if (this.frameCount - this.currentTrack.lastSeenFrame <= MAX_LOST_FRAMES) {
          // Grace period: the face is momentarily undetected (blink, turn,
          // hand crossing the face) but identity is retained.
          selectedFace = this.currentTrack.face
          selectedReason = 'track_maintained_no_face'
        } else {
          this.currentTrack = null
        }
      }

      if (!this.currentTrack) {
        this.currentTrack = this.makeTrack(best.face, best.torso, allFaces)
        selectedFace = best.face
        selectedReason = 'new_track'
      }

      // Only reconsider identity when the incumbent has actually been lost.
      if (this.currentTrack && best && !this.facesMatch(this.currentTrack.face, best.face)) {
        const framesSinceSeen = this.frameCount - this.currentTrack.lastSeenFrame
        const incumbent = candidates.find((c) => this.facesMatch(this.currentTrack!.face, c.face))
        const incumbentScore = incumbent
          ? scoreFace(incumbent.face)
          : scoreFace(this.currentTrack.face)
        const beatsIncumbent = best.score > incumbentScore * SWITCH_FACTOR
        if (framesSinceSeen > MAX_LOST_FRAMES && beatsIncumbent) {
          this.currentTrack = this.makeTrack(best.face, best.torso, allFaces)
          selectedFace = best.face
          selectedReason = 'track_switched'
        }
      }
    } else if (this.currentTrack) {
      if (this.frameCount - this.currentTrack.lastSeenFrame <= MAX_LOST_FRAMES) {
        selectedFace = this.currentTrack.face
        selectedReason = 'track_maintained_no_detections'
      } else {
        this.currentTrack = null
        selectedReason = 'track_expired'
      }
    }

    if (this.currentTrack) {
      trackAge = this.currentTrack.stabilityFrames
      isStable = this.currentTrack.stabilityFrames >= MIN_STABILITY_FRAMES
      primaryConfidence = this.currentTrack.selectionConfidence
    }

    /* ---------------- 2. hand ownership ---------------- */
    // While the primary face is held through a detection dropout there is no
    // detection for it, so re-introduce it as a candidate. Without this, no hand
    // could ever be owned during a grace period and the signer would go silent
    // every time they blinked or turned their head.
    if (selectedFace && !candidates.some((c) => c.face === selectedFace)) {
      candidates.push({
        face: selectedFace,
        torso: this.currentTrack?.estimatedTorso ?? estimateTorsoFromFace(selectedFace),
        score: scoreFace(selectedFace),
      })
    }

    const handTrackOf = this.matchHandTracks(hands)
    const handAssociations: HandAssociation[] = new Array(hands.length)
    const primaryHands: HandData[] = []

    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i]
      const handTrack = handTrackOf[i]
      const center = getHandCenter(hand)
      const scale = getHandScale(hand)

      // Cheapest owner across EVERY face, not just the primary's.
      let owner: FaceCandidate | null = null
      let ownerCost = Infinity
      for (const candidate of candidates) {
        const ratio =
          candidate.face === selectedFace
            ? this.currentTrack?.handToFaceRatio ?? INITIAL_HAND_TO_FACE_RATIO
            : INITIAL_HAND_TO_FACE_RATIO
        const cost =
          distanceToTorso(candidate.torso, center) +
          DEPTH_OWNER_WEIGHT * depthMismatch(scale, candidate.face, ratio)
        if (cost < ownerCost) {
          ownerCost = cost
          owner = candidate
        }
      }

      const isPrimaryFace = !!owner && !!selectedFace && owner.face === selectedFace
      const distTorso = owner ? distanceToTorso(owner.torso, center) : Infinity
      const distFace = selectedFace ? distance(center, selectedFace) : Infinity
      const mismatch = owner
        ? depthMismatch(
            scale,
            owner.face,
            isPrimaryFace
              ? this.currentTrack?.handToFaceRatio ?? INITIAL_HAND_TO_FACE_RATIO
              : INITIAL_HAND_TO_FACE_RATIO,
          )
        : 0
      const inTorso = pointInTorso(owner?.torso ?? null, center)
      const inReach = owner ? pointInReach(owner.torso, owner.face, center) : false

      // Velocity is the step from this hand's LAST SEEN position. Gating on
      // `framesTracked` would always read 0, because the counter is only
      // incremented later in this same iteration.
      const previousPosition = handTrack?.positions[handTrack.positions.length - 1]
      const velocity = previousPosition ? distance(center, previousPosition) : 0
      const hadHistory = previousPosition !== undefined
      const wasPrimaryPrevFrame = handTrack?.wasPrimary ?? false

      let isPrimary = false
      let confidence = 0
      let reason = 'no_faces'

      // Apparent size must agree with the owning face REGARDLESS of geometry -
      // the torso test on its own cannot tell whose arm is in front of it. The
      // gate is only applied when somebody else is in frame to be confused with;
      // with a single face, geometry is enough and the learned ratio cannot
      // lock the user out.
      const contested = candidates.length > 1
      const settled = this.currentTrack
        ? Math.min(1, this.currentTrack.stabilityFrames / DEPTH_TOLERANCE_SETTLE_FRAMES)
        : 0
      const depthTolerance = contested
        ? DEPTH_TOLERANCE_CONTESTED +
          (DEPTH_TOLERANCE_SETTLED - DEPTH_TOLERANCE_CONTESTED) * settled
        : Number.POSITIVE_INFINITY
      const depthOk = mismatch <= depthTolerance

      if (!selectedFace || !this.currentTrack) {
        reason = 'no_primary_face'
      } else if (!isStable) {
        reason = 'identity_not_stable_yet'
      } else if (!isPrimaryFace) {
        reason = 'hand_belongs_to_another_person'
      } else if (!depthOk) {
        // Reachable, but the apparent size says it belongs to somebody else at
        // a different distance - the background-hand-crossing-centre case.
        reason = 'depth_mismatch'
      } else if (inTorso) {
        // Strongest evidence: inside the primary's own torso, at a size that is
        // plausible for that person.
        isPrimary = true
        confidence = 0.95
        reason = 'inside_primary_torso'
      } else if (inReach) {
        isPrimary = true
        confidence = 0.7
        reason = 'within_primary_reach'
      } else {
        reason = 'outside_primary_reach'
      }

      if (isPrimary && hadHistory) {
        confidence = Math.min(1, confidence + TRACK_STABILITY_BONUS)
      }

      if (isPrimary) {
        primaryHands.push(hand)
        this.adaptHandToFaceRatio(scale, owner!.face)
      }

      // Fold this frame into the hand's track so the next frame has real
      // velocity and continuity to work with. A detection that matched nothing
      // starts a fresh track and is reported under that new id.
      const track = handTrack
        ? (this.advanceHandTrack(handTrack, center, isPrimary), handTrack)
        : this.spawnHandTrack(center, isPrimary)

      handAssociations[i] = {
        hand,
        isPrimary,
        confidence,
        distanceFromFace: distFace,
        distanceFromTorso: distTorso,
        velocity,
        wasPrimaryPrevFrame,
        trackId: track.id,
        ownerFace: owner?.face ?? null,
        handScale: scale,
        depthMismatch: mismatch,
        reason,
      }
    }

    this.pruneHandTracks()

    const result: PrimaryUserResult = {
      primaryFace: selectedFace,
      primaryHands,
      allFaces,
      allHands: hands,
      handAssociations,
      isStable,
      primaryUserConfidence: primaryConfidence,
      debugInfo: {
        candidateCount: allFaces.length,
        selectedReason,
        trackAge,
        primaryConfidence,
        torsoRegion: this.currentTrack?.estimatedTorso ?? null,
      },
    }

    if (this.debugMode) {
      console.log('[PrimaryUserTracker]', {
        frame: this.frameCount,
        faces: allFaces.length,
        hands: hands.length,
        primaryHands: primaryHands.length,
        reason: selectedReason,
        stable: isStable,
        trackAge,
        trackId: this.currentTrack?.trackId,
        primaryConfidence,
        handAssociations: handAssociations.map((h) => ({
          handedness: h.hand.handedness,
          isPrimary: h.isPrimary,
          why: h.reason,
          confidence: h.confidence.toFixed(2),
          distTorso: h.distanceFromTorso.toFixed(2),
          depth: h.depthMismatch.toFixed(2),
        })),
      })
    }

    return result
  }

  private makeTrack(
    face: FaceBox,
    torso: TorsoRegion,
    allFaces: FaceBox[],
  ): TrackedUser {
    return {
      face,
      estimatedTorso: torso,
      faceIndex: allFaces.findIndex((f) => this.facesMatch(f, face)),
      lastSeenFrame: this.frameCount,
      trackId: this.nextTrackId++,
      stabilityFrames: 1,
      selectionConfidence: scoreFace(face),
      handToFaceRatio: INITIAL_HAND_TO_FACE_RATIO,
    }
  }

  /**
   * Slow running estimate of handScale/faceWidth for the primary person, learned
   * only from hands that are already confidently theirs. This keeps the depth
   * gate personalised rather than relying on a hard-coded body proportion.
   */
  private adaptHandToFaceRatio(handScale: number, face: FaceBox): void {
    if (!this.currentTrack || handScale <= 1e-6 || face.width <= 1e-6) return
    const observed = handScale / face.width
    const current = this.currentTrack.handToFaceRatio
    this.currentTrack.handToFaceRatio =
      current + (observed - current) * HAND_RATIO_ADAPT
  }

  /**
   * Match this frame's detections to existing hand tracks by nearest position.
   * A hand moves between frames, so an exact-position key never matches and the
   * whole temporal-consistency layer silently degrades to "always new".
   */
  private matchHandTracks(hands: HandData[]): Array<HandTrack | null> {
    const matched: Array<HandTrack | null> = new Array(hands.length).fill(null)
    const used = new Set<number>()

    const pairs: Array<{ handIndex: number; trackIndex: number; d: number }> = []
    for (let hi = 0; hi < hands.length; hi++) {
      const center = getHandCenter(hands[hi])
      for (let ti = 0; ti < this.handTracks.length; ti++) {
        const track = this.handTracks[ti]
        if (used.has(track.id)) continue
        const d = distance(center, { x: track.x, y: track.y })
        if (d <= HAND_MATCH_GATE) pairs.push({ handIndex: hi, trackIndex: ti, d })
      }
    }
    pairs.sort((a, b) => a.d - b.d)
    for (const pair of pairs) {
      const track = this.handTracks[pair.trackIndex]
      if (used.has(track.id)) continue
      used.add(track.id)
      matched[pair.handIndex] = track
    }
    return matched
  }

  /** Fold a matched detection forward so the next frame has real continuity. */
  private advanceHandTrack(
    track: HandTrack,
    center: { x: number; y: number },
    isPrimary: boolean,
  ): void {
    track.x = center.x
    track.y = center.y
    track.wasPrimary = isPrimary
    track.framesTracked += 1
    track.lastSeenFrame = this.frameCount
    track.positions = [...track.positions, center].slice(-HAND_HISTORY_LENGTH)
  }

  /** A detection that matched no existing track starts a new one. */
  private spawnHandTrack(center: { x: number; y: number }, isPrimary: boolean): HandTrack {
    const track: HandTrack = {
      id: this.nextHandTrackId++,
      x: center.x,
      y: center.y,
      wasPrimary: isPrimary,
      framesTracked: 1,
      lastSeenFrame: this.frameCount,
      positions: [center],
    }
    this.handTracks.push(track)
    return track
  }

  /**
   * Drop any track not touched during this frame. Keyed on the frame stamp
   * rather than on the match list, so a track created earlier in the same frame
   * is not immediately mistaken for an abandoned one.
   */
  private pruneHandTracks(): void {
    this.handTracks = this.handTracks.filter((t) => t.lastSeenFrame === this.frameCount)
  }

  private facesMatch(faceA: FaceBox, faceB: FaceBox): boolean {
    const x1 = Math.max(faceA.x, faceB.x)
    const y1 = Math.max(faceA.y, faceB.y)
    const x2 = Math.min(faceA.x + faceA.width, faceB.x + faceB.width)
    const y2 = Math.min(faceA.y + faceA.height, faceB.y + faceB.height)
    if (x2 <= x1 || y2 <= y1) return false
    const intersection = (x2 - x1) * (y2 - y1)
    const areaA = faceA.width * faceA.height
    const areaB = faceB.width * faceB.height
    const union = areaA + areaB - intersection
    return intersection / union > FACE_IOU_THRESHOLD
  }

  reset() {
    this.currentTrack = null
    this.frameCount = 0
    this.nextTrackId = 1
    this.nextHandTrackId = 1
    this.handTracks = []
  }

  getTrackInfo() {
    return {
      hasTrack: !!this.currentTrack,
      trackId: this.currentTrack?.trackId,
      stabilityFrames: this.currentTrack?.stabilityFrames ?? 0,
      lastSeenFrame: this.currentTrack?.lastSeenFrame ?? 0,
      handTrackCount: this.handTracks.length,
      frameCount: this.frameCount,
    }
  }
}

export const primaryUserTracker = new PrimaryUserTracker()