import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { OCEAN_REEF_RESIDENT_SPECIES } from '../src/oceanReefResidentsSpecies.js';
import { OCEAN_REEF_DIVERSITY_SPECIES } from '../src/oceanReefDiversitySpecies.js';
import { OCEAN_REEF_COMMUNITY_SPECIES } from '../src/oceanReefCommunitySpecies.js';
import { OCEAN_REEF_LIFE_SPECIES } from '../src/oceanReefLifeSpecies.js';
import { OCEAN_REEF_FAUNA_SPECIES } from '../src/oceanReefFaunaSpecies.js';
import { OCEAN_REEF_FILTER_IDS } from '../src/oceanReefFilterSpecies.js';
import { OCEAN_REEF_SLOPE_IDS } from '../src/oceanReefSlopeSpecies.js';
import { OCEAN_REEF_VISITOR_IDS } from '../src/oceanReefVisitorsSpecies.js';
import { OCEAN_REEF_ASSEMBLAGE_SPECIES } from '../src/oceanReefAssemblageSpecies.js';
import { REEF_HABITAT_COMMUNITY_VERSION, REEF_HABITAT_COMMUNITY_IDS,
  REEF_HABITAT_COMMUNITY_SCOPE, REEF_HABITAT_COMMUNITY_FOOD_SCOPE } from '../src/oceanReefResidents.js';
import { DEMO_LIVING_STOPS } from '../src/demoCapabilities.js';
import { DIRECTOR_STEPS } from '../src/directorTour.js';
import { LIVING_SHALLOWS_PROFILE, livingShallowsSeed } from '../src/livingShallows.js';

const residents = [...OCEAN_REEF_RESIDENT_SPECIES, ...OCEAN_REEF_DIVERSITY_SPECIES, ...OCEAN_REEF_COMMUNITY_SPECIES,
  ...OCEAN_REEF_LIFE_SPECIES, ...OCEAN_REEF_FAUNA_SPECIES, ...OCEAN_REEF_ASSEMBLAGE_SPECIES];
const sha = data => createHash('sha256').update(data).digest('hex');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
// Commit 9d53bb4's exact source content, with only CRLF/LF normalized so Windows
// and CI checkouts prove the same retained catalogs without invoking Git in CI.
const retainedCatalogHashes = {
  'src/oceanReefResidentsSpecies.js': 'f4fb5e5b479e12233db8929a84565c767874484b7a5e736f0f157bf565b2b682',
  'src/oceanReefDiversitySpecies.js': '0c5766437f418914ee7d1c6f231524f0e991b3b2b317eb9383821b67367775e4',
  'src/oceanReefCommunitySpecies.js': '34d6b84d57b582d5a2b67bdbdad59eeeb875be41ef04be103d785afb8cdaa3a7',
  'src/oceanReefLifeSpecies.js': '698e9428d8bcf8815317c74c390e7790acd1e51aa22c8c70f472303cb44c398d',
  'src/oceanReefFaunaSpecies.js': 'cc51e19c9ab9d0e9867f272e0784c2db36c0af29fb984e4ebc42f7723d8ca208',
  'src/oceanReefAssemblageSpecies.js': '286f5d7bd04107c40399baf723c42876ecca4ab790f328202fda6f9bd472a3f5',
  'src/sceneCatalog.js': '3924ab7da0a9d6aa974e914fac1b97533b994979fa1bb119bb2f359fa04b497e',
};
function closingParenthesis(source, opening) {
  let depth = 1, quote = null, escaped = false;
  for (let i = opening + 1; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth++; else if (c === ')' && --depth === 0) return i;
  }
  throw new Error('Shipped source expression has no closing parenthesis.');
}
function productionOptions(isLivingShallows, generator) {
  const source = read('src/world/ReefWorld.js'), start = source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,');
  assert.ok(start >= 0); const opening = source.indexOf('(', start), end = closingParenthesis(source, opening);
  class Capture { constructor(seed, actualGenerator, options) { this.seed = seed; this.generator = actualGenerator; this.options = options; } }
  return new Function('OceanEcology', 'seed', `return ${source.slice(start, end + 1)};`)
    .call({ isLivingShallows, oceanChunks: { generator } }, Capture, livingShallowsSeed('55'));
}
const app = read('src/OceanApp.jsx');
function directEntryChoice() {
  const prefix = 'const [pendingDemo,setPendingDemo]=useState(', start = app.indexOf(prefix);
  assert.ok(start >= 0); const opening = start + prefix.length - 1, end = closingParenthesis(app, opening);
  const create = new Function('window', 'localStorage', 'URLSearchParams', 'LIVING_SHALLOWS_PROFILE',
    `return (${app.slice(opening + 1, end)});`);
  return create({ location: { search: '?demo=reef-valley-region&seed=55' } },
    { getItem: () => 'legacy' }, URLSearchParams, LIVING_SHALLOWS_PROFILE)();
}
async function runShippedEntry(choice) {
  const start = app.indexOf('    if(choice.reefValleyRegionEntry||choice.seagrassMeadowRegionEntry){'),
    end = app.indexOf('    if(choice.coastalLifeBeltEntry', start);
  assert.ok(start >= 0 && end > start);
  const run = new Function('choice', 'world', 'director', 'setView', 'setOceanToolsOpen', 'setPanel', 'rememberOcean', 'setToast', app.slice(start, end));
  let release; const pending = new Promise(resolve => { release = resolve; });
  const retained = { seed: '55', death: { id: 'old-death', alive: false }, timeSec: 4.2, stock: .03, rng: 88 }, before = structuredClone(retained);
  const actual = { sim: { seed: '55' }, controlStartCount: 0, disposed: false, _shallowSceneEntryToken: 0, retained,
    enterReefValleyRegion({ isCurrent }) { assert.equal(isCurrent(), true); this._shallowSceneEntryToken++; return pending; } };
  let remembers = 0, confirms = 0;
  run(choice, { current: actual }, { isCurrent: token => token === 37, applied: () => confirms++, fail: () => assert.fail('entry failed') },
    () => {}, () => {}, () => {}, () => remembers++, () => assert.fail('entry toast failure'));
  assert.equal(remembers, 0); assert.equal(confirms, 0); release(true);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(remembers, 1); assert.equal(confirms, choice.directorToken === undefined ? 0 : 1); assert.deepEqual(retained, before);
}
function representativeRecords() {
  // Display fixtures cover all already implemented dispatches. They are not
  // claims that a natural fresh world admits all 32 species or these positions.
  const regions = [0, 1].map(i => ({ id: `204,${4 + i}`, timeSec: 3.2 - i, ticks: 32 - i * 10,
    resources: { algae: .21, plankton: .03, detritus: .09 }, reefGuild: { preyOrganicUnits: .04 },
    basicNetwork: { coralOrganicUnits: .07 }, rng: 81 + i, agents: [] }));
  residents.forEach((s, i) => { const region = regions[Math.floor(i / 16)], grounded = s.support.footContacts.length > 0;
    region.agents.push({ id: `retained:${s.id}`, regionId: region.id, speciesId: s.id, alive: true,
      sizeM: (s.sizeRangeM[0] + s.sizeRangeM[1]) / 2, position: { x: 13100 + i * 2, y: -3, z: 280 + Math.floor(i / 16) * 64 },
      velocity: { x: .02, y: 0, z: .01 }, heading: .7, pitch: .06,
      supportNormal: { x: -.06, y: .997, z: .04 }, timeSec: region.timeSec, organicUnits: .004,
      state: grounded ? 'reef-foraging' : 'reef-cruising', nextBite: 9, energy: .7,
      reefResidentIndividualVersion: 7, reefResidentMode: grounded ? 'reef-foot' : 'reef-water', reefResidentFoodPool: s.foodPool });
  });
  return regions;
}
const flat = regions => regions.flatMap(r => r.agents);
function pose(object) {
  object.updateMatrixWorld(true); const result = [];
  object.traverse(o => { const entry = { matrix: o.matrix.toArray() };
    if (o.isMesh) { const a = o.geometry.getAttribute('position').array;
      entry.geometry = sha(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
    result.push(entry); }); return result;
}

test('v7 production activates only living shallows while 75 catalog entries and existing direct/director entry retain their committed identities', async () => {
  assert.equal(REEF_HABITAT_COMMUNITY_VERSION, 7); assert.equal(residents.length, 32);
  assert.deepEqual([...REEF_HABITAT_COMMUNITY_IDS].sort(), residents.map(s => s.id).sort());
  assert.equal(new Set(REEF_HABITAT_COMMUNITY_IDS).size, 32); assert.equal(livingShallowsSpeciesCatalog.filter(s => !OCEAN_REEF_VISITOR_IDS.includes(s.id) && !OCEAN_REEF_SLOPE_IDS.includes(s.id) && !OCEAN_REEF_FILTER_IDS.includes(s.id)).length, 75);
  assert.ok(REEF_HABITAT_COMMUNITY_SCOPE && REEF_HABITAT_COMMUNITY_FOOD_SCOPE);
  for (const [path, expected] of Object.entries(retainedCatalogHashes)) assert.equal(sha((path === 'src/sceneCatalog.js' ? read(path).replace(/\r\n/g, '\n').replace("import { OCEAN_REEF_VISITORS_SPECIES } from './oceanReefVisitorsSpecies.js';\n", '').replace(',...OCEAN_REEF_VISITORS_SPECIES', '').replace("import { OCEAN_REEF_SLOPE_SPECIES } from './oceanReefSlopeSpecies.js';\n", '').replace(', ...OCEAN_REEF_SLOPE_SPECIES', '').replace("import { OCEAN_REEF_FILTER_SPECIES } from './oceanReefFilterSpecies.js';\n", '').replace(', ...OCEAN_REEF_FILTER_SPECIES', '') : read(path)).replace(/\r\n/g, '\n')), expected, `${path}: retained 9d53bb4 source`);
  for (const s of residents) {
    assert.equal(livingShallowsSpeciesCatalog.filter(row => row.id === s.id).length, 1);
    assert.equal(livingShallowsSpeciesCatalog.find(row => row.id === s.id), s);
    for (const biome of ['reef', 'kelp', 'deep']) assert.equal(sceneCatalogs[biome].some(row => row.id === s.id), false);
  }
  const seed = livingShallowsSeed('55'), generator = createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  const store = { load: async () => null, save: async () => {}, saveMany: async () => {} };
  for (const living of [true, false]) {
    const captured = productionOptions(living, generator);
    assert.equal(captured.generator, generator); assert.equal(captured.options.reefHabitatCommunity, living);
    const model = new OceanEcology(seed, generator, { ...captured.options, store });
    try { assert.equal(model.reefHabitatCommunityEnabled, living); assert.equal(model.reefAssemblageEnabled, living);
      assert.equal(model._active.size, 0, 'constructor does not synthesize populations'); }
    finally { await model.dispose(); }
  }
  const direct = directEntryChoice(), stop = DEMO_LIVING_STOPS.find(row => row.id === 'reef-valley-region'),
    chapter = DIRECTOR_STEPS.find(row => row.id === 'reef-valley-region');
  assert.equal(direct.reefValleyRegionEntry, true); assert.equal(direct.profile, LIVING_SHALLOWS_PROFILE);
  assert.equal(stop.action.reefValleyRegionEntry, true); assert.equal(chapter.action, stop.action);
  assert.equal(chapter.motion.routeId, 'reef-valley-region');
  await runShippedEntry(direct); await runShippedEntry({ ...chapter.action, directorToken: 37 });
});

test('all 32 existing residents render through actual dispatch and floating origins without altering owner populations stocks clocks or support records', () => {
  const regions = representativeRecords(), agents = flat(regions), before = structuredClone(regions), animals = new OceanAnimals(livingShallowsSpeciesCatalog);
  try {
    assert.ok(regions.every(r => r.agents.length === 16)); animals.update(agents, 3.2, { x: 13056, z: 256 });
    assert.equal(animals.entities.size, 32); assert.equal(animals.stats.activeAnimals, 32);
    assert.deepEqual(animals.stats.speciesCounts, Object.fromEntries(residents.map(s => [s.id, 1])));
    for (const a of agents) {
      const object = animals.getObject(a.id); assert.ok(object, a.speciesId); assert.equal(object.userData.agentId, a.id);
      assert.equal(object.userData.regionId, a.regionId); assert.equal(object.scale.x, a.sizeM);
      assert.ok(object.userData.sourceLinks.every(item => item.url));
      assert.ok(object.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(a.position.x - 13056, a.position.y, a.position.z - 256)) < 1e-9);
      if (residents.find(s => s.id === a.speciesId).support.footContacts.length) {
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion);
        assert.ok(up.distanceTo(new THREE.Vector3(-.06, .997, .04).normalize()) < 1e-9, `${a.speciesId}: actual support pose`);
      }
    }
    animals.update(agents, 99, { x: 12992, z: 192 });
    assert.deepEqual(regions, before); assert.equal(animals.entities.size, 32);
    for (const a of agents) assert.ok(animals.getObject(a.id).getWorldPosition(new THREE.Vector3())
      .distanceTo(new THREE.Vector3(a.position.x - 12992, a.position.y, a.position.z - 192)) < 1e-9);
  } finally { animals.dispose(); }
  assert.equal(animals.root.children.length, 0); assert.equal(animals.entities.size, 0); assert.deepEqual(regions, before);
});

test('fixed authoritative owner clocks freeze all local model poses and deaths/unload change only rendering without replacing historical records', () => {
  const regions = representativeRecords(), agents = flat(regions), before = structuredClone(regions), animals = new OceanAnimals(livingShallowsSpeciesCatalog);
  try {
    animals.update(agents, 3.2); const initial = agents.map(a => pose(animals.getObject(a.id)));
    animals.update(agents, 130); assert.deepEqual(agents.map(a => pose(animals.getObject(a.id))), initial);
    assert.deepEqual(regions, before);
    regions[0].agents[0].alive = false; const retained = structuredClone(regions), deadId = regions[0].agents[0].id;
    animals.update(agents, 130); assert.equal(animals.getObject(deadId), null); assert.equal(animals.root.children.length, 31);
    animals.update(regions[1].agents, 260); assert.equal(animals.entities.size, 16); assert.equal(animals.root.children.length, 16);
    assert.deepEqual(regions, retained);
    animals.update(agents, 390); assert.equal(animals.entities.size, 31); assert.equal(animals.getObject(deadId), null);
    const returning = regions[0].agents.filter(a => a.alive).map(a => pose(animals.getObject(a.id)));
    assert.deepEqual(returning, initial.slice(1, 16), 'same IDs and owner clocks replay after reloading display models');
    assert.deepEqual(regions, retained); assert.equal(regions[0].agents.length, 16, 'death still occupies its saved population record');
  } finally { animals.dispose(); }
  assert.equal(animals.root.children.length, 0); assert.equal(animals.entities.size, 0);
});
