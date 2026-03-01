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

export function screenToWorld(
  screenX: number,
  screenY: number,
  screenW: number,
  screenH: number,
  viewSize: { width: number; height: number }
) {
  const x = (screenX / screenW) * viewSize.width - viewSize.width / 2
  const y = -(screenY / screenH) * viewSize.height + viewSize.height / 2
  return { x, y }
}
