import { reefValleyFacies } from './reefValleyRegion.js';

const point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Look only along the already committed itinerary. Request one adjacent
// nine-owner window; never move the observer or activate a second preview.
export function expeditionPreparationPosition(position, { elapsedSec, durationSec, playbackRate = 1, sample, paused = false, hidden = false, blockedPosition = null } = {}) {
  if (!point(position) || paused || hidden || typeof sample !== 'function' ||
      !Number.isFinite(elapsedSec) || !Number.isFinite(durationSec) || !(playbackRate > 0)) return position;
  const cx = Math.floor(position.x / 64), cz = Math.floor(position.z / 64);
  if (point(blockedPosition) && Math.abs(Math.floor(blockedPosition.x/64)-cx)<=1 &&
      Math.abs(Math.floor(blockedPosition.z/64)-cz)<=1) return { ...blockedPosition };
  for (let wallSec = 2; wallSec <= 24; wallSec += 2) {
    const frame = sample(Math.min(durationSec, elapsedSec + wallSec * Math.min(4, playbackRate)));
    if (!point(frame?.position)) return position;
    const nx = Math.floor(frame.position.x / 64), nz = Math.floor(frame.position.z / 64);
    if (nx === cx && nz === cz) continue;
    if (Math.abs(nx - cx) > 1 || Math.abs(nz - cz) > 1) return position;
    return { ...frame.position };
  }
  return position;
}

// Use committed physical branches instead of manufacturing camera waypoints.
// Their exact shared endpoints keep the route continuous and its original
// floor/entity clearance remains applicable. Old director paths stay separate.
export function createLifeExpeditionPath(group) {
  const main = group?.routePath;
  if (!Array.isArray(main) || main.length < 2 || !main.every(point)) throw new TypeError('生命巡游需要已提交路径。');
  const joins = [];
  for (const branch of group.branchPaths ?? []) {
    if (!Array.isArray(branch) || branch.length < 2 || !branch.every(point)) continue;
    const start = main.findIndex(p => distance(p, branch[0]) < 1e-7), end = main.findIndex(p => distance(p, branch.at(-1)) < 1e-7);
    if (start < 0 || end <= start || branch.some((p, i) => i && distance(p, branch[i - 1]) > 8)) continue;
    joins.push({ start, end, branch });
  }
  joins.sort((a, b) => a.start - b.start);
  const path = []; let cursor = 0, used = 0;
  for (const join of joins.slice(0, 2)) {
    if (join.start < cursor) continue;
    path.push(...main.slice(cursor, join.start), ...join.branch.slice(0, -1));
    cursor = join.end; used++;
  }
  path.push(...main.slice(cursor));
  return { path, branches: used, scope: 'committed-main-and-branch-corridors' };
}

// A continuous habitat overview: reef walls from above, bottom animals and
// grass edges closer to the bed. Only the observer moves; source geometry and
// populations are untouched. Live collision checks still run in ReefWorld.
export function sampleLifeExpeditionView(frame, { plan, bedY, surfaceY, durationSec } = {}) {
  if (!point(frame?.position) || !point(frame.target) || !Number.isFinite(bedY) || !Number.isFinite(surfaceY)) return frame;
  const facies = reefValleyFacies(plan, frame.position.x, frame.position.z);
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t*t*(3-2*t); };
  const entrance = smooth(frame.elapsedSec / 8), exit = Number.isFinite(durationSec) ? smooth((durationSec-frame.elapsedSec)/8) : 1;
  const blend = entrance * exit, height = 1.1 + 2.8*facies.reef + 1.3*facies.slope;
  const desiredY = Math.max(bedY+.75, Math.min(surfaceY-.6,bedY+height));
  const y = frame.position.y + (desiredY-frame.position.y)*blend;
  const position = {...frame.position,y}, drop=.4+facies.reef*1.4+facies.slope*.7;
  let target={...frame.target,y:y+(frame.target.y-frame.position.y)*(1-blend)-drop*blend};
  if(plan?.group?.wholeSeabedVersion===1 && blend>0){
    // A broad view along the existing corridor, with a continuous attraction
    // to admitted real rocks. Animal encounters can still override this view.
    const dx=frame.target.x-frame.position.x,dz=frame.target.z-frame.position.z,length=Math.hypot(dx,dz);
    if(length>.001){
      const ux=dx/length,uz=dz/length,lead=12+4*facies.reef;
      const vista={x:position.x+ux*lead,y:y-drop,z:position.z+uz*lead};
      let weight=0,sx=0,sy=0,sz=0;
      for(const rock of plan.group.coverElements??[]){
        if(rock.kind!=='rock'||rock.scale.y<.35)continue;
        const rx=rock.x-position.x,rz=rock.z-position.z,d=Math.hypot(rx,rz),front=rx*ux+rz*uz;
        const w=(1-smooth((d-6)/20))*smooth((front-1)/8)*Math.min(1,rock.scale.y/1.8);
        if(w<=0)continue;
        weight+=w;sx+=rock.x*w;sy+=(rock.y+rock.scale.y*.45)*w;sz+=rock.z*w;
      }
      if(weight>1e-6){const pull=.45*(1-Math.exp(-weight*.6));
        vista.x+=(sx/weight-vista.x)*pull;vista.y+=(sy/weight-vista.y)*pull;vista.z+=(sz/weight-vista.z)*pull;}
      target={x:target.x+(vista.x-target.x)*blend,y:target.y+(vista.y-target.y)*blend,z:target.z+(vista.z-target.z)*blend};
    }
  }
  return {...frame,position,target,overview:{facies:facies.dominant,heightM:y-bedY}};
}

// Observer notes, deliberately separate from population records and saves.
// An angular candidate is a nearby animal, not proof of WebGL visibility.
export class OceanLifeExpedition {
  constructor() { this.reset(); }
  reset() {
    this.individuals = new Map(); this.habitats = new Set(); this.nearby = [];
    this.travelledM = 0; this.elapsedSec = 0; this.habitat = null;
  }
  update({ frame, encounter, agents, activeOwnerIds, plan, travelledM, elapsedSec } = {}) {
    if (!point(frame?.position) || !Array.isArray(agents)) return;
    const owners = new Set(activeOwnerIds ?? []), ids = new Set(encounter?.ids ?? []);
    const nearby = agents.filter(a => ids.has(a.id) && a.alive === true && a.state !== 'dead' &&
      owners.has(a.regionId) && point(a.position) && distance(a.position, frame.position) <= 14);
    this.nearby = nearby.map(a => ({ id: a.id, speciesId: a.speciesId, state: a.state,
      distanceM: distance(a.position, frame.position) }));
    if (plan?.version === 8 && plan.theme === 'reef-valley-region') {
      this.habitat = reefValleyFacies(plan, frame.position.x, frame.position.z).dominant;
      this.habitats.add(this.habitat);
    }
    if (Number.isFinite(travelledM) && travelledM >= 0) this.travelledM = travelledM;
    if (Number.isFinite(elapsedSec) && elapsedSec >= 0) this.elapsedSec = elapsedSec;
    for (const a of nearby) {
      let row = this.individuals.get(a.id);
      if (!row) {
        if (this.individuals.size >= 512) continue;
        row = { speciesId: a.speciesId, position: { ...a.position }, lastFeedAt: a.lastFeedAt ?? null,
          moved: false, fed: false };
        this.individuals.set(a.id, row);
      } else {
        if (distance(row.position, a.position) > .001) row.moved = true;
        if (Number.isFinite(a.lastFeedAt) && a.lastFeedAt > (row.lastFeedAt ?? -1)) row.fed = true;
        row.position = { ...a.position }; row.lastFeedAt = a.lastFeedAt ?? null;
      }
    }
  }
  stats() {
    const rows = [...this.individuals.values()];
    return { habitat: this.habitat, habitats: [...this.habitats], nearby: structuredClone(this.nearby),
      speciesIds: [...new Set(rows.map(a => a.speciesId))], individuals: rows.length,
      movedIndividuals: rows.filter(a => a.moved).length, feedingIndividuals: rows.filter(a => a.fed).length,
      travelledM: this.travelledM, elapsedSec: this.elapsedSec,
      scope: 'nearby-live-records-along-one-committed-route' };
  }
}

// Checks bed/rock support along an observation ray. Leaves and translucent
// meshes are not evaluated here; this is not a GPU occlusion test.
export function expeditionTerrainClear(from, to, { activeOwnerIds, surface } = {}) {
  if (!point(from) || !point(to) || typeof surface !== 'function') return false;
  const length = distance(from, to); if (!(length > 0) || length > 14) return false;
  const owners = new Set(activeOwnerIds ?? []), steps = Math.max(2, Math.ceil(length / .5));
  try {
    for (let i = 0; i < steps; i++) {
      const t = i / steps, p = Object.fromEntries(['x', 'y', 'z'].map(k => [k, from[k] + (to[k] - from[k]) * t]));
      if (!owners.has(`${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`)) return false;
      const height = surface(p.x, p.z);
      if (!Number.isFinite(height) || p.y < height + .015) return false;
    }
  } catch { return false; }
  return true;
}
