// A shared authored skin/fin treatment for untextured swimmer families.
// Source photographs, body dimensions, species patterns and motion are kept.
export function applyShallowFishSurface(material,kind='body'){
  if(material.userData.sampleFishSurface)return;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
varying vec3 sampleSkinPoint;varying vec3 sampleSkinNormal;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
sampleSkinPoint=position;sampleSkinNormal=normal;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 sampleSkinPoint;varying vec3 sampleSkinNormal;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
${kind==='body'?`
vec2 skinGrid=sampleSkinPoint.xy*vec2(86.,112.);
vec2 skinCell=vec2(fract(skinGrid.x+.5*mod(floor(skinGrid.y),2.)),fract(skinGrid.y));
float skinDistance=length((skinCell-vec2(.5,.24))*vec2(1.,.78));
float skinAA=max(.035,fwidth(skinDistance));
float skinEdge=1.-smoothstep(.012,.012+skinAA,abs(skinDistance-.47));
float skinMask=smoothstep(.4,.85,abs(sampleSkinNormal.z))*(1.-smoothstep(.24,.37,sampleSkinPoint.x))*smoothstep(-.34,-.22,sampleSkinPoint.x);
float skinHeight=skinMask*(1.-smoothstep(.30,.53,skinDistance))*.00015;
diffuseColor.rgb*=1.+skinMask*${material.userData.biologicalSkin?'.22':'1.'}*(.13*(1.-skinDistance)-.18*skinEdge);
`:`
float finPhase=atan(sampleSkinPoint.y,sampleSkinPoint.x+.03)*46.;
float finRays=sin(finPhase)*clamp(1.-fwidth(finPhase),0.,1.);
diffuseColor.rgb*=.91+.09*finRays;
`}`);
    if(kind==='body')shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec3 skinDx=dFdx(-vViewPosition),skinDy=dFdy(-vViewPosition);
vec3 skinRx=cross(skinDy,normal),skinRy=cross(normal,skinDx);
float skinDet=dot(skinDx,skinRx);
vec3 skinGradient=sign(skinDet)*(dFdx(skinHeight)*skinRx+dFdy(skinHeight)*skinRy);
normal=normalize(abs(skinDet)*normal-skinGradient);`);
  };
  material.customProgramCacheKey=()=>`${key}/authored-fish-surface-v2/${kind}/${!!material.userData.biologicalSkin}`;
  material.userData.sampleFishSurface={kind,method:'authored scale relief or fin-ray shading, not source photography'};
  material.needsUpdate=true;
}
