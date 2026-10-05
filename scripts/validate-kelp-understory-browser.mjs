import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';

// Input is only the complete JSON printed by the public diagnostic panel.
// The frozen model is used solely for its unchanged coordinate-seeded native
// support plan; no browser IndexedDB, hidden state or injected poses are read.
const root = new URL('../output/validation/', import.meta.url);
const phases = process.argv.slice(2), allowed = new Set(['route', 'paused', 'north-route', 'departure', 'away', 'revisit', 'refresh-before', 'refresh', 'final']);
for (const phase of phases) assert.ok(allowed.has(phase), `unknown public receipt phase: ${phase}`);
const read = phase => JSON.parse(readFileSync(new URL(`kelp-understory-browser-${phase}.json`, root), 'utf8'));
const before = read('bed-before'), upgraded = read('upgrade');
const receipts = new Map([['bed-before', before], ['upgrade', upgraded], ...phases.map(phase => [phase, read(phase)])]);
const sort = rows => structuredClone(rows).sort((a, b) => a.id.localeCompare(b.id));
const sha = value => createHash('sha256').update(value).digest('hex');
const source = readFileSync(new URL('kelp-understory-ecology-before.js', root), 'utf8');
assert.equal(sha(source), '5e7faff0418b771caff3c2712b9e5eb494e3286ab326bdf7301f1906f0a06761');
const rewritten = source.replace(/from (['"])([^'"]+)\1/g,
  (_all, _quote, dependency) => `from ${JSON.stringify(new URL(dependency, new URL('../src/kelpOceanEcology.js', import.meta.url)).href)}`);
const { KelpOceanEcology: OriginalEcology } = await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
const generator = createKelpOceanGenerator(before.ocean.ecology.seed);
const native = new OriginalEcology(before.ocean.ecology.seed, generator, { store: { available: false } });
let checks = 0, physicalRoots = 0, bodyChecks = 0, nativeSupportExclusions = 0, maximumCoordinateErrorM = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (condition, label) => { assert.ok(condition, label); checks++; };
function near(actual, expected, label, tolerance = 1e-12) {
  ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: finite coordinates`);
  const error = Math.abs(actual - expected); maximumCoordinateErrorM = Math.max(maximumCoordinateErrorM, error);
  ok(error <= tolerance, `${label}: ${error} exceeds ${tolerance}m`);
}
const vector = value => Array.isArray(value) ? value : [value.x, value.y, value.z];
function vectorNear(actual, expected, label) { vector(actual).forEach((value, index) => near(value, vector(expected)[index], `${label}/${index}`)); }
function worldCamera(receipt, key) {
  const point = [...receipt.camera[key]], origin = receipt.ocean.renderOrigin; point[0] += origin.x; point[2] += origin.z; return point;
}
function viewNear(actual, expected, label) {
  vectorNear(actual.position, expected.position, `${label}/position`); vectorNear(actual.target, expected.target, `${label}/target`);
  near(actual.freeDepthM, expected.freeDepthM, `${label}/free-depth`);
  const a = structuredClone(actual), b = structuredClone(expected);
  for (const key of ['position', 'target', 'freeDepthM']) { delete a[key]; delete b[key]; } equal(a, b, `${label}: all remaining saved view fields`);
}
function frozen(a, b, label, { notes = true, camera = false } = {}) {
  equal(sort(a.ocean.ecology.agents), sort(b.ocean.ecology.agents), `${label}: complete published animal records`);
  equal(sort(a.ocean.ecology.regions), sort(b.ocean.ecology.regions), `${label}: complete published regional records`);
  if (notes) equal(a.explorationMemory.points, b.explorationMemory.points, `${label}: complete observation notes`);
  equal(a.paused, true, `${label}: paused`); equal(a.speed, 1, `${label}: ordinary speed`);
  if (camera) {
    vectorNear(a.ocean.worldPosition, b.ocean.worldPosition, `${label}/world-position`);
    vectorNear(worldCamera(a, 'position'), worldCamera(b, 'position'), `${label}/camera-position`);
    vectorNear(worldCamera(a, 'target'), worldCamera(b, 'target'), `${label}/camera-target`);
    viewNear(a.explorationMemory.last, b.explorationMemory.last, `${label}/last-view`);
  }
}
const strip = region => { const result = structuredClone(region); for (const key of ['understorySceneryVersion', 'understoryInitializedAtSec', 'understoryPlants']) delete result[key]; return result; };
equal(before.paused, true, 'the physical support upgrade starts paused'); equal(upgraded.paused, true, 'the upgrade remains paused'); equal(upgraded.speed, 1, 'ordinary speed');
equal(sort(upgraded.ocean.ecology.agents), sort(before.ocean.ecology.agents), 'every full old animal record is exact at upgrade');
equal(sort(upgraded.ocean.ecology.regions).map(strip), sort(before.ocean.ecology.regions), 'all full old region fields remain exact after removing only three scenery fields');
equal(upgraded.explorationMemory.points, before.explorationMemory.points, 'all existing full observation notes are retained');
vectorNear(upgraded.ocean.worldPosition, before.ocean.worldPosition, 'upgrade/world-position');
vectorNear(worldCamera(upgraded, 'position'), worldCamera(before, 'position'), 'upgrade/camera-position');
vectorNear(worldCamera(upgraded, 'target'), worldCamera(before, 'target'), 'upgrade/camera-target');
viewNear(upgraded.explorationMemory.last, before.explorationMemory.last, 'upgrade/last-view');

for (const [phase, receipt] of receipts) {
  equal(receipt.errors, [], `${phase}: published error list`); equal(receipt.biomeId, 'kelp', `${phase}: existing kelp ocean`);
  equal(receipt.following, false, `${phase}: whole-scene view has no individual follow`); equal(receipt.speed, 1, `${phase}: ordinary speed`);
  if (phase !== 'route') equal(receipt.paused, true, `${phase}: observation and recovery remain paused`);
  const ecology = receipt.ocean.ecology, rendering = receipt.ocean.understoryRendering;
  equal(ecology.regions.length, 9, `${phase}: nine active owners`); equal(ecology.metrics.activeRegions, 9, `${phase}: bounded ecological window`);
  equal(receipt.ocean.streaming.activeChunks, 9, `${phase}: bounded landscape window`);
  equal(new Set(ecology.agents.map(a => a.id)).size, ecology.agents.length, `${phase}: all animal identities unique`);
  ok(ecology.agents.length <= 180, `${phase}: total animal bound`);
  if (phase === 'bed-before') continue;
  let resident = 0, owners = 0; const allPlants = ecology.regions.flatMap(region => region.understoryPlants);
  equal(new Set(allPlants.map(p => p.id)).size, allPlants.length, `${phase}: unique persistent scenery identities`);
  for (const region of ecology.regions) {
    ok(region.agentCount <= 20, `${phase}/${region.id}: combined animal cap including saved deaths`);
    equal(region.understorySceneryVersion, 1, `${phase}/${region.id}: once-only committed scenery version`);
    ok(region.understoryInitializedAtSec >= 0 && region.understoryInitializedAtSec <= region.timeSec, `${phase}/${region.id}: initialization clock`);
    ok(region.understoryPlants.length <= 32, `${phase}/${region.id}: finite low-layer bound`);
    const plan = native._plan(region.cx, region.cz), excluded = new Set(plan.rocks.map(rock => rock.id));
    const chunk = generator.chunk(region.cx, region.cz), originalRoots = chunk.elements.filter(e => e.kind === 'kelp');
    resident += region.understoryPlants.length; owners += Number(region.understoryPlants.length > 0);
    for (const plant of region.understoryPlants) {
      const host = chunk.elements.find(e => e.id === plant.hostId), support = generator.supportAt(plant.x, plant.z);
      ok(host && ['rock', 'formation'].includes(host.kind), `${phase}/${plant.id}: a genuine hard-cap host`);
      equal(plant.regionId, region.id, `${phase}/${plant.id}: durable ownership`);
      equal(`${Math.floor(plant.x / 64)},${Math.floor(plant.z / 64)}`, region.id, `${phase}/${plant.id}: geographic ownership`);
      ok(['x', 'y', 'z', 'heightM', 'radiusM', 'phase'].every(key => Number.isFinite(plant[key])), `${phase}/${plant.id}: all saved shape fields finite`);
      ok([0, 1, 2].some(slot => plant.id === `kelp-understory:${region.id}:${host.id}:${slot}`), `${phase}/${plant.id}: stable host/slot identity`);
      equal(support.substrate, 'rock', `${phase}/${plant.id}: no sediment root`); equal(support.elementId, host.id, `${phase}/${plant.id}: actual supporting solid`);
      ok(Math.abs(support.height + .006 - plant.y) <= 1e-9, `${phase}/${plant.id}: declared six-millimetre offset over actual support`);
      ok(plant.heightM >= 1.2 && plant.heightM <= 1.8 && plant.radiusM >= .7 && plant.radiusM <= 1.05, `${phase}/${plant.id}: metre-scale low canopy`);
      ok(generator.surfaceY - plant.y >= 4 - .006 && generator.surfaceY - plant.y <= 20 && plant.y + plant.heightM < generator.surfaceY - .3, `${phase}/${plant.id}: actual shallow submerged support`);
      ok(!excluded.has(host.id), `${phase}/${plant.id}: unchanged native feeding rocks stay clear`); nativeSupportExclusions++;
      ok(originalRoots.every(p => Math.hypot(p.x - plant.x, p.z - plant.z) >= 1), `${phase}/${plant.id}: original giant-kelp roots remain free`);
      ok(!Object.hasOwn(plant, 'stock') && !Object.hasOwn(plant, 'energy') && !Object.hasOwn(plant, 'alive'), `${phase}/${plant.id}: scenery carries no fabricated food or physiology`);
      physicalRoots++;
    }
  }
  ok(resident <= 288, `${phase}: bounded total low layer`); equal(rendering.plantCount, resident, `${phase}: rendered count matches actual saved plants`);
  equal(rendering.activeRegions, owners, `${phase}: rendered owners match actual saved plants`); equal(rendering.drawCalls, owners, `${phase}: one draw per resident owner`);
  equal(rendering.prototypeGeometries, 1, `${phase}: one shared plant geometry`); equal(rendering.prototypeMaterials, 1, `${phase}: one shared plant material`);
  equal(rendering.role, 'scenery-not-simulated-biomass', `${phase}: explicit scenery scope`); equal(rendering.pickable, false, `${phase}: plants are not animals`);
  for (const animal of ecology.agents.filter(a => a.alive)) for (const plant of allPlants) {
    // Independent finite cylinder arithmetic includes pitch and the full
    // swimmer radius. It does not claim deforming-leaf or fluid collision.
    const half = .33 * animal.sizeM;
    if (animal.position.y + half < plant.y - .02 || animal.position.y - half > plant.y + plant.heightM + .02) continue;
    const clearance = Math.hypot(animal.position.x - plant.x, animal.position.z - plant.z) - plant.radiusM - (.58 * animal.sizeM + .12);
    ok(clearance >= -1e-9, `${phase}/${animal.id}: actual body remains outside ${plant.id}`); bodyChecks++;
  }
}
const old = before.ocean.ecology, initial = upgraded.ocean.ecology.regions.flatMap(r => r.understoryPlants);
ok(initial.length > 0, 'the initial scene includes genuine new low-layer plants');
let routeHorizontalM = 0, routeDisplacementM = 0;
if (receipts.has('route')) {
  const route = receipts.get('route'); equal(route.paused, false, 'east route occurs at real running speed');
  const a = upgraded.ocean.worldPosition, b = route.ocean.worldPosition;
  const horizontal = Math.hypot(b[0] - a[0], b[2] - a[2]); ok(horizontal > 60, 'ordinary east exploration reaches another actual cell');
  routeHorizontalM += horizontal; routeDisplacementM += Math.hypot(...b.map((v, i) => v - a[i]));
}
if (receipts.has('north-route')) {
  assert.ok(receipts.has('route'), 'north route requires its actual east-route starting receipt');
  const north = receipts.get('north-route'), east = receipts.get('route'); equal(north.paused, true, 'north segment has completed and paused');
  const a = east.ocean.worldPosition, b = north.ocean.worldPosition;
  const horizontal = Math.hypot(b[0] - a[0], b[2] - a[2]); ok(horizontal > 60, 'second ordinary segment reaches a different actual cell');
  routeHorizontalM += horizontal; routeDisplacementM += Math.hypot(...b.map((v, i) => v - a[i]));
}
if (receipts.has('north-route') && receipts.has('departure')) {
  frozen(receipts.get('departure'), receipts.get('north-route'), 'paused second stop through drag and note', { notes: false });
  for (const point of receipts.get('north-route').explorationMemory.points)
    equal(receipts.get('departure').explorationMemory.points.find(p => p.id === point.id), point, 'all old complete notes remain exact after the added scene note');
}
if (receipts.has('departure') && receipts.has('away')) {
  const departed = receipts.get('departure'), away = receipts.get('away'); equal(away.paused, true, 'distant window remains paused');
  ok(departed.ocean.ecology.regions.every(region => !away.ocean.ecology.regions.some(row => row.id === region.id)), 'all nine departure owners genuinely unload');
}
if (receipts.has('departure') && receipts.has('revisit')) frozen(receipts.get('revisit'), receipts.get('departure'), 'unloaded owners revisited');
if (receipts.has('refresh-before') && receipts.has('refresh')) frozen(receipts.get('refresh'), receipts.get('refresh-before'), 'paused page reopen', { camera: true });
if (receipts.has('final')) { equal(receipts.get('final').paused, true, 'finite pass ends paused'); equal(receipts.get('final').selectedAgentId, null, 'final view presents the whole habitat'); }
const result = { schema: 'kelp-understory-public-browser-checks-v1', checks, oldAnimals: old.agents.length, oldRegions: old.regions.length,
  initialPlants: initial.length, initialRenderedOwners: upgraded.ocean.understoryRendering.activeRegions,
  physicalRoots, nativeSupportExclusions, bodyChecks, maximumCoordinateErrorM, coordinateToleranceM: 1e-12,
  routeHorizontalM, routeDisplacementM, phases,
  scope: 'Complete published records and physical references only. Native support plans use the independently frozen previous source. Hidden state, swept motion and shader envelopes have separate model/renderer tests. Aggregate floating sums, runtime display clocks and FPS are not claimed exact.' };
writeFileSync(new URL('kelp-understory-browser-check-result.json', root), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
