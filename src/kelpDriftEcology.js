import { KELP_MODEL_PARAMETERS } from './kelpSimulation.js';
import { kelpDriftFootprint, kelpDriftContact, kelpDriftUrchinMouthWorld, KELP_DRIFT_MOUTH_REACH_M, KELP_DRIFT_URCHIN_MOUTH_LOCAL_Y } from './kelpDriftGeometry.js';

export const KELP_DRIFT_COMMUNITY_VERSION = 1;
export const KELP_DRIFT_PARAMETERS = Object.freeze({ maximumStockPerPatch: 1, minimumEdibleStock: 1e-7,
  senseM: .85, biteAmount: .0009, biteIntervalSec: 8, energyGainPerUnit: 1.8,
  maximumPatchesPerHost: 1, unit: 'relative-organic-food-proxy-unit',
  note: 'Existing 0.01/day kelp-tissue shedding feeds a same-rock near-bottom collection proxy. No extra production, mass calibration, modeled sinking trajectory, offscreen evolution, plant damage or recruitment.' });
const P = KELP_DRIFT_PARAMETERS, clone = value => structuredClone(value);
const vector = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
const nonnegative = value => Number.isFinite(value) && value >= 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const close = (a, b) => Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
const owns = (region, point) => vector(point) && Math.floor(point.x / 64) === region.cx && Math.floor(point.z / 64) === region.cz;
const patchId = (region, source, receiver) => `kelp-drift:${region.id}:${source.hostId}:${receiver.id}`;
const totalStock = region => (region.driftPatches ?? []).reduce((sum, patch) => sum + patch.stock, 0);
const normalAt = (generator, x, z) => {
  if (typeof generator.supportNormal === 'function') return generator.supportNormal(x, z);
  const e = .015, dx = (generator.heightAt(x + e, z) - generator.heightAt(x - e, z)) / (2 * e);
  const dz = (generator.heightAt(x, z + e) - generator.heightAt(x, z - e)) / (2 * e), n = Math.hypot(dx, 1, dz);
  return { x: -dx / n, y: 1 / n, z: -dz / n };
};
function validSite(patch, region, generator) {
  const receiver = region.sim.rockPatches.find(item => item.id === patch.rockPatchId);
  const host = region.sim.hostById.get(patch.hostId);
  if (!receiver || !host || receiver.rockIndex !== host.anchor.rockIndex || patch.rockIndex !== receiver.rockIndex ||
    region.sim._hostRockPatch(host.id)?.id !== receiver.id ||
    !owns(region, patch.position) || ['x', 'y', 'z'].some(axis => !close(patch.position[axis], receiver.position[axis]))) return false;
  const footprint = kelpDriftFootprint(patch, generator);
  for (const point of footprint.verticesWorld) {
    const height = generator.heightAt(point.x, point.z);
    if (!owns(region, point) || !Number.isFinite(height) || point.y < height || point.y - height > .002 ||
      region.sim.rockHeight(patch.rockIndex, point.x, point.z) < height - 1e-8) return false;
  }
  // Bounded triangle probes reject an overhang/step that would bury this thin
  // proxy sheet despite clear vertices. They are not full leaf/mesh collision.
  for (let index = 1; index < 7; index++) for (const weights of [[.5, .25, .25], [.2, .4, .4]]) {
    const vertices = [footprint.center, footprint.verticesWorld[index], footprint.verticesWorld[index % 6 + 1]];
    const point = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, vertices.reduce((sum, item, i) => sum + item[axis] * weights[i], 0)]));
    const floor = generator.heightAt(point.x, point.z);
    if (!Number.isFinite(floor) || point.y < floor - 1e-8 || point.y - floor > .004) return false;
  }
  return true;
}
function supportedUrchin(agent, region, generator) {
  if (!owns(region, agent.position) || !Number.isInteger(agent.rockIndex) || !vector(agent.supportNormal)) return false;
  const height = generator.heightAt(agent.position.x, agent.position.z);
  const normal = normalAt(generator, agent.position.x, agent.position.z);
  return Number.isFinite(height) && close(agent.position.y, height + .003) &&
    region.sim.rockHeight(agent.rockIndex, agent.position.x, agent.position.z) >= height - 1e-8 &&
    ['x', 'y', 'z'].every(axis => close(agent.supportNormal[axis], normal[axis]));
}

export function upgradeKelpDrift(region, { generator } = {}) {
  if (region.driftCommunityVersion >= KELP_DRIFT_COMMUNITY_VERSION) return false;
  region.driftCommunityVersion = KELP_DRIFT_COMMUNITY_VERSION; region.driftPatches = [];
  region.driftLedger = { transferredIn: 0, ingested: 0, returnedToDetritus: 0 };
  for (const source of region.sim.kelpPatches) {
    const host = region.sim.hostById.get(source.hostId), receiver = host && region.sim._hostRockPatch(source.hostId);
    if (!host?.alive || !receiver) continue;
    const patch = { id: patchId(region, source, receiver), hostId: host.id, sourcePatchId: source.id,
      rockPatchId: receiver.id, rockIndex: receiver.rockIndex, regionId: region.id,
      position: clone(receiver.position), supportNormal: normalAt(generator, receiver.position.x, receiver.position.z),
      stock: 0, transferredIn: 0, ingested: 0, returnedToDetritus: 0, lastTransfer: null };
    if (validSite(patch, region, generator)) region.driftPatches.push(patch);
  }
  return true;
}
export function kelpDriftBalanceError(region) {
  const ledger = region.driftLedger;
  return ledger ? totalStock(region) - (ledger.transferredIn - ledger.ingested - ledger.returnedToDetritus) : 0;
}
function transfer(sim, fields, region, generator) {
  const { from, fromKey, to, toKey, amount } = fields;
  if (fromKey !== 'kelpTissue' || toKey !== 'detritus' || !sim.kelpPatches.includes(from)) return false;
  const patch = region.driftPatches.find(item => item.sourcePatchId === from.id && item.hostId === from.hostId && item.rockPatchId === to.id);
  if (!patch) return false;
  const host = sim.hostById.get(patch.hostId);
  if (!host?.alive || !validSite(patch, region, generator)) {
    // Already accounted litter returns to this same existing local detritus
    // channel. New shedding takes the original transfer path below.
    const returned = patch.stock;
    patch.stock = 0; to.detritus += returned;
    patch.returnedToDetritus += returned; region.driftLedger.returnedToDetritus += returned;
    return false;
  }
  const removed = Math.min(from.kelpTissue, Math.max(0, amount));
  const stored = Math.min(removed, Math.max(0, P.maximumStockPerPatch - patch.stock));
  if (!(stored > 0)) return false;
  const sourceStockBefore = from.kelpTissue, stockBefore = patch.stock;
  from.kelpTissue -= removed; patch.stock += stored; to.detritus += removed - stored;
  patch.transferredIn += stored; region.driftLedger.transferredIn += stored;
  patch.lastTransfer = { timeSec: sim.timeSec, hostId: host.id, sourcePatchId: from.id,
    sourceStockBefore, sourceStockAfter: from.kelpTissue, stockBefore, stockAfter: patch.stock,
    sourceRemovedUnits: removed, transferredUnits: stored, fallbackDetritusUnits: removed - stored, unit: P.unit };
  return true;
}
function supportedGoal(agent, point, region, generator) {
  const position = { x: point.x, y: generator.heightAt(point.x, point.z) + .003, z: point.z };
  const normal = normalAt(generator, position.x, position.z), mouthOffset = agent.sizeM * KELP_DRIFT_URCHIN_MOUTH_LOCAL_Y;
  position.x -= normal.x * mouthOffset; position.z -= normal.z * mouthOffset;
  position.y = generator.heightAt(position.x, position.z) + .003;
  if (!owns(region, position) || region.sim.rockHeight(agent.rockIndex, position.x, position.z) < position.y - .003 - 1e-8) return null;
  const candidate = { ...agent, position, supportNormal: normalAt(generator, position.x, position.z) };
  // A large underside reference can be too high for this thin food sample.
  // Do not pursue a point whose supported final mouth cannot actually touch.
  return distance(kelpDriftUrchinMouthWorld(candidate), point) <= KELP_DRIFT_MOUTH_REACH_M + 1e-10 ? position : null;
}
function nearestPatch(agent, region, generator) {
  let selected = null, nearest = P.senseM;
  for (const patch of region.driftPatches) {
    if (patch.stock <= P.minimumEdibleStock || patch.rockIndex !== agent.rockIndex ||
      !region.sim.hostById.get(patch.hostId)?.alive || !validSite(patch, region, generator)) continue;
    const mouth = kelpDriftUrchinMouthWorld(agent), footprint = kelpDriftFootprint(patch, generator);
    for (const point of footprint.verticesWorld) {
      const goal = supportedGoal(agent, point, region, generator);
      if (!goal) continue;
      const gap = distance(mouth, point);
      if (gap < nearest) { nearest = gap; selected = { patch, point, goal, distanceM: gap }; }
    }
  }
  return selected;
}
function move(agent, target, region, generator, dt) {
  const previous = clone(agent.position), budget = KELP_MODEL_PARAMETERS.crawlSpeedMps['purple-urchin'] * dt;
  const dx = target.x - previous.x, dz = target.z - previous.z, length = Math.hypot(dx, dz), step = Math.min(length, budget);
  for (let attempt = 0; length > 1e-10 && attempt < 10; attempt++) {
    const factor = step / length * 2 ** -attempt;
    const endpoint = { x: previous.x + dx * factor, y: previous.y, z: previous.z + dz * factor };
    endpoint.y = generator.heightAt(endpoint.x, endpoint.z) + .003;
    if (!owns(region, endpoint) || distance(previous, endpoint) > budget + 1e-10) continue;
    let valid = true, path = 0, prior = previous;
    for (const f of [.25, .5, .75, 1]) {
      const point = { x: previous.x + (endpoint.x - previous.x) * f, y: previous.y, z: previous.z + (endpoint.z - previous.z) * f };
      point.y = generator.heightAt(point.x, point.z) + .003;
      path += distance(prior, point); prior = point;
      if (!Number.isFinite(point.y) || !owns(region, point) || distance(previous, point) > budget * f + 1e-10 ||
        region.sim.rockHeight(agent.rockIndex, point.x, point.z) < point.y - .003 - 1e-8) { valid = false; break; }
    }
    if (valid && path <= budget + 1e-10) { agent.position = endpoint; break; }
  }
  agent.supportNormal = normalAt(generator, agent.position.x, agent.position.z);
  region.sim._velocityFrom(agent, previous, dt);
}

export function feedKelpDrift(sim, agent, patch, region, dt, generator) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > .1 + 1e-10 || !agent.alive || agent.speciesId !== 'purple-urchin' ||
    !sim.agents.includes(agent) || !region.driftPatches.includes(patch) || agent.regionId !== region.id || patch.regionId !== region.id ||
    !sim.hostById.get(patch.hostId)?.alive || patch.stock <= P.minimumEdibleStock || patch.rockIndex !== agent.rockIndex ||
    !validSite(patch, region, generator) || !supportedUrchin(agent, region, generator) ||
    sim.timeSec + 1e-10 < agent.nextBite || agent.energy > .94) return 0;
  const contact = kelpDriftContact(agent, patch, generator);
  if (!contact.point || contact.distanceM > KELP_DRIFT_MOUTH_REACH_M + 1e-10) return 0;
  const stockBefore = patch.stock, energyBefore = agent.energy;
  const taken = sim._remove(patch, 'stock', P.biteAmount, 'ingested');
  if (!(taken > 0)) return 0;
  const gainUnits = Math.min(1 - agent.energy, taken * P.energyGainPerUnit);
  agent.energy += gainUnits; agent.nextBite = sim.timeSec + P.biteIntervalSec; agent.lastFeedAt = sim.timeSec;
  sim.counters.feedingCount++; patch.ingested += taken; region.driftLedger.ingested += taken;
  agent.lastDriftIntake = { timeSec: sim.timeSec, hostId: patch.hostId, patchId: patch.id, sourcePatchId: patch.sourcePatchId,
    removedUnits: taken, gainUnits, stockBefore, stockAfter: patch.stock, energyBefore, energyAfter: agent.energy,
    mouthPosition: clone(contact.mouth), foodPosition: clone(contact.point), contactDistanceM: contact.distanceM,
    urchinPose: { id: agent.id, position: clone(agent.position), sizeM: agent.sizeM,
      supportNormal: clone(agent.supportNormal), rockIndex: agent.rockIndex },
    allowedDistanceM: KELP_DRIFT_MOUTH_REACH_M, referenceIndex: contact.referenceIndex, unit: P.unit,
    ...(region.supportGeometryVersion >= 2 ? { supportGeometryVersion: region.supportGeometryVersion } : {}) };
  if (!agent.hasExplainedDriftFeeding) {
    agent.hasExplainedDriftFeeding = true;
    sim.events.push({ timeSec: sim.timeSec, type: 'kelp-drift-feeding', label: '紫海胆摄食林底藻料',
      cause: '既有巨藻组织按原脱落流进入同岩近底库存；口部实际接触后才移出资源供能，未新增食物输入。',
      agentId: agent.id, ...clone(agent.lastDriftIntake) });
    if (sim.events.length > 60) sim.events.shift();
  }
  return taken;
}
function groundUpdater(sim, agent, dt, region, generator) {
  if (agent.speciesId !== 'purple-urchin' || !agent.alive || agent.energy > .94 || agent.rockIndex === null) return false;
  const choice = nearestPatch(agent, region, generator);
  if (!choice) return false;
  const algae = sim._nearestPatch(agent, sim.rockPatches.filter(item => item.rockIndex === agent.rockIndex), 'algae');
  // Either source is a local diet proxy. Choose the closer actual collection
  // reference; no measured dietary preference or camera-directed target.
  if (algae.patch && algae.distance + 1e-8 < choice.distanceM) return false;
  agent.target = clone(choice.goal); agent.targetDriftPatchId = choice.patch.id;
  const contact = kelpDriftContact(agent, choice.patch, generator);
  if (contact.distanceM <= KELP_DRIFT_MOUTH_REACH_M + 1e-10) {
    sim._setState(agent, 'drift-grazing'); agent.velocity = { x: 0, y: 0, z: 0 };
    feedKelpDrift(sim, agent, choice.patch, region, dt, generator);
  } else { sim._setState(agent, 'approaching-kelp-drift'); move(agent, choice.goal, region, generator, dt); }
  // This is the single ground branch for this tick. Native fallback supplies
  // its own identical debit, so neither movement nor feeding is applied twice.
  agent.energy -= dt * (.000045 + sim.environment.currentMps ** 2 * .000008);
  return true;
}
export function installKelpDriftHooks(region, { generator, enabled = true } = {}) {
  if (region.driftCommunityVersion !== KELP_DRIFT_COMMUNITY_VERSION) return;
  region.sim.options.resourceTotals = (_sim, base) => {
    const stock = totalStock(region); return stock > 0 ? { ...base, kelpDrift: stock } : base;
  };
  const active = () => typeof enabled === 'function' ? enabled() : enabled;
  region.sim.options.transferOverride = (sim, fields) => active() && transfer(sim, fields, region, generator);
  region.sim.options.groundUpdater = (sim, agent, dt) => active() && groundUpdater(sim, agent, dt, region, generator);
}

export function validateKelpDriftRecord(record, region, { generator, historyGenerator, historyRockHeight } = {}) {
  const keys = ['driftCommunityVersion', 'driftPatches', 'driftLedger'];
  if (!keys.some(key => Object.hasOwn(record, key))) return !region.sim.agents.some(agent => agent.lastDriftIntake !== undefined);
  if (record.driftCommunityVersion !== KELP_DRIFT_COMMUNITY_VERSION || !Array.isArray(record.driftPatches) ||
    record.driftPatches.length > region.sim.hostById.size ||
    !['transferredIn', 'ingested', 'returnedToDetritus'].every(key => nonnegative(record.driftLedger?.[key]))) return false;
  const ids = new Set(), hosts = new Set();
  for (const patch of record.driftPatches) {
    const source = region.sim.kelpPatches.find(item => item.id === patch.sourcePatchId && item.hostId === patch.hostId);
    const receiver = region.sim.rockPatches.find(item => item.id === patch.rockPatchId);
    if (!source || !receiver || patch.id !== patchId(region, source, receiver) || ids.has(patch.id) || hosts.has(patch.hostId) ||
      patch.regionId !== region.id || !vector(patch.supportNormal) || !validSite(patch, region, generator) ||
      !['stock', 'transferredIn', 'ingested', 'returnedToDetritus'].every(key => nonnegative(patch[key])) || patch.stock > P.maximumStockPerPatch ||
      !close(patch.stock, patch.transferredIn - patch.ingested - patch.returnedToDetritus)) return false;
    const normal = normalAt(generator, patch.position.x, patch.position.z);
    if (['x', 'y', 'z'].some(axis => !close(normal[axis], patch.supportNormal[axis]))) return false;
    if (patch.lastTransfer !== null) {
      const event = patch.lastTransfer;
      if (!event || event.hostId !== patch.hostId || event.sourcePatchId !== patch.sourcePatchId || !nonnegative(event.timeSec) || event.timeSec > region.sim.timeSec + 1e-8 ||
        !['sourceStockBefore', 'sourceStockAfter', 'stockBefore', 'stockAfter', 'sourceRemovedUnits', 'transferredUnits', 'fallbackDetritusUnits'].every(key => nonnegative(event[key])) ||
        !close(event.sourceStockBefore - event.sourceStockAfter, event.sourceRemovedUnits) ||
        !close(event.stockAfter - event.stockBefore, event.transferredUnits) || !close(event.sourceRemovedUnits, event.transferredUnits + event.fallbackDetritusUnits) || event.unit !== P.unit) return false;
    }
    ids.add(patch.id); hosts.add(patch.hostId);
  }
  const model = { driftPatches: record.driftPatches, driftLedger: record.driftLedger };
  if (!close(kelpDriftBalanceError(model), 0) || !['transferredIn', 'ingested', 'returnedToDetritus'].every(key =>
    close(record.driftLedger[key], record.driftPatches.reduce((sum, patch) => sum + patch[key], 0)))) return false;
  for (const agent of region.sim.agents) {
    if (agent.targetDriftPatchId !== undefined && !ids.has(agent.targetDriftPatchId)) return false;
    if (agent.lastDriftIntake !== undefined) {
      const event = agent.lastDriftIntake, patch = record.driftPatches.find(item => item.id === event?.patchId);
      // An intake is evidence of its original contact, never a new contact
      // on a subsequently raised seabed. New geometry always stamps its event.
      const eventVersion = event?.supportGeometryVersion ?? 1, currentVersion = generator.supportVersion ?? record.supportGeometryVersion ?? 1;
      if (!Number.isInteger(eventVersion) || eventVersion < 1 || eventVersion > currentVersion) return false;
      let contactGenerator = generator, contactRegion = region, contactPatch = patch;
      if (eventVersion === 1 && currentVersion >= 2) {
        if (!historyGenerator || typeof historyRockHeight !== 'function' || !patch) return false;
        contactGenerator = historyGenerator;
        contactRegion = { ...region, sim: Object.assign(Object.create(Object.getPrototypeOf(region.sim)), region.sim, { rockHeight: historyRockHeight }) };
        contactPatch = { ...patch, position: { ...patch.position, y: historyGenerator.heightAt(patch.position.x, patch.position.z) },
          supportNormal: normalAt(historyGenerator, patch.position.x, patch.position.z) };
      }
      if (agent.speciesId !== 'purple-urchin' || !event || !patch || patch.hostId !== event.hostId || patch.sourcePatchId !== event.sourcePatchId ||
        patch.rockIndex !== agent.rockIndex || !nonnegative(event.timeSec) || event.timeSec > region.sim.timeSec + 1e-8 ||
        !['removedUnits', 'gainUnits', 'stockBefore', 'stockAfter', 'energyBefore', 'energyAfter', 'contactDistanceM'].every(key => nonnegative(event[key])) ||
        event.removedUnits <= 0 || event.removedUnits > P.biteAmount || event.energyAfter > 1 ||
        !close(event.stockBefore - event.stockAfter, event.removedUnits) || !close(event.energyAfter - event.energyBefore, event.gainUnits) ||
        !close(event.gainUnits, Math.min(1 - event.energyBefore, event.removedUnits * P.energyGainPerUnit)) ||
        !vector(event.mouthPosition) || !vector(event.foodPosition) || !owns(region, event.mouthPosition) ||
        !close(event.allowedDistanceM, KELP_DRIFT_MOUTH_REACH_M) || event.contactDistanceM > KELP_DRIFT_MOUTH_REACH_M + 1e-8 ||
        !close(distance(event.mouthPosition, event.foodPosition), event.contactDistanceM) || event.unit !== P.unit ||
        event.urchinPose?.id !== agent.id || !close(event.urchinPose?.sizeM, agent.sizeM) || event.urchinPose?.rockIndex !== agent.rockIndex ||
        !supportedUrchin(event.urchinPose, contactRegion, contactGenerator) ||
        ['x', 'y', 'z'].some(axis => !close(event.mouthPosition[axis], kelpDriftUrchinMouthWorld(event.urchinPose)[axis])) ||
        !Number.isInteger(event.referenceIndex) || event.referenceIndex < 0 || event.referenceIndex >= 7 ||
        ['x', 'y', 'z'].some(axis => !close(event.foodPosition[axis], kelpDriftFootprint(contactPatch, contactGenerator).verticesWorld[event.referenceIndex][axis]))) return false;
    }
  }
  return true;
}
