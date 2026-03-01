# CLAUDE CLI PROMPT — Unseen Studio Scroll Bend Effect

Paste everything below this line into Claude CLI:

---

Build a scroll-driven image bend effect matching Unseen Studio's projects section (https://unseen.co/projects/). I have the exact production shaders extracted via Spector.js. Here's the complete technical spec:

## Stack
React 18+, TypeScript, @react-three/fiber, @react-three/drei, GSAP, Lenis (smooth scroll)

## What the effect does
A vertical grid of images. As user scrolls, images above the viewport curve dramatically backward in Z space (like a waterfall bending away). Images in view stay flat. The transition between flat→curved is smooth. All images have subtle ambient ripple animation.

## Scene Architecture
- Fixed `<Canvas>` overlays the page, `pointerEvents: none`
- HTML image grid underneath for SEO/accessibility (images hidden via `visibility: hidden`)
- Each image = a `PlaneGeometry` mesh with custom `ShaderMaterial`
- Planes positioned in world space matching DOM layout via `getBoundingClientRect()`
- Lenis smooth scroll drives the `u_bendPoint` uniform

## Vertex Shader (exact logic from production)

```glsl
uniform float u_time;
uniform float u_heightOffset;   // vertical compression, ~1.0 base, increases with scroll velocity
uniform vec2 u_bendPoint;       // THE KEY: vec2(bendEnd, bendStart) in world Y coords

varying vec2 vUv;
varying float zPos;

void main() {
  vUv = uv;
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;

  // Layer 1: ambient noise (large slow drift)
  float noise = sin((worldPos.x - worldPos.y * 0.1) * 0.03 + (-u_time) * 1.1 + cos(worldPos.z * 0.04) * 10.0) * 50.0;
  float noise2 = sin((worldPos.x + worldPos.y * 0.1) * 0.01 + (-u_time) * 0.4) * 0.5;

  vec3 pos = position;

  // Layer 2: ripple (fast diagonal surface wave)
  float ripple = sin((worldPos.x - worldPos.y) * 0.02 + (-u_time) * 2.0) * 12.0;
  pos.z += ripple;

  // Layer 3: MAIN SCROLL BEND — pushes Z by 1200 units above bend threshold!
  pos.z -= 1200.0 * smoothstep(u_bendPoint.x, u_bendPoint.y, worldPos.y);

  // Layer 4: noise in bend zone (organic irregularity)
  pos.z -= noise * smoothstep(u_bendPoint.x, u_bendPoint.y, worldPos.y);

  // Layer 5: Y compression (foreshortening in bend zone)
  pos.y -= (1.5 - noise2) * smoothstep(u_bendPoint.x * 1.1, u_bendPoint.y * 0.7, worldPos.y) * u_heightOffset;

  zPos = ripple;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

## Fragment Shader (exact logic from production)

```glsl
uniform sampler2D uTexture;
uniform vec2 u_imageSize;    // original image dimensions
uniform vec2 u_meshSize;     // plane dimensions in world units
uniform float u_innerScale;  // zoom, default 1.0
uniform float u_opacity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

varying vec2 vUv;
varying float zPos;

// Object-fit: cover equivalent
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

void main() {
  vec2 uv = backgroundCoverUv(u_meshSize, u_imageSize, vUv);
  uv = (uv - 0.5) / u_innerScale + 0.5;  // zoom from center

  vec4 color = texture2D(uTexture, uv);
  color.rgb += smoothstep(0.0, 10.0, zPos * 0.3) * 0.3;  // ripple brightening

  gl_FragColor = color;

  float depth = gl_FragCoord.z / gl_FragCoord.w;
  gl_FragColor.a *= smoothstep(2000.0, 1500.0, depth);     // depth fade
  float fogFactor = smoothstep(fogNear, fogFar, depth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  gl_FragColor.a *= u_opacity;
}
```

## Critical Implementation Details

1. **u_bendPoint is THE scroll driver.** It's a vec2 where .x = bend-complete threshold, .y = bend-start threshold (in world Y). As user scrolls down, both values decrease, sweeping the bend zone downward through the image grid.

2. **The bend is 1200 world units in Z.** This means:
   - Camera must be far enough back (z=50+ with matching FOV)
   - OR normalize everything: use 1.2 instead of 1200, 0.012 instead of 12, etc.

3. **smoothstep is the key function.** It creates the smooth 0→1 transition in the bend zone. Images fully below bendPoint.x = fully bent. Images fully above bendPoint.y = flat. Between = transitioning.

4. **Y compression happens at a DIFFERENT rate** than Z bend (note the 1.1x and 0.7x multipliers on bendPoint). This creates visual richness — the foreshortening doesn't perfectly match the Z curve.

5. **backgroundCoverUv()** is essential — without it, images stretch to fill non-matching aspect ratio planes.

## Scroll Wiring (JavaScript)

```typescript
const lenis = new Lenis({ duration: 1.2, smoothWheel: true })

lenis.on('scroll', ({ scroll, velocity }) => {
  const worldScroll = scroll * WORLD_UNITS_PER_PIXEL

  // Bend zone: starts just above viewport, extends upward
  const bendStart = -worldScroll + VIEWPORT_WORLD_HEIGHT * 0.8
  const bendEnd = bendStart - VIEWPORT_WORLD_HEIGHT * 0.3

  // Update ALL image materials
  materials.forEach(mat => {
    mat.uniforms.u_bendPoint.value.set(bendEnd, bendStart)
    mat.uniforms.u_heightOffset.value = 1.0 + Math.abs(velocity) * 0.05
  })
})
```

## File Structure
```
src/
  components/
    WebGLCanvas.tsx        — R3F Canvas with camera setup
    ImagePlane.tsx         — Individual image mesh with ShaderMaterial  
    ImageGrid.tsx          — Grid layout + DOM sync
  shaders/
    image-bend.vert.glsl  — Vertex shader above
    image-bend.frag.glsl  — Fragment shader above
  hooks/
    useDOMSync.ts          — getBoundingClientRect → world coords
    useScrollBend.ts       — Lenis scroll → u_bendPoint mapping
  lib/
    viewSize.ts            — Screen px ↔ world unit conversion
```

Please implement this as a complete, working React TypeScript project. Use placeholder images from picsum.photos. The key visual: images should dramatically curve backward like a waterfall as they scroll above the viewport.