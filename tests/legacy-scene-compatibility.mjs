import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as actualRock from '../src/oceanRockShape.js';
import * as legacyRock from './fixtures/legacy-oceanRockShape.js';
import { createReefValleyRegionPlans } from '../src/reefValleyRegion.js';
import { createReefValleyRegionPlans as legacyPlans } from './fixtures/legacy-reefValleyRegion.js';

// Independent sources from committed 1f104ac, not snapshots of today's output.
// A new opt-in scene may extend these modules without changing old saved worlds.
const sha = value => createHash('sha256').update(value).digest('hex');
let rocksChecked = false;
export function assertLegacyRockCompatibility(expectedHash) {
  assert.equal(sha(readFileSync(new URL('./fixtures/legacy-oceanRockShape.js', import.meta.url))), expectedHash);
  if (rocksChecked) return;
  assert.equal(actualRock.OCEAN_ROCK_SURFACE_VERSION, legacyRock.OCEAN_ROCK_SURFACE_VERSION);
  for (const registry of ['OCEAN_ROCK_PROFILES', 'LIVING_SHALLOWS_ROCK_PROFILES']) {
    assert.deepEqual(actualRock[registry], legacyRock[registry]);
    for (const profile of legacyRock[registry]) {
      assert.deepEqual(actualRock.oceanRockMesh(profile), legacyRock.oceanRockMesh(profile), `${profile}: every vertex and triangle`);
      for (let iz = -12; iz <= 12; iz++) for (let ix = -12; ix <= 12; ix++) {
        const x = ix / 20, z = iz / 20;
        assert.deepEqual(actualRock.oceanRockSurface(profile, x, z), legacyRock.oceanRockSurface(profile, x, z), `${profile}: support ${x},${z}`);
        for (const rotation of [0, .7, 2.1]) {
          const rock = { profile, x: 37, y: -8, z: -53, rotation, scale: { x: 3.1, y: 1.4, z: 2.3 } };
          const wx = rock.x + Math.cos(rotation) * x * 3.1 + Math.sin(rotation) * z * 2.3;
          const wz = rock.z - Math.sin(rotation) * x * 3.1 + Math.cos(rotation) * z * 2.3;
          assert.equal(actualRock.oceanRockHeight(rock, wx, wz), legacyRock.oceanRockHeight(rock, wx, wz), `${profile}: transformed support`);
        }
      }
    }
  }
  rocksChecked = true;
}

export function assertLegacyValleyCompatibility(base, cx = 222, cz = 4) {
  const source = readFileSync(new URL('./fixtures/legacy-reefValleyRegion.js', import.meta.url), 'utf8').replaceAll("from '../../src/", "from './");
  assert.equal(sha(source), '8c3a7e94a78e085986e49601c1dbaa374d57cdd58976edf206a71259ece66439');
  assert.equal(base.wholeSeabedVersion, undefined, 'this regression covers the historical v8 recipe');
  assert.deepEqual(createReefValleyRegionPlans(base, cx, cz), legacyPlans(base, cx, cz), 'all twelve legacy owners, floors, roots, routes and allocations');
}
