import { useEffect, useState } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const CANVAS_W = 1920
const CANVAS_H = 1080

/**
 * Draws an image (cover-fit) onto an offscreen 2D canvas
 * and returns a THREE.CanvasTexture.
 */
export function useCardTexture(src: string): THREE.CanvasTexture | null {
  const texture = useTexture(src)
  const [canvasTexture, setCanvasTexture] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    const img = texture.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap
    if (!img) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = CANVAS_W * dpr
    const h = CANVAS_H * dpr

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)

    // Clear canvas (transparent background)
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    // --- Image (cover-fit into 800×600 logical) ---
    const imgW = 'naturalWidth' in img ? (img as HTMLImageElement).naturalWidth : (img as ImageBitmap).width
    const imgH = 'naturalHeight' in img ? (img as HTMLImageElement).naturalHeight : (img as ImageBitmap).height

    const canvasAspect = CANVAS_W / CANVAS_H
    const imageAspect = imgW / imgH

    let sx = 0, sy = 0, sw = imgW, sh = imgH
    if (imageAspect > canvasAspect) {
      sw = imgH * canvasAspect
      sx = (imgW - sw) / 2
    } else {
      sh = imgW / canvasAspect
      sy = (imgH - sh) / 2
    }

    ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, 0, 0, CANVAS_W, CANVAS_H)

    // Create texture
    const tex = new THREE.CanvasTexture(canvas)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    setCanvasTexture(tex)

    return () => {
      setCanvasTexture((prev) => {
        prev?.dispose()
        return null
      })
    }
  }, [texture])

  return canvasTexture
}

/** Aspect ratio of the card texture (4:3) */
export const CARD_ASPECT = CANVAS_W / CANVAS_H
