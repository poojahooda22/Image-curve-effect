# Unseen Studio Image Bend — Reverse-Engineered Shader Reference

> Feed this file to Claude CLI when building the scroll-driven curved image effect.
> Source: Unseen Studio projects section, extracted via Spector.js.

---

## ARCHITECTURE SUMMARY

Unseen Studio's image grid uses **large WebGL plane meshes** (not small 1×1 planes) positioned in 3D world space. Each image is a `ShaderMaterial` with custom vertex + fragment shaders. The system has **5 layers of deformation** applied in the vertex shader, plus a **fluid simulation texture** that feeds back into vertex displacement.

### The Pipeline (per frame)

```
1. Lenis/custom smooth scroll → updates u_bendPoint uniform (vec2)
2. Fluid simulation runs on separate FBO → outputs u_fluidTex (sampler2D)
3. Vertex shader:
   a. Compute world position
   b. Add ambient ripple wave (cosmetic, always active)
   c. Apply main scroll BEND (the big curve — 1200 units Z push!)
   d. Add noise deformation to bend zone
   e. Compress Y height in bend zone (parallax collapse)
   f. Project to screen space early → sample fluid texture → displace XY by fluid
4. Fragment shader:
   a. Cover-fit UV (object-fit: cover)
   b. Inner scale zoom
   c. Brighten pixels by ripple Z position
   d. Brighten pixels by fluid luminance
   e. Depth-based alpha fade + fog
```

---

## CRITICAL UNIFORMS

```typescript
// These are the uniforms that drive the effect:

u_time: float           // elapsed time in seconds, drives all animation
u_bendPoint: vec2       // THE KEY SCROLL UNIFORM
                        // .x = start of bend zone (world Y)
                        // .y = end of bend zone (world Y)  
                        // As user scrolls, these shift to curve images
                        // above a certain Y threshold
u_heightOffset: float   // vertical compression factor, scroll-driven
u_fluidTex: sampler2D   // fluid simulation render target texture
                        // (can be omitted for simpler version)

// Fragment uniforms:
u_imageSize: vec2       // original image dimensions (px)
u_meshSize: vec2        // mesh dimensions in world units
u_innerScale: float     // zoom level (1.0 = no zoom, >1 = zoomed in)
u_opacity: float        // fade control
fogColor: vec3          // background color for depth fog
fogNear: float          // fog start distance
fogFar: float           // fog end distance
```

---

## VERTEX SHADER — ANNOTATED GLSL (the important parts)

```glsl
// ============================================================
// UNSEEN STUDIO — VERTEX SHADER (cleaned from Spector capture)
// ============================================================

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying float zPos;       // passed to fragment for z-based brightening
varying vec3 vFluid;      // fluid color passed to fragment

uniform sampler2D u_fluidTex;
uniform float u_time;
uniform float u_heightOffset;  // scroll-driven vertical compression
uniform vec2 u_bendPoint;      // scroll-driven bend threshold (world Y range)

void main() {
  vUv = uv;
  vViewDir = -vec3(modelViewMatrix * vec4(position, 1.0));
  vWorldPos = vec3(modelMatrix * vec4(position, 1.0));

  // ----------------------------------------------------------
  // LAYER 1: AMBIENT NOISE (always active, cosmetic movement)
  // ----------------------------------------------------------
  // Large-scale sine wave that drifts with time
  // Uses world position so all images share coherent motion
  float noise = sin(
    (vWorldPos.x - vWorldPos.y * 0.1) * 0.03  // spatial frequency
    + (-u_time) * 1.1                           // time scroll
    + cos(vWorldPos.z * 0.04) * 10.0            // Z-based phase offset
  ) * 50.0;                                     // amplitude: 50 units

  // Secondary slower noise for Y compression
  float noise2 = sin(
    (vWorldPos.x + vWorldPos.y * 0.1) * 0.01
    + (-u_time) * 0.4
  ) * 0.5;

  vec3 transformedPos = position;

  // ----------------------------------------------------------
  // LAYER 2: RIPPLE (subtle surface wave, always active)
  // ----------------------------------------------------------
  float ripple = sin(
    (vWorldPos.x - vWorldPos.y) * 0.02   // diagonal wave
    + (-u_time) * 2.0                     // faster than noise
  ) * 12.0;                               // amplitude: 12 units

  transformedPos.z += ripple;

  // ----------------------------------------------------------
  // LAYER 3: THE MAIN SCROLL BEND (this is the signature effect!)
  // ----------------------------------------------------------
  // smoothstep creates a gradient from 0→1 between bendPoint.x and bendPoint.y
  // Everything ABOVE bendPoint.y gets fully bent
  // Everything BELOW bendPoint.x stays flat
  // The zone between them is the transition
  //
  // 1200 units is MASSIVE — this pushes images far back in Z
  // creating the dramatic curve-away effect as you scroll
  transformedPos.z -= 1200.0 * smoothstep(u_bendPoint.x, u_bendPoint.y, vWorldPos.y);

  // ----------------------------------------------------------
  // LAYER 4: NOISE IN BEND ZONE (organic irregularity)
  // ----------------------------------------------------------
  // The ambient noise is ALSO applied in the bend zone
  // This prevents the bend from looking too mechanical/uniform
  transformedPos.z -= noise * smoothstep(u_bendPoint.x, u_bendPoint.y, vWorldPos.y);

  // ----------------------------------------------------------
  // LAYER 5: Y COMPRESSION (vertical collapse in bend zone)
  // ----------------------------------------------------------
  // As images bend away, they also compress vertically
  // This creates the foreshortening / perspective collapse effect
  // Note slightly different smoothstep range (1.1x start, 0.7x end)
  transformedPos.y -= (1.5 - noise2)
    * smoothstep(u_bendPoint.x * 1.1, u_bendPoint.y * 0.7, vWorldPos.y)
    * u_heightOffset;

  // ----------------------------------------------------------
  // LAYER 6: FLUID SIMULATION DISPLACEMENT (optional)
  // ----------------------------------------------------------
  // Project the DEFORMED vertex to screen space to know where
  // it will appear, then sample the fluid sim at that pixel
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

### KEY INSIGHT: How u_bendPoint drives the scroll

```
Scroll at top (no bend):     u_bendPoint = vec2(99999, 99999)
                             → smoothstep never triggers
                             → all images flat

Scrolling down:              u_bendPoint = vec2(500, 800)
                             → images above Y=800 are fully curved
                             → images between Y=500-800 transition
                             → images below Y=500 stay flat

Scroll further:              u_bendPoint = vec2(-200, 100)
                             → bend zone moves down
                             → more images curve away
```

The JavaScript updates `u_bendPoint` based on scroll position. The range between .x and .y controls how gradual the bend transition is.

---

## FRAGMENT SHADER — ANNOTATED GLSL

```glsl
// ============================================================
// UNSEEN STUDIO — FRAGMENT SHADER (cleaned from Spector capture)
// ============================================================

varying vec2 vUv;
varying vec3 vWorldPos;
varying float zPos;      // ripple Z from vertex shader
varying vec3 vFluid;     // fluid color from vertex shader

uniform sampler2D uTexture;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform vec2 u_imageSize;   // original image pixel dimensions
uniform vec2 u_meshSize;    // mesh world-space dimensions
uniform float u_innerScale; // zoom factor
uniform float u_opacity;

// ----------------------------------------------------------
// COVER UV: object-fit: cover equivalent for WebGL
// ----------------------------------------------------------
// This is how they handle different aspect ratio images
// on same-shaped planes without stretching
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
  // Step 1: Cover-fit UVs
  vec2 uv = backgroundCoverUv(u_meshSize, u_imageSize, vUv);

  // Step 2: Inner scale (zoom from center)
  uv = (uv - scaleOrigin) / u_innerScale + scaleOrigin;

  // Step 3: Sample texture
  vec4 imageColor = texture2D(uTexture, uv);

  // Step 4: Z-position brightening
  // Ripple peaks get slightly brighter → subtle 3D lighting feel
  imageColor.rgb += smoothstep(0.0, 10.0, zPos * 0.3) * 0.3;

  // Step 5: Fluid luminance brightening
  #ifdef FLUID
    float lum = luminance(abs(vFluid));
    imageColor.rgb += lum * 0.15;
  #endif

  gl_FragColor = imageColor;

  // Step 6: Depth-based alpha fade
  // Images far away in Z fade out (the bent-away ones disappear)
  float depth = gl_FragCoord.z / gl_FragCoord.w;
  gl_FragColor.a *= smoothstep(2000.0, 1500.0, depth);

  // Step 7: Fog
  float fogFactor = smoothstep(fogNear, fogFar, depth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);

  // Step 8: Opacity control
  gl_FragColor.a *= u_opacity;
}
```

---

## WHAT TO TELL CLAUDE CLI

### Minimal version (no fluid sim):

```
Build a React Three Fiber component that recreates the Unseen Studio projects
section scroll-bend effect. Here are the exact production shaders extracted from
their site via Spector.js:

VERTEX SHADER BEHAVIOR:
- Images are large planes in world space (not normalized 1x1)
- 5 deformation layers applied to vertex Z and Y:
  1. Ambient noise: sin((worldPos.x - worldPos.y*0.1) * 0.03 + -time*1.1 + cos(worldPos.z*0.04)*10) * 50
  2. Ripple: sin((worldPos.x - worldPos.y) * 0.02 + -time*2) * 12
  3. MAIN BEND: z -= 1200 * smoothstep(bendPoint.x, bendPoint.y, worldPos.y)
  4. Noise in bend zone: z -= noise * smoothstep(bendPoint.x, bendPoint.y, worldPos.y)  
  5. Y compression: y -= (1.5 - noise2) * smoothstep(bendPoint.x*1.1, bendPoint.y*0.7, worldPos.y) * heightOffset

- u_bendPoint (vec2) is THE key scroll uniform — it defines a world-Y range
  where the bend transition happens. JavaScript shifts this range as user scrolls.
- u_heightOffset controls vertical foreshortening in bend zone.

FRAGMENT SHADER BEHAVIOR:
- backgroundCoverUv() for object-fit:cover UV mapping
- Inner scale zoom from center
- Z-position brightening: smoothstep(0, 10, zPos*0.3) * 0.3 added to RGB
- Depth alpha fade: smoothstep(2000, 1500, depth) 
- Distance fog blending

SCROLL WIRING:
- Use Lenis for smooth scroll
- Map scroll position to u_bendPoint.xy (shift the bend zone down as user scrolls)
- Map scroll to u_heightOffset (increase compression as content scrolls away)
- The bend pushes Z by 1200 units — camera FOV and distance must accommodate this

Stack: React, TypeScript, @react-three/fiber, @react-three/drei, GSAP, Lenis
```

### Full version (with fluid sim):

```
Add to above:

FLUID SIMULATION LAYER:
- A separate fluid sim runs each frame into a render target (u_fluidTex)
- In vertex shader: project deformed position to screen space EARLY,
  sample fluid texture at that screen position, then displace XY by
  -normalize(fluidColor).xy * 0.01
- In fragment shader: add luminance(abs(fluidColor)) * 0.15 to image brightness
- The fluid sim is mouse-driven — cursor movement creates velocity field
- This creates the "images react to cursor" displacement effect
```

---

## NUMBERS THAT MATTER

These are the actual magic numbers from the production shaders:

| Constant | Value | Purpose |
|---|---|---|
| Main bend Z offset | `1200.0` | How far back images push (massive!) |
| Ripple amplitude | `12.0` | Subtle surface wave |
| Noise amplitude | `50.0` | Large-scale drift |
| Noise spatial freq | `0.03` | Low frequency = broad waves |
| Ripple spatial freq | `0.02` | Diagonal wave pattern |
| Noise time speed | `1.1` | Drift speed |
| Ripple time speed | `2.0` | Surface animation speed |
| Y compression factor | `1.5` | Base height reduction |
| Y compression smoothstep | `1.1x start, 0.7x end` | Slightly different range than Z bend |
| Fluid displacement | `0.01` | Very subtle vertex push |
| Fluid brightness | `0.15` | Subtle color boost |
| Z brightening | `0.3` | Ripple-peak glow |
| Depth fade range | `1500-2000` | Alpha fade for distant images |
| Cover UV scale origin | `vec2(0.5)` | Zoom from center |

---

## GEOMETRY SETUP

The planes are NOT small 1×1 geometry. They are **world-scale meshes** matching the
actual pixel dimensions of images (or proportional to them). This is why:

- `u_bendPoint` operates in **world Y coordinates** (large numbers like 500, 800)
- The bend offset is **1200 units** (proportional to scene scale)
- `u_meshSize` and `u_imageSize` are actual pixel-scale values

For R3F implementation, you have two choices:
1. **World-scale** (match Unseen): large planes, large camera distance, large bend values
2. **Normalized** (simpler): 1×1 planes, divide all constants by ~1000, closer camera

Option 2 is easier. Divide the magic numbers accordingly:
- Bend: `1.2` instead of `1200`
- Ripple: `0.012` instead of `12`  
- Noise: `0.05` instead of `50`
- Depth fade: `1.5-2.0` instead of `1500-2000`

---

## SCROLL → UNIFORM MAPPING (JavaScript side)

```typescript
// This is the critical scroll wiring

import Lenis from 'lenis'

const lenis = new Lenis({ smooth: true })

// Scene layout: images stacked vertically in world space
// Total content height in world units: e.g. 5000

lenis.on('scroll', ({ scroll, velocity }) => {
  // Map scroll position to bend zone
  // As user scrolls down, the bend zone moves down in world Y
  const scrollY = scroll // current scroll position in pixels
  const worldScroll = scrollY * worldUnitsPerPixel // convert to world units
  
  // bendPoint.x = where bend STARTS (soft edge)
  // bendPoint.y = where bend is COMPLETE (full curve)
  // The gap between them controls transition width
  const bendStart = -worldScroll + viewportWorldHeight * 0.8
  const bendEnd = bendStart - viewportWorldHeight * 0.3
  
  material.uniforms.u_bendPoint.value.set(bendEnd, bendStart)
  
  // Height offset increases with scroll for more foreshortening
  material.uniforms.u_heightOffset.value = 1.0 + Math.abs(velocity) * 0.1
})
```

The exact mapping depends on your scene scale and layout. The principle:
- `u_bendPoint` slides down in world Y as user scrolls
- Images above the bend zone curve away in Z
- Images below stay flat
- The transition zone creates the smooth curve