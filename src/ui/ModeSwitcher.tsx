import { morph } from '../state/morph'
import { useStore } from '../state/store'

const MODES = ['Particle Field', 'Fluid Orb', 'Sound Ring', 'Terrain Grid', 'Explosion Mode']

export function ModeSwitcher() {
  const activeShape = useStore((s) => s.activeShape)
  const shapeCount = useStore((s) => s.shapeCount)

  return (
    <nav className="modes" aria-label="Visualizer mode">
      {MODES.slice(0, shapeCount).map((label, i) => (
        <button
          key={label}
          className={`modes__btn ${i === activeShape ? 'modes__btn--active' : ''}`}
          onClick={() => morph.goTo(i)}
          type="button"
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
