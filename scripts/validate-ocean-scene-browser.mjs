import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';
import { validateOceanSceneElementsRecord } from '../src/oceanSceneElements.js';

// Only complete public diagnostic JSON is read. No browser, storage internals,
// injected poses or inferred animation trajectories are inspected.
const root = new URL('../output/validation/', import.meta.url);
const allowed = new Set(['route-1', 'route-2', 'departure', 'away', 'revisit', 'refresh-before', 'refresh', 'final']);
const phases = [...new Set(process.argv.slice(2))];
for (const phase of phases) if (!allowed.has(phase)) throw new Error(`Unknown receipt phase: ${phase}`);
const read = phase => JSON.parse(readFileSync(new URL(`ocean-scene-browser-${phase}.json`, root), 'utf8'));
const before = read('before'), upgrade = read('upgrade');
const receipts = new Map([['before', before], ['upgrade', upgrade], ...phases.map(phase => [phase, read(phase)])]);
const sorted = rows => structuredClone(rows).sort((a, b) => a.id.localeCompare(b.id));
const strip = row => { const copy = structuredClone(row); for (const key of ['sceneElementsVersion', 'sceneElementsInitializedAtSec', 'sceneElements']) delete copy[key]; return copy; };
const generator = createOceanGenerator(before.ocean.ecology.seed), failures = [], stableScenes = new Map(), stableOwners = new Map(), phaseSummary = [];
let checks = 0, maximumCameraErrorM = 0, strictRefresh = null;
function check(condition, scope) { checks++; if (!condition) failures.push(scope); }
const equal = (a, b, scope) => check(isDeepStrictEqual(a, b), scope);
const regions = receipt => sorted(receipt.ocean.ecology.regions), animals = receipt => sorted(receipt.ocean.ecology.agents);
const notes = receipt => receipt.explorationMemory.points;
function frozen(a, b, scope, includeNotes = true) {
  equal(animals(a), animals(b), `${scope}: complete animals`); equal(regions(a), regions(b), `${scope}: complete regions`);
  if (includeNotes) equal(notes(a), notes(b), `${scope}: complete notes`);
}
const vector = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
function near(a, b, scope) {
  const av = vector(a), bv = vector(b), errors = av.map((v, i) => Math.abs(v - bv[i]));
  maximumCameraErrorM = Math.max(maximumCameraErrorM, ...errors.filter(Number.isFinite));
  check(av.length === bv.length && errors.every(error => Number.isFinite(error) && error <= 1e-8), scope);
}
function worldCamera(receipt, key) {
  const p = [...receipt.camera[key]], origin = receipt.ocean.renderOrigin; p[0] += origin.x; p[2] += origin.z; return p;
}
function sameView(a, b, scope) {
  near(a.ocean.worldPosition, b.ocean.worldPosition, `${scope}: world camera`);
  near(worldCamera(a, 'position'), worldCamera(b, 'position'), `${scope}: rendered camera`);
  near(worldCamera(a, 'target'), worldCamera(b, 'target'), `${scope}: rendered target`);
  const av = structuredClone(a.explorationMemory.last), bv = structuredClone(b.explorationMemory.last);
  for (const key of ['position', 'target']) { near(av[key], bv[key], `${scope}: saved ${key}`); delete av[key]; delete bv[key]; }
  near([av.freeDepthM], [bv.freeDepthM], `${scope}: saved depth`); delete av.freeDepthM; delete bv.freeDepthM;
  equal(av, bv, `${scope}: other saved view fields`);
}
equal(animals(upgrade), animals(before), 'upgrade: every full old animal');
equal(regions(upgrade).map(strip), regions(before), 'upgrade: full old regions with only three additive fields removed');
equal(notes(upgrade), notes(before), 'upgrade: all old complete notes'); sameView(upgrade, before, 'upgrade');

for (const [phase, receipt] of receipts) {
  const rows = regions(receipt), allAnimals = animals(receipt), elements = rows.flatMap(row => row.sceneElements ?? []), render = receipt.ocean.sceneElementsRendering;
  equal(receipt.errors, [], `${phase}: errors`); equal(receipt.biomeId, 'reef', `${phase}: reef habitat`);
  equal(receipt.following, false, `${phase}: ordinary whole-scene view`); equal(receipt.speed, 1, `${phase}: ordinary speed`);
  if (!phase.startsWith('route-')) equal(receipt.paused, true, `${phase}: paused observation`);
  check(rows.length === 9 && receipt.ocean.streaming.activeChunks === 9 && receipt.ocean.ecology.metrics.activeRegions === 9, `${phase}: nine-owner window`);
  check(allAnimals.length <= 180 && new Set(allAnimals.map(a => a.id)).size === allAnimals.length && rows.every(r => r.agentCount <= 20), `${phase}: bounded animal identities including deaths`);
  check(rows.every(r => allAnimals.filter(a => a.regionId === r.id).length === r.agentCount), `${phase}: scenery has no animal slots`);
  check(notes(before).every(note => isDeepStrictEqual(notes(receipt).find(p => p.id === note.id), note)), `${phase}: original five notes unchanged`);
  if (phase !== 'before') {
    check(rows.every(r => r.sceneElementsVersion === 1 && validateOceanSceneElementsRecord(r, generator, {
      surface: (x, z) => oceanSupportHeight(generator, x, z, { avoidCoral: true }) })), `${phase}: all saved geometry, actual floor, native grass sources and initialization clocks valid`);
    check(elements.length <= 153 && new Set(elements.map(e => e.id)).size === elements.length, `${phase}: bounded unique scenery`);
    check(elements.every(e => !stableScenes.has(e.id) || isDeepStrictEqual(stableScenes.get(e.id), e)), `${phase}: all previously seen full scene records stable`);
    for (const element of elements) if (!stableScenes.has(element.id)) stableScenes.set(element.id, structuredClone(element));
    check(rows.every(r => !stableOwners.has(r.id) || isDeepStrictEqual(stableOwners.get(r.id), r.sceneElements)), `${phase}: once-only whole owner cohorts neither disappear nor refill`);
    for (const row of rows) if (!stableOwners.has(row.id)) stableOwners.set(row.id, structuredClone(row.sceneElements));
    const counts = Object.fromEntries(['stone', 'plant-clump', 'bottle', 'driftwood'].map(kind => [kind, elements.filter(e => e.kind === kind).length]));
    const batches = new Set(elements.map(e => `${e.kind}:${e.variant}`)).size;
    check(render?.instances === elements.length && render.drawCalls === batches && batches <= 5 && isDeepStrictEqual(render.typeCounts, counts), `${phase}: actual rendered count and at most five shared batches`);
    check(render.prototypeGeometries === 5 && render.prototypeMaterials === 4 && render.maxInstances === 153 && render.maxDrawCalls === 5 && render.pickable === false,
      `${phase}: bounded shared scenery resources`);
  }
  phaseSummary.push({ phase, chunk: receipt.ocean.chunkId, animals: allAnimals.length, regions: rows.length, elements: elements.length,
    batches: render?.drawCalls ?? 0, notes: notes(receipt).length, paused: receipt.paused, speed: receipt.speed });
}
let navigationHorizontalM = 0, navigationXYZM = 0, previousRoute = upgrade;
for (const phase of ['route-1', 'route-2']) if (receipts.has(phase)) {
  if (phase === 'route-2') check(receipts.has('route-1'), 'route-2: requires its first segment receipt');
  const route = receipts.get(phase), a = vector(previousRoute.ocean.worldPosition), b = vector(route.ocean.worldPosition);
  navigationHorizontalM += Math.hypot(b[0] - a[0], b[2] - a[2]); navigationXYZM += Math.hypot(...b.map((v, i) => v - a[i])); previousRoute = route;
}
if (receipts.has('route-2')) check(navigationHorizontalM >= 120, 'ordinary navigation: at least 120 horizontal metres');
if (receipts.has('away')) for (const phase of ['before', 'departure']) if (receipts.has(phase)) {
  const awayIds = new Set(regions(receipts.get('away')).map(r => r.id));
  check(regions(receipts.get(phase)).every(r => !awayIds.has(r.id)), `${phase}→away: every old owner genuinely unloaded`);
}
if (receipts.has('departure') && receipts.has('revisit')) {
  frozen(receipts.get('revisit'), receipts.get('departure'), 'unloaded-owner revisit'); sameView(receipts.get('revisit'), receipts.get('departure'), 'revisit');
}
if (receipts.has('refresh-before') && receipts.has('refresh')) {
  const a = receipts.get('refresh'), b = receipts.get('refresh-before'), ar = regions(a), br = regions(b), displayDifferences = [];
  strictRefresh = { regionsExactlyEqual: isDeepStrictEqual(ar, br), displayDifferences };
  for (let i = 0; i < ar.length; i++) for (const key of ['hour', 'lightAtDepth']) if (!isDeepStrictEqual(ar[i].localEnvironment[key], br[i].localEnvironment[key]))
    displayDifferences.push({ regionId: ar[i].id, field: `localEnvironment.${key}`, before: br[i].localEnvironment[key], after: ar[i].localEnvironment[key] });
  const withoutDisplay = rows => rows.map(row => { const copy = structuredClone(row); delete copy.localEnvironment.hour; delete copy.localEnvironment.lightAtDepth; return copy; });
  equal(withoutDisplay(ar), withoutDisplay(br), 'refresh: complete regions apart from explicitly allowed hour/lightAtDepth');
  equal(animals(a), animals(b), 'refresh: complete animals'); equal(notes(a), notes(b), 'refresh: complete notes'); sameView(a, b, 'refresh');
}
if (receipts.has('final')) {
  const final = receipts.get('final'); equal(final.selectedAgentId, null, 'final: no selected individual');
  check(notes(final).length === notes(before).length || (notes(final).length === notes(before).length + 1 && notes(final).some(p => p.label === '草床与探索物')),
    'final: only the optional sixth scene note is added');
}
const result = { schema: 'ocean-scene-public-browser-checks-v1', passed: failures.length === 0, checks, failScope: failures,
  oldAnimals: before.ocean.ecology.agents.length, oldRegions: before.ocean.ecology.regions.length, oldNotes: notes(before).length,
  initialNewElements: upgrade.ocean.ecology.regions.flatMap(r => r.sceneElements).length, uniqueSeenElements: stableScenes.size,
  navigationHorizontalM, navigationXYZM, maximumCameraErrorM, cameraToleranceM: 1e-8, strictRefresh, phases: phaseSummary,
  scope: 'Complete public animal/regional/note records, seeded saved geometry and finite normal-navigation receipts. Runtime/FPS/aggregate floating sums and display-hour restoration are not claimed exact.' };
console.log(JSON.stringify(result, null, 2)); if (failures.length) process.exitCode = 1;
