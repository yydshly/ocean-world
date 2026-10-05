import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';
import { seaSpiderReferencePose, anemoneTentacleReferences } from '../src/deepSeaSpiderGeometry.js';

const dir = 'output/validation/', speciesId = 'giant-sea-spider-group';
const bytes = await readFile(`${dir}deep-predator-browser-receipts.json`);
const receipts = JSON.parse(bytes), byLabel = new Map(receipts.map(row => [row.label, row.data]));
const ecology = data => data.ocean.ecology;
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} vs ${b}`);
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const sum = values => values.reduce((a, b) => a + b, 0);
const hashes = JSON.parse(await readFile(`${dir}deep-predator-source-hashes.json`));
for (const row of hashes) assert.equal(createHash('sha256').update(await readFile(row.file)).digest('hex'), row.sha256, row.file);
let ledgerChecks = 0, footChecks = 0, intakeChecks = 0;
for (const { label, data } of receipts) {
  assert.deepEqual(data.errors, [], label);
  const e = ecology(data), terrain = createDeepOceanGenerator(e.seed);
  assert.equal(e.metrics.persistenceErrors, 0, label); assert.equal(e.metrics.loadingRegions, 0, label);
  assert.equal(new Set(e.agents.map(a => a.id)).size, e.agents.length, label);
  assert.ok(e.regions.length <= 9);
  for (const r of e.regions) {
    const animals = e.agents.filter(a => a.regionId === r.id), native = animals.filter(a => a.speciesId !== speciesId), predators = animals.filter(a => a.speciesId === speciesId);
    assert.equal(animals.length, r.agentCount); assert.ok(animals.length <= 20); assert.ok(predators.length <= 1);
    const l = r.ledger, b = r.energyLedger;
    near(sum(Object.values(r.resources)), l.initial + l.input - l.ingested - l.exported, `${label}/${r.id} food`);
    near(sum(native.map(a => a.energy)), b.initial + b.feedingGain - b.maintenanceAndMotionDebit + b.clampCorrection - (b.predationTransferredOut ?? 0), `${label}/${r.id} native condition`);
    if (r.predatorEnergyLedger) {
      const p = r.predatorEnergyLedger;
      near(sum(predators.map(a => a.energy)), p.initial + p.transferredIn - p.metabolism - p.loss, `${label}/${r.id} predator condition`);
      near(p.transferredIn, b.predationTransferredOut ?? 0, `${label}/${r.id} paired transfer`);
      near(r.predatorEnergyBalanceError, 0, `${label}/${r.id} reported predator balance`);
    }
    near(r.balanceError, 0, label); near(r.energyBalanceError, 0, label); ledgerChecks++;
    for (const a of predators.filter(a => a.alive)) {
      const pose = seaSpiderReferencePose(a);
      near(gap(pose.bodyWorld, a.bodyReferenceWorld), 0, `${label} body`);
      near(gap(pose.mouthWorld, a.mouthReferenceWorld), 0, `${label} mouth`);
      for (const foot of pose.feetWorld) {
        near(foot.y, terrain.heightAt(foot.x, foot.z), `${label} actual foot`);
        assert.equal(Math.floor(foot.x / 64), r.cx); assert.equal(Math.floor(foot.z / 64), r.cz); footChecks++;
      }
      if (!a.lastPredation) continue;
      const intake = a.lastPredation;
      assert.ok(intake.removedUnits > 0); assert.ok(intake.contactDistanceM <= intake.allowedDistanceM + 1e-10);
      near(intake.preyEnergyBefore - intake.preyEnergyAfter, intake.removedUnits, `${label} actual prey debit`);
      near(intake.predatorEnergyAfter - intake.predatorEnergyBefore, intake.gainUnits, `${label} actual gain`);
      near(intake.gainUnits + intake.lossUnits, intake.removedUnits, `${label} transfer loss`);
      near(gap(intake.mouthPosition, intake.preyContactPosition), intake.contactDistanceM, `${label} contact distance`);
      assert.equal(intake.unit, 'dimensionless-condition-index');
      const reference = anemoneTentacleReferences(intake.preyPose, intake.timeSec, { currentMps: intake.currentMps }).find(point => point.referenceId === intake.referenceId);
      assert.ok(reference, `${label} actual canonical reference`);
      near(gap(reference, intake.preyContactPosition), 0, `${label} historical deformed tentacle`);
      intakeChecks++;
    }
  }
}
const legacy = ecology(byLabel.get('legacy-paused-before-upgrade')), upgraded = ecology(byLabel.get('upgraded-paused'));
assert.equal(legacy.agents.length, 73);
for (const old of legacy.agents) {
  const next = upgraded.agents.find(a => a.id === old.id); assert.ok(next);
  for (const [key, value] of Object.entries(old)) assert.deepEqual(next[key], value, `${old.id} old ${key}`);
}
for (const old of legacy.regions) {
  const next = upgraded.regions.find(r => r.id === old.id); assert.ok(next);
  for (const key of ['timeSec', 'resources', 'ledger', 'energyLedger', 'counters', 'suspendedParcelCount', 'primaryProduction', 'localEnvironment']) assert.deepEqual(next[key], old[key], `upgrade ${old.id} ${key}`);
  assert.equal(next.nativeAgentCount, old.agentCount);
}
assert.equal(upgraded.agents.filter(a => a.speciesId === speciesId).length, 2);
const before = byLabel.get('normal-search-before'), after = byLabel.get('normal-fed-after-paused');
assert.equal(before.speed, 1); assert.equal(after.speed, 1); assert.equal(before.paused, true); assert.equal(after.paused, true);
const chosenId = before.selectedAgentId, chosenBefore = ecology(before).agents.find(a => a.id === chosenId), chosenAfter = ecology(after).agents.find(a => a.id === chosenId);
assert.equal(chosenBefore.speciesId, speciesId); assert.equal(chosenBefore.lastPredation, null);
assert.ok(chosenAfter.lastPredation?.removedUnits > 0); assert.equal(after.following, true); assert.equal(after.selectedAgentId, chosenId);
const selectedIntake = chosenAfter.lastPredation, target = ecology(after).agents.find(a => a.id === selectedIntake.targetId);
assert.ok(target?.alive); assert.equal(target.speciesId, 'pom-pom-anemone');
if (chosenAfter.lastFeedAt === chosenAfter.timeSec) near(gap(seaSpiderReferencePose(chosenAfter).mouthWorld, selectedIntake.mouthPosition), 0, 'current actual mouth matches intake');
function same(leftLabel, rightLabel, ids) {
  const left = ecology(byLabel.get(leftLabel)), right = ecology(byLabel.get(rightLabel));
  const selected = ids ?? left.regions.map(r => r.id);
  for (const id of selected) {
    assert.deepEqual(right.regions.find(r => r.id === id), left.regions.find(r => r.id === id), `${leftLabel} → ${rightLabel} region ${id}`);
    assert.deepEqual(right.agents.filter(a => a.regionId === id), left.agents.filter(a => a.regionId === id), `${leftLabel} → ${rightLabel} animals ${id}`);
  }
}
same('normal-fed-after-paused', 'paused-repeat');
const owner = chosenAfter.regionId;
assert.ok(!ecology(byLabel.get('outside-unloaded')).regions.some(r => r.id === owner), 'selected owner genuinely leaves active window');
same('paused-repeat', 'revisited-paused', [owner]);
same('revisited-paused', 'refreshed-paused');
const final = byLabel.get('final-normal-following');
assert.equal(final.paused, false); assert.equal(final.speed, 1); assert.equal(final.following, true); assert.equal(final.selectedAgentId, chosenId);
const changed = JSON.parse(await readFile(`${dir}deep-predator-before-hashes.json`));
const previous = new Map(changed.map(r => [r.file, r.sha256]));
const report = { passed: true, verifiedAt: new Date().toISOString(), actualReceiptCount: receipts.length, ledgerChecks, footChecks, intakeChecks,
  preservedOldPublicAnimals: legacy.agents.length, addedPredators: 2, selectedId: chosenId, targetId: selectedIntake.targetId,
  normalSeconds: chosenAfter.timeSec - chosenBefore.timeSec, selectedIntake, preyStillAlive: target.alive,
  transferredUnits: sum(ecology(after).regions.map(r => r.energyLedger.predationTransferredOut ?? 0)),
  genuineUnloadedOwner: owner, sourceFiles: hashes.length,
  changedSourceFiles: hashes.filter(r => previous.has(r.file) && previous.get(r.file) !== r.sha256).map(r => r.file),
  addedSourceFiles: hashes.filter(r => !previous.has(r.file)).map(r => r.file),
  receiptSha256: createHash('sha256').update(bytes).digest('hex'),
  limits: ['Actual browser checks use the frozen Vite development app at localhost:4173; production build is separately verified.',
    'Browser upgrade proof covers every old public field; independent tests preserve complete serialized native records and exact authored seed baselines.',
    'Finite yaw-only feet/body/segments and 16 real tentacle tips are references, not full articulated collision or biological mass.',
    'Unloaded owners freeze; only local loaded predators run. Field density, co-occurrence and rates are not calibrated.',
    'Related tests do not imply that the 11 historical failures outside this subset have been fixed.'] };
await writeFile(`${dir}deep-predator-validation.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: true, actualReceiptCount: receipts.length, ledgerChecks, footChecks, intakeChecks,
  normalSeconds: report.normalSeconds, transferredUnits: report.transferredUnits, preservedOldPublicAnimals: 73, addedPredators: 2, sourceFiles: hashes.length }, null, 2));
