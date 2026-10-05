import * as THREE from 'three';

// Display coordinates are baked from logical owners, never modelMatrix or the
// camera. A 512 m period keeps GPU coordinates small after long exploration;
// the noise lattice wraps at matching periods so neighbouring owners agree.
export const MACRO_SURFACE_PERIOD_M = 512;
const wrap = value => ((value % MACRO_SURFACE_PERIOD_M) + MACRO_SURFACE_PERIOD_M) % MACRO_SURFACE_PERIOD_M;
export function macroSurfaceOwnerPhase(owner) {
  const [cx, cz] = owner.split(',').map(Number);
  return [wrap(cx * 64), wrap(cz * 64)];
}
export function macroSurfaceCoordinates(positions, owner) {
  const [phaseX, phaseZ] = macroSurfaceOwnerPhase(owner), result = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    result[i] = positions[i] + phaseX;
    result[i + 1] = positions[i + 1];
    result[i + 2] = positions[i + 2] + phaseZ;
  }
  return result;
}

const literalColour = hex => {
  const colour = new THREE.Color(hex);
  return `vec3(${colour.r.toFixed(6)}, ${colour.g.toFixed(6)}, ${colour.b.toFixed(6)})`;
};

/** Coarse authored reef appearance only. No displaced geometry, species cover,
 * new organisms, sediment transport, food or biomass are inferred by the tint. */
export function createOceanMacroSurfaceMaterial({ map = null } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .98, metalness: 0, map });
  material.userData.macroSurface = {
    scope: 'authored broad mineral, reef coating and sediment colours; no ecology or physical relief',
    coordinates: 'baked logical owner/metre coordinates; invariant to floating-origin and camera changes',
    periodM: MACRO_SURFACE_PERIOD_M,
    extraTextures: 0,
    instanceAttribute: 'existing instanceColor carries immutable owner X/Z phase and brightness; not RGB albedo',
  };
  material.onBeforeCompile = shader => {
    shader.vertexShader = `#ifndef USE_INSTANCING
attribute vec3 macroSurfacePosition;
#endif
varying vec3 vMacroSurfacePosition;
varying vec3 vMacroSurfaceNormal;
varying float vMacroSurfaceTone;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        // Existing transforms are chunk-local. The immutable phase buffer is
        // bound per InstancedMesh by Three, avoiding shared-uniform draw order.
        vMacroSurfacePosition = (instanceMatrix * vec4(position, 1.0)).xyz
          + vec3(instanceColor.r, 0.0, instanceColor.g);
        mat3 macroInstanceNormal = mat3(instanceMatrix);
        vec3 macroScaledNormal = objectNormal / vec3(
          dot(macroInstanceNormal[0], macroInstanceNormal[0]),
          dot(macroInstanceNormal[1], macroInstanceNormal[1]),
          dot(macroInstanceNormal[2], macroInstanceNormal[2]));
        vMacroSurfaceNormal = normalize(macroInstanceNormal * macroScaledNormal);
        vMacroSurfaceTone = instanceColor.b;
      #else
        vMacroSurfacePosition = macroSurfacePosition;
        vMacroSurfaceNormal = objectNormal;
        vMacroSurfaceTone = 1.0;
      #endif`);
    shader.fragmentShader = `varying vec3 vMacroSurfacePosition;
varying vec3 vMacroSurfaceNormal;
varying float vMacroSurfaceTone;
float macroSurfaceHash(vec3 cell, float period) {
  cell.xz = mod(cell.xz, period);
  cell = fract(cell * 0.1031);
  cell += dot(cell, cell.yzx + 33.33);
  return fract((cell.x + cell.y) * cell.z);
}
float macroSurfaceNoise(vec3 point, float period) {
  vec3 cell = floor(point), f = fract(point);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(macroSurfaceHash(cell, period), macroSurfaceHash(cell + vec3(1,0,0), period), f.x),
      mix(macroSurfaceHash(cell + vec3(0,1,0), period), macroSurfaceHash(cell + vec3(1,1,0), period), f.x), f.y),
    mix(mix(macroSurfaceHash(cell + vec3(0,0,1), period), macroSurfaceHash(cell + vec3(1,0,1), period), f.x),
      mix(macroSurfaceHash(cell + vec3(0,1,1), period), macroSurfaceHash(cell + vec3(1,1,1), period), f.x), f.y), f.z);
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      vec3 reefPoint = vMacroSurfacePosition;
      float broadField = macroSurfaceNoise(reefPoint * .25, 128.0);
      float reefField = macroSurfaceNoise(reefPoint * .5 + vec3(13.0, 7.0, 29.0), 256.0);
      float coatingField = macroSurfaceNoise(reefPoint * 1.0 + vec3(31.0, 3.0, 11.0), 512.0);
      float upward = clamp(normalize(vMacroSurfaceNormal).y, 0.0, 1.0);
      float strata = .5 + .5 * sin(reefPoint.y * 1.3 + broadField * 3.5);
      vec3 mineral = mix(${literalColour(0x89826c)}, ${literalColour(0xb8b197)}, .35 + strata * .65);
      vec3 reefCoating = mix(${literalColour(0x69714e)}, ${literalColour(0x9b9872)}, reefField);
      float turf = smoothstep(.38, .64, broadField * .55 + reefField * .45) * .85;
      vec3 reefSurface = mix(mineral, reefCoating, turf);
      float encrusting = smoothstep(.59, .75, coatingField) * (.55 + .25 * (1.0 - upward));
      reefSurface = mix(reefSurface, ${literalColour(0xaa7772)}, encrusting);
      float sediment = smoothstep(.72, .96, upward) * smoothstep(.42, .65, reefField) * .52;
      reefSurface = mix(reefSurface, ${literalColour(0xcac0a3)}, sediment);
      diffuseColor.rgb *= reefSurface * (.9 + broadField * .16) * vMacroSurfaceTone;`);
  };
  material.customProgramCacheKey = () => 'ocean-macro-surface-v2-coarse-owner-fixed-instanced';
  return material;
}
