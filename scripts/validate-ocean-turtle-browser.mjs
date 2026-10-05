import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createOceanGenerator } from '../src/oceanGeneration.js';

// Complete public diagnostic receipts only. No browser state, IndexedDB or
// injected animal pose is read. The frozen old model supplies solid support.
const root = new URL('../output/validation/', import.meta.url);
const all = ['route-1', 'route-2', 'route-3', 'surfacing', 'cycle-4x', 'patrol-start', 'patrol-end',
  'departure', 'away', 'revisit', 'refresh-before', 'refresh', 'final'];
const phases = process.argv.length > 2 ? process.argv.slice(2) : all;
for (const phase of phases) assert.ok(all.includes(phase), `unknown receipt phase: ${phase}`);
const read = phase => JSON.parse(readFileSync(new URL(`ocean-turtle-browser-${phase}.json`, root), 'utf8'));
const before = read('before'), upgrade = read('upgrade');
const receipts = new Map([['before', before], ['upgrade', upgrade], ...phases.map(phase => [phase, read(phase)])]);
const source = readFileSync(new URL('ocean-turtle-ecology-before.js', root), 'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'), 'a732f526fc74e44150b98b443ca437d76d6af40bd4fa0489fefad0fad7bb1647');
const rewritten = source.replace(/from (['"])([^'"]+)\1/g, (_all, _quote, dependency) =>
  `from ${JSON.stringify(new URL(dependency, new URL('../src/oceanEcology.js', import.meta.url)).href)}`);
const { OceanEcology: OriginalEcology } = await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
const generator = createOceanGenerator(before.ocean.ecology.seed);
const support = new OriginalEcology(before.ocean.ecology.seed, generator, { store: { available: false } });
let checks = 0, bodyChecks = 0, grassReferences = 0, maximumCameraErrorM = 0, refreshComparison = null;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (condition, label) => { assert.ok(condition, label); checks++; };
const sort = rows => structuredClone(rows).sort((a, b) => a.id.localeCompare(b.id));
const vector = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
const distance = (a, b) => Math.hypot(...vector(a).map((v, i) => v - vector(b)[i]));
function cameraNear(a, b, label) {
  vector(a).forEach((value, index) => {
    const error = Math.abs(value - vector(b)[index]); maximumCameraErrorM = Math.max(maximumCameraErrorM, error);
    ok(Number.isFinite(error) && error <= 1e-9, `${label}/${index}: ${error}m`);
  });
}
function worldCamera(receipt, key) {
  const point = [...receipt.camera[key]], origin = receipt.ocean.renderOrigin;
  point[0] += origin.x; point[2] += origin.z; return point;
}
function viewNear(a, b, label) {
  const x = structuredClone(a), y = structuredClone(b);
  for (const key of ['position', 'target']) { cameraNear(x[key], y[key], `${label}/${key}`); delete x[key]; delete y[key]; }
  const error = Math.abs(x.freeDepthM - y.freeDepthM); maximumCameraErrorM = Math.max(maximumCameraErrorM, error);
  ok(error <= 1e-9, `${label}/freeDepthM`); delete x.freeDepthM; delete y.freeDepthM;
  equal(x, y, `${label}: every remaining view field`);
}
function frozen(a, b, label, { notes = true, camera = false, reportForcingReset = false } = {}) {
  equal(sort(a.ocean.ecology.agents), sort(b.ocean.ecology.agents), `${label}: entire published animal records`);
  const newRegions = sort(a.ocean.ecology.regions), oldRegions = sort(b.ocean.ecology.regions);
  if (reportForcingReset) {
    const differences = [];
    try { equal(newRegions, oldRegions, `${label}: entire published region records`); }
    catch (error) {
      // Preserve the strict failure. Only the two explicitly reported forcing
      // projections may differ; the summary does not call whole regions exact.
      writeFileSync(new URL('ocean-turtle-browser-strict-refresh-failure.log', root), `${error.stack}\n`);
      equal(newRegions.map(r => r.id), oldRegions.map(r => r.id), `${label}: identical region owners`);
      for (let i = 0; i < oldRegions.length; i++) {
        for (const key of ['hour', 'lightAtDepth']) {
          const beforeValue = oldRegions[i].localEnvironment[key], afterValue = newRegions[i].localEnvironment[key];
          if (!isDeepStrictEqual(beforeValue, afterValue)) differences.push({ regionId: oldRegions[i].id,
            field: `localEnvironment.${key}`, before: beforeValue, after: afterValue });
          delete oldRegions[i].localEnvironment[key]; delete newRegions[i].localEnvironment[key];
        }
      }
      equal(newRegions, oldRegions, `${label}: all region fields except exactly hour/lightAtDepth`);
      equal(a.environment.hour, 10, `${label}: actual global hour returns to existing default`);
      for (const region of a.ocean.ecology.regions) equal(region.localEnvironment.hour, a.environment.hour, `${label}/${region.id}: actual global hour projection`);
    }
    refreshComparison = { wholeAnimalsExact: true, wholeRegionsExact: differences.length === 0,
      regionsExactExceptExplicitForcingProjection: true, wholeNotesExact: true,
      explicitFields: ['localEnvironment.hour', 'localEnvironment.lightAtDepth'], differences,
      strictFailureLog: differences.length ? 'output/validation/ocean-turtle-browser-strict-refresh-failure.log' : null,
      scope: 'Existing page refresh resets global display hour to 10; all other full public regional fields are exact. No production change and no claim of whole-region refresh equality.' };
  } else equal(newRegions, oldRegions, `${label}: entire published region records`);
  if (notes) equal(a.explorationMemory.points, b.explorationMemory.points, `${label}: entire notes`);
  if (camera) {
    cameraNear(a.ocean.worldPosition, b.ocean.worldPosition, `${label}/world-position`);
    for (const key of ['position', 'target']) cameraNear(worldCamera(a, key), worldCamera(b, key), `${label}/camera-${key}`);
    viewNear(a.explorationMemory.last, b.explorationMemory.last, `${label}/last-view`);
  }
}
const strip = region => { const row = structuredClone(region);
  for (const key of ['turtleCommunityVersion', 'turtleInitializedAtSec', 'turtleAgentCount']) delete row[key]; return row; };
equal(sort(upgrade.ocean.ecology.agents), sort(before.ocean.ecology.agents), 'strict upgrade: all complete old animals exact');
equal(sort(upgrade.ocean.ecology.regions).map(strip), sort(before.ocean.ecology.regions), 'strict upgrade: remove only three new public fields, all complete old region fields exact');
equal(upgrade.explorationMemory.points, before.explorationMemory.points, 'strict upgrade: complete old notes exact');
cameraNear(upgrade.ocean.worldPosition, before.ocean.worldPosition, 'upgrade/world-position');
for (const key of ['position', 'target']) cameraNear(worldCamera(upgrade, key), worldCamera(before, key), `upgrade/camera-${key}`);
viewNear(upgrade.explorationMemory.last, before.explorationMemory.last, 'upgrade/last-view');

const pausedPhases = new Set(['before', 'upgrade', 'departure', 'away', 'revisit', 'refresh-before', 'refresh', 'final']);
const followAllowed = new Set(['surfacing', 'patrol-start', 'patrol-end']);
for (const [phase, receipt] of receipts) {
  equal(receipt.errors, [], `${phase}: published error list`); equal(receipt.biomeId, 'reef', `${phase}: actual shallow sea`);
  equal(receipt.speed, phase === 'cycle-4x' ? 4 : 1, `${phase}: explicitly recorded playback speed`);
  if (pausedPhases.has(phase)) equal(receipt.paused, true, `${phase}: paused`);
  if (!followAllowed.has(phase)) equal(receipt.following, false, `${phase}: no individual follow`);
  const ecology = receipt.ocean.ecology;
  equal(ecology.regions.length, 9, `${phase}: nine region window`); equal(ecology.metrics.activeRegions, 9, `${phase}: bounded ecology`);
  equal(receipt.ocean.streaming.activeChunks, 9, `${phase}: bounded landscape`);
  equal(new Set(ecology.agents.map(a => a.id)).size, ecology.agents.length, `${phase}: all identities unique`);
  ok(ecology.agents.length <= 180, `${phase}: total resident bound`);
  for (const region of ecology.regions) {
    const animals = ecology.agents.filter(a => a.regionId === region.id), turtles = animals.filter(a => a.speciesId === 'green-turtle');
    equal(region.agentCount, animals.length, `${phase}/${region.id}: published count includes dead residents`);
    ok(animals.length <= 20, `${phase}/${region.id}: shared twenty-resident cap`);
    if (phase === 'before') continue;
    equal(region.turtleCommunityVersion, 1, `${phase}/${region.id}: committed once-only version`);
    equal(region.turtleAgentCount, turtles.length, `${phase}/${region.id}: durable turtle count`); ok(turtles.length <= 1, `${phase}/${region.id}: sparse representative`);
    ok(region.turtleInitializedAtSec >= 0 && region.turtleInitializedAtSec <= region.timeSec, `${phase}/${region.id}: allocation clock`);
    const grass = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
      grass.push(...generator.chunk(region.cx + dx, region.cz + dz).elements.filter(e => e.kind === 'seagrass'));
    for (const turtle of turtles) {
      equal(turtle.birthRegionId, region.id, `${phase}/${turtle.id}: unchanged local birth owner`);
      ok(!Object.hasOwn(turtle, 'energy') && !Object.hasOwn(turtle, 'oxygen') && !Object.hasOwn(turtle, 'lastFeedAt'), `${phase}/${turtle.id}: no invented metabolism or food`);
      const sourceGrass = grass.find(p => p.id === turtle.sourceGrassId); ok(sourceGrass, `${phase}/${turtle.id}: genuine grass source`);
      ok(turtle.sourceGrassIds.length >= 6, `${phase}/${turtle.id}: actual grass cluster`);
      equal(new Set(turtle.sourceGrassIds).size, turtle.sourceGrassIds.length, `${phase}/${turtle.id}: unique grass references`);
      for (const id of turtle.sourceGrassIds) {
        const p = grass.find(row => row.id === id); ok(p && Math.hypot(p.x - sourceGrass.x, p.z - sourceGrass.z) <= 9 + 1e-9, `${phase}/${turtle.id}: real local grass ${id}`);
        ok(Math.abs(p.y - generator.floorSurface(p.x, p.z).height) <= 1e-9 && generator.sample(p.x, p.z).substrate !== 'rock', `${phase}/${id}: true sediment-rooted grass`); grassReferences++;
      }
      const p = turtle.position, radius = .64 * turtle.sizeM + .12, half = .25 * turtle.sizeM;
      ok(turtle.sizeM >= 1.25 && turtle.sizeM <= 1.5 && p.x >= region.cx * 64 + 2 && p.x <= (region.cx + 1) * 64 - 2 &&
        p.z >= region.cz * 64 + 2 && p.z <= (region.cz + 1) * 64 - 2, `${phase}/${turtle.id}: finite local body`);
      for (let i = 0; i < 9; i++) {
        const a = (i - 1) * Math.PI / 4, r = i ? radius : 0, top = support._surface(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, true);
        ok(p.y - half >= top + .25 - 1e-8, `${phase}/${turtle.id}: actual complete-body solid probe ${i}`); bodyChecks++;
      }
      for (const plant of grass) if (Math.hypot(plant.x - p.x, plant.z - p.z) <= radius + Math.max(plant.scale.x, plant.scale.z) * .65)
        ok(p.y - half >= plant.y + plant.scale.y * 1.02 + .25 - 1e-8, `${phase}/${turtle.id}: whole grass-crown clearance`);
      ok(p.y + turtle.sizeM * .055 <= 8 + 1e-8, `${phase}/${turtle.id}: nominal nasal surface ceiling`);
      if (turtle.state === 'seagrass-cruising') ok(p.y + half <= 8 - .15 + 1e-8, `${phase}/${turtle.id}: fully submerged cruise`);
      if (turtle.state === 'breathing') ok(Math.abs(p.y + turtle.sizeM * .055 - 8) <= 1e-8, `${phase}/${turtle.id}: nasal reference at nominal surface`);
    }
  }
}

let routeHorizontalM = 0, routeXYZDisplacementM = 0; const routeSegments = [];
let previous = upgrade;
for (const phase of ['route-1', 'route-2', 'route-3']) if (receipts.has(phase)) {
  const current = receipts.get(phase); equal(current.paused, false, `${phase}: real running 1x traversal`);
  const a = vector(previous.ocean.worldPosition), b = vector(current.ocean.worldPosition);
  const horizontalM = Math.hypot(b[0] - a[0], b[2] - a[2]), xyzDisplacementM = distance(a, b);
  ok(horizontalM > 60, `${phase}: genuine ordinary route segment`); routeHorizontalM += horizontalM; routeXYZDisplacementM += xyzDisplacementM;
  routeSegments.push({ phase, horizontalM, xyzDisplacementM }); previous = current;
}
let cycle = null, patrol = null;
const turtleAt = (receipt, id) => receipt.ocean.ecology.agents.find(a => a.speciesId === 'green-turtle' && (!id || a.id === id));
if (receipts.has('surfacing') && receipts.has('cycle-4x')) {
  const start = turtleAt(receipts.get('surfacing')), end = turtleAt(receipts.get('cycle-4x'), start?.id);
  ok(start && end, 'cycle: same actual turtle retained'); equal(start.state, 'surfacing', 'cycle: actual upward phase captured');
  equal(end.state, 'seagrass-cruising', 'cycle: actual return to underwater patrol captured');
  ok(end.breathCount > start.breathCount && end.lastBreathAtSec > start.timeSec && end.lastBreathAtSec <= end.timeSec, 'cycle: same identity has a new recorded breath');
  cycle = { id: start.id, fromTimeSec: start.timeSec, toTimeSec: end.timeSec, beforeBreathCount: start.breathCount, afterBreathCount: end.breathCount,
    lastBreathAtSec: end.lastBreathAtSec, explicitIntermediateSpeed: 4, scope: 'Two public poses and saved breath history; breathing and diving poses were not separately captured in these browser receipts.' };
}
if (receipts.has('patrol-start') && receipts.has('patrol-end')) {
  const a = turtleAt(receipts.get('patrol-start')), b = turtleAt(receipts.get('patrol-end'), a?.id); ok(a && b, 'patrol: same actual turtle');
  equal(a.state, 'seagrass-cruising', 'patrol starts cruising'); equal(b.state, 'seagrass-cruising', 'patrol ends cruising');
  const elapsedSec = b.timeSec - a.timeSec, displacementM = distance(a.position, b.position);
  ok(elapsedSec > 0 && displacementM > .1 && displacementM <= .22 * elapsedSec + 1e-8, 'normal patrol: actual endpoint displacement within full XYZ speed budget');
  patrol = { id: a.id, elapsedSimulationSec: elapsedSec, endpointDisplacementM: displacementM, displacementBudgetM: .22 * elapsedSec,
    speed: 1, following: [receipts.get('patrol-start').following, receipts.get('patrol-end').following], scope: 'Endpoint displacement, not swept-path or per-step browser proof.' };
}
if (receipts.has('patrol-end') && receipts.has('departure')) {
  frozen(receipts.get('departure'), receipts.get('patrol-end'), 'post-patrol pause and added note', { notes: false });
  for (const point of receipts.get('patrol-end').explorationMemory.points)
    equal(receipts.get('departure').explorationMemory.points.find(p => p.id === point.id), point, 'every original note remains exact');
}
if (receipts.has('departure') && receipts.has('away')) ok(receipts.get('departure').ocean.ecology.regions.every(r =>
  !receipts.get('away').ocean.ecology.regions.some(s => s.id === r.id)), 'all nine departure owners genuinely unload');
if (receipts.has('departure') && receipts.has('revisit')) frozen(receipts.get('revisit'), receipts.get('departure'), 'complete unloaded-window revisit', { camera: true });
if (receipts.has('refresh-before') && receipts.has('refresh')) frozen(receipts.get('refresh'), receipts.get('refresh-before'), 'complete paused refresh', { camera: true, reportForcingReset: true });
if (receipts.has('refresh') && receipts.has('final')) frozen(receipts.get('final'), receipts.get('refresh'), 'final paused whole-scene view', { camera: true });
if (receipts.has('final')) { equal(receipts.get('final').selectedAgentId, null, 'final whole-scene view has no selected individual'); equal(receipts.get('final').following, false, 'final has no follow'); }
const final = receipts.get('final');
const result = { schema: 'ocean-turtle-public-browser-checks-v1', checks, receipts: [...receipts.keys()], oldAnimals: before.ocean.ecology.agents.length,
  oldRegions: before.ocean.ecology.regions.length, strictUpgradeWholeAnimalsExact: true, strictUpgradeWholeOldRegionsExact: true,
  removedUpgradeFields: ['turtleCommunityVersion', 'turtleInitializedAtSec', 'turtleAgentCount'], bodyChecks, grassReferences,
  routeSegments, routeHorizontalM, routeXYZDisplacementM, cycle, patrol, refreshComparison, maximumCameraErrorM, cameraToleranceM: 1e-9,
  unloadedWindowRevisit: { wholeAnimalsExact: true, wholeRegionsExact: true, wholeNotesExact: true, departureOwnerIntersectionWithAway: [] },
  refreshToFinal: { wholeAnimalsExact: true, wholeRegionsExact: true, wholeNotesExact: true },
  ...(final ? { finalAnimals: final.ocean.ecology.agents.length, finalLivingAnimals: final.ocean.ecology.agents.filter(a => a.alive).length,
    finalRegions: final.ocean.ecology.regions.length, finalTurtles: final.ocean.ecology.agents.filter(a => a.speciesId === 'green-turtle').length,
    finalNotes: final.explorationMemory.points.length, paused: final.paused, speed: final.speed, following: final.following } : {}),
  scope: 'Full published records and finite physical references only. Hidden RNG, complete disk records, per-step cycles, shader envelopes and disposal have separate model/renderer evidence. No long-run FPS, measured rates or full animated-leaf/fluid proof.' };
writeFileSync(new URL('ocean-turtle-browser-check-result.json', root), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
