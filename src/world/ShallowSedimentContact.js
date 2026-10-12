import * as THREE from 'three';

// One world-space sediment surface is shared by the bed and every scanned
// shoreline formation. Photo UVs and physical support remain unchanged.
// The low photographed apron becomes sediment; higher rock retains its photo.
export class ShallowSedimentContact{
  constructor(bed,colours,clock){
    const size=bed.cells+1,values=new Float32Array(size*size*4);
    for(let i=0;i<size*size;i++)values.set([colours[i*3],colours[i*3+1],colours[i*3+2],bed.heights[i]],i*4);
    this.field=new THREE.DataTexture(values,size,size,THREE.RGBAFormat,THREE.FloatType);this.field.needsUpdate=true;
    this.uniforms={sedimentField:{value:this.field},sedimentSand:{value:null},sedimentHasMap:{value:0},sedimentTime:clock,
      sedimentGrid:{value:new THREE.Vector3(bed.min,bed.step,bed.cells)},sedimentBase:{value:new THREE.Color('#eee9da')}};
  }
  setSand(texture){this.uniforms.sedimentSand.value=texture;this.uniforms.sedimentHasMap.value=1;}
  apply(material){
    if(material.userData.worldSedimentContact)return material;
    const old=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      old.call(material,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 sedimentWorld;')
        .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
vec4 sedimentP=vec4(transformed,1.0);
#ifdef USE_INSTANCING
sedimentP=instanceMatrix*sedimentP;
#endif
sedimentWorld=(modelMatrix*sedimentP).xyz;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 sedimentWorld;uniform sampler2D sedimentField;uniform sampler2D sedimentSand;
uniform float sedimentHasMap;uniform float sedimentTime;uniform vec3 sedimentGrid;uniform vec3 sedimentBase;
vec4 sedimentAt(vec2 xz){
 vec2 g=clamp((xz-sedimentGrid.x)/sedimentGrid.y,vec2(0),vec2(sedimentGrid.z-.00001));vec2 i=floor(g),f=fract(g);float n=sedimentGrid.z+1.0;
 vec4 a=texture2D(sedimentField,(i+.5)/n),b=texture2D(sedimentField,(i+vec2(1.5,.5))/n);
 vec4 c=texture2D(sedimentField,(i+vec2(.5,1.5))/n),d=texture2D(sedimentField,(i+1.5)/n);
 return f.x+f.y<=1.0?a+f.x*(b-a)+f.y*(c-a):d+(1.0-f.x)*(c-d)+(1.0-f.y)*(b-d);
}`)
        .replace('#include <map_fragment>',`#include <map_fragment>
vec4 contactSediment=sedimentAt(sedimentWorld.xz);
float sedimentCover=1.0-smoothstep(.12,.48,sedimentWorld.y-contactSediment.a);
vec3 contactColour=contactSediment.rgb*sedimentBase;
if(sedimentHasMap>.5)contactColour*=texture2D(sedimentSand,sedimentWorld.xz*.28).rgb;
diffuseColor.rgb=mix(diffuseColor.rgb,contactColour,sedimentCover);`)
        .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.94,sedimentCover);')
        .replace('#include <dithering_fragment>',`float sedimentRippleA=sin(sedimentWorld.x*2.1+sin(sedimentWorld.z*1.7+sedimentTime*.32));
float sedimentRippleB=sin(sedimentWorld.z*2.3+sin(sedimentWorld.x*1.4-sedimentTime*.24));
gl_FragColor.rgb*=1.0+sedimentCover*.18*pow(max(0.0,1.0-abs(sedimentRippleA+sedimentRippleB)*2.0),5.0);
#include <dithering_fragment>`);
    };
    material.customProgramCacheKey=()=>`${key}/world-sediment-contact-v1`;
    material.userData.worldSedimentContact=true;material.needsUpdate=true;return material;
  }
  dispose(){this.field.dispose();}
}
