import { oceanRockHeight, oceanRockSurface } from './oceanRockShape.js';
import { validateDeepWholeSeascapePlan, deepWholeSeascapeRoute } from './deepWholeSeascape.js';
import { DEEP_BENTHIC_LIFE_ROUTE_STOPS } from './deepBenthicLifeRoutes.js';

export const DEEP_SEASCAPE_VERSION = 1;
export const DEEP_SEASCAPE_OWNER_LIMIT = 25;
const SIZE=128,GRID=129,OWNER=64,GUARD=16,TAU=Math.PI*2;
const models=new WeakMap(),routes=new WeakMap(),stamp=value=>JSON.stringify(value);
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function random(base,salt){let h=2166136261;for(const char of `${typeof base.seed}:${base.seed}|deep-seascape-v1|${salt}`)h=Math.imul(h^char.charCodeAt(0),16777619);
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return((h^h>>>16)>>>0)/4294967296;}
function source(generator,cx,cz){const base=generator.baseGenerator??generator;
  if(base.surfaceY!==3500||!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz)||cx%2||cz%2)throw new TypeError('Deep seascapes require even deep owner coordinates.');
  const origin={x:cx*64,z:cz*64},nearX=Math.max(origin.x,Math.min(0,origin.x+128)),nearZ=Math.max(origin.z,Math.min(0,origin.z+128));
  if(Math.hypot(nearX,nearZ)<=96)throw new RangeError('Deep seascapes retain the entire authored transition.');
  return{base,origin,chunks:[[0,0],[1,0],[0,1],[1,1]].map(([x,z])=>base.chunk(cx+x,cz+z))};}
function normal(dx,dz){const length=Math.hypot(dx,1,dz);return{x:-dx/length,y:1/length,z:-dz/length};}
function surface(vertex,x,z){const ix=Math.floor(x),iz=Math.floor(z),tx=x-ix,tz=z-iz;
  const a=vertex(ix,iz),b=vertex(ix+1,iz),c=vertex(ix,iz+1),d=vertex(ix+1,iz+1);
  return tx+tz<=1?{height:a+(b-a)*tx+(c-a)*tz,normal:normal(b-a,c-a),substrate:'mud',elementId:null}:
    {height:d+(c-d)*(1-tx)+(b-d)*(1-tz),normal:normal(d-c,d-b),substrate:'mud',elementId:null};}
function envelope(x,peak){if(x<=GUARD||x>=SIZE-GUARD)return 0;
  return Math.cos(Math.PI*.5*Math.abs(x-peak)/(x<=peak?peak-GUARD:SIZE-GUARD-peak))**2;}
function metric(heights,baseline,row=GRID,width=SIZE){let deltaSpanM=0,maxTriangleGrade=0;
  for(let i=0;i<heights.length;i++)deltaSpanM=Math.max(deltaSpanM,Math.abs(heights[i]-baseline[i]));
  for(let z=0;z<width;z++)for(let x=0;x<width;x++){const a=z*row+x,b=a+1,c=a+row,d=c+1;
    maxTriangleGrade=Math.max(maxTriangleGrade,Math.hypot(heights[b]-heights[a],heights[c]-heights[a]),Math.hypot(heights[d]-heights[c],heights[d]-heights[b]));}
  return{deltaSpanM,maxTriangleGrade};}
function amplitude(baseline,unit){let limit=2;const permitted=.11999**2;
  for(let z=0;z<SIZE;z++)for(let x=0;x<SIZE;x++){const a=z*GRID+x,b=a+1,c=a+GRID,d=c+1;
    for(const[i,j,k]of[[a,b,c],[d,c,b]]){const bx=baseline[j]-baseline[i],bz=baseline[k]-baseline[i],ux=unit[j]-unit[i],uz=unit[k]-unit[i];
      const bb=bx*bx+bz*bz,uu=ux*ux+uz*uz,dot=bx*ux+bz*uz;if(bb>permitted)return 0;
      if(uu>1e-16)limit=Math.min(limit,(-dot+Math.sqrt(dot*dot+uu*(permitted-bb)))/uu);}}
  return Math.max(0,limit);}
function protection(base,cx,cz,plain){const bins=new Map(),all=[];
  for(let z=-1;z<=2;z++)for(let x=-1;x<=2;x++)for(const e of base.chunk(cx+x,cz+z).elements){
    const radius=Math.hypot(e.scale.x,e.scale.z)*.5+1.5,reach=radius+12,p={x:e.x,z:e.z,radius};all.push(e);
    for(let iz=Math.floor((e.z-reach)/16);iz<=Math.floor((e.z+reach)/16);iz++)for(let ix=Math.floor((e.x-reach)/16);ix<=Math.floor((e.x+reach)/16);ix++){
      const key=`${ix},${iz}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(p);}}
  return{all,mask(x,z){const dx=Math.max(plain.origin.x-x,0,x-plain.origin.x-64),dz=Math.max(plain.origin.z-z,0,z-plain.origin.z-64);
    let result=smooth(Math.hypot(dx,dz)/16);
    for(const p of bins.get(`${Math.floor(x/16)},${Math.floor(z/16)}`)??[])result=Math.min(result,smooth((Math.hypot(x-p.x,z-p.z)-p.radius)/12));return result;}};}
function longestSeam(heights,baseline,origin){let best=null;
  for(const axis of['x','z']){let start=null;for(let t=GUARD;t<=SIZE-GUARD+1;t++){
    const i=axis==='x'?t*GRID+64:64*GRID+t,changed=t<=SIZE-GUARD&&heights[i]-baseline[i]>=.25;
    if(changed&&start===null)start=t;if(!changed&&start!==null){const lengthM=t-start;
      if(!best||lengthM>best.lengthM)best={axis,startM:start,endM:t-1,lengthM,center:axis==='x'?{x:origin.x+64,z:origin.z+(start+t-1)*.5}:{x:origin.x+(start+t-1)*.5,z:origin.z+64}};start=null;}}}
  return best;}
function widerRocks(base,chunk,cx,cz,vertex,natives){const plants=[],candidates=[];
  for(let z=16;z<=48;z+=8)for(let x=16;x<=48;x+=8){const salt=`${cx},${cz}:${x},${z}`;
    candidates.push({x:chunk.origin.x+x+(random(base,`x:${salt}`)-.5)*2,z:chunk.origin.z+z+(random(base,`z:${salt}`)-.5)*2,salt});}
  candidates.sort((a,b)=>base.sample(b.x,b.z).rockiness-base.sample(a.x,a.z).rockiness||a.salt.localeCompare(b.salt));
  for(const p of candidates){if(plants.length>=Math.min(2,8-chunk.counts.rock))break;
    if(base.sample(p.x,p.z).rockiness<.60)continue;
    const width=8+4*random(base,`width:${p.salt}`),scale={x:width,y:1+random(base,`height:${p.salt}`)*.6,z:width*(.57+.23*random(base,`depth:${p.salt}`))};
    const radius=Math.hypot(scale.x,scale.z)*.5,rotation=random(base,`rotation:${p.salt}`)*TAU;
    if(p.x-radius<chunk.origin.x+8||p.x+radius>chunk.origin.x+56||p.z-radius<chunk.origin.z+8||p.z+radius>chunk.origin.z+56)continue;
    if([...natives,...plants].some(e=>Math.hypot(e.x-p.x,e.z-p.z)<radius+Math.hypot(e.scale.x,e.scale.z)*.5+2))continue;
    let y=Infinity;
    // A whole enclosing lattice rectangle, including adjacent triangles,
    // keeps the complete existing mesh rim beneath the real 1m bed.
    for(let z=Math.floor(p.z-radius)-1;z<=Math.ceil(p.z+radius)+1;z++)for(let x=Math.floor(p.x-radius)-1;x<=Math.ceil(p.x+radius)+1;x++)y=Math.min(y,vertex(x,z));
    const rock={id:`deep-seascape-rock:${cx},${cz}:${chunk.id}:${p.salt}`,kind:'rock',x:p.x,y:y-.015,z:p.z,scale,rotation,
      profile:random(base,`profile:${p.salt}`)<.65?'mound':'ridge',priority:base.sample(p.x,p.z).rockiness};
    if(oceanRockHeight(rock,p.x,p.z)-surface(vertex,p.x,p.z).height<.35)continue;plants.push(rock);
  }
  if(!plants.length)throw new RangeError(`Deep group ${cx},${cz} has no unoccupied supported broad rock site.`);return plants;}
function build(base,chunks,origin,cx,cz){const soft=c=>c.composition.habitats['deep-soft-bottom'],slopes=c=>c.composition.habitats['deep-slope'],hard=c=>c.composition.habitats['deep-hard-bottom'];
  const plain=[...chunks].sort((a,b)=>soft(b)-soft(a)||a.id.localeCompare(b.id))[0];
  const hardOwner=chunks.filter(c=>c!==plain&&c.counts.rock<8).sort((a,b)=>hard(b)-hard(a)||a.id.localeCompare(b.id))[0];
  const slopeOwner=chunks.filter(c=>c!==plain&&c!==hardOwner).sort((a,b)=>slopes(b)-slopes(a)||a.id.localeCompare(b.id))[0];
  if(soft(plain)<48||!hardOwner||hard(hardOwner)<12||slopes(slopeOwner)<8)throw new RangeError(`Deep group ${cx},${cz} has no native plain/slope/hard-bottom transition.`);
  const protectedSites=protection(base,cx,cz,plain),baseline=[],masks=[];
  for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++){baseline.push(base.floorVertex(origin.x+x,origin.z+z));masks.push(protectedSites.mask(origin.x+x,origin.z+z));}
  let chosen=null;
  for(const pz of[48,64,80])for(const px of[48,64,80]){const unit=baseline.map((_,i)=>masks[i]*envelope(i%GRID,px)*envelope(Math.floor(i/GRID),pz));
    const scale=amplitude(baseline,unit),heights=baseline.map((y,i)=>Math.fround(y+unit[i]*scale)),metrics=metric(heights,baseline),seam=longestSeam(heights,baseline,origin);
    if(metrics.deltaSpanM<.75||metrics.maxTriangleGrade>.12||!seam||seam.lengthM<8)continue;
    const score=metrics.deltaSpanM+seam.lengthM*.05;if(!chosen||score>chosen.score)chosen={heights,metrics,seam,score,peakLocal:{x:px,z:pz},amplitudeM:scale};}
  if(!chosen)throw new RangeError(`Deep group ${cx},${cz} cannot preserve native supports and a low continuous slope.`);
  const vertex=(x,z)=>x>=origin.x&&x<=origin.x+SIZE&&z>=origin.z&&z<=origin.z+SIZE?chosen.heights[(z-origin.z)*GRID+x-origin.x]:base.floorVertex(x,z);
  const added=widerRocks(base,hardOwner,cx,cz,vertex,protectedSites.all);
  const outcropCenter={x:added.reduce((n,e)=>n+e.x,0)/added.length,z:added.reduce((n,e)=>n+e.z,0)/added.length};
  const plainCenter={x:plain.origin.x+32,z:plain.origin.z+32};
  const group={id:`deep-seascape:${cx},${cz}`,cx,cz,ownerIds:chunks.map(c=>c.id),widthM:SIZE,gridSize:GRID,outerGuardM:GUARD,
    plainOwnerId:plain.id,slopeOwnerId:slopeOwner.id,hardOwnerId:hardOwner.id,plainCenter,outcropCenter,
    addedRockCount:added.length,...chosen.metrics,seam:chosen.seam,controls:{peakLocal:chosen.peakLocal,amplitudeM:chosen.amplitudeM,protectionRampM:12},
    plainScope:'one complete native low-slope owner retained; actual ecology uses finite support gates',originalElementsRetained:true};
  return freeze(chunks.map(chunk=>{const ox=(chunk.cx-cx)*64,oz=(chunk.cz-cz)*64,heights=[],oldHeights=[];
    for(let z=0;z<=64;z++)for(let x=0;x<=64;x++){const i=(oz+z)*GRID+ox+x;heights.push(chosen.heights[i]);oldHeights.push(baseline[i]);}
    const additions=chunk===hardOwner?added:[];return{version:1,theme:'deep-seascape',id:chunk.id,cx:chunk.cx,cz:chunk.cz,seed:base.seed,baseStamp:stamp(chunk),group,
      role:chunk===plain?'plain':chunk===hardOwner?'sparse-hard-bottom':chunk===slopeOwner?'slope':'native-sediment',
      floorPatch:{gridSize:65,spacingM:1,widthM:64,groupOuterGuardM:16,heights,...metric(heights,oldHeights,65,64)},
      addedRockIds:additions.map(e=>e.id),elements:[...chunk.elements,...additions],
      displayScope:'shared physical sediment bed and sparse solids; real native ecological births and inventories persisted separately'};}));}
function model(generator,cx,cz){const{base,chunks,origin}=source(generator,cx,cz);let cache=models.get(base);if(!cache){cache=new Map();models.set(base,cache);}
  const key=`${cx},${cz}`;if(!cache.has(key)){let entry;try{entry={plans:build(base,chunks,origin,cx,cz)};}catch(error){if(!(error instanceof RangeError))throw error;entry={declined:error.message};}
    cache.set(key,entry);if(cache.size>8)cache.delete(cache.keys().next().value);}const result=cache.get(key);if(result.declined)throw new RangeError(result.declined);return result.plans;}
export function createDeepSeascapePlans(base,evenCx,evenCz){return model(base,evenCx,evenCz);}
export function validateDeepSeascapePlan(plan,base){try{if(!plan||plan.version!==1||plan.theme!=='deep-seascape'||plan.id!==`${plan.cx},${plan.cz}`||!plan.group)return false;
  const expected=model(base,plan.group.cx,plan.group.cz).find(p=>p.id===plan.id);return!!expected&&stamp(plan)===stamp(expected);}catch{return false;}}
export function deepSeascapeRoute(baseGenerator){const base=baseGenerator.baseGenerator??baseGenerator;if(routes.has(base))return routes.get(base);
  const candidates=[];for(const z of[-14,-10,-6,-2,2,6,10,14])for(const x of[-10,-6,-2,2,6])candidates.push({x,z});
  candidates.sort((a,b)=>random(base,`route:${a.x},${a.z}`)-random(base,`route:${b.x},${b.z}`));
  for(const c of candidates){let plans;try{plans=model(base,c.x,c.z);}catch(error){if(!(error instanceof RangeError))throw error;continue;}
    const group=plans[0].group,result=freeze([{id:'deep-plain-community',label:'深海沉积平原',...group.plainCenter},{id:'deep-slope-outcrop',label:'缓坡稀疏露头',...group.outcropCenter}]);routes.set(base,result);return result;}
  const result=Object.freeze([]);routes.set(base,result);return result;}

/** Optional, transaction-published shared bed. Physical queries read the same
 * temporary/committed source as chunks, including neighbouring owner solids. */
export function createDeepSeascapeGenerator(baseGenerator){const base=baseGenerator.baseGenerator??baseGenerator;
  if(base.surfaceY!==3500)throw new TypeError('A deep source is required.');let committed=new Map(),view=committed,revision=0,temporaryDepth=0;const chunks=new Map(),neighbors=new Map();
  const inspect=input=>{if(!Array.isArray(input)||input.length>25)throw new TypeError('Deep seascape registry must contain at most 25 owners.');const next=new Map();
    for(const p of input){if(!(p?.version===2?validateDeepWholeSeascapePlan(base,p):validateDeepSeascapePlan(p,base))||next.has(p.id))throw new TypeError('Invalid or duplicate deep seascape owner.');next.set(p.id,freeze(p));}return next;};
  function vertexPlan(x,z){const cx=Math.floor(x/64),cz=Math.floor(z/64),xs=x%64===0?[cx,cx-1]:[cx],zs=z%64===0?[cz,cz-1]:[cz];
    for(const az of zs)for(const ax of xs){const p=view.get(`${ax},${az}`);if(p)return p;}return null;}
  function floorVertex(x,z){if(!Number.isFinite(x)||!Number.isFinite(z))throw new RangeError('Deep coordinates must be finite.');const p=vertexPlan(x,z);
    if(!p)return base.floorVertex(x,z);const lx=x-p.cx*64,lz=z-p.cz*64;
    if(!Number.isInteger(lx)||!Number.isInteger(lz))return Math.fround(surface(floorVertex,x,z).height);
    return p.floorPatch.heights[lz*65+lx];}
  function floorSurface(x,z){if(!Number.isFinite(x)||!Number.isFinite(z))throw new RangeError('Deep coordinates must be finite.');return view.size?surface(floorVertex,x,z):base.floorSurface(x,z);}
  function elementsNear(x,z){const cx=Math.floor(x/64),cz=Math.floor(z/64),id=`${cx},${cz}`;let all=neighbors.get(id);
    if(!all){all=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)all.push(...(view.get(`${cx+dx},${cz+dz}`)?.elements??base.chunk(cx+dx,cz+dz).elements));
      neighbors.set(id,all);if(neighbors.size>32)neighbors.delete(neighbors.keys().next().value);}
    return all.filter(e=>{const reach=Math.max(e.scale.x,e.scale.z)*.5;return Math.abs(x-e.x)<=reach&&Math.abs(z-e.z)<=reach;});}
  function affected(x,z){const cx=Math.floor(x/64),cz=Math.floor(z/64);for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++)if(view.has(`${cx+x},${cz+z}`))return true;return false;}
  function supportAt(x,z){if(!affected(x,z))return base.supportAt(x,z);let support=floorSurface(x,z);
    for(const rock of elementsNear(x,z)){const height=oceanRockHeight(rock,x,z);if(!Number.isFinite(height)||height<=support.height)continue;
      const c=Math.cos(rock.rotation),s=Math.sin(rock.rotation),wx=x-rock.x,wz=z-rock.z,face=oceanRockSurface(rock.profile,(wx*c-wz*s)/rock.scale.x,(wx*s+wz*c)/rock.scale.z);
      if(!face)continue;const nx=face.normal.x/rock.scale.x,ny=face.normal.y/rock.scale.y,nz=face.normal.z/rock.scale.z,length=Math.hypot(nx,ny,nz);
      support={height,normal:{x:(nx*c+nz*s)/length,y:ny/length,z:(-nx*s+nz*c)/length},substrate:'rock',elementId:rock.id};}return support;}
  function sample(x,z){const native=base.sample(x,z);if(!view.has(`${Math.floor(x/64)},${Math.floor(z/64)}`))return native;
    const bed=floorSurface(x,z),support=supportAt(x,z),slope=Math.hypot(bed.normal.x,bed.normal.z)/bed.normal.y;
    const organicPatchSuitability=Math.max(0,Math.min(1,native.organicPatchSuitability+(native.slope-slope)*1.5));
    return{...native,floorY:bed.height,depthM:base.surfaceY-bed.height,slope,substrate:support.substrate,
      habitat:support.substrate==='rock'?'deep-hard-bottom':slope>.038?'deep-slope':'deep-soft-bottom',organicPatchSuitability,foodPatchiness:organicPatchSuitability};}
  function heightForCamera(x,z){if(!affected(x,z))return base.heightForCamera(x,z);let height=floorSurface(x,z).height;
    for(const rock of elementsNear(x,z))if(Number.isFinite(oceanRockHeight(rock,x,z)))height=Math.max(height,rock.y+rock.scale.y);return height;}
  const facade={...base,baseGenerator:base,floorVertex,floorSurface,supportAt,sample,heightAt:(x,z)=>supportAt(x,z).height,floorNormal:(x,z)=>supportAt(x,z).normal,heightForCamera,
    get seascapeRouteStops(){return deepSeascapeRoute(base);},get seascapeRevision(){return revision;},get seascapeCandidatesActive(){return temporaryDepth>0;},
    get wholeSeascapeRouteStops(){return deepWholeSeascapeRoute(base);},
    get deepBenthicLifeRouteStops(){return DEEP_BENTHIC_LIFE_ROUTE_STOPS;},
    seascapePlan:(cx,cz)=>committed.get(`${cx},${cz}`),seascapeRegistryStats:()=>({size:committed.size,limit:25,revision,ids:[...committed.keys()]}),
    setSeascapePlans(input){if(temporaryDepth)throw new TypeError('Cannot publish inside a temporary deep birth view.');const next=inspect(input);
      if(next.size===committed.size&&[...next].every(([id,p])=>stamp(p)===stamp(committed.get(id))))return false;
      for(const[id,p]of next)if(stamp(p)===stamp(committed.get(id)))next.set(id,committed.get(id));committed=next;view=committed;chunks.clear();neighbors.clear();revision++;return true;},
    withSeascapePlans(input,fn){if(typeof fn!=='function'||fn.constructor?.name==='AsyncFunction')throw new TypeError('Deep birth views must be synchronous.');
      const next=inspect(input),old=view,oldChunks=new Map(chunks),oldNeighbors=new Map(neighbors);view=next;chunks.clear();neighbors.clear();temporaryDepth++;
      try{const result=fn(facade);if(result&&typeof result.then==='function')throw new TypeError('Deep birth view returned an asynchronous result.');return result;}
      finally{view=old;chunks.clear();neighbors.clear();for(const[id,p]of oldChunks)chunks.set(id,p);for(const[id,e]of oldNeighbors)neighbors.set(id,e);temporaryDepth--; }},
    chunk(cx,cz){const id=`${cx},${cz}`,plan=view.get(id);if(!plan)return base.chunk(cx,cz);if(!chunks.has(id)){
      const old=base.chunk(cx,cz),habitats={'deep-soft-bottom':0,'deep-slope':0,'deep-hard-bottom':0};let minDepthM=Infinity,maxDepthM=-Infinity,organicPatchSuitability=0;
      for(let z=0;z<8;z++)for(let x=0;x<8;x++){const s=sample(cx*64+4+x*8,cz*64+4+z*8);habitats[s.habitat]++;minDepthM=Math.min(minDepthM,s.depthM);maxDepthM=Math.max(maxDepthM,s.depthM);organicPatchSuitability+=s.organicPatchSuitability/64;}
      const ranked=Object.keys(habitats).sort((a,b)=>habitats[b]-habitats[a]),composition={samples:64,habitats,primary:ranked[0],secondary:habitats[ranked[1]]>=13?ranked[1]:null,minDepthM,maxDepthM,organicPatchSuitability};
      chunks.set(id,freeze({...old,elements:plan.elements,counts:{...old.counts,rock:old.counts.rock+plan.addedRockIds.length},composition,habitatComposition:composition,seascapePlan:plan}));}return chunks.get(id);},
    clearCache(){chunks.clear();neighbors.clear();base.clearCache();}};return Object.freeze(facade);}
