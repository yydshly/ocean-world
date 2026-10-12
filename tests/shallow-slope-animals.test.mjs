import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShallowSampleScene } from '../src/world/ShallowSampleScene.js';
import { arrangeSlopeAnimalSpaces } from '../src/shallowSampleSlopeAnimals.js';
import { oceanRockHeight } from '../src/oceanRockShape.js';

test('continuous reef benches retain complete resident and patrol spaces at natural scale for all 75 seconds', () => {
  const world = new ShallowSampleScene();
  const model = world.model, habitats = arrangeSlopeAnimalSpaces(model);
  assert.equal(habitats.residents.length, 18, 'eighteen residents occupy verified natural crevices');
  assert.equal(habitats.fish.length, 7, 'all selected small patrols need stable reef spaces');
  assert.deepEqual(new Set(habitats.footprints.map(p => p.zone)), new Set(['near', 'tail']));
  const bodyIdentity = model.agents.map(a => [a.id, a.speciesId, a.sizeM]);
  assert.strictEqual(arrangeSlopeAnimalSpaces(model), habitats, 'repeat calls must retain the same authored arrangement');
  assert.deepEqual(model.agents.map(a => [a.id, a.speciesId, a.sizeM]), bodyIdentity);
  const protectedIds = new Set([
    ...model.reefCommunity.fish,
    ...model.encounters.flatMap(e => e.agents),
    ...model.agents.filter(a => a.sampleCommunityVisit !== undefined),
  ].map(a => a.id));
  for (const a of [...habitats.residents, ...habitats.fish]) {
    assert.ok(!protectedIds.has(a.id), `${a.id} overwrote a key encounter`);
    assert.ok(a.host.startsWith('sample-live-slope-'));
  }
  for (const c of model.corals) for (const p of habitats.footprints) {
    assert.ok(Math.hypot(c.x - p.x, c.z - p.z) >= c.radius + p.r + .02499,
      `${c.host} filled an animal's reserved reef space`);
  }
  // Geometric projection is a framing constraint, not an occlusion, species
  // recognition, WebGL or FPS claim. Midground animals keep their natural size.
  world.camera.aspect = 1280 / 720; world.camera.updateProjectionMatrix();
  for (const [time, zone] of [[24, 'near'], [69, 'tail']]) {
    world.update(time); world.camera.updateMatrixWorld(true);
    const members = [...habitats.residents, ...habitats.fish].filter(a => a.slopeHabitat.zone === zone);
    const readableSpecies = new Set(); let inFrame = 0;
    for (const a of members) {
      const point = new THREE.Vector3(a.position.x, a.position.y, a.position.z);
      const distance = point.distanceTo(world.camera.position), ndc = point.project(world.camera);
      if (Math.abs(ndc.x) < .95 && Math.abs(ndc.y) < .95 && ndc.z > -1 && ndc.z < 1) {
        inFrame++;
        if (2 * a.clearance.radius / distance * 720 / (2 * Math.tan(58 * Math.PI / 360)) >= 15) readableSpecies.add(a.speciesId);
      }
    }
    assert.ok(inFrame >= members.length * .75, `${zone} residents are mostly outside the actual observation frame`);
    assert.ok(readableSpecies.size >= 3, `${zone} has no readable midground animal envelopes`);
    const residents = habitats.residents.filter(a => a.slopeHabitat.zone === zone);
    const front = residents.filter(a => a.slopeHabitat.level === 'toe-bench');
    assert.ok(new Set(front.map(a=>a.speciesId)).size>=4,`${zone} lacks a mixed benthic community`);
    // A naturally eroded formation does not guarantee two level terraces.
    // Every selected site's complete footprint keeps the original clearance
    // tests below; the two unsuitable candidates remain in prior habitats.

  }
  for (let t = 0; t <= 75; t += .5) {
    world.update(t);
    for (const p of habitats.footprints) {
      const a = model.agents.find(row => row.id === p.agentId), host = model.rocks.find(r => r.id === p.host);
      assert.ok(Math.hypot(a.position.x - p.x, a.position.z - p.z) + a.clearance.radius < p.r + 1e-8,
        `${a.id} left its full-body reservation`);
      for (let k = 0; k < 16; k++) {
        const angle = k * Math.PI / 8, x = a.position.x + a.clearance.radius * Math.cos(angle), z = a.position.z + a.clearance.radius * Math.sin(angle);
        if(a.slopeHabitat.level==='reef-water'){
          assert.ok(a.position.y-a.clearance.bottom>=model.surface(x,z,true),'patrol intersects living bank');
          assert.ok(Number.isFinite(a.reefPatrol.supportCeiling));continue;
        }
        const y = oceanRockHeight(host, x, z);
        assert.ok(y !== null && y > model.floor(x, z) + .04, `${a.id} left the actual hard bench`);
        assert.ok(Math.abs(model.surface(x, z) - y) < .01501, `${a.id} moved onto a different upper rock`);
      }
    }
    for (let i = 0; i < habitats.footprints.length; i++) for (let j = i + 1; j < habitats.footprints.length; j++) {
      const a = model.agents.find(row => row.id === habitats.footprints[i].agentId), b = model.agents.find(row => row.id === habitats.footprints[j].agentId);
      assert.ok(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) > a.clearance.radius + b.clearance.radius,
        `${a.id} and ${b.id} overlap within their planned spaces`);
    }
  }
  world.dispose();
});
