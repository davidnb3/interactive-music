import { useStore } from '../state/store'
import { Waveform } from './Waveform'

interface Props {
  onToggle: () => void
  onNext: () => void
  onPrev: () => void
  onUpload: () => void
}

export function PlayerCard({ onToggle, onNext, onPrev, onUpload }: Props) {
  const tracks = useStore((s) => s.tracks)
  const currentIndex = useStore((s) => s.currentIndex)
  const playState = useStore((s) => s.playState)

  const track = tracks[currentIndex]
  const hasTrack = !!track
  const isPlaying = playState === 'playing'

  const statusLabel =
    playState === 'playing'
      ? 'Playing'
      : playState === 'paused'
        ? 'Paused'
        : playState === 'loading'
          ? 'Loading'
          : 'No track'

  return (
    <div className="player">
      <div className="player__info">
        <p className="player__title">
          {hasTrack ? `${track.title} - ${track.artist}` : 'Waiting for audio'}
        </p>
        <div className="player__row">
          <span className={`player__status ${isPlaying ? 'player__status--live' : ''}`}>
            [{statusLabel}]
          </span>
          <Waveform active={isPlaying} />
        </div>
      </div>

      <div className="player__controls">
        <button
          className="player__btn"
          onClick={onPrev}
          disabled={tracks.length < 2}
          aria-label="Previous track"
          type="button"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d="M6 5v14M18 5l-9 7 9 7z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        <button
          className="player__btn player__btn--main"
          onClick={hasTrack ? onToggle : onUpload}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          type="button"
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
              <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
              <path d="M7 5l12 7-12 7z" fill="currentColor" />
            </svg>
          )}
        </button>

        <button
          className="player__btn"
          onClick={onNext}
          disabled={tracks.length < 2}
          aria-label="Next track"
          type="button"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d="M18 5v14M6 5l9 7-9 7z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
