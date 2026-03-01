# Unseen Studio Production Shaders — Spector.js Extract

This file contains the **actual GLSL shaders** running on https://unseen.co/projects/,
extracted via Spector.js WebGL debugger. These replace the approximated versions in
other reference files with ground truth.

## Table of Contents
1. [Architecture Diagram](#architecture)
2. [Production Vertex Shader (annotated)](#vertex)
3. [Production Fragment Shader (annotated)](#fragment)
4. [Critical Magic Numbers](#numbers)
5. [u_bendPoint Scroll Mapping](#scroll-mapping)
6. [Fluid Simulation Layer (advanced)](#fluid)
7. [Normalized-Scale Adaptation](#normalized)

---

## 1. Architecture Diagram <a name="architecture"></a>

```
┌─────────────────────────────────────────────────────────────┐
│                    UNSEEN STUDIO PIPELINE                     │
│                                                               │
│  Scroll (Lenis)                                               │
│    ├→ u_bendPoint (vec2) ──→ Vertex Shader: smoothstep bend  │
│    └→ u_heightOffset (float) ──→ Vertex: Y compression       │
│                                                               │
│  Time (rAF clock)                                             │
│    └→ u_time (float) ──→ Vertex: ripple + noise animation    │
│                                                               │
│  Mouse (fluid sim)                                            │
│    └→ u_fluidTex (sampler2D) ──→ Vertex: XY displacement     │
│                                  Fragment: luminance boost    │
│                                                               │
│  Per-image                                                    │
│    ├→ uTexture (sampler2D)                                    │
│    ├→ u_imageSize (vec2)                                      │
│    ├→ u_meshSize (vec2)                                       │
│    ├→ u_innerScale (float)                                    │
│    └→ u_opacity (float)                                       │
│                                                               │
│  Global                                                       │
│    ├→ fogColor (vec3)                                         │
│    ├→ fogNear (float)                                         │
│    └→ fogFar (float)                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Production Vertex Shader <a name="vertex"></a>

```glsl
// UNSEEN STUDIO — VERTEX SHADER
// Extracted via Spector.js, cleaned and annotated

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying float zPos;
varying vec3 vFluid;

uniform sampler2D u_fluidTex;
uniform float u_time;
uniform float u_heightOffset;
uniform vec2 u_bendPoint;  // vec2(bendComplete, bendStart) in world Y

void main() {
  vUv = uv;
  vViewDir = -vec3(modelViewMatrix * vec4(position, 1.0));
  vWorldPos = vec3(modelMatrix * vec4(position, 1.0));

  // ═══════════════════════════════════════════════════════
  // LAYER 1: AMBIENT NOISE
  // Large-scale sine wave for organic "breathing" motion
  // Uses worldPos for scene-coherent movement
  // ═══════════════════════════════════════════════════════
  float noise = sin(
    (vWorldPos.x - vWorldPos.y * 0.1) * 0.03   // low spatial frequency
    + (-u_time) * 1.1                            // slow time drift
    + cos(vWorldPos.z * 0.04) * 10.0             // Z-based phase variation
  ) * 50.0;                                      // BIG amplitude

  float noise2 = sin(
    (vWorldPos.x + vWorldPos.y * 0.1) * 0.01
    + (-u_time) * 0.4
  ) * 0.5;

  vec3 transformedPos = position;

  // ═══════════════════════════════════════════════════════
  // LAYER 2: SURFACE RIPPLE
  // Fast diagonal wave — gives "cloth in wind" feel
  // ═══════════════════════════════════════════════════════
  float ripple = sin(
    (vWorldPos.x - vWorldPos.y) * 0.02   // diagonal direction
    + (-u_time) * 2.0                     // 2x time = faster than noise
  ) * 12.0;

  transformedPos.z += ripple;

  // ═══════════════════════════════════════════════════════
  // LAYER 3: MAIN SCROLL BEND  ★ THE SIGNATURE EFFECT ★
  // smoothstep(edge0, edge1, x) returns:
  //   0 when x <= edge0 (below bend zone = fully curved)
  //   1 when x >= edge1 (above bend zone = flat)
  //   smooth 0→1 between
  // 
  // WAIT — the mapping is inverted here!
  //   u_bendPoint.x = lower threshold (bend complete)
  //   u_bendPoint.y = upper threshold (bend starts)
  //   worldPos.y > bendPoint.y → smoothstep = 1 → z -= 1200 → BENT
  //   worldPos.y < bendPoint.x → smoothstep = 0 → z unchanged → FLAT
  //
  // So images ABOVE the bend zone get pushed back!
  // ═══════════════════════════════════════════════════════
  transformedPos.z -= 1200.0 * smoothstep(u_bendPoint.x, u_bendPoint.y, vWorldPos.y);

  // ═══════════════════════════════════════════════════════
  // LAYER 4: NOISE IN BEND ZONE
  // Same smoothstep mask, but noise instead of constant
  // Makes the bend organic, not mechanical
  // ═══════════════════════════════════════════════════════
  transformedPos.z -= noise * smoothstep(u_bendPoint.x, u_bendPoint.y, vWorldPos.y);

  // ═══════════════════════════════════════════════════════
  // LAYER 5: VERTICAL COMPRESSION
  // Foreshortening: bent images also collapse in Y
  // Note DIFFERENT smoothstep range (1.1x, 0.7x multipliers)
  // This decouples Y compression from Z bend slightly
  // ═══════════════════════════════════════════════════════
  transformedPos.y -= (1.5 - noise2)
    * smoothstep(u_bendPoint.x * 1.1, u_bendPoint.y * 0.7, vWorldPos.y)
    * u_heightOffset;

  // ═══════════════════════════════════════════════════════
  // LAYER 6: FLUID SIMULATION (cursor interaction)
  // Project deformed pos to screen → sample fluid FBO → displace
  // ═══════════════════════════════════════════════════════
  #ifdef FLUID
    vec4 earlyProjection = projectionMatrix * modelViewMatrix * vec4(transformedPos, 1.0);
    vec2 screenSpace = earlyProjection.xy / earlyProjection.w * 0.5 + vec2(0.5);
    vec3 fluidColor = texture2D(u_fluidTex, screenSpace).rgb;
    vec2 fluidPos = -normalize(fluidColor.rgb).xy * 0.01 * vec2(1.0, u_heightOffset);
    vFluid = fluidColor;
    transformedPos.xy += fluidPos;
  #endif

  zPos = ripple;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformedPos, 1.0);
}
```

---

## 3. Production Fragment Shader <a name="fragment"></a>

```glsl
// UNSEEN STUDIO — FRAGMENT SHADER
// Extracted via Spector.js, cleaned and annotated

varying vec2 vUv;
varying vec3 vWorldPos;
varying float zPos;
varying vec3 vFluid;

uniform sampler2D uTexture;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform vec2 u_imageSize;
uniform vec2 u_meshSize;
uniform float u_innerScale;
uniform float u_opacity;

// ═══════════════════════════════════════════════════════
// COVER UV: CSS object-fit: cover for WebGL
// Computes UVs that fill the plane without stretching
// ═══════════════════════════════════════════════════════
vec2 backgroundCoverUv(vec2 screenSize, vec2 imageSize, vec2 uv) {
  float screenRatio = screenSize.x / screenSize.y;
  float imageRatio = imageSize.x / imageSize.y;

  vec2 newSize = screenRatio < imageRatio
    ? vec2(imageSize.x * (screenSize.y / imageSize.y), screenSize.y)
    : vec2(screenSize.x, imageSize.y * (screenSize.x / imageSize.x));

  vec2 newOffset = (screenRatio < imageRatio
    ? vec2((newSize.x - screenSize.x) / 2.0, 0.0)
    : vec2(0.0, (newSize.y - screenSize.y) / 2.0)) / newSize;

  return uv * screenSize / newSize + newOffset;
}

vec2 scaleOrigin = vec2(0.5, 0.5);

float luminance(vec3 color) {
  return dot(color, vec3(0.2125, 0.7154, 0.0721));
}

void main() {
  // Cover-fit UV
  vec2 uv = backgroundCoverUv(u_meshSize, u_imageSize, vUv);

  // Zoom from center
  uv = (uv - scaleOrigin) / u_innerScale + scaleOrigin;

  // Sample image
  vec4 imageColor = texture2D(uTexture, uv);

  // Ripple Z brightening: peaks glow slightly
  imageColor.rgb += smoothstep(0.0, 10.0, zPos * 0.3) * 0.3;

  // Fluid luminance boost
  #ifdef FLUID
    float lum = luminance(abs(vFluid));
    imageColor.rgb += lum * 0.15;
  #endif

  gl_FragColor = imageColor;

  // Depth-based alpha fade (bent images fade out)
  float depth = gl_FragCoord.z / gl_FragCoord.w;
  gl_FragColor.a *= smoothstep(2000.0, 1500.0, depth);

  // Distance fog
  float fogFactor = smoothstep(fogNear, fogFar, depth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);

  // Opacity control
  gl_FragColor.a *= u_opacity;
}
```

---

## 4. Critical Magic Numbers <a name="numbers"></a>

| Constant | Production Value | Purpose | Normalized (÷1000) |
|---|---|---|---|
| Z bend offset | `1200.0` | Main curve depth | `1.2` |
| Ripple amplitude | `12.0` | Surface wave | `0.012` |
| Noise amplitude | `50.0` | Ambient drift | `0.05` |
| Noise spatial freq | `0.03` | Broad waves | `30.0` (inverted) |
| Ripple spatial freq | `0.02` | Diagonal wave | `20.0` (inverted) |
| Noise time speed | `1.1` | Drift rate | `1.1` (unchanged) |
| Ripple time speed | `2.0` | Wave rate | `2.0` (unchanged) |
| Y compress base | `1.5` | Foreshorten amount | `0.0015` |
| Y compress smoothstep | `1.1×, 0.7×` | Offset from Z range | same ratios |
| Fluid XY displace | `0.01` | Cursor vertex push | `0.01` |
| Fluid luminance | `0.15` | Color boost from fluid | `0.15` |
| Z brightening | `0.3` | Ripple glow strength | `0.3` |
| Depth fade start | `1500.0` | Alpha begins fading | `1.5` |
| Depth fade end | `2000.0` | Fully transparent | `2.0` |

---

## 5. u_bendPoint Scroll Mapping <a name="scroll-mapping"></a>

`u_bendPoint` is the ONLY scroll-driven uniform that creates the bend. Understanding
its behavior is critical:

```
u_bendPoint = vec2(bendComplete, bendStart)

smoothstep(bendComplete, bendStart, worldPos.y) returns:
  0.0  when worldPos.y <= bendComplete  (image is flat, in viewport)  
  0→1  when worldPos.y is between bendComplete and bendStart
  1.0  when worldPos.y >= bendStart (image is fully bent backward)

So: images with worldPos.y ABOVE bendStart are fully curved.
    Images BELOW bendComplete are flat.
    The zone between is the smooth transition.
```

**JavaScript scroll mapping:**

```typescript
// Scene: images stacked vertically, Y increasing upward
// As user scrolls DOWN, we want images ABOVE viewport to bend

function updateBendPoint(scrollPosition: number) {
  // Convert scroll pixels to world Y units
  const worldScroll = scrollPosition * worldScale

  // The bend zone sits just above current scroll view
  const viewTop = -worldScroll + viewportWorldHeight  // top of visible area
  
  // bendStart: where bending BEGINS (upper edge)
  // bendComplete: where bending is FULLY APPLIED (even higher up)
  const bendStart = viewTop + viewportWorldHeight * 0.2  // slightly above view
  const bendComplete = bendStart + viewportWorldHeight * 0.5  // higher = full bend

  material.uniforms.u_bendPoint.value.set(bendStart, bendComplete)
  // Note: .x = lower value (bendStart), .y = higher value (bendComplete)
  // This matches smoothstep(lower, upper, worldY)
}
```

---

## 6. Fluid Simulation Layer <a name="fluid"></a>

The fluid sim is a **separate render pass** that runs every frame:

1. **Input:** Mouse velocity → paint into a velocity field texture
2. **Process:** Advect, diffuse, pressure-solve (Navier-Stokes on GPU)
3. **Output:** `u_fluidTex` — an FBO texture containing velocity/color data

**In the vertex shader:**
```glsl
// Project the ALREADY-DEFORMED vertex to find its screen position
vec4 earlyProjection = projectionMatrix * modelViewMatrix * vec4(transformedPos, 1.0);
vec2 screenSpace = earlyProjection.xy / earlyProjection.w * 0.5 + vec2(0.5);

// Sample the fluid sim at that screen position
vec3 fluidColor = texture2D(u_fluidTex, screenSpace).rgb;

// Displace the vertex XY based on fluid velocity direction
// -normalize() reverses direction (pushes vertices AWAY from fluid flow)
// 0.01 keeps displacement subtle
vec2 fluidPos = -normalize(fluidColor.rgb).xy * 0.01 * vec2(1.0, u_heightOffset);
transformedPos.xy += fluidPos;
```

**In the fragment shader:**
```glsl
// Fluid interaction adds subtle brightness
float lum = luminance(abs(vFluid));
imageColor.rgb += lum * 0.15;
```

**For a simpler implementation without full Navier-Stokes:**
- Use a mouse trail texture (render mouse position as soft circle each frame)
- Apply gaussian blur to the trail texture
- Use the blurred trail as `u_fluidTex`
- The vertex displacement will still work, just less physically accurate

---

## 7. Normalized-Scale Adaptation <a name="normalized"></a>

If building with standard R3F conventions (small scene, camera at z=5-50):

```typescript
// Divide world-scale constants by your scene scale factor
const SCALE = 1000  // Unseen uses ~1000x our scale

const BEND_Z = 1200 / SCALE       // → 1.2
const RIPPLE_AMP = 12 / SCALE     // → 0.012
const NOISE_AMP = 50 / SCALE      // → 0.05
const DEPTH_FADE_NEAR = 1500 / SCALE  // → 1.5
const DEPTH_FADE_FAR = 2000 / SCALE   // → 2.0

// Spatial frequencies stay the same (they operate on world coords)
// Time speeds stay the same (they're frame-rate independent)
// Multiplier ratios stay the same (1.1, 0.7, etc.)
```

**Or define them as uniforms for easy tweaking:**
```glsl
uniform float u_bendAmount;      // 1200 or 1.2
uniform float u_rippleAmplitude; // 12 or 0.012
uniform float u_noiseAmplitude;  // 50 or 0.05
```