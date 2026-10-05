import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { ReefSimulation } from '../src/simulation.js';
import { REEF_ROCKS, REEF_BRIDGE_ROCK_INDEX, floorHeight, habitatHeight } from '../src/habitat.js';
import { createReefRockGeometry } from '../src/world/reefTerrain.js';

const root = new URL('../', import.meta.url);
const prior = JSON.parse(await readFile(new URL('output/validation/coral-initialization-before-hard-substrate-v1.json', root), 'utf8'));
// Actual Three.js triangle geometry and Raycaster, without a WebGL renderer.
// Calls the same geometry builder as the world, avoiding a copied surface.
const material = new THREE.MeshBasicMaterial();
const rocks = REEF_ROCKS.map((rock,index) => {
  const geometry=createReefRockGeometry(rock,{bedSupported:index!==REEF_BRIDGE_ROCK_INDEX});
  const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
  return mesh;
});
const ray = new THREE.Raycaster(), rows = [];
let maxModelAboveRenderedM = -Infinity, minModelAboveRenderedM = Infinity;
try {
  for (const before of prior.runs) {
    const sim = new ReefSimulation(before.seed), replay = new ReefSimulation(before.seed);
    assert.deepEqual(sim.agents, replay.agents);
    assert.equal(sim._rngState, before.rngState, 'Hard-substrate placement must preserve RNG draw count');
    for (const agent of sim.agents) {
      const old = [...before.corals, ...before.crabs, ...before.nonCoralCrab].find(row => row.id === agent.id);
      for (const key of ['sizeM', 'heading', 'energy', 'parasites', 'nextDecision', 'nextBite']) assert.equal(agent[key], old[key], `${agent.id}.${key} changed seeded trait`);
      if (!['staghorn-coral', 'reef-crab'].includes(agent.speciesId)) {
        assert.equal(agent.position.x, old.position.x);
        assert.equal(agent.position.z, old.position.z);
      }
    }
    const corals = sim.agents.filter(agent => agent.speciesId === 'staghorn-coral');
    assert.equal(corals.length, 8);
    for (const agent of corals) {
      const { x, y, z } = agent.position;
      ray.set(new THREE.Vector3(x, 7, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(rocks, false)[0];
      assert(hit, `${agent.id} has no rendered hard support`);
      const analyticHeightM = habitatHeight(x, z), renderedHeightM = hit.point.y;
      const modelAboveRenderedM = analyticHeightM - renderedHeightM;
      maxModelAboveRenderedM = Math.max(maxModelAboveRenderedM, modelAboveRenderedM);
      minModelAboveRenderedM = Math.min(minModelAboveRenderedM, modelAboveRenderedM);
      assert(renderedHeightM - floorHeight(x, z) > 0.7, 'Support is not the sand floor');
      assert(Math.abs(y - analyticHeightM - 0.004) < 1e-12);
      assert(Math.abs(modelAboveRenderedM) < 0.03, 'Actual site exceeds the 3 cm authored contact tolerance');
      rows.push({ seed: before.seed, id: agent.id, positionM: { x, y, z }, sizeM: agent.sizeM,
        analyticHeightM, renderedHeightM, modelAboveRenderedM,
        rootAboveRenderedM: y - renderedHeightM, supportRockIndex: rocks.indexOf(hit.object) });
    }
  }
} finally {
  for (const mesh of rocks) mesh.geometry.dispose();
  material.dispose();
}
const sourceFiles = ['src/simulation.js', 'src/habitat.js', 'src/world/ReefWorld.js', 'src/world/reefTerrain.js', 'tests/simulation.test.mjs', 'scripts/inspect-coral-attachment.mjs'];
const sourceSha256 = Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
  [file, createHash('sha256').update(await readFile(new URL(file, root))).digest('hex')])));
const report = { schema: 'tidal-coral-hard-substrate-node-inspection-v2', generatedAtUtc: new Date().toISOString(),
  passed: true, sourceSha256, samples: rows.length, seeds: prior.runs.map(row => row.seed), colonyCountPerSeed: 8,
  seededTraitsAndRandomStatePreserved: true, nonCoralCrabHorizontalInitializationPreserved: true,
  maxModelAboveRenderedM, minModelAboveRenderedM, rows,
  sources: [
    { url: 'https://www.coralsoftheworld.org/species_factsheets/species_factsheet_summary/acropora-muricata/',
      scope: 'Species-specific reef-slope/lagoon habitat and compact branching thickets; no explicit hard-substrate sentence.' },
    { url: 'https://floridakeys.noaa.gov/corals/coralreefs.html',
      scope: 'General solid attachment and hard-substrate coral ecology. Applying this requirement to A. muricata is an inference, not a species-specific calibrated recruitment study.' },
  ],
  limits: ['Node executes real Three.js triangle geometry and raycasting, not a browser or GPU rendering.',
    'The continuous shared relief and the 32 × 20 sphere triangles differ by interpolation. Reported errors are at the 48 actual sampled colony sites, not a global surface bound.',
    'A 4 mm root offset and <=3 cm model-versus-triangle tolerance are authored contact conventions, not biological parameters.',
    'Branch clusters cover an area around the colony root; this report does not prove that every individual branch base conforms to the full local mesh. Browser close-up inspection remains necessary.'],
};
await writeFile(new URL('output/validation/coral-bed-supported-inspection-v2.json', root), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, samples: report.samples, maxModelAboveRenderedM, minModelAboveRenderedM }, null, 2));
