import * as THREE from 'three';

export const LIVING_SHALLOWS_CORAL_SURFACE_VERSION = 4;

/** One shared colony display material. Tissue patches and tip/underside
 * contrast are authored appearance, not measured polyps, health or biomass. */
export function createLivingShallowsCoralMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .88, metalness: 0, vertexColors: true });
  material.userData.colonySurface = {
    version: LIVING_SHALLOWS_CORAL_SURFACE_VERSION, coordinates: 'unchanged unit-colony local position',
    scope: 'muted tissue patches and roughness layers; no displacement, ecological state or new texture',
    extraTextures: 0, roughnessRange: [.78, .925],
  };
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vLivingColonyLocal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLivingColonyLocal = position;');
    shader.fragmentShader = `varying vec3 vLivingColonyLocal;
      vec2 livingColonyTissue(vec3 p) {
        float patch = .5 + .5 * sin(p.x * 13.0 + p.z * 9.0 + sin(p.y * 8.0) * .65);
        return vec2(patch, smoothstep(.60, .98, p.y));
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 colonyColour = livingColonyTissue(vLivingColonyLocal);
      float colonyShade = .88 + colonyColour.y * .12 + colonyColour.x * .045;
      diffuseColor.rgb *= vec3(colonyShade, colonyShade * .99, colonyShade * .975);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      vec2 colonyRoughness = livingColonyTissue(vLivingColonyLocal);
      roughnessFactor = clamp(.88 - colonyRoughness.y * .10 + (1.0 - colonyRoughness.x) * .045, .78, .925);`);
  };
  material.customProgramCacheKey = () => 'living-shallows-colony-surface-v4';
  return material;
}
