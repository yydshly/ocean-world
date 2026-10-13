import * as THREE from 'three';
import {ShallowNaturalFishAssets} from './ShallowNaturalAssets.js';
import {communityFishShape as shape, communityFishEyes as eyes, ShallowCommunityFishAssets} from './ShallowCommunityFishAssets.js';
import {deformMaterial} from './ShallowSourcedFishAssets.js';

// Stage 03, four-minute journey only. Original project-authored geometry and
// albedo, reusing the existing species-specific body kit; no downloaded image,
// asynchronous decode, taxonomic replacement or new animal population.
export const JOURNEY_ANIMAL_APPEARANCE_IDS=Object.freeze([
  'blue-and-gold-fusilier','doubleline-fusilier','bluestripe-snapper',
  'giant-trevally','white-spotted-rabbitfish','reef-goatfish',
]);
export const JOURNEY_ANIMAL_MOTION_PADDING=Object.freeze({radius:.10,bottom:.07});
export const JOURNEY_ANIMAL_APPEARANCE_REVISION='journey-species-skins-and-separate-fins-v1';
export const JOURNEY_ANIMAL_APPEARANCE_PROVENANCE=Object.freeze({
  source:'Original project-authored geometry adaptation and colour maps; no third-party mesh or photograph copied.',
  redistribution:'New authored content carries no additional third-party restrictions; existing source-asset licences are unchanged.',
  geometryReferences:['public/assets/shallow-body-kit/provenance.json','public/assets/shallow-cohesive-life/provenance.json'],
  identityReferences:[
    'https://fishesofaustralia.net.au/Home/species/586',
    'https://fishesofaustralia.net.au/home/species/4268',
  ],
  limits:'Authored visual representatives, not scans, measured anatomy or calibrated colour. Fin opacity is a display approximation.',
});

const smooth=THREE.MathUtils.smoothstep,clamp=THREE.MathUtils.clamp;
const palette=new Map();
const colour=hex=>{if(!palette.has(hex))palette.set(hex,new THREE.Color(hex));return palette.get(hex);};
const profiles={
  'blue-and-gold-fusilier':{height:.128,type:'teres',body:'#52859b',belly:'#bac5bd',back:'#466b7c'},
  'doubleline-fusilier':{height:.118,type:'doubleline',body:'#638c92',belly:'#c2cbc2',back:'#476f7e'},
  'bluestripe-snapper':{height:.195,type:'snapper',body:'#cbb151',belly:'#d1c9a5',back:'#9b914c'},
  'giant-trevally':{height:.194,type:'giant',body:'#a0afae',belly:'#d4d8cc',back:'#415b62'},
  'white-spotted-rabbitfish':{height:.23,type:'rabbitfish',body:'#838964',belly:'#c8c9a9',back:'#59684e'},
  'reef-goatfish':{height:.14,type:'goatfish',body:'#c0c1ab',belly:'#d7d5bf',back:'#919c86'},
};

// Broad identification marks live in a small shared albedo map, instead of
// being smeared between sparse body vertices. Eye, mouth and barbel vertices
// retain their authored colours. Existing scale-relief shaders are not stacked.
export function journeyAnimalSkinColour(speciesId,x,v,target=new THREE.Color()){
  const p=profiles[speciesId];if(!p)return null;
  target.copy(colour(p.body)).lerp(colour(p.belly),smooth(-v,.12,.92)*.91)
    .lerp(colour(p.back),smooth(v,.25,.97)*.72);
  const head=smooth(x,.29,.48),flank=1-head*.8;
  if(p.type==='teres'){
    const line=.18-.85*(x+.12);
    target.lerp(colour('#c7b447'),smooth(v,line-.045,line+.045)*(1-head*.82));
  }else if(p.type==='doubleline'){
    for(const line of [.60,-.10])target.lerp(colour('#c9b648'),(1-smooth(Math.abs(v-line),.036,.065))*flank);
  }else if(p.type==='snapper'){
    for(const line of [.60,.24,-.10,-.43])target.lerp(colour('#357e9c'),(1-smooth(Math.abs(v-line),.032,.064))*flank);
  }else if(p.type==='giant'){
    // Caranx ignobilis: steep forehead and silver flanks, no black opercular
    // spot. Never reuse the bigeye trevally's characteristic gill-cover mark.
    const lateral=.09+.28*Math.exp(-((x-.08)**2)/.038);
    target.multiplyScalar(1-(1-smooth(Math.abs(v-lateral),.008,.028))*(1-smooth(x,.22,.32))*.13);
  }else if(p.type==='rabbitfish'){
    const row=Math.floor(v*9),a=(x+.35)*29+(row%2)*.5,b=v*9;
    const dot=Math.hypot(a-Math.floor(a)-.5,(b-Math.floor(b)-.5)*1.12);
    target.lerp(colour('#d2d1ae'),(1-smooth(dot,.12,.23))*(1-head*.36)*.83);
  }else if(p.type==='goatfish'){
    // Parupeneus barberinus keeps its diagnostic dash and caudal-base dot,
    // not the generic pink stripe used by the former cohesive template.
    const dash=(1-smooth(Math.abs(v-.24),.055,.105))*smooth(x,-.10,-.04);
    const dot=1-smooth(Math.hypot((x+.265)/.036,(v-.10)/.22),.72,1.02);
    target.lerp(colour('#b7a459'),(1-smooth(Math.abs(v-.43),.035,.08))*smooth(x,-.10,-.04)*.72);
    target.lerp(colour('#37463c'),Math.max(dash,dot)*.92);
  }
  const gill=.245+.045*(1-v*v);
  target.multiplyScalar(1-(1-smooth(Math.abs(x-gill),.004,.012))*(1-smooth(Math.abs(v),.42,.78))*.13);
  return target.multiplyScalar(.97+.026*Math.cos((x+.1)*7-v*2)+.015*Math.sin(x*29+v*17));
}

function skinTexture(id){
  const width=256,height=128,data=new Uint8Array(width*height*4),c=new THREE.Color();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    journeyAnimalSkinColour(id,x/(width-1)*.84-.34,y/(height-1)*2-1,c);
    const i=(y*width+x)*4;data[i]=Math.round(clamp(c.r,0,1)*255);data[i+1]=Math.round(clamp(c.g,0,1)*255);data[i+2]=Math.round(clamp(c.b,0,1)*255);data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
  t.name=`Authored species albedo / ${id}`;t.colorSpace=THREE.NoColorSpace;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
  t.userData={authored:true,source:'journeyAnimalSkinColour',linearRGB:true};return t;
}

export function applyJourneyAnimalAppearance(material,{speciesId,texture}){
  if(!profiles[speciesId]||material.userData.journeyAnimalAppearance)return material;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    shader.uniforms.journeyAnimalSkin={value:texture};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec3 journeySkin;varying vec3 journeySkinCoordinate;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
journeySkinCoordinate=journeySkin;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D journeyAnimalSkin;varying vec3 journeySkinCoordinate;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(journeyAnimalSkin,journeySkinCoordinate.xy).rgb,journeySkinCoordinate.z);`);
  };
  material.customProgramCacheKey=()=>`${key}/${JOURNEY_ANIMAL_APPEARANCE_REVISION}`;
  material.userData.journeyAnimalAppearance={speciesId,authored:true};material.needsUpdate=true;return material;
}

function giantTrevallyParts(){
  const h=.194,w=.112,flat=()=>colour('#92a5a1'),fin=()=>colour('#647d7b');
  const contour=[[-.34,.085,.085,.12],[-.23,.27,.23,.30],[-.08,.65,.58,.67],[.10,.88,.76,.93],[.25,.94,.75,1],[.35,.75,.58,.78],[.44,.40,.28,.44],[.485,.17,.14,.22],[.50,.11,.09,.10]];
  return [
    {name:'giant trevally steep-head body and inset eyes',role:'body',g:shape(b=>{
      b.body(contour.map(([x,u,l,z])=>[x,u*h,l*h,z*w,-.007]),flat,58,40);
      eyes(b,.390,h*.29,w*.60,.013,'#a0a18a');
      for(const s of [-1,1])b.tube([[.498,-.010,s*w*.10],[.475,-.012,s*w*.26],[.445,-.018,s*w*.36]],.0018,.0007,()=>colour('#52605a'),4,5);
    })},
    {name:'separate complete giant trevally median fins',role:'fin',g:shape(b=>{
      b.membrane([[.24,h*.82,0],[.16,h*1.22,0],[.02,h*.92,0],[.03,h*.79,0]],fin,3,30);
      b.membrane([[.025,h*.76,0],[-.065,h*1.42,0],[-.17,h*1.26,0],[-.105,h*.84,0],[-.31,h*.20,0],[-.12,h*.61,0]],fin,3,28);
      b.membrane([[.035,-h*.68,0],[-.065,-h*1.18,0],[-.24,-h*.68,0],[-.32,-h*.22,0],[-.12,-h*.57,0]],fin,3,28);
      for(const s of [-1,1])b.membrane([[.17,-h*.61,s*w*.34],[.04,-h,s*w*.74],[-.01,-h*.70,s*w*.62],[.09,-h*.55,s*w*.29]],fin,2,18);
    })},
    {name:'forked giant trevally caudal membrane',role:'fin',pivot:[-.34,0,0],motion:'tail',g:shape(b=>b.ruledFin(u=>{
      const v=u*2-1,a=Math.abs(v);return [[-.16*a**1.35,v*.207,0],[-.065-.095*a**.63,v*.207,.002*(1-a)]];
    },fin,40,5))},
    ...[-1,1].map(s=>({name:`giant trevally curved pectoral ${s}`,role:'fin',pivot:[.23,-h*.07,s*w*.83],motion:'fin',g:shape(b=>b.membrane([[0,0,0],[-.13,-.04,s*.09],[-.29,-.07,s*.11],[-.16,.014,s*.048],[-.025,.018,s*.013]],fin,3,28,.003))})),
  ];
}

export class ShallowJourneyAnimalAppearance{
  constructor(){
    this.natural=new ShallowNaturalFishAssets();this.giant=new ShallowCommunityFishAssets({'giant-trevally':giantTrevallyParts});
    this.models=new Map();this.resources=new Set();this.clock={value:0};this.disposed=false;
    this.depthMaterial=this.own(deformMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide}),this.clock));
  }
  own(resource){this.resources.add(resource);return resource;}
  create(id){
    if(this.disposed||!profiles[id])return null;if(this.models.has(id))return this.models.get(id);
    const giant=id==='giant-trevally',asset=giant?this.giant:this.natural,model=asset.create(id),p=profiles[id];
    const body=this.own(deformMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.54,metalness:0}),this.clock));
    body.userData.biologicalSkin=true;applyJourneyAnimalAppearance(body,{speciesId:id,texture:this.own(skinTexture(id))});
    const fin=this.own(deformMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.60,metalness:0,side:THREE.DoubleSide,transparent:true,opacity:.83,depthWrite:false}),this.clock));
    fin.forceSinglePass=true;fin.userData.biologicalSkin=true;
    // Existing body constructors append eyes/barbels after their body grid.
    // Only the body grid receives a map, preserving their dark eyes and lips.
    const bodyVertices=giant?59*41+2:['blue-and-gold-fusilier','doubleline-fusilier','bluestripe-snapper'].includes(id)?53*29:41*21;
    model.root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const isBody=mesh.material===asset.bodyMaterial;mesh.material=isBody?body:fin;
      mesh.customDepthMaterial=this.depthMaterial;
      if(isBody){
        const position=mesh.geometry.attributes.position,skin=new Float32Array(position.count*3);
        let min=Infinity,max=-Infinity;for(let i=0;i<bodyVertices;i++){min=Math.min(min,position.getX(i));max=Math.max(max,position.getX(i));}
        const scale=(max-min)/.84;
        for(let i=0;i<position.count;i++)skin.set([(position.getX(i)-min)/(max-min),(position.getY(i)/scale+.008)/p.height*.5+.5,i<bodyVertices?1:0],i*3);
        mesh.geometry.setAttribute('journeySkin',new THREE.BufferAttribute(skin,3));
      }
      mesh.geometry.userData={...mesh.geometry.userData,assetFamily:JOURNEY_ANIMAL_APPEARANCE_REVISION,speciesId:id,role:isBody?'body':'fin',authored:true};
    });
    model.root.name=`Journey species body / ${id}`;model.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model.root),length=bounds.max.x-bounds.min.x;
    model.root.scale.setScalar(1/length);model.root.position.x=-(bounds.max.x+bounds.min.x)*.5/length;model.root.updateMatrixWorld(true);
    Object.assign(model,{assetFamily:JOURNEY_ANIMAL_APPEARANCE_REVISION,motionPadding:JOURNEY_ANIMAL_MOTION_PADDING});
    this.models.set(id,model);return model;
  }
  update(time,speeds=new Map()){
    if(this.disposed)return;this.clock.value=time;this.natural.update(time,speeds);this.giant.update(time,speeds);
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.natural.dispose();this.giant.dispose();
    for(const resource of this.resources)resource.dispose();this.resources.clear();this.models.clear();
  }
}
