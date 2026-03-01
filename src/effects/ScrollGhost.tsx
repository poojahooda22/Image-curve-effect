import { forwardRef, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'
import { useScrollVelocity } from '../hooks/useScrollVelocity'

const fragmentShader = /* glsl */ `
  uniform float uGhostStrength;

  const int SAMPLES = 5;
  const float SPACING = 0.006;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (uGhostStrength < 0.001) {
      outputColor = inputColor;
      return;
    }

    vec4 result = vec4(0.0);
    float totalWeight = 0.0;

    for (int i = 0; i < SAMPLES; i++) {
      float fi = float(i);
      float weight = 1.0 / (1.0 + fi * 1.5);
      vec2 offset = vec2(0.0, fi * SPACING * uGhostStrength);
      result += texture2D(inputBuffer, clamp(uv + offset, 0.0, 1.0)) * weight;
      totalWeight += weight;
    }

    outputColor = result / totalWeight;
  }
`

// Damping constants
const GHOST_DAMPING_IN = 0.08
const GHOST_DAMPING_OUT = 0.03
const GHOST_VELOCITY_SCALE = 0.15

class ScrollGhostEffect extends Effect {
  constructor() {
    super('ScrollGhost', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uGhostStrength', new Uniform(0)],
      ]),
    })
  }
}

export const ScrollGhost = forwardRef<ScrollGhostEffect>(
  function ScrollGhost(_, ref) {
    const effect = useMemo(() => new ScrollGhostEffect(), [])
    const localRef = useRef(effect)
    localRef.current = effect

    const velocityRef = useScrollVelocity()
    const ghostRef = useRef(0)

    useFrame(() => {
      const absVel = Math.abs(velocityRef.current)
      const target = Math.min(absVel * GHOST_VELOCITY_SCALE, 1)
      const damping = target > ghostRef.current ? GHOST_DAMPING_IN : GHOST_DAMPING_OUT
      ghostRef.current += (target - ghostRef.current) * damping

      const uGhostStrength = localRef.current.uniforms.get('uGhostStrength')
      if (uGhostStrength) uGhostStrength.value = ghostRef.current
    })

    if (typeof ref === 'function') ref(effect)
    else if (ref) ref.current = effect

    return <primitive object={effect} dispose={null} />
  }
)
