import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { kelpWaterPositionValid, KELP_WATER_MODEL } from '../src/kelpWaterCommunity.js';

const inputPath = 'output/validation/kelp-roaming-browser-receipts.json';
const inputLabel = 'legacy-settled-paused-before-upgrade';
const receipt = JSON.parse(fs.readFileSync(inputPath, 'utf8')).find(item => item.label === inputLabel);
assert.ok(receipt, 'actual paused baseline is required');
const data = receipt.data.ocean.ecology;
const sha = value => createHash('sha256').update(value).digest('hex');
const ecologySourceSHA256 = sha(fs.readFileSync('src/kelpOceanEcology.js'));
const waterCommunitySourceSHA256 = sha(fs.readFileSync('src/kelpWaterCommunity.js'));
const clone = value => structuredClone(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const ecology = new KelpOceanEcology(data.seed, createKelpOceanGenerator(data.seed), {
  store: { available: true, async saveMany() {} },
});
for (const saved of data.regions) {
  const region = ecology._create(saved.cx, saved.cz), sim = region.sim;
  sim.timeSec = saved.timeSec; sim._ticks = Math.round(saved.timeSec * 10);
  sim.environment = clone(saved.localEnvironment);
  const animals = data.agents.filter(agent => agent.regionId === saved.id);
  for (const animal of animals) if (animal.hostAnchor && sim.hostById.has(animal.hostId ?? animal.attachment?.hostId)) {
    const plant = sim.hostById.get(animal.hostId ?? animal.attachment?.hostId);
    plant.anchor = clone(animal.hostAnchor); plant.sizeM = animal.hostAnchor.lengthM;
  }
  sim.agents = sim.agents.filter(agent => agent.speciesId === 'giant-kelp').concat(clone(animals.filter(agent => agent.speciesId !== 'blue-rockfish')));
  region.waterAgents = clone(animals.filter(agent => agent.speciesId === 'blue-rockfish'));
  const distribute = (patches, key, amount) => {
    const total = patches.reduce((sum, patch) => sum + patch[key], 0);
    for (const patch of patches) patch[key] = total > 0 ? patch[key] * amount / total : amount / patches.length;
  };
  const ground = [...sim.rockPatches, ...sim.floorPatches];
  for (const [patches, key] of [[ground, 'algae'], [ground, 'detritus'], [sim.kelpPatches, 'kelpTissue'],
    [sim.leafPatches, 'biofilm'], [sim.preyPatches, 'smallPrey']]) distribute(patches, key, saved.resources[key]);
  sim.ledger = clone(saved.ledger); sim.counters = clone(saved.counters);
  region.waterCommunityVersion = saved.waterCommunityVersion;
  region.waterCommunityAdded = saved.waterCommunityAdded; region.waterInitializedAtSec = saved.waterInitializedAtSec;
  ecology._upgradeWaterMobility(region); ecology._active.set(region.id, region);
}
const groupId = 'kelp-water-school:0,0:kelp:kelp-rock:5,0:0';
const school = () => ecology.agents.filter(agent => agent.groupId === groupId);
const initial = clone(school());
assert.equal(initial.length, 6);
const identities = initial.map(agent => agent.id).sort(), owners = new Map(initial.map(agent => [agent.id, agent.regionId]));
let firstCrossing = null, allCrossedAtSec = null, maxPairGapM = 0, maxXYZBudgetRatio = 0, supportChecks = 0;
const readings = [];
const durationSec = Number(process.argv[2] ?? 600);
for (let tick = 1; tick <= durationSec * 10; tick++) {
  const previous = new Map(school().map(agent => [agent.id, { ...agent.position }]));
  ecology.step(.1, receipt.data.environment ?? { currentMps: .18, turbidity: .35, foodSupply: 1, hour: 10 });
  const agents = school();
  assert.deepEqual(agents.map(agent => agent.id).sort(), identities);
  assert.equal(agents.filter(agent => agent.alive).length, 6);
  for (const agent of agents) {
    const budget = KELP_WATER_MODEL.speedMps * (ecology._active.get(agent.regionId).sim.lightLevel < .08 ? .25 : 1) * .1;
    maxXYZBudgetRatio = Math.max(maxXYZBudgetRatio, distance(agent.position, previous.get(agent.id)) / budget);
    for (const peer of agents) maxPairGapM = Math.max(maxPairGapM, distance(agent.position, peer.position));
    assert.ok(kelpWaterPositionValid(ecology.generator, agent.position, agent.sizeM, { ...ecology._mobileWaterContext(agent.position), elements: [] }), agent.id);
    supportChecks++;
    if (agent.regionId !== owners.get(agent.id) && !firstCrossing) firstCrossing = { atSec: tick * .1, owner: agent.regionId, id: agent.id };
  }
  if (!allCrossedAtSec && agents.every(agent => agent.regionId !== owners.get(agent.id))) allCrossedAtSec = tick * .1;
  if (tick % 1000 === 0) readings.push({ timeSec: tick * .1, owners: [...new Set(agents.map(agent => agent.regionId))],
    positions: agents.map(agent => ({ id: agent.id, ...agent.position, crossings: agent.crossings ?? 0,
      mobileTimeSec: agent.mobileTimeSec, lastFeedAt: agent.lastFeedAt })) });
}
const balanceError = ecology.snapshot().metrics.balanceError;
assert.ok(firstCrossing, 'finite natural route must cross at least once');
assert.ok(maxXYZBudgetRatio <= 1 + 1e-8 && balanceError < 1e-8);
assert.equal(sha(fs.readFileSync('src/kelpOceanEcology.js')), ecologySourceSHA256, 'source stayed fixed during replay');
assert.equal(sha(fs.readFileSync('src/kelpWaterCommunity.js')), waterCommunitySourceSHA256, 'helper stayed fixed during replay');
const result = { scope: 'isolated model replay with actual public old animal records, regional clocks and aggregate resources; hidden RNG/resource patch allocation reconstructed from seed, not a byte-exact old-state replay',
  seed: data.seed, seedType: typeof data.seed, groupId, inputPath, inputLabel,
  inputReceiptSHA256: sha(JSON.stringify(receipt)), ecologySourceSHA256, waterCommunitySourceSHA256,
  fixedStepSec: .1, durationSec, initial, firstCrossing, allCrossedAtSec, maxPairGapM, maxXYZBudgetRatio, supportChecks, readings, balanceError,
  checks: { sameSixIdentities: true, allAlive: true, finiteXYZBudget: true, finiteStaticSupports: true, foodLedgersClosed: true } };
fs.writeFileSync('output/validation/kelp-roaming-model-replay.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ firstCrossing, allCrossedAtSec, maxPairGapM, maxXYZBudgetRatio, supportChecks, balanceError }));
