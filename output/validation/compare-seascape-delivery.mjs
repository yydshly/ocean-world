import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {createLivingShallowsGenerator} from '../../src/livingShallowsGeneration.js';
import {livingShallowsSeed} from '../../src/livingShallows.js';
const here=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(here,'../..');
const stages=['legacyAfter','connected','crossed','away','revisit','refreshed'];
if(process.argv.length!==8)throw new Error('Pass six actual metadata names: legacyAfter connected crossed away revisit refreshed.');
const files={legacyBefore:'reef-1791216095264-metadata-2026-10-05T16-01-35-365Z-cca01bda.json',
  ...Object.fromEntries(stages.map((name,i)=>[name,process.argv[i+2]]))};
const captures=Object.fromEntries(Object.entries(files).map(([name,file])=>[name,JSON.parse(fs.readFileSync(path.join(here,'telemetry',file),'utf8'))]));
const snaps=Object.fromEntries(Object.entries(captures).map(([name,value])=>[name,value.snapshot]));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const exact=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const rows=value=>[...value].sort((a,b)=>a.id.localeCompare(b.id));
const distance=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const target=s=>[s.camera.target[0]+s.ocean.renderOrigin.x,s.camera.target[1],s.camera.target[2]+s.ocean.renderOrigin.z];
const compare=(a,b)=>({animalsExact:exact(rows(a.agents),rows(b.agents)),regionsExact:exact(rows(a.ocean.ecology.regions),rows(b.ocean.ecology.regions)),
  environmentExact:exact(a.environment,b.environment),clockExact:a.worldClockSec===b.worldClockSec,
  discoveriesExact:exact(a.ocean.discoveries.records,b.ocean.discoveries.records),elementsExact:exact(a.ocean.streaming.elementCounts,b.ocean.streaming.elementCounts),
  cameraWithin1eMinus10Metres:distance(a.ocean.worldPosition,b.ocean.worldPosition)<=1e-10,
  targetWithin1eMinus10Metres:distance(target(a),target(b))<=1e-10,viewportExact:exact(a.viewport,b.viewport)});
const preservation={legacy:compare(snaps.legacyBefore,snaps.legacyAfter),legacyAfterExploration:compare(snaps.legacyBefore,snaps.away),
  revisit:compare(snaps.crossed,snaps.revisit),refresh:compare(snaps.crossed,snaps.refreshed)};
const plans=s=>s.ocean.ecology.regions.filter(r=>r.livingRidgePlan?.version===4).map(r=>({id:r.id,plan:r.livingRidgePlan}));
const connectedPlans=plans(snaps.connected),crossedPlans=plans(snaps.crossed);
const base=createLivingShallowsGenerator(livingShallowsSeed(String(snaps.connected.inputSeed)));
const seams=[];
for(const {plan:a} of connectedPlans)for(const {plan:b} of connectedPlans){
  const vertical=b.cx===a.cx+1&&b.cz===a.cz,horizontal=b.cz===a.cz+1&&b.cx===a.cx;
  if(!vertical&&!horizontal||a.group.cx!==b.group.cx||a.group.cz!==b.group.cz)continue;
  let exactSeam=true,maxDeltaM=0,longestSpanM=0,run=0;
  for(let i=0;i<65;i++){
    const ya=a.floorPatch.heights[vertical?i*65+64:64*65+i],yb=b.floorPatch.heights[vertical?i*65:i];
    const x=vertical?b.cx*64:a.cx*64+i,z=vertical?a.cz*64+i:b.cz*64;
    exactSeam&&=ya===yb;const d=Math.abs(ya-base.floorVertex(x,z));maxDeltaM=Math.max(maxDeltaM,d);
    run=d>=1?run+1:0;longestSpanM=Math.max(longestSpanM,Math.max(0,run-1));
  }
  seams.push({owners:[a.id,b.id],direction:vertical?'east-west':'north-south',exactSeam,maxDeltaM,longestSpanM});
}
const sharedIds=snaps.connected.ocean.ecology.regions.filter(r=>snaps.crossed.ocean.ecology.regions.some(q=>q.id===r.id)).map(r=>r.id);
const commonAgents=s=>rows(s.agents.filter(a=>sharedIds.includes(a.regionId)));
const commonRegions=s=>rows(s.ocean.ecology.regions.filter(r=>sharedIds.includes(r.id)));
const observation=JSON.parse(fs.readFileSync(path.join(here,'seascape-notes-observation.json'),'utf8'));
const route=observation.normalRoute;
const checks={actualConnectedPlans:connectedPlans.length>=2,actualCrossedPlans:crossedPlans.length>=2,
  sharedSeamsExact:seams.length>0&&seams.every(s=>s.exactSeam),actualNonzeroCrossOwnerRelief:seams.some(s=>s.longestSpanM>=12),
  commonRegionAnimalsExact:exact(commonAgents(snaps.connected),commonAgents(snaps.crossed)),
  commonCompleteRegionsExact:exact(commonRegions(snaps.connected),commonRegions(snaps.crossed)),
  allCrossedOwnersUnloaded:snaps.crossed.ocean.streaming.loadedChunks.every(id=>!snaps.away.ocean.streaming.loadedChunks.includes(id)),
  ready:Object.values(snaps).every(s=>s.ocean.ecology.metrics.activeRegions===9&&s.ocean.ecology.metrics.loadingRegions===0&&s.ocean.streaming.activeChunks===9),
  bounded:Object.values(snaps).every(s=>s.ocean.streaming.ridgeReadyOwners<=25&&s.ocean.streaming.drawCalls<=s.ocean.streaming.maxDrawCalls&&s.ocean.ecology.regions.every(r=>r.individuals<=20)),
  clean:Object.values(snaps).every(s=>!s.errors.length&&!s.ocean.ecology.metrics.persistenceErrors),paused:Object.values(snaps).every(s=>s.paused),
  originalNotesExact:observation.originalEightExact,revisitedNotesExact:observation.revisitTenExact,refreshedNotesExact:observation.refreshTenExact,
  normalRouteCrossedNonzeroSeam:exact(route.start,snaps.connected.ocean.worldPosition)&&route.arrival.travelling===false&&route.arrival.loading===0&&route.arrival.errors.length===0&&
    route.start[2]<route.sharedBoundaryZ&&route.arrival.position[2]>route.sharedBoundaryZ&&route.start[0]===route.arrival.position[0]&&
    route.start[0]>=route.nonzeroSpanX[0]&&route.start[0]<=route.nonzeroSpanX[1]&&route.arrival.position[2]-route.start[2]===64};
const booleans=value=>typeof value==='boolean'?[value]:Object.values(value).flatMap(booleans);
const passed=booleans({preservation,checks}).every(Boolean);
for(const [stage,file] of [['connected','seascape-first-view.png'],['refreshed','seascape-crossed-view.png']])
  fs.copyFileSync(path.resolve(project,captures[stage].image),path.join(here,file));
const summary=s=>({individuals:s.agents.length,alive:s.agents.filter(a=>a.alive).length,
  owners:s.ocean.ecology.regions.map(r=>({id:r.id,version:r.livingRidgePlan?.version??0,theme:r.livingRidgePlan?.theme??'original'})),
  plans:plans(s).map(({id,plan:p})=>({id,group:p.group,floorMetrics:{deltaMinM:p.floorPatch.deltaMinM,deltaMaxM:p.floorPatch.deltaMaxM,maxSlope:p.floorPatch.maxSlope},
    habitat:p.habitatComposition})),counts:s.ocean.streaming.elementCounts});
const report={schema:'connected-seascape-delivery-v1',date:'2026-10-06',passed,
  scope:'fresh four-owner 128m committed seabeds share interior seams; actual birth and habitat source; visited supports and ecological history retained',
  files:Object.fromEntries(Object.entries(files).map(([name,file])=>[name,{metadata:`telemetry/${file}`,image:captures[name].image}])),
  preservation,checks,seams,domObservation:{file:'seascape-notes-observation.json',source:observation.source,originalPointCount:observation.originalPointCount,
    finalPointCount:observation.finalPointCount,normalRoute:route},samples:{first:summary(snaps.connected),crossed:summary(snaps.crossed)},
  validation:{scope:'19 distinct related checks; no full-suite claim',cases:19,groups:[
    {scope:'shared group floor, seam, supports and replay',cases:4,log:'living-seascape-pure-final.log'},
    {scope:'real renderer and atomic source publication',cases:3,log:'living-seascape-render-final.log'},
    {scope:'actual births, once-only stocks, failure, legacy and restore',cases:4,log:'living-seascape-ecology-initial.tap'},
    {scope:'production opt-in and existing world integration',cases:8,log:'seascape-world-checks.log'}],
    buildAttempts:1,buildPassed:true,buildLog:'seascape-build.log',
    captureFormat:'compact lossless JSON after one full-frame capture exceeded the unchanged 2MiB development telemetry quota'},
  limits:['128m groups with original outer support bands, not unlimited single geological surface or measured bathymetry',
    'native rooted/attached hosts retained, relative ecosystem proxies retained, no new species or decorative animal population',
    'no terrain-coupled fluid or sediment solver; unloaded regions freeze',
    'documentary visual realism and ordinary-distance small-life readability remain open']};
fs.writeFileSync(path.join(here,'seascape-delivery.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed,preservation,checks,firstIndividuals:snaps.connected.agents.length,crossedIndividuals:snaps.crossed.agents.length},null,2));
if(!passed)process.exitCode=1;
