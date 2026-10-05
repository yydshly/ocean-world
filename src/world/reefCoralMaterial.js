import * as THREE from 'three';

function refineMassiveTissueImage(texture, channel) {
  if (!texture?.isDataTexture || texture.userData.massiveTissueRefinement) return;
  const width=512,height=512,cells=32,pixels=new Uint8Array(width*height*4);
  const clamp=THREE.MathUtils.clamp;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const row=Math.floor(y/(height/cells)),xx=x/(width/cells)+(row%2)*.5;
    const cell=Math.floor(xx)%cells;
    const seed=Math.sin(cell*12.9898+row*78.233)*43758.5453;
    const random=seed-Math.floor(seed),jitter=(random-.5)*.25,size=.86+random*.28;
    const dx=(xx%1-.5-jitter)*1.12/size,dy=(y/(height/cells)%1-.5+jitter*.7)/size;
    const distance=Math.hypot(dx,dy);
    const rim=Math.exp(-Math.pow((distance-.24)/.095,2));
    const cup=Math.exp(-Math.pow(distance/.13,2));
    const sx=x/width*Math.PI*2,sy=y/height*Math.PI*2;
    const patch=Math.sin(sx+Math.sin(sy)*.72)*Math.cos(sy*2+Math.sin(sx*2)*.45)*.54
      +Math.sin(sx*3-sy*2+.8)*Math.cos(sy*3+.4)*.28
      +Math.sin(sx*7+sy*4+Math.sin(sy*2))*.18;
    const grain=Math.sin(sx*73+sy*97)*Math.sin(sx*53-sy*41);
    const value=channel==='bump'?.44+rim*.27-cup*.16+grain*.015:
      .82+patch*.05+rim*.04-cup*.10+grain*.015;
    const byte=clamp(value*255,0,255),index=(y*width+x)*4;
    pixels[index]=channel==='color'?clamp(byte*(1.01+patch*.015),0,255):byte;
    pixels[index+1]=byte;
    pixels[index+2]=channel==='color'?clamp(byte*(.91-patch*.015),0,255):byte;
    pixels[index+3]=255;
  }
  // Keep the cache-owned Texture object and its ref-count/disposal identity.
  // Only its one-time authored image changes before any GPU warmup/upload.
  texture.image={data:pixels,width,height};texture.needsUpdate=true;
  texture.userData.massiveTissueRefinement={resolution:[width,height],cellsPerTile:cells,
    scope:'authored display cups and tissue; no new geometry or measured tissue relief'};
}

// Massive-colony tissue uses all three local metre axes. A crown-only XZ
// projection stretches its cells along steep sidewalls; polar UVs pinch the
// crown. This keeps the existing tissue maps, colors and physical geometry.
export function configureReefMassiveCoralProjection(material) {
  if (material.userData.massiveCoralProjection) return material;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  refineMassiveTissueImage(material.map,'color');
  refineMassiveTissueImage(material.bumpMap,'bump');
  material.bumpScale=.0009;
  material.userData.massiveCoralProjection = {
    method:'local-space triplanar tissue color and display bump',
    nominalLocalCellSpacingM:[.00672,.006,.006],
    authoredTextureResolution:[512,512],cellsPerTile:32,
    bumpDisplayGain:.0009,
    scope:'authored tissue appearance; instance scale changes display spacing; no measured polyp size or geometry/contact change',
  };
  material.onBeforeCompile = function(shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.vertexShader = 'varying vec3 vMassiveLocal;\nvarying vec3 vMassiveNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vMassiveLocal = position; vMassiveNormal = objectNormal;`);
    shader.fragmentShader = `varying vec3 vMassiveLocal;
      varying vec3 vMassiveNormal;
      vec3 massiveProjectionWeights() {
        vec3 weights = pow( abs( normalize( vMassiveNormal ) ), vec3( 4.0 ) );
        return weights / max( dot( weights, vec3( 1.0 ) ), 0.000001 );
      }
      vec4 sampleMassiveProjection( sampler2D tissueTexture ) {
        vec3 point = vMassiveLocal / vec3( 0.21504, 0.192, 0.192 );
        vec3 weights = massiveProjectionWeights();
        return texture2D( tissueTexture, point.yz ) * weights.x
          + texture2D( tissueTexture, point.xz ) * weights.y
          + texture2D( tissueTexture, point.xy ) * weights.z;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        diffuseColor *= sampleMassiveProjection( map );
      #endif`);
    const bump = THREE.ShaderChunk.bumpmap_pars_fragment.replace(/vec2 dHdxy_fwd\(\)\s*\{[\s\S]*?\n\t\}/, `vec2 dHdxy_fwd() {
      float height = bumpScale * sampleMassiveProjection( bumpMap ).r;
      return vec2( dFdx( height ), dFdy( height ) );
    }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <bumpmap_pars_fragment>', bump);
  };
  material.customProgramCacheKey = () => `${previousKey}/reef-massive-local-projection-v2`;
  material.needsUpdate = true;
  return material;
}
