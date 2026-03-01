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
const GRID_WIDTH_FRAC = 0.80
const GAP_FRAC = 0.04
const ROW_GAP_FRAC = 0.08
const TOP_PADDING_FRAC = 0.30     // 30vh top padding (first row starts here)

// Scroll-driven bend constants (velocity wobble, kept)
const VELOCITY_DEADZONE = 0.5
const VELOCITY_RAMP_HIGH = 8.0
const BEND_DAMPING = 0.03
const MAX_BEND = 0.8

// Scroll offset damping (world-space Y translation)
const SCROLL_DAMPING = 0.06
const FOLD_CLEARANCE = 6.5         // extra world units so last card fully folds

// Mouse parallax constants
const PARALLAX_STRENGTH = 0.6
const PARALLAX_DAMPING = 0.05

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function WebGLImageGrid({ items }: WebGLImageGridProps) {
  const groupRef = useRef<THREE.Group>(null)
  const bendRef = useRef(0)
  const scrollOffsetRef = useRef(0)
  const velocityRef = useScrollVelocity()
  const progressRef = useScrollProgress()
  const { camera, size } = useThree()

  // Mouse parallax refs
  const mouseTargetRef = useRef({ x: 0, y: 0 })
  const parallaxRef = useRef({ x: 0, y: 0 })

  // Global mousemove listener for parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseTargetRef.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouseTargetRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Compute grid layout in world-space units with top padding
  const layout = useMemo(() => {
    const viewSize = getViewSizeAtDepth(camera as THREE.PerspectiveCamera)
    const topPadding = viewSize.height * TOP_PADDING_FRAC

    const gridWidth = viewSize.width * GRID_WIDTH_FRAC
    const gap = gridWidth * GAP_FRAC
    const colWidth = (gridWidth - gap) / COLS
    const cardHeight = colWidth / CARD_ASPECT
    const rows = Math.ceil(items.length / COLS)

    const rowGap = cardHeight * ROW_GAP_FRAC
    const totalGridHeight = rows * cardHeight + (rows - 1) * rowGap

    // Grid top sits at 30vh from viewport top
    const gridTopY = viewSize.height / 2 - topPadding

    // Fold line = grid top (fold starts right where first row sits)
    const viewportTopY = gridTopY

    // Max scroll: enough for last card to fully fold away
    const maxScrollWorld = totalGridHeight + FOLD_CLEARANCE

    const positions: { x: number; y: number; anchorSide: number }[] = []

    for (let i = 0; i < items.length; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)

      const x =
        col === 0
          ? -(gap / 2 + colWidth / 2)
          : gap / 2 + colWidth / 2

      // Position rows downward from gridTopY
      const y =
        gridTopY - cardHeight / 2 - row * (cardHeight + rowGap)

      const anchorSide = col === 0 ? -1 : 1

      positions.push({ x, y, anchorSide })
    }

    return { positions, colWidth, cardHeight, totalGridHeight, gridTopY, viewportTopY, maxScrollWorld }
  }, [camera, size.width, size.height, items.length])

  // Animate bend + scroll offset + mouse parallax each frame
  useFrame(() => {
    const velocity = velocityRef.current
    const progress = progressRef.current

    // --- Scroll bend (velocity wobble, kept) ---
    const absVel = Math.abs(velocity)
    const effectiveVel = absVel < VELOCITY_DEADZONE ? 0 : absVel
    const ramp = smoothstep(VELOCITY_DEADZONE, VELOCITY_RAMP_HIGH, effectiveVel)
    const targetBend = Math.min(ramp * MAX_BEND, MAX_BEND)
    bendRef.current += (targetBend - bendRef.current) * BEND_DAMPING

    // --- Scroll offset in world units (group moves up as user scrolls) ---
    const targetOffset = progress * layout.maxScrollWorld
    scrollOffsetRef.current += (targetOffset - scrollOffsetRef.current) * SCROLL_DAMPING

    // --- Mouse parallax ---
    const targetParallaxX = mouseTargetRef.current.x * PARALLAX_STRENGTH
    const targetParallaxY = mouseTargetRef.current.y * PARALLAX_STRENGTH * 0.5
    parallaxRef.current.x += (targetParallaxX - parallaxRef.current.x) * PARALLAX_DAMPING
    parallaxRef.current.y += (targetParallaxY - parallaxRef.current.y) * PARALLAX_DAMPING

    // --- Group position: parallax + scroll Y-translation ---
    if (groupRef.current) {
      groupRef.current.position.x = parallaxRef.current.x
      groupRef.current.position.y = parallaxRef.current.y + scrollOffsetRef.current
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
            gridTopY={layout.gridTopY}
            viewportTopY={layout.viewportTopY}
          />
        )
      })}
    </group>
  )
}
