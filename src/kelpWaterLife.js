import { kelpWaterLifeSpeciesById } from './kelpWaterLifeSpecies.js';
import { kelpStipePosition, kelpLeafFraction, kelpLeafPosition, kelpLeafWidth } from './kelpHabitat.js';
import { kelpWaterElements } from './kelpWaterCommunity.js';

export const KELP_WATER_LIFE_VERSION = 1;
export const KELP_WATER_LIFE_IDS = Object.freeze(['pacific-jack-mackerel', 'california-market-squid', 'pacific-sea-nettle', 'opaleye']);
export const KELP_WATER_LIFE_FOOD_SCOPE = 'Actual owner-local simulated-host smallPrey point for jack mackerel, squid and sea nettle; actual rock-patch algae point for opaleye. Selected incomplete nutrition proxies, not ambient plankton, rendered prey capture, measured biomass or complete natural diets. No added food inventory.';
export const KELP_WATER_LIFE_MODEL = Object.freeze({ maximumPitchRad: .12, maximumTurnRadSec: .65, maximumPitchTurnRadSec: .20,
  contactDistanceM: .20, biteAmount: .00018, biteIntervalSec: 7, energyGainPerUnit: 1.4, ownerMarginM: 1,
  clearanceM: .012, predictionSec: .4, homeExtentM: 4.5, minimumSchoolSize: 4, maximumSchoolSize: 5, maximumAdded: 7,
  traits: Object.freeze({
    'pacific-jack-mackerel': Object.freeze({ speedMps: .15, pool: 'smallPrey', feedingPointLocal: Object.freeze({ x: .5, y: 0, z: 0 }) }),
    'california-market-squid': Object.freeze({ speedMps: .10, pool: 'smallPrey', feedingPointLocal: Object.freeze({ x: 1.5, y: .025, z: 0 }) }),
    'pacific-sea-nettle': Object.freeze({ speedMps: .025, pool: 'smallPrey', feedingPointLocal: Object.freeze({ x: .47, y: -7.5, z: 0 }) }),
    opaleye: Object.freeze({ speedMps: .08, pool: 'algae', feedingPointLocal: Object.freeze({ x: .5, y: 0, z: 0 }) }),
  }),
  note: 'Sparse independent real individuals, not field density. Uncalibrated speed, turn, intake and relative condition. Finite whole-envelope native bed/surface probes, actual four-frond stipe and blade references at current and predicted local clocks; unloaded neighbouring plants use a conservative crown envelope. Checked new-body turns, midpoints and peer boxes do not establish global collision safety for legacy controllers. No recruitment, migration, offline evolution or population refill.',
});
const MODEL = KELP_WATER_LIFE_MODEL, SIZE = 64, TAU = Math.PI * 2, SALT = 'kelp-water-life-v1';
const FIELDS = ['kelpWaterLifeVersion', 'kelpWaterLifeInitializedAtSec', 'kelpWaterLife', 'kelpWaterLifeAgents'];
const AGENT_FIELDS = ['kelpWaterLifeIndividualVersion', 'kelpWaterLifeSiteId', 'kelpWaterLifeFoodPatchId', 'kelpWaterLifeHostId'];
const clone = x => structuredClone(x), vector = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const nonnegative = n => Number.isFinite(n) && n >= 0, close = (a, b, e = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const plus = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
const prefixed = x => x && Object.keys(x).some(k => k.startsWith('kelpWaterLife'));
export const isKelpWaterLifeAgent = a => KELP_WATER_LIFE_IDS.includes(a?.speciesId);
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
const randomFor = (g, r) => salt => hash(`${SALT}|${typeof g.seed}:${g.seed}|${r.id}|${salt}`) / 4294967296;
const geometryOwner = (g, r) => g?.supportVersion === 2 && typeof g.chunk === 'function' && typeof g.heightAt === 'function' &&
  Number.isFinite(g.surfaceY) && Number.isSafeInteger(r?.cx) && Number.isSafeInteger(r?.cz) && r.id === `${r.cx},${r.cz}`;
const nativeOwner = (g, r) => geometryOwner(g, r) && r.sim && Array.isArray(r.sim.agents) && Array.isArray(r.sim.preyPatches) && Array.isArray(r.sim.rockPatches) &&
  typeof r.sim._preyPosition === 'function' && typeof r.sim._remove === 'function' && Number.isSafeInteger(r.sim._ticks) && close(r.sim._ticks * .1, r.sim.timeSec);
const oldResidents = r => [...(r.sim?.agents ?? []).filter(a => a.speciesId !== 'giant-kelp'), ...(r.waterAgents ?? []), ...(r.visitorAgents ?? []), ...(r.kelpBenthicAgents ?? [])];
function hostCandidates(g, cx, cz) {
  const inside = e => Math.hypot(e.x, e.z) > 41 && e.x > cx * SIZE + 3 && e.x < (cx + 1) * SIZE - 3 && e.z > cz * SIZE + 3 && e.z < (cz + 1) * SIZE - 3;
  const elements = g.chunk(cx, cz).elements, rocks = elements.filter(e => e.kind === 'rock' && inside(e));
  return elements.filter(e => e.kind === 'kelp' && inside(e) && vector(e.anchor) && Number.isFinite(e.anchor.lengthM) &&
    rocks.some(rock => rock.id === e.hostId) && e.anchor.lengthM > 4);
}
/** Pure pre-budget role: no clock, food, network or population dependency. */
export function kelpWaterLifeRole(generator, cx, cz) {
  const r = { id: `${cx},${cz}`, cx, cz };
  return Boolean(geometryOwner(generator, r) && hostCandidates(generator, cx, cz).length >= 2 && randomFor(generator, r)('role') < .35);
}
function frame(heading, pitch) {
  const c = Math.cos(heading), s = Math.sin(heading), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return { forward: { x: c * cp, y: sp, z: s * cp }, up: { x: -c * sp, y: cp, z: -s * sp }, side: { x: -s, y: 0, z: c } };
}
const offset = (f, p, size) => Object.fromEntries(['x', 'y', 'z'].map(k => [k, size * (f.forward[k] * p.x + f.up[k] * p.y + f.side[k] * p.z)]));
const localPoint = (f, root, p, size) => ({ x: ((p.x - root.x) * f.forward.x + (p.y - root.y) * f.forward.y + (p.z - root.z) * f.forward.z) / size,
  y: ((p.x - root.x) * f.up.x + (p.y - root.y) * f.up.y + (p.z - root.z) * f.up.z) / size,
  z: ((p.x - root.x) * f.side.x + (p.y - root.y) * f.side.y + (p.z - root.z) * f.side.z) / size });
function envelope(id) { return kelpWaterLifeSpeciesById[id]?.normalizedEnvelope; }
function probes(agent, root, heading, pitch) {
  const e = envelope(agent.speciesId), f = frame(heading, pitch), points = [];
  for (const x of [e.x[0], (e.x[0] + e.x[1]) / 2, e.x[1]]) for (const y of [e.y[0], (e.y[0] + e.y[1]) / 2, e.y[1]])
    for (const z of [e.z[0], (e.z[0] + e.z[1]) / 2, e.z[1]]) points.push(plus(root, offset(f, { x, y, z }, agent.sizeM)));
  return points;
}
export function kelpWaterLifeFeedingPosition(agent, root = agent.position, heading = agent.heading, pitch = agent.pitch) {
  return plus(root, offset(frame(heading, pitch), MODEL.traits[agent.speciesId].feedingPointLocal, agent.sizeM));
}
function segmentHitsBox(a, b, e, padding) {
  let lo = 0, hi = 1;
  for (const axis of ['x', 'y', 'z']) {
    const min = e[axis][0] - padding, max = e[axis][1] + padding, d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-12) { if (a[axis] < min || a[axis] > max) return false; continue; }
    let start = (min - a[axis]) / d, end = (max - a[axis]) / d;
    if (start > end) [start, end] = [end, start]; lo = Math.max(lo, start); hi = Math.min(hi, end); if (lo > hi) return false;
  }
  return true;
}
function predictedEnvironment(sim, dt) {
  const env = { ...sim.environment }, current = env.deformationCurrentMps ?? env.currentMps ?? .18;
  env.deformationCurrentMps = (env.currentMps ?? .18) + (current - (env.currentMps ?? .18)) * Math.exp(-dt / 4); return env;
}
function plantsClear(g, r, a, root, heading, pitch, timeSec, env, elements) {
  const e = envelope(a.speciesId), f = frame(heading, pitch), points = probes(a, root, heading, pitch), low = Math.min(...points.map(p => p.y)), high = Math.max(...points.map(p => p.y));
  const radius = Math.max(...points.map(p => Math.hypot(p.x - root.x, p.z - root.z)));
  for (const p of r.understoryPlants ?? []) {
    if (high < p.y - MODEL.clearanceM || low > p.y + p.heightM + MODEL.clearanceM) continue;
    if (Math.hypot(root.x - p.x, root.z - p.z) <= radius + p.radiusM + MODEL.clearanceM) return false;
  }
  for (const element of elements) {
    const plant = r.sim.agents.find(p => p.speciesId === 'giant-kelp' && p.sceneryId === element.id), anchor = plant ? r.sim.getKelpAnchor(plant.id) : element.anchor;
    if (!anchor || high < anchor.y - .04 || low > anchor.y + anchor.lengthM + .8) continue;
    const horizontal = Math.hypot(root.x - anchor.x, root.z - anchor.z);
    if (!plant) { if (horizontal < 3.8 + radius + MODEL.clearanceM) return false; continue; }
    if (horizontal > 4.8 + radius) continue;
    if (high > anchor.y + anchor.lengthM * .7 && horizontal < 3.8 + radius + MODEL.clearanceM) return false;
    for (let frond = 0; frond < 4; frond++) {
      const length = anchor.lengthM * [1, .982, .96, .94][frond], min = Math.max(0, (low - anchor.y - .12) / length), max = Math.min(1, (high - anchor.y + .12) / length);
      let last = kelpStipePosition(anchor, min, timeSec, env, frond);
      for (let i = 1; i <= 8; i++) {
        const next = kelpStipePosition(anchor, min + (max - min) * i / 8, timeSec, env, frond);
        if (segmentHitsBox(localPoint(f, root, last, a.sizeM), localPoint(f, root, next, a.sizeM), e, (.008 + MODEL.clearanceM) / a.sizeM)) return false;
        last = next;
      }
      // Finite native blade centreline segments plus the full width allowance;
      // this is conservative around the actual renderer's blade references.
      for (let leaf = 0; leaf < 54; leaf++) {
        const stem = kelpStipePosition(anchor, kelpLeafFraction(leaf, anchor, frond), timeSec, env, frond);
        if (stem.y < low - .15 || stem.y > high + .8) continue;
        last = kelpLeafPosition(anchor, leaf, 0, timeSec, env, frond);
        for (let i = 1; i <= 4; i++) {
          const next = kelpLeafPosition(anchor, leaf, i / 4, timeSec, env, frond);
          if (segmentHitsBox(localPoint(f, root, last, a.sizeM), localPoint(f, root, next, a.sizeM), e, (kelpLeafWidth(leaf) / 2 + MODEL.clearanceM) / a.sizeM)) return false;
          last = next;
        }
      }
    }
  }
  return true;
}
function bodyBounds(a, root = a.position, heading = a.heading, pitch = a.pitch) {
  const points = probes(a, root, heading, pitch); return Object.fromEntries(['x', 'y', 'z'].map(k => [k, [Math.min(...points.map(p => p[k])), Math.max(...points.map(p => p[k]))]]));
}
function peersClear(r, a, root, heading, pitch, extra = []) {
  const box = bodyBounds(a, root, heading, pitch);
  for (const b of [...oldResidents(r), ...(r.kelpWaterLifeAgents ?? []), ...extra]) {
    if (b.id === a.id || !b.alive || !vector(b.position)) continue;
    const other = isKelpWaterLifeAgent(b) ? bodyBounds(b) : Object.fromEntries(['x', 'y', 'z'].map(k => [k, [b.position[k] - (b.sizeM ?? .2) * .6, b.position[k] + (b.sizeM ?? .2) * .6]]));
    if (['x', 'y', 'z'].every(k => box[k][0] < other[k][1] + .025 && box[k][1] > other[k][0] - .025)) return false;
  }
  return true;
}
/** Complete pitched envelope, including squid clubs and hanging nettle arms. */
export function kelpWaterLifePositionValid(generator, region, agent, position = agent.position, heading = agent.heading, pitch = agent.pitch,
  { occupancy = false, future = true, checkPlants = true, elements = null, extra = [] } = {}) {
  if (!nativeOwner(generator, region) || !isKelpWaterLifeAgent(agent) || !vector(position) || !Number.isFinite(heading) || !Number.isFinite(pitch) ||
      Math.abs(pitch) > MODEL.maximumPitchRad + 1e-10 || (agent.speciesId === 'pacific-sea-nettle' && pitch !== 0) || !(agent.sizeM > 0)) return false;
  const range = kelpWaterLifeSpeciesById[agent.speciesId].depthSelectionM;
  for (const p of probes(agent, position, heading, pitch)) {
    const depth = generator.surfaceY - p.y;
    if (depth < range[0] - 1e-8 || depth > range[1] + 1e-8 || p.x < region.cx * SIZE + MODEL.ownerMarginM || p.x > (region.cx + 1) * SIZE - MODEL.ownerMarginM ||
        p.z < region.cz * SIZE + MODEL.ownerMarginM || p.z > (region.cz + 1) * SIZE - MODEL.ownerMarginM || Math.hypot(p.x, p.z) <= 42 ||
        p.y < generator.heightAt(p.x, p.z) + MODEL.clearanceM) return false;
  }
  const plants = elements ?? kelpWaterElements(generator, region.cx, region.cz);
  for (const dt of checkPlants ? future ? [0, .1, .2, MODEL.predictionSec] : [0] : [])
    if (!plantsClear(generator, region, agent, position, heading, pitch, region.sim.timeSec + dt, predictedEnvironment(region.sim, dt), plants)) return false;
  return !occupancy || peersClear(region, agent, position, heading, pitch, extra);
}
function foodPatch(r, a) { return (a.nutritionPool === 'algae' ? r.sim.rockPatches : r.sim.preyPatches).find(p => p.id === a.kelpWaterLifeFoodPatchId); }
const patchPosition = (r, p, pool) => pool === 'algae' ? p.position : r.sim._preyPosition(p);
function feedingPose(g, r, a, patch, heading, elements, occupancy = true, extra = []) {
  const food = patchPosition(r, patch, a.nutritionPool), pitch = a.speciesId === 'opaleye' ? -.12 : 0;
  const foodOffset = offset(frame(heading, pitch), MODEL.traits[a.speciesId].feedingPointLocal, a.sizeM);
  for (const gap of a.nutritionPool === 'algae' ? [.11, .14, .17] : [.15, .09, .02]) {
    const root = { x: food.x - foodOffset.x, y: food.y - foodOffset.y + (a.nutritionPool === 'algae' ? gap : 0), z: food.z - foodOffset.z };
    if (a.nutritionPool !== 'algae') { root.x -= Math.cos(heading) * gap; root.z -= Math.sin(heading) * gap; }
    if (kelpWaterLifePositionValid(g, r, a, root, heading, pitch, { elements, occupancy, extra })) return { position: root, heading, pitch };
  }
  return null;
}
function sizeFor(g, r, id) { const [lo, hi] = kelpWaterLifeSpeciesById[id].sizeRangeM; return lo + randomFor(g, r)(`${id}:size`) * (hi - lo); }
function seedAgent(g, r, speciesId, slot, patch) {
  return { id: `kelp-water-life:${r.id}:${speciesId}:${slot}`, speciesId, sizeM: sizeFor(g, r, speciesId), alive: true, pitch: 0, heading: 0,
    nutritionPool: MODEL.traits[speciesId].pool, kelpWaterLifeFoodPatchId: patch.id, kelpWaterLifeHostId: patch.hostId ?? null };
}
/** A minimum four-member independent school; singletons use remaining slots.
 * Suitable food supports can stay empty; no landscape or stock is generated. */
export function createKelpWaterLifePlan(generator, region, { availableSlots = 0, maxAdded = 7, role = kelpWaterLifeRole(generator, region?.cx, region?.cz) } = {}) {
  const empty = { version: 1, role: Boolean(role), placements: [], groups: [] };
  if (!nativeOwner(generator, region) || !role) return freeze(empty);
  const slots = Math.min(7, Math.max(0, Math.floor(availableSlots)), Math.max(0, Math.floor(maxAdded)));
  if (slots < 4) return freeze(empty);
  const random = randomFor(generator, region), elements = kelpWaterElements(generator, region.cx, region.cz), placements = [], groups = [];
  const patches = region.sim.preyPatches.slice().sort((a, b) => random(`host:${a.id}`) - random(`host:${b.id}`));
  for (const patch of patches) {
    const food = patchPosition(region, patch, 'smallPrey'), phase = random(`phase:${patch.id}`) * TAU, candidates = [];
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = phase + attempt * TAU / 16, home = { x: food.x + Math.cos(angle) * 2.5, y: food.y + .20, z: food.z + Math.sin(angle) * 2.5 };
      candidates.length = 0;
      for (let slot = 0; slot < 4; slot++) {
        const a = seedAgent(generator, region, KELP_WATER_LIFE_IDS[0], slot, patch), around = angle + slot * TAU / 4;
        a.position = { x: home.x + Math.cos(around) * .42, y: home.y + (slot % 2) * .06, z: home.z + Math.sin(around) * .42 }; a.heading = around + Math.PI / 2;
        if (!kelpWaterLifePositionValid(generator, region, a, a.position, a.heading, 0, { elements, occupancy: true, extra: candidates })) break;
        candidates.push(a);
      }
      if (candidates.length !== 4) continue;
      // One real leader can already inspect the actual host point; the three
      // other real fish occupy the nearby open-water formation. This admits
      // contact, never intake or extra stock, at birth.
      const leaderPose = feedingPose(generator, region, candidates[0], patch, angle + Math.PI, elements, true, candidates.slice(1));
      if (leaderPose && distance(home, leaderPose.position) <= MODEL.homeExtentM) Object.assign(candidates[0], leaderPose);
      const groupId = `kelp-water-life-school:${region.id}:${patch.id}`;
      candidates.forEach((a, slot) => placements.push({ ...a, siteId: `${patch.id}:school:${attempt}:${slot}`, groupId, schoolSlot: slot, schoolHome: clone(home), home: clone(a.position), habitat: 'native-kelp-water-column' }));
      groups.push({ id: groupId, speciesId: KELP_WATER_LIFE_IDS[0], leaderId: candidates[0].id, memberIds: candidates.map(a => a.id), foodPatchId: patch.id, home: clone(home) });
      break;
    }
    if (placements.length) break;
  }
  if (!placements.length) return freeze(empty);
  for (const speciesId of KELP_WATER_LIFE_IDS.slice(1)) {
    if (placements.length >= slots) break;
    const pool = MODEL.traits[speciesId].pool, foods = pool === 'algae' ? region.sim.rockPatches : patches;
    let done = false;
    for (const patch of foods) {
      const a = seedAgent(generator, region, speciesId, 0, patch), phase = random(`${speciesId}:${patch.id}:phase`) * TAU;
      for (let attempt = 0; attempt < 16; attempt++) {
        const heading = phase + attempt * TAU / 16, pose = feedingPose(generator, region, a, patch, heading, elements, true, placements);
        if (!pose) continue;
        placements.push({ ...a, ...pose, siteId: `${patch.id}:feeding:${attempt}`, groupId: null, schoolSlot: null, schoolHome: null, home: clone(pose.position), habitat: 'native-kelp-water-column' });
        done = true; break;
      }
      if (done) break;
    }
  }
  // Four is the selected minimum; a fifth uses a genuine spare record only.
  if (placements.length < slots && random('fifth-member') < .5) {
    const group = groups[0], patch = region.sim.preyPatches.find(p => p.id === group.foodPatchId), a = seedAgent(generator, region, KELP_WATER_LIFE_IDS[0], 4, patch);
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = attempt * TAU / 8, position = { x: group.home.x + Math.cos(angle) * .85, y: group.home.y, z: group.home.z + Math.sin(angle) * .85 }, heading = angle + Math.PI / 2;
      if (!kelpWaterLifePositionValid(generator, region, a, position, heading, 0, { elements, occupancy: true, extra: placements })) continue;
      placements.push({ ...a, position, heading, siteId: `${patch.id}:school:extra:${attempt}`, groupId: group.id, schoolSlot: 4, schoolHome: clone(group.home), home: clone(position), habitat: 'native-kelp-water-column' });
      group.memberIds.push(a.id); break;
    }
  }
  return freeze({ version: 1, role: Boolean(role), placements, groups });
}
export function initializeKelpWaterLife(generator, region, { fresh = false, role = kelpWaterLifeRole(generator, region?.cx, region?.cz), capacity = 20, maxAdded = 7 } = {}) {
  if (!fresh || !nativeOwner(generator, region) || region.sim.timeSec !== 0 || region.sim._ticks !== 0 || typeof role !== 'boolean' || role !== kelpWaterLifeRole(generator, region.cx, region.cz) ||
      prefixed(region) || oldResidents(region).some(a => isKelpWaterLifeAgent(a) || prefixed(a)) || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20) return false;
  const plan = createKelpWaterLifePlan(generator, region, { availableSlots: capacity - oldResidents(region).length, maxAdded, role }), random = randomFor(generator, region);
  region.kelpWaterLifeAgents = plan.placements.map(p => ({ ...clone(p), regionId: region.id, kelpWaterLifeIndividualVersion: 1,
    kelpWaterLifeSiteId: p.siteId, createdAtSec: 0, timeSec: 0, stateSince: 0, energy: .70 + random(`${p.id}:condition`) * .10,
    state: p.groupId ? 'schooling' : 'foraging', target: clone(p.position), targetHeading: p.heading, targetPitch: p.pitch,
    velocity: { x: 0, y: 0, z: 0 }, lastFeedAt: null, lastWaterLifeIntake: null, nextBite: random(`${p.id}:bite`) * 2,
    nextDecision: 0, decisions: 0, foodScope: KELP_WATER_LIFE_FOOD_SCOPE,
    conditionScope: 'relative condition index; no new biomass or food inventory' }));
  region.kelpWaterLifeVersion = 1; region.kelpWaterLifeInitializedAtSec = 0;
  region.kelpWaterLife = { version: 1, role, foodScope: KELP_WATER_LIFE_FOOD_SCOPE, scope: MODEL.note, birthPlacements: clone(plan.placements),
    addedIds: plan.placements.map(p => p.id), groups: clone(plan.groups), lastTickSec: 0, counters: { ticks: 0, feedings: 0, consumedUnits: 0, deaths: 0 } };
  return true;
}
export function captureKelpWaterLife(region) { return Object.hasOwn(region, 'kelpWaterLifeVersion') ? Object.fromEntries(FIELDS.map(k => [k, clone(region[k])])) : {}; }
function state(a, name, time) { if (a.state !== name) { a.state = name; a.stateSince = time; } }
const turn = (current, target, limit) => current + Math.max(-limit, Math.min(limit, Math.atan2(Math.sin(target - current), Math.cos(target - current))));
function homeValid(a, p) { return distance(a.groupId ? a.schoolHome : a.home, p) <= MODEL.homeExtentM + 1e-8; }
function intakeValid(a, r) {
  const x = a.lastWaterLifeIntake;
  if (x === null) return a.lastFeedAt === null;
  if (!x || !nonnegative(x.timeSec) || x.timeSec > a.timeSec || x.timeSec !== a.lastFeedAt || x.patchId !== a.kelpWaterLifeFoodPatchId || x.hostId !== a.kelpWaterLifeHostId ||
      x.pool !== a.nutritionPool || x.ownerId !== r.id || x.scope !== KELP_WATER_LIFE_FOOD_SCOPE || x.unit !== 'relative-organic-food-proxy-unit' ||
      !['stockBefore', 'stockAfter', 'removedUnits', 'energyBefore', 'energyAfter', 'contactDistanceM'].every(k => nonnegative(x[k])) || x.removedUnits <= 0 || x.removedUnits > MODEL.biteAmount + 1e-10 ||
      !close(x.stockBefore - x.stockAfter, x.removedUnits) || x.energyBefore > 1 || !close(x.energyAfter, Math.min(1, x.energyBefore + x.removedUnits * MODEL.energyGainPerUnit)) ||
      !['agentPosition', 'foodPosition', 'feedingPosition'].every(k => vector(x[k])) || !Number.isFinite(x.heading) || !Number.isFinite(x.pitch) ||
      Math.abs(x.pitch) > MODEL.maximumPitchRad || (a.speciesId === 'pacific-sea-nettle' && x.pitch !== 0) || x.allowedDistanceM !== MODEL.contactDistanceM ||
      !close(distance(x.feedingPosition, x.foodPosition), x.contactDistanceM) || x.contactDistanceM > MODEL.contactDistanceM + 1e-10) return false;
  const mouth = kelpWaterLifeFeedingPosition(a, x.agentPosition, x.heading, x.pitch);
  if (!['x', 'y', 'z'].every(k => close(mouth[k], x.feedingPosition[k]))) return false;
  const patch = foodPatch(r, a); if (!patch) return false;
  let expected;
  if (a.nutritionPool === 'algae') expected = patch.position;
  else {
    if (!vector(x.hostAnchor) || !Number.isFinite(x.hostAnchor.lengthM) || !Number.isFinite(x.hostAnchor.phase) || !x.environment || !['currentMps', 'deformationCurrentMps'].every(k => nonnegative(x.environment[k])) ||
        x.environment.currentMps > 1.2 || x.environment.deformationCurrentMps > 1.2) return false;
    const anchor = r.sim.getKelpAnchor(patch.hostId);
    if (!anchor || !['x', 'y', 'z', 'phase'].every(k => close(anchor[k], x.hostAnchor[k])) || x.hostAnchor.lengthM > anchor.lengthM + 1e-8 || anchor.lengthM - x.hostAnchor.lengthM > (r.sim.timeSec - x.timeSec) * .06 / 86400 + 1e-6) return false;
    expected = plus(kelpStipePosition(x.hostAnchor, patch.fraction, x.timeSec, x.environment), { x: .28, y: 0, z: .18 });
  }
  return ['x', 'y', 'z'].every(k => close(expected[k], x.foodPosition[k]));
}
function validate(record, region, generator, capacity, pending = false) {
  const old = [...(record?.state?.agents ?? region?.sim?.agents ?? []), ...(record?.waterAgents ?? []), ...(record?.visitorAgents ?? []), ...(record?.kelpBenthicAgents ?? [])];
  if (old.some(a => isKelpWaterLifeAgent(a) || prefixed(a))) return false;
  if (!prefixed(record)) return true;
  if (!nativeOwner(generator, region) || !Number.isSafeInteger(capacity) || capacity < 0 || capacity > 20 || Object.keys(record).some(k => k.startsWith('kelpWaterLife') && !FIELDS.includes(k)) ||
      record.kelpWaterLifeVersion !== 1 || record.kelpWaterLifeInitializedAtSec !== 0 || !Array.isArray(record.kelpWaterLifeAgents) || record.kelpWaterLifeAgents.length > 7 ||
      old.filter(a => a.speciesId !== 'giant-kelp').length + record.kelpWaterLifeAgents.length > capacity) return false;
  const d = record.kelpWaterLife, agents = record.kelpWaterLifeAgents, clock = region.sim.timeSec, expectedClock = pending ? clock - .1 : clock;
  if (!d || d.version !== 1 || typeof d.role !== 'boolean' || d.role !== kelpWaterLifeRole(generator, region.cx, region.cz) || d.foodScope !== KELP_WATER_LIFE_FOOD_SCOPE || d.scope !== MODEL.note ||
      !nonnegative(d.lastTickSec) || !close(d.lastTickSec, expectedClock) || !Number.isSafeInteger(d.counters?.ticks) || d.counters.ticks < 0 || !close(d.counters.ticks * .1, d.lastTickSec) ||
      !Number.isSafeInteger(d.counters?.feedings) || d.counters.feedings < 0 || !Number.isSafeInteger(d.counters?.deaths) || d.counters.deaths < 0 || !nonnegative(d.counters?.consumedUnits) ||
      d.counters.consumedUnits > d.counters.feedings * MODEL.biteAmount + 1e-8 || d.counters.consumedUnits > region.sim.ledger.ingested + 1e-8 || d.counters.feedings > region.sim.counters.feedingCount ||
      d.counters.deaths !== agents.filter(a => a?.alive === false).length || d.counters.deaths > region.sim.counters.deathCount ||
      (d.counters.feedings === 0 ? d.counters.consumedUnits !== 0 : !(d.counters.consumedUnits > 0)) ||
      !Array.isArray(d.addedIds) || !Array.isArray(d.birthPlacements) || !Array.isArray(d.groups) || d.addedIds.length !== agents.length || d.birthPlacements.length !== agents.length ||
      new Set(d.addedIds).size !== agents.length || new Set(agents.map(a => a?.id)).size !== agents.length || (!d.role && agents.length)) return false;
  const jack = agents.filter(a => a?.speciesId === KELP_WATER_LIFE_IDS[0]);
  if (agents.length && (jack.length < 4 || jack.length > 5 || d.groups.length !== 1)) return false;
  if (!agents.length && d.groups.length) return false;
  for (const group of d.groups) {
    const patch = region.sim.preyPatches.find(p => p.id === group.foodPatchId);
    if (!patch || group.id !== `kelp-water-life-school:${region.id}:${patch.id}` || group.speciesId !== KELP_WATER_LIFE_IDS[0] || !vector(group.home) ||
        !Array.isArray(group.memberIds) || group.memberIds.length !== jack.length || new Set(group.memberIds).size !== jack.length || group.leaderId !== group.memberIds[0] ||
        !jack.every(a => a.groupId === group.id && group.memberIds[a.schoolSlot] === a.id && ['x', 'y', 'z'].every(k => a.schoolHome?.[k] === group.home[k]))) return false;
  }
  const ids = new Set(old.map(a => a?.id)), elements = kelpWaterElements(generator, region.cx, region.cz);
  for (const a of agents) {
    if (!isKelpWaterLifeAgent(a) || Object.keys(a).some(k => k.startsWith('kelpWaterLife') && !AGENT_FIELDS.includes(k))) return false;
    const born = d.birthPlacements.find(p => p.id === a.id), patch = foodPatch(region, a);
    if (!born || !patch || ids.has(a.id) || !d.addedIds.includes(a.id) || a.id !== `kelp-water-life:${region.id}:${a.speciesId}:${a.schoolSlot ?? 0}` ||
        a.kelpWaterLifeIndividualVersion !== 1 || a.kelpWaterLifeSiteId !== born.siteId || a.kelpWaterLifeFoodPatchId !== born.kelpWaterLifeFoodPatchId ||
        a.kelpWaterLifeHostId !== (patch.hostId ?? null) || born.kelpWaterLifeHostId !== a.kelpWaterLifeHostId || born.speciesId !== a.speciesId || a.regionId !== region.id ||
        a.sizeM !== sizeFor(generator, region, a.speciesId) || a.sizeM !== born.sizeM || a.habitat !== 'native-kelp-water-column' || a.habitat !== born.habitat ||
        !['position', 'home', 'target', 'velocity'].every(k => vector(a[k])) || !vector(born.position) || !['heading', 'pitch', 'targetHeading', 'targetPitch'].every(k => Number.isFinite(a[k])) ||
        !['x', 'y', 'z'].every(k => a.home[k] === born.home?.[k]) || a.createdAtSec !== 0 || typeof a.alive !== 'boolean' || !['timeSec', 'stateSince', 'energy', 'nextBite', 'nextDecision'].every(k => nonnegative(a[k])) ||
        a.energy > 1 || a.timeSec > d.lastTickSec + 1e-8 || a.stateSince > a.timeSec || !Number.isSafeInteger(a.decisions) || a.decisions < 0 ||
        Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) > MODEL.traits[a.speciesId].speedMps + 1e-8 || !['schooling', 'foraging', 'approaching', 'searching', 'blocked', 'kelp-water-life-feeding', 'dead'].includes(a.state) ||
        (a.alive ? a.state === 'dead' || !close(a.timeSec, d.lastTickSec) : a.state !== 'dead' || a.energy !== 0 || a.stateSince !== a.timeSec || Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) !== 0) ||
        a.foodScope !== KELP_WATER_LIFE_FOOD_SCOPE || a.conditionScope !== 'relative condition index; no new biomass or food inventory' || a.nutritionPool !== MODEL.traits[a.speciesId].pool ||
        !homeValid(a, a.position) || !homeValid(a, a.target) || !intakeValid(a, region)) return false;
    if (a.groupId !== born.groupId || a.schoolSlot !== born.schoolSlot || (a.groupId === null && (a.schoolHome !== null || a.schoolSlot !== null))) return false;
    // A moving plant can invalidate a historical target; birth/static support
    // is reconstructed at zero, and current geometry is checked before every
    // turn, movement and intake. Saved positions are never silently repaired.
    const historic = { ...region, sim: Object.assign(Object.create(Object.getPrototypeOf(region.sim)), region.sim, { timeSec: 0, _ticks: 0, environment: { currentMps: .18, deformationCurrentMps: .18 } }) };
    if (!kelpWaterLifePositionValid(generator, historic, a, born.position, born.heading, born.pitch, { elements, occupancy: false }) ||
        !kelpWaterLifePositionValid(generator, region, a, a.position, a.heading, a.pitch, { elements, occupancy: false, future: false }) ||
        !kelpWaterLifePositionValid(generator, region, a, a.target, a.targetHeading, a.targetPitch, { elements, occupancy: false, checkPlants: false }) ||
        Math.abs(a.targetPitch) > MODEL.maximumPitchRad + 1e-10 || (a.speciesId === 'pacific-sea-nettle' && a.targetPitch !== 0)) return false;
    ids.add(a.id);
  }
  return true;
}
export function validateKelpWaterLifeRecord(record, region, { generator, capacity = 20 } = {}) {
  try { return validate(record, region, generator, capacity); } catch { return false; }
}
/** The existing sim owns a single 0.1s clock. Validate before any mutation. */
export function tickKelpWaterLife(region, generator, dt) {
  if (!nativeOwner(generator, region) || region.kelpWaterLifeVersion !== 1 || !close(dt, .1) || !close(region.sim.timeSec - region.kelpWaterLife?.lastTickSec, .1)) return false;
  const raw = { state: { agents: region.sim.agents }, waterAgents: region.waterAgents, visitorAgents: region.visitorAgents, kelpBenthicAgents: region.kelpBenthicAgents, ...captureKelpWaterLife(region) };
  try { if (!validate(raw, region, generator, 20, true)) return false; } catch { return false; }
  const d = region.kelpWaterLife, time = region.sim.timeSec, elements = kelpWaterElements(generator, region.cx, region.cz), random = randomFor(generator, region);
  d.lastTickSec = time; d.counters.ticks++;
  for (const a of region.kelpWaterLifeAgents) {
    if (!a.alive) continue;
    const trait = MODEL.traits[a.speciesId], patch = foodPatch(region, a), old = clone(a.position), group = d.groups.find(g => g.id === a.groupId);
    a.timeSec = time; a.velocity = { x: 0, y: 0, z: 0 };
    const selected = !group || group.memberIds[Math.floor(time / 18) % group.memberIds.length] === a.id;
    const contact = patch && distance(kelpWaterLifeFeedingPosition(a), patchPosition(region, patch, a.nutritionPool)) <= MODEL.contactDistanceM;
    if (selected && patch?.[a.nutritionPool] > 0 && time >= a.nextBite && !contact) {
      const food = patchPosition(region, patch, a.nutritionPool), heading = a.speciesId === 'pacific-sea-nettle' ? a.heading : Math.atan2(food.z - a.position.z, food.x - a.position.x);
      const pose = feedingPose(generator, region, a, patch, heading, elements);
      if (pose && homeValid(a, pose.position)) { a.target = pose.position; a.targetHeading = pose.heading; a.targetPitch = pose.pitch; state(a, 'approaching', time); }
    } else if ((!contact || !selected || (a.lastFeedAt !== null && time < a.nextBite)) && time >= a.nextDecision) {
      a.nextDecision = time + 5; const key = `${a.id}:decision:${a.decisions++}`, home = a.groupId ? a.schoolHome : a.home;
      for (let attempt = 0; attempt < 6; attempt++) {
        const angle = random(`${key}:${attempt}`) * TAU, extent = a.speciesId === 'pacific-sea-nettle' ? .18 : a.speciesId === 'opaleye' ? .35 : .65;
        const target = { x: home.x + Math.cos(angle) * extent, y: home.y, z: home.z + Math.sin(angle) * extent }, heading = Math.atan2(target.z - a.position.z, target.x - a.position.x), pitch = 0;
        if (!kelpWaterLifePositionValid(generator, region, a, target, heading, pitch, { elements, occupancy: true })) continue;
        a.target = target; a.targetHeading = heading; a.targetPitch = pitch; break;
      }
    }
    const gap = distance(a.position, a.target), heading = turn(a.heading, a.targetHeading, MODEL.maximumTurnRadSec * dt), pitch = a.speciesId === 'pacific-sea-nettle' ? 0 :
      a.pitch + Math.max(-MODEL.maximumPitchTurnRadSec * dt, Math.min(MODEL.maximumPitchTurnRadSec * dt, a.targetPitch - a.pitch));
    const turned = kelpWaterLifePositionValid(generator, region, a, old, heading, pitch, { elements, occupancy: true, future: false });
    if (turned) {
      a.heading = heading; a.pitch = pitch;
      if (gap > 1e-10) {
        const step = Math.min(gap, trait.speedMps * dt), next = Object.fromEntries(['x', 'y', 'z'].map(k => [k, old[k] + (a.target[k] - old[k]) * step / gap])), mid = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (old[k] + next[k]) / 2]));
        if (homeValid(a, next) && kelpWaterLifePositionValid(generator, region, a, next, heading, pitch, { elements, occupancy: true }) &&
            kelpWaterLifePositionValid(generator, region, a, mid, heading, pitch, { elements, occupancy: true, future: false })) {
          a.position = next; a.velocity = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (next[k] - old[k]) / dt]));
        }
      }
    }
    // A native blade may approach a stationary swimmer during a turn. One
    // finite bounded retreat checks the complete retained pose and midpoint,
    // rather than letting a failed turn pin the individual in that blade.
    if (distance(a.position, old) < 1e-10 && !kelpWaterLifePositionValid(generator, region, a, old, a.heading, a.pitch, { elements })) {
      const anchor = patch?.hostId ? region.sim.getKelpAnchor(patch.hostId) : null;
      const away = anchor ? Math.atan2(old.z - anchor.z, old.x - anchor.x) : a.heading + Math.PI;
      for (const delta of [0, .5, -.5, 1, -1, Math.PI]) {
        const angle = away + delta, next = { x: old.x + Math.cos(angle) * trait.speedMps * dt, y: old.y, z: old.z + Math.sin(angle) * trait.speedMps * dt },
          mid = { x: (old.x + next.x) / 2, y: old.y, z: (old.z + next.z) / 2 };
        if (!homeValid(a, next) || !kelpWaterLifePositionValid(generator, region, a, next, a.heading, a.pitch, { elements, occupancy: true }) ||
            !kelpWaterLifePositionValid(generator, region, a, mid, a.heading, a.pitch, { elements, occupancy: true, future: false })) continue;
        a.position = next; a.velocity = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (next[k] - old[k]) / dt])); break;
      }
    }
    a.energy = Math.max(0, a.energy - dt * (.000035 + (region.sim.environment.currentMps ?? 0) ** 2 * .00004));
    if (a.energy === 0) { a.alive = false; a.velocity = { x: 0, y: 0, z: 0 }; state(a, 'dead', time); d.counters.deaths++; region.sim.counters.deathCount++; continue; }
    state(a, gap > .01 && distance(a.position, old) < 1e-10 ? 'blocked' : a.groupId ? 'schooling' : 'foraging', time);
    if (time < a.nextBite || !patch) continue;
    const feeding = kelpWaterLifeFeedingPosition(a), food = patchPosition(region, patch, a.nutritionPool), contactDistance = distance(feeding, food);
    if (contactDistance > MODEL.contactDistanceM || !(patch[a.nutritionPool] > 0) || !kelpWaterLifePositionValid(generator, region, a, a.position, a.heading, a.pitch, { elements, occupancy: true })) {
      if (selected) state(a, 'searching', time); continue;
    }
    const stockBefore = patch[a.nutritionPool], energyBefore = a.energy, taken = region.sim._remove(patch, a.nutritionPool, MODEL.biteAmount, 'ingested');
    if (!(taken > 0)) continue;
    a.energy = Math.min(1, a.energy + taken * MODEL.energyGainPerUnit); a.lastFeedAt = time; a.nextBite = time + MODEL.biteIntervalSec;
    const anchor = a.nutritionPool === 'smallPrey' ? region.sim.getKelpAnchor(patch.hostId) : null;
    a.lastWaterLifeIntake = { timeSec: time, ownerId: region.id, patchId: patch.id, hostId: patch.hostId ?? null, pool: a.nutritionPool,
      stockBefore, stockAfter: patch[a.nutritionPool], removedUnits: taken, energyBefore, energyAfter: a.energy,
      agentPosition: clone(a.position), heading: a.heading, pitch: a.pitch, feedingPosition: feeding, foodPosition: clone(food),
      hostAnchor: anchor ? clone(anchor) : null, environment: anchor ? { currentMps: region.sim.environment.currentMps, deformationCurrentMps: region.sim.environment.deformationCurrentMps } : null,
      contactDistanceM: contactDistance, allowedDistanceM: MODEL.contactDistanceM, unit: 'relative-organic-food-proxy-unit', scope: KELP_WATER_LIFE_FOOD_SCOPE };
    d.counters.feedings++; d.counters.consumedUnits += taken; region.sim.counters.feedingCount++; state(a, 'kelp-water-life-feeding', time);
  }
  return true;
}
export function kelpWaterLifeSnapshot(region) {
  if (region?.kelpWaterLifeVersion !== 1) return null;
  return { version: 1, ownerId: region.id, role: region.kelpWaterLife.role, clockSec: region.kelpWaterLife.lastTickSec,
    agents: clone(region.kelpWaterLifeAgents), groups: clone(region.kelpWaterLife.groups), counters: clone(region.kelpWaterLife.counters), foodScope: KELP_WATER_LIFE_FOOD_SCOPE, scope: MODEL.note };
}
