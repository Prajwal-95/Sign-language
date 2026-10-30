import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error'
export interface WebcamError { kind: string; message: string }
export interface UseWebcamOptions { width?: number; height?: number }

function toWebcamError(err: unknown): WebcamError {
  if (!(err instanceof DOMException)) return { kind: 'unknown', message: 'Something went wrong while starting the camera. Please try again.' }
  switch (err.name) {
    case 'NotAllowedError': case 'SecurityError':
      return { kind: 'permission-denied', message: 'Camera permission was denied. Allow camera access and press Start Camera again.' }
    case 'NotFoundError': case 'OverconstrainedError':
      return { kind: 'no-camera', message: 'No webcam was found on this device. Connect one and try again.' }
    case 'NotReadableError':
      return { kind: 'in-use', message: 'The camera is being used by another application. Close that app and try again.' }
    default:
      return { kind: 'unknown', message: `Camera error (${err.name}). Check browser settings and try again.` }
  }
}

export function useWebcam(options: UseWebcamOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<WebcamError | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setError(null)
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError({ kind: 'unsupported', message: 'This browser does not support camera access. Use a recent Chrome, Edge, or Firefox.' })
      setStatus('error')
      return
    }
    setError(null)
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: options.width ?? 640 },
          height: { ideal: options.height ?? 480 },
        },
      })
      streamRef.current = stream
      // The <video> element may not be mounted yet (it mounts when status
      // becomes 'active'); the effect below attaches the stream after mount.
      // If it IS mounted (restart case), attach immediately too.
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        void videoRef.current.play().catch(() => undefined)
      }
      setStatus('active')
    } catch (err) {
      const we = toWebcamError(err)
      setError(we)
      if (we.kind === 'permission-denied') setStatus('denied')
      else if (we.kind === 'no-camera') setStatus('unavailable')
      else setStatus('error')
    }
  }, [options.height, options.width])

  // Attach the live stream to the video element AFTER it mounts.
  useEffect(() => {
    if (status !== 'active') return
    const video = videoRef.current
    if (video && streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current
      void video.play().catch(() => undefined)
    }
  }, [status])

  // Stop the camera when the component unmounts.
  useEffect(() => () => stop(), [stop])

  return { videoRef, status, error, start, stop }
}
