import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ImageItem } from '../types'
import { CardPlane } from './CardPlane'
import { useScrollVelocity, useScrollProgress } from '../hooks/useScrollVelocity'
import { getViewSizeAtDepth } from '../lib/viewSize'
import { CARD_ASPECT } from '../hooks/useCardTexture'

interface WebGLImageGridProps {
  items: ImageItem[]
}

const COLS = 2
const GRID_WIDTH_FRAC = 2.10
const GAP_FRAC = 0.04
const ROW_GAP_FRAC = 0.08
const INSET_FRAC = 0.10          // 10vh top and bottom padding

// Scroll-driven bend constants
const VELOCITY_DEADZONE = 0.5    // ignore velocities below this
const VELOCITY_RAMP_HIGH = 8.0   // velocity for full bend activation
const BEND_DAMPING = 0.03        // lerp factor (lower = smoother)
const MAX_BEND = 0.8             // max deformation clamp

// Mouse parallax constants
const PARALLAX_STRENGTH = 0.6    // max offset in world units
const PARALLAX_DAMPING = 0.05    // lerp factor (~1s to 95%)

// Z roll during scroll (whole grid shifts backward while cards bend outward)
const Z_ROLL_STRENGTH = 2.0

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function WebGLImageGrid({ items }: WebGLImageGridProps) {
  const groupRef = useRef<THREE.Group>(null)
  const bendRef = useRef(0)
  const velocityRef = useScrollVelocity()
  const progressRef = useScrollProgress()
  const { camera, size } = useThree()

  // Mouse parallax refs
  const mouseTargetRef = useRef({ x: 0, y: 0 })
  const parallaxRef = useRef({ x: 0, y: 0 })
  const scrollYRef = useRef(0)

  // Global mousemove listener for parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseTargetRef.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouseTargetRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Compute grid layout in world-space units with 10vh insets
  const layout = useMemo(() => {
    const viewSize = getViewSizeAtDepth(camera as THREE.PerspectiveCamera)
    const usableHeight = viewSize.height * (1 - 2 * INSET_FRAC) // 80% of viewport

    const gridWidth = viewSize.width * GRID_WIDTH_FRAC
    const gap = gridWidth * GAP_FRAC
    let colWidth = (gridWidth - gap) / COLS
    let cardHeight = colWidth / CARD_ASPECT
    const rows = Math.ceil(items.length / COLS)

    let rowGap = cardHeight * ROW_GAP_FRAC
    let totalGridHeight = rows * cardHeight + (rows - 1) * rowGap

    const overflow = Math.max(0, totalGridHeight - usableHeight)

    const positions: { x: number; y: number; anchorSide: number }[] = []

    for (let i = 0; i < items.length; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)

      const x =
        col === 0
          ? -(gap / 2 + colWidth / 2)
          : gap / 2 + colWidth / 2

      // Center grid vertically at y=0 (viewport center)
      const y =
        totalGridHeight / 2 - cardHeight / 2 - row * (cardHeight + rowGap)

      const anchorSide = col === 0 ? -1 : 1

      positions.push({ x, y, anchorSide })
    }

    return { positions, colWidth, cardHeight, overflow, totalGridHeight }
  }, [camera, size.width, size.height, items.length])

  // Animate bend + scroll Y + mouse parallax each frame
  useFrame(() => {
    const velocity = velocityRef.current
    const progress = progressRef.current

    // --- Scroll bend ---
    const absVel = Math.abs(velocity)
    const effectiveVel = absVel < VELOCITY_DEADZONE ? 0 : absVel
    const ramp = smoothstep(VELOCITY_DEADZONE, VELOCITY_RAMP_HIGH, effectiveVel)
    const targetBend = Math.min(ramp * MAX_BEND, MAX_BEND)
    bendRef.current += (targetBend - bendRef.current) * BEND_DAMPING

    // --- Scroll Y position ---
    if (layout.overflow > 0) {
      const targetScrollY = -layout.overflow / 2 + progress * layout.overflow
      scrollYRef.current += (targetScrollY - scrollYRef.current) * 0.1
    }

    // --- Mouse parallax ---
    const targetParallaxX = mouseTargetRef.current.x * PARALLAX_STRENGTH
    const targetParallaxY = mouseTargetRef.current.y * PARALLAX_STRENGTH * 0.5
    parallaxRef.current.x += (targetParallaxX - parallaxRef.current.x) * PARALLAX_DAMPING
    parallaxRef.current.y += (targetParallaxY - parallaxRef.current.y) * PARALLAX_DAMPING

    // --- Combine into group position ---
    if (groupRef.current) {
      groupRef.current.position.x = parallaxRef.current.x
      groupRef.current.position.y = scrollYRef.current + parallaxRef.current.y
      groupRef.current.position.z = -bendRef.current * Z_ROLL_STRENGTH
    }
  })

  return (
    <group ref={groupRef}>
      {items.map((item, index) => {
        const { x, y, anchorSide } = layout.positions[index]
        return (
          <CardPlane
            key={item.id}
            src={item.src}
            position={[x, y, 0]}
            scale={[layout.colWidth, layout.cardHeight, 1]}
            anchorSide={anchorSide}
            bendRef={bendRef}
            cardIndex={index}
            gridHeight={layout.totalGridHeight}
          />
        )
      })}
    </group>
  )
}
