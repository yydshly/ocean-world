import { OCEAN_BIODIVERSITY_ROUTE_STOPS } from './oceanBiodiversityRoutes.js';
import { OCEAN_BENTHIC_LIFE_ROUTE_STOPS } from './oceanBenthicLifeRoutes.js';
import { oceanRockHeight, oceanRockSurface } from './oceanRockShape.js';
import { sceneElementHeight } from './oceanSceneElements.js';
import { validateLivingHabitatMosaic } from './livingHabitatMosaic.js';
import { validateLivingSeascapePlan } from './livingSeascape.js';
import { validateLivingHabitatBeltPlan, sampleLivingHabitatBelt } from './livingHabitatBelt.js';
import { validateLivingShallowSeascapePlan, sampleLivingShallowSeascape,
  SHALLOW_SEASCAPE_ROUTE_STOPS } from './livingShallowSeascape.js';
import { validateLivingSeabedRelief, sampleLivingSeabedRelief,
  livingSeabedFloorVertex, livingSeabedFloorSurface } from './livingSeabedRelief.js';

const VERSION = 1, SIZE = 64, GUARD = 6, LIMIT = 25, TAU = Math.PI * 2;
const KINDS = ['rock', 'coral', 'seagrass', 'rubble', 'algae', 'formation', 'driftwood', 'bottle'];
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const stamp = value => JSON.stringify(value);
const finitePoint = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
function random(seed, cx, cz, salt) {
  const text = `${seed}|ridge-gully-v1|${cx},${cz}|${salt}`; let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function owner(base, cx, cz) {
  if (base.profile !== 'living-shallows-v1' || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz))
    throw new TypeError('Ridge plans require a living-shallows generator and integer owner coordinates.');
  return base.chunk(cx, cz);
}
function retainedRock(rock, bounds) {
  const edge = Math.min(rock.x - bounds.minX, bounds.maxX - rock.x, rock.z - bounds.minZ, bounds.maxZ - rock.z);
  return edge <= Math.hypot(rock.scale.x, rock.scale.z) * .5 + GUARD;
}
function world(rock, lx, lz) {
  const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
  return { x: rock.x + lx * rock.scale.x * c + lz * rock.scale.z * s,
    z: rock.z - lx * rock.scale.x * s + lz * rock.scale.z * c };
}
function fits(element, bounds, margin = GUARD) {
  const c = Math.cos(element.rotation), s = Math.sin(element.rotation);
  const hx = .5 * (Math.abs(c) * element.scale.x + Math.abs(s) * element.scale.z);
  const hz = .5 * (Math.abs(s) * element.scale.x + Math.abs(c) * element.scale.z);
  return element.x - hx >= bounds.minX + margin && element.x + hx <= bounds.maxX - margin &&
    element.z - hz >= bounds.minZ + margin && element.z + hz <= bounds.maxZ - margin;
}
function nearby(base, cx, cz) {
  const rows = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) rows.push(...base.chunk(cx + dx, cz + dz).elements);
  return rows;
}
function support(base, rocks, x, z) {
  let height = base.floorSurface(x, z).height;
  for (const rock of rocks) { const y = oceanRockHeight(rock, x, z); if (y !== null) height = Math.max(height, y); }
  return height;
}
function probes(element, radius = .5 * Math.max(element.scale.x, element.scale.z)) {
  return [{ x: element.x, z: element.z }, ...Array.from({ length: 8 }, (_, i) =>
    ({ x: element.x + Math.cos(i * TAU / 8) * radius, z: element.z + Math.sin(i * TAU / 8) * radius }))];
}
function clearScenery(base, rocks, element, clearance = .035) {
  return probes(element).every(p => support(base, rocks, p.x, p.z) <= base.floorSurface(p.x, p.z).height + clearance);
}
function protects(elements, newRocks) {
  return elements.filter(e => ['coral', 'algae', 'driftwood', 'bottle'].includes(e.kind)).every(e => {
    const radius = e.kind === 'algae' ? Math.max(e.scale.x, e.scale.z) * .5 : Math.hypot(e.scale.x, e.scale.z) * .5;
    return probes(e, radius).every(p => newRocks.every(rock => {
      const y = oceanRockHeight(rock, p.x, p.z); return y === null || y <= e.y + .012;
    }));
  });
}
function gullySamples(center, heading, length, gap) {
  const c = Math.cos(heading), s = Math.sin(heading), points = [];
  for (const along of [-.32, -.16, 0, .16, .32]) for (const across of [-.30, 0, .30]) {
    const u = along * length, v = across * gap;
    points.push({ x: center.x + u * c + v * s, z: center.z - u * s + v * c });
  }
  return points;
}

/** A new owner's real rock/attachment plan. The global one-metre sea-bed grid
 * is never changed; an open gully is the original floor between two ridges.
 * Scene descriptors do not create ecological individuals or food stocks. */
export function createLivingRidgePlan(baseGenerator, cx, cz) {
  const base = baseGenerator.baseGenerator ?? baseGenerator, chunk = owner(base, cx, cz);
  const rand = salt => random(base.seed, cx, cz, salt), oldRocks = chunk.elements.filter(e => e.kind === 'rock');
  const keepRocks = oldRocks.filter(e => retainedRock(e, chunk.bounds)), keepIds = new Set(keepRocks.map(e => e.id));
  const removed = new Set(oldRocks.filter(e => !keepIds.has(e.id)).map(e => e.id));
  const kept = chunk.elements.filter(e => e.kind !== 'rock' && !e.attachmentId || keepIds.has(e.id) || keepIds.has(e.attachmentId));
  const protectedElements = kept.filter(e => e.attachmentId || ['driftwood', 'bottle'].includes(e.kind));
  const neighbours = nearby(base, cx, cz).filter(e => e.kind === 'rock' && (!removed.has(e.id)));
  const length = 38 + 2 * rand('length'), width = 8 + rand('width'), gap = 10 + 2 * rand('gap');
  const center = { x: chunk.origin.x + 32, z: chunk.origin.z + 32 };
  const headings = [0, Math.PI / 2, .12, -.12, Math.PI / 2 + .12, Math.PI / 2 - .12];
  const shifts = [[0, 0], [2, -2], [-2, 2], [0, -3], [3, 0], [-3, 0]];
  let chosen = null;
  for (const [dx, dz] of shifts) for (const heading of headings) {
    const middle = { x: center.x + dx, z: center.z + dz }, c = Math.cos(heading), s = Math.sin(heading);
    const rocks = [-1, 1].map((side, index) => {
      const transverse = side * (width + gap) * .5, x = middle.x + transverse * s, z = middle.z + transverse * c;
      return { id: `living-ridge:${chunk.id}:rock:${index}`, kind: 'rock', profile: index ? 'natural-c' : 'natural-b',
        x, y: base.floorSurface(x, z).height - .18, z, rotation: heading,
        scale: { x: length, y: 4.8 + 1.8 * rand(`height:${index}`), z: width } };
    });
    if (!rocks.every(r => fits(r, chunk.bounds)) || !protects(protectedElements, rocks)) continue;
    const points = gullySamples(middle, heading, length, gap), all = [...neighbours, ...rocks];
    const open = points.filter(p => support(base, all, p.x, p.z) <= base.floorSurface(p.x, p.z).height + .04).length;
    if (open < 12) continue;
    const score = open + rand(`candidate:${dx},${dz},${heading}`) * .1;
    if (!chosen || score > chosen.score) chosen = { rocks, middle, heading, score, points };
  }
  if (!chosen) throw new RangeError(`Owner ${chunk.id} has no safe internal ridge-gully corridor.`);
  const rocks = [...neighbours, ...chosen.rocks];
  const elements = kept.filter(e => !['seagrass', 'rubble'].includes(e.kind) || clearScenery(base, rocks, e));
  elements.push(...chosen.rocks);
  for (const [ri, rock] of chosen.rocks.entries()) {
    const attached = [];
    for (let index = 0; index < 6; index++) {
      const lx = -.30 + index * .12, lz = (index % 2 ? -1 : 1) * .055;
      const p = world(rock, lx, lz), y = oceanRockHeight(rock, p.x, p.z), state = base.sample(p.x, p.z);
      const morphotype = index % 3 === 0 ? 'branching' : index % 3 === 1 ? 'table' : 'fan';
      const widthM = 2.1 + rand(`coral-width:${ri}:${index}`) * 1.1;
      const coral = { id: `living-ridge:${chunk.id}:coral:${ri}:${index}`, kind: 'coral', morphotype,
        attachmentId: rock.id, x: p.x, y, z: p.z, rotation: rand(`coral-turn:${ri}:${index}`) * TAU,
        scale: { x: widthM, y: morphotype === 'table' ? .8 + .4 * rand(`coral-height:${ri}:${index}`)
          : 1.2 + .9 * rand(`coral-height:${ri}:${index}`), z: widthM * (morphotype === 'table' ? .85 : .75) } };
      if (y === null || state.depthM > 22 || y < base.floorSurface(p.x, p.z).height + .25 || !fits(coral, chunk.bounds) ||
        support(base, rocks, p.x, p.z) > y + 1e-7 || elements.some(e => ['coral', 'algae'].includes(e.kind) &&
          Math.hypot(e.x - p.x, e.z - p.z) < (Math.max(e.scale.x, e.scale.z) + widthM) * .5 + .2)) continue;
      elements.push(coral); attached.push(coral);
    }
    for (let index = 0; index < 4; index++) {
      const surfaceLocal = { x: -.26 + index * .17, z: index % 2 ? .245 : -.245 };
      const local = oceanRockSurface(rock.profile, surfaceLocal.x, surfaceLocal.z); if (!local) continue;
      const p = world(rock, surfaceLocal.x, surfaceLocal.z), y = rock.y + local.height * rock.scale.y, patchRadius = .026;
      const worldRadius = Math.max(rock.scale.x, rock.scale.z) * patchRadius;
      const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation), nx = local.normal.x / rock.scale.x,
        ny = local.normal.y / rock.scale.y, nz = local.normal.z / rock.scale.z, n = Math.hypot(nx, ny, nz);
      const algae = { id: `living-ridge:${chunk.id}:algae:${ri}:${index}`, kind: 'algae', attachmentId: rock.id,
        x: p.x, y, z: p.z, surfaceLocal, patchRadius, rotation: rock.rotation,
        normal: { x: (nx * c + nz * s) / n, y: ny / n, z: (-nx * s + nz * c) / n },
        scale: { x: rock.scale.x * patchRadius * 2, y: .018, z: rock.scale.z * patchRadius * 2 } };
      if (!fits(algae, chunk.bounds) || y < base.floorSurface(p.x, p.z).height + .12 || support(base, rocks, p.x, p.z) > y + 1e-7 ||
        elements.some(e => ['coral', 'algae'].includes(e.kind) && Math.hypot(e.x - p.x, e.z - p.z) <
          Math.max(e.scale.x, e.scale.z) * .5 + worldRadius + .1)) continue;
      elements.push(algae);
    }
  }
  const plan = { version: VERSION, id: chunk.id, cx, cz, seed: base.seed, theme: 'ridge-gully',
    baseStamp: stamp(chunk), ridgeIds: chosen.rocks.map(e => e.id), retainedRockIds: keepRocks.map(e => e.id),
    corridor: { center: chosen.middle, heading: chosen.heading, lengthM: length, openingM: gap,
      floorUnchanged: true, clearSamples: chosen.points.filter(p => support(base, rocks, p.x, p.z) <= base.floorSurface(p.x, p.z).height + .04).length },
    elements };
  if (!validateLivingRidgePlan(plan, base)) throw new Error('Generated ridge-gully plan failed its own physical validation.');
  return freeze(plan);
}

export function validateLivingRidgePlan(plan, baseGenerator) {
  try {
    if (plan?.version === 6) return validateLivingShallowSeascapePlan(baseGenerator.baseGenerator ?? baseGenerator, plan);
    if (plan?.version === 5) return validateLivingHabitatBeltPlan(plan, baseGenerator);
    if (plan?.version === 4) return validateLivingSeascapePlan(plan, baseGenerator);
    if (plan?.version === 3) return validateLivingSeabedRelief(plan, baseGenerator);
    if (plan?.version === 2) return validateLivingHabitatMosaic(plan, baseGenerator);
    const base = baseGenerator.baseGenerator ?? baseGenerator;
    if (!plan || plan.version !== VERSION || plan.seed !== base.seed || plan.theme !== 'ridge-gully' ||
      !Number.isSafeInteger(plan.cx) || !Number.isSafeInteger(plan.cz) || plan.id !== `${plan.cx},${plan.cz}` ||
      !Array.isArray(plan.elements) || plan.elements.length > 600 || !Array.isArray(plan.ridgeIds) || plan.ridgeIds.length !== 2) return false;
    const chunk = owner(base, plan.cx, plan.cz), originals = new Map(chunk.elements.map(e => [e.id, e]));
    if (plan.baseStamp !== stamp(chunk) || !plan.corridor || plan.corridor.floorUnchanged !== true ||
      !Number.isFinite(plan.corridor.lengthM) || plan.corridor.lengthM < 36 || plan.corridor.lengthM > 41 ||
      !Number.isFinite(plan.corridor.openingM) || plan.corridor.openingM < 8 || plan.corridor.openingM > 14 ||
      !finitePoint({ ...plan.corridor.center, y: 0 }) || !Number.isFinite(plan.corridor.heading)) return false;
    const rows = new Map(), oldRocks = chunk.elements.filter(e => e.kind === 'rock'), retained = oldRocks.filter(e => retainedRock(e, chunk.bounds));
    if (stamp(plan.retainedRockIds) !== stamp(retained.map(e => e.id))) return false;
    for (const e of plan.elements) {
      if (!e || typeof e.id !== 'string' || rows.has(e.id) || !KINDS.includes(e.kind) || !finitePoint(e) ||
        !Number.isFinite(e.rotation) || !e.scale || !['x', 'y', 'z'].every(a => Number.isFinite(e.scale[a]) && e.scale[a] > 0)) return false;
      const original = originals.get(e.id);
      if (original ? stamp(original) !== stamp(e) : !e.id.startsWith(`living-ridge:${plan.id}:`) || !fits(e, chunk.bounds)) return false;
      rows.set(e.id, e);
    }
    for (const rock of retained) {
      if (!rows.has(rock.id) || stamp(rows.get(rock.id)) !== stamp(rock)) return false;
      for (const e of chunk.elements.filter(e => e.attachmentId === rock.id)) if (!rows.has(e.id) || stamp(rows.get(e.id)) !== stamp(e)) return false;
    }
    const newRocks = plan.ridgeIds.map(id => rows.get(id));
    if (new Set(plan.ridgeIds).size !== 2 || newRocks.some(e => !e || e.kind !== 'rock' ||
      !['natural-b', 'natural-c'].includes(e.profile) || e.scale.y < 4 || e.scale.y > 7 ||
      e.scale.x < 36 || e.scale.x > 41 || e.scale.z < 7 || e.scale.z > 11 ||
      Math.abs(e.y - (base.floorSurface(e.x, e.z).height - .18)) > 1e-7)) return false;
    const removed = new Set(oldRocks.filter(e => !retained.includes(e)).map(e => e.id));
    const rocks = [...nearby(base, plan.cx, plan.cz).filter(e => e.kind === 'rock' && !removed.has(e.id)), ...newRocks];
    const protectedRows = plan.elements.filter(e => originals.has(e.id) && (e.attachmentId || ['driftwood', 'bottle'].includes(e.kind)));
    if (!protects(protectedRows, newRocks)) return false;
    const points = gullySamples(plan.corridor.center, plan.corridor.heading, plan.corridor.lengthM, plan.corridor.openingM);
    const clear = points.filter(p => support(base, rocks, p.x, p.z) <= base.floorSurface(p.x, p.z).height + .04).length;
    if (clear < 12 || clear !== plan.corridor.clearSamples) return false;
    for (const e of plan.elements) {
      if (!originals.has(e.id) && !['rock', 'coral', 'algae'].includes(e.kind)) return false;
      if (!originals.has(e.id) && e.kind === 'rock' && !plan.ridgeIds.includes(e.id)) return false;
      if (!originals.has(e.id) && ['coral', 'algae'].includes(e.kind)) {
        const host = rows.get(e.attachmentId), y = host && oceanRockHeight(host, e.x, e.z);
        if (!host || host.kind !== 'rock' || y === null || Math.abs(y - e.y) > 1e-6 || support(base, rocks, e.x, e.z) > y + 1e-6) return false;
        if (e.kind === 'coral' && !['branching', 'table', 'fan'].includes(e.morphotype)) return false;
        if (e.kind === 'algae') {
          if (!e.surfaceLocal || !Number.isFinite(e.surfaceLocal.x) || !Number.isFinite(e.surfaceLocal.z) ||
            !finitePoint(e.normal) || !Number.isFinite(e.patchRadius) || e.patchRadius <= 0 || e.patchRadius > .06) return false;
          const local = oceanRockSurface(host.profile, e.surfaceLocal.x, e.surfaceLocal.z), p = world(host, e.surfaceLocal.x, e.surfaceLocal.z);
          if (!local || Math.abs(p.x - e.x) > 1e-7 || Math.abs(p.z - e.z) > 1e-7 ||
            Math.abs(host.y + local.height * host.scale.y - e.y) > 1e-7 || Math.abs(Math.hypot(e.normal.x, e.normal.y, e.normal.z) - 1) > 1e-7 ||
            Math.abs(e.scale.x - host.scale.x * e.patchRadius * 2) > 1e-7 || Math.abs(e.scale.z - host.scale.z * e.patchRadius * 2) > 1e-7 ||
            e.rotation !== host.rotation) return false;
        }
      }
      if (['seagrass', 'rubble'].includes(e.kind) && !clearScenery(base, newRocks, e)) return false;
    }
    return true;
  } catch { return false; }
}

/** Bounded committed owner plans over the unchanged base generator. Temporary
 * candidate queries never publish a new revision or survive their callback. */
export function createLivingRidgeGenerator(baseGenerator) {
  const base = baseGenerator.baseGenerator ?? baseGenerator;
  if (base.profile !== 'living-shallows-v1') throw new TypeError('Ridge facade requires living shallows.');
  const plans = new Map(), chunks = new Map(), ready = new Set(); let revision = 0, candidateBatchDepth = 0;
  let queryPlans = plans, queryChunks = chunks;
  const checkOwnerId = id => {
    if (typeof id !== 'string') throw new TypeError('Ridge owner ID must be a coordinate pair.');
    const values = id.split(',').map(Number);
    if (values.length !== 2 || !values.every(Number.isSafeInteger) || `${values[0]},${values[1]}` !== id)
      throw new TypeError('Ridge owner ID must be a canonical integer coordinate pair.');
  };
  const floorPlanAt = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const plan = queryPlans.get(`${Math.floor(x / SIZE)},${Math.floor(z / SIZE)}`);
    return plan?.version === 3 || plan?.version === 4 || plan?.version === 6 ? plan : null;
  };
  const assertPublishable = () => {
    if (candidateBatchDepth) throw new TypeError('Cannot publish ridge owners inside a temporary plan batch.');
  };
  const inspectBatch = input => {
    if (!Array.isArray(input) || input.length > LIMIT) throw new TypeError('Ridge plan batch must be an array within the owner limit.');
    const ids = new Set(), groups = new Map();
    for (const plan of input) {
      if (!validateLivingRidgePlan(plan, base)) throw new TypeError('Invalid ridge plan in batch.');
      if (ids.has(plan.id)) throw new TypeError('Ridge plan batch contains duplicate owners.');
      ids.add(plan.id);
      if (plan.version === 4 || plan.version === 5) {
        const group = plan.group, key = `${group.cx},${group.cz}`, entry = groups.get(key);
        if (entry && stamp(entry.group) !== stamp(group)) throw new TypeError('Ridge batch has inconsistent seascape group metadata.');
        if (!entry) groups.set(key, { group, ids: new Set([plan.id]) }); else entry.ids.add(plan.id);
      }
    }
    for (const { group, ids: members } of groups.values()) {
      if (!Array.isArray(group.ownerIds) || group.ownerIds.length !== 4 || members.size !== 4 ||
        group.ownerIds.some(id => !members.has(id))) throw new TypeError('Ridge batch requires all four seascape group owners.');
    }
    if (new Set([...ready, ...plans.keys(), ...ids]).size > LIMIT) throw new RangeError('Ridge registry exceeds its 25-owner halo.');
    return input;
  };
  const facade = { ...base, baseGenerator: base,
    routeStops: Object.freeze([...base.routeStops,
      Object.freeze({ id: 'ridge-gully', label: '礁脊岩沟', x: 928, z: 288 }),
      Object.freeze({ id: 'patch-reef', label: '分散礁丘', x: 1376, z: 480 }),
      Object.freeze({ id: 'meadow-edge', label: '草床边缘', x: 1248, z: 288 }),
      Object.freeze({ id: 'shelf-rise', label: '海床缓坡', x: 2272, z: 480 }),
      Object.freeze({ id: 'sand-basin', label: '宽缓砂盆', x: 1760, z: 608 }),
      Object.freeze({ id: 'connected-seascape', label: '连续海床', x: 3502.5, z: 544 }),
      Object.freeze({ id: 'seascape-transition', label: '相邻生境', x: 3502.5, z: 608 }),
      Object.freeze({ id: 'habitat-belt-reef', label: '生活带：礁群沙道', x: 4758, z: 150, heading: Math.PI / 2, entryAcrossM: 2 }),
      Object.freeze({ id: 'habitat-belt-meadow', label: '生活带：草床水层', x: 4832, z: 224, heading: Math.atan2(.51, .86), entryAcrossM: 2 }),
      ...SHALLOW_SEASCAPE_ROUTE_STOPS, ...OCEAN_BIODIVERSITY_ROUTE_STOPS, ...OCEAN_BENTHIC_LIFE_ROUTE_STOPS]),
    sample(x, z) {
      const belt = queryPlans.get(`${Math.floor(x / SIZE)},${Math.floor(z / SIZE)}`);
      if (belt?.version === 5) return sampleLivingHabitatBelt(base, belt, x, z);
      if (belt?.version === 6) return sampleLivingShallowSeascape(base, belt, x, z);
      const plan = floorPlanAt(x, z);
      return plan ? sampleLivingSeabedRelief(base, plan, x, z) : base.sample(x, z);
    },
    floorVertex(x, z) {
      const plan = floorPlanAt(x, z);
      return plan ? livingSeabedFloorVertex(base, plan, x, z) : base.floorVertex(x, z);
    },
    floorSurface(x, z) {
      const plan = floorPlanAt(x, z);
      return plan ? livingSeabedFloorSurface(base, plan, x, z) : base.floorSurface(x, z);
    },
    coverAt(x, z, environment) {
      const belt = queryPlans.get(`${Math.floor(x / SIZE)},${Math.floor(z / SIZE)}`);
      if (belt?.version === 5) return base.coverAt(x, z, sampleLivingHabitatBelt(base, belt, x, z));
      if (belt?.version === 6) return base.coverAt(x, z, sampleLivingShallowSeascape(base, belt, x, z));
      const plan = floorPlanAt(x, z);
      return plan ? base.coverAt(x, z, sampleLivingSeabedRelief(base, plan, x, z)) : base.coverAt(x, z, environment);
    },
    get ridgeRevision() { return revision; },
    getRidgePlan: id => plans.get(id),
    isRidgeOwnerReady: id => ready.has(id),
    registryStats: () => ({ size: ready.size, limit: LIMIT, revision, ids: [...ready],
      ridgeReadyOwnerIds: [...ready], ridgePlanOwnerIds: [...plans.keys()].filter(id => ready.has(id)) }),
    registerLegacyRidgeOwner(id) {
      assertPublishable();
      checkOwnerId(id); if (ready.has(id)) return false;
      if (ready.size >= LIMIT) throw new RangeError('Ridge registry exceeds its 25-owner halo.');
      ready.add(id); revision++; return true;
    },
    chunk(cx, cz) {
      const id = `${cx},${cz}`, plan = queryPlans.get(id); if (!plan) return base.chunk(cx, cz);
      if (!queryChunks.has(id)) {
        const original = owner(base, cx, cz), counts = Object.fromEntries(KINDS.map(k => [k, 0]));
        const landform = Object.fromEntries(base.rockProfiles.map(k => [k, 0]));
        for (const e of plan.elements) { counts[e.kind]++; if (e.kind === 'rock') landform[e.profile]++; }
        queryChunks.set(id, Object.freeze({ ...original, elements: plan.elements, counts: Object.freeze(counts),
          landform: Object.freeze(landform), ridgePlan: plan, ridgeGeologyVersion: plan.version,
          ...([3, 4, 5, 6].includes(plan.version) ? { habitatComposition: plan.habitatComposition } : {}) }));
      }
      return queryChunks.get(id);
    },
    registerRidgePlan(plan) {
      assertPublishable();
      if (!validateLivingRidgePlan(plan, base)) throw new TypeError('Invalid saved ridge-gully plan.');
      if (ready.has(plan.id) && plans.has(plan.id) && stamp(plans.get(plan.id)) === stamp(plan)) return false;
      if (!ready.has(plan.id) && ready.size >= LIMIT) throw new RangeError('Ridge registry exceeds its 25-owner halo.');
      plans.set(plan.id, freeze(plan)); ready.add(plan.id); chunks.delete(plan.id); revision++; return true;
    },
    registerRidgePlans(input) {
      assertPublishable();
      const candidates = inspectBatch(input);
      const changes = candidates.filter(plan => !ready.has(plan.id) || !plans.has(plan.id) || stamp(plans.get(plan.id)) !== stamp(plan));
      if (!changes.length) return false;
      const committed = changes.map(plan => freeze(plan));
      for (const plan of committed) { plans.set(plan.id, plan); ready.add(plan.id); chunks.delete(plan.id); }
      revision++; return true;
    },
    // Complete large groups live on disk. Only the current support halo is
    // published, so restoring one does not enlarge the 25-owner registry.
    replaceRidgeOwners(input, legacyIds = []) {
      assertPublishable();
      if (!Array.isArray(input) || !Array.isArray(legacyIds)) throw new TypeError('Invalid ridge halo replacement.');
      const next = new Map(), nextReady = new Set();
      for (const plan of input) {
        if (!validateLivingRidgePlan(plan, base) || nextReady.has(plan.id)) throw new TypeError('Invalid ridge halo plan.');
        next.set(plan.id, freeze(plan)); nextReady.add(plan.id);
      }
      for (const id of legacyIds) { checkOwnerId(id); if (nextReady.has(id)) throw new TypeError('Duplicate ridge halo owner.'); nextReady.add(id); }
      if (nextReady.size > LIMIT) throw new RangeError('Ridge registry exceeds its 25-owner halo.');
      if (stamp([...ready]) === stamp([...nextReady]) && stamp([...plans]) === stamp([...next])) return false;
      plans.clear(); chunks.clear(); ready.clear();
      for (const [id, plan] of next) plans.set(id, plan);
      for (const id of nextReady) ready.add(id);
      revision++; return true;
    },
    withShallowSeascapePlans(input, fn) {
      if (!Array.isArray(input) || input.length !== 12 || typeof fn !== 'function' || fn.constructor?.name === 'AsyncFunction')
        throw new TypeError('A shallow seascape candidate requires twelve owners and a synchronous callback.');
      const group = input[0]?.group, ids = new Set();
      for (const plan of input) {
        if (plan?.version !== 6 || !validateLivingRidgePlan(plan, base) || ids.has(plan.id) || stamp(plan.group) !== stamp(group))
          throw new TypeError('Invalid complete shallow seascape candidate.');
        ids.add(plan.id);
      }
      if (group?.ownerIds?.length !== 12 || group.ownerIds.some(id => !ids.has(id))) throw new TypeError('Incomplete shallow seascape candidate.');
      const previousPlans = queryPlans, previousChunks = queryChunks;
      queryPlans = new Map(input.map(plan => [plan.id, plan])); queryChunks = new Map(); candidateBatchDepth++;
      try {
        const result = fn(facade);
        if (result && typeof result.then === 'function') throw new TypeError('Ridge candidate callback returned an asynchronous result.');
        return result;
      } finally { queryPlans = previousPlans; queryChunks = previousChunks; candidateBatchDepth--; }
    },
    unregisterRidgePlan(id) { assertPublishable(); if (!plans.delete(id)) return false; ready.delete(id); chunks.delete(id); revision++; return true; },
    retainRidgeOwners(ids) {
      assertPublishable();
      const keep = new Set(ids); let removed = 0;
      for (const id of [...ready]) if (!keep.has(id)) {
        plans.delete(id); ready.delete(id); chunks.delete(id); revision++; removed++;
      }
      return removed;
    },
    withRidgePlan(plan, fn) {
      if (typeof fn !== 'function' || fn.constructor?.name === 'AsyncFunction') throw new TypeError('Ridge candidate callback must be synchronous.');
      if (!validateLivingRidgePlan(plan, base)) throw new TypeError('Invalid ridge candidate plan.');
      const previous = plans.get(plan.id), previousChunk = chunks.get(plan.id);
      plans.set(plan.id, plan); chunks.delete(plan.id);
      try {
        const result = fn(facade);
        if (result && typeof result.then === 'function') throw new TypeError('Ridge candidate callback returned an asynchronous result.');
        return result;
      } finally {
        if (previous) plans.set(plan.id, previous); else plans.delete(plan.id);
        if (previousChunk) chunks.set(plan.id, previousChunk); else chunks.delete(plan.id);
      }
    },
    withRidgePlans(input, fn) {
      if (typeof fn !== 'function' || fn.constructor?.name === 'AsyncFunction') throw new TypeError('Ridge candidate callback must be synchronous.');
      const candidates = inspectBatch(input), previous = candidates.map(plan => ({ id: plan.id, plan: plans.get(plan.id), chunk: chunks.get(plan.id) }));
      candidateBatchDepth++;
      for (const plan of candidates) { plans.set(plan.id, plan); chunks.delete(plan.id); }
      try {
        const result = fn(facade);
        if (result && typeof result.then === 'function') throw new TypeError('Ridge candidate callback returned an asynchronous result.');
        return result;
      } finally {
        for (const entry of previous) {
          if (entry.plan) plans.set(entry.id, entry.plan); else plans.delete(entry.id);
          if (entry.chunk) chunks.set(entry.id, entry.chunk); else chunks.delete(entry.id);
        }
        candidateBatchDepth--;
      }
    },
    heightForCamera(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Ocean coordinates must be finite world metres.');
      let height = Math.max(facade.floorSurface(x, z).height, facade.sample(x, z).floorY);
      const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const e of facade.chunk(cx + dx, cz + dz).elements) {
        if (e.kind === 'algae') continue;
        if (e.kind === 'bottle' || e.kind === 'driftwood') { const y = sceneElementHeight(e, x, z); if (y !== null) height = Math.max(height, y); continue; }
        const c = Math.cos(e.rotation), s = Math.sin(e.rotation), wx = x - e.x, wz = z - e.z;
        if (((wx * c - wz * s) / (e.scale.x * .5)) ** 2 + ((wx * s + wz * c) / (e.scale.z * .5)) ** 2 <= 1)
          height = Math.max(height, e.y + e.scale.y);
      }
      return height;
    },
  };
  return Object.freeze(facade);
}
