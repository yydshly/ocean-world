import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { oceanOverviewObservation } from '../src/oceanOverview.js';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';

async function paths(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry =>
    entry.isDirectory() ? paths(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]))).flat();
}
const current = await Promise.all((await paths('src')).sort().map(async file => ({ file,
  sha256: createHash('sha256').update(await readFile(file)).digest('hex') })));
const baseline = JSON.parse(await readFile('output/validation/ocean-overall-before-hashes.json', 'utf8'));
const before = new Map(baseline.map(row => [row.file, row.sha256]));
const changed = current.filter(row => before.has(row.file) && before.get(row.file) !== row.sha256).map(row => row.file).sort();
const added = current.filter(row => !before.has(row.file)).map(row => row.file).sort();
assert.deepEqual(changed, ['src/OceanApp.jsx', 'src/world/KelpOceanChunks.js', 'src/world/ReefWorld.js']);
assert.deepEqual(added, ['src/oceanOverview.js', 'src/world/kelpAnimationVisibility.js']);
assert.ok(baseline.every(row => current.some(value => value.file === row.file)), 'no old source removed');
await writeFile('output/validation/ocean-overall-source-hashes.json', JSON.stringify(current, null, 2) + '\n');

const receipts = JSON.parse(await readFile('output/validation/ocean-overall-browser-receipts.json', 'utf8'));
const find = label => { const value = receipts.find(row => row.label === label); assert.ok(value, label); return value; };
const factories = { reef: createOceanGenerator, kelp: createKelpOceanGenerator, deep: createDeepOceanGenerator };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);
const pairs = [];
for (const biome of ['reef', 'kelp', 'deep']) {
  const a = find(`${biome}-stable-paused-before-overview`), b = find(`${biome}-stable-paused-after-overview`);
  assert.equal(a.biomeId, biome); assert.equal(b.biomeId, biome);
  assert.equal(a.paused, true); assert.equal(b.paused, true);
  assert.equal(a.speed, b.speed); assert.deepEqual(a.environment, b.environment);
  assert.deepEqual(a.metrics, b.metrics); assert.deepEqual(a.ocean.ecology, b.ocean.ecology);
  assert.deepEqual(a.ocean.renderOrigin, b.ocean.renderOrigin);
  assert.equal(a.ocean.chunkId, b.ocean.chunkId); assert.equal(b.ocean.streaming.activeChunks, 9);
  assert.equal(b.ocean.observationLayer, 'free'); assert.equal(b.following, false);
  assert.equal(b.selectedAgentId, null); assert.deepEqual(b.errors, []);
  const generator = factories[biome](a.ocean.ecology.seed);
  const [x, y, z] = a.ocean.worldPosition;
  const direction = { x: a.camera.target[0] - a.camera.position[0], z: a.camera.target[2] - a.camera.position[2] };
  const expected = oceanOverviewObservation({ x, y, z }, direction, { biome, surfaceY: a.surfaceY,
    floorHeight: (wx, wz) => generator.floorSurface(wx, wz).height,
    safeHeight: (wx, wz) => generator.heightForCamera(wx, wz) });
  assert.ok(expected);
  ['x', 'y', 'z'].forEach((axis, index) => close(b.ocean.worldPosition[index], expected.position[axis]));
  close(b.camera.target[0] + b.ocean.renderOrigin.x, expected.target.x);
  close(b.camera.target[1], expected.target.y);
  close(b.camera.target[2] + b.ocean.renderOrigin.z, expected.target.z);
  assert.ok(b.ocean.worldPosition[1] >= generator.heightForCamera(x, z) + .7 - 1e-8);
  pairs.push({ biome, animalsPreserved: a.ocean.ecology.agents.length,
    regionsPreserved: a.ocean.ecology.regions.length, publicEcologyExact: true, position: b.ocean.worldPosition });
}
const travelA = find('kelp-final-before-run'), travelB = find('kelp-final-after-short-cruise');
const travelDistance = Math.hypot(travelB.ocean.worldPosition[0] - travelA.ocean.worldPosition[0],
  travelB.ocean.worldPosition[2] - travelA.ocean.worldPosition[2]);
assert.ok(travelDistance > 64); assert.notEqual(travelA.ocean.chunkId, travelB.ocean.chunkId);
assert.equal(travelB.ocean.streaming.activeChunks, 9); assert.equal(travelB.speed, 1);
const final = receipts.at(-1); assert.equal(final.biomeId, 'kelp'); assert.equal(final.paused, false);
assert.equal(final.speed, 1); assert.deepEqual(final.errors, []);
const result = { sourceFiles: current.length, changed, added, oldSourcesUnchanged: baseline.length - changed.length,
  actualReceipts: receipts.length, pausedOverviewPairs: pairs, finiteCruiseDistanceM: travelDistance,
  final: { biome: final.biomeId, paused: final.paused, speed: final.speed, fps: final.fps, position: final.ocean.worldPosition },
  limits: 'Public regional data and finite observation placements only; hidden native state is covered by independent tests. Macro views do not guarantee fauna, canopy or unobstructed landscape in every heading. Browser views and clocks differ between performance samples.' };
await writeFile('output/validation/ocean-overall-validation.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
