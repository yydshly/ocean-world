// Authored, deterministic observation behaviour for the four-minute route.
// These bounded movements use the existing population and shared bed support;
// they are not a food-stock, predation or collision-avoidance simulation.
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const mod = (n, d) => ((n % d) + d) % d;
const smooth = n => { const t = clamp(n, 0, 1); return t*t*t*(t*(t*6-15)+10); };

const SCHOOL_LAYOUT = [
  {species:'blue-and-gold-fusilier',x:-34.7,z:-4.1,visit:20,lift:1.7,habitat:'reef'},
  {species:'unidentified-reef-fish',x:-21.5,z:3.8,visit:64,lift:1.3,habitat:'reef'},
  {species:'doubleline-fusilier',x:-5.4,z:-3.8,visit:104,lift:2.0,habitat:'sand'},
  {species:'giant-trevally',x:43.5,z:3.8,visit:224,lift:2.1,habitat:'grass'},
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
        forward:dx*.47,side:dz*.14,index:i,phase:.8-group.visit*.12,
        lift:group.lift,rx:1.65,rz:.62};
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
  model.journeyLife={version:'three-living-communities-v1',animalCount:model.agents.length,
    participants:Object.values(kinds).reduce((a,b)=>a+b,0),kinds,footprints,
    limits:'Authored school coordination, sand probing and habitat pauses; no resource consumption or full agent avoidance.'};
  return model.journeyLife;
}

/** Pure horizontal/pose evaluation; the caller still queries real body support. */
export function evaluateJourneyLife(agent,time,base={}) {
  const life=agent.journeyLife;if(!life)return base;
  const t=Number.isFinite(time)?time:0;
  if(life.kind==='school'){
    const angle=t*.12+life.phase,co=Math.cos(angle),si=Math.sin(angle);
    const vx=-life.rx*si,vz=life.rz*co,heading=Math.atan2(vz,vx),hx=Math.cos(heading),hz=Math.sin(heading);
    // Turns tighten the group; straight travel opens it again. Individual
    // drift stays bounded and every original animal is always present.
    const spread=.64+.36*Math.abs(si),forward=life.forward*spread;
    const side=life.side*(.9+.16*Math.sin(t*.15));
    return {...base,x:life.anchor.x+life.rx*co+forward*hx-side*hz+.045*Math.sin(t*.6+agent.phase),
      z:life.anchor.z+life.rz*si+forward*hz+side*hx+.035*Math.sin(t*.5+agent.phase*1.4),
      lift:life.lift,vertical:.13*Math.sin(life.index*2.39996)+.035*Math.sin(t*.25+agent.phase),
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
