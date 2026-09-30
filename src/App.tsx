import { useCallback, useEffect, useRef } from 'react'
import { Scene } from './three/Scene'
import { Header } from './ui/Header'
import { DropCard } from './ui/DropCard'
import { PlayerCard } from './ui/PlayerCard'
import { ModeSwitcher } from './ui/ModeSwitcher'
import { audioEngine } from './audio/AudioEngine'
import { morph } from './state/morph'
import { PRESET_TRACK, useStore, type Track } from './state/store'

function fileToTrack(file: File): Track {
  const base = file.name.replace(/\.[^.]+$/, '')
  // "Artist - Title" naming convention → split, otherwise use "Local File"
  const parts = base.split(/\s[-–]\s/)
  const [artist, title] = parts.length >= 2 ? [parts[0], parts.slice(1).join(' - ')] : ['Local File', base]
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    title: title.trim(),
    artist: artist.trim(),
    kind: 'file',
    url: URL.createObjectURL(file),
  }
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const tracks = useStore((s) => s.tracks)
  const currentIndex = useStore((s) => s.currentIndex)
  const playState = useStore((s) => s.playState)
  const dragging = useStore((s) => s.dragging)
  const showDropCard = useStore((s) => s.showDropCard)
  const addTracks = useStore((s) => s.addTracks)
  const nextTrack = useStore((s) => s.nextTrack)
  const prevTrack = useStore((s) => s.prevTrack)
  const setPlayState = useStore((s) => s.setPlayState)
  const setDragging = useStore((s) => s.setDragging)
  const setShowDropCard = useStore((s) => s.setShowDropCard)

  /* ------------------------------ track loading ----------------------------- */

  const currentTrack = tracks[currentIndex]
  useEffect(() => {
    if (!currentTrack) return
    let cancelled = false
    setPlayState('loading')
    audioEngine
      .loadTrack(currentTrack)
      .then(() => !cancelled && setPlayState('playing'))
      .catch((err) => {
        console.error('Failed to load track', err)
        if (!cancelled) setPlayState('paused')
      })
    return () => {
      cancelled = true
    }
  }, [currentTrack, setPlayState])

  useEffect(() => {
    audioEngine.onEnded = () => {
      const { tracks: t } = useStore.getState()
      if (t.length > 1) nextTrack()
      else audioEngine.play() // single track → loop
    }
    return () => {
      audioEngine.onEnded = null
    }
  }, [nextTrack])

  /* -------------------------------- actions --------------------------------- */

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const audioFiles = Array.from(files).filter(
        (f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(f.name),
      )
      if (audioFiles.length === 0) return
      addTracks(audioFiles.map(fileToTrack))
    },
    [addTracks],
  )

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), [])

  const playPreset = useCallback(() => {
    const idx = useStore.getState().tracks.findIndex((t) => t.id === PRESET_TRACK.id)
    if (idx >= 0) useStore.getState().selectTrack(idx)
    else addTracks([PRESET_TRACK])
  }, [addTracks])

  const togglePlayback = useCallback(async () => {
    if (!useStore.getState().tracks[useStore.getState().currentIndex]) return
    if (audioEngine.isPlaying) {
      audioEngine.pause()
      setPlayState('paused')
    } else {
      await audioEngine.play()
      setPlayState('playing')
    }
  }, [setPlayState])

  /* ----------------------------- drag & drop -------------------------------- */

  useEffect(() => {
    let depth = 0
    const onEnter = (e: DragEvent) => {
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const onLeave = (e: DragEvent) => {
      e.preventDefault()
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [handleFiles, setDragging])

  /* --------------------------- scroll → morph ------------------------------- */

  useEffect(() => {
    let snapTimer = 0
    const onWheel = (e: WheelEvent) => {
      // Normalise deltaMode (pixels vs lines)
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      morph.scrollBy(delta * 0.0022)
      window.clearTimeout(snapTimer)
      snapTimer = window.setTimeout(() => morph.snap(), 220)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.clearTimeout(snapTimer)
    }
  }, [])

  // Touch swipe support for the same gesture
  useEffect(() => {
    let lastY: number | null = null
    let snapTimer = 0
    const onStart = (e: TouchEvent) => {
      lastY = e.touches[0]?.clientY ?? null
    }
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY
      if (lastY === null || y === undefined) return
      morph.scrollBy((lastY - y) * 0.006)
      lastY = y
      window.clearTimeout(snapTimer)
      snapTimer = window.setTimeout(() => morph.snap(), 220)
    }
    const onEnd = () => {
      lastY = null
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [])

  /* ------------------------------ keyboard ---------------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          void togglePlayback()
          break
        case 'ArrowRight':
        case 'ArrowDown':
          morph.goTo(Math.round(morph.target) + 1)
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          morph.goTo(Math.round(morph.target) - 1)
          break
        case 'KeyU':
          openFilePicker()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlayback, openFilePicker])

  /* -------------------------------- render ---------------------------------- */

  const hasTrack = !!currentTrack

  return (
    <div className={`app ${dragging ? 'app--dragging' : ''}`}>
      <Scene />

      <div className="ui">
        <Header />

        {(showDropCard || dragging) && (
          <div className="center">
            <DropCard onUpload={openFilePicker} onPreset={playPreset} dragging={dragging} />
          </div>
        )}

        {!showDropCard && !dragging && hasTrack && (
          <button
            className="add-track"
            onClick={() => setShowDropCard(true)}
            type="button"
            aria-label="Add music"
          >
            + add music
          </button>
        )}

        <PlayerCard
          onToggle={togglePlayback}
          onNext={nextTrack}
          onPrev={prevTrack}
          onUpload={openFilePicker}
        />

        <ModeSwitcher />

        <p className="hint">
          scroll · swipe · ← → to morph &nbsp;|&nbsp; space to {playState === 'playing' ? 'pause' : 'play'}
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
