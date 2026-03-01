import { forwardRef, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uDistortStrength;
  uniform float uNoiseStrength;
  uniform float uWaveScale;
  uniform float uEdgeFade;

  // --- Value noise ---
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // --- Film grain ---
  float grain(vec2 uv, float t) {
    return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453 + t);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // ============================================================
    // UV DISTORTION (wave + noise, Y-profiled)
    // ============================================================
    // Y profile: peaks at vertical center, zero at edges
    float yCenter = sin(3.14159 * uv.y);
    float yCurve = yCenter * yCenter;

    // Dual-layer value noise for organic wave motion
    float t = uTime * 0.15;
    float n1 = valueNoise(uv * uWaveScale + t);
    float n2 = valueNoise(uv * uWaveScale * 1.3 - t * 0.7);
    float n = (n1 + n2) * 0.5 - 0.5;

    // ============================================================
    // EDGE FADE MASK (vignette: no distortion near screen borders)
    // ============================================================
    float fadeL = smoothstep(0.0, uEdgeFade, uv.x);
    float fadeR = smoothstep(1.0, 1.0 - uEdgeFade, uv.x);
    float fadeB = smoothstep(0.0, uEdgeFade, uv.y);
    float fadeT = smoothstep(1.0, 1.0 - uEdgeFade, uv.y);
    float edgeMask = fadeL * fadeR * fadeB * fadeT;

    // Displacement scaled by strength, modulated by edge mask
    vec2 displacement = vec2(n * 0.012, n * 0.008) * yCurve * uDistortStrength * edgeMask;
    vec2 distortedUv = clamp(uv + displacement, 0.0, 1.0);

    // ============================================================
    // RGB SHIFT (chromatic aberration proportional to displacement)
    // ============================================================
    vec2 rgbOffset = displacement * 0.04;

    float r = texture2D(inputBuffer, clamp(distortedUv + rgbOffset, 0.0, 1.0)).r;
    float g = texture2D(inputBuffer, distortedUv).g;
    float b = texture2D(inputBuffer, clamp(distortedUv - rgbOffset, 0.0, 1.0)).b;
    float a = texture2D(inputBuffer, distortedUv).a;
    vec3 color = vec3(r, g, b);

    // ============================================================
    // FILM GRAIN (subtle, stable)
    // ============================================================
    float gr = grain(uv * 1000.0, uTime);
    color += (gr - 0.5) * uNoiseStrength * a;

    outputColor = vec4(color, a);
  }
`

class GlobalDistortionEffect extends Effect {
  constructor({
    distortStrength = 1.5,
    noiseStrength = 0.02,
    waveScale = 4.0,
    edgeFade = 0.25,
  }: {
    distortStrength?: number
    noiseStrength?: number
    waveScale?: number
    edgeFade?: number
  } = {}) {
    super('GlobalDistortion', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0)],
        ['uDistortStrength', new Uniform(distortStrength)],
        ['uNoiseStrength', new Uniform(noiseStrength)],
        ['uWaveScale', new Uniform(waveScale)],
        ['uEdgeFade', new Uniform(edgeFade)],
      ]),
    })
  }
}

export const GlobalDistortion = forwardRef<
  GlobalDistortionEffect,
  { distortStrength?: number; noiseStrength?: number; waveScale?: number; edgeFade?: number }
>(function GlobalDistortion(
  { distortStrength = 1.5, noiseStrength = 0.02, waveScale = 4.0, edgeFade = 0.25 },
  ref
) {
  const effect = useMemo(
    () => new GlobalDistortionEffect({ distortStrength, noiseStrength, waveScale, edgeFade }),
    [distortStrength, noiseStrength, waveScale, edgeFade]
  )

  const localRef = useRef(effect)
  localRef.current = effect

  useFrame((_, delta) => {
    const uniforms = localRef.current.uniforms
    const uTime = uniforms.get('uTime')
    if (uTime) uTime.value += delta
  })

  // Forward ref so EffectComposer can access the effect
  if (typeof ref === 'function') ref(effect)
  else if (ref) ref.current = effect

  return <primitive object={effect} dispose={null} />
})
