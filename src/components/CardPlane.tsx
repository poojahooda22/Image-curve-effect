import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useCardTexture } from '../hooks/useCardTexture'
import { getViewSizeAtDepth } from '../lib/viewSize'

import vertexShader from '../shaders/card.vert.glsl?raw'
import fragmentShader from '../shaders/card.frag.glsl?raw'

interface CardPlaneProps {
  src: string
  position: [number, number, number]
  scale: [number, number, number]
  anchorSide: number // -1 = left column, +1 = right column
  bendRef: React.RefObject<number>
  cardIndex: number    // for per-card phase offset
  gridHeight: number   // total grid height for normalization
  gridTopY: number     // top Y of grid in group space
  viewportTopY: number // fold line Y in world space (viewport top edge)
}

// Hover damping constants
const HOVER_DAMPING_IN = 0.08
const HOVER_DAMPING_OUT = 0.05

export function CardPlane({
  src,
  position,
  scale,
  anchorSide,
  bendRef,
  cardIndex,
  gridHeight,
  gridTopY,
  viewportTopY,
}: CardPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const canvasTexture = useCardTexture(src)

  // Hover state refs
  const hoverTargetRef = useRef(0)
  const hoverRef = useRef(0)
  const pointerUvRef = useRef({ x: 0.5, y: 0.5 })

  const uniforms = useMemo(
    () => ({
      uTexture: { value: null as THREE.CanvasTexture | null },
      uBend: { value: 0 },
      uAnchorSide: { value: anchorSide },
      uTime: { value: 0 },
      uIdleBendStrength: { value: 0.20 },
      uIdleBendSpeed: { value: 0.8 },
      uPhaseOffset: { value: cardIndex * 0.7 },
      uDistortStrength: { value: 0.7 },
      uEdgeWidth: { value: 0.45 },
      uCenterPow: { value: 2.0 },
      // Hover uniforms
      uHover: { value: 0 },
      uPointerUv: { value: new THREE.Vector2(0.5, 0.5) },
      // Rolling sheet uniforms
      uGridHeight: { value: gridHeight },
      uBendZAmount: { value: 1.5 },
      uBendYCompress: { value: 0.15 },
      // Cloth fold uniforms
      uViewportTopY: { value: viewportTopY },
      uFoldRadius: { value: 2.5 },
      uMaxFoldAngle: { value: Math.PI * 0.833 },
      uDipAmount: { value: 0.12 },
      uViewportHeight: { value: 0 },
      uFadeLiftY: { value: 4.0 },
      uExitRadiusScale: { value: 0.95 },
      uEdgeRoundness: { value: 0.08 },
      // Backface correction
      uBackfaceDarken: { value: 0.85 },
      uBackContrast: { value: 1.2 },
      uBackSaturation: { value: 0.9 },
    }),
    [anchorSide, cardIndex, gridHeight, gridTopY, viewportTopY]
  )


  useFrame((state, delta) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.ShaderMaterial
    mat.uniforms.uBend.value = bendRef.current
    mat.uniforms.uTime.value += delta
    mat.uniforms.uGridHeight.value = gridHeight
    mat.uniforms.uViewportTopY.value = viewportTopY

    // Compute viewport height for dip calculation
    const cam = state.camera as THREE.PerspectiveCamera
    const viewSize = getViewSizeAtDepth(cam)
    mat.uniforms.uViewportHeight.value = viewSize.height

    if (canvasTexture && mat.uniforms.uTexture.value !== canvasTexture) {
      mat.uniforms.uTexture.value = canvasTexture
    }

    // Hover damping
    const damping = hoverTargetRef.current > hoverRef.current
      ? HOVER_DAMPING_IN
      : HOVER_DAMPING_OUT
    hoverRef.current += (hoverTargetRef.current - hoverRef.current) * damping
    mat.uniforms.uHover.value = hoverRef.current
    mat.uniforms.uPointerUv.value.set(
      pointerUvRef.current.x,
      pointerUvRef.current.y
    )
  })

  const onPointerEnter = () => { hoverTargetRef.current = 1 }
  const onPointerLeave = () => { hoverTargetRef.current = 0 }
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.uv) {
      pointerUvRef.current.x = e.uv.x
      pointerUvRef.current.y = e.uv.y
    }
  }

  if (!canvasTexture) return null

  return (
    <mesh
      ref={meshRef}
      position={position}
      scale={scale}
      renderOrder={cardIndex}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
    >
      <planeGeometry args={[1, 1, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
