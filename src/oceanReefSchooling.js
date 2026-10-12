// A finite owner-local shoal of real saved fish. The roster includes deaths;
// steering reads one pre-step snapshot and never adds fish or changes food.
export const REEF_SCHOOLING_VERSION = 18;
export const REEF_SCHOOLING_IDS = Object.freeze(['doubleline-fusilier', 'bluestripe-snapper']);
export const REEF_SCHOOLING_MODEL = Object.freeze({ minimumMembers: 3, maximumMembers: 5,
  maximumSchoolsPerOwner: 1, maximumBirthAnchors: 8, neighbourSiteSpacingM: .7, birthNeighbourhoodM: 2.5, travelAmplitudeM: .75, periodSec: 40,
  cohesionGain: .25, separationGain: .25, neighbourRadiusM: .65,
  scope: 'small real same-owner reef-edge cohorts, saved roster and local clock; illustrative coordination, no natural large schools, cross-owner migration or recruitment' });
const M = REEF_SCHOOLING_MODEL, axes = ['x', 'y', 'z'], gap = (a,b) => Math.hypot(...axes.map(k=>a[k]-b[k]));
const point = p => p && axes.every(k=>Number.isFinite(p[k]));
// Extra deterministic water positions are candidates, never automatic births.
// Only grouping species use them; the original habitat ranking stays intact.
export function reefSchoolSpeciesSites(sites, speciesId, heading) {
  if (!REEF_SCHOOLING_IDS.includes(speciesId)) return sites;
  let anchors = 0;
  const c = Math.cos(heading), s = Math.sin(heading), spacing = M.neighbourSiteSpacingM;
  return sites.flatMap(site => {
    if (site.hostId === null || site.layer === 'bed' || anchors >= M.maximumBirthAnchors) return [site];
    anchors++;
    return [site, ...[[0, 1], [1, -1], [-1, -1], [0, -2]].map(([forward, side], i) => ({
      ...site, siteId: `${site.siteId}:cohort:${i}`, x: site.x + (forward * c - side * s) * spacing,
      z: site.z + (forward * s + side * c) * spacing
    }))];
  });
}
export function prepareReefSchoolFrames(region) {
  const frames = new Map();
  if (![REEF_SCHOOLING_VERSION, 19, 20].includes(region?.reefResidentsVersion)) return frames;
  for (const school of region.reefResidents?.schools ?? []) {
    const members = region.agents.filter(a=>a.alive&&a.groupId===school.id&&school.memberIds.includes(a.id))
      .map(a=>({ id:a.id, position:{...a.position} })).sort((a,b)=>a.id.localeCompare(b.id));
    if (!members.length) continue;
    const centroid=Object.fromEntries(axes.map(k=>[k,members.reduce((n,a)=>n+a.position[k],0)/members.length]));
    const home=Object.fromEntries(axes.map(k=>[k,members.reduce((n,a)=>n+region.agents.find(b=>b.id===a.id).home[k],0)/members.length]));
    frames.set(school.id,{ members,centroid,home });
  }
  return frames;
}
export function reefSchoolTarget(region,agent,frames) {
  const school=region.reefResidents?.schools?.find(s=>s.id===agent.groupId),frame=frames?.get(agent.groupId);
  if (!school||!frame||!frame.members.some(a=>a.id===agent.id)) return null;
  const phase=region.timeSec*Math.PI*2/M.periodSec, c=Math.cos(school.heading),s=Math.sin(school.heading),
    localX=Math.sin(phase)*M.travelAmplitudeM,localZ=(Math.cos(phase)-1)*M.travelAmplitudeM*.4,
    shift={x:localX*c-localZ*s,y:0,z:localX*s+localZ*c},
    target=Object.fromEntries(axes.map(k=>[k,agent.home[k]+shift[k]+(frame.centroid[k]-frame.home[k]-shift[k])*M.cohesionGain]));
  const own=frame.members.find(a=>a.id===agent.id);
  for(const other of frame.members){if(other.id===agent.id)continue;const d=gap(own.position,other.position);
    if(d>1e-8&&d<M.neighbourRadiusM)for(const k of axes)target[k]+=(own.position[k]-other.position[k])/d*(1-d/M.neighbourRadiusM)*M.separationGain;}
  return point(target)?target:null;
}
export function validateReefSchools(region) {
  if(![REEF_SCHOOLING_VERSION, 19, 20].includes(region.reefResidentsVersion))return true;
  const schools=region.reefResidents?.schools,agents=region.agents.filter(a=>region.reefResidents.addedIds.includes(a.id)),
    births=region.reefResidents.birthPlacements;
  if(!Array.isArray(schools)||schools.length>M.maximumSchoolsPerOwner)return false;
  const ids=new Set();
  for(const school of schools){
    if(!school||Object.keys(school).length!==5||!['id','speciesId','memberIds','center','heading'].every(k=>Object.hasOwn(school,k))||
      !REEF_SCHOOLING_IDS.includes(school.speciesId)||!Array.isArray(school.memberIds)||school.memberIds.length<M.minimumMembers||school.memberIds.length>M.maximumMembers||
      new Set(school.memberIds).size!==school.memberIds.length||school.id!==`reef-school:${region.id}:${school.speciesId}:${school.memberIds[0]}`||
      !point(school.center)||!Number.isFinite(school.heading))return false;
    const selected=school.memberIds.map(id=>agents.find(a=>a.id===id)),placements=school.memberIds.map(id=>births.find(b=>b.id===id));
    if(selected.some(a=>!a||a.speciesId!==school.speciesId||a.groupId!==school.id)||placements.some(p=>!p||p.heading!==school.heading))return false;
    for(const a of selected){if(ids.has(a.id))return false;ids.add(a.id);}
    if(placements.some(p=>gap(p.position,placements[0].position)>M.birthNeighbourhoodM+1e-8))return false;
    if(axes.some(k=>Math.abs(school.center[k]-placements.reduce((n,b)=>n+b.position[k],0)/placements.length)>1e-10))return false;
  }
  if(agents.some(a=>a.groupId!==null&&!ids.has(a.id)))return false;
  const types=new Map();for(const a of agents){if(!types.has(a.speciesId))types.set(a.speciesId,[]);types.get(a.speciesId).push(a);}
  return [...types.values()].every(rows=>rows.length===1||schools.some(s=>rows.every(a=>a.groupId===s.id)&&rows.length===s.memberIds.length));
}
