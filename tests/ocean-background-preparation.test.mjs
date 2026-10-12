import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { nativePreparation } from './helpers/ocean-preparation-node.mjs';
import { OceanBackgroundPreparation } from '../src/oceanBackgroundPreparation.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { createReefValleyRegionPlans } from '../src/reefValleyRegion.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { expeditionPreparationPosition } from '../src/lifeExpedition.js';

test('background transport ignores stale replies, cancels work, retries failure and bounds timeout without publishing', async () => {
  const workers = [], background = new OceanBackgroundPreparation({ timeoutMs: 20, workerFactory: () => {
    const w = { messages: [], postMessage(m) { this.messages.push(m); }, terminate() { this.closed = true; } }; workers.push(w); return w;
  } });
  const first = background.run('generate', {}), w = workers[0];
  await assert.rejects(background.run('generate', {}), /one/);
  w.onmessage({ data: { id: -1, value: 'stale' } }); assert.equal(background.stats().pending, true);
  background.cancel(); await assert.rejects(first, { name: 'AbortError' }); assert.equal(w.closed, true);
  const retry = background.run('generate', {}); w.onerror({ message: 'late old worker exit' }); assert.equal(background.stats().pending, true);
  workers[1].onmessage({ data: { id: workers[1].messages[0].id, value: 42 } }); assert.equal(await retry, 42);
  const broken = background.run('generate', {}); workers[1].onerror({ message: 'worker exit' }); await assert.rejects(broken, /worker exit/);
  const declined = background.run('generate', {}); workers[2].onmessage({ data: { id: workers[2].messages[0].id, error: { name: 'RangeError', message: 'unsuitable native habitat' } } });
  await assert.rejects(declined, error => error instanceof RangeError && /native habitat/.test(error.message));
  await assert.rejects(background.run('generate', {}), /timed out/); assert.equal(workers[2].closed, true);
  background.dispose(); await assert.rejects(background.run('generate', {}), /disposed/);
});

test('lookahead requests only the next adjacent committed owner, scales with playback and freezes with pause or hidden playback', () => {
  const position = { x: 20, y: -3, z: 20 }, before = structuredClone(position);
  const sample = elapsed => ({ position: { x: 20 + elapsed * 2, y: -3, z: 20 } });
  const options = { elapsedSec: 0, durationSec: 240, playbackRate: 1, sample };
  assert.equal(Math.floor(expeditionPreparationPosition(position, options).x / 64), 1);
  assert.equal(Math.floor(expeditionPreparationPosition(position, { ...options, playbackRate: 4 }).x / 64), 1);
  assert.equal(expeditionPreparationPosition(position, { ...options, paused: true }), position);
  assert.equal(expeditionPreparationPosition(position, { ...options, hidden: true }), position);
  assert.equal(expeditionPreparationPosition(position, { ...options, sample: () => ({ position: { x: 250, y: -3, z: 20 } }) }), position);
  assert.equal(expeditionPreparationPosition(position, { ...options, elapsedSec: 240, sample: () => ({ position }) }), position);
  assert.deepEqual(position, before);
});

test('real worker produces exact macro terrain while the host loop runs; immutable validated context rejects corrupt terrain', async () => {
  const preparation = nativePreparation(), seed = livingShallowsSeed('55'), base = createLivingShallowsGenerator(seed);
  const generator = createLivingRidgeGenerator(base, { preparation }); let beats = 0;
  const timer = setInterval(() => beats++, 5);
  try {
    const plans = await generator.generateMacroPlans(8, 204, 4);
    assert.ok(beats > 20, 'host loop continued during native generation'); clearInterval(timer);
    const expected = createReefValleyRegionPlans(base, 204, 4);
    assert.ok(isDeepStrictEqual(plans, expected), 'complete worker terrain exact');
    const context = await generator.prepareReefValleyContextAsync(plans);
    const p = plans[0].group.routePath[20], before = generator.floorSurface(p.x, p.z);
    context(() => assert.equal(generator.chunk(plans[0].cx, plans[0].cz).ridgePlan.version, 8));
    assert.deepEqual(generator.floorSurface(p.x, p.z), before); assert.equal(generator.registryStats().size, 0);
    assert.throws(() => context(async () => {}), /synchronous/);
    const corrupt = structuredClone(plans); corrupt[0].elements[0].x += 1;
    await assert.rejects(generator.prepareReefValleyContextAsync(corrupt), /Invalid/);
    assert.equal(generator.registryStats().size, 0);
    const verdicts = await generator.validateMacroPlans(plans); assert.ok(verdicts.every(Boolean));
    assert.ok(Object.isFrozen(plans[0].elements[0].scale));
    generator.replaceRidgeOwners(plans.slice(0, 9)); assert.equal(generator.registryStats().size, 9);
    const other = structuredClone(plans[0]); other.elements[0].x += 1;
    assert.throws(() => generator.registerRidgePlan(other), /Invalid/);
  } finally { clearInterval(timer); preparation.dispose(); }
});
