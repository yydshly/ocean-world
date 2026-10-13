import * as THREE from 'three';
import { oceanRockHeight, SHALLOW_SAMPLE_ROCK_PROFILES } from './oceanRockShape.js';
import { shallowSampleSpeciesCatalog } from './shallowSampleSpecies.js';
import { createSampleReefLedges, arrangeSampleReefResidents } from './shallowSampleReefCommunity.js';
import { arrangeShallowLivingCover, fitShallowLivingCover } from './shallowSampleLivingCover.js';
import { arrangeSampleCommunityExpansion } from './shallowSampleCommunityExpansion.js';
import { arrangeShallowSandHabitat } from './shallowSampleSandHabitat.js';
import {arrangeShallowReefSlope} from './shallowSampleReefSlope.js';
import {arrangeSlopeAnimalSpaces} from './shallowSampleSlopeAnimals.js';
import {refitSampleSoftBedScenery} from './shallowSampleSoftBedFit.js';
import {arrangeSampleSchoolPassages} from './shallowSampleSchoolPassages.js';
import {arrangeNearReefAssets} from './world/ShallowNearCommunity.js';
import preparedCover from './world/shallowPreparedCover.js';
import {composeJourneyHabitats} from './shallowJourneyHabitat.js';
import {initializeJourneyLife,evaluateJourneyLife,configureJourneyHabitatLife} from './shallowJourneyLife.js';
import {updateShallowSchooling,sampleShallowSchooling} from './shallowSchooling.js';


export const SHALLOW_SAMPLE_SECONDS = 75;
export const SHALLOW_SAMPLE_ID = 'shallow-sample';
const TAU = Math.PI * 2;
const catalog = new Map(shallowSampleSpeciesCatalog.map(s => [s.id, s]));
const clamp = THREE.MathUtils.clamp;
const ROUTE_TIMES=[0,2,10,18,20,28,36,38,46,52,54,61,67,71,75];
const ROUTE_PROGRESS=[0,.035,.060,.215,.25,.285,.455,.49,.525,.65,.695,.75,.87,.90,1];

// Monotone cubic progress: glide slowly beside each community, with continuous
// velocity between observations. Wall-clock playback rate remains separate.
export function sampleRouteProgress(time){
  const t=clamp(time,0,75),last=ROUTE_TIMES.length-1;
  if(t===75)return 1;
  let i=0;while(i<last-1&&t>ROUTE_TIMES[i+1])i++;
  const slope=j=>(ROUTE_PROGRESS[j+1]-ROUTE_PROGRESS[j])/(ROUTE_TIMES[j+1]-ROUTE_TIMES[j]);
  const tangent=j=>j===0?slope(0):j===last?slope(last-1):2/(1/slope(j-1)+1/slope(j));
  const h=ROUTE_TIMES[i+1]-ROUTE_TIMES[i],u=(t-ROUTE_TIMES[i])/h,u2=u*u,u3=u2*u;
  return (2*u3-3*u2+1)*ROUTE_PROGRESS[i]+(u3-2*u2+u)*h*tangent(i)
    +(-2*u3+3*u2)*ROUTE_PROGRESS[i+1]+(u3-u2)*h*tangent(i+1);
}

function random(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

// A finite authored habitat sample. It does not replace or migrate the seeded
// persistent ocean. All displayed animals are distinct, metre-scaled agents.
export function createShallowSample(seed = 55, options = {}) {
  const rng = random(seed), rocks = [], corals = [], grass = [], rubble = [], agents = [];
  let rockBins=null, coralBins=null;
  const binKey=(x,z)=>`${Math.floor(x/8)},${Math.floor(z/8)}`;
  function indexRows(rows,radius){const bins=new Map();for(const row of rows){const r=radius(row);
    for(let z=Math.floor((row.z-r)/8);z<=Math.floor((row.z+r)/8);z++)for(let x=Math.floor((row.x-r)/8);x<=Math.floor((row.x+r)/8);x++){
      const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(row);}}return bins;}
  const min = -130, step = 1, cells = 280;
  const heights = new Float32Array((cells + 1) ** 2);
  const rawFloor = (x, z) => -.8 + .34 * Math.sin(x * .065 + z * .045)
    + .22 * Math.cos(z * .11 - x * .035) + .09 * Math.sin(z * 2.2 + x * .18)
    + .55 * Math.exp(-(((z + 17) / 10) ** 2)) - .32 * Math.exp(-(((z - 1) / 6) ** 2))
    + .22*Math.sin(x*.12)*Math.exp(-(((z-7)/7)**2));
  for (let row = 0; row <= cells; row++) for (let col = 0; col <= cells; col++)
    heights[row * (cells + 1) + col] = rawFloor(min + col * step, min + row * step);
  // Same two triangles as the displayed bed, including the diagonal.
  function floor(x, z) {
    const gx = clamp((x - min) / step, 0, cells - .000001), gz = clamp((z - min) / step, 0, cells - .000001);
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, i = iz * (cells + 1) + ix;
    const a = heights[i], b = heights[i + 1], c = heights[i + cells + 1], d = heights[i + cells + 2];
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }
  function surface(x, z, vegetation = false) {
    let y = floor(x, z);
    for (const rock of rockBins?.get(binKey(x,z)) ?? (rockBins?[]:rocks))
      y = Math.max(y, oceanRockHeight(rock, x, z) ?? y);
    if (vegetation) for (const coral of coralBins?.get(binKey(x,z)) ?? (coralBins?[]:corals)) if (Math.hypot(x - coral.x, z - coral.z) < coral.radius)
      y = Math.max(y, coral.y + (coral.clearanceHeight??coral.height));
    return y;
  }
  const reefs = [[-39,-9,7],[-28,10,8],[-18,-10,10],[-4,10,8],[6,-10,9],[25,-13,6],[52,13,9],[65,-10,10]];
  for (const [cx, cz, radius] of reefs) for (let n = 0; n < 8; n++) {
    const angle = n * 2.39996 + rng(), r = radius * .66 * Math.sqrt(n / 8), x = cx + Math.cos(angle) * r, z = cz + Math.sin(angle) * r;
    const scale = {x: 4 + rng() * 5.5, y: 1.0 + rng() * 2.65, z: 3.8 + rng() * 4.5};
    if (n === 0) { scale.x *= 1.3; scale.z *= 1.2; scale.y *= 1.2; }
    const rock = { id: `sample-rock-${rocks.length}`, profile: ['natural-a','natural-b','natural-c'][n % 3],
      x, z, y: floor(x,z) - .06, rotation: rng() * TAU, scale };
    rocks.push(rock);
  }
  rockBins=indexRows(rocks,r=>Math.hypot(r.scale.x,r.scale.z)/2);
  // Colonies have actual roots on the same rock triangles used by navigation.
  for (const rock of rocks) for (let n = 0; n < 8; n++) {
    const angle = rng() * TAU, radius = rng() * .21;
    const x = rock.x + Math.cos(angle) * rock.scale.x * radius, z = rock.z + Math.sin(angle) * rock.scale.z * radius;
    const y = oceanRockHeight(rock, x, z), wide = 1.05 + rng() * 1.7, height = .35 + rng() * .65;
    if (y === null || surface(x,z) > y + .01) continue;
    const form = ['branching','massive','table','massive','branching','fan'][Math.floor(rng() * 6)];
    corals.push({x,y,z,form,rotation:rng()*TAU,width:wide,height,radius:wide*.52,host:rock.id,tint:rng()});
  }
  // Patchy rooted grass on soft sediment, never on reef crowns or the channel.
  for (let i = 0; i < 1600; i++) {
    const x = 23 + rng() * 37, z = -2 + rng() * 23;
    const patch = Math.sin(x * .27) + Math.cos(z * .4) + .45 * Math.sin(x*.15+z*.3);
    if (patch < .35 || surface(x,z) > floor(x,z)+.02 || z < 3 + Math.sin(x*.13)*2) continue;
    if ([[-.55,-.55],[-.55,.55],[.55,-.55],[.55,.55]].some(([dx,dz])=>surface(x+dx,z+dz)>floor(x+dx,z+dz)+.02)) continue;
    grass.push({x,y:floor(x,z),z,width:.65+rng()*.65,height:.12+rng()*.70,rotation:rng()*TAU,
      color:['#748865','#94a179','#59765b'][Math.floor(rng()*3)]});
  }
  for (const [cx,cz,radius] of reefs) for (let i = 0; i < 45; i++) {
    const a = rng()*TAU, r = radius*(.65+rng()*.55), x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
    if (surface(x,z)>floor(x,z)+.03) continue;
    rubble.push({x,y:floor(x,z)-.015,z,width:.12+rng()*.38,height:.07+rng()*.16,rotation:rng()*TAU});
  }
  function add(speciesId, count, center, mode, radius = 3, lift = 1) {
    const species = catalog.get(speciesId);
    if (!species) throw new Error(`Unknown sample animal: ${speciesId}`);
    // Broadside passage when the route reaches each community gives readable
    // silhouettes at natural scale, without enlarging the fish for the camera.
    const visits={'blue-and-gold-fusilier':2,'unidentified-reef-fish':24,'doubleline-fusilier':39,
      'white-spotted-rabbitfish':55,'giant-trevally':64,'lyretail-anthias':18};
    const schoolPhase=mode==='school'?-(visits[speciesId]??0)*.15:rng()*TAU;
    for (let i=0;i<count;i++) {
      const phase = i*2.39996 + rng()*.5, spread = radius*Math.sqrt((i+.5)/count);
      const home = {x:center[0]+Math.cos(phase)*spread,z:center[1]+Math.sin(phase)*spread};
      const sizeM = species.lengthM * (.88 + rng()*.24);
      agents.push({id:`shallow-${speciesId}-${agents.length}`, speciesId, kind:species.kind, alive:true,sizeM,
        mode,home,phase,schoolPhase,schoolCenter:mode==='school'?{x:center[0],z:center[1]}:null,
        radius: mode==='school' ? radius : mode==='cruise' ? 3 : mode==='crawl' ? .35 : .6,
        speed: mode==='school' ? .15 : mode==='cruise' ? .09 : mode==='crawl' ? .025 : .06,
        lift, timeSec:0, state:mode==='fixed'?'fixed':mode==='crawl'?'foraging':'swimming',
        position:{x:home.x,y:floor(home.x,home.z)+lift,z:home.z},velocity:{x:0,y:0,z:0},heading:phase,
        supportNormal:{x:0,y:1,z:0}, clearance:null});
    }
  }
  add('blue-and-gold-fusilier',38,[-38,-1],'school',4,3);
  add('unidentified-reef-fish',30,[-9,0],'school',4.5,2.2);
  add('doubleline-fusilier',34,[14,-1],'school',5,3.6);
  add('white-spotted-rabbitfish',18,[36,7],'school',4,1.4);
  add('giant-trevally',16,[55,-1],'school',5,4.2);
  add('lyretail-anthias',30,[-18,-9],'school',2.5,3.7);
  add('green-turtle',1,[-39,1],'cruise',1.5,1.5);
  add('blue-tang',6,[-25,6],'cruise',2,.75);
  for (const [species,count,home] of [
    ['moorish-idol',5,[-35,-6]],['bluespine-unicornfish',3,[-40,-2]],['reef-parrotfish',3,[-41,3]],['copperband-butterflyfish',4,[-24,7]],
    ['emperor-angelfish',3,[-16,-5]],['reef-parrotfish',5,[-5,6]],
    ['sailfin-tang',4,[8,-7]],['clown-triggerfish',3,[4,4]],
    ['humphead-wrasse',1,[0,-2]],['longfin-batfish',4,[47,1]],
    ['reef-goatfish',9,[20,0]],['reef-cuttlefish',3,[32,2]],
    ['green-turtle',2,[42,3]],['blue-spotted-ray',3,[16,5]],
    ['blacktip-reef-shark',1,[63,-3]]]) add(species,count,home,'cruise',3,species==='reef-goatfish'?.45:species==='blue-spotted-ray'?.22:species==='green-turtle'?1.6:1.8);
  for (const [species,count,home,mode] of [
    ['blue-linckia-star',5,[-30,6],'crawl'],['chocolate-chip-sea-star',5,[32,5],'crawl'],
    ['sandfish-sea-cucumber',6,[19,4],'crawl'],['leopard-sea-cucumber',4,[40,4],'crawl'],
    ['spotted-reef-crab',3,[-6,8],'crawl'],['painted-spiny-lobster',2,[-22,-9],'crawl'],
    ['day-octopus',2,[-10,6],'crawl'],['tropical-urchin',5,[-36,-10],'fixed'],
    ['fluted-giant-clam',5,[-15,-12],'fixed'],['tube-sponge',4,[6,-12],'fixed'],
    ['shallow-feather-star',4,[-28,12],'fixed']]) {
    add(species,count,home,mode,2,0);
    // Hard-bottom residents take a clear crown with room for their footprint.
    if (mode==='fixed') for (const a of agents.slice(-count)) {
      const nearest=rocks.filter(r=>Math.hypot(r.x-home[0],r.z-home[1])<10);
      const host=nearest[(agents.indexOf(a)+count)%nearest.length];
      a.home={x:host.x,z:host.z}; a.host=host.id;
      // Keep colonies away from the actual attached animal footprint.
      for (let j=corals.length-1;j>=0;j--) if (Math.hypot(corals[j].x-host.x,corals[j].z-host.z)<corals[j].radius+a.sizeM*.7) corals.splice(j,1);
    }
  }
  // Appended after the original population draws: existing individual lengths
  // and ids are preserved, while this sample gets three distinct reef fish.
  add('cleaner-wrasse',4,[-10,3],'cruise',.3,1);
  add('black-blotched-porcupinefish',3,[-10,3],'cruise',.4,.8);
  add('lionfish',3,[46,4],'cruise',.4,.7);
  // Coastal representatives are appended after every original population draw.
  // Their source identity is retained; they do not replace unrelated reef fish.
  add('barramundi',3,[40,2],'cruise',.7,.65);
  add('hawksbill-turtle',1,[41,5],'cruise',1,.85);
  add('yellow-tang',8,[-23,3],'cruise',.6,.75);
  // The finite showcase replaces its two procedural late-route green turtles
  // with correctly labelled source hawksbills. Exploration records are separate.
  // Population draws already ran, so unrelated identities and sizes stay stable.
  let sourceLead=0;
  for(const a of agents)if(a.speciesId==='green-turtle'&&a.home.x>0){
    a.id=`shallow-hawksbill-lead-${sourceLead++}`;a.speciesId='hawksbill-turtle';
    a.sizeM=.92*(a.sizeM/catalog.get('green-turtle').lengthM);
  }
  const path=new THREE.CatmullRomCurve3([[-42,2.4,0],[-27,1.1,-.5],[-13,.35,1],[8,1.1,1],[27,1.3,0],[43,1.9,1],[52,2.8,0]].map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const targetPath=new THREE.CatmullRomCurve3([[-35,2,-3],[-19,1.8,1],[0,1.5,2],[21,1.3,3],[39,1.1,7],[56,2,4],[76,2.7,-3]].map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const model={seed,scannedReef:options.scannedReef===true,rocks,corals,grass,rubble,agents,bed:{min,step,cells,heights},floor,surface,path,targetPath,seconds:SHALLOW_SAMPLE_SECONDS};
  // Relocate the last two existing reef patches after the original seeded
  // draws, preserving natural animal sizes instead of changing the RNG stream.
  rocks.slice(48,56).forEach(r=>{r.z-=4.5;r.y=floor(r.x,r.z)-.06;});
  rocks.slice(56,64).forEach(r=>{r.z+=3.5;r.y=floor(r.x,r.z)-.06;});
  // Upgrade the entire finite reef skeleton after seeded population creation.
  // Identities, natural sizes, original footprints and the persistent world stay.
  for(const rock of rocks)rock.profile=SHALLOW_SAMPLE_ROCK_PROFILES[['natural-a','natural-b','natural-c'].indexOf(rock.profile)];
  // A continuous low reef foundation joins the separate bommies. This changes
  // only the authored sample, and is real supporting mesh rather than backdrop.
  for(let i=0;i<6;i++){
    const x=-43+i*22,z=-12+1.2*Math.sin(i*.9);
    rocks.push({id:`sample-reef-backbone-${i}`,profile:SHALLOW_SAMPLE_ROCK_PROFILES[i%3],x,z,
      y:floor(x,z)-.08,rotation:.07*Math.sin(i),scale:{x:28,y:2.25+.70*Math.sin(i*1.3)**2,z:12}});
  }
  // Whole-scene massing: keep the authored rock footprints but lower exposed
  // bommies/backbone so living crowns form the silhouette instead of tall
  // bare mounds. All residents and crowns are fitted to these actual surfaces.
  for(const rock of rocks)rock.scale.y*=.62;
  arrangeShallowReefSlope(model);
  arrangeNearReefAssets(model);
  rockBins=indexRows(rocks,r=>Math.hypot(r.scale.x,r.scale.z)/2);
  // Recheck roots against the actual relocated hard ground. Removed grass is
  // scenery; it does not alter the authored animal population or food stocks.
  for(let i=grass.length-1;i>=0;i--){const g=grass[i];
    if([[0,0],[-.55,-.55],[-.55,.55],[.55,-.55],[.55,.55]].some(([dx,dz])=>surface(g.x+dx,g.z+dz)>floor(g.x+dx,g.z+dz)+.02))grass.splice(i,1);
  }
  for(let i=rubble.length-1;i>=0;i--)if(surface(rubble[i].x,rubble[i].z)>floor(rubble[i].x,rubble[i].z)+.02)rubble.splice(i,1);
  // The previous candidates consumed their old seeded draws, preserving animal
  // sizes. The whole cover is now composed across exposed shoulders separately.
  for(const coral of corals){let host=rocks.find(r=>r.id===coral.host),height=oceanRockHeight(host,coral.x,coral.z);
    for(const rock of rockBins.get(binKey(coral.x,coral.z))??[]){const y=oceanRockHeight(rock,coral.x,coral.z);if(y!==null&&y>height){host=rock;height=y;}}
    coral.host=host.id;coral.y=height;
  }
  arrangeSampleCommunities(model);
  const ledges=createSampleReefLedges(model,sampleRouteProgress);rocks.push(...ledges);
  rockBins=indexRows(rocks,r=>Math.hypot(r.scale.x,r.scale.z)/2);
  arrangeSampleReefResidents(model,ledges,{prepared:options.prepareCover!==false});
  arrangeSampleCommunityExpansion(model,sampleRouteProgress);
  arrangeSlopeAnimalSpaces(model,{prepared:options.prepareCover!==false});
  // Substrate, animal spaces and living cover are composed as one habitat.
  // The final hard surfaces exist before any grass/rubble or crown is fitted.
  // The fixed showcase can ship already fitted scenery. Actual full-vertex
  // fitting runs at build time; other seeds and experimental scans still fit
  // normally. Compare input layout to prevent applying a different habitat.
  const layout={revision:'contact-fauna-reef-banks-v1',seed,rocks,agents,grass,rubble,scannedReef:model.scannedReef};
  const fingerprint=input=>{let hash=2166136261;for(let i=0;i<input.length;i++)hash=Math.imul(hash^input.charCodeAt(i),16777619);return `${input.length}:${hash>>>0}`;};
  // Node's authoring build and the browser can differ in the last bits of
  // transcendental math. Round only the cache key, never physical geometry.
  // 1e-8 m precision is far below the existing contact/round-off tolerances.
  model.coverRawInputSignature=fingerprint(JSON.stringify(layout));
  model.coverInputSignature=fingerprint(JSON.stringify(layout,(_,v)=>typeof v==='number'&&Number.isFinite(v)?Number(v.toFixed(8)):v));
  model.coverExpectedRawSignature=preparedCover?.rawSignature;
  if(options.prepareCover!==false&&preparedCover?.signature===model.coverInputSignature){
    const saved=structuredClone(preparedCover.scenery);
    for(const key of ['corals','grass','rubble'])model[key].splice(0,model[key].length,...saved[key]);
    for(const key of ['substrateSceneryRefit','livingCoverComposition','sandHabitat','scannedCoverComposition'])model[key]=saved[key];
    model.preparedCover=true;
  }else{
    refitSampleSoftBedScenery(model);
    arrangeShallowLivingCover(model);
    arrangeShallowSandHabitat(model);
    fitShallowLivingCover(model);
    model.preparedCover=false;
  }
  if(model.preparedCover&&preparedCover.scenery.attachedReef)model.attachedReef=structuredClone(preparedCover.scenery.attachedReef);
  else model.attachedReef=[]; // Whole bank assets replace the scattered fill layer.
  coralBins=indexRows([...corals,...model.attachedReef],c=>c.radius);
  if(options.livingCommunities){
    model.livingCommunities=true;
    model.rebuildSurfaceIndices=()=>{rockBins=indexRows(rocks,r=>Math.hypot(r.scale.x,r.scale.z)/2);coralBins=indexRows([...corals,...model.attachedReef],c=>c.radius);};
    initializeJourneyLife(model);
    composeJourneyHabitats(model);
    model.rebuildSurfaceIndices();
    configureJourneyHabitatLife(model);
  }
  updateShallowSample(model,0);
  return model;
}

export function setSampleAnimalEnvelope(agent, box) {
  delete agent.fixedSamplePosition;
  agent.clearance={bottom:Math.max(0,-box.min.y)*agent.sizeM,
    radius:Math.max(Math.abs(box.min.x),Math.abs(box.max.x),Math.abs(box.min.z),Math.abs(box.max.z))*agent.sizeM};
}

export function sampleAnimalPosition(model, agent, time, withSupport=true) {
  if(agent.mode==='fixed'&&agent.fixedSamplePosition)return {...agent.fixedSamplePosition};
  const a=agent, w=a.speed, t=time*w+a.phase;
  const move=a.mode==='fixed'?0:a.radius;
  let x=a.home.x+move*Math.cos(t), z=a.home.z+move*.56*Math.sin(t);
  if(a.reefPatrol){x=a.home.x+a.reefPatrol.x*Math.cos(t);z=a.home.z+a.reefPatrol.z*Math.sin(t);}
  if(a.mode==='school'){
    const groupTime=time*w+a.schoolPhase,rx=a.schoolOrbit?.x??move,rz=a.schoolOrbit?.z??move*.56;
    const ox=(a.home.x-a.schoolCenter.x)*(a.schoolFormation?.forward??.65),oz=(a.home.z-a.schoolCenter.z)*(a.schoolFormation?.side??.65);
    // Bounded independent drift around a coherent group; seeking/replay stays
    // deterministic. This is a display formation, not a full boids solver.
    const drift=(a.schoolDrift?.forward??.16)*Math.sin(time*.39+a.phase),cross=(a.schoolDrift?.side??.11)*Math.sin(time*.47+a.phase*1.9);
    x=a.schoolCenter.x+rx*Math.cos(groupTime)+ox+drift;
    z=a.schoolCenter.z+rz*Math.sin(groupTime)+oz+cross;
  }
  const behavior=a.journeyLife?evaluateJourneyLife(a,time,{x,z,lift:a.lift,vertical:a.reefPatrol?a.reefPatrol.vertical*Math.sin(t)*Math.sin(t):.12*Math.sin(t*.7)}):null;
  if(behavior){x=behavior.x;z=behavior.z;}
  if(!withSupport)return {x,z};
  const r=a.clearance?.radius ?? a.sizeM*.65;
  // Conservative whole-body clearance over bed/rock/colonies. This scene has
  // no cross-region loading; support always exists before the camera starts.
  let support=model.surface(x,z,a.mode==='school'||a.mode==='cruise');
  for (let i=0;i<8;i++) support=Math.max(support,model.surface(x+Math.cos(i*TAU/8)*r,z+Math.sin(i*TAU/8)*r,a.mode==='school'||a.mode==='cruise'));
  support=Math.max(support,a.reefPatrol?.supportCeiling??-Infinity);
  const swimming=a.mode==='school'||a.mode==='cruise';
  const vertical=a.reefPatrol?a.reefPatrol.vertical*Math.sin(t)*Math.sin(t):.12*Math.sin(t*.7);
  const position={x,z,y:support+(a.clearance?.bottom??a.sizeM*.15)+(swimming?(behavior?.lift??a.lift)+(a.schoolVertical??0)+(behavior?.vertical??vertical)+(behavior?.pitchClearance??0):.012)};
  if(behavior)position.journeyPose=behavior;
  if(a.mode==='fixed')a.fixedSamplePosition={...position};return position;
}

export function updateShallowSample(model,time) {
  if(model.schoolingSystem)updateShallowSchooling(model.schoolingSystem,time);
  for (const a of model.agents) {
    const coordinated=model.schoolingSystem&&sampleShallowSchooling(model.schoolingSystem,a);
    if(coordinated){
      a.position={...coordinated.position};a.velocity={...coordinated.velocity};
      a.heading=coordinated.heading;a.pitch=coordinated.pitch??0;
      a.state=coordinated.state;a.journeyActivity=coordinated.activity;
      a.probeStrength=0;a.timeSec=time;continue;
    }
    const dip=a.reefPatrol?.behavior==='dip',now=sampleAnimalPosition(model,a,time),next=a.mode==='fixed'?now:sampleAnimalPosition(model,a,time+.02,dip);
    // The exact current body support is still checked every update. Only the
    // horizontal tangent is needed for most display headings; vertical velocity
    // comes from actual consecutive supported positions instead of probing the
    // entire future footprint again. Dipping fish retain the forward Y probe.
    const dy=a.mode==='fixed'?0:dip?(next.y-now.y)/.02:time!==a.timeSec?(now.y-a.position.y)/(time-a.timeSec):a.velocity.y;
    a.position=now; a.velocity={x:(next.x-now.x)/.02,y:dy,z:(next.z-now.z)/.02};
    if(a.mode!=='fixed') a.heading=Math.atan2(a.velocity.z,a.velocity.x);
    a.pitch=a.reefPatrol?.behavior==='dip'?clamp(Math.atan2(a.velocity.y,Math.hypot(a.velocity.x,a.velocity.z)),-.22,.22):0;
    if(now.journeyPose){const b=now.journeyPose;a.pitch=b.pitch??a.pitch;if(Number.isFinite(b.heading))a.heading=b.heading;a.state=b.state;a.journeyActivity=b.activity;a.probeStrength=b.probeStrength??0;delete now.journeyPose;}
    a.timeSec=time;
  }
}

export function sampleShallowCamera(model,time) {
  const u=sampleRouteProgress(time), position=model.path.getPointAt(u), target=model.targetPath.getPointAt(u);
  position.y=Math.max(position.y,model.surface(position.x,position.z,true)+.9);
  for(const encounter of model.encounters){
    if(time<=encounter.start||time>=encounter.end)continue;
    const center=new THREE.Vector3();for(const a of encounter.agents){const p=a.timeSec===time?a.position:sampleAnimalPosition(model,a,time);center.add(new THREE.Vector3(p.x,p.y,p.z));}
    center.multiplyScalar(1/encounter.agents.length);
    // Frame the whole vertical community, including the lower reef patrol.
    // A taller canopy must not tilt the view up to the principal shoal alone.
    const companion=model.additionalCommunities?.find(group=>Math.abs(group.time-encounter.time)<=1);
    if(companion?.agents.length){
      const lower=new THREE.Vector3();for(const a of companion.agents){const p=a.timeSec===time?a.position:sampleAnimalPosition(model,a,time);lower.add(new THREE.Vector3(p.x,p.y,p.z));}
      lower.multiplyScalar(1/companion.agents.length);center.lerp(lower,.20);
    }
    const weight=Math.sin((time-encounter.start)/(encounter.end-encounter.start)*Math.PI)**2;
    // The observer gently turns toward actual animals, then returns forward.
    // Keep a focus outside the near plane even after the group passes sideways.
    const distance=center.distanceTo(position),direction=center.clone().sub(position).normalize();
    const nearFade=THREE.MathUtils.smoothstep(distance,2.5,3.4);
    const forwardFade=THREE.MathUtils.smoothstep(direction.dot(model.path.getTangentAt(u)),-.1,.25);
    target.lerp(center,weight*.94*nearFade*forwardFade);
  }
  return {position,target};
}

function arrangeSampleCommunities(model){
  const groups=[
    {species:'blue-and-gold-fusilier',time:6,lift:2.3,lateral:-.5,start:0,end:13,label:'近景乌尾鮗群'},
    {species:'unidentified-reef-fish',time:24,lift:1.7,lateral:.3,start:17,end:31,label:'礁边鱼群（未定种）'},
    {species:'doubleline-fusilier',time:32,lift:2.5,lateral:-3},
    {species:'white-spotted-rabbitfish',time:58,lift:1.1,lateral:3.2},
    {species:'giant-trevally',time:68,lift:2.8,lateral:1,start:63,end:75,label:'开阔水层鲹群'}];
  model.encounters=[];
  arrangeSampleSchoolPassages(model,groups,sampleRouteProgress);
  for(const g of groups){
    const members=model.agents.filter(a=>a.speciesId===g.species);
    if(g.start!==undefined)model.encounters.push({...g,agents:members});
  }
  function near(species,time,forward,lateral,lift,select=()=>true){
    const camera=model.path.getPointAt(sampleRouteProgress(time)),members=model.agents.filter(a=>a.speciesId===species&&select(a));
    members.forEach((a,i)=>{const turtle=a.kind==='turtle',angle=turtle?0:(i-(members.length-1)/2)*.38;
      a.phase=angle-time*a.speed;a.home={x:camera.x+forward+(turtle?i:Math.abs(i-(members.length-1)/2)*.5)-a.radius*Math.cos(angle),
        z:camera.z+lateral+(i-(members.length-1)/2)*(turtle?1.7:.7)-a.radius*.56*Math.sin(angle)};a.lift=lift;});
    return members;
  }
  const rays=near('blue-spotted-ray',42,3.1,1.4,.18);
  near('reef-goatfish',42,5.7,-.4,.35);
  near('reef-cuttlefish',46,4.8,2,.85);
  const turtles=near('hawksbill-turtle',58,4,1.8,.9,a=>a.id.startsWith('shallow-hawksbill-lead-'));
  near('green-turtle',13,4.8,1,1.1,a=>a.home.x<0);
  near('barramundi',58,4.1,-1.35,.75);
  near('hawksbill-turtle',58,2.9,2.3,.75,a=>!a.id.startsWith('shallow-hawksbill-lead-'));
  near('humphead-wrasse',29,4.4,1,1.2);
  near('blacktip-reef-shark',69,8,-4,2.2);
  near('blue-tang',24,4.3,2.2,.75);
  near('yellow-tang',24,3.6,1.1,.8);
  // Bottom residents belong beside the sand observation, at reachable natural
  // size; attached residents and the reef/grass support remain untouched.
  near('sandfish-sea-cucumber',42,3.2,.8,0);
  near('chocolate-chip-sea-star',47,3.3,1.3,0);
  model.encounters.push({start:34,end:49,time:42,label:'沙道里的魟鱼',agents:rays},
    {start:50,end:64,time:58,label:'草床旁的海龟',agents:turtles});
  model.encounters.sort((a,b)=>a.start-b.start);
}

export function shallowSampleChapter(time) {
  return time<17 ? {title:'礁谷 · 乌尾鮗群',detail:'靠近礁边，让成群乌尾鮗从身旁经过。'}
    : time<34 ? {title:'礁边 · 清洁鱼与礁栖动物',detail:'观察二齿鲀附近的清洁鱼，章鱼和蟹沿活礁岩脚慢移。'}
      : time<50 ? {title:'沙道 · 魟鱼、乌贼与羊鱼',detail:'沿沙道观察魟鱼，随后靠近低空游动的乌贼和寻底羊鱼。'}
        : time<64 ? {title:'草床 · 海龟与兔鱼',detail:'伴随海龟游过草床边缘，观察近处的兔鱼群。'}
          : {title:'水层 · 鲹群与礁缘蓑鲉',detail:'鲹群掠过上方，展开胸鳍的蓑鲉在下方礁缘慢游。'};
}
