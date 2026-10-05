import fs from 'node:fs';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { kelpWaterElements, kelpWaterDynamicClearance } from '../src/kelpWaterCommunity.js';

const receipts = JSON.parse(fs.readFileSync('output/validation/kelp-roaming-browser-receipts.json'));
const id = 'kelp-ocean:2,0:blue-rockfish:kelp:kelp-rock:15,5:2:1';
const readings = [];
for (const { label, data } of receipts) {
  const ecology = data.ocean.ecology, animal = ecology.agents.find(agent => agent.id === id);
  if (!animal) continue;
  const generator = createKelpOceanGenerator(ecology.seed), regions = new Map(ecology.regions.map(region => [region.id, region]));
  const anchors = new Map(ecology.agents.filter(agent => agent.hostSceneryId && agent.hostAnchor).map(agent => [agent.hostSceneryId, agent.hostAnchor]));
  const perElement = kelpWaterElements(generator, Math.floor(animal.position.x / 64), Math.floor(animal.position.z / 64)).map(element => {
    const owner = `${Math.floor(element.x / 64)},${Math.floor(element.z / 64)}`, region = regions.get(owner);
    const local = region ? { timeSec: region.timeSec, environment: region.localEnvironment, anchor: anchors.get(element.id) ?? element.anchor } : { conservative: true };
    const gap = kelpWaterDynamicClearance(animal.position, animal.sizeM, { elements: [element], elementContext: () => local });
    return { id: element.id, owner, conservative: !region, anchorSource: anchors.has(element.id) ? 'public-host' : 'generated', gap, anchor: local.anchor ?? element.anchor,
      localTimeSec: region?.timeSec ?? null };
  }).sort((a, b) => a.gap - b.gap);
  readings.push({ label, position: animal.position, individualTimeSec: animal.mobileTimeSec, geographicTimeSec: regions.get(animal.regionId)?.timeSec,
    loaded: [...regions.keys()], closest: perElement.slice(0, 3) });
}
const last = receipts.find(receipt => receipt.label === 'final-real-time').data.ocean.ecology;
const generator = createKelpOceanGenerator(last.seed), model = new KelpOceanEcology(last.seed, generator, { store: { saveMany: async () => {} } });
const publicAnchors = new Map(last.agents.filter(agent => agent.hostSceneryId && agent.hostAnchor).map(agent => [agent.hostSceneryId, agent.hostAnchor]));
for (const record of last.regions) {
  const region = model._create(record.cx, record.cz), sim = region.sim;
  sim.timeSec = record.timeSec; sim.environment = structuredClone(record.localEnvironment);
  for (const plant of sim.hostById.values()) {
    const generated = generator.chunk(record.cx, record.cz).elements.find(element => element.id === plant.sceneryId);
    const anchor = publicAnchors.get(plant.sceneryId) ?? generated.anchor;
    plant.anchor = structuredClone(anchor); plant.sizeM = anchor.lengthM;
  }
  sim.agents = sim.agents.filter(agent => agent.speciesId === 'giant-kelp').concat(structuredClone(last.agents.filter(agent => agent.regionId === record.id && agent.speciesId !== 'blue-rockfish')));
  region.waterAgents = structuredClone(last.agents.filter(agent => agent.regionId === record.id && agent.speciesId === 'blue-rockfish'));
  model._active.set(region.id, region);
}
model._prepareWaterFrames(); model._prepareWaterPlantFrames();
const agent = [...model._active.values()].flatMap(region => region.waterAgents).find(agent => agent.id === id);
const before = structuredClone(agent.position), context = model._mobileWaterContext(before), gapBefore = kelpWaterDynamicClearance(before, agent.sizeM, context);
agent.mobileTimeSec = Math.round((agent.mobileTimeSec + .1) * 10) / 10;
const intention = model._roamingWaterTarget(agent), movement = model._moveRoamingWater(agent, intention, .018);
model._applyWaterTransfers();
const gapAfter = kelpWaterDynamicClearance(agent.position, agent.sizeM, model._mobileWaterContext(agent.position));
const result = { scope: 'Read-only actual-public geographic reference diagnosis and isolated one-controller-step reconstruction; no browser writes and no hidden-state equivalence claim',
  id, readings, isolatedStep: { before, after: agent.position, intention, movement, gapBefore, gapAfter,
    movedM: Math.hypot(...['x','y','z'].map(axis => agent.position[axis] - before[axis])), unchangedFoodHistory: agent.lastFeedAt === last.agents.find(agent => agent.id === id).lastFeedAt } };
fs.writeFileSync('output/validation/kelp-roaming-dynamic-diagnosis.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ readings: readings.map(reading => ({ label: reading.label, nearest: reading.closest[0] })), isolatedStep: result.isolatedStep }, null, 2));
