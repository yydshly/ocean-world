import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createOceanGenerator } from '../src/oceanGeneration.js';
import { oceanSupportHeight } from '../src/oceanEcology.js';
import { speciesById } from '../src/species.js';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
import { leafAttachmentPosition } from '../src/kelpHabitat.js';
import { createDeepOceanGenerator } from '../src/deepOceanGeneration.js';

const dir = 'output/validation/', receiptPath = `${dir}scene-physics-browser-receipts.json`;
const bytes = await readFile(receiptPath), receipts = JSON.parse(bytes), byLabel = new Map(receipts.map(r => [r.label, r.data]));
const hash = value => createHash('sha256').update(value).digest('hex');
const tolerance = 1e-7, checks = { camera: 0, reefBottom: 0, kelpBottom: 0, attachedSnails: 0, deepFeet: 0, deepAnchors: 0, resourceLedgers: 0 };
const factories = { reef: createOceanGenerator, kelp: createKelpOceanGenerator, deep: createDeepOceanGenerator }, generators = new Map();
for (const { label, data } of receipts) {
  const ocean = data.ocean, ecology = ocean.ecology, key = `${data.biomeId}:${typeof ecology.seed}:${ecology.seed}`;
  if (!generators.has(key)) generators.set(key, factories[data.biomeId](ecology.seed));
  const generator = generators.get(key);
  assert.deepEqual(data.errors, [], label); assert.equal(ecology.metrics.persistenceErrors, 0, label);
  assert.ok(Math.abs(ecology.metrics.balanceError) < 1e-8, label);
  assert.ok(ecology.metrics.activeRegions <= 9, label);
  const [x, y, z] = ocean.worldPosition;
  assert.ok(y >= generator.floorSurface(x, z).height + .04 - tolerance, label); checks.camera++;
  for (const region of ecology.regions) {
    assert.ok(Math.abs(region.balanceError) < 1e-8, `${label} ${region.id}`); checks.resourceLedgers++;
  }
  for (const agent of ecology.agents.filter(agent => agent.alive)) {
    const { x: ax, y: ay, z: az } = agent.position;
    if (data.biomeId === 'reef' && ['cucumber', 'star', 'snail', 'crab', 'shrimp', 'clam'].includes(speciesById[agent.speciesId]?.kind)) {
      assert.ok(Math.abs(ay - oceanSupportHeight(generator, ax, az) - .004) < tolerance, `${label} ${agent.id}`);
      checks.reefBottom++;
    }
    if (data.biomeId === 'kelp' && ['purple-urchin', 'bat-star', 'gumboot-chiton'].includes(agent.speciesId)) {
      assert.ok(Math.abs(ay - generator.heightAt(ax, az) - .003) < tolerance, `${label} ${agent.id}`); checks.kelpBottom++;
    }
    if (data.biomeId === 'kelp' && agent.attachment) {
      const point = leafAttachmentPosition(agent.hostAnchor, agent.attachment, agent.hostTimeSec, agent.hostEnvironment);
      assert.ok(Math.hypot(point.x - ax, point.y - ay, point.z - az) < tolerance, `${label} ${agent.id}`); checks.attachedSnails++;
      const near = Math.hypot(agent.hostAnchor.x - x, agent.hostAnchor.z - z) <= 16;
      if (near) assert.ok(ocean.animalRendering.detailedHostIds.includes(agent.hostSceneryId), `${label}: a nearby snail lacks its real host`);
    }
    if (data.biomeId === 'deep' && agent.speciesId === 'sea-pig-group') {
      const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
      for (const foot of agent.contactPointsLocal) {
        const fx = ax + agent.sizeM * (foot.x * c - foot.z * s), fz = az + agent.sizeM * (foot.x * s + foot.z * c);
        assert.ok(Math.abs(ay + foot.y * agent.sizeM - generator.heightAt(fx, fz)) < tolerance, `${label} ${agent.id}`); checks.deepFeet++;
      }
    }
    if (data.biomeId === 'deep' && agent.speciesId === 'pom-pom-anemone') {
      assert.ok(Math.abs(ay - generator.heightAt(ax, az)) < tolerance, `${label} ${agent.id}`); checks.deepAnchors++;
    }
  }
}
function unchangedRegions(beforeLabel, afterLabel) {
  const before = byLabel.get(beforeLabel).ocean.ecology, after = byLabel.get(afterLabel).ocean.ecology;
  let count = 0;
  for (const region of before.regions) {
    const next = after.regions.find(r => r.id === region.id); if (!next) continue;
    for (const key of ['timeSec', 'resources', 'ledger', 'counters', 'agentCount', 'alive']) assert.deepEqual(next[key], region[key], `${beforeLabel}→${afterLabel} ${region.id} ${key}`);
    const agents = value => value.agents.filter(agent => agent.regionId === region.id).sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(agents(after), agents(before), `${beforeLabel}→${afterLabel} ${region.id} animals`); count++;
  }
  assert.ok(count > 0); return count;
}
const pause = { kelp: unchangedRegions('kelp-loaded', 'kelp-paused-bed'), reef: unchangedRegions('reef-pause-final-before', 'reef-pause-final-after'),
  deep: unchangedRegions('deep-active-then-paused', 'deep-paused-observe') };
// Preserve the earlier failed receipts as defect evidence. These final receipts
// are taken only after the pause checkpoint and saved pause preference fixes.
const refresh = { kelp: unchangedRegions('kelp-final-committed-before-refresh', 'kelp-final-committed-after-refresh') };
assert.equal(byLabel.get('kelp-final-committed-before-refresh').paused, true);
assert.equal(byLabel.get('kelp-final-committed-after-refresh').paused, true);
const testLog = await readFile(`${dir}scene-physics-related-final.tap`, 'utf8');
assert.match(testLog, /# tests 406\r?\n# suites 0\r?\n# pass 406\r?\n# fail 0/);
const pauseTestLog = await readFile(`${dir}scene-physics-pause-final.tap`, 'utf8');
assert.match(pauseTestLog, /# tests 19\r?\n# suites 0\r?\n# pass 19\r?\n# fail 0/);
const buildLog = await readFile(`${dir}scene-physics-build.log`, 'utf8'); assert.match(buildLog, /Prepared Sites build/);
const sourceHashes = {};
async function files(path) { for (const entry of await readdir(path, { withFileTypes: true })) {
  const name = `${path}/${entry.name}`; if (entry.isDirectory()) await files(name); else sourceHashes[name] = hash(await readFile(name));
} }
await files('src');
await writeFile(`${dir}scene-physics-source-hashes.json`, JSON.stringify(sourceHashes, null, 2));
const report = { status: 'passed-bounded-scene-physics-audit', recordedAt: new Date().toISOString(), receiptCount: receipts.length,
  receiptsSha256: hash(bytes), checks, pauseRegionsVerified: pause, refreshRegionsVerified: refresh,
  actualNearbyHosts: byLabel.get('kelp-neighbor-paused').ocean.animalRendering.detailedHosts,
  relatedTests: { tests: 406, passed: 406, failed: 0, path: `${dir}scene-physics-related-final.tap` },
  finalPauseTests: { tests: 19, passed: 19, failed: 0, path: `${dir}scene-physics-pause-final.tap` },
  build: { passed: true, log: `${dir}scene-physics-build.log` }, sourceFileCount: Object.keys(sourceHashes).length,
  historicalFailures: { count: 11, separatelyReproduced: true, evidence: `${dir}scene-physics-historical-baseline.json` },
  scope: 'Finite actual DOM receipts and model supports. No complete bodies/leaves/fluid dynamics or universal frame rate proof.' };
await writeFile(`${dir}scene-physics-validation.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
