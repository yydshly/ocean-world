import { oceanShoalLifeSpeciesCatalog, oceanShoalLifeSpeciesById } from './oceanShoalLifeSpecies.js';
import { oceanRockHeight } from './oceanRockShape.js';
import { oceanBiodiversityPatchHeight } from './oceanBiodiversityShape.js';
import { recordLivingAdmission, recordLivingIngestion, recordLivingDeath, validateLivingNetworkRecord, livingNetworkBalance, LIVING_NETWORK_UNITS } from './livingEcologyNetwork.js';
import { meadowAnimalBeltMarked, validateMeadowAnimalBelt, meadowAnimalBeltSites } from './meadowAnimalBelt.js';

export const OCEAN_SHOAL_LIFE_VERSION = 1;
export const OCEAN_SHOAL_LIFE_PROFILE = 'living-shallows-v1';
export const OCEAN_SHOAL_LIFE_AGENT_LIMIT = 8;
export const OCEAN_SHOAL_LIFE_IDS = Object.freeze(oceanShoalLifeSpeciesCatalog.map(s => s.id));
export const OCEAN_SHOAL_LIFE_FOOD_SCOPE = 'each actual individual removes owner-local existing plankton or unresolved openWaterLife swimming-animal nutrition; no visible prey kill, measured biomass, new food pool or complete natural diet';
export const OCEAN_SHOAL_LIFE_MODEL = Object.freeze({ stepSec: .1, roleChance: .35, maximumPitchRad: .12,
  clearanceM: .25, peerGapM: .06, maximumEvents: 32, biteUnits: .00012, biteIntervalSec: 3.5,
  schoolSpeedMps: .18, sharkSpeedMps: .32, maximumSchoolTurnRadPerSec: .12, maximumSharkTurnRadPerSec: .35,
  schoolRangeM: 3.5, sharkRangeM: 4, conditionGainPerUnit: 8,
  scope: 'five to seven real individuals in one owner-local bounded school and optional one real shark; independent organic stocks, stable saved roster and native clock; no global collision proof, cross-owner migration, reproduction, refill or offline evolution' });
const M = OCEAN_SHOAL_LIFE_MODEL, SIZE = 64, TAU = Math.PI * 2;
const FISH = ['blue-and-gold-fusilier', 'bigeye-trevally', 'silver-stripe-herring'], SHARK = 'blacktip-reef-shark';
const TOP = ['shoalLifeVersion', 'shoalLifeInitializedAtSec', 'shoalLife'];
const INDIVIDUAL = ['shoalLifeIndividualVersion', 'shoalLifeGroupId', 'shoalLifeSlot', 'shoalLifeSiteId', 'shoalLifeFoodPool'];
const clone = v => structuredClone(v), point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0;
const close = (a, b, e = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
const boundedTurn = (from, to, limit) => from + Math.max(-limit, Math.min(limit, angle(to - from)));
const marked = a => a && Object.keys(a).some(k => k.startsWith('shoalLife'));
const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
export const isOceanShoalLifeAgent = a => OCEAN_SHOAL_LIFE_IDS.includes(a?.speciesId);
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
const randomFor = (g, r) => salt => hash(`shoal-life-v${r.meadowAnimalBeltVersion === 2 ? 2 : 1}|${typeof g.seed}:${g.seed}|${r.id}|${salt}`) / 4294967296;
function nativeGeometry(r, g) { return g?.profile === OCEAN_SHOAL_LIFE_PROFILE && typeof g.chunk === 'function' && typeof g.floorSurface === 'function' && typeof g.sample === 'function' &&
  Number.isSafeInteger(r?.cx) && Number.isSafeInteger(r?.cz) && r.id === `${r.cx},${r.cz}`; }
function nativeOwner(r, g) { return nativeGeometry(r, g) && Array.isArray(r.agents) && r.basicNetwork &&
  nonnegative(r.timeSec) && Number.isSafeInteger(r.ticks) && close(r.timeSec, r.ticks * .1); }
function sites(g, r) { const rng = randomFor(g, r), rows = [];
  if (meadowAnimalBeltMarked(r)) return meadowAnimalBeltSites(g, r);
  for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) { const id = `column:${x},${z}`;
    rows.push({ id, x: r.cx * SIZE + 10 + x * 14 + rng(`${id}:x`) * 2, z: r.cz * SIZE + 10 + z * 14 + rng(`${id}:z`) * 2 }); }
  return rows.sort((a, b) => rng(`order:${a.id}`) - rng(`order:${b.id}`) || a.id.localeCompare(b.id)); }
export function oceanShoalLifeRole(r, g) {
  if (meadowAnimalBeltMarked(r)) return Boolean(nativeGeometry(r, g) && validateMeadowAnimalBelt(r, g) &&
    sites(g, r).some(p => Number.isFinite(g.floorSurface(p.x, p.z).height) && (g.surfaceY ?? 8) - g.floorSurface(p.x, p.z).height >= 4));
  return Boolean(nativeGeometry(r, g) && randomFor(g, r)('role') < M.roleChance &&
    sites(g, r).some(p => Number.isFinite(g.floorSurface(p.x, p.z).height) && (g.surfaceY ?? 8) - g.floorSurface(p.x, p.z).height >= 4));
}
function queries(g, r, { surface, bed } = {}) {
  const rows = new Map(); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
    for (const e of g.chunk(r.cx + dx, r.cz + dz).elements) rows.set(e.id, e);
  const nearby = [...rows.values()], floor = bed ?? ((x, z) => g.floorSurface(x, z).height);
  const solid = surface ?? ((x, z, crown = true) => nearby.reduce((y, e) => {
    if (['rock', 'formation'].includes(e.kind)) return Math.max(y, oceanRockHeight(e, x, z) ?? -Infinity);
    if (crown && ['coral', 'rubble', 'seagrass'].includes(e.kind) && Math.hypot(x - e.x, z - e.z) <= Math.max(e.scale?.x ?? 0, e.scale?.z ?? 0) * .55)
      return Math.max(y, e.y + (e.scale?.y ?? 0)); return y;
  }, floor(x, z)));
  return { bed: floor, surface: (x, z) => { let y = solid(x, z, true);
    for (const p of r.biodiversity?.patches ?? []) y = Math.max(y, oceanBiodiversityPatchHeight(p, x, z) ?? -Infinity); return y; } };
}
const poolFor = id => [FISH[0], FISH[2]].includes(id) ? 'plankton' : 'openWaterLife.preyOrganicUnits';
const species = id => oceanShoalLifeSpeciesById[id];
const radius = a => species(a.speciesId).normalizedEnvelope.horizontalRadiusUnits * a.sizeM;
const wholeRadius = a => { const e = species(a.speciesId).normalizedEnvelope;
  return a.sizeM * Math.max(e.horizontalRadiusUnits, Math.hypot(...['x', 'y', 'z'].map(k => Math.max(Math.abs(e[k][0]), Math.abs(e[k][1]))))); };
function bodyOffsets(a, heading, pitch) { const e = species(a.speciesId).normalizedEnvelope, c = Math.cos(heading), s = Math.sin(heading), cp = Math.cos(pitch), sp = Math.sin(pitch), rows = [];
  for (const x of [e.x[0], 0, e.x[1]]) for (const y of [e.y[0], 0, e.y[1]]) for (const z of [e.z[0], 0, e.z[1]])
    rows.push({ x: a.sizeM * ((x * cp - y * sp) * c - z * s), y: a.sizeM * (x * sp + y * cp), z: a.sizeM * ((x * cp - y * sp) * s + z * c) });
  return rows;
}
function owned(r, p, rad = 0) { return point(p) && p.x >= r.cx * SIZE + rad + .1 && p.x <= (r.cx + 1) * SIZE - rad - .1 &&
  p.z >= r.cz * SIZE + rad + .1 && p.z <= (r.cz + 1) * SIZE - rad - .1; }
function clearPose(r, g, a, p, heading, pitch, q) {
  if (!point(p) || !Number.isFinite(a.sizeM) || !Number.isFinite(heading) || !Number.isFinite(pitch) || Math.abs(pitch) > M.maximumPitchRad) return false;
  const offsets = bodyOffsets(a, heading, pitch), rad = Math.max(radius(a), ...offsets.map(o => Math.hypot(o.x, o.z))), bounds = species(a.speciesId).depthSelectionM;
  if (!owned(r, p, rad)) return false;
  return offsets.every(o => { const x = p.x + o.x, y = p.y + o.y, z = p.z + o.z, bottom = q.bed(x, z), solid = q.surface(x, z), depth = (g.surfaceY ?? 8) - y;
    return Number.isFinite(bottom) && Number.isFinite(solid) && y >= Math.max(bottom, solid) + M.clearanceM && depth >= bounds[0] && depth <= bounds[1]; });
}
function pairClear(a, p, b, other = b.position) {
  if (!b.alive || !point(other) || a.id === b.id) return true;
  if (isOceanShoalLifeAgent(b)) return distance(p, other) >= wholeRadius(a) + wholeRadius(b) + M.peerGapM;
  const r = (b.sizeM ?? .1) * (b.speciesId === 'blue-spotted-ray' ? 2.3 : .85);
  return distance(p, other) >= wholeRadius(a) + r + M.peerGapM;
}
function occupationClear(r, a, p, proposed = new Map()) { return [...r.agents, ...(r.turtleAgents ?? [])].every(b => pairClear(a, p, b, proposed.get(b.id) ?? b.position)); }
function slotPosition(center, heading, offset) { const c = Math.cos(heading), s = Math.sin(heading);
  return { x: center.x + offset.x * c - offset.z * s, y: center.y + offset.y, z: center.z + offset.x * s + offset.z * c }; }
function selectedSize(id, slot, rng) { const [lo, hi] = species(id).sizeRangeM; return lo + rng(`${id}:${slot}:size`) * (hi - lo); }
function schoolBirth(g, r, site, id, count, rng) {
  const bounds = species(id).depthSelectionM, depth = bounds[0] + .3 + rng(`${site.id}:${id}:depth`) * Math.max(0, Math.min(2, bounds[1] - bounds[0] - .6));
  const center = { x: site.x, y: meadowAnimalBeltMarked(r) ? g.floorSurface(site.x, site.z).height + 2.2 : (g.surfaceY ?? 8) - depth, z: site.z }, heading = rng(`${site.id}:${id}:heading`) * TAU;
  const spacing = species(id).sizeRangeM[1] * 1.5 + .16, groupId = `shoal:${r.id}:${id}:${site.id}`;
  const placements = Array.from({ length: count }, (_, slot) => { const offset = { x: (Math.floor(slot / 2) - (Math.ceil(count / 2) - 1) * .5) * spacing, y: 0, z: (slot % 2 ? .5 : -.5) * spacing };
    return { id: `ocean:${r.id}:shoal-life:${id}:${slot}`, speciesId: id, siteId: site.id, groupId, slot, sizeM: selectedSize(id, slot, rng), offset,
      position: slotPosition(center, heading, offset), heading, pitch: 0, foodPool: poolFor(id) }; });
  return { groupId, speciesId: id, leaderId: placements[0].id, memberIds: placements.map(p => p.id), home: center, center: clone(center), heading, target: clone(center), nextDecision: 0, decisions: 0, activeLeaderId: placements[0].id, placements };
}
function sharkBirth(g, r, school, rng, q) { const id = SHARK, sizeM = selectedSize(id, 0, rng), bounds = species(id).depthSelectionM;
  for (let i = 0; i < 12; i++) { const h = rng(`shark:heading:${i}`) * TAU, p = { x: school.home.x + Math.cos(h) * 5, z: school.home.z + Math.sin(h) * 5,
      y: (g.surfaceY ?? 8) - (bounds[0] + 1 + rng('shark:depth') * Math.min(3, bounds[1] - bounds[0] - 2)) };
    const a = { id: `ocean:${r.id}:shoal-life:${id}:0`, speciesId: id, siteId: `shark:${i}`, groupId: null, slot: 0, sizeM, offset: { x: 0, y: 0, z: 0 }, position: p, heading: h, pitch: 0, foodPool: poolFor(id) };
    if (clearPose(r, g, a, p, h, 0, q) && occupationClear({ ...r, agents: r.agents.concat(school.placements.map(p => ({ ...p, alive: true }))) }, a, p)) return a;
  } return null;
}
export function createOceanShoalLifePlan(g, r, { role = oceanShoalLifeRole(r, g), availableSlots = 0, maxAdded = 8, surface, bed } = {}) {
  const cap = Math.min(8, Math.max(0, Math.floor(availableSlots)), Math.max(0, Math.floor(maxAdded)));
  if (!nativeOwner(r, g) || !validateMeadowAnimalBelt(r, g) || role !== true || !oceanShoalLifeRole(r, g) || cap < 5) return freeze({ version: 1, school: null, placements: [] });
  const rng = randomFor(g, r), q = queries(g, r, { surface, bed }), count = Math.min(cap, 5 + Math.floor(rng('count') * 3));
  const originalOrder = [...FISH].sort((a, b) => rng(`${a}:choice`) - rng(`${b}:choice`) || a.localeCompare(b));
  const order = meadowAnimalBeltMarked(r) && r.meadowAnimalBeltVersion !== 2 ? [FISH[0], ...originalOrder.filter(id => id !== FISH[0])] : originalOrder;
  for (const id of order) for (const site of sites(g, r)) {
    const school = schoolBirth(g, r, site, id, count, rng), additions = school.placements.map(p => ({ ...p, alive: true })), trial = { ...r, agents: r.agents.concat(additions) };
    if (!additions.every(a => clearPose(r, g, a, a.position, a.heading, a.pitch, q) && occupationClear(trial, a, a.position))) continue;
    // Inspect the native patrol disk before admission; targets are still checked
    // at actual tick time, so changed obstacles may make the group hold.
    if (![0, 1, 2, 3].every(i => additions.every(a => clearPose(r, g, a, { ...a.position, x: a.position.x + Math.cos(i * Math.PI / 2) * M.schoolRangeM,
      z: a.position.z + Math.sin(i * Math.PI / 2) * M.schoolRangeM }, a.heading, 0, q)))) continue;
    const placements = clone(school.placements); if (!meadowAnimalBeltMarked(r) && cap > count && rng('shark:present') < .7) { const shark = sharkBirth(g, r, school, rng, q); if (shark) placements.push(shark); }
    delete school.placements; return freeze({ version: 1, school, placements });
  } return freeze({ version: 1, school: null, placements: [] });
}
export function initializeOceanShoalLife(r, g, { fresh = false, role = oceanShoalLifeRole(r, g), surface, bed, capacity = 20, maxAdded = 8 } = {}) {
  if (!fresh || !nativeOwner(r, g) || !validateMeadowAnimalBelt(r, g) || r.timeSec !== 0 || typeof role !== 'boolean' || role !== oceanShoalLifeRole(r, g) || Object.keys(r).some(k => k.startsWith('shoalLife')) ||
    [...r.agents, ...(r.turtleAgents ?? [])].some(a => isOceanShoalLifeAgent(a) || marked(a)) || !validateLivingNetworkRecord(r)) return false;
  const cap = Math.min(20, Number.isSafeInteger(capacity) ? Math.max(0, capacity) : 0), occupied = r.agents.length + (r.turtleAgents?.length ?? 0);
  if (occupied > cap) return false;
  const slots = Math.min(8, cap - occupied, Number.isSafeInteger(maxAdded) ? Math.max(0, maxAdded) : 0);
  const plan = createOceanShoalLifePlan(g, r, { role, availableSlots: slots, maxAdded: slots, surface, bed }), rng = randomFor(g, r);
  const born = plan.placements.map(p => ({ id: p.id, regionId: r.id, speciesId: p.speciesId, sizeM: p.sizeM, position: clone(p.position), home: clone(p.position), refuge: clone(p.position),
    target: clone(p.position), heading: p.heading, targetHeading: p.heading, pitch: 0, velocity: { x: 0, y: 0, z: 0 }, timeSec: 0, energy: .75 + rng(`${p.id}:energy`) * .1,
    alive: true, state: 'school-cruising', stateSince: 0, nextBite: rng(`${p.id}:bite`) * 3, nextDecision: 0, decisions: 0, lastFeedAt: null, lastShoalIntake: null,
    parasites: 0, fleeUntil: 0, habitat: 'shoal-life-water-column', groupId: p.groupId, refugeHostId: null, dietProxy: OCEAN_SHOAL_LIFE_FOOD_SCOPE,
    shoalLifeIndividualVersion: 1, shoalLifeGroupId: p.groupId, shoalLifeSlot: p.slot, shoalLifeSiteId: p.siteId, shoalLifeFoodPool: p.foodPool }));
  r.agents.push(...born); const input = recordLivingAdmission(r, born);
  r.shoalLifeVersion = 1; r.shoalLifeInitializedAtSec = 0;
  r.shoalLife = { version: 1, scope: M.scope, foodScope: OCEAN_SHOAL_LIFE_FOOD_SCOPE, role, admissionSlots: slots,
    addedIds: born.map(a => a.id), birthPlacements: clone(plan.placements), school: clone(plan.school), initialInputUnits: input, ticks: 0, lastTickSec: 0,
    counters: { feedings: 0, consumedUnits: 0, deaths: 0, moved: 0, blocked: 0 }, events: [] }; return true;
}
export function oceanShoalLifePositionValid(r, g, a, position = a.position, { surface, bed, heading = a.heading, pitch = a.pitch, occupancy = false } = {}) {
  return nativeOwner(r, g) && isOceanShoalLifeAgent(a) && clearPose(r, g, a, position, heading, pitch, queries(g, r, { surface, bed })) && (!occupancy || occupationClear(r, a, position));
}
export function oceanShoalLifeBalance(r) { return r?.basicNetwork ? livingNetworkBalance(r) : NaN; }
export function oceanShoalLifeSnapshot(r) { return Object.hasOwn(r, 'shoalLifeVersion') ? Object.fromEntries(TOP.map(k => [k, clone(r[k])])) : {}; }
function setState(a, value, time) { if (a.state !== value) { a.state = value; a.stateSince = time; } }
function trajectoryValid(r, g, a, next, heading, pitch, q, proposed) {
  if (!clearPose(r, g, a, a.position, heading, pitch, q)) return false;
  for (const fraction of [.25, .5, .75, 1]) { const p = { x: a.position.x + (next.x - a.position.x) * fraction, y: a.position.y + (next.y - a.position.y) * fraction, z: a.position.z + (next.z - a.position.z) * fraction };
    const others = new Map([...proposed].map(([id, end]) => { const old = r.agents.find(b => b.id === id).position;
      return [id, { x: old.x + (end.x - old.x) * fraction, y: old.y + (end.y - old.y) * fraction, z: old.z + (end.z - old.z) * fraction }]; }));
    if (!clearPose(r, g, a, p, heading, pitch, q) || !occupationClear(r, a, p, others)) return false;
  } return true;
}
function moveSchool(r, g, q, dt, rng) {
  const d = r.shoalLife, s = d.school; if (!s) return;
  const members = s.memberIds.map(id => r.agents.find(a => a.id === id)).filter(a => a.alive);
  s.activeLeaderId = members[0]?.id ?? null; if (!members.length) return;
  if (r.timeSec >= s.nextDecision) { s.nextDecision = r.timeSec + 8; s.decisions++; }
  // A closed native patrol curve has radius speed/turn=1.5m. Its whole
  // centre trajectory remains within 3m of the actual birth point, instead
  // of driving against an owner-range boundary and holding there forever.
  // Every member still owns a real independent position, velocity and stock.
  const sign = rng('school:curve-sign') < .5 ? -1 : 1, heading = s.heading + sign * M.maximumSchoolTurnRadPerSec * dt;
  const midHeading = (s.heading + heading) * .5;
  const center = { x: s.center.x + Math.cos(midHeading) * M.schoolSpeedMps * dt, y: s.center.y, z: s.center.z + Math.sin(midHeading) * M.schoolSpeedMps * dt };
  const proposed = new Map(members.map(a => [a.id, slotPosition(center, heading, d.birthPlacements.find(p => p.id === a.id).offset)]));
  const poses = members.map(a => { const p = proposed.get(a.id), dx = p.x - a.position.x, dz = p.z - a.position.z;
    return { a, p, heading: Math.atan2(dz, dx), pitch: 0 }; });
  const valid = distance(center, s.home) <= M.schoolRangeM && poses.every(({ a, p, heading: h, pitch }) => distance(a.position, p) <= (M.schoolSpeedMps + .21) * dt + 1e-8 && trajectoryValid(r, g, a, p, h, pitch, q, proposed));
  if (!valid) { d.counters.blocked++; members.forEach(a => { a.velocity = { x: 0, y: 0, z: 0 }; setState(a, 'school-holding', r.timeSec); }); return; }
  s.center = center; s.heading = heading; s.target = clone(center);
  for (const { a, p, heading: h } of poses) { a.velocity = { x: (p.x - a.position.x) / dt, y: 0, z: (p.z - a.position.z) / dt }; a.position = p; a.heading = h; a.pitch = 0;
    a.target = clone(p); a.targetHeading = h; setState(a, 'school-cruising', r.timeSec); d.counters.moved++; }
}
function moveShark(r, g, a, q, dt, rng) {
  if (r.timeSec >= a.nextDecision || distance(a.position, a.target) < .2) { const key = `${a.id}:decision:${a.decisions++}`; a.nextDecision = r.timeSec + 7;
    for (let i = 0; i < 8; i++) { const h = rng(`${key}:${i}:h`) * TAU, reach = rng(`${key}:${i}:r`) * 3,
      p = { x: a.home.x + Math.cos(h) * reach, y: a.home.y, z: a.home.z + Math.sin(h) * reach };
      if (clearPose(r, g, a, p, h, 0, q) && occupationClear(r, a, p)) { a.target = p; break; } }
  }
  a.targetHeading = Math.atan2(a.target.z - a.position.z, a.target.x - a.position.x);
  const h = boundedTurn(a.heading, a.targetHeading, M.maximumSharkTurnRadPerSec * dt), p = { x: a.position.x + Math.cos(h) * M.sharkSpeedMps * dt, y: a.position.y, z: a.position.z + Math.sin(h) * M.sharkSpeedMps * dt };
  if (distance(p, a.home) <= M.sharkRangeM && trajectoryValid(r, g, a, p, h, 0, q, new Map())) { a.velocity = { x: (p.x - a.position.x) / dt, y: 0, z: (p.z - a.position.z) / dt }; a.position = p; a.heading = h; a.pitch = 0;
    r.shoalLife.counters.moved++; setState(a, 'shark-cruising', r.timeSec);
  } else { a.velocity = { x: 0, y: 0, z: 0 }; a.target = clone(a.home);
    // A blocked visitor may turn its body at its actual position before
    // resuming toward home, with both the half-turn and final pose checked.
    if (clearPose(r, g, a, a.position, (a.heading + h) * .5, 0, q) && clearPose(r, g, a, a.position, h, 0, q)) a.heading = h;
    r.shoalLife.counters.blocked++; setState(a, 'school-holding', r.timeSec); }
}
function takeFood(r, a) { const pool = a.shoalLifeFoodPool;
  const stockBefore = pool === 'plankton' ? r.resources.plankton : r.openWaterLifeVersion === 1 ? r.openWaterLife?.preyOrganicUnits : 0;
  if (!nonnegative(stockBefore)) return 0;
  const taken = Math.min(stockBefore, M.biteUnits); if (!(taken > 0)) return 0;
  const stockAfter = stockBefore - taken;
  if (pool === 'plankton') { r.resources.plankton = stockAfter; r.ledger.ingested += taken; } else r.openWaterLife.preyOrganicUnits = stockAfter;
  recordLivingIngestion(r, a, taken); a.energy = Math.min(1, a.energy + taken * M.conditionGainPerUnit); a.lastFeedAt = r.timeSec;
  a.lastShoalIntake = { timeSec: r.timeSec, pool, stockBefore, stockAfter, removedUnits: taken, ownerId: r.id, unit: LIVING_NETWORK_UNITS, agentPosition: clone(a.position), scope: OCEAN_SHOAL_LIFE_FOOD_SCOPE };
  r.counters.feeding++; const d = r.shoalLife; d.counters.feedings++; d.counters.consumedUnits += taken;
  d.events.push({ timeSec: r.timeSec, agentId: a.id, pool, removedUnits: taken, scope: OCEAN_SHOAL_LIFE_FOOD_SCOPE });
  if (d.events.length > M.maximumEvents) d.events.splice(0, d.events.length - M.maximumEvents); return taken;
}
export function tickOceanShoalLife(r, g, dt, { surface, bed, environmentAt } = {}) {
  const d = r?.shoalLife;
  if (!nativeOwner(r, g) || !close(dt, .1, 1e-10) || !d || r.ticks !== d.ticks + 1 || !close(r.timeSec - d.lastTickSec, .1) ||
    !validateOceanShoalLifeRecord(r, g, { surface, bed, beforeTick: true })) return false;
  const q = queries(g, r, { surface, bed }), rng = randomFor(g, r), agents = r.agents.filter(isOceanShoalLifeAgent);
  for (const a of agents) { if (!a.alive) continue; a.timeSec = r.timeSec;
    // Respiration is already owned by tickLivingNetwork. This condition proxy
    // is independent of organic respiration and never creates an organic pool.
    a.energy = Math.max(0, a.energy - dt * .00008);
    if (a.energy <= 0) { a.alive = false; a.velocity = { x: 0, y: 0, z: 0 }; setState(a, 'dead', a.timeSec); recordLivingDeath(r, a); r.counters.deaths++; d.counters.deaths++; }
  }
  moveSchool(r, g, q, dt, rng);
  for (const a of agents) { if (!a.alive) continue; if (a.speciesId === SHARK) moveShark(r, g, a, q, dt, rng);
    // The environment callback supplies the actual owner's current context;
    // no environmental cue is converted into a new food stock.
    environmentAt?.(a.position, a);
    if (r.timeSec >= a.nextBite) { a.nextBite = r.timeSec + M.biteIntervalSec; setState(a, takeFood(r, a) > 0 ? 'shoal-proxy-feeding' : 'searching', r.timeSec); }
  }
  d.ticks = r.ticks; d.lastTickSec = r.timeSec; return true;
}
function receiptValid(r, a) { const e = a.lastShoalIntake;
  return e && nonnegative(e.timeSec) && e.timeSec <= a.timeSec && close(e.timeSec, a.lastFeedAt) && e.pool === a.shoalLifeFoodPool && nonnegative(e.stockBefore) && nonnegative(e.stockAfter) &&
    e.removedUnits > 0 && e.removedUnits <= M.biteUnits && close(e.stockBefore - e.stockAfter, e.removedUnits, Number.EPSILON * 8 * Math.max(e.stockBefore, e.stockAfter, e.removedUnits)) &&
    e.ownerId === r.id && e.unit === LIVING_NETWORK_UNITS && e.scope === OCEAN_SHOAL_LIFE_FOOD_SCOPE && owned(r, e.agentPosition, radius(a)) &&
    distance(e.agentPosition, a.home) <= (a.speciesId === SHARK ? M.sharkRangeM : M.schoolRangeM + 3) + 1e-8;
}
export function validateOceanShoalLifeRecord(r, g, options = {}) {
  try { return recordValid(r, g, options); } catch { return false; }
}
function recordValid(r, g, { surface, bed, capacity = 20, beforeTick = false } = {}) {
  if (!nativeOwner(r, g) || !validateMeadowAnimalBelt(r, g)) return false;
  const agents = r.agents.filter(isOceanShoalLifeAgent), keys = Object.keys(r).filter(k => k.startsWith('shoalLife'));
  const has = keys.length || agents.length || [...r.agents, ...(r.turtleAgents ?? [])].some(marked) || (r.turtleAgents ?? []).some(isOceanShoalLifeAgent);
  if (!has) return true;
  const d = r.shoalLife;
  if (r.shoalLifeVersion !== 1 || r.shoalLifeInitializedAtSec !== 0 || !d || d.version !== 1 || d.scope !== M.scope || d.foodScope !== OCEAN_SHOAL_LIFE_FOOD_SCOPE ||
    keys.some(k => !TOP.includes(k)) || Object.keys(d).some(k => k.startsWith('shoalLife')) || typeof d.role !== 'boolean' || d.role !== oceanShoalLifeRole(r, g) || !Number.isSafeInteger(d.admissionSlots) || d.admissionSlots < 0 || d.admissionSlots > 8 ||
    !Number.isSafeInteger(d.ticks) || d.ticks < 0 || !close(d.lastTickSec, d.ticks * .1) || r.ticks !== d.ticks + (beforeTick ? 1 : 0) || !close(r.timeSec - d.lastTickSec, beforeTick ? .1 : 0) ||
    !Array.isArray(d.addedIds) || !Array.isArray(d.birthPlacements) || d.addedIds.length !== agents.length || d.birthPlacements.length !== agents.length || new Set(d.addedIds).size !== agents.length ||
    new Set(d.birthPlacements.map(p => p.id)).size !== agents.length || agents.length > 8 || agents.length > d.admissionSlots || r.agents.length + (r.turtleAgents?.length ?? 0) > Math.min(20, capacity) ||
    !close(d.initialInputUnits, agents.length * .004) || !['feedings', 'deaths', 'moved', 'blocked'].every(k => Number.isSafeInteger(d.counters?.[k]) && d.counters[k] >= 0) || !nonnegative(d.counters?.consumedUnits) ||
    !Array.isArray(d.events) || d.events.length > 32 || !validateLivingNetworkRecord(r) || r.agents.some(a => marked(a) && !isOceanShoalLifeAgent(a)) ||
    (r.turtleAgents ?? []).some(a => marked(a) || isOceanShoalLifeAgent(a))) return false;
  if (!agents.length) return d.school === null && d.addedIds.length === 0 && d.birthPlacements.length === 0 && d.initialInputUnits === 0 && d.events.length === 0 &&
    Object.values(d.counters).every(v => v === 0);
  const q = queries(g, r, { surface, bed }), rng = randomFor(g, r), s = d.school, schoolAgents = agents.filter(a => a.speciesId !== SHARK), sharks = agents.filter(a => a.speciesId === SHARK);
  if (!d.role || !s || !FISH.includes(s.speciesId) || schoolAgents.length < 5 || schoolAgents.length > 7 || sharks.length > 1 || schoolAgents.some(a => a.speciesId !== s.speciesId) ||
    !Array.isArray(s.memberIds) || s.memberIds.length !== schoolAgents.length || new Set(s.memberIds).size !== schoolAgents.length || s.memberIds.some(id => !schoolAgents.some(a => a.id === id)) ||
    s.leaderId !== s.memberIds[0] || s.activeLeaderId !== (s.memberIds.find(id => schoolAgents.find(a => a.id === id).alive) ?? null) ||
    ![s.home, s.center, s.target].every(point) || !Number.isFinite(s.heading) || distance(s.home, s.center) > M.schoolRangeM + 1e-8 || distance(s.home, s.target) > M.schoolRangeM + 1e-8 ||
    !nonnegative(s.nextDecision) || !Number.isSafeInteger(s.decisions) || s.decisions < 0) return false;
  const first = d.birthPlacements.find(b => b.id === s.memberIds[0]), site = sites(g, r).find(p => p.id === first?.siteId);
  if (!site) return false;
  const expected = schoolBirth(g, r, site, s.speciesId, schoolAgents.length, rng);
  if (s.groupId !== expected.groupId || distance(s.home, expected.home) > 1e-10 || s.memberIds.some((id, i) => id !== expected.memberIds[i]) ||
    schoolAgents.length !== Math.min(d.admissionSlots, 5 + Math.floor(rng('count') * 3))) return false;
  if (!d.events.every(e => d.addedIds.includes(e.agentId) && nonnegative(e.timeSec) && e.timeSec <= d.lastTickSec && e.removedUnits > 0 && e.removedUnits <= M.biteUnits &&
    e.pool === poolFor(agents.find(a => a.id === e.agentId).speciesId) && e.scope === OCEAN_SHOAL_LIFE_FOOD_SCOPE)) return false;
  return agents.every(a => {
    const b = d.birthPlacements.find(p => p.id === a.id), canonical = a.speciesId === SHARK ? (() => { const index = Number(b?.siteId?.split(':')[1]); if (!Number.isSafeInteger(index) || index < 0 || index >= 12) return null;
      const h = rng(`shark:heading:${index}`) * TAU, bounds = species(SHARK).depthSelectionM;
      if (b.siteId !== `shark:${index}` || b.slot !== 0) return null;
      return { ...b, offset: { x: 0, y: 0, z: 0 }, sizeM: selectedSize(SHARK, 0, rng), heading: h, pitch: 0, position: { x: s.home.x + Math.cos(h) * 5, z: s.home.z + Math.sin(h) * 5,
        y: (g.surfaceY ?? 8) - (bounds[0] + 1 + rng('shark:depth') * Math.min(3, bounds[1] - bounds[0] - 2)) } }; })() : expected.placements[a.shoalLifeSlot];
    if (!b || !canonical || !d.addedIds.includes(a.id) || a.id !== `ocean:${r.id}:shoal-life:${a.speciesId}:${a.speciesId === SHARK ? 0 : a.shoalLifeSlot}` || a.regionId !== r.id || b.speciesId !== a.speciesId ||
      a.shoalLifeIndividualVersion !== 1 || a.shoalLifeGroupId !== b.groupId || a.groupId !== b.groupId || b.groupId !== (a.speciesId === SHARK ? null : s.groupId) || a.shoalLifeSlot !== b.slot ||
      a.shoalLifeSiteId !== b.siteId || a.shoalLifeFoodPool !== poolFor(a.speciesId) || b.foodPool !== a.shoalLifeFoodPool || Object.keys(a).some(k => k.startsWith('shoalLife') && !INDIVIDUAL.includes(k)) ||
      !close(a.sizeM, canonical.sizeM, 1e-12) || a.sizeM !== b.sizeM || distance(b.position, canonical.position) > 1e-10 || !close(b.heading, canonical.heading, 1e-12) || b.pitch !== 0 ||
      !point(b.offset) || distance(b.offset, canonical.offset) > 1e-10 || ![a.position, a.home, a.refuge, a.target, a.velocity].every(point) || distance(a.home, b.position) > 1e-10 || distance(a.refuge, b.position) > 1e-10 ||
      ![a.heading, a.targetHeading, a.pitch].every(Number.isFinite) || Math.abs(a.pitch) > M.maximumPitchRad || typeof a.alive !== 'boolean' || !nonnegative(a.energy) || a.energy > 1 ||
      !nonnegative(a.timeSec) || a.timeSec > d.lastTickSec + 1e-8 || (a.alive && !close(a.timeSec, d.lastTickSec)) || !close(a.timeSec, Math.round(a.timeSec * 10) * .1) ||
      !['school-cruising', 'shark-cruising', 'school-holding', 'shoal-proxy-feeding', 'searching', 'dead'].includes(a.state) || (a.alive && a.state === 'dead') ||
      !nonnegative(a.nextBite) || !nonnegative(a.nextDecision) || !Number.isSafeInteger(a.decisions) || a.decisions < 0 || !nonnegative(a.stateSince) || a.stateSince > a.timeSec + 1e-8 ||
      !nonnegative(a.organicUnits) || typeof a.organicDeathRecorded !== 'boolean' || a.dietProxy !== OCEAN_SHOAL_LIFE_FOOD_SCOPE ||
      Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > (a.speciesId === SHARK ? M.sharkSpeedMps : M.schoolSpeedMps + .21) + 1e-8 ||
      (a.lastFeedAt !== null && (!nonnegative(a.lastFeedAt) || a.lastFeedAt > a.timeSec)) || (a.lastShoalIntake === null ? a.lastFeedAt !== null : !receiptValid(r, a)) ||
      (a.alive ? a.organicDeathRecorded : !a.organicDeathRecorded || a.organicUnits !== 0 || a.state !== 'dead' || !close(a.stateSince, a.timeSec) || Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) !== 0)) return false;
    if (a.speciesId !== SHARK && a.alive && distance(a.position, slotPosition(s.center, s.heading, b.offset)) > 1e-8) return false;
    if (a.speciesId === SHARK && (distance(a.position, a.home) > M.sharkRangeM + 1e-8 || distance(a.target, a.home) > M.sharkRangeM + 1e-8)) return false;
    return clearPose(r, g, a, a.position, a.heading, a.pitch, q) && clearPose(r, g, a, b.position, b.heading, 0, q) &&
      (!a.alive || agents.every(other => pairClear(a, a.position, other))) && clearPose(r, g, a, a.target, a.targetHeading, 0, q);
  });
}
