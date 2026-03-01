uniform sampler2D uTexture;
uniform float uBackfaceDarken;
uniform float uBackContrast;
uniform float uBackSaturation;

varying vec2 vUv;
varying float vZ;
varying float vFoldProgress;

void main() {
  vec4 texColor = texture2D(uTexture, vUv);

  // Z-position brightening — fade out during folding so folded
  // geometry doesn't get depth-based brightness variation
  float zBright = 1.0 + vZ * 0.15;
  zBright = clamp(zBright, 0.85, 1.15);
  float foldFadeZ = 1.0 - smoothstep(0.0, 0.3, vFoldProgress);
  zBright = mix(1.0, zBright, foldFadeZ);
  texColor.rgb *= zBright;

  // Backface correction: mild darken + contrast/saturation boost
  if (!gl_FrontFacing) {
    texColor.rgb *= uBackfaceDarken;

    // Contrast boost (pivot at mid-gray)
    texColor.rgb = clamp((texColor.rgb - 0.5) * uBackContrast + 0.5, 0.0, 1.0);

    // Saturation boost
    float luma = dot(texColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    texColor.rgb = clamp(mix(vec3(luma), texColor.rgb, uBackSaturation), 0.0, 1.0);
  }

  gl_FragColor = texColor;
}
