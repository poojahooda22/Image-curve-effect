# Post-Processing Reference

Post-processing applies full-screen shader effects to the entire rendered scene. Instead
of distorting individual images, you distort the final render — enabling effects that span
across elements and respond to global inputs like the mouse position.

## Table of Contents
1. [Core Concept](#core-concept)
2. [EffectComposer Setup (Three.js)](#effect-composer)
3. [R3F Postprocessing Setup](#r3f-postprocessing)
4. [Mouse Trail Displacement Pass](#mouse-trail)
5. [Full-Screen RGB Split Pass](#rgb-split-pass)
6. [Fluid Distortion Pass](#fluid-pass)
7. [Grain Pass](#grain-pass)
8. [Render Targets for Scene Transitions (Unseen Style)](#render-targets)
9. [Performance Notes](#performance)

---

## 1. Core Concept <a name="core-concept"></a>

The Three.js renderer produces a 2D image (a texture). Post-processing takes that image
and runs it through one or more fragment shaders before displaying the final result.

```
Scene → Renderer → [Image A]
                       ↓
              ShaderPass 1 (displacement) → [Image B]
                                               ↓
                                      ShaderPass 2 (grain) → Screen
```

Each pass receives the previous pass's output as a texture uniform called `tDiffuse`.

**When to use post-processing vs per-mesh shaders:**
- Per-mesh: effects bound to individual images (hover distortion, noise displacement)
- Post-processing: effects that cross image boundaries (mouse trail, screen-wide RGB
  split, scene transitions)

---

## 2. EffectComposer Setup (Three.js) <a name="effect-composer"></a>

From the Codrops Interactive WebGL Hover Effects tutorial:

```typescript
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass'

// Set up post processing
const composer = new EffectComposer(renderer)
const renderPass = new RenderPass(scene, camera)
composer.addPass(renderPass)

// Custom shader pass for the whole screen
const customPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },           // auto-populated with previous pass output
    uMouse: { value: new THREE.Vector2() },
    uMouseVelocity: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `/* your shader here */`,
})
customPass.renderToScreen = true
composer.addPass(customPass)

// In animation loop: use composer.render() INSTEAD OF renderer.render()
function animate() {
  requestAnimationFrame(animate)
  composer.render()
}
```

---

## 3. R3F Postprocessing Setup <a name="r3f-postprocessing"></a>

Using `@react-three/postprocessing` for React Three Fiber projects:

```tsx
// components/PostProcessing.tsx
import { useRef, useMemo } from 'react'
import { useFrame, useThree, extend } from '@react-three/fiber'
import { EffectComposer, RenderPass, ShaderPass } from 'postprocessing'
import * as THREE from 'three'

// For custom passes, use the raw Three.js approach inside R3F:
import { EffectComposer as ThreeEffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass as ThreeRenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
import { ShaderPass as ThreeShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass'

export function PostProcessing() {
  const { gl, scene, camera, size } = useThree()
  const composerRef = useRef<ThreeEffectComposer>()

  const composer = useMemo(() => {
    const c = new ThreeEffectComposer(gl)
    c.addPass(new ThreeRenderPass(scene, camera))

    const fluidPass = new ThreeShaderPass(fluidShaderDef)
    c.addPass(fluidPass)

    const grainPass = new ThreeShaderPass(grainShaderDef)
    grainPass.renderToScreen = true
    c.addPass(grainPass)

    composerRef.current = c
    return c
  }, [gl, scene, camera])

  // Update size
  useMemo(() => {
    composer.setSize(size.width, size.height)
  }, [size, composer])

  // Render via composer instead of default
  useFrame(({ clock }) => {
    // Update uniforms
    const passes = composer.passes
    passes.forEach(pass => {
      if (pass instanceof ThreeShaderPass && pass.uniforms?.uTime) {
        pass.uniforms.uTime.value = clock.getElapsedTime()
      }
    })
    composer.render()
  }, 1) // priority 1 = runs after default render

  return null
}
```

**Alternative: use `@react-three/postprocessing` Effects for simpler cases:**

```tsx
import { EffectComposer, Noise, Vignette } from '@react-three/postprocessing'

function PostFX() {
  return (
    <EffectComposer>
      <Noise opacity={0.02} />
      <Vignette eskil={false} offset={0.1} darkness={1.1} />
    </EffectComposer>
  )
}
```

---

## 4. Mouse Trail Displacement Pass <a name="mouse-trail"></a>

The signature Unseen Studio / Jesper Landberg effect: a displacement field follows
the mouse, pushing nearby pixels away like water.

### Fragment Shader

```glsl
// post/fluid.frag.glsl

uniform sampler2D tDiffuse;
uniform vec2 uMouse;          // normalized 0-1
uniform vec2 uMouseVelocity;  // current velocity
uniform float uTime;
uniform vec2 uResolution;

varying vec2 vUv;

float circle(vec2 uv, vec2 center, float radius, float softness) {
  float dist = distance(uv, center);
  return 1.0 - smoothstep(radius - softness, radius + softness, dist);
}

void main() {
  vec2 uv = vUv;

  // Circle mask around mouse
  float c = circle(uv, uMouse, 0.0, 0.15 + length(uMouseVelocity) * 0.3);

  // Displacement: push pixels away from mouse based on velocity
  vec2 displacement = uMouseVelocity * c * 0.5;

  // RGB split within the displacement zone
  float r = texture2D(tDiffuse, uv + displacement * 1.0).r;
  float g = texture2D(tDiffuse, uv + displacement * 1.05).g;
  float b = texture2D(tDiffuse, uv + displacement * 1.1).b;

  gl_FragColor = vec4(r, g, b, 1.0);
}
```

### Alternative: Simple zoom displacement (from Codrops)

```glsl
// Simpler effect: pixels zoom toward/away from mouse
void main() {
  vec2 uv = vUv;
  float c = circle(uv, uMouse, 0.0, 0.2);

  // Mix UV between normal and mouse position = zoom effect
  vec2 newUV = mix(uv, uMouse, c * 0.3);
  gl_FragColor = texture2D(tDiffuse, newUV);
}
```

### Wiring Mouse Velocity

```typescript
// In the animation loop or useFrame:
const currentMouse = new THREE.Vector2()
const prevMouse = new THREE.Vector2()
const velocity = new THREE.Vector2()

window.addEventListener('mousemove', (e) => {
  currentMouse.set(
    e.clientX / window.innerWidth,
    1.0 - e.clientY / window.innerHeight  // flip Y
  )
})

// In animate/useFrame:
velocity.subVectors(currentMouse, prevMouse)
prevMouse.copy(currentMouse)

// Smooth the velocity (otherwise it's too jerky)
gsap.to(fluidPass.uniforms.uMouseVelocity.value, {
  x: velocity.x,
  y: velocity.y,
  duration: 0.3,
  ease: 'power2.out',
})
fluidPass.uniforms.uMouse.value.copy(currentMouse)
```

---

## 5. Full-Screen RGB Split Pass <a name="rgb-split-pass"></a>

```glsl
// post/rgb-split.frag.glsl

uniform sampler2D tDiffuse;
uniform vec2 uMouseVelocity;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  // Offset each channel by velocity * different multiplier
  float r = texture2D(tDiffuse, uv + uMouseVelocity * 0.5).r;
  float g = texture2D(tDiffuse, uv + uMouseVelocity * 0.525).g;
  float b = texture2D(tDiffuse, uv + uMouseVelocity * 0.55).b;

  gl_FragColor = vec4(r, g, b, 1.0);
}
```

---

## 6. Fluid Distortion Pass <a name="fluid-pass"></a>

Combines the mouse trail with noise for a fluid, water-like distortion:

```glsl
// post/fluid-noise.frag.glsl

uniform sampler2D tDiffuse;
uniform vec2 uMouse;
uniform vec2 uMouseVelocity;
uniform float uTime;

varying vec2 vUv;

// snoise() from noise.glsl

float circle(vec2 uv, vec2 center, float radius, float softness) {
  float dist = distance(uv, center);
  return 1.0 - smoothstep(radius - softness, radius + softness, dist);
}

void main() {
  vec2 uv = vUv;

  // Mouse influence
  float speed = length(uMouseVelocity);
  float c = circle(uv, uMouse, 0.0, 0.1 + speed * 0.5);

  // Noise for organic feel
  float n = snoise(vec3(uv * 5.0, uTime * 0.3)) * 0.5 + 0.5;

  // Combine: noise modulates the displacement direction
  vec2 displacement = uMouseVelocity * c * (0.3 + n * 0.2);

  vec4 color = texture2D(tDiffuse, uv + displacement);

  // Optional: slight color shift in displacement zone
  color.rgb = mix(color.rgb, color.rgb * vec3(1.05, 0.98, 1.02), c * 0.5);

  gl_FragColor = color;
}
```

---

## 7. Grain Pass <a name="grain-pass"></a>

```glsl
// post/grain.frag.glsl

uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uGrainIntensity;  // 0.02 default

varying vec2 vUv;

float random(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);

  float grain = random(vUv * 1000.0 + uTime) * uGrainIntensity;
  color.rgb += grain - uGrainIntensity * 0.5;

  gl_FragColor = color;
}
```

ShaderPass definition:
```typescript
const grainShaderDef = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrainIntensity: { value: 0.02 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: grainFragmentShader,
}
```

---

## 8. Render Targets for Scene Transitions (Unseen Style) <a name="render-targets"></a>

Unseen Studio renders different scenes/pages to separate render targets, then blends
them with a transition shader. This is how they achieve seamless page transitions.

```typescript
// Two render targets for scene A and scene B
const rtA = new THREE.WebGLRenderTarget(width, height)
const rtB = new THREE.WebGLRenderTarget(width, height)

// Render each scene to its target
renderer.setRenderTarget(rtA)
renderer.render(sceneA, camera)

renderer.setRenderTarget(rtB)
renderer.render(sceneB, camera)

// Final pass: blend with transition shader
renderer.setRenderTarget(null) // render to screen
transitionMesh.material.uniforms.tSceneA.value = rtA.texture
transitionMesh.material.uniforms.tSceneB.value = rtB.texture
transitionMesh.material.uniforms.uProgress.value = transitionProgress
renderer.render(transitionScene, orthoCamera)
```

**Transition fragment shader:**
```glsl
uniform sampler2D tSceneA;
uniform sampler2D tSceneB;
uniform float uProgress;
uniform float uTime;

varying vec2 vUv;

// snoise() from noise.glsl

void main() {
  vec4 a = texture2D(tSceneA, vUv);
  vec4 b = texture2D(tSceneB, vUv);

  // Noise-masked transition
  float n = snoise(vec3(vUv * 3.0, uTime * 0.2));
  float mask = smoothstep(uProgress - 0.3, uProgress + 0.3, vUv.x + n * 0.3);

  gl_FragColor = mix(a, b, mask);
}
```

---

## 9. Performance Notes <a name="performance"></a>

- Each pass is a full-screen draw call — limit to 2-3 passes max for 60fps
- Use half-resolution render targets (`width/2, height/2`) for expensive passes
- Grain is cheap; fluid displacement with noise is medium; blur is expensive
- On mobile, consider disabling post-processing entirely or using only grain
- Always profile: `renderer.info.render.calls` and `renderer.info.render.triangles`
- Dispose render targets on unmount: `renderTarget.dispose()`