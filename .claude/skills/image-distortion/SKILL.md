# Image Distortion Skill

<!-- Add your skill instructions here -->
---
name: image-distortion-fx
description: >
  Build Unseen Studio-style WebGL image distortion effects using React Three Fiber,
  TypeScript, custom GLSL shaders, GSAP, @react-three/drei, and Theatre.js.
  Use this skill whenever the user asks to create image hover distortion, gooey image
  effects, scroll-driven shader deformation, noise displacement on images, WebGL image
  grids, liquid/fluid image effects, post-processing displacement passes, image plane
  bending on scroll, RGB shift effects, noise-masked image transitions, or any creative
  WebGL image effect in a React/TypeScript codebase. Also trigger when the user mentions
  "Unseen Studio style", "Codrops image effect", "shader image grid", "image warp on hover",
  "scroll velocity deformation", "gooey reveal", "noise displacement hover", or wants to
  build a projects/portfolio page with GPU-powered image effects. Even simple requests like
  "make images bend on scroll" or "add a hover distortion to my gallery" should use this skill.
  Covers the full pipeline: DOM-synced WebGL planes, vertex deformation, fragment shaders
  (noise displacement, RGB shift, grain), post-processing (EffectComposer), GSAP-driven
  animation, Theatre.js timeline integration, and performance optimization.
---

# Image Distortion FX Skill

Create production-grade, Unseen Studio-style WebGL image distortion effects in React TypeScript projects. This skill synthesizes techniques from five Codrops tutorials into a unified, composable system built on `@react-three/fiber`, `@react-three/drei`, GSAP, and Theatre.js.

## Table of Contents

1. [Architecture Overview](#architecture)
2. [Stack & Dependencies](#stack)
3. [Quick Start Decision Tree](#decisions)
4. [Implementation Workflow](#workflow)
5. [Reference Files](#references)
6. [Common Pitfalls](#pitfalls)
7. [Performance Checklist](#performance)

---

## 1. Architecture Overview <a name="architecture"></a>

The effect pipeline has five layers, each optional and composable:

```
Layer 1: DOM ↔ WebGL Sync     — Position WebGL planes to match HTML images
Layer 2: Vertex Deformation    — Bend/curve geometry via scroll velocity or hover
Layer 3: Fragment Distortion   — Noise displacement, RGB shift, gooey reveal
Layer 4: Post-Processing       — Full-screen passes (fluid trail, grain, color)
Layer 5: Transitions           — Noise-masked blends between scenes/images
```

**The Core Insight:** Images on screen are NOT `<img>` tags. They are textures mapped onto WebGL `PlaneGeometry` meshes. HTML exists for SEO/accessibility but the visual layer is entirely WebGL. This enables bending, distortion, and transitions impossible with CSS.

**How It Works (per frame):**
1. JavaScript reads DOM image positions via `getBoundingClientRect()`
2. WebGL planes are positioned to match (converting screen px → world units)
3. Uniforms (scroll velocity, mouse position, hover progress, time) are updated
4. Vertex shader deforms geometry (bend on scroll)
5. Fragment shader distorts texture sampling (noise displacement on hover)
6. Post-processing applies full-screen effects (fluid mouse trail, grain)

---

## 2. Stack & Dependencies <a name="stack"></a>

```json
{
  "@react-three/fiber": "^8.x",
  "@react-three/drei": "^9.x",
  "@react-three/postprocessing": "^2.x",
  "three": "^0.160+",
  "gsap": "^3.12+",
  "lenis": "^1.x",
  "@theatre/core": "^0.7+",
  "@theatre/studio": "^0.7+",
  "@theatre/r3f": "^0.7+",
  "typescript": "^5.x"
}
```

**Why each library:**
- `@react-three/fiber` — React renderer for Three.js, declarative scene graph
- `@react-three/drei` — Helpers: `useTexture`, `shaderMaterial`, `useScroll`
- `GSAP` — Tweening uniforms (hover progress, opacity, mouse smoothing)
- `Lenis` — Smooth scroll with velocity output for shader uniforms
- `Theatre.js` — Visual timeline editor for sequencing shader animations
- `@react-three/postprocessing` — EffectComposer for full-screen shader passes

---

## 3. Quick Start Decision Tree <a name="decisions"></a>

**What does the user want?**

| User Request | Layers Needed | Start With Reference |
|---|---|---|
| "Images bend on scroll" | 1 + 2 | `references/vertex-deformation.md` |
| "Gooey hover reveal" | 1 + 3 | `references/fragment-effects.md` |
| "Hover distortion + RGB shift" | 1 + 2 + 3 | Both vertex + fragment refs |
| "Full Unseen-style grid" | 1 + 2 + 3 + 4 | All references |
| "Image transition effect" | 1 + 5 | `references/transitions.md` |
| "Add grain/noise overlay" | 4 | `references/postprocessing.md` |

---

## 4. Implementation Workflow <a name="workflow"></a>

### Step 1: Read the relevant reference files

Before writing any code, read the reference files that match the user's request:
- `references/vertex-deformation.md` — Scroll bend, wave deformation shaders
- `references/fragment-effects.md` — Noise displacement, gooey reveal, RGB shift
- `references/postprocessing.md` — EffectComposer, grain, fluid mouse trail
- `references/transitions.md` — Noise-masked image transitions
- `references/architecture.md` — Full component architecture, DOM sync, Theatre.js

### Step 2: Scaffold the project structure

```
src/
├── components/
│   ├── WebGLCanvas.tsx          // R3F Canvas wrapper
│   ├── ImagePlane.tsx           // Individual image mesh
│   ├── ImageGrid.tsx            // Grid of synced image planes
│   └── PostProcessing.tsx       // EffectComposer setup
├── shaders/
│   ├── image-plane.vert.glsl   // Vertex shader (deformation)
│   ├── image-plane.frag.glsl   // Fragment shader (distortion)
│   ├── noise.glsl              // Simplex noise utility
│   └── post/
│       ├── fluid.frag.glsl     // Mouse trail displacement
│       └── grain.frag.glsl     // Film grain overlay
├── hooks/
│   ├── useDOMSync.ts           // Sync DOM positions → WebGL
│   ├── useScrollVelocity.ts    // Lenis scroll velocity
│   └── useMouseUniforms.ts     // Normalized mouse + smoothing
├── materials/
│   └── ImagePlaneMaterial.ts   // Custom ShaderMaterial factory
└── lib/
    └── theatre-setup.ts        // Theatre.js project + sheet init
```

### Step 3: Build the core components

Follow the architecture in `references/architecture.md` for the full component tree. The key pattern is:

```tsx
// WebGLCanvas.tsx — The R3F wrapper
<Canvas
  gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
  camera={{ fov: 45, near: 0.1, far: 1000, position: [0, 0, 50] }}
  style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none' }}
>
  <ImageGrid items={items} />
  <PostProcessing />
</Canvas>
```

### Step 4: Wire uniforms to interactions

Every effect is driven by uniforms updated from JavaScript:

| Uniform | Source | Controls |
|---|---|---|
| `uTime` | `useFrame` clock | Animation evolution |
| `uScrollVelocity` | Lenis `onScroll` | Vertex bend amount |
| `uMouse` | mousemove event | Distortion center |
| `uHoverProgress` | GSAP tween 0→1 | Reveal/distortion intensity |
| `uTexture` | `useTexture` | Image data |
| `uTextureHover` | `useTexture` | Secondary hover image |
| `uResolution` | viewport size | Aspect ratio correction |

### Step 5: Implement shaders

The vertex and fragment shaders are the heart of every effect. Each reference file contains production-ready GLSL with inline comments explaining every line. Key patterns:

**Vertex (scroll bend):**
```glsl
vec3 deformationCurve(vec3 pos, vec2 uv, float velocity) {
  pos.y -= sin(uv.x * PI) * velocity * -0.01;
  return pos;
}
```

**Fragment (noise displacement on hover):**
```glsl
vec2 texCoords = vUvCover;
float n = snoise(vec3(vUv * 4.0, uTime * 0.4));
float circle = 1.0 - distance(vec2(uMouse.x, (1.0 - uMouse.y) * aspect), vec2(vUv.x, vUv.y * aspect));
circle = smoothstep(0.0, 0.5, circle);
texCoords += n * circle * uHoverProgress * 0.08;
vec4 color = texture2D(uTexture, texCoords);
```

**Fragment (gooey reveal between two textures):**
```glsl
float c = circle(circlePos, 0.3, 2.0) * 2.5;
float n = snoise3(vec3(offx, offy, uTime * 0.1) * 8.0) - 1.0;
float mask = smoothstep(0.4, 0.5, n + pow(c, 2.0));
vec4 finalImage = mix(texture1Color, texture2Color, mask);
```

### Step 6: Add post-processing (if needed)

Use `@react-three/postprocessing` or raw `EffectComposer`:
```tsx
<EffectComposer>
  <RenderPass />
  <ShaderPass args={[fluidShader]} />  {/* mouse trail */}
  <ShaderPass args={[grainShader]} />  {/* film grain */}
</EffectComposer>
```

### Step 7: Integrate Theatre.js (if needed)

Theatre.js provides a visual timeline editor for sequencing:
```tsx
import { getProject, types } from '@theatre/core'
import { editable as e, SheetProvider } from '@theatre/r3f'

const project = getProject('ImageFX')
const sheet = project.sheet('Main')

// Animate shader uniforms via Theatre.js
const obj = sheet.object('HoverEffect', {
  distortionStrength: types.number(0, { range: [0, 1] }),
  noiseFrequency: types.number(4, { range: [1, 20] }),
  rgbShiftAmount: types.number(0, { range: [0, 0.1] }),
})
```

---

## 5. Reference Files <a name="references"></a>

**CRITICAL: Always read the relevant reference files before writing shader code.**

| File | Contents |
|---|---|
| `references/unseen-production-shaders.md` | **★ START HERE ★** Actual GLSL extracted from unseen.co via Spector.js — the ground truth vertex + fragment shaders with every magic number annotated |
| `references/architecture.md` | Full React component tree, DOM↔WebGL sync, hooks, TypeScript types, Theatre.js integration |
| `references/vertex-deformation.md` | Scroll bend shader, sine curve deformation, velocity-driven vertex displacement, PlaneGeometry subdivision |
| `references/fragment-effects.md` | Noise displacement, gooey reveal, RGB shift, stretch effect, mouse-driven distortion, simplex noise GLSL |
| `references/postprocessing.md` | EffectComposer setup, fluid mouse trail pass, grain shader, color correction, render targets |
| `references/transitions.md` | Noise-masked image transitions, progress-driven UV manipulation, creative blend techniques |

---

## 6. Common Pitfalls <a name="pitfalls"></a>

| Problem | Cause | Fix |
|---|---|---|
| Image appears stretched | Plane aspect doesn't match image | Use `coverUV` function in vertex shader to compute cover-fit UVs |
| Distortion stops at image edges | UV goes out of 0-1 range | Use `clamp()` or ensure texture `wrapS/wrapT = ClampToEdgeWrapping` |
| Shader compiles but nothing shows | Uniforms not connected | Log uniform values in `useFrame`; ensure textures are loaded before render |
| Scroll bend is too extreme | Raw scroll velocity is huge | Clamp velocity: `min(abs(velocity), 5.0) * sign(velocity)` |
| Plane position is wrong | Screen→world coordinate conversion | Use `viewSize` calculation (see architecture.md) to convert pixels to world units |
| Hover effect flickers | Mouse coordinates not normalized | Normalize to 0-1 range relative to image bounds, not viewport |
| Performance is bad | Too many shader passes or high-res textures | Reduce texture sizes, limit post-processing passes, use `dpr={[1, 1.5]}` on Canvas |
| Black plane on load | Texture not loaded yet | Use `useTexture` with `Suspense` boundary, or check `texture.image` before rendering |

---

## 7. Performance Checklist <a name="performance"></a>

- [ ] Set `dpr={[1, 1.5]}` on Canvas (cap pixel ratio)
- [ ] Compress textures (WebP, max 1024px for grid items)
- [ ] Use `PlaneGeometry(1, 1, 32, 32)` — 32 segments is enough for smooth bends
- [ ] Only update uniforms that changed (don't set all every frame)
- [ ] Use `useMemo` for geometry and material creation
- [ ] Dispose textures and materials on unmount
- [ ] Throttle scroll velocity updates (Lenis handles this)
- [ ] Use `visible={false}` on planes outside viewport (frustum culling)
- [ ] Post-processing: max 2-3 passes for 60fps on mid-range devices
- [ ] Theatre.js: only import `@theatre/studio` in development