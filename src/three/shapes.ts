/**
 * Procedural particle shape generators.
 *
 * Every generator returns a Float32Array of length COUNT * 3 (xyz per particle).
 * Because every shape has exactly the same particle count, particle `i` in one
 * shape maps 1:1 to particle `i` in the next, which is what lets the vertex
 * shader `mix(position, aTargetPosition, uMorph)` between any two shapes.
 *
 * All math is deterministic per seed so the buffers are stable across reloads.
 */

export const COUNT = 24000

const TAU = Math.PI * 2
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ≈ 2.39996 rad

/** Small deterministic PRNG (mulberry32) so shapes are identical every run. */
function createRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Gaussian (normal) sample via Box–Muller. */
function gaussian(rng: () => number) {
  const u = Math.max(rng(), 1e-9)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v)
}

/** Per-shape tuning that the shader interpolates between during a morph. */
export type Vec3 = [number, number, number]

export interface ShapeMeta {
  /** radians/sec of continuous rotation around `spinAxis` */
  spin: number
  /** axis the shape rotates around (e.g. the ring's own normal) */
  spinAxis: Vec3
  /** how much mid-frequency noise wobble to apply */
  noiseAmp: number
  /** how far bass pushes particles along their displacement direction */
  radialAmp: number
  /** fixed displacement direction (used when dirBias > 0, e.g. terrain normal) */
  dispDir: Vec3
  /** 0 = displace radially from origin, 1 = displace along `dispDir` */
  dirBias: number
  /** base point size multiplier */
  pointScale: number
}

/** Rotate a Float32Array of xyz triplets around the X axis (in place). */
function rotateX(buffer: Float32Array, angle: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  for (let i = 0; i < buffer.length; i += 3) {
    const y = buffer[i + 1]
    const z = buffer[i + 2]
    buffer[i + 1] = y * c - z * s
    buffer[i + 2] = y * s + z * c
  }
}

export interface ParticleShape {
  id: string
  label: string
  positions: Float32Array
  meta: ShapeMeta
}

/* -------------------------------------------------------------------------- */
/*  1. AMBIENT FIELD – flowing ribbons of dust (default / "Particle Field")   */
/* -------------------------------------------------------------------------- */
export function generateAmbientField(count = COUNT): Float32Array {
  const rng = createRng(1337)
  const out = new Float32Array(count * 3)

  // Three overlapping ribbons with different phase, amplitude and depth.
  const ribbons = [
    { phase: 0.0, amp: 0.9, freq: 0.75, z: 0.0, thickness: 0.35 },
    { phase: 2.1, amp: 0.7, freq: 1.1, z: -0.8, thickness: 0.28 },
    { phase: 4.4, amp: 1.1, freq: 0.55, z: 0.7, thickness: 0.4 },
  ]

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    const ribbon = ribbons[i % ribbons.length]

    // Spread along X using a slightly non-uniform distribution so the
    // centre is denser (matches the reference image's bright core).
    const u = rng()
    const x = (u - 0.5) * 11.5 * (0.7 + 0.3 * Math.abs(gaussian(rng)) * 0.5)

    // Layered sine ribbon
    const wave =
      Math.sin(x * ribbon.freq + ribbon.phase) * ribbon.amp +
      Math.sin(x * ribbon.freq * 2.3 + ribbon.phase * 1.7) * ribbon.amp * 0.25

    // Gaussian scatter around the ribbon for a soft, dusty look
    const y = wave + gaussian(rng) * ribbon.thickness
    const z = ribbon.z + gaussian(rng) * 0.9

    out[i3] = x
    out[i3 + 1] = y
    out[i3 + 2] = z
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  2. ORB – Fibonacci lattice sphere with a thin volumetric shell            */
/* -------------------------------------------------------------------------- */
export function generateOrb(count = COUNT, radius = 2.0): Float32Array {
  const rng = createRng(4242)
  const out = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    const i3 = i * 3

    // Fibonacci lattice: evenly distributed points on the unit sphere.
    const y = 1 - (i / (count - 1)) * 2 // -1 .. 1
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = GOLDEN_ANGLE * i

    // ~85 % of particles form the shell, ~15 % fill the interior as a glow core.
    const isCore = rng() < 0.15
    const r = isCore
      ? radius * Math.cbrt(rng()) * 0.8 // uniform volume distribution
      : radius * (0.94 + rng() * 0.08) // thin shell with slight thickness

    out[i3] = Math.cos(theta) * ringRadius * r
    out[i3 + 1] = y * r
    out[i3 + 2] = Math.sin(theta) * ringRadius * r
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  3. ROTATING RING – tilted torus with a faint inner vinyl disc              */
/* -------------------------------------------------------------------------- */
/** Tilt (radians about X) applied to the ring so the camera sees an ellipse. */
export const RING_TILT = 0.6

export function generateRing(
  count = COUNT,
  majorRadius = 2.3,
  tubeRadius = 0.2,
): Float32Array {
  const rng = createRng(9001)
  const out = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    const i3 = i * 3

    // Use the golden angle for the main angle to avoid visible banding.
    const angle = (i * GOLDEN_ANGLE) % TAU

    let x: number, y: number, z: number

    if (i % 5 === 0) {
      // 20 % → flat "vinyl" disc with faint grooves inside the ring
      const r = majorRadius * (0.35 + 0.6 * Math.sqrt(rng()))
      x = Math.cos(angle) * r
      y = gaussian(rng) * 0.02
      z = Math.sin(angle) * r
    } else {
      // 80 % → filled torus tube (parametric torus equation)
      const tubeAngle = rng() * TAU
      const tubeR = tubeRadius * Math.sqrt(rng()) // fill the tube, not just its skin
      const ringX = majorRadius + Math.cos(tubeAngle) * tubeR
      x = Math.cos(angle) * ringX
      y = Math.sin(tubeAngle) * tubeR
      z = Math.sin(angle) * ringX
    }

    out[i3] = x
    out[i3 + 1] = y
    out[i3 + 2] = z
  }

  rotateX(out, RING_TILT)
  return out
}

/* -------------------------------------------------------------------------- */
/*  4. TERRAIN GRID – heightmap made from layered sines (fBm-like)            */
/* -------------------------------------------------------------------------- */
/** Tilt (radians about X) so the camera looks down onto the terrain. */
export const TERRAIN_TILT = 0.8

export function generateTerrain(count = COUNT): Float32Array {
  const out = new Float32Array(count * 3)

  const cols = 160
  const rows = Math.ceil(count / cols) // 150 rows for 24 000 points
  const width = 8.5
  const depth = 6.0

  const height = (x: number, z: number) => {
    // Cheap value-noise substitute: sum of rotated sines at several octaves.
    let h = 0
    h += Math.sin(x * 0.6 + z * 0.4) * 0.6
    h += Math.sin(x * 1.3 - z * 0.9 + 1.7) * 0.32
    h += Math.sin(x * 2.7 + z * 2.2 + 4.1) * 0.14
    h += Math.sin(x * 5.1 - z * 4.3 + 2.3) * 0.06
    return h
  }

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    const col = i % cols
    const row = Math.floor(i / cols)

    const x = (col / (cols - 1) - 0.5) * width
    const z = (row / (rows - 1) - 0.5) * depth

    out[i3] = x
    out[i3 + 1] = height(x, z)
    out[i3 + 2] = z
  }

  // Tip the whole plane toward the camera so we see the heightmap from above.
  rotateX(out, TERRAIN_TILT)
  return out
}

/* -------------------------------------------------------------------------- */
/*  5. EXPLOSION – starburst of spikes plus a volumetric dust halo             */
/* -------------------------------------------------------------------------- */
export function generateExplosion(count = COUNT, maxRadius = 3.0): Float32Array {
  const rng = createRng(777)
  const out = new Float32Array(count * 3)

  // Pre-compute ~90 spike directions on the unit sphere (Fibonacci again).
  const spikeCount = 90
  const spikes: number[][] = []
  for (let s = 0; s < spikeCount; s++) {
    const y = 1 - (s / (spikeCount - 1)) * 2
    const rr = Math.sqrt(1 - y * y)
    const th = GOLDEN_ANGLE * s
    spikes.push([Math.cos(th) * rr, y, Math.sin(th) * rr])
  }

  for (let i = 0; i < count; i++) {
    const i3 = i * 3

    if (rng() < 0.72) {
      // Spike particle: travel along a spike direction with a little spread.
      const dir = spikes[Math.floor(rng() * spikeCount)]
      const t = Math.pow(rng(), 0.8) // bias toward the tips
      const r = 0.25 + t * maxRadius
      const spread = 0.03 + t * 0.07 // spikes fan out slightly toward the tip
      out[i3] = dir[0] * r + gaussian(rng) * spread
      out[i3 + 1] = dir[1] * r + gaussian(rng) * spread
      out[i3 + 2] = dir[2] * r + gaussian(rng) * spread
    } else {
      // Halo dust: random direction, radius biased toward the core.
      const theta = rng() * TAU
      const phi = Math.acos(2 * rng() - 1)
      const r = maxRadius * 0.7 * Math.pow(rng(), 2.2)
      out[i3] = Math.sin(phi) * Math.cos(theta) * r
      out[i3 + 1] = Math.cos(phi) * r
      out[i3 + 2] = Math.sin(phi) * Math.sin(theta) * r
    }
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  Shape registry (order = scroll order)                                     */
/* -------------------------------------------------------------------------- */
export function createShapes(): ParticleShape[] {
  const Y: Vec3 = [0, 1, 0]
  // Normal of a plane originally facing +Y after rotateX(angle)
  const tiltedNormal = (angle: number): Vec3 => [0, Math.cos(angle), Math.sin(angle)]

  return [
    {
      id: 'field',
      label: 'Particle Field',
      positions: generateAmbientField(),
      meta: {
        spin: 0.0,
        spinAxis: Y,
        noiseAmp: 0.55,
        radialAmp: 0.35,
        dispDir: Y,
        dirBias: 0.6,
        pointScale: 1.0,
      },
    },
    {
      id: 'orb',
      label: 'Fluid Orb',
      positions: generateOrb(COUNT, 1.75),
      meta: {
        spin: 0.12,
        spinAxis: Y,
        noiseAmp: 0.45,
        radialAmp: 0.65,
        dispDir: Y,
        dirBias: 0.0,
        pointScale: 1.0,
      },
    },
    {
      id: 'ring',
      label: 'Sound Ring',
      positions: generateRing(),
      meta: {
        spin: 0.5,
        spinAxis: tiltedNormal(RING_TILT), // spin in its own plane
        noiseAmp: 0.3,
        radialAmp: 0.45,
        dispDir: Y,
        dirBias: 0.0,
        pointScale: 1.0,
      },
    },
    {
      id: 'terrain',
      label: 'Terrain Grid',
      positions: generateTerrain(),
      meta: {
        spin: 0.0,
        spinAxis: Y,
        noiseAmp: 0.8,
        radialAmp: 0.8,
        dispDir: tiltedNormal(TERRAIN_TILT), // heave along the tilted surface normal
        dirBias: 1.0,
        pointScale: 0.9,
      },
    },
    {
      id: 'explosion',
      label: 'Explosion Mode',
      positions: generateExplosion(),
      meta: {
        spin: 0.18,
        spinAxis: [0.3, 1, 0.15],
        noiseAmp: 0.3,
        radialAmp: 1.5,
        dispDir: Y,
        dirBias: 0.0,
        pointScale: 1.05,
      },
    },
  ]
}

/** Per-particle random values (vec3) used for size, colour and stagger. */
export function generateRandoms(count = COUNT): Float32Array {
  const rng = createRng(2024)
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count * 3; i++) out[i] = rng()
  return out
}
