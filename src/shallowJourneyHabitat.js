import {oceanRockHeight,oceanRockMesh} from './oceanRockShape.js';
import {shallowMeadowRibbonGeometry} from './world/ShallowMeadowRibbonAssets.js';
import {shallowReefRubbleGeometry} from './world/ShallowLiveReefAssets.js';
import {sampleGrassFitsSoftBed,fitSampleRubbleOnSoftBed} from './shallowSampleSoftBedFit.js';

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const key=(x,z)=>`${Math.floor(x/8)},${Math.floor(z/8)}`;
function index(rows,radius){
  const bins=new Map();
  for(const row of rows){const r=radius(row);
    for(let z=Math.floor((row.z-r)/8);z<=Math.floor((row.z+r)/8);z++)for(let x=Math.floor((row.x-r)/8);x<=Math.floor((row.x+r)/8);x++){
      const k=`${x},${z}`;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(row);
    }
  }return bins;
}

// Rebuild the exact triangle-backed queries after whole formations move. The
// old prepared cover is still usable: hosted surfaces/crowns never move, and
// soft-bed placements are checked against the new hard-ground arrangement.
export function rebuildJourneySurface(model){
  if(model.rebuildSurfaceIndices){model.rebuildSurfaceIndices();return;}
  const rocks=index(model.rocks,r=>Math.hypot(r.scale.x,r.scale.z)/2);
  const corals=index([...model.corals,...(model.attachedReef??[])],c=>c.radius);
  model.surface=(x,z,vegetation=false)=>{
    let y=model.floor(x,z);
    for(const r of rocks.get(key(x,z))??[])y=Math.max(y,oceanRockHeight(r,x,z)??y);
    if(vegetation)for(const c of corals.get(key(x,z))??[])if(Math.hypot(x-c.x,z-c.z)<c.radius)y=Math.max(y,c.y+(c.clearanceHeight??c.height));
    return y;
  };
}

export function journeyMeadowChannel(x){return 5.7+Math.sin((x-23)*.22);}
export function journeyMeadowCover(x,z){
  const left=clamp((x-22)/2.5,0,1),right=clamp((47-x)/4,0,1);
  const front=4.0+.45*Math.sin(x*.29),back=13.4+1.1*Math.sin(x*.21);
  const edge=Math.min((z-front)/1.8,(back-z)/2.1);
  const channel=x>25&&x<44?clamp((Math.abs(z-journeyMeadowChannel(x))-.82)/.9,0,1):1;
  return clamp(Math.min(left,right,edge)*channel,0,1);
}

function seeded(seed){let n=(seed^0x731e4a)>>>0;return()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,n|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

function groundFormation(model,rock){
  const p=oceanRockMesh(rock.profile).positions,co=Math.cos(rock.rotation),si=Math.sin(rock.rotation);let lowest=Infinity;
  for(let i=0;i<p.length;i+=3)if(p[i+1]<0){
    const x=rock.x+p[i]*rock.scale.x*co+p[i+2]*rock.scale.z*si,z=rock.z-p[i]*rock.scale.x*si+p[i+2]*rock.scale.z*co;
    lowest=Math.min(lowest,model.floor(x,z));
  }
  if(Number.isFinite(lowest))rock.y=lowest-.06;
}

function composeReefOpenings(model){
  const protectedPoints=[];
  for(const a of model.agents.filter(a=>a.mode==='fixed'||a.mode==='crawl')){
    const radius=(a.clearance?.radius??a.sizeM*.85)+(a.mode==='crawl'?a.radius:0);
    for(let i=0;i<9;i++){const angle=i*TAU/8,r=i===8?0:radius;const x=a.home.x+Math.cos(angle)*r,z=a.home.z+Math.sin(angle)*r;
      protectedPoints.push({x,z,y:model.surface(x,z)});
    }
  }
  for(const c of model.corals)protectedPoints.push({x:c.x,z:c.z,y:model.surface(c.x,c.z)});
  const plans=[
    {id:'sample-live-slope-near-0',x:-31.7,z:6.4,rotation:-.34,role:'forward-reef-spur'},
    {id:'sample-live-slope-near-1',x:-24.0,z:11.1,rotation:.29,role:'recessed-reef-pocket'},
    {id:'sample-live-slope-near-5',x:4.8,z:10.5,rotation:.41,role:'open-sand-gateway'},
    {id:'sample-live-slope-tail-0',x:36.9,z:12.2,rotation:-.32,role:'meadow-reef-edge'},
  ];
  const moved=[],declined=[];
  for(const plan of plans){
    const rock=model.rocks.find(r=>r.id===plan.id);
    if(!rock||model.agents.some(a=>a.host===rock.id)||model.corals.some(c=>c.host===rock.id)){declined.push(plan.id);continue;}
    const before={x:rock.x,y:rock.y,z:rock.z,rotation:rock.rotation};
    Object.assign(rock,{x:plan.x,z:plan.z,rotation:plan.rotation});groundFormation(model,rock);
    const radius=Math.hypot(rock.scale.x,rock.scale.z)/2;
    const blocked=protectedPoints.some(p=>Math.abs(p.x-rock.x)<=radius&&Math.abs(p.z-rock.z)<=radius&&(oceanRockHeight(rock,p.x,p.z)??-Infinity)>p.y+.002);
    if(blocked){Object.assign(rock,before);declined.push(plan.id);continue;}
    const dx=rock.x-before.x,dz=rock.z-before.z;
    // These unused bench records remain world-space metadata for inspection;
    // the four occupied formations and all existing resident homes are intact.
    for(const bench of rock.habitatBenches??[]){
      const rx=bench.x-before.x,rz=bench.z-before.z,d=rock.rotation-before.rotation;
      bench.x=rock.x+rx*Math.cos(d)+rz*Math.sin(d);bench.z=rock.z-rx*Math.sin(d)+rz*Math.cos(d);bench.rotation=rock.rotation;
    }
    moved.push({id:rock.id,role:plan.role,before,after:{x:rock.x,y:rock.y,z:rock.z,rotation:rock.rotation},distance:Math.hypot(dx,dz)});
  }
  rebuildJourneySurface(model);return{moved,declined};
}

// Finite stage-03 composition, applied only to the four-minute entrance after
// prepared cover has been restored. Existing assets/animal identities are kept.
// This is authored habitat organisation, not new survey data or biomass.
export function composeJourneyHabitats(model){
  if(model.journeyHabitat)return model.journeyHabitat;
  const started=performance.now(),before={grass:model.grass.length,rubble:model.rubble.length,rocks:model.rocks.length};
  const reefs=composeReefOpenings(model),rng=seeded(model.seed),grassGeometry=shallowMeadowRibbonGeometry(),rubbleGeometry=shallowReefRubbleGeometry();
  const residents=model.agents.filter(a=>a.mode==='fixed'||a.mode==='crawl');
  const footprints=model.journeyLife?.footprints??[];
  const clearResident=(x,z,r)=>residents.every(a=>Math.hypot(x-a.home.x,z-a.home.z)>r+(a.clearance?.radius??a.sizeM*.85)+(a.mode==='crawl'?a.radius:0)+.12)
    &&footprints.every(a=>Math.hypot(x-a.x,z-a.z)>r+a.r+.12);
  const grass=[],rubble=[];let meadowAdded=0,edgeAdded=0;
  try{
    // Recompose one connected habitat with a sand opening, not extra scattered
    // tufts over the existing lawn. Outside this stage's meadow remains intact.
    for(const g of model.grass){
      if(g.x>=22&&g.x<=47&&g.z>=2&&g.z<=16)continue;
      if(sampleGrassFitsSoftBed(model,grassGeometry,g))grass.push(g);
    }
    const colours=['#8a9e70','#84976c','#778e63'];
    for(let row=0;row<17;row++)for(let col=0;col<36;col++){
      const x=22.8+col*.68+(row%2)*.34+(rng()-.5)*.19,z=3.5+row*.70+(rng()-.5)*.18;
      const cover=journeyMeadowCover(x,z);if(cover<.14||rng()>Math.min(1,cover*1.65))continue;
      const width=.88+cover*.28+rng()*.14,height=.22+cover*.25+rng()*.08;
      if(!clearResident(x,z,width*.52)||model.surface(x,z)>model.floor(x,z)+.002)continue;
      const g={x,y:model.floor(x,z),z,width,height,rotation:.2+Math.sin(x*.27+z*.13)*.32+(rng()-.5)*.5,color:colours[Math.floor(rng()*colours.length)],journeyHabitat:'continuous-meadow'};
      if(sampleGrassFitsSoftBed(model,grassGeometry,g)){grass.push(g);meadowAdded++;}
    }
    for(const r of model.rubble){if(r.x>=7&&r.x<=29&&r.z>=-5&&r.z<=8)continue;
      const fitted={...r};if(fitSampleRubbleOnSoftBed(model,rubbleGeometry,fitted))rubble.push(fitted);
    }
    // A sparse, graded broken-carbonate seam at the two margins. The ray and
    // goatfish corridor stays bare; fragments never imply extra living species.
    for(let side=0;side<2;side++)for(let n=0;n<96;n++){
      const x=7.5+n*.215+(rng()-.5)*.2,edge=side===0?-3.75+.55*Math.sin(x*.25):6.9+.8*Math.sin(x*.17);
      const z=edge+(rng()-.5)*1.25,width=.15+rng()*.24;
      if(rng()>.65+.2*Math.sin(x*.63)||!clearResident(x,z,width*.65)||grass.some(g=>Math.hypot(g.x-x,g.z-z)<g.width*.46+width*.52))continue;
      const r={x,y:model.floor(x,z),z,width,depth:width*(.78+rng()*.27),height:.045+rng()*.046,rotation:rng()*TAU,journeyHabitat:'graded-sand-edge'};
      if(fitSampleRubbleOnSoftBed(model,rubbleGeometry,r)){rubble.push(r);edgeAdded++;}
    }
    model.grass.splice(0,model.grass.length,...grass);model.rubble.splice(0,model.rubble.length,...rubble);
    const batches=rows=>new Set(rows.map(r=>`${Math.floor(r.x/16)},${Math.floor(r.z/16)}`)).size;
    model.journeyHabitat={revision:'three-living-communities-v1',before,after:{grass:grass.length,rubble:rubble.length,rocks:model.rocks.length},reefs,
      meadow:{bounds:{minX:22,maxX:47,minZ:3.5,maxZ:15.4},clumps:meadowAdded,channelWidthM:1.64,grassBatches:batches(grass)},
      sand:{edgeFragments:edgeAdded,openLane:{minX:7,maxX:25,minZ:-1.5,maxZ:4.8}},
      assets:'existing-licensed-reef-formations-and-project-authored-grass-rubble',constructionMs:performance.now()-started};
    return model.journeyHabitat;
  }finally{grassGeometry.dispose();rubbleGeometry.dispose();}
}
