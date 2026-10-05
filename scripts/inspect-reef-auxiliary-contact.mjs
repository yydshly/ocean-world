import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ReefSimulation } from '../src/simulation.js';
import { speciesById } from '../src/species.js';
import { REEF_AUXILIARY_ROCKS } from '../src/reefScenery.js';
import { createReefRockGeometry } from '../src/world/reefTerrain.js';
import { enableStaticRayQueries } from '../src/world/reefSpatialQueries.js';

export function inspectAuxiliaryFishContact({ seeds = [42, 77, 2026], seconds = 60, step = .1 } = {}) {
  const parts = REEF_AUXILIARY_ROCKS.map(rock => createReefRockGeometry(rock));
  const geometry = mergeGeometries(parts), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  parts.forEach(part => part.dispose());
  const mesh = new THREE.Mesh(geometry, material), ray = new THREE.Raycaster();
  enableStaticRayQueries(mesh); mesh.updateMatrixWorld(true); ray.firstHitOnly = true;
  const down = new THREE.Vector3(0, -1, 0), cases = [];
  try {
    for (const seed of seeds) {
      const simulation = new ReefSimulation(seed);
      let pointSamples = 0, actualSubstrateHits = 0, minimumRootGapM = Infinity;
      let initialLinedTang = null;
      for (let tick = 0; tick <= Math.round(seconds / step); tick++) {
        for (const agent of simulation.agents) {
          if (!agent.alive || speciesById[agent.speciesId].kind !== 'fish') continue;
          const { x, y, z } = agent.position;
          assert.ok([x, y, z].every(Number.isFinite)); pointSamples++;
          if (seed === 42 && tick === 0 && agent.id === 'lined-tang-4') initialLinedTang = { ...agent.position };
          if (!REEF_AUXILIARY_ROCKS.some(rock => ((x - rock[0]) / rock[3]) ** 2 + ((z - rock[2]) / rock[5]) ** 2 <= 1)) continue;
          ray.set(new THREE.Vector3(x, 5, z), down);
          const hit = ray.intersectObject(mesh)[0];
          if (!hit) continue;
          const gap = y - hit.point.y; actualSubstrateHits++;
          minimumRootGapM = Math.min(minimumRootGapM, gap);
          assert.ok(gap > .095, `${seed}/${agent.id} at ${simulation.timeSec}: fish root enters rendered auxiliary substrate (${gap} m)`);
        }
        if (tick < Math.round(seconds / step)) simulation.step(step);
      }
      assert.ok(actualSubstrateHits > 0, 'Each seed must exercise actual auxiliary triangles');
      assert.ok(Math.abs(simulation.metrics.resourceBudgetError) < 1e-9);
      cases.push({ seed, simulationSeconds: simulation.timeSec, snapshots: Math.round(seconds / step) + 1,
        fishRootSamples: pointSamples, actualAuxiliaryRayHits: actualSubstrateHits, minimumRootGapM,
        resourceBudgetError: simulation.metrics.resourceBudgetError, initialLinedTang });
    }
  } finally { geometry.dispose(); material.dispose(); }
  return { schema: 'reef-auxiliary-fish-contact-v1', status: 'passed',
    scope: 'Fixed-seed fish root points versus actual auxiliary hard-substrate triangles in Node; metres and seconds.',
    auxiliaryRocks: REEF_AUXILIARY_ROCKS.length, stepSeconds: step, cases,
    historicalRegression: { seed: 42, agentId: 'lined-tang-4', simulationSeconds: 0,
      previousRootM: [-4.4435071696527295, .29010900205919804, .7137802274897695],
      previousAnalyticAuxiliaryTopM: .3380950112712403, penetrationM: .04798600921204227 },
    limitations: ['Point roots and finite 60-second samples do not prove whole-animal collision or arbitrary paths.',
      'This changes reef trajectories; previous long ecological experiments cover their recorded terrain revision.',
      'No browser rendering, GPU timing, measured geology or additional simulated biomass is asserted.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2];
  if (!output || process.argv.length !== 3 || !/^output\/validation\/[a-z0-9-]+\.json$/.test(output)) throw new Error('Pass a fresh output/validation/*.json path.');
  const paths = ['scripts/inspect-reef-auxiliary-contact.mjs', 'src/simulation.js', 'src/species.js',
    'src/habitat.js', 'src/reefScenery.js', 'src/world/reefTerrain.js', 'src/world/reefSpatialQueries.js'];
  const hashes = async () => Object.fromEntries(await Promise.all(paths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
  const before = await hashes(), report = inspectAuxiliaryFishContact();
  const after = await hashes(); assert.deepEqual(after, before, 'Source changed during contact inspection');
  await writeFile(output, JSON.stringify({ ...report, observedAtUtc: new Date().toISOString(), sourceSha256: before, sourceSha256After: after }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, seeds: report.cases.map(value => value.seed), output }));
}
