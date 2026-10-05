import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { kelpWaterElements, kelpWaterPositionValid, kelpWaterDynamicClearance } from '../src/kelpWaterCommunity.js';

const dir = 'output/validation/', input = await readFile(`${dir}kelp-roaming-browser-receipts.json`);
const receipts = JSON.parse(input), byLabel = new Map(receipts.map(r => [r.label, r.data]));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const groupId = 'kelp-water-school:0,0:kelp:kelp-rock:5,0:0';
const group = d => d.ocean.ecology.agents.filter(a => a.groupId === groupId).sort((a,b) => a.id.localeCompare(b.id));
const regionFields = ['timeSec', 'resources', 'ledger', 'counters', 'agentCount', 'alive', 'waterAgentCount'];
const generators = new Map(), checks = { receipts: 0, staticWaterReferences: 0, regionLedgers: 0, finalDynamicReferences: 0 };
let finalMinimumClearanceM = Infinity;
for (const { label, data } of receipts) {
  const e = data.ocean.ecology, regions = new Map(e.regions.map(r => [r.id, r]));
  assert.deepEqual(data.errors, [], label); assert.equal(e.metrics.persistenceErrors, 0, label);
  assert.equal(e.metrics.loadingRegions, 0, label); assert.ok(Math.abs(e.metrics.balanceError) < 1e-8, label);
  assert.ok(e.regions.length <= 9, label); assert.equal(new Set(e.agents.map(a => a.id)).size, e.agents.length, label);
  const key = `${typeof e.seed}:${e.seed}`;
  if (!generators.has(key)) generators.set(key, createKelpOceanGenerator(e.seed));
  const generator = generators.get(key), anchors = new Map(e.agents.filter(a => a.hostSceneryId && a.hostAnchor).map(a => [a.hostSceneryId, a.hostAnchor]));
  for (const r of e.regions) {
    assert.ok(r.agentCount <= 20, `${label} ${r.id}: includes dead records`);
    assert.equal(e.agents.filter(a => a.regionId === r.id).length, r.agentCount);
    assert.ok(Math.abs(r.balanceError) < 1e-8); checks.regionLedgers++;
  }
  for (const a of e.agents.filter(a => a.alive && a.speciesId === 'blue-rockfish')) {
    const cx = Math.floor(a.position.x / 64), cz = Math.floor(a.position.z / 64);
    assert.equal(a.regionId, `${cx},${cz}`, `${label} ${a.id}: geographic owner`);
    assert.ok(kelpWaterPositionValid(generator, a.position, a.sizeM, { cx, cz, elements: [], ownerMarginM: a.waterRoamingVersion ? 0 : .6 }), `${label} ${a.id}: static references`);
    assert.ok(Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) <= .18 + 1e-8);
    if (a.waterRoamingVersion) assert.equal(a.timeSec, a.mobileTimeSec);
    checks.staticWaterReferences++;
    if (label === 'final-real-time') {
      const clearance = kelpWaterDynamicClearance(a.position, a.sizeM, { elements: kelpWaterElements(generator, cx, cz), elementContext: element => {
        const r = regions.get(`${Math.floor(element.x / 64)},${Math.floor(element.z / 64)}`);
        return r ? { timeSec: r.timeSec, environment: r.localEnvironment, anchor: anchors.get(element.id) ?? element.anchor } : { conservative: true };
      } });
      assert.ok(clearance >= -1e-8, `${label} ${a.id}: finite current frond references`);
      finalMinimumClearanceM = Math.min(finalMinimumClearanceM, clearance); checks.finalDynamicReferences++;
    }
  }
  checks.receipts++;
}

const legacy = byLabel.get('legacy-settled-paused-before-upgrade'), upgraded = byLabel.get('upgraded-settled-paused');
assert.equal(legacy.paused, true); assert.equal(upgraded.paused, true);
assert.equal(upgraded.ocean.ecology.agents.length, legacy.ocean.ecology.agents.length);
for (const old of legacy.ocean.ecology.agents) {
  const next = upgraded.ocean.ecology.agents.find(a => a.id === old.id); assert.ok(next);
  for (const [key, value] of Object.entries(old)) assert.deepEqual(next[key], value, `${old.id}: old ${key}`);
  if (old.speciesId === 'blue-rockfish') assert.equal(next.waterRoamingVersion, 1);
}
for (const old of legacy.ocean.ecology.regions) {
  const next = upgraded.ocean.ecology.regions.find(r => r.id === old.id); assert.ok(next);
  for (const key of regionFields) assert.deepEqual(next[key], old[key]);
}
function sameSavedGroup(beforeLabel, afterLabel) {
  const before = byLabel.get(beforeLabel), after = byLabel.get(afterLabel);
  assert.equal(before.paused, true); assert.equal(after.paused, true);
  assert.deepEqual(group(after), group(before), `${beforeLabel}→${afterLabel}: complete public fish records`);
  const owners = [...new Set(group(before).map(a => a.regionId))];
  for (const id of owners) {
    const a = before.ocean.ecology.regions.find(r => r.id === id), b = after.ocean.ecology.regions.find(r => r.id === id);
    assert.ok(a && b); for (const key of regionFields) assert.deepEqual(b[key], a[key], `${beforeLabel}→${afterLabel} ${id} ${key}`);
  }
  return { fish: group(before).length, owners };
}
const before = byLabel.get('normal-speed-before'), crossed = byLabel.get('normal-speed-crossed-paused');
assert.equal(before.speed, 1); assert.equal(crossed.speed, 1); assert.equal(crossed.following, true);
assert.equal(before.selectedAgentId, crossed.selectedAgentId);
const initial = group(before), moved = group(crossed); assert.equal(initial.length, 6);
assert.deepEqual(moved.map(a => a.id), initial.map(a => a.id));
for (const a of moved) {
  const old = initial.find(b => b.id === a.id);
  assert.equal(old.regionId, '0,0'); assert.equal(a.regionId, '1,-1'); assert.ok(a.crossings >= 1);
  assert.equal(a.birthRegionId, old.birthRegionId); assert.equal(a.groupId, old.groupId); assert.ok(a.mobileTimeSec > old.mobileTimeSec);
}
const newFeeds = moved.filter(a => a.lastFeedAt !== null && a.lastFeedAt !== initial.find(b => b.id === a.id).lastFeedAt).length;
assert.ok(newFeeds >= 1);
const pause = sameSavedGroup('normal-speed-crossed-paused', 'paused-observation-after');
const revisit = sameSavedGroup('unload-before', 'revisit-after');
assert.equal(group(byLabel.get('unloaded-away')).length, 0, 'actual active-window unload');
const refresh = sameSavedGroup('refresh-before', 'refreshed-after');
assert.notEqual(byLabel.get('refresh-before').runId, byLabel.get('refreshed-after').runId);
const finalCodeRefresh = sameSavedGroup('final-code-refresh-before', 'final-code-refreshed-after');
const freshBefore = byLabel.get('post-refresh-normal-speed-before'), final = byLabel.get('final-real-time');
assert.equal(final.paused, false); assert.equal(final.speed, 1); assert.equal(final.following, true);
assert.equal(final.selectedAgentId, freshBefore.selectedAgentId); assert.equal(group(final).length, 6);
assert.ok(group(final).some(a => Math.hypot(...['x','y','z'].map(k => a.position[k] - group(freshBefore).find(b => b.id === a.id).position[k])) > .01));
assert.ok(final.explorationMemory.points.some(p => p.label === '蓝岩鱼跨区观察点'));

const tests = await readFile(`${dir}kelp-roaming-related-tests.tap`, 'utf8');
assert.match(tests, /# tests 443\r?\n# suites 0\r?\n# pass 443\r?\n# fail 0/);
assert.match(await readFile(`${dir}kelp-roaming-focused-tests.tap`, 'utf8'), /# tests 21\r?\n# suites 0\r?\n# pass 21\r?\n# fail 0/);
assert.match(await readFile(`${dir}kelp-roaming-build.log`, 'utf8'), /Prepared Sites build/);
const replay = JSON.parse(await readFile(`${dir}kelp-roaming-model-replay.json`));
const sources = {};
async function collect(dir) { for (const f of await readdir(dir, { withFileTypes: true })) {
  const file = `${dir}/${f.name}`; if (f.isDirectory()) await collect(file); else sources[file] = sha(await readFile(file));
} }
await collect('src');
assert.equal(replay.ecologySourceSHA256, sources['src/kelpOceanEcology.js']);
assert.equal(replay.waterCommunitySourceSHA256, sources['src/kelpWaterCommunity.js']);
assert.equal(replay.inputReceiptSHA256, sha(JSON.stringify(receipts.find(r => r.label === replay.inputLabel))));
const previous = JSON.parse(await readFile(`${dir}kelp-roaming-before-hashes.json`));
const changed = Object.keys(sources).filter(file => sources[file] !== previous[file]).sort();
assert.deepEqual(changed, ['src/OceanApp.jsx','src/kelpOceanEcology.js','src/kelpWaterCommunity.js','src/kelpWaterSpecies.js']);
await writeFile(`${dir}kelp-roaming-source-hashes.json`, JSON.stringify(sources, null, 2));
const report = { status: 'passed-bounded-kelp-school-roaming', recordedAt: new Date().toISOString(), receiptsSha256: sha(input), checks,
  preservedLegacyAnimals: legacy.ocean.ecology.agents.length,
  normalSpeedCrossing: { groupId, fish: 6, from: '0,0', to: '1,-1', seconds: moved[0].mobileTimeSec - initial[0].mobileTimeSec,
    selectedId: crossed.selectedAgentId, newSuccessfulFeedingHistories: newFeeds }, pause, revisit, refresh, finalCodeRefresh,
  finalIndividualSeconds: group(final)[0].mobileTimeSec - group(freshBefore)[0].mobileTimeSec,
  finalMinimumClearanceM, relatedTests: 443, focusedTestsIncluded: 21, build: true, sourceFileCount: Object.keys(sources).length, changedSources: changed,
  reconstructedReplay: { path: `${dir}kelp-roaming-model-replay.json`, scope: replay.scope },
  scope: 'Finite actual DOM/complete public fish and saved owner summary checks. Hidden RNG, plant-only records and food patches are covered by model tests, not byte-for-byte browser comparisons. Geographic four-frond/footprint references; no full fish/leaf collision or infinite endurance claim. Loaded window only; unloaded state frozen.' };
await writeFile(`${dir}kelp-roaming-validation.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
