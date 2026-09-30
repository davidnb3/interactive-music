/**
 * Morph controller – lives outside React because it changes every frame.
 *
 * `progress` is a continuous value in [0, shapeCount - 1].
 *   floor(progress) → index of the `position` shape
 *   fract(progress) → uMorph passed to the shader
 *
 * Both the scroll wheel and the mode buttons write to `target`; the particle
 * system eases `progress` toward `target` each frame.
 */
export const morph = {
  progress: 0,
  target: 0,
  shapeCount: 1,

  setShapeCount(n: number) {
    this.shapeCount = Math.max(1, n)
    this.clamp()
  },

  /** Jump the target to an exact shape (used by the mode switcher). */
  goTo(index: number) {
    this.target = index
    this.clamp()
  },

  /** Nudge the target by a scroll delta (used by wheel/touch). */
  scrollBy(delta: number) {
    this.target += delta
    this.clamp()
  },

  /** Snap the target to the nearest whole shape (called after scrolling stops). */
  snap() {
    this.target = Math.round(this.target)
    this.clamp()
  },

  clamp() {
    const max = this.shapeCount - 1
    this.target = Math.min(max, Math.max(0, this.target))
  },
}
