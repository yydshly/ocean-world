import {LIVING_KIT_FISH,LIVING_KIT_CORALS,livingKitData} from './ShallowLivingKit.js';
import {naturalHabitatData,naturalBankSubstrate} from './ShallowNaturalHabitat.js';
import * as THREE from 'three';
import {reefBankGeometries} from './ShallowReefBank.js';
import {shallowBenthicCoralGeometries} from './ShallowBenthicCorals.js';
import data from './shallowNearCommunityData.js';
import distantReef from './shallowReefDistanceData.js';
import {ShallowVisibleInstances} from './ShallowVisibleInstances.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {deformMaterial} from './ShallowSourcedFishAssets.js';
import {registerFieldReefMesh,oceanRockHeight} from '../oceanRockShape.js';
import {reefAttachedColour} from './ShallowHabitatForms.js';
import {shallowBranchingCoralGeometries} from './ShallowBranchingCorals.js';
import {shallowOpenCoralGeometries} from './ShallowOpenCommunity.js';

export const NEAR_FISH_ID='unidentified-reef-fish';
export const FIELD_REEF_PROFILE='sample-field-reefscan-v3';
export const REEF_ASSEMBLY_PROFILES=Object.freeze(Array.from({length:4},(_,i)=>`sample-field-community-${i}-v2`));
const decoded=new WeakMap();
export function nearSourceGeometry(row){
  let raw=decoded.get(row);if(!raw){
    if(Uint8Array.fromBase64)raw=Uint8Array.fromBase64(row.data);
    else {const text=atob(row.data);raw=new Uint8Array(text.length);for(let i=0;i<text.length;i++)raw[i]=text.charCodeAt(i);}
    decoded.set(row,raw);
  }
  // Geometry transforms must not mutate the shared decoded source buffer.
  const bytes=raw.slice(),g=new THREE.BufferGeometry();
  for(const [name,v]of Object.entries(row.views)){const T=name==='index'?(row.indexType==='uint32'?Uint32Array:Uint16Array):Float32Array,a=new THREE.BufferAttribute(new T(bytes.buffer,v.offset,v.count*v.size),v.size);if(name==='index')g.setIndex(a);else g.setAttribute(name,a);}
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
const registered=new Set();
// Close only the outer cut perimeter. Extruding each disconnected scan island
// makes a picket fence, not a reef foundation. This cap is visible authored
// limestone and is registered with exactly the same support mesh below.
let foundation;
export function nearReefFoundationGeometry(){
  if(foundation)return foundation.clone();
  const points=new Map();
  for(const row of data.reefscan.variants.near){const g=nearSourceGeometry(row),p=g.attributes.position;
    for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-data.reefscan.clipFloor)<1e-6){const x=p.getX(i),z=p.getZ(i);points.set(`${x},${z}`,[x,z]);}g.dispose();
  }
  const sorted=[...points.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const half=rows=>{const out=[];for(const p of rows){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
  const hull=[...half(sorted).slice(0,-1),...half([...sorted].reverse()).slice(0,-1)];
  const cx=hull.reduce((n,p)=>n+p[0],0)/hull.length,cz=hull.reduce((n,p)=>n+p[1],0)/hull.length;
  const positions=[cx,.24,cz],index=[],bottom=[0];
  for(const [x,z]of hull){positions.push(x,data.reefscan.clipFloor-.002,z);bottom.push(0);}
  // Three real rings form a weathered apron, replacing the vertical wall.
  // Source colonies stay intact; only the authored carbonate support changes.
  for(const ring of [1,2,3])for(const [x,z]of hull){
    const angle=Math.atan2(z-cz,x-cx),spread=1+ring*(.105+.020*Math.sin(angle*3)+.014*Math.cos(angle*5));
    let px=cx+(x-cx)*spread,pz=cz+(z-cz)*spread;const radius=Math.hypot(px,pz);
    if(radius>.63){px*=.63/radius;pz*=.63/radius;}
    positions.push(px,ring===3?0:data.reefscan.clipFloor*(1-ring/3)**1.5,pz);bottom.push(ring===3?1:0);
  }
  const n=hull.length;
  for(let i=0;i<n;i++){const a=1+i,b=1+(i+1)%n;index.push(0,b,a);for(let ring=0;ring<3;ring++){const c=a+ring*n,d=b+ring*n;index.push(c,d,d+n,c,d+n,c+n);}}
  foundation=new THREE.BufferGeometry();foundation.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));foundation.setAttribute('foundationBottom',new THREE.Float32BufferAttribute(bottom,1));foundation.setIndex(index);foundation.computeVertexNormals();
  return foundation.clone();
}

// Whole colonies, rather than rotated copies of one survey, form four distinct
// reef communities. Source meshes/UVs stay intact. This is authored assembly,
// not four new scan sites or measured biological cover.
const assemblyCache=new Map();
export function reefAssemblyGeometries(variant,detail='near'){
  const cacheKey=`${variant}/${detail}`;
  if(!assemblyCache.has(cacheKey)){
    const assets={...shallowBranchingCoralGeometries(detail),...shallowOpenCoralGeometries(detail),...nearColonyGeometries(detail),...shallowBenthicCoralGeometries(detail)};
    const recipes=[
      ['branching-0','branching-1','table-1','massive-0','table-1','branching-1','table-1'],
      ['massive-1','table-0','massive-1','branching-1','table-0','massive-1','table-0'],
      ['table-1','branching-1','table-1','massive-0','table-1','branching-0','table-1'],
      ['branching-1','branching-1','massive-1','table-0','branching-0','branching-1','massive-1'],
    ];
    const base=nearReefFoundationGeometry(),surface=new THREE.Mesh(base,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));surface.updateMatrixWorld();
    const ray=new THREE.Raycaster(),groups=new Map();
    recipes[variant].forEach((key,i)=>{
      const a=i*2.39996+variant*.73,r=i===0?.035:.20+.024*(i%3),x=Math.cos(a)*r,z=Math.sin(a)*r;
      const width=(i===0?.40:.27)+.018*Math.sin(i*3+variant),g=assets[key].clone();
      ray.set(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0));const y=ray.intersectObject(surface)[0]?.point.y??.24;
      g.scale(width,width*assets[key].userData.sourceAspect/data.reefscan.aspect,width);g.rotateY(a+.6*i);g.translate(x,y-.012,z);
      // Every part has a common attribute layout for instancing by source.
      const count=g.attributes.position.count;
      if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(count*2),2));
      if(!g.attributes.color)g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(count*3).fill(1),3));
      g.clearGroups();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(g);
    });
    const result={};for(const [key,parts]of groups){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();result[key]=g;}
    Object.values(assets).forEach(g=>g.dispose());surface.material.dispose();base.dispose();assemblyCache.set(cacheKey,result);
  }
  return Object.fromEntries(Object.entries(assemblyCache.get(cacheKey)).map(([k,g])=>[k,g.clone()]));
}
export function makeResidentReefPatch(model,rock){
  const width=4.5,height=width*data.reefscan.aspect;
  return {...rock,fieldAsset:'reefscan',profile:FIELD_REEF_PROFILE,scale:{x:width,y:height,z:width},
    y:model.floor(rock.x,rock.z)-.06-data.reefscan.clipFloor*height};
}
export function arrangeNearReefAssets(model){
  for(const key of ['foliose',...(data.reefscan?['reefscan']:[])])if(!registered.has(key)){
    const parts=data[key].variants.near.map(nearSourceGeometry);
    const surfaceParts=parts.map(g=>{const p=new THREE.BufferGeometry();p.setAttribute('position',g.attributes.position);p.setIndex(g.index);return p;});
    if(key==='reefscan'){const base=nearReefFoundationGeometry();base.deleteAttribute('normal');base.deleteAttribute('foundationBottom');surfaceParts.push(base);}
    const merged=mergeGeometries(surfaceParts);
    registerFieldReefMesh(key==='reefscan'?FIELD_REEF_PROFILE:`sample-field-${key}`,merged.attributes.position.array,merged.index.array);
    parts.forEach(g=>g.dispose());surfaceParts.forEach(g=>g.dispose());merged.dispose();registered.add(key);
  }
  for(const rock of model.rocks){
    // Preserve the actual contact surfaces used by the complete benthic
    // community. Whole scanned outcrops form the rear and opposite reef bank;
    // smaller source colonies cover the continuous inhabited front slope.
    if(rock.sampleSlope||!/^sample-rock-/.test(rock.id)||Math.abs(rock.z)<6.8)continue;
    const key='reefscan',width=Math.min(9,Math.max(5.6,rock.scale.x));
    rock.fieldAsset=key;rock.profile=FIELD_REEF_PROFILE;
    rock.scale={x:width,y:width*data[key].aspect,z:width};
    if(rock.z>0)rock.z=Math.max(rock.z,16);
    // The source survey apron is gone. Retained upper colonies stand on the
    // visible foundation constructed below, not a floating textured rectangle.
    rock.y=model.floor(rock.x,rock.z)-rock.scale.y*.24;
  }
  // Foreground banks already contain their living heads and animal pockets.
  // The former rear/toe overlays are removed with the old ramp.
  // Place whole communities against the local carbonate grade. The source
  // base retains its height; the new apron joins below the surrounding bed.
  const substrate=model.rocks.filter(r=>!r.fieldAsset),base=nearReefFoundationGeometry(),p=base.attributes.position;
  const rim=[];for(let i=0;i<p.count;i++)if(base.attributes.foundationBottom.getX(i))rim.push([p.getX(i),p.getZ(i)]);
  const support=(x,z)=>{let y=model.floor(x,z);for(const host of substrate){
    if(Math.hypot(x-host.x,z-host.z)>Math.hypot(host.scale.x,host.scale.z)*.5)continue;
    y=Math.max(y,oceanRockHeight(host,x,z)??y);
  }return y;};
  for(const rock of model.rocks.filter(r=>r.fieldAsset==='reefscan')){
    const co=Math.cos(rock.rotation),si=Math.sin(rock.rotation);const levels=[];let lowFloor=Infinity;
    for(let i=0;i<rim.length;i++){
      const a=rim[i],b=rim[(i+1)%rim.length],steps=Math.max(2,Math.ceil(Math.hypot((b[0]-a[0])*rock.scale.x,(b[1]-a[1])*rock.scale.z)/.18));
      for(let j=0;j<=steps;j++){const u=j/steps,x=a[0]+(b[0]-a[0])*u,z=a[1]+(b[1]-a[1])*u;
        const wx=rock.x+x*rock.scale.x*co+z*rock.scale.z*si,wz=rock.z-x*rock.scale.x*si+z*rock.scale.z*co;
        levels.push(support(wx,wz));lowFloor=Math.min(lowFloor,model.floor(wx,wz));}
    }
    levels.sort((a,b)=>a-b);const grade=levels[Math.floor(levels.length*.68)];
    rock.y=Math.min(grade-.04-data.reefscan.clipFloor*rock.scale.y,lowFloor-.07);
    rock.groundedCutHeight=rock.y+data.reefscan.clipFloor*rock.scale.y;
  }base.dispose();
  // Retain one quarter of the surveyed outcrops; the rest use independently
  // composed colony silhouettes with the same grounded foundation footprint.
  const outcrops=model.rocks.filter(r=>r.fieldAsset==='reefscan');
  for(let i=0;i<outcrops.length;i++)if(i%4!==0&&!outcrops[i].id.startsWith('sample-field-toe-')){
    const variant=Math.floor(i/3)%4,profile=REEF_ASSEMBLY_PROFILES[variant];
    if(!registered.has(profile)){
      const parts=Object.values(reefAssemblyGeometries(variant));parts.push(nearReefFoundationGeometry());
      const plain=parts.map(g=>{const p=new THREE.BufferGeometry();p.setAttribute('position',g.attributes.position);p.setIndex(g.index);return p;});
      const merged=mergeGeometries(plain);registerFieldReefMesh(profile,merged.attributes.position.array,merged.index.array);
      [...parts,...plain,merged].forEach(g=>g.dispose());registered.add(profile);
    }
    outcrops[i].communityVariant=variant;outcrops[i].profile=profile;
  }
  model.nearReefRevision='mixed-whole-colony-communities-v1';return model.rocks.filter(r=>r.fieldAsset);
}

export function nearColonyGeometries(detail='near'){
  const rows=data.foliose.variants[detail],result={};
  for(let variant=0;variant<4;variant++){
    const parts=rows.map(nearSourceGeometry),g=mergeGeometries(parts,true);parts.forEach(p=>p.dispose());g.rotateY(variant*Math.PI*.5);g.computeBoundingBox();g.computeBoundingSphere();
    g.userData={form:'table',variant,detail,sourceKey:'foliose',sourceAspect:data.foliose.aspect,sourceKind:'CC-BY-NC-SA-4.0-field-community',rootRadius:.49};result[`table-${variant}`]=g;
  }return result;
}

export class ShallowNearCommunity{
  constructor(){this.resources=new Set();this.materials=new Map();this.models=new Map();this.reefBatches=[];this.clock={value:0};this.sealed=false;this.disposed=false;}
  own(r){this.resources.add(r);return r;}
  material(row,fish=false){
    if(this.materials.has(row.file))return this.materials.get(row.file);
    const m=this.own(new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:!!row.views.color,roughness:fish?.58:.87,metalness:0,side:THREE.DoubleSide}));if(fish)deformMaterial(m,this.clock);
    Object.assign(m.userData,{nativeBaseColorFile:`public/assets/${row.directory??'shallow-near-community'}/${row.file}`,nativeAssetDirectory:row.directory??'shallow-near-community',nativeBaseColorFlipY:false,nativeBaseColorWrapS:row.wrapS,nativeBaseColorWrapT:row.wrapT,nativeVertexColorsAreAlbedo:true});
    if(row.directory==='shallow-natural-habitat')this.sedimentContact?.apply(m);
    this.materials.set(row.file,m);return m;
  }
  bankCoralMaterial(key){const source=LIVING_KIT_CORALS[key];return source?livingKitData[source].variants.near.map(r=>this.material(r)):null;}
  coralMaterial(key){return key.startsWith('table-')?data.foliose.variants.near.map(r=>this.material(r)):null;}
  create(id){
    if(id!==NEAR_FISH_ID&&!LIVING_KIT_FISH[id])return null;if(this.models.has(id))return this.models.get(id);
    const root=new THREE.Group();let motionRadius=0;
    for(const row of (LIVING_KIT_FISH[id]?livingKitData[LIVING_KIT_FISH[id]]:data.fish).variants.near){const g=this.own(nearSourceGeometry(row)),p=g.attributes.position;
      g.setAttribute('sampleSwimX',new THREE.Float32BufferAttribute(Array.from({length:p.count},(_,i)=>p.getX(i)),1));g.setAttribute('sampleSwim',new THREE.InstancedBufferAttribute(new Float32Array([0,4.1,.025]),3));
      for(let i=0;i<p.count;i++)motionRadius=Math.max(motionRadius,Math.hypot(p.getX(i),Math.abs(p.getZ(i))+.028));g.boundingBox.min.z-=.028;g.boundingBox.max.z+=.028;g.boundingBox.getBoundingSphere(g.boundingSphere);
      const mesh=new THREE.Mesh(g,this.material(row,true));mesh.name='attributed textured reef-fish body';mesh.customDepthMaterial=this.own(deformMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide}),this.clock));root.add(mesh);
    }root.updateMatrixWorld(true);const result={id,root,motionRadius};this.models.set(id,result);return result;
  }
  buildReefs(model,parent,foundationMaterial,colonyMaterial){
    // Dense crowns are culled per complete bank, so one visible head does not
    // submit a sixty-metre sector. Sparse branches share two sector draws;
    // the small static contact surfaces share one lightweight draw.
    const banks=model.rocks.filter(r=>r.fieldAsset==='habitat-bank');
    const transform=r=>new THREE.Matrix4().compose(new THREE.Vector3(r.x,r.y,r.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),r.rotation),new THREE.Vector3(r.scale.x,r.scale.y,r.scale.z));
    const specifications=[
      ...Array.from({length:4},(_,v)=>({name:`variant ${v}`,rocks:banks.filter(r=>r.bankVariant===v),keys:['table-1','massive-1','table-2','branching-1'],merge:false})),
      ...['near','tail'].map(sector=>({name:`branches ${sector}`,rocks:banks.filter(r=>r.slopeSector===sector),keys:['branching-0'],merge:true})),
    ];
    for(const spec of specifications){
      if(!spec.rocks.length)continue;const nearMeshes=[],farMeshes=[];
      for(const detail of ['near','distant']){
        const groups=new Map();
        for(const r of spec.merge?spec.rocks:[spec.rocks[0]]){
          const parts=reefBankGeometries(r.bankVariant,detail);
          for(const [key,g]of Object.entries(parts)){
            if(!spec.keys.includes(key)){g.dispose();continue;}
            if(spec.merge)g.applyMatrix4(transform(r));
            if(!groups.has(key))groups.set(key,[]);groups.get(key).push(g);
          }
        }
        for(const [key,parts]of groups){
          const g=this.own(parts.length===1?parts[0].clone():mergeGeometries(parts));parts.forEach(p=>p.dispose());g.computeBoundingSphere();
          const mesh=new THREE.InstancedMesh(g,key==='substrate'?this.material({...naturalHabitatData.coast_land_rocks_02.variants.near[0],directory:'shallow-natural-habitat'}):(this.bankCoralMaterial(key)??colonyMaterial(key)),spec.merge?1:spec.rocks.length);
          if(spec.merge)mesh.setMatrixAt(0,new THREE.Matrix4());else spec.rocks.forEach((r,i)=>mesh.setMatrixAt(i,transform(r)));
          mesh.computeBoundingSphere();mesh.castShadow=detail==='near';mesh.receiveShadow=true;mesh.name=`Living reef bank / ${spec.name} / ${key} / ${detail}`;parent.add(mesh);this.own(mesh);
          (detail==='near'?nearMeshes:farMeshes).push(mesh);
        }
      }
      this.reefBatches.push(new ShallowVisibleInstances(nearMeshes,farMeshes,{nearDistance:16,farDistance:22}));
    }
    for(let variant=0;variant<2;variant++){
      const rocks=model.rocks.filter(r=>['natural-substrate','habitat-bank'].includes(r.fieldAsset)&&r.bankVariant%2===variant);if(!rocks.length)continue;
      const pair=[];
      for(const detail of ['near','distant']){
        const g=this.own(naturalBankSubstrate(variant,detail)),material=this.material({...naturalHabitatData.coast_land_rocks_02.variants.near[0],directory:'shallow-natural-habitat'});
        const mesh=this.own(new THREE.InstancedMesh(g,material,rocks.length));rocks.forEach((r,i)=>mesh.setMatrixAt(i,transform(r)));mesh.computeBoundingSphere();mesh.name=`Natural animal habitat / ${variant} / ${detail}`;mesh.castShadow=detail==='near';mesh.receiveShadow=true;parent.add(mesh);pair.push([mesh]);
      }
      this.reefBatches.push(new ShallowVisibleInstances(pair[0],pair[1],{nearDistance:16,farDistance:22}));
    }
    for(const key of ['foliose','reefscan'])if(data[key]){
      const rocks=model.rocks.filter(r=>r.fieldAsset===key&&r.communityVariant===undefined);if(!rocks.length)continue;
      const nearMeshes=[],farMeshes=[];
      for(const [detail,rows]of [['near',data[key].variants.near],['far',key==='reefscan'?distantReef:data[key].variants.distant]])for(const row of rows){const g=this.own(nearSourceGeometry(row)),mesh=new THREE.InstancedMesh(g,this.material(row),rocks.length),m=new THREE.Matrix4(),q=new THREE.Quaternion();
        rocks.forEach((r,i)=>mesh.setMatrixAt(i,m.compose(new THREE.Vector3(r.x,r.y,r.z),q.setFromAxisAngle(new THREE.Vector3(0,1,0),r.rotation),new THREE.Vector3(r.scale.x,r.scale.y,r.scale.z))));
        mesh.computeBoundingSphere();mesh.castShadow=detail==='near';mesh.receiveShadow=true;mesh.name=`Whole field reef / ${key} / ${detail}`;parent.add(mesh);this.own(mesh);
        (detail==='near'?nearMeshes:farMeshes).push(mesh);
      }
      this.reefBatches.push(new ShallowVisibleInstances(nearMeshes,farMeshes,{nearDistance:16,farDistance:22}));
    }
    for(let variant=0;variant<4;variant++){
      const rocks=model.rocks.filter(r=>r.communityVariant===variant);if(!rocks.length)continue;
      const nearMeshes=[],farMeshes=[];
      for(const detail of ['near','distant'])for(const [key,g]of Object.entries(reefAssemblyGeometries(variant,detail))){
        const mesh=new THREE.InstancedMesh(this.own(g),colonyMaterial(key),rocks.length),m=new THREE.Matrix4(),q=new THREE.Quaternion();
        rocks.forEach((r,i)=>mesh.setMatrixAt(i,m.compose(new THREE.Vector3(r.x,r.y,r.z),q.setFromAxisAngle(new THREE.Vector3(0,1,0),r.rotation),new THREE.Vector3(r.scale.x,r.scale.y,r.scale.z))));
        mesh.computeBoundingSphere();mesh.castShadow=detail==='near';mesh.receiveShadow=true;mesh.name=`Assembled reef community / ${variant} / ${key} / ${detail}`;parent.add(mesh);this.own(mesh);
        (detail==='near'?nearMeshes:farMeshes).push(mesh);
      }
      this.reefBatches.push(new ShallowVisibleInstances(nearMeshes,farMeshes,{nearDistance:16,farDistance:22}));
    }
    if(foundationMaterial){
      const groups=new Map(),color=new THREE.Color(),base=nearReefFoundationGeometry(),p=base.attributes.position;
      for(const r of model.rocks.filter(r=>r.fieldAsset==='reefscan')){
        const co=Math.cos(r.rotation),si=Math.sin(r.rotation);
        const key=Math.floor(r.x/32);if(!groups.has(key))groups.set(key,{positions:[],colors:[],uv:[],bottom:[]});const rows=groups.get(key);
        for(let j=0;j<base.index.count;j++){
          const i=base.index.getX(j),bottom=base.attributes.foundationBottom.getX(i),x=r.x+p.getX(i)*r.scale.x*co+p.getZ(i)*r.scale.z*si,z=r.z-p.getX(i)*r.scale.x*si+p.getZ(i)*r.scale.z*co;
          const y=r.y+p.getY(i)*r.scale.y;
          rows.positions.push(x,y,z);reefAttachedColour(x,y,z,.5,color);rows.colors.push(color.r,color.g,color.b);rows.uv.push(x*.5,z*.5);rows.bottom.push(bottom);
        }
      }
      base.dispose();
      for(const [key,rows]of groups)if(rows.positions.length){const g=this.own(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(rows.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(rows.colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(rows.uv,2));g.setAttribute('foundationBottom',new THREE.Float32BufferAttribute(rows.bottom,1));g.computeVertexNormals();
        const mesh=new THREE.Mesh(g,foundationMaterial);mesh.name=`Grounded field reef foundation / ${key}`;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
      }
    }
  }
  loadTextures({loader=new THREE.TextureLoader(),base=import.meta.env?.BASE_URL??'./'}={}){
    if(this.loading)return this.loading;
    this.loading=Promise.allSettled([...this.materials].map(async([file,m])=>{
      const t=await loader.loadAsync(`${base}assets/${m.userData.nativeAssetDirectory}/${file}`);if(this.sealed||this.disposed){t.dispose();return;}
      this.own(t);t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;t.wrapS=m.userData.nativeBaseColorWrapS==='repeat'?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;t.wrapT=m.userData.nativeBaseColorWrapT==='repeat'?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;t.anisotropy=4;m.map=t;m.vertexColors=false;m.needsUpdate=true;
    }));return this.loading;
  }
  update(time){this.clock.value=time;}
  updateVisibility(camera){for(const batch of this.reefBatches)batch.update(camera);}
  dispose(){if(this.disposed)return;this.disposed=true;this.sealed=true;for(const r of this.resources)r.dispose();this.resources.clear();}
}
