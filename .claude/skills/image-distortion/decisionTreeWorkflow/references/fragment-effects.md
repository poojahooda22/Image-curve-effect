# Fragment Effects Reference

Fragment shaders control pixel colors. These effects distort how the texture is sampled
(UV manipulation) and how colors are mixed. They run after the vertex shader and operate
on every pixel of the rendered mesh.

## Table of Contents
1. [Simplex Noise GLSL](#noise)
2. [Noise Displacement on Hover](#noise-hover)
3. [Gooey Reveal Between Two Textures](#gooey-reveal)
4. [RGB Shift (Chromatic Aberration)](#rgb-shift)
5. [Displacement Map Transition](#displacement-map)
6. [SDF Circle Warp Reveal](#sdf-reveal)
7. [Film Grain Overlay](#grain)
8. [Combined Fragment Shader (Production)](#production-fragment)

---

## 1. Simplex Noise GLSL <a name="noise"></a>

Required by most effects. This is the Ashima Arts 3D simplex noise, widely used in WebGL:

```glsl
// noise.glsl — Include this at the top of shaders that need noise

// Simplex 3D noise (Ashima Arts)
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
  + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(
    dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(
    dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(
    dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
```

**Output range:** approximately -1.0 to 1.0.

---

## 2. Noise Displacement on Hover <a name="noise-hover"></a>

The core Unseen Studio image effect: when hovering, pixels near the mouse get displaced
by noise, creating an organic, living distortion.

### How it works

1. Compute a circular mask centered on the mouse position
2. Generate noise at the current UV + time offset
3. Use the mask to blend: pixels inside the circle get UV-shifted by noise
4. Result: organic, animated distortion that follows the cursor

### GLSL Implementation

```glsl
// Noise displacement on hover — fragment shader

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uMouse;           // 0-1, normalized to image bounds
uniform float uHoverProgress;  // 0-1, GSAP-tweened on hover enter/leave
uniform float uNoiseFrequency; // 4.0 default
uniform float uNoiseAmplitude; // 0.08 default

varying vec2 vUv;
varying vec2 vUvCover;

// snoise() defined above in noise.glsl

void main() {
  vec2 texCoords = vUvCover;

  // --- NOISE DISPLACEMENT ---
  // Generate noise at UV position, animated with time
  float n = snoise(vec3(vUv * uNoiseFrequency, uTime * 0.4));

  // Circular mask around mouse position
  // Flip Y because mouse Y is top-down, UV Y is bottom-up
  vec2 mouseUV = vec2(uMouse.x, 1.0 - uMouse.y);
  float dist = distance(vUv, mouseUV);
  float circle = smoothstep(0.3, 0.0, dist);  // soft circle, radius ~0.3

  // Apply displacement: noise * mask * progress * amplitude
  texCoords += n * circle * uHoverProgress * uNoiseAmplitude;

  vec4 color = texture2D(uTexture, texCoords);
  gl_FragColor = color;
}
```

### Adjusting the feel

| Parameter | Low Value | High Value | Effect |
|---|---|---|---|
| `uNoiseFrequency` | 2.0 | 12.0 | Smooth blobs → fine detail |
| `uNoiseAmplitude` | 0.02 | 0.15 | Subtle shimmer → heavy warp |
| Time multiplier | 0.1 | 1.0 | Slow drift → fast boil |
| Circle radius | 0.1 | 0.5 | Tight cursor → broad area |

---

## 3. Gooey Reveal Between Two Textures <a name="gooey-reveal"></a>

From the Codrops Gooey Image Hover Effects tutorial: reveals a second texture through
noise-bordered, organic blobs that follow the mouse.

### How it works

1. Create a circle SDF around the mouse position
2. Generate 3D noise offset by time (creates organic movement)
3. Add noise to the circle to get gooey edges
4. Use `smoothstep` to cut a sharp mask from the soft values
5. `mix()` between texture 1 and texture 2 using the mask

### GLSL Implementation

```glsl
// Gooey reveal — fragment shader

uniform sampler2D uTexture;
uniform sampler2D uTextureHover;
uniform float uTime;
uniform vec2 uMouse;           // -1 to 1 (screen normalized)
uniform vec2 uResolution;      // viewport dimensions
uniform float uHoverProgress;  // 0-1

varying vec2 vUv;

// snoise() from noise.glsl

float circle(vec2 st, float radius, float blurriness) {
  vec2 dist = st;
  return 1.0 - smoothstep(
    radius - (radius * blurriness),
    radius + (radius * blurriness),
    dot(dist, dist) * 4.0
  );
}

void main() {
  // Aspect-correct UV for circular shapes
  vec2 res = uResolution;
  vec2 st = gl_FragCoord.xy / res.xy - vec2(0.5);
  st.y *= res.y / res.x;  // correct aspect ratio

  // Mouse position in same space
  vec2 mouse = uMouse * -0.5;
  mouse.y *= res.y / res.x;
  mouse *= -1.0;

  // Circle following mouse
  vec2 circlePos = st + mouse;
  float c = circle(circlePos, 0.3 * uHoverProgress, 2.0) * 2.5;

  // Animated noise
  float offx = vUv.x + sin(vUv.y + uTime * 0.1);
  float offy = vUv.y - uTime * 0.1 - cos(uTime * 0.001) * 0.01;
  float n = snoise(vec3(offx, offy, uTime * 0.1) * 8.0) - 1.0;

  // Merge circle + noise into gooey mask
  float mask = smoothstep(0.4, 0.5, n + pow(c, 2.0));

  // Sample both textures
  vec4 image1 = texture2D(uTexture, vUv);
  vec4 image2 = texture2D(uTextureHover, vUv);

  // Blend using mask
  gl_FragColor = mix(image1, image2, mask);
}
```

**Key technique breakdown:**
- `circle()` creates a soft radial gradient from a point
- `pow(c, 2.0)` sharpens the circle falloff
- Adding noise to the circle before `smoothstep` creates the organic blob edges
- `smoothstep(0.4, 0.5, ...)` cuts a hard mask from the noisy value

---

## 4. RGB Shift (Chromatic Aberration) <a name="rgb-shift"></a>

Samples the R, G, B channels at slightly different UV positions, creating a prismatic
color fringing effect. Driven by velocity or hover state.

### GLSL Implementation

```glsl
// RGB shift — can be added to any fragment shader

uniform float uRGBShift;   // 0.0 to 0.05
uniform vec2 uOffset;      // velocity vector

vec3 rgbShift(sampler2D tex, vec2 uv, vec2 offset) {
  float r = texture2D(tex, uv + offset).r;
  vec2  gb = texture2D(tex, uv).gb;
  return vec3(r, gb);
}

// Usage in main():
// vec3 color = rgbShift(uTexture, vUvCover, uOffset * uRGBShift);
```

### Velocity-driven variant (stronger during movement)

```glsl
// In main():
vec2 rgbOffset = vec2(uScrollVelocity * 0.001, 0.0);
float r = texture2D(uTexture, vUvCover + rgbOffset).r;
float g = texture2D(uTexture, vUvCover).g;
float b = texture2D(uTexture, vUvCover - rgbOffset).b;
vec3 color = vec3(r, g, b);
```

---

## 5. Displacement Map Transition <a name="displacement-map"></a>

From the Codrops Distortion Hover Effects library: uses a grayscale displacement texture
to drive the transition between two images.

### GLSL Implementation

```glsl
// Displacement map transition — fragment shader

uniform sampler2D uTexture;
uniform sampler2D uTextureHover;
uniform sampler2D uDisplacement;   // grayscale displacement texture
uniform float uHoverProgress;      // 0-1
uniform float uEffectFactor;       // intensity, typically 0.5-1.0

varying vec2 vUv;

void main() {
  // Sample displacement map
  vec4 disp = texture2D(uDisplacement, vUv);

  // Offset UVs in opposite directions based on progress
  vec2 uv1 = vec2(
    vUv.x + uHoverProgress * (disp.r * uEffectFactor),
    vUv.y
  );
  vec2 uv2 = vec2(
    vUv.x - (1.0 - uHoverProgress) * (disp.r * uEffectFactor),
    vUv.y
  );

  vec4 tex1 = texture2D(uTexture, uv1);
  vec4 tex2 = texture2D(uTextureHover, uv2);

  gl_FragColor = mix(tex1, tex2, uHoverProgress);
}
```

**Displacement textures:** Grayscale images where brightness controls offset amount.
Stripes create wiping effects, noise creates organic transitions, geometric patterns
create structured reveals. Common sources: Perlin noise renders, stripe patterns,
water caustics.

---

## 6. SDF Circle Warp Reveal <a name="sdf-reveal"></a>

From the 2025 Codrops tutorial by Arlind Aliu: warped circles with noise-modulated
perimeters that merge smoothly for organic reveal effects.

### GLSL Implementation

```glsl
// SDF circle with warped perimeter

float warpedCircleNoise(vec2 point, float time) {
  float frequency = 1.0;
  float angle = atan(point.y, point.x) + time * 0.02;

  float w0 = (cos(angle * frequency) + 1.0) / 2.0;
  float w1 = (sin(2.0 * angle * frequency) + 1.0) / 2.0;
  float w2 = (cos(3.0 * angle * frequency) + 1.0) / 2.0;
  return (w0 + w1 + w2) / 3.0;
}

float circleSDF(vec2 pos, float rad, float time) {
  float a = sin(time * 0.2) * 0.25;
  float amt = 0.5 + a;
  float circle = length(pos);
  circle += warpedCircleNoise(pos, time) * rad * amt;
  return circle;
}

// Smooth merging of multiple SDFs
float softMax(float a, float b, float k) {
  return log(exp(k * a) + exp(k * b)) / k;
}
float softMin(float a, float b, float k) {
  return -softMax(-a, -b, k);
}

// Usage: merge two warped circles
// float c1 = circleSDF(coords - offset1, radius, time);
// float c2 = circleSDF(coords - offset2, radius, time);
// float merged = softMin(c1, c2, 0.01);
// float mask = step(merged, radius);
// vec4 color = mix(bgColor, texture2D(uTexture, vUv), mask);
```

**Key insight:** `softMin` creates smooth blending between SDFs where `max` would create
hard intersections. The `k` parameter controls blend softness (lower = smoother).

---

## 7. Film Grain Overlay <a name="grain"></a>

Adds subtle noise to the final color for a cinematic, textured feel.

```glsl
// Film grain — add to end of any fragment shader

float grain(vec2 uv, float time) {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453 + time);
}

// In main(), after computing final color:
// float g = grain(vUv * 1000.0, uTime) * uGrainIntensity;
// gl_FragColor = vec4(color.rgb + g - uGrainIntensity * 0.5, color.a);
```

The `- uGrainIntensity * 0.5` centers the grain around zero so it doesn't
brighten or darken the image overall.

---

## 8. Combined Fragment Shader (Production) <a name="production-fragment"></a>

This combines noise displacement, RGB shift, and grain in one shader:

```glsl
// image-plane.frag.glsl — Production combined fragment shader

uniform sampler2D uTexture;
uniform float uTime;
uniform float uScrollVelocity;
uniform vec2 uMouse;
uniform float uHoverProgress;
uniform float uAlpha;

// Config uniforms
uniform float uNoiseFrequency;   // default 4.0
uniform float uNoiseAmplitude;   // default 0.08
uniform float uRGBShift;         // default 0.0 (disabled), up to 0.03
uniform float uGrainIntensity;   // default 0.02

varying vec2 vUv;
varying vec2 vUvCover;

// snoise() from noise.glsl (prepended at compile time)

float grain(vec2 uv, float t) {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453 + t);
}

void main() {
  vec2 texCoords = vUvCover;

  // --- NOISE DISPLACEMENT (hover) ---
  float n = snoise(vec3(vUv * uNoiseFrequency, uTime * 0.4));
  vec2 mouseUV = vec2(uMouse.x, 1.0 - uMouse.y);
  float dist = distance(vUv, mouseUV);
  float circle = smoothstep(0.3, 0.0, dist);
  texCoords += n * circle * uHoverProgress * uNoiseAmplitude;

  // --- RGB SHIFT (scroll velocity) ---
  vec2 rgbOffset = vec2(uScrollVelocity * 0.001, 0.0) * uRGBShift;

  float r = texture2D(uTexture, texCoords + rgbOffset).r;
  float g = texture2D(uTexture, texCoords).g;
  float b = texture2D(uTexture, texCoords - rgbOffset).b;
  vec3 color = vec3(r, g, b);

  // --- FILM GRAIN ---
  float g2 = grain(vUv * 1000.0, uTime) * uGrainIntensity;
  color += g2 - uGrainIntensity * 0.5;

  gl_FragColor = vec4(color, uAlpha);
}
```

### Uniform defaults

```typescript
const FRAGMENT_DEFAULTS = {
  uNoiseFrequency: 4.0,
  uNoiseAmplitude: 0.08,
  uRGBShift: 0.0,       // set > 0 to enable
  uGrainIntensity: 0.02,
}
```