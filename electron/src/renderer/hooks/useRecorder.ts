import { useState, useRef, useCallback } from 'react'

export type RecordingMode = 'mic' | 'system' | 'both'

interface UseRecorderReturn {
  isRecording: boolean
  duration: number
  startRecording: (mode?: RecordingMode) => Promise<void>
  stopRecording: () => Promise<Blob | null>
}

/**
 * Mix multiple audio streams into one using Web Audio API.
 * Returns { stream, cleanup } where cleanup stops all source tracks.
 */
function mixAudioStreams(streams: MediaStream[]): { stream: MediaStream; cleanup: () => void } {
  const audioCtx = new AudioContext()
  const destination = audioCtx.createMediaStreamDestination()

  for (const s of streams) {
    const source = audioCtx.createMediaStreamSource(s)
    source.connect(destination)
  }

  const cleanup = () => {
    for (const s of streams) {
      s.getTracks().forEach((t) => t.stop())
    }
    audioCtx.close()
  }

  return { stream: destination.stream, cleanup }
}

export function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const cleanupRef = useRef<(() => void) | null>(null)

  const startRecording = useCallback(async (mode: RecordingMode = 'mic') => {
    let stream: MediaStream

    if (mode === 'mic') {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } else if (mode === 'system') {
      // getDisplayMedia with audio captures system audio (WASAPI loopback on Windows)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1, height: 1, frameRate: 1 }, // minimal video (required by API)
      })
      // Drop the video track — we only want audio
      displayStream.getVideoTracks().forEach((t) => t.stop())
      const audioTracks = displayStream.getAudioTracks()
      if (audioTracks.length === 0) {
        throw new Error('No system audio track available. Make sure you selected "Share audio" in the dialog.')
      }
      stream = new MediaStream(audioTracks)
      cleanupRef.current = () => audioTracks.forEach((t) => t.stop())
    } else {
      // Both: mix mic + system audio
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1, height: 1, frameRate: 1 },
      })
      displayStream.getVideoTracks().forEach((t) => t.stop())
      const systemAudioTracks = displayStream.getAudioTracks()
      if (systemAudioTracks.length === 0) {
        // Fall back to mic-only if no system audio
        stream = micStream
        cleanupRef.current = () => micStream.getTracks().forEach((t) => t.stop())
      } else {
        const systemStream = new MediaStream(systemAudioTracks)
        const mixed = mixAudioStreams([micStream, systemStream])
        stream = mixed.stream
        cleanupRef.current = mixed.cleanup
      }
    }

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    })

    chunksRef.current = []
    mediaRecorderRef.current = mediaRecorder

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    mediaRecorder.start(1000)
    startTimeRef.current = Date.now()
    setIsRecording(true)
    setDuration(0)

    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 500)
  }, [])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(null)
        return
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        mediaRecorder.stream.getTracks().forEach((t) => t.stop())
        cleanupRef.current?.()
        cleanupRef.current = null
        if (timerRef.current) clearInterval(timerRef.current)
        setIsRecording(false)
        resolve(blob)
      }

      mediaRecorder.stop()
    })
  }, [])

  return { isRecording, duration, startRecording, stopRecording }
}
