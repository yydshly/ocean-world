import * as THREE from 'three';

// Fixed, translated terrain only: authored metre-scale planar projection.
// The same original albedo supplies a subtle display bump, not surveyed relief.
// Avoid the SphereGeometry UV pole that previously stretched every rock crown.
export function createReefRockMaterial(texture) {
  const material = new THREE.MeshStandardMaterial({ color: 0xb4ad91, map: texture,
    bumpMap: texture, bumpScale: .020, roughness: .95 });
  const projectionScale = { value: .8 };
  material.userData.rockProjection = { method: 'world-space triplanar albedo and display bump',
    repeatsPerMetre: projectionScale.value, displayBumpScale: material.bumpScale,
    surfaceColour: 'fixed metre-space olive/umber and subdued pink coating patches',
    scientificStatus: 'authored texture and coating appearance; not measured geology, species cover, food, biomass or physical contact' };
  material.onBeforeCompile = shader => {
    shader.uniforms.uRockProjectionScale = projectionScale;
    shader.vertexShader = 'varying vec3 vRockWorld;\nvarying vec3 vRockWorldNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vRockWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
      vRockWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`);
    shader.fragmentShader = `varying vec3 vRockWorld;
      varying vec3 vRockWorldNormal;
      uniform float uRockProjectionScale;
      float rockCoatingHash( vec3 point ) {
        point = fract( point * 0.1031 );
        point += dot( point, point.yzx + 33.33 );
        return fract( ( point.x + point.y ) * point.z );
      }
      float rockCoatingNoise( vec3 point ) {
        vec3 cell = floor( point ), fraction = fract( point );
        fraction = fraction * fraction * ( 3.0 - 2.0 * fraction );
        return mix(
          mix( mix( rockCoatingHash( cell ), rockCoatingHash( cell + vec3( 1, 0, 0 ) ), fraction.x ),
            mix( rockCoatingHash( cell + vec3( 0, 1, 0 ) ), rockCoatingHash( cell + vec3( 1, 1, 0 ) ), fraction.x ), fraction.y ),
          mix( mix( rockCoatingHash( cell + vec3( 0, 0, 1 ) ), rockCoatingHash( cell + vec3( 1, 0, 1 ) ), fraction.x ),
            mix( rockCoatingHash( cell + vec3( 0, 1, 1 ) ), rockCoatingHash( cell + vec3( 1, 1, 1 ) ), fraction.x ), fraction.y ), fraction.z );
      }
      vec3 rockProjectionWeights() {
        vec3 weights = pow( abs( normalize( vRockWorldNormal ) ), vec3( 4.0 ) );
        return weights / max( dot( weights, vec3( 1.0 ) ), 0.000001 );
      }
      vec4 sampleRockProjection( sampler2D rockTexture, vec3 weights ) {
        vec3 point = vRockWorld * uRockProjectionScale;
        return texture2D( rockTexture, point.yz ) * weights.x
          + texture2D( rockTexture, point.xz ) * weights.y
          + texture2D( rockTexture, point.xy ) * weights.z;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        diffuseColor *= sampleRockProjection( map, rockProjectionWeights() );
        // Visual habitat coating only: world-fixed patches encode no food or
        // modeled cover. Keep the porous source texture visible underneath.
        float coatingField = rockCoatingNoise( vRockWorld * 4.8 );
        float coatingFine = rockCoatingNoise( vRockWorld * 17.0 + vec3( 8.1, 2.7, 4.3 ) );
        float coating = smoothstep( 0.39, 0.66, coatingField + ( coatingFine - 0.5 ) * 0.20 );
        vec3 oliveUmber = mix( vec3( 0.74, 0.66, 0.48 ), vec3( 0.83, 0.82, 0.62 ), coatingFine );
        float pinkPatch = smoothstep( 0.71, 0.88, coatingFine ) * 0.72;
        vec3 coatingTint = mix( oliveUmber, vec3( 1.08, 0.64, 0.75 ), pinkPatch );
        diffuseColor.rgb *= mix( vec3( 1.0 ), coatingTint, coating * 0.78 );
      #endif`);
    // Keep Three's established view-space surface-gradient normal perturbation;
    // substitute only the sampled height/derivatives, now independent of UVs.
    const bump = THREE.ShaderChunk.bumpmap_pars_fragment.replace(/vec2 dHdxy_fwd\(\)\s*\{[\s\S]*?\n\t\}/, `vec2 dHdxy_fwd() {
        float height = bumpScale * sampleRockProjection( bumpMap, rockProjectionWeights() ).r;
        return vec2( dFdx( height ), dFdy( height ) );
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <bumpmap_pars_fragment>', bump);
  };
  material.customProgramCacheKey = () => 'reef-rock-world-projection-v2-coating';
  return material;
}
