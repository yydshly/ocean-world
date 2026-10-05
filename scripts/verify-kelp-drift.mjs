import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { kelpDriftFootprint, kelpDriftUrchinMouthWorld } from '../src/kelpDriftGeometry.js';

const dir = 'output/validation/', bytes = await readFile(`${dir}kelp-drift-browser-receipts.json`);
const receipts = JSON.parse(bytes), byLabel = new Map(receipts.map(row => [row.label, row.data]));
const ecology = data => data.ocean.ecology;
const sum = values => values.reduce((a, b) => a + b, 0);
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} vs ${b}`);
const nearUnits = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-12, `${label}: ${a} vs ${b}`);
const hashes = JSON.parse(await readFile(`${dir}kelp-drift-source-hashes.json`));
for (const row of hashes) assert.equal(createHash('sha256').update(await readFile(row.file)).digest('hex'), row.sha256, row.file);
let ledgerChecks = 0, supportedFoodReferences = 0, sourceTransfers = 0, actualIntakes = 0;
for (const { label, data } of receipts) {
  assert.deepEqual(data.errors, [], label);
  const e = ecology(data), terrain = createKelpOceanGenerator(e.seed);
  assert.equal(e.metrics.persistenceErrors, 0, label); assert.equal(e.metrics.loadingRegions, 0, label);
  assert.ok(e.regions.length <= 9); assert.equal(new Set(e.agents.map(a => a.id)).size, e.agents.length);
  for (const r of e.regions) {
    const animals = e.agents.filter(a => a.regionId === r.id);
    assert.equal(animals.length, r.agentCount); assert.ok(animals.length <= 20);
    const l = r.ledger;
    near(sum(Object.values(r.resources)), l.initial + l.input - l.ingested - l.exported, `${label}/${r.id} total food`);
    near(r.balanceError, 0, label); ledgerChecks++;
    if (r.driftCommunityVersion !== 1) continue;
    const patches = r.driftPatches, d = r.driftLedger;
    assert.ok(patches.length <= r.simulatedKelpRepresentatives); assert.ok(patches.length <= 3);
    near(sum(patches.map(p => p.stock)), d.transferredIn - d.ingested - d.returnedToDetritus, `${label}/${r.id} drift stock`);
    near(r.driftStock, sum(patches.map(p => p.stock)), label); near(r.driftBalanceError, 0, label);
    for (const key of ['transferredIn', 'ingested', 'returnedToDetritus']) near(d[key], sum(patches.map(p => p[key])), `${label} patch ${key}`);
    for (const p of patches) {
      assert.equal(p.regionId, r.id); assert.ok(p.stock >= 0 && p.stock <= 1);
      for (const point of kelpDriftFootprint(p, terrain).verticesWorld) {
        near(point.y, terrain.heightAt(point.x, point.z) + .001, `${label} actual food support`);
        assert.equal(Math.floor(point.x / 64), r.cx); assert.equal(Math.floor(point.z / 64), r.cz); supportedFoodReferences++;
      }
      if (p.lastTransfer) {
        const t = p.lastTransfer;
        assert.ok(t.transferredUnits > 0); assert.equal(t.hostId, p.hostId); assert.equal(t.sourcePatchId, p.sourcePatchId);
        nearUnits(t.sourceStockBefore - t.sourceStockAfter, t.sourceRemovedUnits, `${label} tissue debit`);
        nearUnits(t.sourceRemovedUnits, t.sourceStockBefore * .01 / 86400 * .1, `${label} original daily sloughing flux`);
        nearUnits(t.stockAfter - t.stockBefore, t.transferredUnits, `${label} drift credit`);
        nearUnits(t.sourceRemovedUnits, t.transferredUnits + t.fallbackDetritusUnits, `${label} one source transfer`); sourceTransfers++;
      }
    }
    for (const a of animals.filter(a => a.lastDriftIntake)) {
      assert.equal(a.speciesId, 'purple-urchin');
      const t = a.lastDriftIntake, p = patches.find(p => p.id === t.patchId); assert.ok(p);
      assert.equal(t.hostId, p.hostId); assert.equal(t.sourcePatchId, p.sourcePatchId);
      assert.ok(t.removedUnits > 0 && t.removedUnits <= .0009); assert.ok(t.contactDistanceM <= t.allowedDistanceM + 1e-10);
      nearUnits(t.stockBefore - t.stockAfter, t.removedUnits, `${label} actual stock debit`);
      nearUnits(t.energyAfter - t.energyBefore, t.gainUnits, `${label} actual condition gain`);
      nearUnits(t.gainUnits, Math.min(1 - t.energyBefore, t.removedUnits * 1.8), `${label} capped gain`);
      assert.equal(t.urchinPose.id, a.id); assert.equal(t.urchinPose.rockIndex, a.rockIndex);
      near(t.urchinPose.position.y, terrain.heightAt(t.urchinPose.position.x, t.urchinPose.position.z) + .003, `${label} historical root support`);
      near(gap(kelpDriftUrchinMouthWorld(t.urchinPose), t.mouthPosition), 0, `${label} historical real oral reference`);
      near(gap(kelpDriftFootprint(p, terrain).verticesWorld[t.referenceIndex], t.foodPosition), 0, `${label} actual food vertex`);
      near(gap(t.mouthPosition, t.foodPosition), t.contactDistanceM, `${label} historical contact gap`);
      assert.equal(t.unit, 'relative-organic-food-proxy-unit'); actualIntakes++;
    }
  }
}
const legacy = ecology(byLabel.get('legacy-paused-before-upgrade')), upgraded = ecology(byLabel.get('upgraded-paused'));
assert.equal(legacy.agents.length, 134); assert.equal(upgraded.agents.length, legacy.agents.length);
for (const old of legacy.agents) {
  const next = upgraded.agents.find(a => a.id === old.id); assert.ok(next);
  for (const [key, value] of Object.entries(old)) assert.deepEqual(next[key], value, `${old.id} original ${key}`);
}
for (const old of legacy.regions) {
  const next = upgraded.regions.find(r => r.id === old.id); assert.ok(next);
  for (const [key, value] of Object.entries(old)) assert.deepEqual(next[key], value, `upgrade ${old.id} original ${key}`);
  assert.equal(next.driftStock, 0); assert.ok(next.driftPatches.every(p => p.stock === 0));
}
const before = byLabel.get('ordinary-search-before'), after = byLabel.get('ordinary-fed-after-paused');
assert.equal(before.paused, true); assert.equal(after.paused, true);
assert.equal(before.speed, 4); assert.equal(after.speed, 1);
const fedAtFour = byLabel.get('ordinary-fed-at-4x');
assert.equal(fedAtFour.speed, 4); assert.equal(fedAtFour.paused, false);
const feeder = ecology(after).agents.find(a => a.regionId === '2,1' && a.lastDriftIntake);
assert.ok(feeder?.lastDriftIntake?.removedUnits > 0); assert.equal(feeder.speciesId, 'purple-urchin');
assert.ok(ecology(fedAtFour).agents.find(a => a.id === feeder.id)?.lastDriftIntake?.removedUnits > 0);
const initialOwner = ecology(before).regions.find(r => r.id === feeder.regionId);
const finalOwner = ecology(after).regions.find(r => r.id === feeder.regionId);
assert.ok(finalOwner.driftLedger.transferredIn > initialOwner.driftLedger.transferredIn);
assert.ok(finalOwner.driftLedger.ingested > initialOwner.driftLedger.ingested);
function same(leftLabel, rightLabel, ids) {
  const left = ecology(byLabel.get(leftLabel)), right = ecology(byLabel.get(rightLabel));
  for (const id of ids ?? left.regions.map(r => r.id)) {
    assert.deepEqual(right.regions.find(r => r.id === id), left.regions.find(r => r.id === id), `${leftLabel} → ${rightLabel} region ${id}`);
    assert.deepEqual(right.agents.filter(a => a.regionId === id), left.agents.filter(a => a.regionId === id), `${leftLabel} → ${rightLabel} animals ${id}`);
  }
}
same('ordinary-fed-after-paused', 'paused-repeat');
assert.ok(!ecology(byLabel.get('outside-unloaded')).regions.some(r => r.id === feeder.regionId));
same('paused-repeat', 'revisited-paused', [feeder.regionId]);
same('revisited-paused', 'refreshed-paused');
const final = byLabel.get('final-normal-scene'); assert.equal(final.paused, false); assert.equal(final.speed, 1);
const previous = new Map(JSON.parse(await readFile(`${dir}kelp-drift-before-hashes.json`)).map(row => [row.file, row.sha256]));
const report = { passed: true, verifiedAt: new Date().toISOString(), actualReceiptCount: receipts.length,
  ledgerChecks, supportedFoodReferences, sourceTransfers, actualIntakes, preservedOldPublicAnimals: legacy.agents.length,
  feederId: feeder.id, hostId: feeder.lastDriftIntake.hostId, intake: feeder.lastDriftIntake,
  observationSpeed: '4x until feeding was observed; returned to 1x before pause', ordinarySimulatedSeconds: finalOwner.timeSec - initialOwner.timeSec,
  transferredUnits: sum(ecology(after).regions.map(r => r.driftLedger.transferredIn)),
  ingestedUnits: sum(ecology(after).regions.map(r => r.driftLedger.ingested)), genuineUnloadedOwner: feeder.regionId,
  sourceFiles: hashes.length,
  changedSourceFiles: hashes.filter(r => previous.has(r.file) && previous.get(r.file) !== r.sha256).map(r => r.file),
  addedSourceFiles: hashes.filter(r => !previous.has(r.file)).map(r => r.file),
  receiptSha256: createHash('sha256').update(bytes).digest('hex'),
  limits: ['Actual browser checks use the frozen Vite development app; production build is separately verified.',
    'Every old public field is checked at upgrade. Complete hidden serialized records/RNG and exact authored seeds are tested independently.',
    'The supported fixed thin leaf footprint represents local stock, not biomass, full fall trajectories or litter abundance.',
    'Offscreen owners freeze. Rates, energy gains and density are qualitative, not a calibrated field ecosystem.',
    'Related tests do not fix the 11 historical failures outside their subset.'] };
await writeFile(`${dir}kelp-drift-validation.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, intake: undefined, limits: undefined }, null, 2));
