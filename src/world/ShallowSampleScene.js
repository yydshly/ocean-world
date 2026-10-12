import {ShallowContactFauna} from './ShallowContactFauna.js';
import {ShallowSedimentContact} from './ShallowSedimentContact.js';
import * as THREE from 'three';
import { OceanAnimals } from './OceanAnimals.js';
import { shallowSampleSpeciesCatalog } from '../shallowSampleSpecies.js';
import { livingShallowsRockFootingMesh } from './livingShallowsAssets.js';
import { shallowMeadowRibbonGeometry as livingShallowsMeadowGeometry } from './ShallowMeadowRibbonAssets.js';
import { oceanRockMesh } from '../oceanRockShape.js';
import { createShallowSample, setSampleAnimalEnvelope, updateShallowSample, sampleShallowCamera } from '../shallowSample.js';
import { NATURAL_SAMPLE_FISH, ShallowNaturalFishAssets } from './ShallowNaturalAssets.js';
import { shallowReefRubbleGeometry } from './ShallowLiveReefAssets.js';
import { loadReefSkeletonScan } from './reefScanAssets.js';
import { prepareReefSkeletonDisplay } from './reefScanDisplay.js';
import { SAMPLE_HERO_IDS, ShallowHeroAnimals } from './ShallowHeroAnimals.js';
import { SHALLOW_ARTIST_FISH_IDS, ShallowArtistFish } from './ShallowArtistFish.js';
import { sampleSedimentTints } from '../shallowSampleSediment.js';
import { SHALLOW_CEPHALOPOD_IDS, ShallowCephalopodAssets } from './ShallowCephalopodAssets.js';
import { SHALLOW_COMMUNITY_FISH_IDS, SHALLOW_COMMUNITY_MOTION_PADDING, ShallowCommunityFishAssets } from './ShallowCommunityFishAssets.js';
import { SHALLOW_SOURCED_FISH_IDS, ShallowSourcedFishAssets } from './ShallowSourcedFishAssets.js';
import { shallowSampleCoralGeometries, shallowSampleCoralKey } from './shallowSampleCoralAssets.js';
import { shallowScannedReefMaterial, loadShallowScannedReefTexture } from './ShallowScannedReefAssets.js';
import {SHALLOW_OPEN_FISH_IDS,ShallowOpenCommunity} from './ShallowOpenCommunity.js';
import {ShallowSourceTurtle,setSourceTurtlePose} from './ShallowSourceTurtle.js';
import {shallowCoveredRockPatches} from './ShallowHabitatForms.js';
import {ShallowCohesiveFish} from './ShallowCohesiveFish.js';
import {unifyMarineMaterial} from './ShallowMarineAppearance.js';
import {ShallowNearCommunity,NEAR_FISH_ID} from './ShallowNearCommunity.js';
import {applyShallowFishSurface} from './ShallowFishSurface.js';
import {ShallowVisibleInstances} from './ShallowVisibleInstances.js';
import {ShallowBenthicCorals} from './ShallowBenthicCorals.js';
import {attachedReefMeshes} from './ShallowAttachedReef.js';
import {ShallowBenthicAssets,SHALLOW_BENTHIC_IDS} from './ShallowBenthicAssets.js';

function geometry(data) {
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
  g.setIndex(data.indices); g.computeVertexNormals(); return g;
}

function instance(geo,material,items,root) {
  const mesh=new THREE.InstancedMesh(geo,material,items.length), matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),s=new THREE.Vector3();
  items.forEach((item,i)=>{
    p.set(item.x,item.y,item.z);q.setFromAxisAngle(new THREE.Vector3(0,1,0),item.rotation||0);
    if(item.supportNormal)q.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3().fromArray(item.supportNormal)));
    s.set(item.width||1,item.height||1,item.depth||item.width||1);matrix.compose(p,q,s);mesh.setMatrixAt(i,matrix);
    if(item.color)mesh.setColorAt(i,new THREE.Color(item.color));
  });
  mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);return mesh;
}

// Instancing retains the existing animal geometry and fin hierarchy, but draws
// a shoal per material rather than cloning a whole mesh tree per fish.
class SampleAnimalRenderer {
  constructor(model,openCommunity,nearCommunity,benthicCorals) {
    this.root=new THREE.Group();this.root.name='Shallow sample animal communities';
    this.templates=new OceanAnimals(shallowSampleSpeciesCatalog);this.natural=new ShallowNaturalFishAssets();this.heroes=new ShallowHeroAnimals();this.artists=new ShallowArtistFish();
    this.contactFauna=new ShallowContactFauna();this.cephalopods=new ShallowCephalopodAssets();this.communityFish=new ShallowCommunityFishAssets();this.speeds=new Map();this.batches=[];this.templatesAgents=[];
    this.sourcedFish=new ShallowSourcedFishAssets();this.cohesive=new ShallowCohesiveFish();this.benthic=new ShallowBenthicAssets(benthicCorals.material('tube-sponge'));
    this.sourceTurtle=new ShallowSourceTurtle();this.openCommunity=openCommunity;this.nearCommunity=nearCommunity;
    const species=new Map();
    for(const a of model.agents){if(!species.has(a.speciesId))species.set(a.speciesId,[]);species.get(a.speciesId).push(a);}
    const templateBySpecies=new Map();
    for(const [id,agents] of species){
      const first=agents[0],template={...first,id:`sample-template-${id}`,sizeM:1,position:{x:0,y:0,z:0},heading:0,velocity:{x:0,y:0,z:0}};
      templateBySpecies.set(id,template);
      if(!SHALLOW_BENTHIC_IDS.includes(id)&&id!==NEAR_FISH_ID&&!SHALLOW_OPEN_FISH_IDS.includes(id)&&id!=='hawksbill-turtle'&&!NATURAL_SAMPLE_FISH[id]&&!SAMPLE_HERO_IDS.includes(id)&&!SHALLOW_ARTIST_FISH_IDS.includes(id)&&!SHALLOW_CEPHALOPOD_IDS.includes(id)&&!SHALLOW_COMMUNITY_FISH_IDS.includes(id)&&!SHALLOW_SOURCED_FISH_IDS.includes(id))this.templatesAgents.push(template);
    }
    this.templates.update(this.templatesAgents,0);
    for(const [id,agents] of species){
      // Only construct the selected family. Unused legacy bodies otherwise
      // keep allocating geometry and animating invisibly throughout the tour.
      const nearFish=this.nearCommunity.create(id),cohesive=nearFish?null:this.cohesive.create(id);let selected=nearFish??cohesive;
      const choose=assets=>selected?null:(selected=assets.create(id));
      const contactFauna=choose(this.contactFauna),benthic=choose(this.benthic),openFish=choose(this.openCommunity),sourceTurtle=choose(this.sourceTurtle),artist=choose(this.artists),hero=choose(this.heroes),cephalopod=choose(this.cephalopods),community=choose(this.communityFish),sourced=choose(this.sourcedFish),natural=choose(this.natural),
        object=selected?.root??this.templates.getObject(`sample-template-${id}`);object.updateMatrixWorld(true);
      const box=sourceTurtle?.motionEnvelope??new THREE.Box3().setFromObject(object);
      for(const a of agents){setSampleAnimalEnvelope(a,box);if(sourceTurtle)a.clearance.radius=sourceTurtle.motionRadius*a.sizeM;
        if(openFish)a.clearance.radius=openFish.motionRadius*a.sizeM;
        if(nearFish)a.clearance.radius=nearFish.motionRadius*a.sizeM;
        if(natural)a.clearance.radius+=.04*a.sizeM;
        if(benthic)a.clearance.radius=benthic.motionRadius*a.sizeM;
        if(contactFauna)a.clearance.radius=contactFauna.motionRadius*a.sizeM;
        if(cohesive){a.clearance.radius+=.065*a.sizeM;a.clearance.bottom+=.035*a.sizeM;}
        if(hero){a.clearance.radius+=.045*a.sizeM;a.clearance.bottom+=(hero.kind===1?.15:hero.kind===2?.045:0)*a.sizeM;}
        if(cephalopod){a.clearance.radius+=cephalopod.motionPadding.radius*a.sizeM;a.clearance.bottom+=cephalopod.motionPadding.bottom*a.sizeM;}
        if(community){const pad=SHALLOW_COMMUNITY_MOTION_PADDING[id]*a.sizeM;a.clearance.radius+=pad;a.clearance.bottom+=pad;}}
      const parts=[];
      object.traverse(child=>{
        if(!child.isMesh)return;
        for(const material of Array.isArray(child.material)?child.material:[child.material]){
          if(community||cohesive)applyShallowFishSurface(material,material===(cohesive?this.cohesive:this.communityFish).bodyMaterial?'body':'fin');
          unifyMarineMaterial(material);
        }
        // LOD alternatives are hidden by a parent group. Copying both would
        // overlay two bodies even though the original asset draws only one.
        for(let parent=child;parent&&parent!==object.parent;parent=parent.parent)if(!parent.visible)return;
        const mesh=new THREE.InstancedMesh(child.geometry,child.material,agents.length);
        if(child.customDepthMaterial)mesh.customDepthMaterial=child.customDepthMaterial;
        if(hero){const phases=new Float32Array(agents.length*2);agents.forEach((a,i)=>phases.set([a.phase+i*2.39996,hero.kind],i*2));child.geometry.setAttribute('sampleHero',new THREE.InstancedBufferAttribute(phases,2));}
        if(artist)child.geometry.setAttribute('artistPhase',new THREE.InstancedBufferAttribute(Float32Array.from(agents,a=>a.phase%4),1));
        if(natural||sourced||openFish||cohesive||nearFish){
          const waveX=new Float32Array(child.geometry.attributes.position.count),p=new THREE.Vector3();
          for(let v=0;v<waveX.length;v++)waveX[v]=p.fromBufferAttribute(child.geometry.attributes.position,v).applyMatrix4(child.matrixWorld).x;
          child.geometry.setAttribute('sampleSwimX',new THREE.BufferAttribute(waveX,1));
          const phases=new Float32Array(agents.length*3);
          agents.forEach((a,i)=>phases.set([a.phase+i*2.39996,4.1+(i%7)*.13,(sourced||openFish||cohesive||nearFish)?.025:.022+(i%5)*.002],i*3));
          child.geometry.setAttribute('sampleSwim',new THREE.InstancedBufferAttribute(phases,3));
        }
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=true;
        mesh.name=`${id} / ${child.name || 'body'}`;mesh.receiveShadow=true;mesh.castShadow=mesh.name.includes('body')||mesh.name.includes('shell');this.root.add(mesh);
        parts.push({source:child,mesh});
      });
      // The whole-body box includes fins/tails (and source turtle swim poses).
      // A generous motion margin bounds authored waves; it changes visibility
      // culling only, never the animal's physical dimensions or clearance.
      const displayRadius=(Math.max(box.min.length(),box.max.length())+.25)*Math.max(...agents.map(a=>a.sizeM));
      this.batches.push({id,agents,parts,displayRadius,displayBox:new THREE.Box3(),displaySphere:new THREE.Sphere(),template:templateBySpecies.get(id),assetFamily:contactFauna?'contact-fauna':nearFish?'source-reef-fish':cohesive?'cohesive-fish':cephalopod?'cephalopod':community?'community-fish':null});
    }
    this.matrix=new THREE.Matrix4();this.pose=new THREE.Matrix4();this.position=new THREE.Vector3();this.scale=new THREE.Vector3();this.quaternion=new THREE.Quaternion();this.rotation=new THREE.Euler(0,0,0,'YXZ');
  }
  update(time) {
    this.speeds.clear();
    for(const {agents,template}of this.batches){
      template.timeSec=time;
      template.velocity.x=agents.reduce((sum,a)=>sum+Math.hypot(a.velocity.x,a.velocity.z),0)/agents.length;
      this.speeds.set(agents[0].speciesId,template.velocity.x);
    }
    this.templates.update(this.templatesAgents,time);
    this.contactFauna.update(time);this.natural.update(time,this.speeds);this.cephalopods.update(time,this.speeds);this.communityFish.update(time,this.speeds);this.benthic.update(time,this.speeds);
    this.heroes.update(time);
    this.artists.update(time);this.openCommunity.update(time);this.nearCommunity.update(time);
    this.sourcedFish.update(time,this.speeds);this.cohesive.update(time,this.speeds);
    for(const batch of this.batches){batch.displayBox.makeEmpty();for(let i=0;i<batch.agents.length;i++){
      const a=batch.agents[i];this.position.set(a.position.x,a.position.y,a.position.z);this.scale.setScalar(a.sizeM);
      batch.displayBox.expandByPoint(this.position);
      this.rotation.set(0,-a.heading,a.pitch||0,'YXZ');this.quaternion.setFromEuler(this.rotation);this.pose.compose(this.position,this.quaternion,this.scale);
      for(const {source,mesh}of batch.parts){this.matrix.multiplyMatrices(this.pose,source.matrixWorld);mesh.setMatrixAt(i,this.matrix);
        if(batch.id==='hawksbill-turtle'){setSourceTurtlePose(source,time,a.phase);mesh.setMorphAt(i,source);mesh.morphTexture.needsUpdate=true;}}
    }
      batch.displayBox.expandByScalar(batch.displayRadius).getBoundingSphere(batch.displaySphere);
      for(const {mesh}of batch.parts)mesh.boundingSphere=batch.displaySphere;
    }
    for(const batch of this.batches)for(const {mesh}of batch.parts)mesh.instanceMatrix.needsUpdate=true;
  }
  dispose(){for(const b of this.batches)for(const {mesh}of b.parts){mesh.removeFromParent();mesh.dispose();}this.templates.dispose();this.contactFauna.dispose();this.natural.dispose();this.heroes.dispose();this.artists.dispose();this.cephalopods.dispose();this.communityFish.dispose();this.sourcedFish.dispose();this.sourceTurtle.dispose();this.openCommunity.dispose();this.cohesive.dispose();this.benthic.dispose();}
}

function causticMaterial(material,clock,strength=.13) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.sampleTime=clock;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 sampleWorld;')
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 sampleP=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nsampleP=instanceMatrix*sampleP;\n#endif\nsampleWorld=(modelMatrix*sampleP).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 sampleWorld;uniform float sampleTime;')
      .replace('#include <dithering_fragment>',`float rippleA=sin(sampleWorld.x*2.1+sin(sampleWorld.z*1.7+sampleTime*.32));
float rippleB=sin(sampleWorld.z*2.3+sin(sampleWorld.x*1.4-sampleTime*.24));
float caustic=pow(max(0.0,1.0-abs(rippleA+rippleB)*2.0),5.0);
gl_FragColor.rgb*=1.0+caustic*${strength.toFixed(3)};\n#include <dithering_fragment>`);
  };
  material.customProgramCacheKey=()=>`shallow-caustic-${strength}`;return material;
}

export class ShallowSampleScene {
  constructor(seed=55,options={}){
    this.model=createShallowSample(seed,options);this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#326e80');
    this.scene.fog=new THREE.FogExp2('#326e80',.023);this.clock={value:0};this.resources=[];this.textures=[];this.disposed=false;
    this.coralBatches=[];this.grassBatches=[];this.skeletonMeshes=[];this.skeletonSites=[];this.scanController=new AbortController();
    this.scannedReefMaterials=new Map();this.openCommunity=new ShallowOpenCommunity();this.nearCommunity=new ShallowNearCommunity();this.benthicCorals=new ShallowBenthicCorals();
    this.camera=new THREE.PerspectiveCamera(58,1,.08,180);
    this.environment=new THREE.Group();this.scene.add(this.environment);
    const sky=new THREE.HemisphereLight('#c9eeef','#687361',1.05);this.scene.add(sky);
    this.sun=new THREE.DirectionalLight('#fff1d6',2.35);this.sun.position.set(-30,45,-18);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-18,right:18,top:15,bottom:-15,near:.5,far:75});
    this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.035;this.scene.add(this.sun,this.sun.target);
    const fill=new THREE.DirectionalLight('#69a5b2',.28);fill.position.set(10,5,30);this.scene.add(fill);
    const waterMaterial=this.own(new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
      uniforms:{upper:{value:new THREE.Color('#71b2bd')},lower:{value:new THREE.Color('#326e80')}},
      vertexShader:'varying vec3 waterDirection;void main(){waterDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform vec3 upper;uniform vec3 lower;varying vec3 waterDirection;void main(){float up=smoothstep(-.05,.8,normalize(waterDirection).y);gl_FragColor=vec4(mix(lower,upper,up),1.0);\n#include <colorspace_fragment>\n}'}));
    this.water=new THREE.Mesh(this.own(new THREE.SphereGeometry(130,24,16)),waterMaterial);this.water.name='Underwater light gradient';this.water.renderOrder=-1;this.scene.add(this.water);
    const sand=causticMaterial(new THREE.MeshStandardMaterial({color:'#eee9da',vertexColors:true,roughness:.94}),this.clock,.18);
    const rockMaterial=causticMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.91}),this.clock);
    this.rockMaterial=rockMaterial;
    // Colour-only authored reef material. Neither file nor texture scale changes
    // the shared hard surface, coral support or the animals' natural dimensions.
    this.reefAlbedoFile='public/assets/coral_ground_02_diff_1k.jpg';
    this.reefTextureScale=.50;
    this.reefTextureDesaturation=.92;
    this.resources.push(sand,rockMaterial);
    this.buildBed(sand);this.buildRocks(rockMaterial);this.buildPlants();
    this.animals=new SampleAnimalRenderer(this.model,this.openCommunity,this.nearCommunity,this.benthicCorals);this.scene.add(this.animals.root);this.update(0);
  }
  own(resource){this.resources.push(resource);return resource;}
  buildBed(material){
    const {min,step,cells,heights}=this.model.bed,positions=[],colors=[],uv=[],indices=[];
    const base=new THREE.Color('#d9d6c8'),darker=new THREE.Color('#acb2a0'),limestone=new THREE.Color('#e0dfd5'),color=new THREE.Color(),sediment=sampleSedimentTints(this.model);
    for(let row=0;row<=cells;row++)for(let col=0;col<=cells;col++){
      const x=min+col*step,z=min+row*step;positions.push(x,heights[row*(cells+1)+col],z);uv.push(x*.28,z*.28);
      const ripple=.08+.11*(.5+.5*Math.sin(z*2.2+x*.18)),field=sediment(x,z);
      color.copy(base).lerp(darker,ripple+field.grass*.22).lerp(limestone,field.reef*.18);colors.push(color.r,color.g,color.b);
      if(row<cells&&col<cells){const a=row*(cells+1)+col,b=a+1,c=a+cells+1,d=c+1;indices.push(a,c,b,b,c,d);}
    }
    const geo=this.own(geometry({positions,indices}));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    // Spatial chunks use the same exact vertices/normals and triangles as the
    // physical bed, so off-screen terrain can be culled instead of drawing 280m.
    this.sedimentContact=new ShallowSedimentContact(this.model.bed,colors,this.clock);this.resources.push(this.sedimentContact);this.nearCommunity.sedimentContact=this.sedimentContact;
    const attributes=['position','normal','uv','color'],tile=56;
    for(let rz=0;rz<cells;rz+=tile)for(let cx=0;cx<cells;cx+=tile){
      const width=Math.min(tile,cells-cx),height=Math.min(tile,cells-rz),patch=new THREE.BufferGeometry(),indices=[];
      for(const key of attributes){const src=geo.getAttribute(key),array=new Float32Array((width+1)*(height+1)*src.itemSize);let offset=0;
        for(let z=0;z<=height;z++)for(let x=0;x<=width;x++){
          const i=((rz+z)*(cells+1)+cx+x)*src.itemSize;for(let k=0;k<src.itemSize;k++)array[offset++]=src.array[i+k];
        }patch.setAttribute(key,new THREE.BufferAttribute(array,src.itemSize));
      }
      for(let z=0;z<height;z++)for(let x=0;x<width;x++){const a=z*(width+1)+x,b=a+1,c=a+width+1,d=c+1;indices.push(a,c,b,b,c,d);}
      patch.setIndex(indices);patch.computeBoundingBox();patch.computeBoundingSphere();this.own(patch);
      const bed=new THREE.Mesh(patch,material);bed.name=cx===0&&rz===0?'Continuous shallow sand bed':`Sand terrain / ${cx},${rz}`;bed.receiveShadow=true;this.environment.add(bed);
    }
  }
  buildRocks(material){
    const tissue=this.own(new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.78,side:THREE.DoubleSide}));
    this.nearCommunity.buildReefs(this.model,this.environment,material,key=>this.benthicCorals.material(key)??this.nearCommunity.coralMaterial(key)??this.openCommunity.coralMaterial(key)??tissue);
    for(const g of shallowCoveredRockPatches(this.model.rocks.filter(r=>!r.fieldAsset))){
      const mesh=new THREE.Mesh(this.own(g),material);mesh.name=`Attached carbonate reef / ${g.userData.patch}`;
      mesh.castShadow=mesh.receiveShadow=true;this.environment.add(mesh);
    }
    const foot=livingShallowsRockFootingMesh(this.model.rocks.filter(r=>!r.fieldAsset),{x:0,z:0},this.model.floor);
    const geo=this.own(geometry(foot));geo.setAttribute('color',new THREE.Float32BufferAttribute(new Array(foot.positions.length).fill(.56),3));
    const uv=[];for(let i=0;i<foot.positions.length;i+=3)uv.push(foot.positions[i]*.8,foot.positions[i+2]*.8);
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const footing=new THREE.Mesh(geo,material);footing.receiveShadow=true;footing.name='Buried reef footing';this.environment.add(footing);
  }
  buildPlants(){
    for(const {key,geometry}of attachedReefMeshes(this.model)){
      const mesh=new THREE.Mesh(this.own(geometry),this.benthicCorals.material(key));
      mesh.name=`Attached living reef layer / ${key}`;mesh.receiveShadow=true;this.environment.add(mesh);
    }
    const assets={seagrass:this.own(livingShallowsMeadowGeometry())};
    const natural=shallowSampleCoralGeometries(undefined,this.model.scannedReef),distant=shallowSampleCoralGeometries('distant',this.model.scannedReef);Object.values({...natural,...Object.fromEntries(Object.entries(distant).map(([k,v])=>[`far-${k}`,v]))}).forEach(g=>this.own(g));
    const coralMaterial=this.own(causticMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.76,side:THREE.DoubleSide}),this.clock));
    const rowsByAsset=new Map();
    this.model.corals.forEach((c,i)=>{
      const key=shallowSampleCoralKey(c,i);
      if(!rowsByAsset.has(key))rowsByAsset.set(key,[]);
      const color=(c.scanAsset||natural[key].userData.sourceKind?.includes('field-'))?'#ffffff':c.tint>.66?'#ede5d5':c.tint>.33?'#e5e6dc':'#d5e4df';
      const height=c.height;
      rowsByAsset.get(key).push({...c,height,color});
    });
    // Several coherent colony silhouettes across the whole reef, within the
    // existing root/height envelope; none are extra biological individuals.
    for(const [key,rows]of rowsByAsset){
      let material=this.benthicCorals.material(key)??this.nearCommunity.coralMaterial(key)??this.openCommunity.coralMaterial(key)??coralMaterial;
      if(key.startsWith('scanned-')){material=this.own(causticMaterial(shallowScannedReefMaterial(key),this.clock));this.scannedReefMaterials.set(key,material);}
      const mesh=instance(natural[key],material,rows,this.environment),farMesh=instance(distant[key],material,rows,this.environment);
      mesh.name=`Living coral / ${key} / near`;farMesh.name=`Living coral / ${key} / far`;mesh.castShadow=true;farMesh.castShadow=false;
      const visibility=new ShallowVisibleInstances([mesh],[farMesh]);
      this.coralBatches.push({mesh,farMesh,rows,nearGeometry:natural[key],farGeometry:distant[key],visibility});
    }
    const grassMaterial=this.own(new THREE.MeshStandardMaterial({color:'#c5cfb3',vertexColors:true,side:THREE.DoubleSide,roughness:.9}));
    const bedTexture=this.own(new THREE.DataTexture(this.model.bed.heights,281,281,THREE.RedFormat,THREE.FloatType));bedTexture.needsUpdate=true;
    grassMaterial.onBeforeCompile=shader=>{
      shader.uniforms.sampleTime=this.clock;
      shader.uniforms.sampleBed={value:bedTexture};
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform float sampleTime;uniform sampler2D sampleBed;attribute vec2 rootXZ;
float sampleFloor(vec2 xz){vec2 g=clamp(xz+130.0,vec2(0),vec2(279.99999));vec2 i=floor(g),f=fract(g);
float a=texture2D(sampleBed,(i+.5)/281.0).r,b=texture2D(sampleBed,(i+vec2(1.5,.5))/281.0).r;
float c=texture2D(sampleBed,(i+vec2(.5,1.5))/281.0).r,d=texture2D(sampleBed,(i+1.5)/281.0).r;
return f.x+f.y<=1.0?a+f.x*(b-a)+f.y*(c-a):d+(1.0-f.x)*(c-d)+(1.0-f.y)*(b-d);}`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
vec3 sampleRoot=(instanceMatrix*vec4(rootXZ.x,0.0,rootXZ.y,1.0)).xyz;
transformed.y+=(sampleFloor(sampleRoot.xz)-sampleRoot.y)/length(instanceMatrix[1].xyz);
transformed.x+=.07*position.y*position.y*sin(sampleTime*.85+position.z*5.0+instanceMatrix[3].x*.28);`);
    };
    const farGrass=this.own(new THREE.BufferGeometry());for(const [key,value]of Object.entries(assets.seagrass.attributes))farGrass.setAttribute(key,value);
    const indices=[];for(let shoot=0;shoot<32;shoot+=3)for(let k=0;k<72;k++)indices.push(assets.seagrass.index.array[shoot*72+k]);farGrass.setIndex(indices);farGrass.computeBoundingSphere();
    // Sixteen-metre patches share the existing grass mesh and remain spatially
    // culled. New sand-edge patches need no per-clump mesh or material.
    for(const patch of spatialGroups(this.model.grass,16)){
      const mesh=instance(assets.seagrass,grassMaterial,patch,this.environment);this.grassBatches.push({mesh,nearGeometry:assets.seagrass,farGeometry:farGrass,level:'near'});
    }
    const rubbleMaterial=this.own(causticMaterial(new THREE.MeshStandardMaterial({color:'#e6e1d3',vertexColors:true,roughness:1}),this.clock));
    instance(this.own(shallowReefRubbleGeometry()),rubbleMaterial,this.model.rubble,this.environment);
  }
  loadSkeleton(){
    if(this.skeletonPromise)return this.skeletonPromise;
    this.skeletonPromise=loadReefSkeletonScan({detail:'thumbnail',signal:this.scanController.signal})
      .then(scan=>this.installSkeleton(scan));
    return this.skeletonPromise;
  }
  async installSkeleton(scan,{yieldWork=()=>new Promise(resolve=>{
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(resolve);else resolve();
  })}={}){
    if(this.disposed||this.assetsSealed||this.scanController.signal.aborted||this.skeletonHandle){scan.dispose();return [];}
    this.skeletonHandle=scan;prepareReefSkeletonDisplay(scan.group);
    const cancelled=()=>{
      if(!this.disposed&&!this.assetsSealed&&!this.scanController.signal.aborted)return false;
      // Scene disposal already releases its owned scan. Sealing a live scene
      // releases the unfinished scan here; both paths have a single owner.
      if(!this.disposed)scan.dispose();if(this.skeletonHandle===scan)this.skeletonHandle=null;return true;
    };
    let source;scan.group.traverse(o=>{if(o.isMesh)source=o;});
    const g=source.geometry,p=g.attributes.position,point=new THREE.Vector3(),sites=[];let sliceStart=performance.now();
    // The specimen remains 0.627 m wide at its measured unit transform. Only
    // rotation/translation vary. These are authored dead skeleton fragments.
    const candidates=this.model.corals.filter(c=>!c.scanAsset&&c.width>=1.0&&c.form!=='fan')
      .sort((a,b)=>Math.abs(a.z)-Math.abs(b.z)||a.x-b.x).slice(0,48);
    for(const c of candidates){
      const co=Math.cos(c.rotation),si=Math.sin(c.rotation);let y=-Infinity,valid=true;
      for(let i=0;i<p.count;i++){
        point.fromBufferAttribute(p,i);const x=c.x+point.x*co+point.z*si,z=c.z-point.x*si+point.z*co;
        if(Math.hypot(point.x,point.z)>c.radius){valid=false;break;}
        y=Math.max(y,this.model.surface(x,z)-point.y+.004);
        if(i%256===255&&performance.now()-sliceStart>=4){await yieldWork();if(cancelled())return [];sliceStart=performance.now();}
      }
      // Decline tilted/occluded sites instead of levitating the basal stem or
      // exceeding the physical clearance already reserved by the model.
      if(valid&&y>=c.y-.015&&y-c.y<=.04&&y+g.boundingBox.max.y<=c.y+c.height)sites.push({c,x:c.x,y,z:c.z,rotation:c.rotation});
      if(sites.length===32)break;
    }
    if(cancelled())return [];
    if(!sites.length){scan.dispose();this.skeletonHandle=null;return [];}
    source.material.metalness=0;source.material.roughness=.95;
    const colours=new Float32Array(p.count*3),tint=new THREE.Color('#c0baa2');
    for(let i=0;i<p.count;i++)colours.set(tint.toArray(),i*3);
    g.setAttribute('color',new THREE.BufferAttribute(colours,3));source.material.vertexColors=true;source.material.needsUpdate=true;
    for(const patch of spatialGroups(sites,16)){
      const mesh=instance(g,source.material,patch,this.environment);mesh.name='Scanned dead coral skeleton / USNM 229';mesh.castShadow=true;
      this.skeletonMeshes.push(mesh);
    }
    this.skeletonSites=sites;
    const replaced=new Set(sites.map(s=>s.c));
    for(const {rows,visibility}of this.coralBatches){
      rows.forEach((row,i)=>{if(replaced.has(this.model.corals.find(c=>c.x===row.x&&c.z===row.z&&c.host===row.host)))visibility.excluded.add(i);});
      visibility.update(this.camera);
    }
    return sites;
  }
  async loadTextures(){
    // The player bounds preparation, then seals arrivals before starting the
    // tour. Failed or late files retain the built fallback materials.
    const loader=new THREE.TextureLoader(),base=import.meta.env.BASE_URL;
    const files=['sand-albedo.png',this.reefAlbedoFile.split('/').at(-1)];
    const artistReady=this.animals.artists.loadTextures();
    const openReady=this.animals.openCommunity.loadTextures();
    const nearReady=this.nearCommunity.loadTextures(),benthicReady=this.benthicCorals.loadTextures();
    const sourcedReady=this.animals.sourcedFish.loadTextures();
    const turtleReady=this.animals.sourceTurtle.loadTextures(),contactReady=this.animals.contactFauna.loadTextures();
    const scannedReady=Promise.allSettled([...this.scannedReefMaterials].map(async([key,material])=>{
      const texture=await loadShallowScannedReefTexture(key,base);
      if(this.disposed||this.assetsSealed){texture.dispose();return;}
      this.textures.push(texture);material.map=texture;material.needsUpdate=true;
    }));
    const loaded=await Promise.allSettled(files.map(async(file)=>{
      const texture=await loader.loadAsync(`${base}assets/${file}`);
      if(this.disposed||this.assetsSealed){texture.dispose();return null;}
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=4;this.textures.push(texture);return texture;
    }));
    await Promise.allSettled([artistReady,sourcedReady,scannedReady,turtleReady,openReady,nearReady,benthicReady,contactReady]);if(this.disposed||this.assetsSealed)return;
    const value=i=>loaded[i]?.status==='fulfilled'?loaded[i].value:null,sand=value(0),diffuse=value(1),normalMap=null,roughMap=null;
    if(sand){this.sedimentContact.setSand(sand);const material=this.environment.getObjectByName('Continuous shallow sand bed').material;material.map=sand;material.bumpMap=sand;material.bumpScale=.025;material.needsUpdate=true;}
    if(!diffuse)return;
    // Publish the complete available PBR set once; avoid multiple shader changes
    // during a tour as independent files arrive. Failure retains the fallback.
    const material=this.rockMaterial,original=material.onBeforeCompile;material.map=diffuse;material.bumpMap=null;
    material.onBeforeCompile=shader=>{
      original(shader);shader.uniforms.sampleRockNormal={value:normalMap};shader.uniforms.sampleRockRough={value:roughMap};
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
vec3 sampleN=abs(normalize(cross(dFdx(sampleWorld),dFdy(sampleWorld))));sampleN=pow(sampleN,vec3(4.0));sampleN/=max(.00001,sampleN.x+sampleN.y+sampleN.z);
vec3 sampleP=sampleWorld*${this.reefTextureScale.toFixed(2)};
vec4 carbonate=texture2D(map,sampleP.yz)*sampleN.x+texture2D(map,sampleP.xz)*sampleN.y+texture2D(map,sampleP.xy)*sampleN.z;
carbonate.rgb=mix(carbonate.rgb,vec3(dot(carbonate.rgb,vec3(.2126,.7152,.0722))),${this.reefTextureDesaturation.toFixed(2)});
diffuseColor*=carbonate;
#endif`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D sampleRockNormal;uniform sampler2D sampleRockRough;`);
      if(normalMap)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec3 rockN=inverseTransformDirection(normal,viewMatrix),w=pow(abs(rockN),vec3(4.0));w/=max(.00001,w.x+w.y+w.z);
vec3 rp=sampleWorld*.32,nx=texture2D(sampleRockNormal,rp.yz).xyz*2.0-1.0,ny=texture2D(sampleRockNormal,rp.xz).xyz*2.0-1.0,nz=texture2D(sampleRockNormal,rp.xy).xyz*2.0-1.0;
vec3 detail=vec3(nx.z*sign(rockN.x),nx.x,nx.y)*w.x+vec3(ny.x,ny.z*sign(rockN.y),ny.y)*w.y+vec3(nz.x,nz.y,nz.z*sign(rockN.z))*w.z;
normal=normalize(mat3(viewMatrix)*normalize(mix(rockN,detail,.40)));`);
      if(roughMap)shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
vec3 roughN=pow(abs(normalize(cross(dFdx(sampleWorld),dFdy(sampleWorld)))),vec3(4.0));roughN/=max(.00001,roughN.x+roughN.y+roughN.z);
vec3 roughP=sampleWorld*.32;roughnessFactor=clamp(.72+.28*(texture2D(sampleRockRough,roughP.yz).r*roughN.x+texture2D(sampleRockRough,roughP.xz).r*roughN.y+texture2D(sampleRockRough,roughP.xy).r*roughN.z),.72,1.0);`);
    };
    material.customProgramCacheKey=()=>`sample-coastal-pbr-${!!normalMap}-${!!roughMap}`;material.needsUpdate=true;
  }
  update(time,autoCamera=true){
    if(this.disposed)return;this.clock.value=time;updateShallowSample(this.model,time);this.animals.update(time);
    if(autoCamera){const view=sampleShallowCamera(this.model,time);this.camera.position.copy(view.position);this.camera.lookAt(view.target);}
    const p=this.camera.position;this.sun.target.position.set(p.x+6,0,p.z);this.sun.position.set(p.x-17,28,p.z-14);
    this.updateView();
    this.water.position.copy(this.camera.position);
  }
  updateView(){
    const p=this.camera.position;
    this.nearCommunity.updateVisibility(this.camera);
    for(const batch of this.coralBatches)batch.visibility.update(this.camera);
    for(const batch of this.grassBatches){const sphere=batch.mesh.boundingSphere,distance=sphere.center.distanceTo(p)-sphere.radius;
      const level=distance>18?'far':distance<14?'near':batch.level;if(level!==batch.level){batch.mesh.geometry=level==='far'?batch.farGeometry:batch.nearGeometry;batch.level=level;}}
  }
  get summary(){return {duration:this.model.seconds,animals:this.model.agents.length,species:new Set(this.model.agents.map(a=>a.speciesId)).size,
    reefs:this.model.rocks.length,colonies:this.model.corals.length,grassPatches:this.model.grass.length};}
  dispose(){if(this.disposed)return;this.disposed=true;this.scanController.abort();this.animals.dispose();this.nearCommunity.dispose();this.benthicCorals.dispose();this.sun.shadow.dispose();
    for(const batch of this.coralBatches){batch.mesh.dispose();batch.farMesh.dispose();}
    for(const mesh of this.skeletonMeshes)mesh.dispose();this.skeletonHandle?.dispose();this.scene.clear();for(const r of new Set(this.resources))r.dispose();for(const t of this.textures)t.dispose();}
}

function spatialGroups(rows,size){const groups=new Map();for(const row of rows){const key=`${Math.floor(row.x/size)},${Math.floor(row.z/size)}`;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}return groups.values();}
