# Image Transitions Reference

Transitions blend between two images (or scenes) using shader-driven UV manipulation.
Every transition is fundamentally a 0→1 animation of a `progress` uniform that controls
how two textures are mixed.

## Table of Contents
1. [Core Principle](#core-principle)
2. [Basic Fade](#fade)
3. [Noise-Masked Transition](#noise-masked)
4. [UV Stretch / Warp Transition](#uv-warp)
5. [Displacement Map Transition](#displacement-map)
6. [SDF Reveal Transition](#sdf-reveal)
7. [Radial Circle Reveal (2025 Technique)](#radial-reveal)
8. [GL Transitions Compatibility](#gl-transitions)
9. [GSAP + Theatre.js Sequencing](#sequencing)
10. [React Integration Pattern](#react-pattern)

---

## 1. Core Principle <a name="core-principle"></a>

```glsl
// Every transition follows this pattern:
uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform float uProgress;  // 0 = show texture1, 1 = show texture2

void main() {
  vec4 t1 = texture2D(uTexture1, vUv);
  vec4 t2 = texture2D(uTexture2, vUv);

  // The "creative" part: HOW you mix them
  gl_FragColor = mix(t1, t2, uProgress);
}
```

The creativity comes from:
1. Manipulating UVs before sampling (warp, stretch, zoom)
2. Creating non-uniform masks (noise, SDFs, displacement maps)
3. Adding motion to the mask itself (animated noise, expanding circles)

**Key UV operations:**
| Operation | Effect |
|---|---|
| `uv * scale` | Zoom in/out |
| `uv + offset` | Pan/slide |
| `fract(uv * n)` | Tile/repeat |
| `uv + noise` | Organic warp |
| `mix(uv, center, factor)` | Zoom toward point |

---

## 2. Basic Fade <a name="fade"></a>

```glsl
void main() {
  vec4 t1 = texture2D(uTexture1, vUv);
  vec4 t2 = texture2D(uTexture2, vUv);
  gl_FragColor = mix(t1, t2, uProgress);
}
```

---

## 3. Noise-Masked Transition <a name="noise-masked"></a>

Uses noise to create an organic, non-uniform transition boundary:

```glsl
// Noise-masked transition — the signature Unseen/Codrops technique

uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform float uProgress;
uniform float uTime;

varying vec2 vUv;

// snoise() from noise.glsl

void main() {
  vec4 t1 = texture2D(uTexture1, vUv);
  vec4 t2 = texture2D(uTexture2, vUv);

  // Generate noise
  float n = snoise(vec3(vUv * 4.0, uTime * 0.1));

  // Progress drives the threshold
  // Remap progress to create edge softness
  float edge = uProgress * 1.6 - 0.3;  // extends range for smoother start/end

  // Create mask: noise + directional wipe
  float mask = smoothstep(edge - 0.1, edge + 0.1, n + vUv.x * 0.5);

  gl_FragColor = mix(t1, t2, mask);
}
```

**Variations by changing the mask computation:**

```glsl
// Horizontal wipe with noise edges:
float mask = smoothstep(edge - 0.1, edge + 0.1, n * 0.3 + vUv.x);

// Vertical wipe with noise edges:
float mask = smoothstep(edge - 0.1, edge + 0.1, n * 0.3 + vUv.y);

// Center-out radial with noise:
float dist = distance(vUv, vec2(0.5));
float mask = smoothstep(edge - 0.1, edge + 0.1, n * 0.3 + dist);

// Pure noise dissolve (no direction):
float mask = smoothstep(edge - 0.2, edge + 0.2, n);
```

---

## 4. UV Stretch / Warp Transition <a name="uv-warp"></a>

From the Codrops Creative WebGL Image Transitions:

```glsl
// Stretch transition — UVs get pushed during transition

uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform float uProgress;

varying vec2 vUv;

void main() {
  // Compute distorted UVs based on progress
  float p = uProgress;

  // Image 1: stretch as it leaves
  vec2 uv1 = vUv;
  uv1.x -= fract(vUv.x * 5.0) * p * 0.1;  // creates column-wise distortion

  // Image 2: stretch as it enters (inverse)
  vec2 uv2 = vUv;
  uv2.x += fract(vUv.x * 5.0) * (1.0 - p) * 0.1;

  vec4 t1 = texture2D(uTexture1, uv1);
  vec4 t2 = texture2D(uTexture2, uv2);

  gl_FragColor = mix(t1, t2, p);
}
```

**UV Scaling variant (zoom transition):**

```glsl
vec2 scaleUV(vec2 uv, float scale) {
  float center = 0.5;
  return ((uv - center) * scale) + center;
}

void main() {
  // Image 1 zooms in as it fades out
  vec2 uv1 = scaleUV(vUv, 1.0 - uProgress * 0.2);
  // Image 2 starts zoomed in and settles to 1.0
  vec2 uv2 = scaleUV(vUv, 1.0 + (1.0 - uProgress) * 0.2);

  vec4 t1 = texture2D(uTexture1, uv1);
  vec4 t2 = texture2D(uTexture2, uv2);

  gl_FragColor = mix(t1, t2, uProgress);
}
```

---

## 5. Displacement Map Transition <a name="displacement-map"></a>

Uses a grayscale texture to control per-pixel transition timing:

```glsl
uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform sampler2D uDisplacement;  // grayscale displacement texture
uniform float uProgress;
uniform float uIntensity;

varying vec2 vUv;

void main() {
  float disp = texture2D(uDisplacement, vUv).r;

  // Offset UVs in opposite directions
  vec2 uv1 = vec2(vUv.x + uProgress * disp * uIntensity, vUv.y);
  vec2 uv2 = vec2(vUv.x - (1.0 - uProgress) * disp * uIntensity, vUv.y);

  vec4 t1 = texture2D(uTexture1, uv1);
  vec4 t2 = texture2D(uTexture2, uv2);

  gl_FragColor = mix(t1, t2, uProgress);
}
```

**Popular displacement textures:**
- Perlin noise renders (organic transitions)
- Horizontal/vertical stripes (wiping effect)
- Diagonal lines (curtain effect)
- Water caustics (liquid feel)
- Radial gradients (center-out reveal)

---

## 6. SDF Reveal Transition <a name="sdf-reveal"></a>

Expanding shape reveals the next image:

```glsl
uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform float uProgress;
uniform vec2 uResolution;

varying vec2 vUv;

void main() {
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 center = vec2(0.5) * aspect;
  vec2 pos = vUv * aspect;

  // Expanding circle from center
  float radius = uProgress * 1.5;  // extend past 1.0 to fully cover
  float dist = distance(pos, center);
  float mask = smoothstep(radius, radius - 0.05, dist);

  vec4 t1 = texture2D(uTexture1, vUv);
  vec4 t2 = texture2D(uTexture2, vUv);

  gl_FragColor = mix(t1, t2, mask);
}
```

---

## 7. Radial Circle Reveal (2025 Technique) <a name="radial-reveal"></a>

From Arlind Aliu's Codrops tutorial — multiple warped circles expand and merge:

```glsl
uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform float uProgress;
uniform float uTime;
uniform vec2 uSize;

varying vec2 vUv;

float warpedNoise(vec2 point, float time) {
  float angle = atan(point.y, point.x) + time * 0.02;
  float w0 = (cos(angle) + 1.0) / 2.0;
  float w1 = (sin(2.0 * angle) + 1.0) / 2.0;
  float w2 = (cos(3.0 * angle) + 1.0) / 2.0;
  return (w0 + w1 + w2) / 3.0;
}

float warpedCircleSDF(vec2 pos, float rad, float time) {
  float a = sin(time * 0.2) * 0.25;
  float amt = 0.5 + a;
  float d = length(pos);
  d += warpedNoise(pos, time) * rad * amt;
  return d;
}

float softMin(float a, float b, float k) {
  return -log(exp(-k * a) + exp(-k * b)) / k;
}

// Radial arrangement of circles (optimized, no loops)
float radialCircles(vec2 p, float offset) {
  float count = 6.0;
  float angle = (2.0 * 3.14159) / count;
  float s = round(atan(p.y, p.x) / angle);
  float an = angle * s;
  vec2 q = vec2(offset * cos(an), offset * sin(an));
  return warpedCircleSDF(p - q, 25.0, uTime);
}

void main() {
  vec2 coords = vUv * uSize;
  vec2 center = vec2(0.1, 0.1) * uSize;

  float t = pow(uProgress, 1.5);  // easing
  float radius = t * 15.0;

  // Center circle
  float c1 = warpedCircleSDF(coords - center, radius, uTime);

  // Radial circle rings
  vec2 p = (vUv - 0.5) * uSize;
  float r1 = radialCircles(p, 0.1 * uSize.x);
  float r2 = radialCircles(p, 0.4 * uSize.x);

  // Soft merge all SDFs
  float merged = softMin(c1, r1, 0.01);
  merged = softMin(merged, r2, 0.01);

  float mask = step(merged, radius);

  vec4 t1 = texture2D(uTexture1, vUv);
  vec4 t2 = texture2D(uTexture2, vUv);

  gl_FragColor = mix(t1, t2, mask);
}
```

---

## 8. GL Transitions Compatibility <a name="gl-transitions"></a>

The [gl-transitions](https://gl-transitions.com/) project provides 100+ open-source
GLSL transitions with a standard API. They can be adapted to our system:

**GL Transitions API:**
```glsl
uniform float progress;   // 0 to 1
uniform float ratio;      // viewport width / height
vec4 getFromColor(vec2 uv);  // sample source image
vec4 getToColor(vec2 uv);    // sample target image

vec4 transition(vec2 uv) {
  // ... your transition logic ...
  return mix(getFromColor(uv), getToColor(uv), progress);
}
```

**Adapting to our system:**
```glsl
// Replace getFromColor/getToColor with our textures:
#define getFromColor(uv) texture2D(uTexture1, uv)
#define getToColor(uv) texture2D(uTexture2, uv)
#define ratio (uResolution.x / uResolution.y)

// Then paste any gl-transition code directly
```

---

## 9. GSAP + Theatre.js Sequencing <a name="sequencing"></a>

### GSAP: Simple progress animation

```typescript
import gsap from 'gsap'

// Trigger transition
function transitionTo(nextTexture: THREE.Texture) {
  material.uniforms.uTexture2.value = nextTexture
  material.uniforms.uProgress.value = 0

  gsap.to(material.uniforms.uProgress, {
    value: 1,
    duration: 1.5,
    ease: 'power2.inOut',
    onComplete: () => {
      // Swap: texture2 becomes the new texture1
      material.uniforms.uTexture1.value = nextTexture
      material.uniforms.uProgress.value = 0
    }
  })
}
```

### Theatre.js: Timeline-driven transition

```typescript
import { getProject, types } from '@theatre/core'

const project = getProject('Transitions')
const sheet = project.sheet('PageTransition')

const transObj = sheet.object('Transition', {
  progress: types.number(0, { range: [0, 1] }),
  noiseScale: types.number(4.0, { range: [1, 20] }),
  edgeSoftness: types.number(0.1, { range: [0.01, 0.5] }),
})

// Sync to shader
transObj.onValuesChange((values) => {
  material.uniforms.uProgress.value = values.progress
  material.uniforms.uNoiseScale.value = values.noiseScale
})

// Play the sequence
const sequence = sheet.sequence
sequence.play({ iterationCount: 1, range: [0, 2] }) // 2 second animation
```

---

## 10. React Integration Pattern <a name="react-pattern"></a>

```tsx
// components/TransitionPlane.tsx
import { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'

import transitionVert from '../shaders/transition.vert.glsl?raw'
import transitionFrag from '../shaders/transition.frag.glsl?raw'

interface TransitionPlaneProps {
  images: string[]      // array of image paths
  initialIndex?: number
}

export function TransitionPlane({ images, initialIndex = 0 }: TransitionPlaneProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const textures = useTexture(images)
  const currentIndex = useRef(initialIndex)
  const isTransitioning = useRef(false)

  const uniforms = useRef({
    uTexture1: { value: textures[initialIndex] },
    uTexture2: { value: textures[initialIndex] },
    uProgress: { value: 0 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  })

  const goTo = useCallback((index: number) => {
    if (isTransitioning.current || index === currentIndex.current) return
    isTransitioning.current = true

    const mat = materialRef.current
    if (!mat) return

    mat.uniforms.uTexture2.value = textures[index]
    mat.uniforms.uProgress.value = 0

    gsap.to(mat.uniforms.uProgress, {
      value: 1,
      duration: 1.5,
      ease: 'power2.inOut',
      onComplete: () => {
        mat.uniforms.uTexture1.value = textures[index]
        mat.uniforms.uProgress.value = 0
        currentIndex.current = index
        isTransitioning.current = false
      }
    })
  }, [textures])

  const next = useCallback(() => {
    const nextIdx = (currentIndex.current + 1) % textures.length
    goTo(nextIdx)
  }, [goTo, textures.length])

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime()
    }
  })

  return (
    <mesh onClick={next}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms.current}
        vertexShader={transitionVert}
        fragmentShader={transitionFrag}
        transparent
      />
    </mesh>
  )
}
```