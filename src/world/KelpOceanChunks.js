import * as THREE from 'three';
import { createKelpOceanGenerator, KELP_OCEAN_CHUNK_SIZE, KELP_OCEAN_TERRAIN_SEGMENTS, KELP_OCEAN_ELEMENT_LIMITS,
  KELP_OCEAN_SUPPORT_GEOMETRY_VERSION, kelpOceanRockMesh } from '../kelpOceanGeneration.js';
import { kelpStipePosition, kelpLeafFrame, kelpLeafWidth } from '../kelpHabitat.js';
import { oceanRockFootingMesh } from './oceanRockFooting.js';
import { createKelpOceanHabitatCover } from './kelpOceanHabitatCover.js';
import { applyKelpOceanHabitatMaterial, KELP_HABITAT_MATERIAL_VERSION } from './kelpOceanHabitatMaterial.js';

const SEGMENTS=KELP_OCEAN_TERRAIN_SEGMENTS,MAX_CHUNKS=9,PROFILES=['mound','terrace','ridge'];
function rockGeometry(profile){
  const data=kelpOceanRockMesh(profile),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setIndex(data.indices);
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** Three fronds and a subset of blades are landscape rendering samples, not
 * additional plants or food pools. Root positions and metre-scale blades use
 * the authored shared shape functions; only the height is instance-scaled. */
function kelpGeometry(){
  const positions=[],colors=[],indices=[],anchor={x:0,y:0,z:0,lengthM:12,phase:.73};
  const add=(x,y,z,color)=>{const index=positions.length/3;positions.push(x,y/12,z);colors.push(...color);return index;};
  for(let frond=0;frond<3;frond++){
    const start=positions.length/3,sides=5,steps=12;
    for(let row=0;row<=steps;row++){
      const u=row/steps,p=kelpStipePosition(anchor,u,0,{currentMps:0},frond),radius=.014*(1-u*.35);
      for(let side=0;side<sides;side++){const angle=side*Math.PI*2/sides;add(p.x+Math.cos(angle)*radius,p.y,p.z+Math.sin(angle)*radius,[.43,.46,.32]);}
    }
    for(let row=0;row<steps;row++)for(let side=0;side<sides;side++){
      const a=start+row*sides+side,b=start+row*sides+(side+1)%sides,c=a+sides,d=b+sides;
      indices.push(a,c,b,b,c,d);
    }
    for(let leaf=0;leaf<54;leaf+=2){
      const first=positions.length/3;
      for(let row=0;row<3;row++){
        const u=row/2,frame=kelpLeafFrame(anchor,leaf,u,0,{currentMps:0},frond),width=kelpLeafWidth(leaf)*Math.sin(Math.PI*u)**.65*.5+.002;
        for(const side of [-1,1])add(frame.position.x+frame.across.x*width*side,
          frame.position.y+frame.across.y*width*side,frame.position.z+frame.across.z*width*side,
          [.76+leaf%4*.025,.73+leaf%3*.025,.46]);
      }
      for(let row=0;row<2;row++){const a=first+row*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.computeBoundingBox();geometry.boundingBox.min.x-=1;geometry.boundingBox.max.x+=1;
  geometry.boundingBox.min.z-=1;geometry.boundingBox.max.z+=1;geometry.computeBoundingSphere();geometry.boundingSphere.radius+=1;
  return geometry;
}

/** Fixed 3×3 landscape window for the independent temperate ocean. */
export class KelpOceanChunks{
  constructor(seed,{sandMaterial}={}){
    this.root=new THREE.Group();this.root.name='continuous-kelp-ocean-landscape';
    this.root.userData.oceanStreaming=true;this.root.userData.role='generated-landscape-not-simulated-populations';
    this.generator=createKelpOceanGenerator(seed);this.renderOrigin={x:0,z:0};this._chunks=new Map();this._center=null;
    this._position={x:0,z:0};this._loads=0;this._unloads=0;this._disposed=false;this._detailedHostIds=new Set();
    this._transform=new THREE.Object3D();this._color=new THREE.Color();this._uniforms={time:{value:0},flow:{value:.18}};
    this._terrainMaterial=sandMaterial?sandMaterial.clone():new THREE.MeshStandardMaterial({color:0x686a51,roughness:.99});
    if(sandMaterial){this._terrainMaterial.onBeforeCompile=sandMaterial.onBeforeCompile;this._terrainMaterial.customProgramCacheKey=sandMaterial.customProgramCacheKey;}
    this._terrainMaterial.vertexColors=true;this._terrainMaterial.needsUpdate=true;
    applyKelpOceanHabitatMaterial(this._terrainMaterial);
    this._materials={rock:new THREE.MeshStandardMaterial({color:0x74796a,roughness:.98}),
      kelp:new THREE.MeshStandardMaterial({color:0xc5ac71,roughness:.82,side:THREE.DoubleSide,vertexColors:true})};
    this._materials.kelp.onBeforeCompile=shader=>{
      shader.uniforms.kelpOceanTime=this._uniforms.time;shader.uniforms.kelpOceanFlow=this._uniforms.flow;
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
        uniform float kelpOceanTime;
        uniform float kelpOceanFlow;`);
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        #ifdef USE_INSTANCING
          float kelpPhase=instanceMatrix[3].x*.17+instanceMatrix[3].z*.13;
          float kelpFraction=clamp(position.y,0.0,1.0);
          float kelpTip=kelpFraction*kelpFraction;
          vec2 kelpWorldOffset=vec2(
            kelpOceanFlow*.54*pow(kelpFraction,1.8)+sin(kelpOceanTime*.43+kelpPhase+kelpFraction*1.4)*(.08+kelpOceanFlow*.30)*kelpTip,
            sin(kelpOceanTime*.31+kelpPhase*1.2+kelpFraction)*(.03+kelpOceanFlow*.12)*kelpTip);
          // Current is world +X in this qualitative kelp sea. Undo instance
          // yaw so plant rotations cannot turn it into unrelated currents.
          transformed.x+=dot(kelpWorldOffset,normalize(instanceMatrix[0].xz));
          transformed.z+=dot(kelpWorldOffset,normalize(instanceMatrix[2].xz));
        #endif`);
    };
    this._materials.kelp.customProgramCacheKey=()=> 'kelp-ocean-landscape-sway-v2-world-current';
    this._geometries={kelp:kelpGeometry()};for(const profile of PROFILES)this._geometries[`rock-${profile}`]=rockGeometry(profile);
    this._refreshStats();
  }
  _terrainGeometry(chunk){
    const row=SEGMENTS+1,spacing=64/SEGMENTS,positions=[],normals=[],colors=[],covers=[],uvs=[],indices=[];
    const coverIndex=createKelpOceanHabitatCover(this.generator,chunk),coverTotals=[0,0,0];
    for(let iz=0;iz<=SEGMENTS;iz++)for(let ix=0;ix<=SEGMENTS;ix++){
      const x=chunk.origin.x+ix*spacing,z=chunk.origin.z+iz*spacing,state=this.generator.sample(x,z);
      positions.push(ix*spacing,this.generator.floorVertex(x,z),iz*spacing);
      const normal=this.generator.floorSurface(x,z).normal;
      normals.push(normal.x,normal.y,normal.z);
      const fade=THREE.MathUtils.smoothstep(Math.hypot(x,z),40,96),hard=state.rockiness*fade;
      const rootedCover=coverIndex.sample(x,z,state),forest=rootedCover.forest;
      // The broad shelf field shares the same existing hard-floor cue. Actual
      // plants still delimit forest cover; sediment channels retain openings.
      const shelfHard=THREE.MathUtils.clamp(state.landscape?.hardBottomWeight??0,0,1)*fade*(1-forest);
      const hardBottom=Math.max(rootedCover.hardBottom,shelfHard);
      const opening=Math.max(0,rootedCover.opening-(hardBottom-rootedCover.hardBottom));
      // These cues follow the real landform but are neither measured substrate
      // coverage nor additional plants or food stocks.
      colors.push((1-hard*.20)*(1-.30*forest-.10*hardBottom+.20*opening),
        (1-hard*.13)*(1-.24*forest-.08*hardBottom+.16*opening),
        (1-hard*.24)*(1-.34*forest-.12*hardBottom+.06*opening));
      covers.push(forest,hardBottom,opening);coverTotals[0]+=forest;coverTotals[1]+=hardBottom;coverTotals[2]+=opening;
      uvs.push(x/70+.5,.5-z/70);
      if(ix<SEGMENTS&&iz<SEGMENTS){const a=iz*row+ix,b=a+1,c=a+row,d=c+1;indices.push(a,c,b,b,c,d);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setAttribute('kelpHabitatCover',new THREE.Float32BufferAttribute(covers,3));
    geometry.userData.habitatCover=Object.freeze({...coverIndex.stats,
      macroRole:'coordinate-shelf-display-weight-not-root-cover-or-food',
      meanWeights:Object.freeze(coverTotals.map(total=>total/(row*row)))});
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
  }
  _rockBaseGeometry(chunk){
    const {positions,indices}=oceanRockFootingMesh(chunk.elements.filter(element=>element.kind==='rock'||element.kind==='formation'),chunk.origin,
      (x,z)=>this.generator.floorSurface(x,z).height);
    if(!positions.length)return null;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
  }
  _load(cx,cz){
    const chunk=this.generator.chunk(cx,cz),group=new THREE.Group();group.name=`kelp-chunk:${chunk.id}`;
    group.position.set(chunk.origin.x-this.renderOrigin.x,0,chunk.origin.z-this.renderOrigin.z);
    group.userData.chunkId=chunk.id;const terrainGeometry=this._terrainGeometry(chunk),floor=new THREE.Mesh(terrainGeometry,this._terrainMaterial);
    floor.receiveShadow=true;floor.userData.landscapeKind='floor';group.add(floor);
    const rockBaseGeometry=this._rockBaseGeometry(chunk);
    if(rockBaseGeometry){const bases=new THREE.Mesh(rockBaseGeometry,this._materials.rock);
      bases.name=`${chunk.id}:buried-rock-sides`;bases.userData.landscapeKind='rock-base';bases.receiveShadow=true;bases.castShadow=true;group.add(bases);}
    const instances=[],elementCounts={rock:0,kelp:0,formation:0},rockProfileCounts={mound:0,terrace:0,ridge:0};
    // Large landforms use the same physical profiles as generated rocks. Their
    // separate batches retain the old rock/plant matrices and prototype count.
    const batches=[...PROFILES.map(profile=>({kind:'rock',profile})),{kind:'kelp'},
      ...PROFILES.map(profile=>({kind:'formation',profile}))];
    for(const {kind,profile} of batches){
      const geometryKey=kind==='kelp'?'kelp':`rock-${profile}`;
      const elements=chunk.elements.filter(element=>element.kind===kind&&(kind==='kelp'||element.profile===profile));
      if(!elements.length)continue;
      const mesh=new THREE.InstancedMesh(this._geometries[geometryKey],kind==='kelp'?this._materials.kelp:this._materials.rock,elements.length);
      mesh.name=`${chunk.id}:${kind==='formation'?`formation-${profile}`:geometryKey}`;mesh.userData.landscapeKind=kind;
      mesh.userData.role='scenery-not-ecological-biomass';mesh.userData.elementIds=elements.map(element=>element.id);
      for(let i=0;i<elements.length;i++){
        const element=elements[i];this._transform.position.set(element.x-chunk.origin.x,element.y,element.z-chunk.origin.z);
        this._transform.rotation.set(0,kind==='kelp'?element.anchor.phase:element.rotation,0);
        if(kind==='kelp')this._transform.scale.set(1,element.lengthM,1);else this._transform.scale.set(element.scale.x,element.scale.y,element.scale.z);
        this._transform.updateMatrix();mesh.setMatrixAt(i,this._transform.matrix);
        const tint=kind==='kelp'?.84+(element.anchor.phase/(Math.PI*2))*.18:.86+(element.rotation/(Math.PI*2))*.15;
        this._color.setRGB(tint,tint,kind==='kelp'?tint*.92:tint);mesh.setColorAt(i,this._color);
      }
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      mesh.castShadow=kind!=='kelp';mesh.receiveShadow=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
      if(kind==='kelp'){
        mesh.userData.landscapeMatrices=mesh.instanceMatrix.array.slice();
        for(let i=0;i<elements.length;i++)if(this._detailedHostIds.has(elements[i].id))this._hidePlant(mesh,i);
      }
      if(kind==='rock')rockProfileCounts[profile]=elements.length;
      elementCounts[kind]+=elements.length;group.add(mesh);instances.push(mesh);
    }
    this.root.add(group);this._chunks.set(chunk.id,{group,origin:chunk.origin,terrainGeometry,rockBaseGeometry,instances,elementCounts,rockProfileCounts,
      landformElements:chunk.elements.filter(element=>element.kind==='formation')});this._loads++;
  }
  _unload(id){
    const record=this._chunks.get(id);if(!record)return;
    record.group.removeFromParent();record.terrainGeometry.dispose();record.rockBaseGeometry?.dispose();for(const mesh of record.instances)mesh.dispose();record.group.clear();
    this._chunks.delete(id);this._unloads++;
  }
  _refreshStats(){
    const elementCounts={rock:0,kelp:0,formation:0},rockProfileCounts={mound:0,terrace:0,ridge:0},landformGroups=new Map();
    let sceneryDraws=0,sceneryTriangles=0,formationDrawCalls=0,formationTriangles=0;
    for(const record of this._chunks.values()){
      sceneryDraws+=record.instances.length+(record.rockBaseGeometry?1:0);
      sceneryTriangles+=(record.rockBaseGeometry?.index.count||0)/3;
      for(const kind of ['rock','kelp','formation'])elementCounts[kind]+=record.elementCounts[kind];
      for(const profile of PROFILES)rockProfileCounts[profile]+=record.rockProfileCounts[profile];
      for(const mesh of record.instances){
        const triangles=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3*mesh.count;
        sceneryTriangles+=triangles;
        if(mesh.userData.landscapeKind==='formation'){formationTriangles+=triangles;formationDrawCalls++;}
      }
      for(const element of record.landformElements){
        let group=landformGroups.get(element.groupId);
        if(!group){group={id:element.groupId,profile:element.profile,rotation:element.rotation,
          residentFormationCount:0,elementIds:[],ownerChunkIds:[]};landformGroups.set(element.groupId,group);}
        group.residentFormationCount++;group.elementIds.push(element.id);
        if(!group.ownerChunkIds.includes(record.group.userData.chunkId))group.ownerChunkIds.push(record.group.userData.chunkId);
      }
    }
    this._stats=Object.freeze({seed:this.generator.seed,chunkSize:KELP_OCEAN_CHUNK_SIZE,activeChunks:this._chunks.size,maxActiveChunks:MAX_CHUNKS,
      center:this._center?Object.freeze({...this._center}):null,renderOrigin:Object.freeze({...this.renderOrigin}),
      loadedChunks:Object.freeze([...this._chunks.keys()]),sceneryInstances:elementCounts.rock+elementCounts.kelp+elementCounts.formation,
      elementCounts:Object.freeze(elementCounts),rockProfileCounts:Object.freeze(rockProfileCounts),
      sceneryTriangles,prototypeGeometries:Object.keys(this._geometries).length,prototypeMaterials:3,ownedOverlayGeometries:0,
      supportGeometryVersion:this.generator.supportVersion??KELP_OCEAN_SUPPORT_GEOMETRY_VERSION,formationTriangles,formationDrawCalls,
      maxFormationInstances:MAX_CHUNKS*(KELP_OCEAN_ELEMENT_LIMITS.formation??0),
      landformGroups:Object.freeze([...landformGroups.values()].map(group=>Object.freeze({...group,
        elementIds:Object.freeze(group.elementIds),ownerChunkIds:Object.freeze(group.ownerChunkIds)}))),
      ownedRockBaseGeometries:[...this._chunks.values()].filter(record=>record.rockBaseGeometry).length,
      terrainTriangles:this._chunks.size*SEGMENTS**2*2,drawCalls:this._chunks.size+sceneryDraws,maxDrawCalls:MAX_CHUNKS*(this.generator.supportVersion===1?6:9),
      loads:this._loads,unloads:this._unloads,landscapeRole:'decorative-plants-not-simulated-biomass',
      detailedHostIds:Object.freeze([...this._detailedHostIds]),
      terrainAppearance:Object.freeze({version:KELP_HABITAT_MATERIAL_VERSION,role:'surface-cues-not-food-or-physical-substrate',
        coverAttributes:this._chunks.size,maximumSourceChunks:9,maximumSupportRadiusM:8,
        macroRole:'coordinate-shelf-display-weight-not-root-cover-or-food',
        residentCoverBytes:this._chunks.size*(SEGMENTS+1)**2*3*4}),
      animation:{clockSec:this._uniforms.time.value,currentMps:this._uniforms.flow.value,scope:'paused-visual-clock-display-deformation'}});
  }
  update(position){
    if(this._disposed)return false;
    if(!Number.isFinite(position?.x)||!Number.isFinite(position?.z))throw new TypeError('Kelp ocean position needs finite X/Z.');
    this._position={x:position.x,z:position.z};const cx=Math.floor(position.x/64),cz=Math.floor(position.z/64);
    if(this._center?.cx===cx&&this._center?.cz===cz)return false;
    const wanted=new Set();for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)wanted.add(`${cx+dx},${cz+dz}`);
    for(const id of this._chunks.keys())if(!wanted.has(id))this._unload(id);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if(!this._chunks.has(`${cx+dx},${cz+dz}`))this._load(cx+dx,cz+dz);
    this._center={cx,cz};this._refreshStats();return true;
  }
  setRenderOrigin(origin){
    if(this._disposed)return false;
    if(!Number.isFinite(origin?.x)||!Number.isFinite(origin?.z))throw new TypeError('Kelp rendering origin needs finite X/Z.');
    if(origin.x===this.renderOrigin.x&&origin.z===this.renderOrigin.z)return false;
    this.renderOrigin={x:origin.x,z:origin.z};for(const record of this._chunks.values())record.group.position.set(record.origin.x-origin.x,0,record.origin.z-origin.z);
    this._refreshStats();return true;
  }
  setEnvironment(water,visualTime){
    if(this._disposed)return;
    if(Number.isFinite(visualTime))this._uniforms.time.value=visualTime;
    if(Number.isFinite(water?.currentMps))this._uniforms.flow.value=THREE.MathUtils.clamp(water.currentMps,0,1.2);
    this._refreshStats();
  }
  _hidePlant(mesh,index){
    const array=mesh.instanceMatrix.array,offset=index*16;
    for(const axis of [0,1,2,4,5,6,8,9,10])array[offset+axis]=0;
    mesh.instanceMatrix.needsUpdate=true;
  }
  setDetailedHosts(ids){
    if(this._disposed)return false;
    const next=new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string').slice(0,27):[]);
    if(next.size===this._detailedHostIds.size&&[...next].every(id=>this._detailedHostIds.has(id)))return false;
    this._detailedHostIds=next;
    for(const record of this._chunks.values())for(const mesh of record.instances){
      if(mesh.userData.landscapeKind!=='kelp')continue;
      const matrix=mesh.userData.landscapeMatrices;
      mesh.instanceMatrix.array.set(matrix);
      for(let i=0;i<mesh.count;i++)if(next.has(mesh.userData.elementIds[i]))this._hidePlant(mesh,i);
      mesh.instanceMatrix.needsUpdate=true;
    }
    this._refreshStats();return true;
  }
  reset(seed){
    if(this._disposed)return false;for(const id of this._chunks.keys())this._unload(id);
    this.generator=createKelpOceanGenerator(seed);this._center=null;this._uniforms.time.value=0;this._detailedHostIds.clear();return this.update(this._position);
  }
  get stats(){return this._stats;}
  dispose(){
    if(this._disposed)return;this._disposed=true;for(const id of this._chunks.keys())this._unload(id);
    for(const geometry of Object.values(this._geometries))geometry.dispose();for(const material of Object.values(this._materials))material.dispose();
    this._terrainMaterial.dispose();this.generator.clearCache();this.root.clear();this.root.removeFromParent();this._refreshStats();
  }
}
