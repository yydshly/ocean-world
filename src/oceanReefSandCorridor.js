// A sand bed is an actual habitat reference, not a fabricated attachment rock.
// These possibilities are admitted by the existing full-body/contact gate.
import { REEF_SLOPE_SAND_IDS } from './oceanReefSlopeSpecies.js';
export const REEF_SAND_CORRIDOR_MODEL = Object.freeze({ stationSpacingM: 10, lateralOffsetM: 3,
  maximumAnchorsPerOwner: 8, maximumSitesPerOwner: 32, maximumRouteStations: 512, ownerMarginM: 4 });
export const REEF_SAND_CORRIDOR_IDS = Object.freeze(['leopard-sea-cucumber', 'chocolate-chip-sea-star',
  'shame-faced-crab', 'wedge-sea-hare', 'peacock-flounder', 'textile-cone',
  'great-barracuda', 'bluefin-trevally', 'spotted-eagle-ray']);
const M = REEF_SAND_CORRIDOR_MODEL, point = p => p && ['x','y','z'].every(k => Number.isFinite(p[k]));
export const isReefSandCorridorAnchor = (r,a) => [10, 11, 12].includes(a?.reefResidentIndividualVersion) &&
  (REEF_SAND_CORRIDOR_IDS.includes(a.speciesId) || a.reefResidentIndividualVersion >= 11 && REEF_SLOPE_SAND_IDS.includes(a.speciesId)) && a.reefResidentHostId === null &&
  a.reefResidentSiteId?.startsWith(`sand-layer:${r.id}:`) === true;

export function createReefSandCorridorSites(region, chunk, group, generator) {
  if (chunk?.id !== region?.id || !Number.isSafeInteger(region?.cx) || !Number.isSafeInteger(region?.cz) ||
    !Array.isArray(group?.routePath) || group.routePath.length < 2 || !group.routePath.every(point) ||
    typeof generator?.sample !== 'function' || typeof generator?.floorSurface !== 'function') return [];
  const segments=[];let total=0;
  for(let i=1;i<group.routePath.length;i++) {
    const a=group.routePath[i-1],b=group.routePath[i],length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
    if(length>1e-8){segments.push({a,b,length,start:total});total+=length;}
  }
  if(!segments.length || !Number.isFinite(total))return [];
  const owned=p=>p.x>=region.cx*64+M.ownerMarginM && p.x<=(region.cx+1)*64-M.ownerMarginM &&
    p.z>=region.cz*64+M.ownerMarginM && p.z<=(region.cz+1)*64-M.ownerMarginM;
  const anchors=[];let segmentIndex=0;
  for(let station=0;station<M.maximumRouteStations && station*M.stationSpacingM<=total;station++) {
    const s=station*M.stationSpacingM;
    while(segmentIndex<segments.length-1 && s>segments[segmentIndex].start+segments[segmentIndex].length)segmentIndex++;
    const {a,b,length,start}=segments[segmentIndex],t=(s-start)/length,dx=b.x-a.x,dz=b.z-a.z,h=Math.hypot(dx,dz),sites=[];
    if(h<1e-8)continue;
    for(const side of [-1,1]) {
      const p={x:a.x+dx*t-dz/h*side*M.lateralOffsetM,z:a.z+dz*t+dx/h*side*M.lateralOffsetM};
      if(!owned(p))continue;
      const sample=generator.sample(p.x,p.z),bed=generator.floorSurface(p.x,p.z);
      if(sample?.substrate!=='sand' || !Number.isFinite(bed?.height) || !point(bed.normal))continue;
      const base={...p,hostId:null,routeStation:station,distanceM:M.lateralOffsetM,order:station*2+(side+1)/2};
      sites.push({...base,siteId:`sand-layer:${region.id}:${station}:${side}:bed`,layer:'bed'});
      sites.push({...base,siteId:`sand-layer:${region.id}:${station}:${side}:water`,layer:'water',waterHeightM:side<0?.8:1.8});
    }
    if(sites.length)anchors.push(sites);
  }
  // Spread the finite candidate budget over the whole owner corridor, instead
  // of spending it on the first few stations encountered on a winding path.
  const count=Math.min(M.maximumAnchorsPerOwner,anchors.length),selected=[];
  for(let i=0;i<count;i++)selected.push(...anchors[Math.floor((i+.5)*anchors.length/count)]);
  return selected;
}

export function reefSandCorridorSpeciesSites(sites,id,random,existing=[],epoch=10) {
  const free=sites.filter(s=>s.hostId===null),other=sites.filter(s=>s.hostId!==null);
  if(!(REEF_SAND_CORRIDOR_IDS.includes(id) || epoch >= 11 && REEF_SLOPE_SAND_IDS.includes(id)) || !free.length)return other;
  const offset=Math.floor(random(`sand-layer-site:${id}`)*free.length),rotated=[...free.slice(offset),...free.slice(0,offset)];
  const live=existing.filter(a=>a.alive && point(a.position));
  const separation=s=>live.length?Math.min(...live.map(a=>Math.hypot(s.x-a.position.x,s.z-a.position.z))):0;
  return [...rotated.toSorted((a,b)=>separation(b)-separation(a)),...other];
}
