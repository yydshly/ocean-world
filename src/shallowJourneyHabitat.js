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

// Retain the sample's closure-backed exact triangle query. Updating its bins
// also updates the surface used by the original animal and camera functions.
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

export function journeyMeadowChannel(x){return 5.1+1.0*Math.sin((x-20)*.20);}
export function journeyMeadowCover(x,z){
  // Overlapping lobes describe a single tapering meadow, with long fingers
  // toward the sand basin instead of one straight rectangular leading edge.
  const lobes=[[28.3,10.2,8.8,5.8],[37.5,11.0,10.0,6.2],[44,11.9,6.5,5.7],[23.3,7.6,5.9,3.2]];
  let cover=-Infinity;
  for(const [cx,cz,rx,rz]of lobes)cover=Math.max(cover,(1-Math.hypot((x-cx)/rx,(z-cz)/rz))*3.0);
  cover+=.10*Math.sin(x*.67+z*.83)+.07*Math.sin(x*1.03-z*.49);
  const channel=x>23&&x<46?clamp((Math.abs(z-journeyMeadowChannel(x))-.72)/1.15,0,1):1;
  return clamp(cover,0,1)*channel;
}

function seeded(seed){let n=(seed^0x731e4a)>>>0;return()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,n|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const pose=rock=>({x:rock.x,y:rock.y,z:rock.z,rotation:rock.rotation});
function transformPoint(point,before,after){
  const d=after.rotation-before.rotation,co=Math.cos(d),si=Math.sin(d),x=point.x-before.x,z=point.z-before.z;
  point.x=after.x+x*co+z*si;point.z=after.z-x*si+z*co;
  if(Number.isFinite(point.y))point.y+=after.y-before.y;
  if(Number.isFinite(point.rotation))point.rotation+=d;
}
function groundFormation(model,rock){
  const p=oceanRockMesh(rock.profile).positions,co=Math.cos(rock.rotation),si=Math.sin(rock.rotation);let minY=Infinity,lowest=Infinity;
  for(let i=1;i<p.length;i+=3)minY=Math.min(minY,p[i]);
  for(let i=0;i<p.length;i+=3)if(p[i+1]<=Math.max(0,minY+.002)){
    const x=rock.x+p[i]*rock.scale.x*co+p[i+2]*rock.scale.z*si,z=rock.z-p[i]*rock.scale.x*si+p[i+2]*rock.scale.z*co;
    lowest=Math.min(lowest,model.floor(x,z));
  }
  if(Number.isFinite(lowest))rock.y=lowest-.065;
}
function residentFootprint(model,a){
  const saved=model.slopeHabitats?.footprints.find(p=>p.agentId===a.id)??model.primaryHabitatSites?.find(p=>p.agentId===a.id);
  return saved?.r??(a.clearance?.radius??a.sizeM*.85)+(a.mode==='crawl'?a.radius:0);
}
function disk(x,z,r,step=.15){
  const rows=[{x,z}];
  for(let ring=1;ring<=Math.max(2,Math.ceil(r/step));ring++){
    const rr=r*ring/Math.max(2,Math.ceil(r/step)),count=Math.max(12,Math.ceil(TAU*rr/step));
    for(let n=0;n<count;n++)rows.push({x:x+rr*Math.cos(n*TAU/count),z:z+rr*Math.sin(n*TAU/count)});
  }return rows;
}

function composeReefOpenings(model){
  // Existing complete assets overlap into banks and recede around the basin.
  // Occupied modules use translations, preserving their exact local patrols.
  const plans=[
    ['sample-live-slope-near-0',-34.0,7.0,-.57,'reef-entry-spur'],
    ['sample-live-slope-near-1',-26.5,10.4,.45,'reef-back-wall'],
    ['sample-live-slope-near-2',-18.2,8.6,null,'inhabited-reef-shoulder'],
    ['sample-live-slope-near-5',4.7,8.8,.60,'reef-sand-gateway'],
    ['sample-live-slope-tail-0',27.0,14.9,-.48,'sand-meadow-shoulder'],
    ['sample-live-slope-tail-1',42,14,null,'inhabited-meadow-rim'],
    ['sample-live-slope-tail-4',15.5,12.4,.32,'sand-basin-back-wall'],
    ['sample-live-slope-tail-5',8.5,14.5,-.63,'sand-basin-reef-return'],
    ...[[-35,12.2],[-31,13.1],[-26,14.6],[-22,14.0],[-18,14.8],[-13,14.0],[-8,13.8],[-3,13.2]].map(([x,z],i)=>[`sample-rock-${8+i}`,x,z,.31+i*.61,'reef-upper-rim']),
    ...[[30,18.2],[34,18.5],[38,21.7],[42,24.8],[47,24],[50,21.5],[54,17.5],[57,14.3]].map(([x,z],i)=>[`sample-rock-${48+i}`,x,z,.51+i*.67,'meadow-enclosing-rim']),
    ['sample-rock-32',8.7,-6.8,.48,'sand-south-toe'],
    ['sample-rock-37',15.5,-6.6,-.38,'sand-south-shoulder'],
    ['sample-rock-41',22.3,-5.8,.53,'sand-meadow-south-toe'],
  ].map(([id,x,z,rotation,role])=>({id,x,z,rotation,role}));
  const moved=[],declined=[];
  for(const plan of plans){
    const rock=model.rocks.find(r=>r.id===plan.id);if(!rock)continue;
    const occupants=model.agents.filter(a=>a.host===rock.id),colonies=[...model.corals,...(model.attachedReef??[])].filter(c=>c.host===rock.id);
    const before=pose(rock),after={...before,x:plan.x,z:plan.z,rotation:plan.rotation??before.rotation};
    Object.assign(rock,after);groundFormation(model,rock);after.y=rock.y;
    // Protect every original resident disk and rooted colony while testing the
    // entire candidate formation. A rejected candidate leaves no partial move.
    let blocked=false;
    for(const a of model.agents.filter(a=>(a.mode==='fixed'||a.mode==='crawl')&&a.host!==rock.id)){
      if(Math.hypot(a.home.x-rock.x,a.home.z-rock.z)>Math.hypot(rock.scale.x,rock.scale.z)+residentFootprint(model,a))continue;
      for(const p of disk(a.home.x,a.home.z,residentFootprint(model,a))){
        const other=model.rocks.reduce((y,r)=>r===rock?y:Math.max(y,oceanRockHeight(r,p.x,p.z)??y),model.floor(p.x,p.z));
        if((oceanRockHeight(rock,p.x,p.z)??-Infinity)>other+.002){blocked=true;break;}
      }if(blocked)break;
    }
    for(const c of [...model.corals,...(model.attachedReef??[])])if(c.host!==rock.id&&(oceanRockHeight(rock,c.x,c.z)??-Infinity)>c.y+.008){blocked=true;break;}
    for(const a of occupants.filter(a=>a.mode==='fixed'||a.mode==='crawl')){
      const h={...a.home};transformPoint(h,before,after);
      for(const p of disk(h.x,h.z,residentFootprint(model,a),.045)){
        const y=oceanRockHeight(rock,p.x,p.z);
        if(y===null||y<model.floor(p.x,p.z)+.035||model.rocks.some(r=>r!==rock&&(oceanRockHeight(r,p.x,p.z)??-Infinity)>y+.01)){blocked=true;break;}
      }if(blocked)break;
    }
    for(const c of colonies){const p={...c};transformPoint(p,before,after);
      if(model.rocks.some(r=>r!==rock&&(oceanRockHeight(r,p.x,p.z)??-Infinity)>p.y+.008))blocked=true;
    }
    for(const f of model.journeyLife?.footprints??[])for(const p of disk(f.x,f.z,f.r,.30))if((oceanRockHeight(rock,p.x,p.z)??-Infinity)>model.floor(p.x,p.z)+.002)blocked=true;
    // The route center stays open. The meadow turns north only after x19.
    for(let x=-42;x<=46;x+=.5){const z=x<11?0:x<25?(x-11)*.43:x<30?6+(x-25)*.4:8-(x-30)*.18;
      for(const dz of [-.85,0,.85])if((oceanRockHeight(rock,x,z+dz)??-Infinity)>model.floor(x,z+dz)+.40)blocked=true;
    }
    if(blocked){Object.assign(rock,before);declined.push(plan.id);continue;}
    for(const c of colonies)transformPoint(c,before,after);
    for(const a of occupants){
      transformPoint(a.home,before,after);if(a.schoolCenter)transformPoint(a.schoolCenter,before,after);
      if(a.journeyLife?.anchor)transformPoint(a.journeyLife.anchor,before,after);
      if(Number.isFinite(a.reefPatrol?.supportCeiling))a.reefPatrol.supportCeiling+=after.y-before.y;
      delete a.fixedSamplePosition;
    }
    for(const bench of rock.habitatBenches??[])transformPoint(bench,before,after);
    for(const rows of [model.slopeHabitats?.footprints,model.primaryHabitatSites])for(const row of rows??[])if(row.host===rock.id)transformPoint(row,before,after);
    moved.push({id:rock.id,role:plan.role,before,after,distance:Math.hypot(after.x-before.x,after.z-before.z),occupants:occupants.map(a=>a.id),colonies:colonies.length});
    rebuildJourneySurface(model);
  }
  rebuildJourneySurface(model);return{moved,declined};
}

function observationGeometry(model,grass){
  const point=(x,z)=>({x,z,y:model.surface(x,z)});
  const loops=[
    {id:'reef-entry',speciesId:'blue-and-gold-fusilier',visitSec:20,closed:true,points:[[-37,-2.2],[-34,-3.0],[-30.5,-1.5],[-29.5,.6],[-33,1.6],[-36.8,.8]]},
    {id:'reef-resident-opening',speciesId:'unidentified-reef-fish',visitSec:64,closed:true,points:[[-26,-.3],[-23,-1.5],[-19,-.7],[-17.5,1.5],[-21,2.0],[-24.5,1.4]]},
    {id:'reef-sand-gateway',speciesId:'doubleline-fusilier',visitSec:104,closed:true,points:[[-8,-1.3],[-5,-3.0],[-1,-2.8],[2,-.5],[-1,1.5],[-5,1.1]]},
  ].map(row=>({...row,points:row.points.map(([x,z])=>point(x,z))}));
  const grassEdges=[];
  for(const [id,from,to]of [['meadow-entry',23,28],['meadow-mid',30,36],['meadow-outer',38,44]]){
    const points=[];
    for(let x=from;x<=to;x+=1){
      const near=grass.filter(g=>g.journeyHabitat==='continuous-meadow'&&Math.abs(g.x-x)<.85&&g.z>journeyMeadowChannel(x));
      if(!near.length)continue;const g=near.reduce((a,b)=>a.z<b.z?a:b),z=g.z-.7;
      if(model.surface(x,z)-model.floor(x,z)<.002)points.push({...point(x,z),grassDistance:Math.hypot(x-g.x,z-g.z)});
    }
    if(points.length>=3)grassEdges.push({id,points});
  }
  return {reefPassages:loops,softBeds:(model.journeyLife?.footprints??[]).map(f=>({id:f.id,x:f.x,z:f.z,radius:f.r})),grassEdges};
}

// Stage04 changes whole habitat composition only in the four-minute entrance.
// Existing animal identities, complete formation meshes and bed triangles stay.
export function composeJourneyHabitats(model){
  if(model.journeyHabitat)return model.journeyHabitat;
  const started=performance.now(),before={grass:model.grass.length,rubble:model.rubble.length,rocks:model.rocks.length};
  const reefs=composeReefOpenings(model),rng=seeded(model.seed),grassGeometry=shallowMeadowRibbonGeometry(),rubbleGeometry=shallowReefRubbleGeometry();
  const residents=model.agents.filter(a=>a.mode==='fixed'||a.mode==='crawl'),footprints=model.journeyLife?.footprints??[];
  const clearResident=(x,z,r)=>residents.every(a=>Math.hypot(x-a.home.x,z-a.home.z)>r+residentFootprint(model,a)+.12)
    &&footprints.every(a=>Math.hypot(x-a.x,z-a.z)>r+a.r+.12);
  const grass=[],rubble=[];let meadowAdded=0,edgeAdded=0;
  try{
    for(const g of model.grass){
      if(g.x>=18&&g.x<=51&&g.z>=1&&g.z<=20)continue;
      if(sampleGrassFitsSoftBed(model,grassGeometry,g))grass.push(g);
    }
    const colours=['#8a9e70','#84976c','#778e63'];
    for(let row=0;row<23;row++)for(let col=0;col<45;col++){
      const x=18.5+col*.70+(row%2)*.35+(rng()-.5)*.20,z=2.2+row*.68+(rng()-.5)*.18;
      const cover=journeyMeadowCover(x,z);if(cover<.09||rng()>Math.min(1,cover*1.70))continue;
      const width=.71+cover*.50+rng()*.13,height=.16+cover*.32+rng()*.06;
      if(!clearResident(x,z,width*.52)||model.surface(x,z)>model.floor(x,z)+.002)continue;
      const g={x,y:model.floor(x,z),z,width,height,rotation:.2+Math.sin(x*.27+z*.13)*.32+(rng()-.5)*.5,color:colours[Math.floor(rng()*colours.length)],journeyHabitat:'continuous-meadow',cover,zone:cover>.65?'core':'fringe'};
      if(sampleGrassFitsSoftBed(model,grassGeometry,g)){grass.push(g);meadowAdded++;}
    }
    for(const r of model.rubble){if(r.x>=1&&r.x<=32&&r.z>=-8&&r.z<=16)continue;
      const fitted={...r};if(fitSampleRubbleOnSoftBed(model,rubbleGeometry,fitted))rubble.push(fitted);
    }
    // Three nested carbonate bands thin and shrink toward the bare sand. The
    // benthic probing disks and the passage itself remain true soft substrate.
    for(let side=0;side<2;side++)for(let band=0;band<3;band++)for(let n=0;n<90;n++){
      const x=1.5+n*.33+(rng()-.5)*.20,edge=side===0?-4.65+.8*Math.sin(x*.23):7.25+1.0*Math.sin(x*.16);
      const z=edge+(side===0?-1:1)*band*.65+(rng()-.5)*.58,width=.12+band*.045+rng()*.16;
      if(rng()>.38+band*.19||!clearResident(x,z,width*.65)||grass.some(g=>Math.hypot(g.x-x,g.z-z)<g.width*.46+width*.52))continue;
      const r={x,y:model.floor(x,z),z,width,depth:width*(.78+rng()*.27),height:.035+band*.013+rng()*.037,rotation:rng()*TAU,journeyHabitat:'graded-sand-edge',edgeBand:band};
      if(fitSampleRubbleOnSoftBed(model,rubbleGeometry,r)){rubble.push(r);edgeAdded++;}
    }
    model.grass.splice(0,model.grass.length,...grass);model.rubble.splice(0,model.rubble.length,...rubble);
    const batches=rows=>new Set(rows.map(r=>`${Math.floor(r.x/16)},${Math.floor(r.z/16)}`)).size;
    const lifeAnchors=observationGeometry(model,grass);
    model.journeyHabitat={revision:'three-complete-habitats-v2',before,after:{grass:grass.length,rubble:rubble.length,rocks:model.rocks.length},reefs,lifeAnchors,
      communities:[{id:'reef-valley',bounds:{minX:-43,maxX:5,minZ:-13,maxZ:16}},{id:'sand-basin',bounds:{minX:5,maxX:24,minZ:-5,maxZ:8}},{id:'meadow',bounds:{minX:20,maxX:48,minZ:3,maxZ:18}}],
      transitions:[{id:'reef-to-sand',from:'reef-valley',to:'sand-basin',points:lifeAnchors.reefPassages[2].points},{id:'sand-to-meadow',from:'sand-basin',to:'meadow',points:lifeAnchors.grassEdges[0]?.points??[]}],
      observationAnchors:lifeAnchors.reefPassages.map(row=>({id:row.id,...row.points[2]})).concat(lifeAnchors.grassEdges.map(row=>({id:row.id,...row.points[Math.floor(row.points.length/2)]}))),
      meadow:{bounds:{minX:18,maxX:51,minZ:2.2,maxZ:18},clumps:meadowAdded,channelWidthM:1.44,grassBatches:batches(grass),coreClumps:grass.filter(g=>g.zone==='core').length,fringeClumps:grass.filter(g=>g.zone==='fringe').length},
      sand:{edgeFragments:edgeAdded,openLane:{minX:7,maxX:19,minZ:-1.5,maxZ:4.8}},
      assets:'existing-licensed-reef-formations-and-project-authored-grass-rubble',constructionMs:performance.now()-started};
    return model.journeyHabitat;
  }finally{grassGeometry.dispose();rubbleGeometry.dispose();}
}
