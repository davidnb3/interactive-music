import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import vertexShader from './shaders/particles.vert.glsl?raw'
import fragmentShader from './shaders/particles.frag.glsl?raw'
import { COUNT, createShapes, generateRandoms, type ShapeMeta, type Vec3 } from './shapes'
import { morph } from '../state/morph'
import { useStore } from '../state/store'
import { audioEngine } from '../audio/AudioEngine'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function lerpVec3(out: THREE.Vector3, a: Vec3, b: Vec3, t: number) {
  out.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t))
  // Guard against the two axes cancelling out mid‑morph
  if (out.lengthSq() < 1e-6) out.set(0, 1, 0)
  return out
}

function applyMeta(
  u: Record<string, { value: number | THREE.Vector3 | THREE.Color }>,
  a: ShapeMeta,
  b: ShapeMeta,
  t: number,
) {
  u.uSpin.value = lerp(a.spin, b.spin, t)
  u.uNoiseAmp.value = lerp(a.noiseAmp, b.noiseAmp, t)
  u.uRadialAmp.value = lerp(a.radialAmp, b.radialAmp, t)
  u.uDirBias.value = lerp(a.dirBias, b.dirBias, t)
  u.uPointScale.value = lerp(a.pointScale, b.pointScale, t)
  lerpVec3(u.uSpinAxis.value as THREE.Vector3, a.spinAxis, b.spinAxis, t)
  lerpVec3(u.uDispDir.value as THREE.Vector3, a.dispDir, b.dispDir, t)
}

export function ParticleField() {
  const pointsRef = useRef<THREE.Points>(null)
  const { gl } = useThree()
  const setActiveShape = useStore((s) => s.setActiveShape)
  const setShapeCount = useStore((s) => s.setShapeCount)

  // Generate every procedural shape once.
  const shapes = useMemo(() => createShapes(), [])

  // Build the geometry with `position` = shape[0] and `aTargetPosition` = shape[1].
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3)
    const targetAttr = new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3)
    ;(posAttr.array as Float32Array).set(shapes[0].positions)
    ;(targetAttr.array as Float32Array).set(shapes[Math.min(1, shapes.length - 1)].positions)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    targetAttr.setUsage(THREE.DynamicDrawUsage)

    geo.setAttribute('position', posAttr)
    geo.setAttribute('aTargetPosition', targetAttr)
    geo.setAttribute('aRandom', new THREE.BufferAttribute(generateRandoms(), 3))
    // Large static bounding sphere so frustum culling never hides the system.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50)
    return geo
  }, [shapes])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      uSpin: { value: shapes[0].meta.spin },
      uSpinAxis: { value: new THREE.Vector3(...shapes[0].meta.spinAxis) },
      uNoiseAmp: { value: shapes[0].meta.noiseAmp },
      uRadialAmp: { value: shapes[0].meta.radialAmp },
      uDispDir: { value: new THREE.Vector3(...shapes[0].meta.dispDir) },
      uDirBias: { value: shapes[0].meta.dirBias },
      uPointScale: { value: shapes[0].meta.pointScale },
      uColorA: { value: new THREE.Color('#3ee8d2') }, // teal
      uColorB: { value: new THREE.Color('#4a63ff') }, // blue
      uColorC: { value: new THREE.Color('#9a5cff') }, // violet
      uColorD: { value: new THREE.Color('#ff9a3c') }, // orange
    }),
    [shapes],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [uniforms],
  )

  // Tell the rest of the app how many shapes exist.
  useEffect(() => {
    morph.setShapeCount(shapes.length)
    setShapeCount(shapes.length)
  }, [shapes, setShapeCount])

  useEffect(() => {
    uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2)
  }, [gl, uniforms])

  // Which shape pair is currently loaded into the attribute buffers.
  const loadedIndex = useRef(0)
  const lastActive = useRef(0)

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20)
    uniforms.uTime.value = state.clock.elapsedTime

    // ── Ease morph progress toward its target ─────────────────────────────
    const diff = morph.target - morph.progress
    if (Math.abs(diff) > 1e-4) {
      morph.progress += diff * Math.min(1, dt * 3.2)
    } else {
      morph.progress = morph.target
    }

    const maxIndex = shapes.length - 1
    const p = Math.min(Math.max(morph.progress, 0), maxIndex)
    let fromIndex = Math.min(Math.floor(p), maxIndex - 1)
    if (maxIndex === 0) fromIndex = 0
    const toIndex = Math.min(fromIndex + 1, maxIndex)
    const t = maxIndex === 0 ? 0 : p - fromIndex

    // ── Swap attribute buffers when we cross into a new shape pair ────────
    if (fromIndex !== loadedIndex.current) {
      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
      const targetAttr = geometry.getAttribute('aTargetPosition') as THREE.BufferAttribute
      ;(posAttr.array as Float32Array).set(shapes[fromIndex].positions)
      ;(targetAttr.array as Float32Array).set(shapes[toIndex].positions)
      posAttr.needsUpdate = true
      targetAttr.needsUpdate = true
      loadedIndex.current = fromIndex
    }

    uniforms.uMorph.value = t

    // ── Interpolate per‑shape tuning ──────────────────────────────────────
    applyMeta(uniforms, shapes[fromIndex].meta, shapes[toIndex].meta, t)

    // ── Audio uniforms ────────────────────────────────────────────────────
    audioEngine.update()
    const lv = audioEngine.levels
    uniforms.uBass.value = lv.bass
    uniforms.uMid.value = lv.mid
    uniforms.uTreble.value = lv.treble
    uniforms.uEnergy.value = lv.energy
    uniforms.uBeat.value = lv.beat

    // ── Slow camera drift + bass‑driven zoom ──────────────────────────────
    const cam = state.camera
    const targetZ = 7.4 - lv.bass * 0.35 - lv.beat * 0.25
    cam.position.z = lerp(cam.position.z, targetZ, dt * 2.5)
    cam.position.x = Math.sin(state.clock.elapsedTime * 0.12) * 0.35
    cam.position.y = Math.cos(state.clock.elapsedTime * 0.09) * 0.25
    cam.lookAt(0, 0, 0)

    // ── Notify UI when the nearest shape changes ──────────────────────────
    const active = Math.round(p)
    if (active !== lastActive.current) {
      lastActive.current = active
      setActiveShape(active)
    }
  })

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
}
