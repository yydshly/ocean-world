import test from 'node:test';
import assert from 'node:assert/strict';
import { oceanRockMesh, oceanRockSurface, SHALLOW_SAMPLE_SLOPE_ROCK_PROFILES } from '../src/oceanRockShape.js';

test('sample slope has connected undulating support at its real world scale within the existing mesh budget', () => {
  for (const profile of SHALLOW_SAMPLE_SLOPE_ROCK_PROFILES) {
    const mesh = oceanRockMesh(profile);
    assert.equal(mesh.positions.length / 3, 2305);
    assert.equal(mesh.indices.length / 3, 4544);
    const shoulder = [];
    for (const z of [-.16, .15]) {
      const heights = [];
      for (let i = 0; i <= 40; i++) {
        const x = -.23 + i * .46 / 40, surface = oceanRockSurface(profile, x, z);
        assert.ok(surface, `${profile} lost a broad supporting region`);
        // Normal transformation must include the displayed module scale. A
        // unit-normalized asset is taller/steeper than its 15m-wide world mesh.
        const n=surface.normal,worldY=(n.y/3.6)/Math.hypot(n.x/14.5,n.y/3.6,n.z/7.25);
        assert.ok(worldY > .78, `${profile} lost a usable world-space slope`);
        heights.push(surface.height);
      }
      assert.ok(Math.max(...heights) - Math.min(...heights) > .05,
        `${profile} support band is still a flat artificial platform`);
    }
    for (let i = 0; i <= 30; i++) {
      const x = -.23 + i * .46 / 30, low = oceanRockSurface(profile, x, -.16).height;
      let crossing = null;
      for (let k = 0; k <= 120; k++) {
        // Search the whole toe-to-shoulder interval: the new continuous rise
        // no longer has the old step's narrowly located transition.
        const z = -.16 + k * .31 / 120, surface = oceanRockSurface(profile, x, z);
        if (surface.height >= low + .12) { crossing = z; break; }
      }
      assert.notEqual(crossing, null, `${profile} no longer connects its lower and upper support bands`);
      shoulder.push(crossing);
    }
    assert.ok(Math.max(...shoulder) - Math.min(...shoulder) > .02,
      `${profile} actual shoulder remains a straight terrace edge`);
    // The complete displayed rim still joins the sediment, rather than adding
    // an undercut visual shell that the highest-surface query cannot represent.
    const start = mesh.positions.length - mesh.rimSectors * 3;
    for (let i = start; i < mesh.positions.length; i += 3) assert.equal(mesh.positions[i + 1], 0);
  }
});
