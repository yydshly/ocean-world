import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShallowSampleScene } from '../src/world/ShallowSampleScene.js';
import { sampleBodyWave } from '../src/world/ShallowNaturalAssets.js';

function framing(world, time) {
  world.update(time); world.camera.updateMatrixWorld(true);
  const members = world.model.encounters.find(e => e.time === time).agents;
  let inFrame = 0, broadside = 0; const pixels = [];
  for (const a of members) {
    const p = new THREE.Vector3(a.position.x, a.position.y, a.position.z);
    const distance = p.distanceTo(world.camera.position), view = p.clone().sub(world.camera.position).normalize();
    const forward = new THREE.Vector3(Math.cos(a.heading), 0, Math.sin(a.heading));
    const side = Math.sqrt(Math.max(0, 1 - forward.dot(view) ** 2)), ndc = p.clone().project(world.camera);
    if (distance < 8 && Math.abs(ndc.x) < .85 && Math.abs(ndc.y) < .8 && ndc.z > -1 && ndc.z < 1) {
      inFrame++; if (side > .7) broadside++;
      pixels.push(a.sizeM * side / distance * 720 / (2 * Math.tan(58 * Math.PI / 360)));
    }
  }
  pixels.sort((a, b) => a - b);
  return { time, members: members.length, inFrame, broadside, medianPixels: pixels[Math.floor(pixels.length / 2)] };
}

function renderedPose(world, batches, time) {
  world.update(time); world.scene.updateMatrixWorld(true); world.camera.updateMatrixWorld(true);
  return {
    animals: batches.flatMap(b => b.agents.map(a => [a.id, a.position.x, a.position.y, a.position.z, a.heading])),
    matrices: batches.flatMap(b => b.parts.map(p => Array.from(p.mesh.instanceMatrix.array))),
    camera: [...world.camera.position.toArray(), ...world.camera.quaternion.toArray()],
  };
}

test('world-fixed school passages retain actual animal envelopes, safe full-route clearances and deterministic rendering', t => {
  const world = new ShallowSampleScene(55), model = world.model;
  world.camera.aspect = 1280 / 720; world.camera.updateProjectionMatrix();
  const batches = world.animals.batches.filter(b => b.agents[0].mode === 'school');
  const schools = batches.flatMap(b => b.agents);
  const authored = new Map(schools.map(a => [a.id, {
    center: { ...a.schoolCenter }, home: { ...a.home }, size: a.sizeM, species: a.speciesId,
  }]));
  const minimumBySpecies = new Map();
  let minimumEnvelope = { gapM: Infinity }, minimumVertex = { gapM: Infinity };
  let maximumViewportArea = { fraction: 0 }, checkedVertices = 0;
  try {
    assert.ok(schools.some(a => a.speciesId === 'lyretail-anthias'), 'the resident school also needs full-route protection');
    for (const a of schools) {
      assert.ok(a.clearance.radius <= a.sizeM * .70 + 1e-8,
        `${a.id}: the actual asset plus movement padding exceeds the authored school body budget`);
    }
    // Use the instantiated asset envelopes and the actual scene camera. This
    // is deliberately independent of the passage module's lane calculation.
    for (let frame = 0; frame <= 600; frame++) {
      const time = frame / 8; world.update(time);
      for (const a of schools) {
        const gapM = Math.hypot(a.position.x - world.camera.position.x, a.position.z - world.camera.position.z) - a.clearance.radius;
        assert.ok(gapM >= .75, `${a.id} comes within ${gapM}m of the observer body at ${time}s`);
        const row = { gapM, time, agentId: a.id, speciesId: a.speciesId };
        if (gapM < minimumEnvelope.gapM) minimumEnvelope = row;
        if (gapM < (minimumBySpecies.get(a.speciesId)?.gapM ?? Infinity)) minimumBySpecies.set(a.speciesId, row);
        const original = authored.get(a.id);
        assert.equal(a.schoolCenter.x, original.center.x); assert.equal(a.schoolCenter.z, original.center.z);
        assert.equal(a.home.x, original.home.x); assert.equal(a.home.z, original.home.z);
        assert.equal(a.sizeM, original.size); assert.equal(a.speciesId, original.species);
      }
    }

    const expected29 = renderedPose(world, batches, 29), expected72 = renderedPose(world, batches, 72);
    for (const time of [75, 3, 42, 68, 12]) renderedPose(world, batches, time);
    assert.deepEqual(renderedPose(world, batches, 29), expected29, 'seeking changes actual matrices or camera at 29s');
    renderedPose(world, batches, 6);
    assert.deepEqual(renderedPose(world, batches, 72), expected72, 'seeking changes actual matrices or camera at 72s');

    // The existing community test owns the 90%/25px/broadside thresholds;
    // record the same observation facts here without replacing those checks.
    const observations = [framing(world, 24), framing(world, 68)];
    const times = new Set([29, 72, ...Array.from(minimumBySpecies.values(), r => r.time)]);
    const point = new THREE.Vector3(), eye = new THREE.Vector3(), projected = new THREE.Vector3();
    const instance = new THREE.Matrix4(), transform = new THREE.Matrix4();
    for (const time of times) {
      world.update(time); world.scene.updateMatrixWorld(true); world.camera.updateMatrixWorld(true);
      for (const batch of batches) for (const [index, a] of batch.agents.entries()) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const { mesh } of batch.parts) {
          const g = mesh.geometry, position = g.attributes.position, wave = g.attributes.sampleSwim, waveX = g.attributes.sampleSwimX;
          assert.ok(wave && waveX, `${batch.id} is missing its actual independent swimming attributes`);
          mesh.getMatrixAt(index, instance); transform.multiplyMatrices(mesh.matrixWorld, instance);
          for (let vertex = 0; vertex < position.count; vertex++) {
            const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
            const offset = sampleBodyWave(waveX.getX(vertex), time, wave.getX(index), wave.getY(index), wave.getZ(index)).offset;
            const u = THREE.MathUtils.clamp((.26 - waveX.getX(vertex)) / .6, 0, 1), bound = u * u * wave.getZ(index);
            // Both waveform extremes bound every phase at this real fin/body
            // pose; the first point is the actual per-instance shader phase.
            for (const [phase, delta] of [offset, -bound, bound].entries()) {
              point.set(x, y, z + delta).applyMatrix4(transform);
              assert.ok(Math.hypot(point.x - a.position.x, point.z - a.position.z) <= a.clearance.radius + 2e-6,
                `${a.id} rendered ${mesh.name} escapes the actual asset movement envelope`);
              const gapM = Math.hypot(point.x - world.camera.position.x, point.z - world.camera.position.z);
              assert.ok(gapM >= .75 - 2e-6, `${a.id} has a rendered vertex inside the observer passage at ${time}s`);
              if (phase === 0 && gapM < minimumVertex.gapM) minimumVertex = { gapM, time, agentId: a.id, speciesId: a.speciesId };
              eye.copy(point).applyMatrix4(world.camera.matrixWorldInverse);
              const depth = -eye.z;
              if (depth <= 0) continue; // A school may naturally leave behind the observer.
              projected.copy(eye).applyMatrix4(world.camera.projectionMatrix);
              if (Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1)
                assert.ok(depth >= world.camera.near, `${a.id} enters the visible near plane at ${time}s`);
              if (depth < world.camera.near || depth > world.camera.far) continue;
              minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x);
              minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y);
            }
            checkedVertices++;
          }
        }
        // Normal edge exits are allowed. A clipped viewport envelope detects
        // one nearby body swallowing the picture without requiring every fish
        // to remain completely in-frame throughout the 75-second passage.
        const width = Math.max(0, Math.min(1, maxX) - Math.max(-1, minX));
        const height = Math.max(0, Math.min(1, maxY) - Math.max(-1, minY));
        const fraction = width * height / 4;
        assert.ok(fraction <= .25, `${a.id} covers ${fraction} of the viewport envelope at ${time}s`);
        if (fraction > maximumViewportArea.fraction) maximumViewportArea = { fraction, time, agentId: a.id, speciesId: a.speciesId };
      }
    }
    assert.ok(checkedVertices > 100000, 'the dangerous passages need complete real meshes, not only animal centres');
    t.diagnostic(JSON.stringify({ kind: 'native-school-envelope-and-vertex-check-not-webgl-or-occlusion',
      routeStepSeconds: .125, minimumAssetEnvelopeGapM: minimumEnvelope, minimumCheckedActualVertexGapM: minimumVertex,
      maximumCheckedBoundedViewportEnvelope: maximumViewportArea, checkedTimes: [...times], checkedVertices, observations }));
  } finally { world.dispose(); }
});
