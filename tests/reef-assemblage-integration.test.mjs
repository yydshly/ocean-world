import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanAnimals } from '../src/world/OceanAnimals.js';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { OCEAN_REEF_ASSEMBLAGE_SPECIES } from '../src/oceanReefAssemblageSpecies.js';

const makeAgents = () => OCEAN_REEF_ASSEMBLAGE_SPECIES.map((s, i) => ({
  id: `resident:${s.id}`, regionId: '204,4', speciesId: s.id, alive: true,
  sizeM: (s.sizeRangeM[0] + s.sizeRangeM[1]) / 2,
  position: { x: 13100 + i * 2, y: 1, z: 280 },
  velocity: { x: .02, y: 0, z: .01 }, heading: .7, pitch: .06,
  supportNormal: { x: -.06, y: .997, z: .04 }, timeSec: 3.2,
  state: s.support.footContacts.length > 0 ? 'reef-foraging' : 'cruising',
}));

test('production shallow catalog includes all six distinct new animal types while legacy scene catalogs stay separate', () => {
  assert.equal(OCEAN_REEF_ASSEMBLAGE_SPECIES.length, 6);
  for (const s of OCEAN_REEF_ASSEMBLAGE_SPECIES) {
    assert.equal(livingShallowsSpeciesCatalog.filter(row => row.id === s.id).length, 1);
    assert.equal(sceneCatalogs.reef.some(row => row.id === s.id), false);
    assert.equal(sceneCatalogs.kelp.some(row => row.id === s.id), false);
    assert.equal(sceneCatalogs.deep.some(row => row.id === s.id), false);
  }
  const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
  assert.ok(source.includes('reefAssemblage:this.isLivingShallows'));
});

test('actual OceanAnimals dispatch renders all six distinct animal types and preserves complete agent records through floating origins', () => {
  const agents = makeAgents(), before = structuredClone(agents), animals = new OceanAnimals(livingShallowsSpeciesCatalog);
  try {
    animals.update(agents, 3.2, { x: 13056, z: 256 });
    assert.equal(animals.entities.size, 6);
    for (const a of agents) {
      const object = animals.getObject(a.id);
      assert.ok(object);
      assert.equal(object.userData.agentId, a.id);
      const p = object.getWorldPosition(new THREE.Vector3());
      assert.ok(p.distanceTo(new THREE.Vector3(a.position.x - 13056, a.position.y, a.position.z - 256)) < 1e-9);
      assert.ok(object.userData.sourceLinks.length > 0);
    }
    animals.update(agents, 99, { x: 12992, z: 192 });
    assert.deepEqual(agents, before);
    for (const agent of agents.filter(a => ['peacock-flounder', 'textile-cone', 'collector-urchin'].includes(a.speciesId))) {
      const object = animals.getObject(agent.id);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion);
      assert.ok(up.distanceTo(new THREE.Vector3(-.06, .997, .04).normalize()) < 1e-9);
    }
  } finally { animals.dispose(); }
});

test('historical deaths disappear from actual renderer without replacing their saved identities', () => {
  const agents = makeAgents(), animals = new OceanAnimals(livingShallowsSpeciesCatalog);
  try {
    animals.update(agents, 3.2);
    agents[0].alive = false;
    const before = structuredClone(agents);
    animals.update(agents, 3.2);
    assert.equal(animals.getObject(agents[0].id), null);
    assert.equal(animals.entities.size, 5);
    assert.equal(animals.root.children.length, 5, 'unloaded meshes do not leave empty scene groups');
    assert.deepEqual(agents, before);
  } finally { animals.dispose(); }
});
