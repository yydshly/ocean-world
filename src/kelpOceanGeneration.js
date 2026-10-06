import { KELP_SURFACE_Y, floorHeight, habitatNormal, rockSurfaceHeight, KELP_ROCKS, KELP_ANCHORS } from './kelpHabitat.js';
import { oceanRockHeight, oceanRockMesh, oceanRockSurface } from './oceanRockShape.js';
import { createKelpOceanLandforms, KELP_LANDFORM_LIMIT } from './kelpOceanLandforms.js';
import { createKelpForestBeltGenerator } from './kelpForestBelt.js';

export const KELP_OCEAN_CHUNK_SIZE = 64;
export const KELP_OCEAN_SURFACE_Y = KELP_SURFACE_Y;
export const KELP_OCEAN_AUTHORED_RADIUS = 40;
export const KELP_OCEAN_CACHE_LIMIT = 32;
export const KELP_OCEAN_TERRAIN_SEGMENTS = 32;
export const KELP_OCEAN_SUPPORT_GEOMETRY_VERSION = 2;
export const KELP_OCEAN_VERTEX_CACHE_LIMIT = 16384;
export const KELP_OCEAN_ELEMENT_LIMITS = Object.freeze({ rock: 32, kelp: 72, formation: KELP_LANDFORM_LIMIT });
export { oceanRockMesh as kelpOceanRockMesh };
const TAU = Math.PI * 2;
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function hash(text) {
  let value = 2166136261;
  for(let i=0;i<text.length;i++){value^=text.charCodeAt(i);value=Math.imul(value,16777619);}
  value^=value>>>16;value=Math.imul(value,0x7feb352d);value^=value>>>15;value=Math.imul(value,0x846ca68b);
  return (value^(value>>>16))>>>0;
}
function coordinates(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))throw new RangeError('Kelp ocean coordinates must be finite world metres.');
}
function freezeElement(element){
  if(element.scale)Object.freeze(element.scale);
  if(element.anchor)Object.freeze(element.anchor);
  return Object.freeze(element);
}

/** A Monterey-inspired display landscape, not calibrated cover or bathymetry.
 * Only new peripheral scenery uses these fields; authored roots are unchanged. */
function createLegacyKelpOceanGenerator(seed=42){
  if(!['number','string'].includes(typeof seed)||(typeof seed==='number'&&!Number.isFinite(seed)))
    throw new TypeError('The kelp ocean seed must be a finite number or string.');
  const seedKey=`${typeof seed}:${seed}`,cache=new Map(),vertexCache=new Map(),neighborCache=new Map();
  const randomAt=(x,z,salt)=>hash(`${seedKey}|kelp-ocean|${x}|${z}|${salt}`)/4294967296;
  function noise(x,z,wavelength,salt){
    const gx=x/wavelength,gz=z/wavelength,ix=Math.floor(gx),iz=Math.floor(gz),tx=smooth(gx-ix),tz=smooth(gz-iz);
    return mix(mix(randomAt(ix,iz,salt),randomAt(ix+1,iz,salt),tx),
      mix(randomAt(ix,iz+1,salt),randomAt(ix+1,iz+1,salt),tx),tz);
  }
  function sample(x,z){
    coordinates(x,z);
    const blend=smooth((Math.hypot(x,z)-40)/56),macro=noise(x,z,210,'bathymetry'),relief=noise(x,z,72,'bottom-relief');
    const farFloor=-.6-10.8*macro-2.6*relief;
    const floorY=mix(floorHeight(x,z),farFloor,blend),depthM=KELP_SURFACE_Y-floorY;
    const forestField=.74*noise(x,z,170,'forest-cover')+.26*noise(x,z,55,'forest-gaps');
    const forestCover=mix(1,clamp01((forestField-.34)/.30),blend);
    const rockiness=mix(.8,clamp01(.78*noise(x,z,96,'hard-bottom')+.22*relief),blend);
    const habitat=forestCover>.5?'kelp-forest':rockiness>.57?'kelp-rock':'kelp-clearing';
    return {floorY,depthM,habitat,substrate:rockiness>.52?'rock':rockiness>.32?'mixed':'sand',rockiness,forestCover};
  }
  function floorVertex(x,z){
    coordinates(x,z);const id=`${x},${z}`,cached=vertexCache.get(id);if(cached!==undefined)return cached;
    const value=Math.fround(sample(x,z).floorY);vertexCache.set(id,value);
    if(vertexCache.size>KELP_OCEAN_VERTEX_CACHE_LIMIT)vertexCache.delete(vertexCache.keys().next().value);
    return value;
  }
  function floorSurface(x,z){
    coordinates(x,z);const spacing=64/KELP_OCEAN_TERRAIN_SEGMENTS;
    const ix=Math.floor(x/spacing)*spacing,iz=Math.floor(z/spacing)*spacing,tx=(x-ix)/spacing,tz=(z-iz)/spacing;
    const a=floorVertex(ix,iz),b=floorVertex(ix+spacing,iz),c=floorVertex(ix,iz+spacing),d=floorVertex(ix+spacing,iz+spacing);
    const first=tx+tz<=1,dx=(first?b-a:d-c)/spacing,dz=(first?c-a:d-b)/spacing,length=Math.hypot(dx,1,dz);
    return {height:first?a+(b-a)*tx+(c-a)*tz:d+(c-d)*(1-tx)+(b-d)*(1-tz),
      normal:{x:-dx/length,y:1/length,z:-dz/length},substrate:'sediment',elementId:null};
  }
  function chunk(cx,cz){
    if(!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz))throw new RangeError('Kelp chunk coordinates must be safe integers.');
    const id=`${cx},${cz}`;
    if(cache.has(id)){const value=cache.get(id);cache.delete(id);cache.set(id,value);return value;}
    const origin=Object.freeze({x:cx*64,z:cz*64}),rocks=[],kelp=[];
    for(let gz=Math.floor(origin.z/10)-1;gz<=Math.floor((origin.z+64)/10)+1;gz++)
      for(let gx=Math.floor(origin.x/10)-1;gx<=Math.floor((origin.x+64)/10)+1;gx++){
        const x=(gx+.5)*10+(randomAt(gx,gz,'rock-x')-.5)*2.5,z=(gz+.5)*10+(randomAt(gx,gz,'rock-z')-.5)*2.5;
        if(Math.floor(x/64)!==cx||Math.floor(z/64)!==cz)continue;
        const state=sample(x,z),width=3.3+randomAt(gx,gz,'rock-width')*3.2;
        if(Math.hypot(x,z)-width*.75<=42||randomAt(gx,gz,'rock-occupancy')>.10+.56*state.rockiness+.29*state.forestCover)continue;
        const type=randomAt(gx,gz,'profile'),profile=type<.60?'mound':type<.84?'terrace':'ridge';
        const scale={x:width,y:.38+randomAt(gx,gz,'rock-height')*.94,z:width*(.67+randomAt(gx,gz,'rock-aspect')*.25)};
        const rotation=randomAt(gx,gz,'rock-rotation')*TAU;
        const rock=freezeElement({id:`kelp-rock:${gx},${gz}`,kind:'rock',x,y:state.floorY-.08,z,scale,
          profile,rotation,priority:state.forestCover*.5+state.rockiness});
        rocks.push(rock);
      }
    rocks.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));rocks.length=Math.min(rocks.length,KELP_OCEAN_ELEMENT_LIMITS.rock);
    for(const rock of rocks){
      const state=sample(rock.x,rock.z);
      if(state.forestCover<.25)continue;
      const count=state.forestCover>.65?3:state.forestCover>.43?2:1;
      for(let slot=0;slot<count;slot++){
        if(randomAt(rock.x,rock.z,`plant:${slot}`)>state.forestCover+.12)continue;
        const angle=slot*TAU/3+rock.rotation,radius=.10+randomAt(rock.x,rock.z,`root-radius:${slot}`)*.11;
        const x=rock.x+Math.cos(angle)*rock.scale.x*radius,z=rock.z+Math.sin(angle)*rock.scale.z*radius;
        if(Math.floor(x/64)!==cx||Math.floor(z/64)!==cz)continue;
        const y=oceanRockHeight(rock,x,z),depth=KELP_SURFACE_Y-y;
        if(!Number.isFinite(y)||y<sample(x,z).floorY+.02||depth<5||depth>30)continue;
        const lengthM=Math.max(0,depth-.25)*(.88+.115*randomAt(rock.x,rock.z,`length:${slot}`));
        const id=`kelp:${rock.id}:${slot}`,phase=randomAt(rock.x,rock.z,`phase:${slot}`)*TAU;
        const anchor={id,x,y,z,lengthM,phase,hostId:rock.id};
        kelp.push(freezeElement({id,kind:'kelp',x,y,z,lengthM,hostId:rock.id,anchor}));
      }
    }
    kelp.sort((a,b)=>a.id.localeCompare(b.id));kelp.length=Math.min(kelp.length,KELP_OCEAN_ELEMENT_LIMITS.kelp);
    const habitats={'kelp-forest':0,'kelp-clearing':0,'kelp-rock':0};let minDepthM=Infinity,maxDepthM=-Infinity,forestCover=0;
    for(let iz=0;iz<8;iz++)for(let ix=0;ix<8;ix++){
      const state=sample(origin.x+(ix+.5)*8,origin.z+(iz+.5)*8);
      habitats[state.habitat]++;minDepthM=Math.min(minDepthM,state.depthM);maxDepthM=Math.max(maxDepthM,state.depthM);forestCover+=state.forestCover;
    }
    const ranked=Object.keys(habitats).sort((a,b)=>habitats[b]-habitats[a]);
    const composition=Object.freeze({samples:64,habitats:Object.freeze(habitats),primary:ranked[0],
      secondary:habitats[ranked[1]]>=13?ranked[1]:null,minDepthM,maxDepthM,forestCover:forestCover/64});
    const value=Object.freeze({id,cx,cz,size:64,origin,elements:Object.freeze([...rocks,...kelp]),
      counts:Object.freeze({rock:rocks.length,kelp:kelp.length}),composition,habitatComposition:composition});
    cache.set(id,value);while(cache.size>KELP_OCEAN_CACHE_LIMIT)cache.delete(cache.keys().next().value);
    return value;
  }
  function nearbyRocks(x,z){
    const cx=Math.floor(x/64),cz=Math.floor(z/64),id=`${cx},${cz}`;let neighbors=neighborCache.get(id);
    if(!neighbors){neighbors=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)
      for(const element of chunk(cx+dx,cz+dz).elements)if(element.kind==='rock')neighbors.push(element);
      neighborCache.set(id,neighbors);if(neighborCache.size>KELP_OCEAN_CACHE_LIMIT)neighborCache.delete(neighborCache.keys().next().value);
    }
    return neighbors.filter(element=>Math.abs(x-element.x)<element.scale.x*.6&&Math.abs(z-element.z)<element.scale.x*.6);
  }
  function supportAt(x,z){
    let support=floorSurface(x,z);
    if(Math.hypot(x,z)<=40){
      for(let index=0;index<KELP_ROCKS.length;index++){
        const height=rockSurfaceHeight(index,x,z);
        if(height>support.height)support={height,normal:habitatNormal(x,z),substrate:'rock',elementId:`authored-kelp-rock:${index}`};
      }
      return support;
    }
    for(const rock of nearbyRocks(x,z)){
      const height=oceanRockHeight(rock,x,z);if(!Number.isFinite(height)||height<=support.height)continue;
      const cos=Math.cos(rock.rotation),sin=Math.sin(rock.rotation),wx=x-rock.x,wz=z-rock.z;
      const face=oceanRockSurface(rock.profile,(wx*cos-wz*sin)/rock.scale.x,(wx*sin+wz*cos)/rock.scale.z);if(!face)continue;
      const nx=face.normal.x/rock.scale.x,ny=face.normal.y/rock.scale.y,nz=face.normal.z/rock.scale.z,length=Math.hypot(nx,ny,nz);
      support={height,normal:{x:(nx*cos+nz*sin)/length,y:ny/length,z:(-nx*sin+nz*cos)/length},substrate:'rock',elementId:rock.id};
    }
    return support;
  }
  function heightAt(x,z){return supportAt(x,z).height;}
  function supportNormal(x,z){return supportAt(x,z).normal;}
  function heightForCamera(x,z){
    coordinates(x,z);if(Math.hypot(x,z)<=40)return heightAt(x,z);
    let height=floorSurface(x,z).height;
    for(const rock of nearbyRocks(x,z))if(Number.isFinite(oceanRockHeight(rock,x,z)))height=Math.max(height,rock.y+rock.scale.y);
    return height;
  }
  return Object.freeze({seed,supportVersion:1,surfaceY:KELP_SURFACE_Y,sample,chunk,floorVertex,floorSurface,supportAt,supportNormal,heightAt,heightForCamera,
    authoredAnchors:KELP_ANCHORS,cacheStats:()=>({chunks:cache.size,maxChunks:KELP_OCEAN_CACHE_LIMIT,
      vertices:vertexCache.size,maxVertices:KELP_OCEAN_VERTEX_CACHE_LIMIT,neighborhoods:neighborCache.size,maxNeighborhoods:KELP_OCEAN_CACHE_LIMIT}),
    clearCache:()=>{cache.clear();vertexCache.clear();neighborCache.clear();}});
}

/** Version 1 is the frozen old support used to validate saved records before a
 * support-only migration. Version 2 keeps every old scenery identity/owner and
 * allocates the same plants, on a genuinely larger shelf/channel landscape. */
export function createKelpOceanGenerator(seed=42, options={}){
  if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('Kelp generator options must be an object.');
  if(options.forestBelt===true)return createKelpForestBeltGenerator(createKelpOceanGenerator(seed,{...options,forestBelt:false}));
  const supportVersion=options.supportVersion??KELP_OCEAN_SUPPORT_GEOMETRY_VERSION;
  if(![1,2].includes(supportVersion))throw new RangeError('Unknown kelp ocean support version.');
  const legacy=createLegacyKelpOceanGenerator(seed);
  if(supportVersion===1)return legacy;
  const seedKey=`${typeof seed}:${seed}`,cache=new Map(),vertexCache=new Map(),neighborCache=new Map();
  const randomAt=(x,z,salt)=>hash(`${seedKey}|kelp-ocean|${x}|${z}|${salt}`)/4294967296;
  const landforms=createKelpOceanLandforms({randomAt,legacySample:legacy.sample,floorSurface,legacyChunk:legacy.chunk});
  function sample(x,z){
    coordinates(x,z);const old=legacy.sample(x,z),landscape=landforms.landscapeAt(x,z,old);
    return {...old,floorY:landscape.floorY,depthM:KELP_SURFACE_Y-landscape.floorY,landscape};
  }
  function floorVertex(x,z){
    coordinates(x,z);const id=`${x},${z}`,cached=vertexCache.get(id);if(cached!==undefined)return cached;
    const value=Math.fround(sample(x,z).floorY);vertexCache.set(id,value);
    if(vertexCache.size>KELP_OCEAN_VERTEX_CACHE_LIMIT)vertexCache.delete(vertexCache.keys().next().value);
    return value;
  }
  function floorSurface(x,z){
    coordinates(x,z);const spacing=64/KELP_OCEAN_TERRAIN_SEGMENTS;
    const ix=Math.floor(x/spacing)*spacing,iz=Math.floor(z/spacing)*spacing,tx=(x-ix)/spacing,tz=(z-iz)/spacing;
    const a=floorVertex(ix,iz),b=floorVertex(ix+spacing,iz),c=floorVertex(ix,iz+spacing),d=floorVertex(ix+spacing,iz+spacing);
    const first=tx+tz<=1,dx=(first?b-a:d-c)/spacing,dz=(first?c-a:d-b)/spacing,length=Math.hypot(dx,1,dz);
    return {height:first?a+(b-a)*tx+(c-a)*tz:d+(c-d)*(1-tx)+(b-d)*(1-tz),
      normal:{x:-dx/length,y:1/length,z:-dz/length},substrate:'sediment',elementId:null};
  }
  function chunk(cx,cz){
    if(!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz))throw new RangeError('Kelp chunk coordinates must be safe integers.');
    const id=`${cx},${cz}`;
    if(cache.has(id)){const value=cache.get(id);cache.delete(id);cache.set(id,value);return value;}
    const old=legacy.chunk(cx,cz),rocks=new Map();
    for(const element of old.elements)if(element.kind==='rock'){
      let y=floorSurface(element.x,element.z).height-.08;
      const unitBase={...element,y:0};
      for(const plant of old.elements)if(plant.kind==='kelp'&&plant.hostId===element.id){
        const cap=oceanRockHeight(unitBase,plant.x,plant.z);
        // A broad slope must not cut through an old holdfast on the uphill
        // side. Preserve the host and use its actual cap triangle clearance.
        y=Math.max(y,floorSurface(plant.x,plant.z).height+.035-cap);
      }
      rocks.set(element.id,freezeElement({...element,y}));
    }
    const retained=old.elements.map(element=>{
      if(element.kind==='rock')return rocks.get(element.id);
      const host=rocks.get(element.hostId),y=oceanRockHeight(host,element.x,element.z);
      if(!Number.isFinite(y))throw new Error('Retained kelp host lost its real support.');
      const lengthM=element.lengthM*(KELP_SURFACE_Y-y)/(KELP_SURFACE_Y-element.y);
      const anchor={...element.anchor,y,lengthM};
      return freezeElement({...element,y,lengthM,anchor});
    });
    const formations=landforms.forChunk(cx,cz),origin=old.origin;
    let minDepthM=Infinity,maxDepthM=-Infinity,reliefMin=Infinity,reliefMax=-Infinity,shelfWeight=0,channelWeight=0;
    for(let iz=0;iz<8;iz++)for(let ix=0;ix<8;ix++){
      const state=sample(origin.x+(ix+.5)*8,origin.z+(iz+.5)*8);
      minDepthM=Math.min(minDepthM,state.depthM);maxDepthM=Math.max(maxDepthM,state.depthM);
      reliefMin=Math.min(reliefMin,state.landscape.reliefM);reliefMax=Math.max(reliefMax,state.landscape.reliefM);
      shelfWeight+=state.landscape.shelfWeight;channelWeight+=state.landscape.channelWeight;
    }
    const composition=Object.freeze({...old.composition,minDepthM,maxDepthM});
    const groups=Object.freeze([...new Set(formations.map(element=>element.groupId))].map(groupId=>Object.freeze({
      id:groupId,strikeRotation:formations.find(element=>element.groupId===groupId).rotation,
      channelWidth:formations.find(element=>element.groupId===groupId).channelWidth})));
    const landformSummary=Object.freeze({version:2,groups,reliefMinM:reliefMin,reliefMaxM:reliefMax,
      shelfWeight:shelfWeight/64,channelWeight:channelWeight/64});
    const value=Object.freeze({...old,elements:Object.freeze([...retained,...formations]),
      counts:Object.freeze({...old.counts,formation:formations.length}),composition,habitatComposition:composition,landformSummary});
    cache.set(id,value);while(cache.size>KELP_OCEAN_CACHE_LIMIT)cache.delete(cache.keys().next().value);
    return value;
  }
  function nearbyRocks(x,z){
    const cx=Math.floor(x/64),cz=Math.floor(z/64),id=`${cx},${cz}`;let neighbors=neighborCache.get(id);
    if(!neighbors){neighbors=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)
      for(const element of chunk(cx+dx,cz+dz).elements)if(['rock','formation'].includes(element.kind))neighbors.push(element);
      neighborCache.set(id,neighbors);if(neighborCache.size>KELP_OCEAN_CACHE_LIMIT)neighborCache.delete(neighborCache.keys().next().value);
    }
    return neighbors.filter(element=>Math.abs(x-element.x)<Math.max(element.scale.x,element.scale.z)*.6&&
      Math.abs(z-element.z)<Math.max(element.scale.x,element.scale.z)*.6);
  }
  function supportAt(x,z){
    if(Math.hypot(x,z)<=40)return legacy.supportAt(x,z);
    let support=floorSurface(x,z);
    for(const rock of nearbyRocks(x,z)){
      const height=oceanRockHeight(rock,x,z);if(!Number.isFinite(height)||height<=support.height)continue;
      const cos=Math.cos(rock.rotation),sin=Math.sin(rock.rotation),wx=x-rock.x,wz=z-rock.z;
      const face=oceanRockSurface(rock.profile,(wx*cos-wz*sin)/rock.scale.x,(wx*sin+wz*cos)/rock.scale.z);if(!face)continue;
      const nx=face.normal.x/rock.scale.x,ny=face.normal.y/rock.scale.y,nz=face.normal.z/rock.scale.z,length=Math.hypot(nx,ny,nz);
      support={height,normal:{x:(nx*cos+nz*sin)/length,y:ny/length,z:(-nx*sin+nz*cos)/length},substrate:'rock',elementId:rock.id};
    }
    return support;
  }
  function heightAt(x,z){return supportAt(x,z).height;}
  function supportNormal(x,z){return supportAt(x,z).normal;}
  function heightForCamera(x,z){
    coordinates(x,z);if(Math.hypot(x,z)<=40)return legacy.heightForCamera(x,z);
    let height=floorSurface(x,z).height;
    for(const rock of nearbyRocks(x,z))if(Number.isFinite(oceanRockHeight(rock,x,z)))height=Math.max(height,rock.y+rock.scale.y);
    return height;
  }
  function landscapeAt(x,z){coordinates(x,z);return landforms.landscapeAt(x,z);}
  return Object.freeze({seed,supportVersion:2,surfaceY:KELP_SURFACE_Y,sample,chunk,floorVertex,floorSurface,supportAt,supportNormal,
    heightAt,heightForCamera,landscapeAt,authoredAnchors:KELP_ANCHORS,
    cacheStats:()=>({chunks:cache.size,maxChunks:KELP_OCEAN_CACHE_LIMIT,vertices:vertexCache.size,maxVertices:KELP_OCEAN_VERTEX_CACHE_LIMIT,
      neighborhoods:neighborCache.size,maxNeighborhoods:KELP_OCEAN_CACHE_LIMIT,legacyChunks:legacy.cacheStats().chunks,
      maxLegacyChunks:KELP_OCEAN_CACHE_LIMIT,...landforms.cacheStats()}),
    clearCache:()=>{cache.clear();vertexCache.clear();neighborCache.clear();legacy.clearCache();landforms.clearCache();}});
}
