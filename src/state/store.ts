import { create } from 'zustand'

export type PlayState = 'idle' | 'loading' | 'playing' | 'paused'

export interface Track {
  id: string
  title: string
  artist: string
  kind: 'file' | 'preset'
  /** Object URL for uploaded files */
  url?: string
}

interface AppState {
  tracks: Track[]
  currentIndex: number
  playState: PlayState
  /** Index of the shape closest to the current morph progress */
  activeShape: number
  /** Total number of shapes (set once by the particle system) */
  shapeCount: number
  /** Whether the user is dragging a file over the window */
  dragging: boolean
  /** Whether the centre "drop your music" card is visible */
  showDropCard: boolean

  addTracks: (tracks: Track[], autoplayIndex?: number) => void
  selectTrack: (index: number) => void
  nextTrack: () => void
  prevTrack: () => void
  setPlayState: (s: PlayState) => void
  setActiveShape: (i: number) => void
  setShapeCount: (n: number) => void
  setDragging: (d: boolean) => void
  setShowDropCard: (v: boolean) => void
}

export const PRESET_TRACK: Track = {
  id: 'preset-nebula-drift',
  title: 'Nebula Drift',
  artist: 'J.Doe',
  kind: 'preset',
}

export const useStore = create<AppState>((set, get) => ({
  tracks: [],
  currentIndex: -1,
  playState: 'idle',
  activeShape: 0,
  shapeCount: 1,
  dragging: false,
  showDropCard: true,

  addTracks: (incoming, autoplayIndex) => {
    const existing = get().tracks
    // Avoid duplicating the preset entry
    const merged = [...existing]
    for (const t of incoming) if (!merged.some((m) => m.id === t.id)) merged.push(t)
    const idx =
      autoplayIndex !== undefined
        ? autoplayIndex
        : merged.findIndex((m) => m.id === incoming[0]?.id)
    set({ tracks: merged, currentIndex: idx, showDropCard: false })
  },

  selectTrack: (index) => {
    const { tracks } = get()
    if (index < 0 || index >= tracks.length) return
    set({ currentIndex: index, showDropCard: false })
  },

  nextTrack: () => {
    const { tracks, currentIndex } = get()
    if (tracks.length === 0) return
    set({ currentIndex: (currentIndex + 1) % tracks.length })
  },

  prevTrack: () => {
    const { tracks, currentIndex } = get()
    if (tracks.length === 0) return
    set({ currentIndex: (currentIndex - 1 + tracks.length) % tracks.length })
  },

  setPlayState: (playState) => set({ playState }),
  setActiveShape: (activeShape) => set({ activeShape }),
  setShapeCount: (shapeCount) => set({ shapeCount }),
  setDragging: (dragging) => set({ dragging }),
  setShowDropCard: (showDropCard) => set({ showDropCard }),
}))
