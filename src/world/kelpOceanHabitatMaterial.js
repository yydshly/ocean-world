const applied = new WeakSet();
export const KELP_HABITAT_MATERIAL_VERSION = 'kelp-habitat-surface-v2';

/** Surface-only landscape modulation. Geometry, support, the inherited
 * albedo texture and its caustic/time uniforms remain owned by the caller. */
export function applyKelpOceanHabitatMaterial(material) {
  if (!material || typeof material.onBeforeCompile !== 'function' || typeof material.customProgramCacheKey !== 'function') {
    throw new TypeError('Kelp habitat surface requires a shader-capable material.');
  }
  if (applied.has(material)) return material;
  const previousCompile = material.onBeforeCompile, previousCacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.vertexShader = `attribute vec3 kelpHabitatCover;
varying vec3 vKelpHabitatCover;
varying vec2 vKelpHabitatXZ;
${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vKelpHabitatCover = kelpHabitatCover;
      // Terrain UVs retain logical world coordinates through render rebases.
      vKelpHabitatXZ = vec2((uv.x - .5) * 70.0, (.5 - uv.y) * 70.0);`);
    shader.fragmentShader = `varying vec3 vKelpHabitatCover;
varying vec2 vKelpHabitatXZ;
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec3 kelpUnmappedBase = diffuseColor.rgb;
      #include <map_fragment>
      // The inherited rock albedo remains on rooted and hard areas. Opening
      // uses the same coverage to retain 35% of that texture at full weight.
      diffuseColor.rgb = mix(diffuseColor.rgb, kelpUnmappedBase,
        clamp(vKelpHabitatCover.z, 0.0, 1.0) * .65);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 kelpCover = clamp(vKelpHabitatCover, vec3(0.0), vec3(1.0));
      vec2 kelpXZ = vKelpHabitatXZ;
      float kelpForestBand = sin(kelpXZ.x * .22 + kelpXZ.y * .13 + sin(kelpXZ.y * .27) * .75);
      float kelpMineral = sin(kelpXZ.x * 1.3 + kelpXZ.y * .7) * sin(kelpXZ.x * .45 - kelpXZ.y * 1.7);
      float kelpSandWave = sin(kelpXZ.x * 2.8 + kelpXZ.y * .4 + sin(kelpXZ.y * .55) * .4);
      vec3 kelpSurfaceShade = vec3(1.0);
      kelpSurfaceShade *= mix(vec3(1.0), vec3(.86 + .08 * kelpForestBand), kelpCover.x);
      kelpSurfaceShade *= mix(vec3(1.0), vec3(.90 + .13 * kelpMineral), kelpCover.y);
      kelpSurfaceShade *= mix(vec3(1.0), vec3(.96 + .05 * kelpSandWave), kelpCover.z);
      diffuseColor.rgb *= kelpSurfaceShade;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float kelpCovered = clamp(kelpCover.x + kelpCover.y + kelpCover.z, 0.0, 1.0);
      float kelpSurfaceRoughness = roughnessFactor
        - .025 * kelpCover.x * (.5 + .5 * kelpForestBand)
        - .075 * kelpCover.y * (.5 + .5 * kelpMineral)
        + .005 * kelpCover.z * kelpSandWave;
      // Zero coverage is exactly the inherited authored shading, including
      // roughness values outside this landscape's ordinary rough range.
      roughnessFactor = mix(roughnessFactor, clamp(kelpSurfaceRoughness, .65, 1.0), kelpCovered);`);
  };
  material.customProgramCacheKey = function () {
    return `${previousCacheKey.call(this)}/${KELP_HABITAT_MATERIAL_VERSION}`;
  };
  applied.add(material); material.needsUpdate = true;
  return material;
}
