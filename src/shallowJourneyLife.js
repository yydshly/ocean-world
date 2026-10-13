// Authored, deterministic observation behaviour for the four-minute route.
// These bounded movements use the existing population and shared bed support;
// they are not a food-stock, predation or collision-avoidance simulation.
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const mod = (n, d) => ((n % d) + d) % d;
const smooth = n => { const t = clamp(n, 0, 1); return t*t*t*(t*(t*6-15)+10); };

const SCHOOL_LAYOUT = [
  {species:'blue-and-gold-fusilier',x:-34.7,z:-4.1,visit:20,lift:3.1,habitat:'reef'},
  {species:'unidentified-reef-fish',x:-21.5,z:3.8,visit:64,lift:3.0,habitat:'reef'},
  {species:'doubleline-fusilier',x:-5.4,z:-3.8,visit:104,lift:3.4,habitat:'sand'},
  {species:'giant-trevally',x:43.5,z:3.8,visit:224,lift:3.6,habitat:'grass'},
];

// A complete bounded cycle with quiet holds at both ends. Position and speed
// are continuous at every boundary, including replay/seek and cycle wrap.
function stopAndTravel(time, phase, dwell, travel) {
  const half = dwell + travel, local = mod(time + phase, half*2);
  const side = local >= half ? 1 : 0, t = local - side*half;
  const moving = t >= dwell;
  const progress = moving ? smooth((t-dwell)/travel) : 0;
  const angle = Math.PI * (side+progress);
  const settling = moving ? 0 : smooth(t/.9)*smooth((dwell-t)/.9);
  return {angle,moving,settling};
}

function clearSand(model, x, z, radius) {
  for (let ring=0;ring<=2;ring++) {
    const count=ring?12:1, r=radius*ring/2;
    for(let i=0;i<count;i++){
      const a=i*TAU/count,px=x+r*Math.cos(a),pz=z+r*Math.sin(a);
      if(model.surface(px,pz,true)>model.floor(px,pz)+.025)return false;
    }
  }
  return true;
}

function curvePoint(course, progress) {
  const points=course.points,n=points.length,span=course.closed?n:n-1;
  const scaled=(course.closed?mod(progress,1):clamp(progress,0,1))*span;
  const segment=Math.min(Math.floor(scaled),span-1),u=scaled-segment;
  const at=i=>course.closed?points[mod(i,n)]:i<0?
    {x:2*points[0].x-points[1].x,z:2*points[0].z-points[1].z}:i>=n?
      {x:2*points[n-1].x-points[n-2].x,z:2*points[n-1].z-points[n-2].z}:points[i];
  const p0=at(segment-1),p1=at(segment),p2=at(segment+1),p3=at(segment+2),out={};
  for(const axis of ['x','z']){
    const a=2*p1[axis],b=p2[axis]-p0[axis],c=2*p0[axis]-5*p1[axis]+4*p2[axis]-p3[axis],d=3*p1[axis]-p0[axis]-3*p2[axis]+p3[axis];
    out[axis]=.5*(a+u*(b+u*(c+u*d)));
    out[axis==='x'?'dx':'dz']=.5*(b+u*(2*c+3*u*d));
  }
  out.heading=Math.atan2(out.dz,out.dx);
  return out;
}

function authoredCourse(source) {
  if(!Array.isArray(source?.points)||source.points.length<2)return null;
  const points=source.points.map(p=>({x:p.x,z:p.z}));
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)))return null;
  const course={id:source.id,points,closed:source.closed===true};
  let length=0,previous=curvePoint(course,0);
  for(let i=1;i<=128;i++){const p=curvePoint(course,i/128);length+=Math.hypot(p.x-previous.x,p.z-previous.z);previous=p;}
  return length>.1?{...course,length}:null;
}

// An open authored passage becomes an out-and-back route with broad round
// ends. Both legs follow the actual opening; the return stays to its other side.
function passageCircuit(source) {
  const authored=authoredCourse(source);if(!authored||authored.closed)return authored;
  const points=[],width=source.returnOffsetM??1.15;
  const edge=(u,side)=>{const p=curvePoint(authored,u),h=p.heading;
    return {x:p.x-Math.sin(h)*width*side,z:p.z+Math.cos(h)*width*side};};
  for(let i=0;i<=4;i++)points.push(edge(i/4,1));
  const end=curvePoint(authored,1),start=curvePoint(authored,0);
  points.push({x:end.x+Math.cos(end.heading)*width,z:end.z+Math.sin(end.heading)*width});
  for(let i=4;i>=0;i--)points.push(edge(i/4,-1));
  points.push({x:start.x-Math.cos(start.heading)*width,z:start.z-Math.sin(start.heading)*width});
  return authoredCourse({...source,points,closed:true});
}

function passagePeriod(course, radius) {
  // Bound the speed of the outermost member through bends, not just the
  // school centre. The finite lookup is setup-only and evaluation stays pure.
  let maxSweep=0,previous=curvePoint(course,0);
  for(let i=1;i<=512;i++){
    const p=curvePoint(course,i/512),turn=Math.atan2(Math.sin(p.heading-previous.heading),Math.cos(p.heading-previous.heading));
    maxSweep=Math.max(maxSweep,(Math.hypot(p.x-previous.x,p.z-previous.z)+Math.abs(turn)*radius)*512);previous=p;
  }
  return Math.max(100,Math.ceil(maxSweep/.56));
}

function shuttle(course,time,phase,dwell,travel) {
  const half=dwell+travel,local=mod(time+phase,half*2),side=local>=half?1:0,elapsed=local-side*half;
  const moving=elapsed>=dwell,progress=moving?smooth((elapsed-dwell)/travel):0;
  const p=curvePoint(course,side?1-progress:progress);
  // While holding, turn in place before departing along the same edge. Slot
  // offsets keep the forward edge tangent, so the formation never flips.
  const turn=moving?side*Math.PI:Math.PI*(1-side)+Math.PI*smooth(elapsed/dwell);
  return {...p,moving,side,settling:moving?0:smooth(elapsed/.9)*smooth((dwell-elapsed)/.9),poseHeading:p.heading+turn};
}

/** Call after the original sample and its prepared living cover are complete. */
export function initializeJourneyLife(model, options={livingCommunities:true}) {
  if(options.livingCommunities!==true)return null;
  if(model.journeyLife)return model.journeyLife;
  const members=id=>model.agents.filter(a=>a.speciesId===id);
  const footprints=[];
  for(const group of SCHOOL_LAYOUT){
    for(const [i,a]of members(group.species).entries()){
      const dx=a.home.x-a.schoolCenter.x,dz=a.home.z-a.schoolCenter.z;
      a.home={x:group.x+dx,z:group.z+dz};a.schoolCenter={x:group.x,z:group.z};
      a.journeyLife={kind:'school',habitat:group.habitat,anchor:{x:group.x,z:group.z},
        // Preserve the same members and visit-side alignment while giving the
        // school a water-column volume instead of a single near-bed ribbon.
        forward:dx*.52,side:dz*.42,index:i,phase:.8-group.visit*.08,
        waterLayer:.85*Math.sin(i*1.61803398875),
        lift:group.lift,rx:2.2,rz:1.3};
    }
  }

  // Whole-body soft-bed sites are selected once, with the same surface query
  // used at runtime. Never send a sand-probing animal onto a coral platform.
  const goatfish=members('reef-goatfish');
  const radius=Math.max(.95,...goatfish.map(a=>a.sizeM*.70+.68));
  const candidates=[];
  for(let z=-2.8;z<=4.1;z+=1.1)for(let x=8.9;x<=18.81;x+=1.1)
    if(clearSand(model,x,z,radius))candidates.push({x,z});
  candidates.sort((a,b)=>Math.hypot(a.x-12,a.z-.3)-Math.hypot(b.x-12,b.z-.3));
  for(const [i,a]of goatfish.entries()){
    const site=candidates.find(p=>!footprints.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<radius+q.r+.04));
    if(!site)continue; // Keep the already supported legacy path if no room fits.
    a.home={...site};
    a.journeyLife={kind:'sand-probe',habitat:'sand',anchor:{...site},phase:i*3.7,rx:.64,rz:.18,lift:.018};
    footprints.push({id:a.id,x:site.x,z:site.z,r:radius,habitat:'sand'});
  }

  const grassGroups=[{x:25.3,z:4.7},{x:28.5,z:5.6},{x:31.8,z:5.6}];
  for(const [i,a]of members('white-spotted-rabbitfish').entries()){
    const group=grassGroups[Math.floor(i/6)%grassGroups.length],slot=i%6;
    const anchor={x:group.x+(slot%3-1)*.62,z:group.z+(Math.floor(slot/3)-.5)*.48};
    a.home={...anchor};a.schoolCenter={...group};
    a.journeyLife={kind:'grass-edge',habitat:'grass',anchor,phase:Math.floor(i/6)*4.2+slot*.37,rx:.74,rz:.21,lift:.64};
  }

  // Keep the exact reserved reef patrol footprints. Pausing at their ends is
  // habitat-linked station holding, not an invented parasite-removal event.
  for(const a of model.agents){
    if(a.journeyLife||!a.reefPatrol||a.mode==='fixed'||a.mode==='crawl')continue;
    a.journeyLife={kind:'reef-hold',habitat:'reef',anchor:{...a.home},phase:a.phase*2,
      rx:a.reefPatrol.x,rz:a.reefPatrol.z,lift:a.lift,vertical:a.reefPatrol.vertical??0};
  }
  const kinds={};for(const a of model.agents)if(a.journeyLife)kinds[a.journeyLife.kind]=(kinds[a.journeyLife.kind]??0)+1;
  model.journeyLife={version:'three-living-communities-water-column-v2',animalCount:model.agents.length,
    participants:Object.values(kinds).reduce((a,b)=>a+b,0),kinds,footprints,
    limits:'Authored school coordination, sand probing and habitat pauses; no resource consumption or full agent avoidance.'};
  return model.journeyLife;
}

/** Link the observation behaviours only after the authored habitat exists. */
export function configureJourneyHabitatLife(model) {
  const summary=model.journeyLife,anchors=model.journeyHabitat?.lifeAnchors;
  if(!summary||!anchors)return null;
  if(summary.habitatLinked)return summary;
  const linked={schools:0,sandProbers:0,grassEdgeResidents:0},anchorIds=new Set();
  for(const source of anchors.reefPassages??[]){
    const agents=model.agents.filter(a=>a.speciesId===source.speciesId&&a.journeyLife?.kind==='school');
    const course=passageCircuit(source);if(!agents.length||!course)continue;
    const extent=Math.max(...agents.map(a=>Math.hypot(a.journeyLife.forward,a.journeyLife.side)));
    course.period=passagePeriod(course,extent);course.visit=source.visitSec??SCHOOL_LAYOUT.find(g=>g.species===source.speciesId)?.visit??0;
    course.visitProgress=source.visitProgress??.16;
    for(const a of agents){a.journeyLife.course=course;a.journeyLife.habitatAnchor=source.id;linked.schools++;}
    anchorIds.add(source.id);
  }
  for(const a of model.agents.filter(a=>a.journeyLife?.kind==='sand-probe')){
    const source=(anchors.softBeds??[]).find(s=>s.id===a.id||s.animalId===a.id);
    if(!source||!Number.isFinite(source.radius)||!clearSand(model,source.x,source.z,source.radius))continue;
    const allowance=source.radius-a.sizeM*.70,reach=Math.min(.60,allowance-.025);
    if(reach<=.12)continue;
    const nearbyRubble=model.rubble.reduce((best,r)=>!best||Math.hypot(r.x-source.x,r.z-source.z)<Math.hypot(best.x-source.x,best.z-source.z)?r:best,null);
    const heading=nearbyRubble?Math.atan2(source.z-nearbyRubble.z,source.x-nearbyRubble.x):Math.PI/2;
    const direction={x:Math.cos(heading),z:Math.sin(heading)};
    a.journeyLife.course=authoredCourse({id:source.id,points:[
      {x:source.x-direction.x*reach,z:source.z-direction.z*reach},
      {x:source.x+direction.x*reach*.55,z:source.z+direction.z*reach*.55}]});
    a.home={x:source.x,z:source.z};a.journeyLife.anchor={...a.home};
    a.journeyLife.habitatAnchor=source.id;linked.sandProbers++;anchorIds.add(source.id);
  }
  const grassCourses=(anchors.grassEdges??[]).map(authoredCourse).filter(Boolean);
  for(const [i,a]of model.agents.filter(a=>a.journeyLife?.kind==='grass-edge').entries()){
    const course=grassCourses[Math.floor(i/6)%grassCourses.length];if(!course)continue;
    const slot=i%6,life=a.journeyLife;
    life.course=course;life.edgeForward=(slot%3-1)*.42;life.edgeSide=(Math.floor(slot/3)-.5)*.40;
    life.travelSec=Math.max(20,course.length*4.5);life.habitatAnchor=course.id;
    const centre=curvePoint(course,.5);life.anchor={x:centre.x,z:centre.z};a.home={...life.anchor};a.schoolCenter={...life.anchor};
    linked.grassEdgeResidents++;anchorIds.add(course.id);
  }
  summary.version='three-connected-habitats-v3';summary.habitatLinked={...linked,anchorIds:[...anchorIds]};
  summary.limits='Authored passage traversal, verified soft-bed probing and grass-edge station holding; no resource consumption or full agent avoidance.';
  return summary;
}

/** Pure horizontal/pose evaluation; the caller still queries real body support. */
export function evaluateJourneyLife(agent,time,base={}) {
  const life=agent.journeyLife;if(!life)return base;
  const t=Number.isFinite(time)?time:0;
  if(life.course&&life.kind==='school'){
    const course=life.course,u=(t-course.visit)/course.period+course.visitProgress,p=curvePoint(course,u);
    const hx=Math.cos(p.heading),hz=Math.sin(p.heading),spread=.82+.18*Math.abs(Math.sin(t*.055));
    const forward=life.forward*spread,side=life.side*(.9+.16*Math.sin(t*.15));
    return {...base,x:p.x+forward*hx-side*hz+.045*Math.sin(t*.6+agent.phase),
      z:p.z+forward*hz+side*hx+.035*Math.sin(t*.5+agent.phase*1.4),
      lift:life.lift,vertical:life.waterLayer+.13*Math.sin(life.index*2.39996)+.035*Math.sin(t*.25+agent.phase),
      pitch:0,pitchClearance:0,state:'swimming',activity:mod(u,1)<.5?'school-passage':'school-return',probeStrength:0};
  }
  if(life.course&&(life.kind==='sand-probe'||life.kind==='grass-edge')){
    const sand=life.kind==='sand-probe',p=shuttle(life.course,t,life.phase,sand?7:4,sand?9:life.travelSec);
    const probe=sand&&p.side===1?p.settling*(.68+.32*Math.sin(t*2.4+life.phase)**2):0,pitch=-.14*probe;
    const forward=life.edgeForward??0,side=life.edgeSide??0,hx=Math.cos(p.heading),hz=Math.sin(p.heading);
    return {...base,x:p.x+forward*hx-side*hz,z:p.z+forward*hz+side*hx,
      lift:life.lift+(sand?.18:.10)*(1-(sand?probe:p.settling)),vertical:0,
      heading:p.poseHeading,pitch,pitchClearance:Math.abs(Math.sin(pitch))*agent.sizeM*.55,
      state:p.moving?'swimming':probe>0?'foraging':'resting',
      activity:p.moving?(sand?'sand-transit':'grass-edge-swim'):sand?(p.side?'sand-probe':'sand-assess'):'grass-edge-hold',probeStrength:probe};
  }
  if(life.kind==='school'){
    const angle=t*.08+life.phase,co=Math.cos(angle),si=Math.sin(angle);
    const vx=-life.rx*si,vz=life.rz*co,heading=Math.atan2(vz,vx),hx=Math.cos(heading),hz=Math.sin(heading);
    // Turns tighten the group; straight travel opens it again. Individual
    // drift stays bounded and every original animal is always present.
    const spread=.64+.36*Math.abs(si),forward=life.forward*spread;
    const side=life.side*(.9+.16*Math.sin(t*.15));
    return {...base,x:life.anchor.x+life.rx*co+forward*hx-side*hz+.045*Math.sin(t*.6+agent.phase),
      z:life.anchor.z+life.rz*si+forward*hz+side*hx+.035*Math.sin(t*.5+agent.phase*1.4),
      lift:life.lift,vertical:life.waterLayer+.13*Math.sin(life.index*2.39996)+.035*Math.sin(t*.25+agent.phase),
      pitch:0,pitchClearance:0,state:'swimming',activity:Math.abs(si)<.5?'school-turn':'school-spread',probeStrength:0};
  }
  const sand=life.kind==='sand-probe',grass=life.kind==='grass-edge';
  const cycle=stopAndTravel(t,life.phase,sand?7:grass?4:3,sand?9:grass?11:10);
  const co=Math.cos(cycle.angle),si=Math.sin(cycle.angle);
  const heading=Math.atan2(life.rz*co,-life.rx*si);
  const probe=sand?cycle.settling*(.68+.32*Math.sin(t*2.4+life.phase)**2):0;
  const pitch=-.14*probe;
  return {...base,x:life.anchor.x+life.rx*co,z:life.anchor.z+life.rz*si,
    lift:life.lift+(sand?.18:grass?.10:0)*(1-cycle.settling),
    vertical:sand||grass?0:(life.vertical??0)*si*si,
    heading:cycle.moving?undefined:heading,pitch,
    // Tilting lowers the snout: add the conservative full-length vertical
    // projection above the existing body bottom before applying this pose.
    pitchClearance:Math.abs(Math.sin(pitch))*agent.sizeM*.55,
    state:cycle.moving?'swimming':sand?'foraging':'resting',
    activity:cycle.moving?(sand?'sand-transit':grass?'grass-edge-swim':'reef-patrol'):
      sand?'sand-probe':grass?'grass-edge-hold':'reef-hold',probeStrength:probe};
}

export function journeyLifeSummary(model,time) {
  if(!model.journeyLife)return null;
  const activities={};for(const a of model.agents){if(!a.journeyLife)continue;
    const activity=evaluateJourneyLife(a,time).activity;activities[activity]=(activities[activity]??0)+1;}
  return {version:model.journeyLife.version,participants:model.journeyLife.participants,
    kinds:{...model.journeyLife.kinds},activities};
}
