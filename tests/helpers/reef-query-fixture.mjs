import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createReefRockGeometry } from '../../src/world/reefTerrain.js';
import { createOrganism, createCoralLandscape, disposeOrganism } from '../../src/world/organisms.js';
import { REEF_ROCKS, REEF_BRIDGE_ROCK_INDEX, coralAttachmentPosition } from '../../src/habitat.js';
import { speciesCatalog } from '../../src/species.js';

function seeded(seed) {
  let state = seed | 0;
  return () => {
    state |= 0; state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

// Geometry-only fixture: the current world terrain builders, all decorative
// coral morphologies and real catalog Acropora, with actual material sidedness.
// No renderer or browser FPS is represented by these CPU ray queries.
export function createReefQueryFixture() {
  const root = new THREE.Group(), groups = [], random = seeded(851);
  const parts = REEF_ROCKS.map((rock, index) => createReefRockGeometry(rock,
    { bedSupported: index !== REEF_BRIDGE_ROCK_INDEX }));
  for (let i = 0; i < 22; i++) {
    const x = -7.5 + random() * 16, z = -10 + random() * 18;
    if (x > -.5 && x < 3.5 && z > -5) continue;
    parts.push(createReefRockGeometry([x, .1, z, .3 + random() * .7,
      .2 + random() * .35, .3 + random() * .55]));
  }
  const reefGeometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
  const reefMaterial = new THREE.MeshStandardMaterial();
  const reef = new THREE.Mesh(reefGeometry, reefMaterial); root.add(reef);
  const placementRay = new THREE.Raycaster(), shoulders = [...REEF_ROCKS.slice(0, 7), ...REEF_ROCKS.slice(10)];
  for (let i = 0; i < 165; i++) {
    const shoulder = shoulders[i % shoulders.length], angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * .88;
    const x = shoulder[0] + Math.cos(angle) * shoulder[3] * radius;
    const z = shoulder[2] + Math.sin(angle) * shoulder[5] * radius;
    placementRay.set(new THREE.Vector3(x, 7, z), new THREE.Vector3(0, -1, 0)); reef.updateMatrixWorld();
    const surface = placementRay.intersectObject(reef)[0]; if (!surface) continue;
    const color = i % 4 === 0 ? '#b2aa88' : i % 4 === 1 ? '#9b9d75' : i % 4 === 2 ? '#968a74' : '#898f72';
    const morphotype = i % 5 === 0 ? 'boulder' : i % 5 === 1 || i % 5 === 2 ? 'table' : 'branching';
    const coral = createCoralLandscape(morphotype, [color], i % 4, 'low');
    coral.scale.setScalar(morphotype === 'branching' ? .7 + random() * .95 : 1.1 + random() * 1.2);
    coral.position.set(x, surface.point.y - .07, z); coral.rotation.y = random() * Math.PI * 2;
    root.add(coral); groups.push(coral);
  }
  const species = speciesCatalog.find(species => species.id === 'staghorn-coral');
  for (let i = 0; i < 8; i++) {
    const coral = createOrganism(species), position = coralAttachmentPosition(i, 0, 0);
    coral.position.set(position.x, position.y, position.z); coral.scale.setScalar(species.lengthM);
    coral.rotation.y = i * .71; root.add(coral); groups.push(coral);
  }
  root.updateMatrixWorld(true);
  const meshes = []; root.traverse(object => { if (object.isMesh) meshes.push(object); });
  return {
    root, reef, meshes,
    dispose() { groups.forEach(disposeOrganism); reefGeometry.dispose(); reefMaterial.dispose(); root.clear(); },
  };
}

// Include short finite observer segments, full passage crossings, downward
// contact rays, and close coral rays. This checks misses as well as occlusion.
export function createReefQueryRays(count = 1000) {
  const random = seeded(14873), rays = [];
  for (let i = 0; i < count; i++) {
    let origin, target, far;
    if (i % 4 === 0) {
      origin = new THREE.Vector3(-8 + random() * 16, 6, -10 + random() * 17);
      target = origin.clone().setY(-1); far = 8;
    } else if (i % 4 === 1) {
      origin = new THREE.Vector3(-9, .15 + random() * 3, -8 + random() * 14);
      target = new THREE.Vector3(9, .15 + random() * 3, -8 + random() * 14); far = 30;
    } else {
      const anchor = coralAttachmentPosition(i % 8, 0, 0);
      target = new THREE.Vector3(anchor.x, anchor.y + .25 + random() * .5, anchor.z);
      const angle = random() * Math.PI * 2, radius = .3 + random() * 3;
      origin = target.clone().add(new THREE.Vector3(Math.cos(angle) * radius,
        .1 + random() * 2.5, Math.sin(angle) * radius));
      far = i % 4 === 2 ? origin.distanceTo(target) - .001 : 20;
    }
    rays.push({ origin, direction: target.sub(origin).normalize(), near: .003, far });
  }
  return rays;
}

export function queryNearest(meshes, rays, { firstHitOnly = false } = {}) {
  const raycaster = new THREE.Raycaster(); raycaster.firstHitOnly = firstHitOnly;
  return rays.map(({ origin, direction, near, far }) => {
    raycaster.set(origin, direction); raycaster.near = near; raycaster.far = far;
    return raycaster.intersectObjects(meshes, false)[0] ?? null;
  });
}
