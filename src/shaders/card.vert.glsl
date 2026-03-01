uniform float uBend;              // 0..1, damped scroll velocity factor
uniform float uAnchorSide;        // -1.0 = left anchor (col 0), +1.0 = right anchor (col 1)
uniform float uTime;              // elapsed time for animation
uniform float uIdleBendStrength;  // amplitude of idle flex (e.g. 0.20)
uniform float uIdleBendSpeed;     // oscillation speed (e.g. 0.8 rad/s)
uniform float uPhaseOffset;       // per-card offset so cards don't pulse in unison
uniform float uDistortStrength;   // depth of edge curve (e.g. 0.7)
uniform float uEdgeWidth;         // fraction of mesh width affected (e.g. 0.45)
uniform float uCenterPow;         // sharpness exponent for Y profile (e.g. 2.0)
uniform float uHover;             // 0..1, damped hover progress
uniform vec2  uPointerUv;         // UV position of pointer on card
uniform float uGridHeight;        // total grid height for normalization
uniform float uBendZAmount;       // max Z displacement at full bend (e.g. 1.5)
uniform float uBendYCompress;     // Y foreshortening factor (e.g. 0.15)

#define PI 3.14159265358979

varying vec2 vUv;
varying float vZ;           // Z depth passed to fragment for brightening

void main() {
  vUv = uv;
  vec3 pos = position;

  // Capture original normalized coords before any deformation
  float xN = position.x + 0.5;       // 0=left, 1=right
  float yN_orig = position.y + 0.5;  // 0=bottom, 1=top

  // ============================================================
  // WORLD POSITION — for coherent scene-wide effects
  // ============================================================
  vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);

  // ============================================================
  // ROLLING SHEET BEND (Unseen-style coherent world-Y bend)
  // ============================================================
  // Normalize vertex world-Y across the grid (0=bottom, 1=top)
  float halfGrid = uGridHeight * 0.5;
  float yNormGrid = clamp((worldPos4.y + halfGrid) / uGridHeight, 0.0, 1.0);

  // Smooth profile: top of grid bends most, bottom stays flat
  float bendProfile = smoothstep(0.1, 0.9, yNormGrid);

  // Time-animated idle bend (always active, smooth sine oscillation)
  float idlePhase = uTime * uIdleBendSpeed + uPhaseOffset;
  float idleBend = uIdleBendStrength * (0.6 + 0.4 * sin(idlePhase));

  // Combine idle + scroll-driven bend
  float totalBend = idleBend + uBend;

  // Z displacement: push outward (toward camera) proportional to bend * profile
  pos.z += totalBend * uBendZAmount * bendProfile;

  // Y compression (foreshortening in bend zone)
  pos.y -= totalBend * uBendYCompress * bendProfile;

  // ============================================================
  // AMBIENT VERTEX RIPPLE (organic breathing, always active)
  // Uses world position for scene-coherent movement
  // ============================================================
  float ripple = sin(worldPos4.x * 2.0 + worldPos4.y * 3.0 + uTime * 0.8) * 0.05;
  ripple += sin(worldPos4.x * 5.0 - worldPos4.y * 2.0 + uTime * 1.2) * 0.012;
  pos.z += ripple;

  // ============================================================
  // EDGE DISTORTION (Y-profiled, one-side only)
  // ============================================================
  // Y profile: peaks at vertical center, zero at top/bottom
  float centerCurve = pow(sin(PI * yN_orig), uCenterPow);

  // Edge mask: confine distortion to one edge based on column
  float edgeMask = (uAnchorSide < 0.0)
    ? 1.0 - smoothstep(0.0, uEdgeWidth, xN)          // left edge
    : smoothstep(1.0 - uEdgeWidth, 1.0, xN);          // right edge

  // Gentle time modulation (subtle breathing on the edge curve)
  float edgeWave = 0.5 + 0.5 * sin(uTime * 0.4 + yN_orig * 2.0 + uPhaseOffset);
  float timeMod = mix(0.85, 1.15, edgeWave);

  float edgeAmp = uDistortStrength * centerCurve * edgeMask * timeMod;
  pos.z += edgeAmp;

  // ============================================================
  // HOVER BULGE (center-peaked Z displacement)
  // ============================================================
  float hoverBulgeStrength = 0.25;
  float hoverProfile = sin(PI * uv.x) * sin(PI * uv.y);  // peaks at center, zero at edges
  pos.z += uHover * hoverBulgeStrength * hoverProfile;

  // ============================================================
  // OUTPUT
  // ============================================================
  vZ = pos.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
