import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const baseline = read('output/validation/kelp-water-source-hashes.json');
const additions = ['src/deepOceanGeneration.js', 'src/deepOceanEcology.js', 'src/deepOceanNavigation.js',
  'src/world/DeepOceanChunks.js', 'src/world/DeepOceanAnimals.js'];
const frozen = Object.fromEntries([...Object.keys(baseline), ...additions].sort().map(path => [path, hash(path)]));
const changed = Object.keys(baseline).filter(path => baseline[path] !== frozen[path]);
assert.deepEqual(changed.sort(), ['src/OceanApp.jsx', 'src/deepSimulation.js', 'src/oceanExplorationMemory.js', 'src/world/ReefWorld.js']);
const tests = readFileSync('output/validation/deep-continuous-tests.txt', 'utf8');
const total = Number(tests.match(/^# tests (\d+)$/m)[1]);
assert.match(tests, /^# fail 0$/m); assert.match(tests, new RegExp(`^# pass ${total}$`, 'm'));
const build = readFileSync('output/validation/deep-continuous-build.txt', 'utf8');
assert.match(build, /built in/); assert.match(build, /Prepared Sites build/);
const independent = read('output/validation/deep-continuous-independent-check.json');
const receipt = read('output/validation/deep-continuous-check.json');
assert.equal(independent.status, 'passed-final-receipt');
assert.equal(independent.inputSHA256, hash('output/validation/deep-continuous-check.json'));
const final = receipt.snapshots.find(item => item.label === 'final').data;
assert.equal(final.biomeId, 'deep'); assert.equal(final.paused, false); assert.equal(final.speed, 1);
assert.equal(final.ocean.ecology.metrics.persistenceErrors, 0); assert.equal(final.errors.length, 0);
assert.ok(final.ocean.streaming.activeChunks <= 9); assert.ok(final.ocean.ecology.metrics.activeRegions <= 9);
const performance = read('output/validation/deep-support-cache-both.json');
assert.equal(performance.results[0].finalModelHash, performance.results[1].finalModelHash);
assert.deepEqual(performance.results[0].exactQueryFingerprint, performance.results[1].exactQueryFingerprint);
const summary = { passed: true, tests: total, snapshotCount: receipt.snapshots.length,
  modules: Number(build.match(/(\d+) modules transformed/)[1]),
  js: build.match(/assets\/(index-[\w-]+\.js)/)[1], css: build.match(/assets\/(index-[\w-]+\.css)/)[1],
  source: { previous: Object.keys(baseline).length, unchanged: Object.keys(baseline).length - changed.length,
    changed, added: additions, frozen: Object.keys(frozen).length },
  final: { runId: final.runId, fps: final.fps, viewport: final.viewport, position: final.ocean.worldPosition,
    origin: final.ocean.renderOrigin, ecology: final.ocean.ecology.metrics, cache: final.ocean.generatorCache },
  independent: { file: 'deep-continuous-independent-check.json', inputSHA256: independent.inputSHA256 },
  cacheCPU: { beforeMs: performance.results[0].meanFrameStepMs, afterMs: performance.results[1].meanFrameStepMs,
    exactModelHash: performance.results[1].finalModelHash },
  limits: ['Selected 3500 m habitat proxy, existing three taxonomic representatives; no co-occurrence or density calibration.',
    'Bounded active window; unloaded regional ecology freezes. Separate authored deep patch retains its original model.',
    'Navigation presets are near-bed observation heights; there is no full 3500 m descent simulation.',
    'Finite foot, fish support and camera endpoints; not whole-body or continuous-path collision proof.',
    'CPU cache benchmark is not browser FPS. Accelerated observation remains more expensive than normal 1x.',
    'Receipt includes visible region/agent diagnostics, not complete hidden food-patch/RNG or IndexedDB byte snapshots.'] };
writeFileSync('output/validation/deep-continuous-source-hashes.json', JSON.stringify(frozen, null, 2) + '\n');
writeFileSync('output/validation/deep-continuous-validation.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, tests: total, snapshots: receipt.snapshots.length, source: summary.source, final: summary.final }));
