import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REVISION } from 'three';
import { enableStaticRayQueries } from '../src/world/reefSpatialQueries.js';
import { createReefQueryFixture, createReefQueryRays, queryNearest } from '../tests/helpers/reef-query-fixture.mjs';

const fixture = createReefQueryFixture(), rays = createReefQueryRays(1000);
try {
  // Warm-up identical rays before timed runs; tree construction is reported
  // separately. These are CPU query times, never a browser rendering FPS.
  queryNearest(fixture.meshes, rays.slice(0, 100));
  let start = performance.now();
  const baseline = queryNearest(fixture.meshes, rays);
  const ordinaryMs = performance.now() - start;
  start = performance.now();
  const enabled = enableStaticRayQueries(fixture.root);
  const treeConstructionMs = performance.now() - start;
  queryNearest(fixture.meshes, rays.slice(0, 100), { firstHitOnly: true });
  start = performance.now();
  const accelerated = queryNearest(fixture.meshes, rays, { firstHitOnly: true });
  const acceleratedMs = performance.now() - start;
  let blocked = 0;
  baseline.forEach((expected, index) => {
    const actual = accelerated[index];
    assert.equal(Boolean(actual), Boolean(expected), `ray ${index} occlusion`);
    if (expected) {
      blocked++;
      assert.equal(actual.object, expected.object, `ray ${index} mesh`);
      assert.ok(Math.abs(actual.distance - expected.distance) < 1e-7, `ray ${index} distance`);
      assert.ok(actual.point.distanceTo(expected.point) < 1e-7, `ray ${index} point`);
      assert.equal(actual.faceIndex, expected.faceIndex, `ray ${index} triangle`);
    }
  });
  const unique = new Set(fixture.meshes.map(mesh => mesh.geometry));
  const report = {
    capturedAt: new Date().toISOString(), benchmark: 'Node CPU nearest and finite-segment obstruction ray queries',
    browserFpsMeasured: false, nodeVersion: process.version, threeRevision: REVISION, bvhVersion: '0.9.15',
    geometry: 'Current real authored reefTerrain, 165 placed landscape corals and 8 catalog staghorn corals; renderer-free',
    rays: rays.length, blockedRays: blocked, clearRays: rays.length - blocked, matchedRays: rays.length,
    meshes: fixture.meshes.length, uniqueGeometries: unique.size,
    uniqueTriangles: [...unique].reduce((sum, geometry) => sum + (geometry.index?.count ?? geometry.attributes.position.count) / 3, 0),
    enabled, treeConstructionMs, ordinaryMs, acceleratedMs, cpuQuerySpeedup: ordinaryMs / acceleratedMs,
  };
  const output = process.argv[2];
  if (output) { await mkdir(path.dirname(path.resolve(output)), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
} finally { fixture.dispose(); }
