# Vertex Deformation Reference

Vertex deformation bends and warps the geometry itself — the plane curves, stretches, and
flexes before the fragment shader even touches pixel colors. This is the foundation of the
Unseen Studio "images that feel alive" aesthetic.

## Table of Contents
1. [Core Concept](#core-concept)
2. [Scroll-Driven Bend (Unseen Style)](#scroll-bend)
3. [Hover Velocity Curve (Codrops Style)](#hover-curve)
4. [Cover UV (Aspect-Ratio Fix)](#cover-uv)
5. [Combined Vertex Shader (Production)](#production-vertex)
6. [Uniform Wiring](#uniform-wiring)

---

## 1. Core Concept <a name="core-concept"></a>

A `PlaneGeometry(1, 1, 32, 32)` has 33×33 = 1089 vertices arranged in a flat grid. The
vertex shader runs once per vertex and can move each one independently. By using UV
coordinates (which go 0→1 across the plane) we create spatially-varying deformation.

**The key math: `sin(uv * PI)`**

```
UV:      0.0 ─────── 0.5 ─────── 1.0
uv * π:  0.0 ─────── π/2 ─────── π
sin():   0.0 ─────── 1.0 ─────── 0.0
```

This creates a wave that peaks at the center and falls to zero at both edges. Multiply by
a velocity or offset value and you get **deformation that's strongest at the center of
the plane and zero at the edges** — the plane bends like a flag but stays anchored at its
boundaries.

**Why 32 segments?** Fewer than ~16 segments produce visible faceting. More than 64 is
wasteful. 32×32 gives smooth curves at reasonable vertex count (1089 vertices).

---

## 2. Scroll-Driven Bend (Unseen Style) <a name="scroll-bend"></a>

The signature Unseen Studio effect: images curve along the Y axis as the user scrolls,
proportional to scroll velocity.

### GLSL Implementation

```glsl
// image-plane.vert.glsl — Scroll bend variant

uniform float uScrollVelocity;  // from Lenis, typically -10 to +10
uniform float uBendStrength;    // config: 0.01 default, range 0-0.05

varying vec2 vUv;
varying vec2 vUvCover;

#define PI 3.1415926535897932384626433832795

void main() {
  vUv = uv;

  vec3 pos = position;

  // ---- SCROLL BEND ----
  // Clamp velocity so extreme scroll doesn't shatter the plane
  float velocity = clamp(uScrollVelocity, -10.0, 10.0);

  // sin(uv.x * PI) peaks at center, zero at left/right edges
  // Multiply by velocity * strength to bend proportional to scroll speed
  pos.y += sin(uv.x * PI) * velocity * uBendStrength;

  // Optional: slight Z push at center for depth
  pos.z += sin(uv.x * PI) * abs(velocity) * uBendStrength * 0.5;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

### How it looks

```
At rest (velocity = 0):          Scrolling down (velocity = 5):

┌──────────────────┐              ┌──────────────────┐
│                  │              │    ╱──────╲       │
│      IMAGE       │    →         │   ╱  IMAGE  ╲    │
│                  │              │  ╱            ╲   │
└──────────────────┘              └──────────────────┘
```

The plane appears to curve like a sheet of paper caught in a gust.

### Wiring from React

```typescript
// In useFrame callback
const velocity = scrollVelocityRef.current  // from Lenis
materialRef.current.uniforms.uScrollVelocity.value = velocity
```

---

## 3. Hover Velocity Curve (Codrops Style) <a name="hover-curve"></a>

From the Motion Hover Effects tutorial: a floating image plane follows the mouse cursor,
and the velocity of the tween (the difference between animated position and target)
creates sine-curve deformation.

### GLSL Implementation

```glsl
// Hover velocity bend — from Codrops Effect 1

uniform vec2 uOffset;  // velocity vector: (currentPos - targetPos) * -strength

varying vec2 vUv;

#define PI 3.1415926535897932384626433832795

vec3 deformationCurve(vec3 position, vec2 uv, vec2 offset) {
  // X deformation: bend along Y axis, driven by horizontal velocity
  position.x = position.x + (sin(uv.y * PI) * offset.x);
  // Y deformation: bend along X axis, driven by vertical velocity
  position.y = position.y + (sin(uv.x * PI) * offset.y);
  return position;
}

void main() {
  vUv = uv;
  vec3 newPosition = deformationCurve(position, uv, uOffset);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
```

### Velocity Calculation (JavaScript)

```typescript
// The key insight: velocity = current animated position - target position
// GSAP tweens the plane toward the mouse; during the tween the "lag" IS the velocity

const targetPosition = new THREE.Vector3(worldX, worldY, 0)

gsap.to(mesh.position, {
  x: worldX,
  y: worldY,
  duration: 1,
  ease: 'power4.out',
  onUpdate: () => {
    // Offset = how far behind the plane is lagging
    const offset = mesh.position.clone()
      .sub(targetPosition)
      .multiplyScalar(-strength) // strength ≈ 0.25
    material.uniforms.uOffset.value.copy(offset)
  }
})
```

### Combined with UV offset (Stretch effect)

```glsl
// Codrops Effect 3: Stretch — also shift UVs by the offset
void main() {
  vUv = uv + (uOffset * 2.0);  // shift UVs = image slides within the plane
  vec3 newPosition = deformationCurve(position, uv, uOffset);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
```

---

## 4. Cover UV (Aspect-Ratio Fix) <a name="cover-uv"></a>

**This is critical.** If the texture aspect ratio doesn't match the plane, the image
stretches. We compute `cover`-fit UVs in the vertex shader, similar to CSS
`object-fit: cover`.

```glsl
// Cover UV computation — pass uTextureSize and uQuadSize as uniforms

uniform vec2 uTextureSize;  // e.g. vec2(1920.0, 1080.0)
uniform vec2 uQuadSize;     // e.g. vec2(400.0, 300.0) — plane's pixel dimensions

varying vec2 vUvCover;

vec2 getCoverUV(vec2 uv, vec2 textureSize, vec2 quadSize) {
  vec2 ratio = vec2(
    min((quadSize.x / quadSize.y) / (textureSize.x / textureSize.y), 1.0),
    min((quadSize.y / quadSize.x) / (textureSize.y / textureSize.x), 1.0)
  );
  return vec2(
    uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
    uv.y * ratio.y + (1.0 - ratio.y) * 0.5
  );
}

void main() {
  vUv = uv;
  vUvCover = getCoverUV(uv, uTextureSize, uQuadSize);
  // ... deformation code ...
}
```

**In the fragment shader, always sample with `vUvCover` instead of `vUv`:**
```glsl
vec4 color = texture2D(uTexture, vUvCover);
```

---

## 5. Combined Vertex Shader (Production) <a name="production-vertex"></a>

This combines scroll bend + cover UV in one shader:

```glsl
// image-plane.vert.glsl — Production combined vertex shader

uniform float uScrollVelocity;
uniform float uBendStrength;
uniform vec2 uTextureSize;
uniform vec2 uQuadSize;

varying vec2 vUv;
varying vec2 vUvCover;

#define PI 3.1415926535897932384626433832795

vec2 getCoverUV(vec2 uv, vec2 textureSize, vec2 quadSize) {
  vec2 ratio = vec2(
    min((quadSize.x / quadSize.y) / (textureSize.x / textureSize.y), 1.0),
    min((quadSize.y / quadSize.x) / (textureSize.y / textureSize.x), 1.0)
  );
  return vec2(
    uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
    uv.y * ratio.y + (1.0 - ratio.y) * 0.5
  );
}

void main() {
  vUv = uv;
  vUvCover = getCoverUV(uv, uTextureSize, uQuadSize);

  vec3 pos = position;

  // Scroll bend: curve Y based on scroll velocity
  float vel = clamp(uScrollVelocity, -10.0, 10.0);
  pos.y += sin(uv.x * PI) * vel * uBendStrength;
  pos.z += sin(uv.x * PI) * abs(vel) * uBendStrength * 0.5;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

---

## 6. Uniform Wiring <a name="uniform-wiring"></a>

```typescript
// In useFrame or onUpdate callback:

// Scroll velocity from Lenis
material.uniforms.uScrollVelocity.value = scrollVelocityRef.current

// Bend strength (can be from Theatre.js or config)
material.uniforms.uBendStrength.value = config.bendStrength // default 0.01

// Texture size (set once after texture loads)
if (texture.image) {
  material.uniforms.uTextureSize.value.set(
    texture.image.width,
    texture.image.height
  )
}

// Quad size (updated on resize and DOM sync)
material.uniforms.uQuadSize.value.set(
  mesh.scale.x,  // world-space width
  mesh.scale.y   // world-space height
)
```