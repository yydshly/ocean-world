import preparedHabitats from './world/shallowPreparedHabitats.js';
import { oceanRockHeight, fieldReefDiskMaxHeight } from './oceanRockShape.js';

// These are the metre-scaled envelopes of the existing display families,
// rounded outward. Lobster antennae and octopus arms remain inside the space;
// this pass does not enlarge animals or add biological population stocks.
const BODY_RADIUS = {
  'tube-sponge': .40,
  'shallow-feather-star': .65,
  'fluted-giant-clam': .65,
  'tropical-urchin': .65,
  'blue-linckia-star': .65,
  'day-octopus': .65,
  'spotted-reef-crab': 1.1,
  'painted-spiny-lobster': 2.3,
  'sailfin-tang': .65,
  'clown-triggerfish': .65,
};
const TAU = Math.PI * 2;

function reservedRadius(a) {
  return Math.max(a.clearance?.radius ?? 0, a.sizeM * (BODY_RADIUS[a.speciesId] ?? .8));
}

// Compose the previously scattered residents as two layered reef communities:
// exposed rock benches carry attached animals, the toe carries small crawlers,
// and compact reef-fish patrols travel above their own open patches. There are
// no invented caves, food-stock exchanges, or claims of full agent avoidance.
export function arrangeSlopeAnimalSpaces(model, options={}) {
  if (model.slopeHabitats) return model.slopeHabitats;
  const rocks = model.rocks.filter(r => r.sampleSlope && r.id.startsWith('sample-live-slope-'));
  const fieldRocks=model.rocks.filter(r=>r.fieldAsset);
  const signature=JSON.stringify({revision:'contact-fauna-sites-v1',seed:model.seed,rocks:model.rocks,
    agents:model.agents.map(a=>[a.id,a.speciesId,a.sizeM,a.home,a.radius])},(_,v)=>typeof v==='number'&&Number.isFinite(v)?Number(v.toFixed(8)):v);
  let hash=2166136261;for(let i=0;i<signature.length;i++)hash=Math.imul(hash^signature.charCodeAt(i),16777619);
  const cacheKey=`${signature.length}:${hash>>>0}`,saved=options.prepared!==false&&preparedHabitats?.signature===cacheKey?preparedHabitats:null;
  model.habitatInputSignature=cacheKey;model.preparedHabitats=!!saved;
  const result = { residents: [], fish: [], footprints: [], unplaced: [] };
  model.slopeHabitats = result;
  if (!rocks.length) return result;

  const protectedAgents = new Set([
    ...(model.reefCommunity?.residents ?? []),
    ...(model.reefCommunity?.fish ?? []),
    ...(model.encounters ?? []).flatMap(e => e.agents),
    ...model.agents.filter(a => a.sampleCommunityVisit !== undefined),
  ].map(a => a.id));
  const occupied = (model.reefCommunity?.residents ?? []).map(a => ({
    x: a.home.x, z: a.home.z,
    r: reservedRadius(a) + (a.mode === 'crawl' ? a.radius : 0),
  }));
  const anchors = [
    { zone: 'near', x: -8.5, z: 5.5, time: 24 },
    { zone: 'tail', x: 49.5, z: 5.4, time: 69 },
  ];
  const candidateCache = new Map();

  function candidates(anchor, level) {
    const key = `${anchor.zone}/${level}`;
    if (candidateCache.has(key)) return candidateCache.get(key);
    const rows = [];
    // A few upright residents use the upper bench farther ahead, so its
    // elevated silhouette sits behind the closer mixed bottom community.
    const focus = level === 'shoulder-bench'
      ? { x: anchor.x + 3.2, z: anchor.z + 2.8 } : anchor;
    for (const host of rocks.filter(r => r.slopeSector === anchor.zone)) {
      const co = Math.cos(host.rotation ?? 0), si = Math.sin(host.rotation ?? 0);
      for (const bench of (host.habitatBenches ?? []).filter(b => b.level === level)) {
        for (let j = -6; j <= 6; j++) for (let i = -14; i <= 14; i++) {
          const dx = bench.halfX * i / 14, dz = bench.halfZ * j / 6 * .90;
          const x = bench.x + dx * co + dz * si, z = bench.z - dx * si + dz * co;
          const distance = Math.hypot(x - focus.x, z - focus.z);
          if (distance > 9) continue;
          rows.push({ x, z, host, level, priority: distance });
        }
      }
    }
    rows.sort((a, b) => a.priority - b.priority);
    candidateCache.set(key, rows);
    return rows;
  }

  function hardFootprint(host, x, z, radius, interior=false) {
    let low = Infinity, high = -Infinity;
    // The reserved disk contains the complete body and the whole small orbit.
    // Intermediate circles also reject a seam hidden inside the outer ring.
    for (let ring = 0; ring <= 2; ring++) {
      const count = ring ? 16 : 1, r = radius * ring / 2;
      for (let n = 0; n < count; n++) {
        const angle = n * TAU / count, px = x + r * Math.cos(angle), pz = z + r * Math.sin(angle);
        const y = oceanRockHeight(host, px, pz);
        if (y === null || y < model.floor(px, pz) + .06 || Math.abs(model.surface(px, pz) - y) > .015) return null;
        low = Math.min(low, y); high = Math.max(high, y);
      }
    }
    if(interior){
      // Scan outcrops can enter the interior between the three coarse rings.
      // Refine only candidates that already passed the cheap checks, covering
      // the whole small movement disk instead of merely its outer outline.
      const steps=Math.ceil(radius/.045);
      for(let ix=-steps;ix<=steps;ix++)for(let iz=-steps;iz<=steps;iz++){
        const dx=ix*radius/steps,dz=iz*radius/steps;if(dx*dx+dz*dz>radius*radius)continue;
        const px=x+dx,pz=z+dz,y=oceanRockHeight(host,px,pz);
        if(y===null||y<model.floor(px,pz)+.06||Math.abs(model.surface(px,pz)-y)>.015)return null;
        low=Math.min(low,y);high=Math.max(high,y);
      }
    }
    return { low, high };
  }

  function choose(a, anchor, motion, level, swimming) {
    const radius = reservedRadius(a) + motion + .02;
    if(saved){
      const site=saved.footprints.find(p=>p.agentId===a.id);
      if(!site)return null;
      if(site.zone!==anchor.zone)return null;
      const host=rocks.find(r=>r.id===site.host),support=swimming?true:hardFootprint(host,site.x,site.z,radius,true);
      if(support&&Math.abs(site.r-radius)<1e-7&&!occupied.some(p=>Math.hypot(site.x-p.x,site.z-p.z)<radius+p.r+.04))return {...site};
      // A stale or incompatible receipt is never silently trusted.
      throw new Error(`Prepared natural habitat is no longer valid for ${a.id}`);
    }
    if(swimming){
      const sites=rocks.filter(r=>r.slopeSector===anchor.zone).flatMap(host=>[-.24,0,.24].map(dx=>({
        host,x:host.x+dx*host.scale.x,z:host.z-.025*host.scale.z}))).sort((a,b)=>Math.hypot(a.x-anchor.x,a.z-anchor.z)-Math.hypot(b.x-anchor.x,b.z-anchor.z));
      for(const {host,x,z}of sites){
        if(Math.hypot(x-anchor.x,z-anchor.z)>7||occupied.some(p=>Math.hypot(x-p.x,z-p.z)<radius+p.r+.04))continue;
        return {x,z,r:radius,host:host.id,zone:anchor.zone,level:'reef-water',swimming:true};
      }
      return null;
    }
    // One deterministic whole-community layout, with a bounded list of actual
    // candidates. The closest stable free site wins; there is no solve loop.
    for (const { x, z, host } of candidates(anchor, level)) {
      if (occupied.some(p => Math.hypot(x - p.x, z - p.z) < radius + p.r + .04)) continue;
      const support = hardFootprint(host, x, z, radius);
      if (!support) continue;
      if(fieldRocks.some(rock=>{const high=rock===host?null:fieldReefDiskMaxHeight(rock,x,z,radius);return high!==null&&high>support.low+.015;}))continue;
      // Attached/crawling bodies need a stable contact patch. A patrol instead
      // follows the highest actual surface beneath its full body each frame;
      // requiring level ground would wrongly exclude a healthy sloping reef.
      if (!swimming && support.high - support.low > (a.speciesId === 'painted-spiny-lobster' ? .16 : .13)) continue;
      const detailed=hardFootprint(host,x,z,radius,true);
      if(!detailed||!swimming&&detailed.high-detailed.low>(a.speciesId==='painted-spiny-lobster'?.16:.13))continue;
      return { x, z, r: radius, host: host.id, zone: anchor.zone, level };
    }
    return null;
  }

  function place(a, anchor, swimming = false, level = 'toe-bench') {
    const motion = swimming ? .43 : a.mode === 'crawl' ? (a.speciesId === 'day-octopus' ? .10 : .07) : 0;
    let site = choose(a, anchor, motion, level, swimming);
    // A complete field outcrop may cover a formerly exposed upper patch.
    // Try the other authored community at the same level, preserving every
    // actual footprint and stability check instead of putting a body inside it.
    if(!site){const other=anchors.find(row=>row!==anchor);site=choose(a,other,motion,level,swimming);if(site)anchor=other;}
    if (!site) { result.unplaced.push(a.id); return; }
    const footprint = { ...site };
    footprint.agentId = a.id;
    occupied.push(footprint); result.footprints.push(footprint);
    a.home = { x: site.x, z: site.z }; a.host = site.host;
    a.slopeHabitat = { zone: anchor.zone, time: anchor.time, host: site.host, level:site.level };
    delete a.fixedSamplePosition;
    if (swimming) {
      a.radius = .43; a.speed = .13;
      a.phase = Math.PI / 2 - anchor.time * a.speed;
      let supportCeiling=model.surface(site.x,site.z,true);
      for(const rock of model.rocks){
        if(Math.hypot(site.x-rock.x,site.z-rock.z)>site.r+Math.hypot(rock.scale.x,rock.scale.z)*.71)continue;
        const top=rock.fieldAsset?fieldReefDiskMaxHeight(rock,site.x,site.z,site.r):rock.y+rock.scale.y;
        if(top!==null)supportCeiling=Math.max(supportCeiling,top);
      }
      a.reefPatrol = { x: .40, z: .16, vertical: .07, behavior: 'patrol', supportCeiling };
      a.lift = a.speciesId === 'sailfin-tang' ? .45 : .65;
      result.fish.push(a);
    } else {
      if (a.mode === 'crawl') {
        a.radius = motion; a.speed = .025;
        a.phase = (result.residents.length % 7) * .83;
      }
      a.heading = .22 + (result.residents.length % 5) * .35;
      result.residents.push(a);
    }
  }

  const benthos = ['tube-sponge', 'fluted-giant-clam', 'shallow-feather-star',
    'tropical-urchin', 'day-octopus', 'painted-spiny-lobster', 'spotted-reef-crab', 'blue-linckia-star'];
  const placements = [];
  for (const speciesId of benthos) {
    const members = model.agents.filter(a => a.speciesId === speciesId && !protectedAgents.has(a.id));
    members.forEach((a, i) => {
      const upper = speciesId === 'tube-sponge' && i > 0 || speciesId === 'shallow-feather-star' && i === 2;
      placements.push({ a, anchor: anchors[(i + benthos.indexOf(speciesId)) % 2],
        level: upper ? 'shoulder-bench' : 'toe-bench' });
    });
  }
  // Reserve large complete footprints first, then nest the small residents
  // around them. This yields a mixed foreground instead of relegating every
  // crawler behind the attached row after its available spaces were spent.
  placements.sort((a, b) => reservedRadius(b.a) - reservedRadius(a.a));
  for (const { a, anchor, level } of placements) place(a, anchor, false, level);
  for (const speciesId of ['sailfin-tang', 'clown-triggerfish']) {
    const members = model.agents.filter(a => a.speciesId === speciesId && !protectedAgents.has(a.id));
    members.forEach((a, i) => place(a, anchors[i % 2], true));
  }

  // Keep the existing fit contract for attached/crawling residents. The whole
  // slope footprint list also reserves the independent reef-fish patrol disks.
  if (model.reefCommunity) model.reefCommunity.residents.push(...result.residents);
  return result;
}
