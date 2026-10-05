import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = 'output/validation/';
const json = async name => JSON.parse(await readFile(base + name, 'utf8'));
async function files(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry =>
    entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]))).flat();
}
const current = await Promise.all((await files('src')).sort().map(async file => ({ file,
  sha256: createHash('sha256').update(await readFile(file)).digest('hex') })));
const baseline = await json('whole-habitat-before-hashes.json'), before = new Map(baseline.map(row => [row.file, row.sha256]));
const changed = current.filter(row => before.has(row.file) && before.get(row.file) !== row.sha256).map(row => row.file).sort();
const added = current.filter(row => !before.has(row.file)).map(row => row.file).sort();
assert.deepEqual(changed, ['src/kelpOceanEcology.js', 'src/world/KelpOceanChunks.js']);
assert.deepEqual(added, ['src/world/kelpOceanHabitatCover.js', 'src/world/kelpOceanHabitatMaterial.js']);
assert.ok(baseline.every(row => current.some(value => value.file === row.file)));
for (const [source, archive] of [['src/world/KelpOceanChunks.js', 'whole-habitat-KelpOceanChunks-before.js'],
  ['src/kelpOceanEcology.js', 'whole-habitat-kelpOceanEcology-before.js']]) {
  assert.equal(createHash('sha256').update(await readFile(base + archive)).digest('hex'), before.get(source));
}
const names = ['before', 'after-fixed', 'bed', 'v2-bed', 'cruise-start', 'cruise-end', 'paused', 'refreshed', 'revisit', 'final'];
const receipts = await Promise.all(names.map(async label => ({ label, ...await json(`whole-habitat-browser-${label}.json`) })));
const get = label => receipts.find(row => row.label === label);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function sameRecords(a, b) {
  assert.equal(a.paused, true); assert.equal(b.paused, true); assert.equal(a.speed, b.speed);
  // Loading order can change when the moving window is reconstructed. Sort
  // whole records; retain every field, including clocks, deaths and ledgers.
  const canonical = value => Array.isArray(value) ? [...value].sort((x,y)=>String(x.id).localeCompare(String(y.id))) : value;
  for (const key of ['seed', 'agents', 'regions', 'driftFoodPatches', 'events']) {
    assert.deepEqual(canonical(a.ocean.ecology[key]), canonical(b.ocean.ecology[key]), `${a.label}/${b.label}/${key}`);
  }
  // Regional resource records above are exact. Their public totals can sum in
  // a different order after reload, with only floating-point round-off.
  assert.deepEqual(Object.keys(a.ocean.ecology.resources).sort(),Object.keys(b.ocean.ecology.resources).sort());
  for(const key of Object.keys(a.ocean.ecology.resources)) {
    assert.ok(Math.abs(a.ocean.ecology.resources[key]-b.ocean.ecology.resources[key])<1e-14,`${key} aggregate round-off only`);
  }
}
sameRecords(get('before'), get('after-fixed'));
sameRecords(get('bed'), get('v2-bed'));
sameRecords(get('paused'), get('refreshed'));
for (const [a, b] of [[get('before'), get('after-fixed')], [get('bed'), get('v2-bed')], [get('paused'), get('refreshed')]]) {
  for (let i = 0; i < 3; i++) close(a.ocean.worldPosition[i], b.ocean.worldPosition[i]);
  for (const key of ['position', 'target']) for (let i = 0; i < 3; i++) close(a.camera[key][i], b.camera[key][i]);
  assert.deepEqual(a.ocean.renderOrigin, b.ocean.renderOrigin);
}
const start = get('cruise-start'), end = get('cruise-end');
assert.equal(start.paused, false); assert.equal(end.paused, false);
assert.equal(start.speed, 1); assert.equal(end.speed, 1);
assert.equal(start.ocean.cruising, true); assert.equal(end.ocean.cruising, false);
const distance = Math.hypot(end.ocean.worldPosition[0] - start.ocean.worldPosition[0], end.ocean.worldPosition[2] - start.ocean.worldPosition[2]);
assert.ok(distance > 64); assert.notEqual(start.ocean.chunkId, end.ocean.chunkId);
assert.ok(!end.ocean.streaming.loadedChunks.includes(get('before').ocean.chunkId), 'original observation owner genuinely unloads');
assert.ok(get('revisit').ocean.streaming.loadedChunks.includes(get('before').ocean.chunkId));
assert.deepEqual(get('before').ocean.ecology.agents.map(agent => agent.id).sort(),
  get('revisit').ocean.ecology.agents.map(agent => agent.id).sort(), 'same identities return after real travel, with naturally progressed states');
for (const row of receipts) {
  assert.equal(row.biomeId, 'kelp'); assert.deepEqual(row.errors, []);
  assert.equal(row.ocean.streaming.activeChunks, 9); assert.ok(row.ocean.streaming.drawCalls <= 54);
  assert.ok(row.ocean.generatorCache.chunks <= 32 && row.ocean.generatorCache.vertices <= 16384 && row.ocean.generatorCache.neighborhoods <= 32);
}
const final = get('final'); assert.equal(final.paused, false); assert.equal(final.speed, 1);
assert.equal(final.ocean.streaming.terrainAppearance.version, 'kelp-habitat-surface-v2');
const result = { sourceFiles: current.length, changed, added, oldSourcesUnchanged: baseline.length - changed.length,
  actualReceipts: receipts.length, upgradeRecordsPreserved: get('before').ocean.ecology.agents.length,
  preservedRegions: get('before').ocean.ecology.regions.length, pauseRefreshRecordsPreserved: get('paused').ocean.ecology.agents.length,
  finiteCruiseDistanceM: distance, cruiseStartPosition: start.ocean.worldPosition, cruiseEndPosition: end.ocean.worldPosition,
  cruiseFpsSamples: [start.fps, end.fps], finalFps: final.fps, sameIdentitiesOnRevisit: true,
  environmentHoursAcrossUpgrade: [get('before').environment.hour, get('after-fixed').environment.hour],
  finalPosition: final.ocean.worldPosition,
  limits: 'Complete public biological records are compared after sorting by identity; regional resources are exact, aggregate sums allow 1e-14 round-off from changed loading order. Runtime save counters reset on reload and the global display hour returns to 10. Hidden full-state equivalence is independent test evidence. Different clocks/views and paused FPS are not an isolated browser speed comparison. Cover is a surface cue, not new physical substrate or food. Finite travel and bounded resources do not guarantee long-run smoothness.' };
await writeFile(base + 'whole-habitat-source-hashes.json', JSON.stringify(current, null, 2) + '\n');
await writeFile(base + 'whole-habitat-browser-receipts.json', JSON.stringify(receipts, null, 2) + '\n');
await writeFile(base + 'whole-habitat-validation.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
