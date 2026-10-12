
// A common scene material response, not new skin photographs. Source textures
// and attribution remain intact; linear RGB grading preserves their patterns.
export function gradeMarineColour(c,saturation=.78){
  const l=c.r*.2126+c.g*.7152+c.b*.0722;
  c.setRGB(l+(c.r-l)*saturation,l+(c.g-l)*saturation,l+(c.b-l)*saturation);return c;
}
export function unifyMarineMaterial(material){
  if(material.userData.sampleMarineAppearance)return material;
  if(!material.isMeshStandardMaterial&&!material.isMeshPhongMaterial)return material;
  const previous=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material),oldKey=cache();
  material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
float marineLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
diffuseColor.rgb=mix(vec3(marineLuma),diffuseColor.rgb,.78);`);
  };
  material.customProgramCacheKey=()=>`${oldKey}/sample-marine-response-v1`;
  if(material.isMeshStandardMaterial){if(!material.userData.biologicalSkin)material.roughness=.66;material.metalness=0;material.envMapIntensity=.35;}
  if(material.isMeshPhongMaterial){material.shininess=12;material.specular.set('#202a2a');}
  material.userData.sampleMarineAppearance={saturation:.78};material.needsUpdate=true;return material;
}

