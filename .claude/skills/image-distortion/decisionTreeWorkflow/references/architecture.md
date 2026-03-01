# Architecture Reference — DOM ↔ WebGL Sync, Component Tree, Hooks

## Table of Contents
1. [Screen-to-World Coordinate Conversion](#screen-to-world)
2. [DOM Sync Hook](#dom-sync)
3. [Full Component Tree](#component-tree)
4. [ImagePlane Component](#image-plane)
5. [Custom ShaderMaterial Factory](#material-factory)
6. [Mouse Uniforms Hook](#mouse-hook)
7. [Scroll Velocity Hook (Lenis)](#scroll-hook)
8. [Theatre.js Integration](#theatre)
9. [TypeScript Types](#types)

---

## 1. Screen-to-World Coordinate Conversion <a name="screen-to-world"></a>

The critical math: converting screen pixels to Three.js world units. A `PerspectiveCamera` maps world space through a frustum. To place WebGL planes exactly where DOM images are, we need the view size at the camera's Z distance.

```typescript
// lib/viewSize.ts
import * as THREE from 'three'

export function getViewSizeAtDepth(
  camera: THREE.PerspectiveCamera,
  depth: number = 0
): { width: number; height: number } {
  const fovInRad = (camera.fov * Math.PI) / 180
  const distance = camera.position.z - depth
  const height = 2 * Math.tan(fovInRad / 2) * distance
  const width = height * camera.aspect
  return { width, height }
}

// Convert screen px to world units
export function screenToWorld(
  screenX: number,     // px from left edge
  screenY: number,     // px from top edge
  screenW: number,     // viewport width
  screenH: number,     // viewport height
  viewSize: { width: number; height: number }
) {
  const x = (screenX / screenW) * viewSize.width - viewSize.width / 2
  const y = -(screenY / screenH) * viewSize.height + viewSize.height / 2
  return { x, y }
}
```

---

## 2. DOM Sync Hook <a name="dom-sync"></a>

This hook reads a DOM element's position and size, then returns world-space coordinates for the WebGL plane.

```typescript
// hooks/useDOMSync.ts
import { useThree, useFrame } from '@react-three/fiber'
import { useRef, useCallback } from 'react'
import * as THREE from 'three'
import { getViewSizeAtDepth, screenToWorld } from '../lib/viewSize'

interface DOMSyncResult {
  position: THREE.Vector3
  scale: THREE.Vector3
}

export function useDOMSync(
  elementRef: React.RefObject<HTMLElement | null>,
  scrollOffset: number = 0
): DOMSyncResult {
  const { camera, viewport } = useThree()
  const result = useRef<DOMSyncResult>({
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(1, 1, 1),
  })

  useFrame(() => {
    if (!elementRef.current) return
    const rect = elementRef.current.getBoundingClientRect()
    const cam = camera as THREE.PerspectiveCamera
    const viewSize = getViewSizeAtDepth(cam)

    // Scale: map px dimensions to world units
    const scaleX = (rect.width / window.innerWidth) * viewSize.width
    const scaleY = (rect.height / window.innerHeight) * viewSize.height

    // Position: center of element in world space
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const { x, y } = screenToWorld(
      centerX, centerY,
      window.innerWidth, window.innerHeight,
      viewSize
    )

    result.current.position.set(x, y, 0)
    result.current.scale.set(scaleX, scaleY, 1)
  })

  return result.current
}
```

---

## 3. Full Component Tree <a name="component-tree"></a>

```tsx
// App.tsx
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Lenis } from 'lenis/react'
import { ImageGrid } from './components/ImageGrid'
import { PostProcessing } from './components/PostProcessing'
import { ScrollProvider } from './hooks/useScrollVelocity'

export default function App() {
  return (
    <ScrollProvider>
      {/* HTML layer (for SEO + fallback) */}
      <main className="relative z-10">
        <ImageGrid />
      </main>

      {/* WebGL layer (visual) */}
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
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        <Suspense fallback={null}>
          <WebGLImageGrid />
          <PostProcessing />
        </Suspense>
      </Canvas>
    </ScrollProvider>
  )
}
```

---

## 4. ImagePlane Component <a name="image-plane"></a>

Each image in the grid gets its own WebGL plane:

```tsx
// components/ImagePlane.tsx
import { useRef, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import { useDOMSync } from '../hooks/useDOMSync'
import { useScrollVelocity } from '../hooks/useScrollVelocity'

// Import shader source as strings (Vite: ?raw, Next: raw-loader)
import vertexShader from '../shaders/image-plane.vert.glsl?raw'
import fragmentShader from '../shaders/image-plane.frag.glsl?raw'
import noiseGLSL from '../shaders/noise.glsl?raw'

interface ImagePlaneProps {
  src: string
  hoverSrc?: string
  domRef: React.RefObject<HTMLElement | null>
  index: number
}

export function ImagePlane({ src, hoverSrc, domRef, index }: ImagePlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  // Load textures
  const texture = useTexture(src)
  const hoverTexture = useTexture(hoverSrc ?? src)

  // DOM sync
  const { position, scale } = useDOMSync(domRef)

  // Scroll velocity
  const scrollVelocity = useScrollVelocity()

  // Mouse state
  const mouse = useRef(new THREE.Vector2(0.5, 0.5))
  const hoverProgress = useRef({ value: 0 })

  // Uniforms (memoized to prevent recreation)
  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uTextureHover: { value: hoverTexture },
      uTime: { value: 0 },
      uScrollVelocity: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uHoverProgress: { value: 0 },
      uAlpha: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTextureSize: { value: new THREE.Vector2(1, 1) },
      uQuadSize: { value: new THREE.Vector2(1, 1) },
      uOffset: { value: new THREE.Vector2(0, 0) },
    }),
    // Intentionally only on mount — uniforms are updated in useFrame
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Geometry: 32x32 segments for smooth vertex deformation
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(1, 1, 32, 32),
    []
  )

  // Prepend noise functions to vertex/fragment shaders
  const fullVertexShader = noiseGLSL + '\n' + vertexShader
  const fullFragmentShader = noiseGLSL + '\n' + fragmentShader

  // Hover handlers (called from parent via callback)
  const onPointerEnter = () => {
    gsap.to(hoverProgress.current, {
      value: 1,
      duration: 0.8,
      ease: 'power2.out',
    })
  }

  const onPointerLeave = () => {
    gsap.to(hoverProgress.current, {
      value: 0,
      duration: 0.6,
      ease: 'power2.inOut',
    })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!domRef.current) return
    const rect = domRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    gsap.to(mouse.current, {
      x,
      y,
      duration: 0.4,
      ease: 'power2.out',
    })
  }

  // Per-frame updates
  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return
    const mat = materialRef.current

    // Sync position + scale
    meshRef.current.position.copy(position)
    meshRef.current.scale.copy(scale)

    // Update uniforms
    mat.uniforms.uTime.value = clock.getElapsedTime()
    mat.uniforms.uScrollVelocity.value = scrollVelocity.current
    mat.uniforms.uMouse.value.copy(mouse.current)
    mat.uniforms.uHoverProgress.value = hoverProgress.current.value
    mat.uniforms.uQuadSize.value.set(scale.x, scale.y)
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
    >
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={fullVertexShader}
        fragmentShader={fullFragmentShader}
        transparent
      />
    </mesh>
  )
}
```

---

## 5. Custom ShaderMaterial Factory <a name="material-factory"></a>

For reuse across multiple planes with different configs:

```typescript
// materials/ImagePlaneMaterial.ts
import * as THREE from 'three'

export interface ImagePlaneConfig {
  bendStrength?: number    // 0-1, how much scroll bends the plane
  noiseFrequency?: number  // 1-20, noise detail level
  noiseAmplitude?: number  // 0-0.2, distortion strength
  rgbShift?: number        // 0-0.05, chromatic aberration amount
  grainIntensity?: number  // 0-0.1, film grain overlay
}

const DEFAULT_CONFIG: ImagePlaneConfig = {
  bendStrength: 0.01,
  noiseFrequency: 4.0,
  noiseAmplitude: 0.08,
  rgbShift: 0.0,
  grainIntensity: 0.02,
}

export function createImagePlaneMaterial(
  vertexShader: string,
  fragmentShader: string,
  config: ImagePlaneConfig = {}
): THREE.ShaderMaterial {
  const c = { ...DEFAULT_CONFIG, ...config }

  return new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: null },
      uTextureHover: { value: null },
      uTime: { value: 0 },
      uScrollVelocity: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uHoverProgress: { value: 0 },
      uAlpha: { value: 1 },
      uQuadSize: { value: new THREE.Vector2(1, 1) },
      uTextureSize: { value: new THREE.Vector2(1, 1) },
      // Config uniforms
      uBendStrength: { value: c.bendStrength },
      uNoiseFrequency: { value: c.noiseFrequency },
      uNoiseAmplitude: { value: c.noiseAmplitude },
      uRGBShift: { value: c.rgbShift },
      uGrainIntensity: { value: c.grainIntensity },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
  })
}
```

---

## 6. Mouse Uniforms Hook <a name="mouse-hook"></a>

```typescript
// hooks/useMouseUniforms.ts
import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'

export function useMouseUniforms() {
  const mouse = useRef(new THREE.Vector2(0, 0))
  const smoothMouse = useRef(new THREE.Vector2(0, 0))

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      // Normalized: -1 to 1 (Three.js convention)
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1

      gsap.to(smoothMouse.current, {
        x: mouse.current.x,
        y: mouse.current.y,
        duration: 0.5,
        ease: 'power2.out',
      })
    }

    window.addEventListener('mousemove', handleMove)
    return () => window.removeEventListener('mousemove', handleMove)
  }, [])

  return { mouse: mouse.current, smoothMouse: smoothMouse.current }
}
```

---

## 7. Scroll Velocity Hook (Lenis) <a name="scroll-hook"></a>

```typescript
// hooks/useScrollVelocity.ts
import { createContext, useContext, useRef, useEffect, ReactNode } from 'react'
import Lenis from 'lenis'

const ScrollCtx = createContext<React.MutableRefObject<number>>({ current: 0 })

export function ScrollProvider({ children }: { children: ReactNode }) {
  const velocity = useRef(0)

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    lenis.on('scroll', (e: { velocity: number }) => {
      velocity.current = e.velocity
    })

    function raf(time: number) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)

    return () => lenis.destroy()
  }, [])

  return <ScrollCtx.Provider value={velocity}>{children}</ScrollCtx.Provider>
}

export function useScrollVelocity() {
  return useContext(ScrollCtx)
}
```

---

## 8. Theatre.js Integration <a name="theatre"></a>

Theatre.js provides a visual timeline editor for fine-tuning shader parameters:

```typescript
// lib/theatre-setup.ts
import { getProject, types } from '@theatre/core'

// Only import studio in development
if (process.env.NODE_ENV === 'development') {
  import('@theatre/studio').then((studio) => studio.default.initialize())
}

export const project = getProject('ImageDistortionFX')
export const mainSheet = project.sheet('Main')

// Create an object with tweakable shader params
export function createShaderControls(name: string) {
  return mainSheet.object(name, {
    bendStrength: types.number(0.01, { range: [0, 0.05], nudgeMultiplier: 0.001 }),
    noiseFrequency: types.number(4, { range: [1, 20] }),
    noiseAmplitude: types.number(0.08, { range: [0, 0.3], nudgeMultiplier: 0.01 }),
    rgbShift: types.number(0, { range: [0, 0.05], nudgeMultiplier: 0.001 }),
    grainIntensity: types.number(0.02, { range: [0, 0.15], nudgeMultiplier: 0.005 }),
    hoverRadius: types.number(0.3, { range: [0.05, 1.0] }),
    transitionProgress: types.number(0, { range: [0, 1] }),
  })
}
```

To use in a component:
```tsx
import { createShaderControls } from '../lib/theatre-setup'

const controls = createShaderControls('HeroImage')

// In useFrame, read current values:
controls.onValuesChange((values) => {
  materialRef.current.uniforms.uNoiseFrequency.value = values.noiseFrequency
  // ... etc
})
```

---

## 9. TypeScript Types <a name="types"></a>

```typescript
// types/index.ts
import * as THREE from 'three'

export interface ImageItem {
  id: string
  src: string
  hoverSrc?: string
  title: string
  href: string
}

export interface ShaderUniforms {
  uTexture: { value: THREE.Texture | null }
  uTextureHover: { value: THREE.Texture | null }
  uTime: { value: number }
  uScrollVelocity: { value: number }
  uMouse: { value: THREE.Vector2 }
  uHoverProgress: { value: number }
  uAlpha: { value: number }
  uQuadSize: { value: THREE.Vector2 }
  uTextureSize: { value: THREE.Vector2 }
  uOffset: { value: THREE.Vector2 }
  [key: string]: { value: unknown }
}

export interface EffectConfig {
  bendStrength: number
  noiseFrequency: number
  noiseAmplitude: number
  rgbShift: number
  grainIntensity: number
}
```