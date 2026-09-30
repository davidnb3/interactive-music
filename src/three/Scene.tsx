import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { ParticleField } from './ParticleField'

export function Scene() {
  return (
    <Canvas
      className="scene"
      camera={{ position: [0, 0, 7.4], fov: 55, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
      onCreated={({ gl }) => gl.setClearColor('#05060c', 1)}
    >
      <ParticleField />
      <EffectComposer enableNormalPass={false}>
        <Bloom
          intensity={1.05}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.5}
          mipmapBlur
          radius={0.7}
        />
        <Vignette eskil={false} offset={0.25} darkness={0.85} />
      </EffectComposer>
    </Canvas>
  )
}
