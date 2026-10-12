import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { OceanBackgroundRuntime } from '../src/oceanBackgroundRuntime.js';
import { createOceanRuntimeJobs } from '../src/oceanRuntimeJobs.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { isDeepStrictEqual } from 'node:util';
const difference = (a, b, path = '') => {
  if (isDeepStrictEqual(a, b)) return null;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return { path, actual: a, expected: b };
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const diff = difference(a[key], b[key], `${path}.${key}`); if (diff) return diff;
  }
  return { path, actualType: a.constructor.name, expectedType: b.constructor.name };
};
const equal = (a, b) => assert.equal(isDeepStrictEqual(a, b), true, JSON.stringify(difference(a, b)));

test('obsolete worker replies cannot overwrite a reset world, and failed jobs surface before the next advance', async () => {
  let reply, reject;
  const original = { id: '0,0', agents: [], ticks: 0 };
  const ecology = { seed: 'test', generator: { ridgeRevision: 0, registryStats: () => ({ ids: [] }), getRidgePlan: () => null },
    _generation: 0, _active: new Map([['0,0', original]]), _accumulator: 0, _activeTime: 0,
    _lockedRegions: new Set(), _planktonDesiredRegions: new Set(), _sceneSupports: new Map(), _habitatSupports: new Map(),
    _macroSupports: new Map(), _biodiversityBirthView: [], _backgroundBirthOptions: {} };
  const runtime = new OceanBackgroundRuntime(ecology, { preparation: {
    run: () => new Promise((resolve, failure) => { reply = resolve; reject = failure; }), dispose() {},
  } });
  runtime.advance(.1, { hour: 12 });
  ecology._generation++;
  const resetRow = { id: '0,0', agents: [], ticks: 0 };
  ecology._active.set('0,0', resetRow); runtime.reset();
  reply({ rows: [{ ...original, ticks: 1 }], activeTime: .1, accumulator: 0, planktonFaces: [] });
  await runtime.flush();
  assert.equal(ecology._active.get('0,0'), resetRow); assert.equal(resetRow.ticks, 0);
  runtime.advance(.1, { hour: 12 }); reject(new Error('worker failed'));
  await assert.rejects(runtime.flush(), /worker failed/);
  assert.throws(() => runtime.advance(.1, { hour: 12 }), /worker failed/);
});

test('background integration preserves native seed55 complete records, fractional clocks and persistence barriers', async () => {
  const seed = livingShallowsSeed('55'), chunks = new OceanChunks(seed, { livingGeology: true, wholeSeabed: true });
  const generator = chunks.generator, source = readFileSync('src/world/ReefWorld.js', 'utf8');
  const start = source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'), end = source.indexOf(');', start) + 1;
  class Options { constructor(s, g, options) { this.options = options; } }
  const options = new Function('OceanEcology', 'seed', 'return ' + source.slice(start, end))
    .call({ isLivingShallows: true, oceanWorldVariant: 'whole-seabed', oceanChunks: { generator } }, Options, seed).options;
  let saved;
  const store = { async load() { return null; }, async saveMany(w, rows) { saved = structuredClone(rows); } };
  const native = new OceanEcology(seed, generator, { ...options, store });
  await native.update({ x: 13100, z: 330 });
  const background = new OceanEcology(seed, generator, { ...options, store });
  background._active = new Map(structuredClone([...native._active]));
  background._planktonDesiredRegions = new Set(native._planktonDesiredRegions);
  const run = createOceanRuntimeJobs();
  const preparation = { async run(kind, payload) {
    await new Promise(resolve => setTimeout(resolve, 0));
    return structuredClone(run(structuredClone(payload)));
  }, dispose() {} };
  background.backgroundRuntime = new OceanBackgroundRuntime(background, { preparation });
  try {
    assert.equal(native.agents.length, 154);
    assert.equal(background.agents.length, 154);
    for (let batch = 0; batch < 5; batch++) {
      for (let frame = 0; frame < 6; frame++) {
        const env = { hour: 12 + (batch * 6 + frame) / 1000, currentMps: .15, turbidity: .25, foodSupply: 1 };
        native.step(.04, env); background.step(.04, env);
      }
      await background.backgroundRuntime.flush();
      equal([...background._active], [...native._active]);
      assert.equal(background._activeTime, native._activeTime);
      assert.equal(background._accumulator, native._accumulator);
    }
    const env = { hour: 12, currentMps: .15, turbidity: .25, foodSupply: 1 };
    native.step(.1, env); background.step(.1, env);
    // Requesting a new owner window bumps the revision before its queued load.
    // It must save all already-submitted ticks before changing active owners.
    background._revision++;
    await background.checkpoint();
    equal(saved, [...native._active]);
    assert.equal(background.backgroundRuntime.stats().queuedFrames, 0);
    const rows = structuredClone([...native._active]);
    assert.equal(native._validateSupportHistory(rows), true);
    assert.equal(await background.backgroundRuntime.withBarrier(() => background.backgroundRuntime.validateHistory('support', rows)), true);
    const [id, row] = rows.find(([, record]) => record.meadowLifeVersion === 1);
    assert.equal(native._validateActiveHistory(row, id, true), true);
    assert.equal(await background.backgroundRuntime.withBarrier(() => background.backgroundRuntime.validateHistory('active', [[id, row]])), true);
    const damaged = structuredClone(row); damaged.resources.algae = -1;
    assert.throws(() => native._validateActiveHistory(damaged, id, true), /Invalid saved/);
    await assert.rejects(background.backgroundRuntime.withBarrier(() => background.backgroundRuntime.validateHistory('active', [[id, damaged]])), /Invalid saved/);
    assert.equal(damaged.resources.algae, -1, 'corrupt history was rejected, not repaired');
    const [guildId, guildRow] = rows.find(([, record]) => record.reefGuildVersion === 1);
    assert.equal(native._validateRestoredMobileHistory(guildRow, guildId, true), true);
    const damagedGuild = structuredClone(guildRow); damagedGuild.reefGuild.preyOrganicUnits = -1;
    assert.throws(() => native._validateRestoredMobileHistory(damagedGuild, guildId, true), /Invalid saved reef-life/);
    await assert.rejects(background.backgroundRuntime.withBarrier(() => background.backgroundRuntime.validateHistory('active', [[guildId, damagedGuild]])), /Invalid saved/);
    assert.equal(damagedGuild.reefGuild.preyOrganicUnits, -1);
  } finally { await background.dispose(); await native.dispose(); chunks.dispose(); }
});
