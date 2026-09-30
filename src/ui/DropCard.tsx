interface Props {
  onUpload: () => void
  onPreset: () => void
  dragging: boolean
}

export function DropCard({ onUpload, onPreset, dragging }: Props) {
  return (
    <div className={`drop-card ${dragging ? 'drop-card--active' : ''}`}>
      <p className="drop-card__title">{dragging ? 'RELEASE TO LOAD' : 'DROP YOUR MUSIC'}</p>

      <button className="drop-card__button" onClick={onUpload} type="button">
        <span>PLAY / UPLOAD</span>
        <svg className="drop-card__cursor" viewBox="0 0 24 24" width="14" height="14" aria-hidden>
          <path
            d="M6 3l12 8-5 1.5L15.5 20l-2.5 1-2.5-7.5L6 16z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <button className="drop-card__preset" onClick={onPreset} type="button">
        OR START WITH A PRESET TRACK...
      </button>
    </div>
  )
}
