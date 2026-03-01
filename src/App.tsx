import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { ScrollProvider } from './hooks/useScrollVelocity'
import { WebGLImageGrid } from './components/WebGLImageGrid'
import { GlobalDistortion } from './effects/GlobalDistortion'
import { ScrollGhost } from './effects/ScrollGhost'
import { items } from './data/items'

export default function App() {
  return (
    <ScrollProvider>
      {/* Invisible spacer — gives Lenis scrollable area */}
      <div style={{ height: '400vh' }} />

      {/* WebGL layer: fixed canvas with all card rendering */}
      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 1.5]}
        camera={{ fov: 45, near: 0.1, far: 1000, position: [0, 0, 50] }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'auto',
          zIndex: 5,
        }}
      >
        <Suspense fallback={null}>
          <WebGLImageGrid items={items} />
        </Suspense>

        {/* Global postprocessing: unified distortion over the entire grid */}
        <EffectComposer>
          <ScrollGhost />
          <GlobalDistortion />
        </EffectComposer>
      </Canvas>
    </ScrollProvider>
  )
}
