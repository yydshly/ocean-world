import test from 'node:test';
import assert from 'node:assert/strict';
import { oceanRockMesh, oceanRockSurface, oceanRockHeight, OCEAN_ROCK_PROFILES,
  OCEAN_ROCK_SURFACE_VERSION } from '../src/oceanRockShape.js';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} should be within ${tolerance} of ${expected}`);

test('three fixed macro profiles use frozen Float32 vertices, upward nondegenerate faces and bounded footprints', () => {
  assert.equal(OCEAN_ROCK_SURFACE_VERSION, 2);
  assert.ok(Object.isFrozen(OCEAN_ROCK_PROFILES));
  for (const profile of OCEAN_ROCK_PROFILES) {
    const mesh = oceanRockMesh(profile), { positions: p, indices } = mesh;
    assert.strictEqual(oceanRockMesh(profile), mesh, 'one shared prototype per profile');
    assert.ok(Object.isFrozen(mesh) && Object.isFrozen(p) && Object.isFrozen(indices));
    assert.equal(p.length / 3, 97);
    assert.equal(indices.length / 3, 176);
    for (let index = 0; index < p.length; index += 3) {
      assert.ok(Math.abs(p[index]) <= .5 && Math.abs(p[index + 2]) <= .5);
      assert.ok(p[index + 1] >= 0 && p[index + 1] <= 1);
      for (let axis = 0; axis < 3; axis++) assert.equal(p[index + axis], Math.fround(p[index + axis]));
    }
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const a = indices[triangle] * 3, b = indices[triangle + 1] * 3, c = indices[triangle + 2] * 3;
      const ny = (p[b + 2] - p[a + 2]) * (p[c] - p[a]) - (p[b] - p[a]) * (p[c + 2] - p[a + 2]);
      assert.ok(ny > 0, 'every upper face has positive projected area and normal Y');
    }
  }
  assert.throws(() => oceanRockMesh('missing'), RangeError);
});

test('support heights and normals match arbitrary barycentric points in the actual mesh triangles', () => {
  const weights = [[.2, .3, .5], [.07, .81, .12], [.63, .04, .33], [1 / 3, 1 / 3, 1 / 3]];
  for (const profile of OCEAN_ROCK_PROFILES) {
    const { positions: p, indices } = oceanRockMesh(profile);
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const a = indices[triangle] * 3, b = indices[triangle + 1] * 3, c = indices[triangle + 2] * 3;
      const ab = [0, 1, 2].map(axis => p[b + axis] - p[a + axis]);
      const ac = [0, 1, 2].map(axis => p[c + axis] - p[a + axis]);
      const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const length = Math.hypot(...normal);
      for (const [wa, wb, wc] of weights) {
        const point = [0, 1, 2].map(axis => p[a + axis] * wa + p[b + axis] * wb + p[c + axis] * wc);
        const surface = oceanRockSurface(profile, point[0], point[2]);
        assert.ok(surface, `support exists for ${profile} triangle ${triangle / 3}`);
        near(surface.height, point[1]);
        near(surface.normal.x, normal[0] / length); near(surface.normal.y, normal[1] / length);
        near(surface.normal.z, normal[2] / length);
      }
    }
  }
});

test('mesh ring, sector and rim boundaries join with exact support; polygon exterior returns null', () => {
  for (const profile of OCEAN_ROCK_PROFILES) {
    const { positions: p, indices } = oceanRockMesh(profile);
    for (let index = 0; index < p.length; index += 3) {
      const surface = oceanRockSurface(profile, p[index], p[index + 2]);
      assert.ok(surface, `${profile} vertex ${index / 3}`);
      near(surface.height, p[index + 1]);
    }
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      for (let side = 0; side < 3; side++) {
        const a = indices[triangle + side] * 3, b = indices[triangle + (side + 1) % 3] * 3;
        const x = (p[a] + p[b]) * .5, z = (p[a + 2] + p[b + 2]) * .5;
        const surface = oceanRockSurface(profile, x, z);
        assert.ok(surface);
        near(surface.height, (p[a + 1] + p[b + 1]) * .5);
      }
    }
    for (const [x, z] of [[.51, 0], [-.51, .1], [0, .51], [.36, .36], [.495, .095]]) {
      assert.equal(oceanRockSurface(profile, x, z), null);
    }
  }
  assert.throws(() => oceanRockSurface('mound', NaN, 0), RangeError);
});

test('world support follows anisotropic scale and rotation, including negative and distant coordinates', () => {
  for (const profile of OCEAN_ROCK_PROFILES) {
    for (const [x, z, rotation] of [[-74, 209, .73], [182, -290, -2.41], [1e9, -1e9, 1.2]]) {
      const rock = { profile, x, y: -8.4, z, rotation, scale: { x: 7.8, y: 2.1, z: 3.6 } };
      const c = Math.cos(rotation), s = Math.sin(rotation);
      for (const [lx, lz] of [[.02, .04], [-.16, .21], [.31, -.05], [-.36, -.08]]) {
        const worldX = x + lx * rock.scale.x * c + lz * rock.scale.z * s;
        const worldZ = z - lx * rock.scale.x * s + lz * rock.scale.z * c;
        const surface = oceanRockSurface(profile, lx, lz);
        near(oceanRockHeight(rock, worldX, worldZ), rock.y + surface.height * rock.scale.y, 2e-6);
      }
      const outsideX = x + .6 * rock.scale.x * c, outsideZ = z - .6 * rock.scale.x * s;
      assert.equal(oceanRockHeight(rock, outsideX, outsideZ), null);
    }
  }
  const mutable = { x: 0, y: 0, z: 0, rotation: 0, scale: { x: 1, y: 1, z: 1 } };
  const first = oceanRockHeight(mutable, .2, 0);
  mutable.scale.y = 2;
  near(oceanRockHeight(mutable, .2, 0), first * 2);
  mutable.scale.x = 2; mutable.rotation = Math.PI / 2;
  near(oceanRockHeight(mutable, 0, -.4), first * 2);
});

test('terrace has an upper platform and shoulder while ridge has a narrow elevated spine', () => {
  const terraceCentre = oceanRockSurface('terrace', 0, 0).height;
  near(oceanRockSurface('terrace', .20, 0).height, terraceCentre);
  near(oceanRockSurface('terrace', .10, .15).height, terraceCentre);
  assert.ok(terraceCentre - oceanRockSurface('terrace', .34, 0).height > .35);
  assert.ok(oceanRockSurface('ridge', .25, 0).height > .7);
  assert.ok(oceanRockSurface('ridge', 0, .25).height < .22);
  assert.ok(oceanRockSurface('mound', 0, .25).height > .8);
  assert.notDeepEqual(oceanRockMesh('terrace'), oceanRockMesh('mound'));
  assert.notDeepEqual(oceanRockMesh('ridge'), oceanRockMesh('mound'));
});
