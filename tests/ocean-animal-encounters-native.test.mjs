import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed } from '../src/livingShallows.js';
import { livingShallowsSpeciesCatalog } from '../src/sceneCatalog.js';
import { sampleOceanAnimalEncounter } from '../src/world/oceanAnimalEncounters.js';

test('one actual seed44 meadow window offers local living community looks without altering ecology', async () => {
  const seed = livingShallowsSeed('44'), generator = createLivingRidgeGenerator(createLivingShallowsGenerator(seed)), records = new Map();
  const store = { available: true, async load(_world, id) { return structuredClone(records.get(id) ?? null); },
    async saveMany(_world, rows) { for (const [id, row] of rows) records.set(id, structuredClone(row)); } };
  const model = new OceanEcology(seed, generator, { store, turtles: true, sceneElements: false, habitatScenes: false, macroLandscape: false,
    livingGeology: true, habitatMosaic: true, seabedRelief: true, seascape: true, livingBelt: true, shallowSeascape: true, coastalSeascape: true,
    reefValleyRegion: true, meadowRegion: true, turtleGrazing: true, biodiversity: true, benthicLife: true, meadowLife: true, shoalLife: true });
  try {
    const started = performance.now(); await model.update({ x: 228 * 64 + 24, z: 4 * 64 + 64 });
    const plan = generator.getRidgePlan('228,4'); assert.equal(plan.version, 9);
    // Read region arrays directly: OceanEcology.agents intentionally annotates
    // timeSec for the renderer, while this selector's evidence is read-only.
    const activeOwnerIds = [...model._active.keys()], agents = [...model._active.values()].flatMap(r => r.agents.concat(r.turtleAgents ?? []));
    const savedBefore = structuredClone([...records]), activeBefore = structuredClone([...model._active]);
    const catalog = new Map(livingShallowsSpeciesCatalog.map(s => [s.id, s])), path = plan.group.routePath;
    const selectedIds = new Set(), speciesIds = new Set(), categories = new Set(), looks = [];
    let testedPathPoints = 0, centreFrustumMatches = 0;
    for (let i = 1; i < path.length - 1; i += 4) {
      const position = path[i], id = `${Math.floor(position.x / 64)},${Math.floor(position.z / 64)}`; if (!activeOwnerIds.includes(id)) continue;
      testedPathPoints++; const before = path[i - 1], after = path[i + 1], dx = after.x - before.x, dz = after.z - before.z, n = Math.hypot(dx, dz);
      const routeTarget = { x: position.x + dx / n * 8, y: position.y - .65, z: position.z + dz / n * 8 };
      const result = sampleOceanAnimalEncounter({ position, routeTarget, agents, catalog, activeOwnerIds, aspect: 16 / 9 });
      if (!result.ids.length) continue;
      assert.ok(result.stats.maxDistanceM <= 14); categories.add(result.category);
      const camera = new THREE.PerspectiveCamera(49, 16 / 9, .04, 14);
      camera.position.set(position.x, position.y, position.z); camera.lookAt(result.desiredTarget.x, result.desiredTarget.y, result.desiredTarget.z); camera.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const id of result.ids) { const a = agents.find(a => a.id === id); assert.ok(a.alive && activeOwnerIds.includes(a.regionId));
        selectedIds.add(id); speciesIds.add(a.speciesId); if (frustum.containsPoint(new THREE.Vector3(a.position.x, a.position.y, a.position.z))) centreFrustumMatches++; }
      looks.push({ pathIndex: i, ids: result.ids, category: result.category, rangeM: result.stats.maxDistanceM });
    }
    assert.ok(testedPathPoints > 0); assert.ok(looks.length > 0, 'native camera path should encounter current residents');
    assert.ok(centreFrustumMatches > 0); assert.deepEqual([...records], savedBefore); assert.deepEqual([...model._active], activeBefore);
    assert.equal(model._active.size, 9); assert.ok([...model._active.values()].every(r => r.agents.length + (r.turtleAgents?.length ?? 0) <= 20));
    const receipt = { seed: '44', groupId: plan.group.id, activeOwnerIds, actualLivingRecords: agents.filter(a => a.alive).length,
      testedPathPoints, localLookSamples: looks.length, uniqueSelectedIds: selectedIds.size, selectedSpeciesIds: [...speciesIds], categories: [...categories],
      centreFrustumMatches, actualModelSecAdvanced: 0, historyAndActiveStateUnchanged: true, wallSeconds: (performance.now() - started) / 1000,
      evidenceScope: 'one native v9 active window and original route; live record angular selection and CPU point frustum only; no GPU, scenery occlusion, frame rate or visual acceptance', looks };
    console.log('native meadow encounter', JSON.stringify(receipt));
    if (process.env.OCEAN_ANIMAL_ENCOUNTER_RECEIPT) await writeFile(process.env.OCEAN_ANIMAL_ENCOUNTER_RECEIPT, JSON.stringify(receipt, null, 2));
  } finally { await model.dispose(); generator.clearCache?.(); }
});
