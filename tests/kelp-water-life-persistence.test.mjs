import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { KelpOceanEcology } from '../src/kelpOceanEcology.js';
import { validateKelpWaterLifeRecord, explainKelpWaterLifeRecord, kelpWaterLifeFailureMessage, kelpWaterLifePositionValid } from '../src/kelpWaterLife.js';

const point = { x: 922, z: -96 }, clone = value => structuredClone(value);
class MemoryStore {
  available = true; records = new Map();
  async load(world, id) { return clone(this.records.get(`${world}|${id}`) ?? null); }
  async saveMany(world, entries) {
    const next = new Map(this.records);
    for (const [id, record] of entries) next.set(`${world}|${id}`, clone(record));
    this.records = next;
  }
}
function fixture(store = new MemoryStore()) {
  const generator = createKelpOceanGenerator('55', { forestBelt: true });
  const ecology = new KelpOceanEcology('55', generator, { store, visitors: true, understory: true,
    forestBelt: true, kelpSeascape: true, benthicLife: true, waterLife: true, nearBottomLife: true, understoryLife: true });
  return { generator, ecology, store };
}
const records = ecology => [...ecology._active.values()].map(r => ecology._record(r)).sort((a, b) => a.id.localeCompare(b.id));

test('production seed55 detects its moving-plant failure without overwriting history and cold-replays the last valid complete window', async () => {
  const f = fixture(); assert.equal(await f.ecology.update(point), true);
  const roster = records(f.ecology).map(r => [r.id, r.kelpWaterLife.addedIds]);
  assert.equal(roster.reduce((n, [, ids]) => n + ids.length, 0), 18);
  let expected = records(f.ecology), committed = clone([...f.store.records]), failureTick = null;
  for (let tick = 1; tick <= 300; tick++) {
    f.ecology.step(.1, { currentMps: .18, foodSupply: 1, hour: 14 });
    if (f.ecology.snapshot().metrics.storageError) { failureTick = tick; break; }
    if (tick % 100 === 0) {
      assert.equal(await f.ecology.checkpoint(), true);
      for (const r of f.ecology._active.values()) {
        assert.equal(r.sim.timeSec, tick * .1);
        assert.equal(r.kelpWaterLife.lastTickSec, r.sim.timeSec);
        assert.equal(validateKelpWaterLifeRecord(f.ecology._record(r), r, { generator: f.generator }), true);
        for (const a of r.kelpWaterLifeAgents) assert.equal(kelpWaterLifePositionValid(f.generator, r, a,
          a.position, a.heading, a.pitch, { future: false }), true, `${tick}/${a.id}`);
        assert.ok(Math.abs(r.sim.metrics.resourceBudgetError) < 1e-8);
      }
      expected = records(f.ecology); committed = clone([...f.store.records]);
    }
  }
  assert.ok(failureTick > 200 && failureTick <= 263, 'strict end-of-tick guard detects the failure before the old clock stalls');
  assert.match(f.ecology.snapshot().metrics.storageError, /15,-1.*last saved animals and inventory were preserved/);
  assert.deepEqual(records(f.ecology).map(r => [r.id, r.kelpWaterLife.addedIds]), roster);
  const failed = f.ecology._record(f.ecology._active.get('15,-1'));
  f.ecology.step(.1);
  assert.deepEqual(f.ecology._record(f.ecology._active.get('15,-1')), failed, 'the failed owner remains frozen');
  assert.equal(await f.ecology.checkpoint(), false);
  assert.deepEqual([...f.store.records], committed);
  const cold = fixture(f.store);
  assert.equal(await cold.ecology.update(point), true);
  assert.deepEqual(records(cold.ecology), expected);
  assert.ok(expected.every(r => r.state.timeSec === 20));
  cold.ecology.step(.1);
  assert.equal(cold.ecology.snapshot().metrics.storageError, null);
  await mkdir('output/validation/kelp-persistence-guard', { recursive: true });
  await writeFile('output/validation/kelp-persistence-guard/summary.json', JSON.stringify({ seed: '55', point,
    productionFlags: ['visitors','understory','forestBelt','kelpSeascape','benthicLife','waterLife','nearBottomLife','understoryLife'],
    actualFailureSec: failureTick * .1, lastValidCommittedSec: 20, waterLifeIndividuals: 18,
    frozenOwner: '15,-1', failedCheckpointRejected: true, committedRecordsUnchanged: true,
    completeColdWindowReplayed: true, coldContinuationSec: 20.1,
    target90SecondContinuationAchieved: false,
    scope: 'Persistence protection only; the moving-plant controller failure and previously inconsistent historical records are not repaired.'
  }, null, 2) + '\n');
});

test('a failed water-life clock refuses a checkpoint and preserves the last complete committed history', async () => {
  const f = fixture(); assert.equal(await f.ecology.update(point), true);
  const committed = clone([...f.store.records]);
  const r = f.ecology._active.get('15,-1');
  // A shared-clock/controller mismatch is a failure, never a migration or refill.
  r.sim.step(.1);
  assert.equal(await f.ecology.checkpoint(), false);
  assert.deepEqual([...f.store.records], committed);
  assert.match(f.ecology.snapshot().metrics.storageError, /last saved animals and inventory were preserved/);
  const cold = fixture(f.store); assert.equal(await cold.ecology.update(point), true);
  assert.equal(cold.ecology._active.get('15,-1').sim.timeSec, 0);
  assert.deepEqual([...f.store.records], committed);
});

test('a failed owner cannot write even a valid-looking frame or transfer a legacy swimmer in either direction', async () => {
  const f = fixture(); assert.equal(await f.ecology.update(point), true);
  const committed = clone([...f.store.records]), failed = f.ecology._active.get('15,-1');
  const other = [...f.ecology._active.values()].find(r => r.id !== failed.id && r.waterAgents.some(a => f.ecology._waterMobile(a)));
  assert.ok(other);
  f.ecology._failWaterLifeStep(failed);
  assert.equal(validateKelpWaterLifeRecord(f.ecology._record(failed), failed, { generator: f.generator }), true);
  assert.equal(await f.ecology.checkpoint(), false);
  assert.deepEqual([...f.store.records], committed);
  const incoming = other.waterAgents.find(a => f.ecology._waterMobile(a));
  const outgoing = failed.waterAgents.find(a => f.ecology._waterMobile(a));
  assert.ok(outgoing);
  const failedBefore = f.ecology._record(failed), sourceIds = other.waterAgents.map(a => a.id);
  f.ecology._waterTransfers.push({ agent: incoming, owner: other, destination: failed,
    position: incoming.position, previous: incoming.position, dt: .1 },
  { agent: outgoing, owner: failed, destination: other, position: outgoing.position, previous: outgoing.position, dt: .1 });
  f.ecology._applyWaterTransfers();
  assert.deepEqual(f.ecology._record(failed), failedBefore);
  assert.deepEqual(other.waterAgents.map(a => a.id), sourceIds);
  assert.equal(f.ecology._waterTransfers.length, 0);
  assert.deepEqual([...f.store.records], committed);
});

test('strict recovery explains a mismatched historical clock and preserves all original disk fields', async () => {
  const f = fixture(); assert.equal(await f.ecology.update(point), true);
  const region = f.ecology._active.get('15,-1'), invalid = f.ecology._record(region);
  invalid.kelpWaterLife.lastTickSec = 26.2;
  invalid.kelpWaterLife.counters.ticks = 262;
  const original = clone(invalid), diagnostic = explainKelpWaterLifeRecord(invalid, region, { generator: f.generator });
  assert.equal(diagnostic.valid, false);
  assert.equal(diagnostic.reason, 'community-clock-mismatch');
  assert.equal(diagnostic.ownerId, '15,-1');
  assert.equal(diagnostic.ownerTimeSec, 0);
  assert.equal(diagnostic.communityTimeSec, 26.2);
  assert.equal(diagnostic.recovery, 'original-record-retained-no-automatic-repair');
  assert.match(kelpWaterLifeFailureMessage(diagnostic), /15,-1.*时钟.*不一致.*26\.2.*不自动重生或改写/);
  assert.throws(() => f.ecology._restore(invalid, 15, -1), /Invalid saved kelp water-life community.*15,-1.*不一致/);
  assert.deepEqual(invalid, original);
  assert.equal(validateKelpWaterLifeRecord(invalid, region, { generator: f.generator }), false);
});

test('read-only recovery diagnostics share the original full validator instead of accepting simplified records', async () => {
  const f = fixture(); assert.equal(await f.ecology.update(point), true);
  const region = f.ecology._active.get('15,-1'), saved = f.ecology._record(region), original = clone(saved);
  assert.deepEqual(explainKelpWaterLifeRecord(saved, region, { generator: f.generator }), {
    valid: true, reason: null, ownerId: '15,-1', individualId: null,
    ownerTimeSec: 0, communityTimeSec: 0, tickCount: 0, recovery: 'unchanged-record-admissible',
  });
  for (const corrupt of [r => { r.kelpWaterLife.addedIds.pop(); },
    r => { r.kelpWaterLifeAgents[0].velocity.y = 1; },
    r => { r.kelpWaterLifeAgents[0].kelpWaterLifeHostId = 'forged'; },
    r => { r.kelpWaterLife.counters.consumedUnits += 1; },
    r => { r.kelpWaterLife.extra = true; r.kelpWaterLifeUnknown = 1; }]) {
    const row = clone(saved); corrupt(row); const before = clone(row);
    assert.equal(explainKelpWaterLifeRecord(row, region, { generator: f.generator }).valid, false);
    assert.equal(validateKelpWaterLifeRecord(row, region, { generator: f.generator }), false);
    assert.deepEqual(row, before);
  }
  assert.deepEqual(saved, original);
});
