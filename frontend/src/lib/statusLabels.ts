import type { CameraStatus } from '../hooks/useWebcam'

/**
 * Maps real webcam state to a human label. Nothing here is simulated — each
 * string corresponds to a state produced by `useWebcam`.
 */
export function cameraLabel(status: CameraStatus): string {
  switch (status) {
    case 'idle':
      return 'Camera off'
    case 'requesting':
      return 'Requesting permission'
    case 'active':
      return 'Camera ready'
    case 'denied':
      return 'Permission denied'
    case 'unavailable':
      return 'No camera found'
    default:
      return 'Camera error'
  }
}

export function cameraTone(
  status: CameraStatus,
): 'ok' | 'warn' | 'danger' | 'neutral' {
  switch (status) {
    case 'active':
      return 'ok'
    case 'requesting':
      return 'warn'
    case 'denied':
    case 'unavailable':
    case 'error':
      return 'danger'
    default:
      return 'neutral'
  }
}

export type BackendState = 'checking' | 'online' | 'offline'

export function socketLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'Backend connected'
    case 'connecting':
      return 'Connecting'
    case 'error':
      return 'Backend connection error'
    case 'closed':
      return 'Backend disconnected'
    default:
      return 'Backend idle'
  }
}

export type RecStatus = 'idle' | 'loading-model' | 'running' | 'paused' | 'error'

export function recognitionLabel(status: RecStatus): string {
  switch (status) {
    case 'running':
      return 'Recognition active'
    case 'paused':
      return 'Recognition waiting'
    case 'loading-model':
      return 'Loading model'
    case 'error':
      return 'Recognition error'
    default:
      return 'Recognition off'
  }
}

export function recognitionTone(status: RecStatus): 'ok' | 'warn' | 'danger' | 'neutral' {
  switch (status) {
    case 'running':
      return 'ok'
    case 'paused':
    case 'loading-model':
      return 'warn'
    case 'error':
      return 'danger'
    default:
      return 'neutral'
  }
}