import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';

const dir = 'output/validation/', bytes = await readFile(`${dir}pelagic-roaming-browser-receipts.json`);
const receipts = JSON.parse(bytes), byLabel = new Map(receipts.map(r => [r.label, r.data]));
const hash = value => createHash('sha256').update(value).digest('hex');
const groupId = 'pelagic-school:rock:45,-7', group = d => d.ocean.ecology.agents.filter(a => a.groupId === groupId).sort((a,b) => a.id.localeCompare(b.id));
const regionFields = ['timeSec', 'resources', 'ledger', 'counters', 'agentCount', 'alive'];
const checks = { receipts: 0, animalSupports: 0, regionLedgers: 0 };
const generators = new Map();
for (const { label, data } of receipts) {
  const ecology = data.ocean.ecology;
  assert.deepEqual(data.errors, [], label); assert.equal(ecology.metrics.persistenceErrors, 0, label);
  assert.ok(Math.abs(ecology.metrics.balanceError) < 1e-8, label);
  assert.ok(ecology.regions.length <= 9, label);
  assert.equal(new Set(ecology.agents.map(a => a.id)).size, ecology.agents.length, `${label}: unique IDs`);
  const key = `${typeof ecology.seed}:${ecology.seed}`;
  if (!generators.has(key)) generators.set(key, createOceanGenerator(ecology.seed));
  const generator = generators.get(key);
  for (const region of ecology.regions) {
    assert.ok(region.agentCount <= 20, `${label} ${region.id}: capacity includes deaths`);
    assert.ok(Math.abs(region.balanceError) < 1e-8); checks.regionLedgers++;
  }
  for (const a of ecology.agents.filter(a => a.alive && a.fusilierRoamingVersion >= 1)) {
    assert.equal(a.regionId, `${Math.floor(a.position.x/64)},${Math.floor(a.position.z/64)}`, `${label} ${a.id}: geographic owner`);
    assert.ok(a.position.y >= oceanSupportHeight(generator, a.position.x, a.position.z, { avoidCoral: true }) + 1 - 1e-8, `${label} ${a.id}: support`);
    assert.ok(a.position.y <= 6.5 + 1e-8); assert.equal(a.timeSec, a.mobileTimeSec); checks.animalSupports++;
  }
  checks.receipts++;
}

const legacy = byLabel.get('legacy-settled-paused-before-upgrade'), upgraded = byLabel.get('upgraded-settled-paused');
assert.equal(legacy.paused, true); assert.equal(upgraded.paused, true);
assert.equal(upgraded.ocean.ecology.agents.length, legacy.ocean.ecology.agents.length);
for (const old of legacy.ocean.ecology.agents) {
  const next = upgraded.ocean.ecology.agents.find(a => a.id === old.id); assert.ok(next);
  for (const [key, value] of Object.entries(old)) assert.deepEqual(next[key], value, `${old.id}: preserved old ${key}`);
  if (old.speciesId === 'yellowtail-fusilier') assert.equal(next.fusilierRoamingVersion, 1);
}
for (const old of legacy.ocean.ecology.regions) {
  const next = upgraded.ocean.ecology.regions.find(r => r.id === old.id); assert.ok(next);
  for (const key of regionFields) assert.deepEqual(next[key], old[key]);
}

function unchangedGroup(beforeLabel, afterLabel) {
  const before = byLabel.get(beforeLabel), after = byLabel.get(afterLabel);
  assert.equal(before.paused, true); assert.equal(after.paused, true);
  assert.deepEqual(group(after), group(before), `${beforeLabel}→${afterLabel}: full selected cohort`);
  const owners = new Set(group(before).map(a => a.regionId));
  for (const id of owners) {
    const a = before.ocean.ecology.regions.find(r => r.id === id), b = after.ocean.ecology.regions.find(r => r.id === id);
    assert.ok(a && b, `both receipts contain ${id}`);
    for (const key of regionFields) assert.deepEqual(b[key], a[key], `${beforeLabel}→${afterLabel} ${id} ${key}`);
  }
  return { animals: group(before).length, owners: [...owners] };
}

const start = byLabel.get('normal-speed-before'), crossed = byLabel.get('normal-speed-crossed-paused');
assert.equal(start.speed, 1); assert.equal(crossed.speed, 1);
assert.equal(start.selectedAgentId, crossed.selectedAgentId); assert.equal(crossed.following, true);
const initial = group(start), final = group(crossed); assert.equal(initial.length, 5);
assert.deepEqual(final.map(a=>a.id), initial.map(a=>a.id));
for (const a of final) {
  const b = initial.find(b => b.id === a.id);
  assert.equal(b.regionId, '5,-1'); assert.equal(a.regionId, '6,-1'); assert.ok(a.crossings >= 1);
  assert.ok(a.mobileTimeSec > b.mobileTimeSec); assert.ok(a.lastFeedAt > b.lastFeedAt);
  assert.equal(a.birthRegionId, b.birthRegionId); assert.equal(a.groupId, b.groupId);
}
const pause = unchangedGroup('normal-speed-crossed-paused', 'paused-observation-after');
const revisit = unchangedGroup('unload-before', 'revisit-after');
assert.ok(!group(byLabel.get('unloaded-away')).length, 'selected cohort actually left the loaded window');
const refresh = unchangedGroup('refresh-before', 'refreshed-after');

const log = await readFile(`${dir}pelagic-roaming-related-tests.tap`, 'utf8');
const tests = /# tests (\d+)\r?\n# suites \d+\r?\n# pass (\d+)\r?\n# fail (\d+)/.exec(log);
assert.ok(tests); assert.equal(tests[1], '422'); assert.equal(tests[2], '421'); assert.equal(tests[3], '1');
const cases = text => [...text.matchAll(/^(ok|not ok) \d+ - (.+)\r?$/gm)].map(m => ({passed:m[1]==='ok',name:m[2].trim()}));
const failed = cases(log).filter(t=>!t.passed);
assert.equal(failed.length, 1);
assert.equal(failed[0].name, 'the new regional catalog identifies a sourced 25cm planktivore without changing the shallow catalog');
// The only initial failure was the old local-only prose boundary. Preserve the
// raw 421/422 result; verify that same case, and its whole catalog file, passed
// after adapting the approved capability statement. No model source changed.
const rerun = await readFile(`${dir}pelagic-roaming-catalog-rerun.tap`, 'utf8');
assert.match(rerun, /# tests 8\r?\n# suites 0\r?\n# pass 8\r?\n# fail 0/);
assert.ok(cases(rerun).some(t=>t.passed&&t.name===failed[0].name));
assert.match(await readFile(`${dir}pelagic-roaming-build.log`, 'utf8'), /Prepared Sites build/);
const sources = {};
async function collect(path) { for (const f of await readdir(path, {withFileTypes:true})) {
  const file = `${path}/${f.name}`; if (f.isDirectory()) await collect(file); else sources[file] = hash(await readFile(file));
} }
await collect('src');
const oldSources = JSON.parse(await readFile(`${dir}pelagic-roaming-before-hashes.json`, 'utf8'));
const changed = Object.keys(sources).filter(file => sources[file] !== oldSources[file]);
assert.deepEqual(changed.sort(), ['src/OceanApp.jsx', 'src/oceanEcology.js', 'src/oceanPelagicSpecies.js']);
await writeFile(`${dir}pelagic-roaming-source-hashes.json`, JSON.stringify(sources,null,2));
const report = { status:'passed-bounded-pelagic-roaming', recordedAt:new Date().toISOString(), receiptsSha256:hash(bytes),
  checks, preservedLegacyAnimals:legacy.ocean.ecology.agents.length,
  normalSpeedCrossing:{groupId, animals:5, from:'5,-1', to:'6,-1', selectedId:crossed.selectedAgentId,
    simulationSeconds:final[0].mobileTimeSec-initial[0].mobileTimeSec}, pause, revisit, refresh,
  relatedTests:{distinctTests:422,passed:422,remainingFailures:0,primary:{passed:421,failed:1},
    targetedCatalogRerun:{passed:8,failed:0},resolvedCase:failed[0].name}, build:true, sourceFileCount:Object.keys(sources).length, changedSources:changed,
  scope:'Finite actual DOM/cohort/region fields; hidden RNG/resource patches are covered by model tests, not browser byte comparisons. Loaded-window qualitative roaming, not seasonal migration or offscreen ecology.' };
await writeFile(`${dir}pelagic-roaming-validation.json`, JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
