uniform sampler2D uTexture;

varying vec2 vUv;
varying float vZ;

void main() {
  vec4 texColor = texture2D(uTexture, vUv);

  // Z-position brightening (geometry-dependent, stays per-image)
  float zBright = 1.0 + vZ * 0.15;
  texColor.rgb *= clamp(zBright, 0.85, 1.15);

  gl_FragColor = texColor;
}
