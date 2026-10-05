import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OceanEcology } from '../src/oceanEcology.js';
import { createOceanGenerator, OCEAN_SURFACE_Y } from '../src/oceanGeneration.js';

const inputPath = 'output/validation/pelagic-roaming-browser-receipts.json';
const inputLabel = 'legacy-settled-paused-before-upgrade';
const receipt = JSON.parse(fs.readFileSync(inputPath, 'utf8')).find(item => item.label === inputLabel);
assert.ok(receipt, 'actual legacy browser record is required');
const data = receipt.data.ocean.ecology;
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const ecology = new OceanEcology(data.seed, createOceanGenerator(data.seed), {
  // No browser storage or population changes: this is an isolated model replay.
  store: { available: true, async saveMany() {}, async save() {} },
});
for (const record of data.regions) {
  const region = clone(record);
  region.ticks = Math.round(region.timeSec * 10);
  region.agents = clone(data.agents.filter(agent => agent.regionId === record.id));
  region.events = clone(data.events.filter(event => event.regionId === record.id));
  ecology._upgradePelagicMobility(region);
  ecology._active.set(region.id, region);
}
const groupId = 'pelagic-school:rock:45,-7';
const school = () => ecology.agents.filter(agent => agent.groupId === groupId);
const initial = school().map(agent => ({ id: agent.id, owner: agent.regionId,
  position: { ...agent.position }, mobileTimeSec: agent.mobileTimeSec,
  lastFeedAt: agent.lastFeedAt, nextBite: agent.nextBite, energy: agent.energy }));
const identities = initial.map(agent => agent.id).sort();
assert.equal(initial.length, 5);
let firstCrossing = null, maxPairGapM = 0, maxCompleteBudgetRatio = 0;
const readings = [];
for (let tick = 1; tick <= 3000; tick++) {
  const previous = new Map(school().map(agent => [agent.id, { ...agent.position }]));
  ecology.step(.1, receipt.data.environment);
  const agents = school();
  assert.deepEqual(agents.map(agent => agent.id).sort(), identities);
  assert.equal(agents.filter(agent => agent.alive).length, 5);
  for (const agent of agents) {
    const before = previous.get(agent.id);
    const environment = ecology.environmentField.sample(before.x, before.z, receipt.data.environment,
      OCEAN_SURFACE_Y - before.y);
    const budgetM = .025 + Math.hypot(environment.currentVector.x, environment.currentVector.z) * .004;
    maxCompleteBudgetRatio = Math.max(maxCompleteBudgetRatio, distance(agent.position, before) / budgetM);
    for (const peer of agents) maxPairGapM = Math.max(maxPairGapM, distance(agent.position, peer.position));
    if (agent.crossings && !firstCrossing) firstCrossing = { atSec: tick * .1, owner: agent.regionId, id: agent.id };
  }
  if (tick % 1000 === 0) readings.push({ timeSec: tick * .1,
    owners: [...new Set(agents.map(agent => agent.regionId))],
    positions: agents.map(agent => ({ id: agent.id, ...agent.position,
      crossings: agent.crossings ?? 0, mobileTimeSec: agent.mobileTimeSec, lastFeedAt: agent.lastFeedAt })) });
}
const balanceError = ecology.snapshot().metrics.balanceError;
assert.ok(firstCrossing && firstCrossing.owner === '6,-1');
assert.ok(readings[0].owners.length === 1 && readings[0].owners[0] === '6,-1');
assert.ok(maxPairGapM <= 8 && maxCompleteBudgetRatio <= 1 + 1e-8);
assert.ok(balanceError < 1e-8);
const result = {
  scope: 'isolated 300-second replay of the actual paused nine-owner legacy browser record; no forced positions or targets',
  seed: data.seed, seedType: typeof data.seed, groupId,
  inputPath, inputLabel, inputReceiptSHA256: sha(JSON.stringify(receipt)),
  ecologySourceSHA256: sha(fs.readFileSync('src/oceanEcology.js')),
  fixedStepSec: .1, durationSec: 300, environment: receipt.data.environment,
  initial, firstCrossing, maxPairGapM, maxCompleteBudgetRatio, readings, balanceError,
  checks: { sameFiveIdentities: true, allAlive: true, allArrivedBy100Sec: true,
    finiteCompleteXYZPlusResidualCurrentBudget: true, coherentNeighbourhood: true, foodLedgersClosed: true },
};
fs.writeFileSync('output/validation/pelagic-roaming-model-replay.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ firstCrossing, maxPairGapM, maxCompleteBudgetRatio, balanceError, identities: identities.length }));
