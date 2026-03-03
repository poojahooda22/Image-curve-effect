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

// Cloth fold uniforms
uniform float uViewportTopY;      // fold line Y in world space (viewport top edge)
uniform float uFoldRadius;        // cylinder radius (~2.5)
uniform float uMaxFoldAngle;      // max fold angle (~2.618 rad = 150 deg)
uniform float uDipAmount;         // post-fold dip as fraction of viewport height
uniform float uViewportHeight;    // viewport height in world units
uniform float uFadeLiftY;         // controls how much upward lift happens at fade
uniform float uExitRadiusScale;   // scale factor for cylinder radius at exit (< 1.0 tightens curve)
uniform float uEdgeRoundness;     // softening amount for outer edges during exit

#define PI 3.14159265358979

varying vec2 vUv;
varying float vZ;
varying float vFoldProgress;

void main() {
  vUv = uv;
  vec3 pos = position;

  // Local-space normalized coords for edge/hover effects
  float xN = position.x + 0.5;       // 0=left, 1=right
  float yN_orig = position.y + 0.5;  // 0=bottom, 1=top

  // ============================================================
  // WORLD POSITION (includes group scroll translation via modelMatrix)
  // ============================================================
  vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);
  float worldX = worldPos4.x;
  float worldY = worldPos4.y;
  float worldZ = worldPos4.z;

  // ============================================================
  // CLOTH FOLD DEFORMATION — "up and over the roller"
  //
  // Vertices above uViewportTopY wrap UP and OVER a horizontal
  // cylinder, curling backward into -Z. The camera sees the card
  // arc upward, the darkened backside becomes visible, then it
  // fades away.
  //
  // On-cylinder:
  //   y = foldLine + R * sin(angle)       → arcs upward over roller
  //   z = -R * (1 - cos(angle))           → curls backward into -Z
  //
  // Past-cylinder (angle > maxAngle):
  //   Continue from exit point, dip down + recede
  // ============================================================

  float distPastFold = worldY - uViewportTopY;

  // Branchless: 1.0 if vertex is above fold line, 0.0 otherwise
  float isFolding = step(0.0, distPastFold);

  // Determine exit mask based on distance (before calculating angle)
  // The exit happens around distPastFold ≈ uFoldRadius * uMaxFoldAngle
  float nominalExitDist = uFoldRadius * uMaxFoldAngle;
  // exitMask ramps up as the card goes over the cylinder and peaks during the tangent
  float exitMask = smoothstep(nominalExitDist * 0.5, nominalExitDist * 1.5, max(distPastFold, 0.0));
  
  // Tighter exit curvature: reduce radius gracefully as card exits
  float effectiveRadius = uFoldRadius * mix(1.0, uExitRadiusScale, exitMask);

  // Angle on the fold cylinder (arc length / radius)
  float foldDist = max(distPastFold, 0.0);
  float angle = foldDist / effectiveRadius;

  // Clamp angle to max for on-cylinder portion
  float onCylAngle = min(angle, uMaxFoldAngle);

  // On-cylinder position (arcs UP over the roller, then backward into -Z)
  float cylY = uViewportTopY + effectiveRadius * sin(onCylAngle);
  float cylZ = -effectiveRadius * (1.0 - cos(onCylAngle));

  // Past-cylinder: how far past the max angle
  float isPast = step(uMaxFoldAngle, angle);

  // Position at cylinder exit point
  float exitY = uViewportTopY + effectiveRadius * sin(uMaxFoldAngle);
  float exitZ = -effectiveRadius * (1.0 - cos(uMaxFoldAngle));

  // Post-fold trajectory in world units:
  //   Phase 1: dip DOWN 12% of viewport height
  //   Phase 2: rise back UP 2% of viewport height
  //   (opacity fades to 0 during this via fragment shader)
  // Post-fold trajectory: Continuous flow moving upwards.
  // Distance past exit in arc-length
  float pastDist = max(angle - uMaxFoldAngle, 0.0) * effectiveRadius;

  // Using a hyperbola for a perfectly smooth, infinite U-turn.
  // Initial slope matches the cylinder exit tangent.
  float initialDy = cos(uMaxFoldAngle); 
  
  // Final asymptotic slope (repurposing uFadeLiftY as flow intensity)
  float finalDy = uFadeLiftY * 0.4; 
  
  float a = initialDy;
  float b = finalDy - initialDy;
  float c = 3.0; // Sharpness of the turn (larger = wider U-turn)

  // Hyperbola equation guaranteeing slope 'a' at origin, and slope 'a+b' at infinity
  float swoopY = a * pastDist + b * sqrt(pastDist * pastDist + c * c) - b * c;
  
  // Spatial curl: trailing top edge (yN_orig ~ 1.0) gets slightly more upward arc
  float tailWeight = smoothstep(0.0, 1.0, yN_orig);
  float spatialLift = uFadeLiftY * 0.1 * pastDist * tailWeight;

  float pastY = exitY + swoopY + spatialLift;
  float pastZ = exitZ - pastDist * 1.5;  // Push continuously backward so they stack cleanly

  // Select on-cylinder or past-cylinder
  float foldedY = mix(cylY, pastY, isPast);
  float foldedZ = mix(cylZ, pastZ, isPast);

  // Blend between original position and folded position
  float finalWorldY = mix(worldY, foldedY, isFolding);
  float finalWorldZ = mix(worldZ, foldedZ, isFolding);

  // Fold progress: 0..1 on cylinder, grows continuously during post-fold
  // Fragment shader uses this to time shadow darkening
  float cylProgress = clamp(angle / uMaxFoldAngle, 0.0, 1.0);
  float postProgress = (pastDist / 5.0) * isPast; 
  float foldProgress = (cylProgress + postProgress) * isFolding;
  vFoldProgress = foldProgress;

  // ============================================================
  // FOLD ATTENUATION for ambient effects
  // Vertices that are folding have diminished secondary effects
  // ============================================================
  float foldAtten = 1.0 - smoothstep(0.0, 0.3, foldProgress);

  // ============================================================
  // ROLLING SHEET BEND (velocity-driven idle flex, additive)
  // ============================================================
  float halfGrid = uGridHeight * 0.2;
  float yNormGrid = clamp((worldY + halfGrid) / uGridHeight, 0.0, 1.0);
  float bendProfile = smoothstep(0.7, 2.9, yNormGrid);

  float idlePhase = uTime * uIdleBendSpeed + uPhaseOffset;
  float idleBend = uIdleBendStrength * (0.6 + 0.4 * sin(idlePhase));
  float totalBend = idleBend + uBend;

  finalWorldZ += totalBend * uBendZAmount * bendProfile * foldAtten;
  finalWorldY -= totalBend * uBendYCompress * bendProfile * foldAtten;

  // Compute distFromOuter early (needed for ripple suppression + edge mask)
  float distFromOuter = (uAnchorSide < 0.0) ? xN : 1.0 - xN;

  // ============================================================
  // AMBIENT VERTEX RIPPLE (organic breathing, always active)
  // Suppressed near outer edge to keep edge curve clean
  // ============================================================
  float edgeSuppress = smoothstep(0.0, uEdgeWidth * 0.5, distFromOuter);
  float ripple = sin(worldX * 2.0 + worldY * 3.0 + uTime * 0.8) * 0.05;
  ripple += sin(worldX * 5.0 - worldY * 2.0 + uTime * 1.2) * 0.012;
  finalWorldZ += ripple * foldAtten * edgeSuppress;

  // ============================================================
  // EDGE DISTORTION (Y-profiled, one-side only)
  // ============================================================
  float centerCurve = pow(sin(PI * yN_orig), uCenterPow);

  // Smooth falloff: 1.0 at the outer edge, 0.0 at uEdgeWidth, C1-continuous
  float edgeMask = 1.0 - smoothstep(0.0, uEdgeWidth, distFromOuter);

  // Gentle time breathing (±5%, no high-frequency jitter)
  float timeMod = 0.95 + 0.05 * sin(uTime * 0.3 + uPhaseOffset);

  float edgeAmp = uDistortStrength * centerCurve * edgeMask * timeMod * foldAtten;
  finalWorldZ += edgeAmp;

  // ============================================================
  // HOVER BULGE (center-peaked Z displacement)
  // ============================================================
  float hoverBulgeStrength = 0.25;
  float hoverProfile = sin(PI * uv.x) * sin(PI * uv.y);
  finalWorldZ += uHover * hoverBulgeStrength * hoverProfile * foldAtten;

  // ============================================================
  // OUTER EDGE SOFTENING (Exit tangent only)
  // Softens edge sharpness via rounded Z/Y displacement gating
  // ============================================================
  float outerEdgeMask = 1.0 - smoothstep(0.0, 0.15, distFromOuter);
  float edgeRoundingZ = -uEdgeRoundness * outerEdgeMask * exitMask * effectiveRadius;
  float edgeRoundingY = uEdgeRoundness * outerEdgeMask * exitMask * effectiveRadius * 0.5;
  
  finalWorldZ += edgeRoundingZ * isFolding;
  finalWorldY += edgeRoundingY * isFolding;

  // ============================================================
  // RECONSTRUCT & PROJECT
  // We deformed in world space, so use viewMatrix (not modelViewMatrix)
  // ============================================================
  vec3 deformedWorld = vec3(worldX, finalWorldY, finalWorldZ);

  // Edge X curl in world space
  deformedWorld.x -= edgeAmp * 0.03 * uAnchorSide;

  vZ = finalWorldZ;
  gl_Position = projectionMatrix * viewMatrix * vec4(deformedWorld, 1.0);
}
