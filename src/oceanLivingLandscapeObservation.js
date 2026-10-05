import * as THREE from 'three';

const finite = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const plantKinds = new Set(['coral', 'seagrass', 'algae', 'plant-clump', 'meadow-shoot', 'reef-colony', 'coral-branch', 'coral-table', 'sea-fan']);

export function estimatedOceanAnimalLengthPixels(agent, camera, viewportHeight) {
  const heading = Number.isFinite(agent.heading) ? agent.heading : Math.atan2(agent.velocity?.z || 0, agent.velocity?.x || 1);
  const pitch = Number.isFinite(agent.pitch) ? agent.pitch : THREE.MathUtils.clamp(Math.atan2(agent.velocity?.y || 0,
    Math.max(.08, Math.hypot(agent.velocity?.x || 0, agent.velocity?.z || 0))), -.25, .25);
  const axis = new THREE.Vector3(Math.cos(heading) * Math.cos(pitch), Math.sin(pitch), Math.sin(heading) * Math.cos(pitch));
  const center = new THREE.Vector3(agent.position.x, agent.position.y, agent.position.z);
  const head = center.clone().addScaledVector(axis, agent.sizeM * .5).project(camera);
  const tail = center.clone().addScaledVector(axis, -agent.sizeM * .5).project(camera);
  return Math.hypot((head.x - tail.x) * viewportHeight * camera.aspect * .5, (head.y - tail.y) * viewportHeight * .5);
}

/** A static, ordinary landscape view through actual near-bed life. The size
 * estimate only selects a camera; no animal scale, position or state changes.
 * Finite centre rays do not certify complete body/foliage visibility. */
export function createOceanLivingLandscapeObservation({ agents = [], elements = [], regionId, generator,
  currentPosition, safeHeight, visible, surfaceY = 8, fov = 50, aspect = 16 / 9, viewportHeight = 720 } = {}) {
  if (!Array.isArray(agents) || !Array.isArray(elements) || !/^-?\d+,-?\d+$/.test(regionId ?? '') ||
    typeof generator?.floorSurface !== 'function' || typeof safeHeight !== 'function' || typeof visible !== 'function' ||
    ![surfaceY, fov, aspect, viewportHeight].every(Number.isFinite) || fov < 25 || fov > 90 || aspect <= 0 || viewportHeight <= 0) return null;
  const [cx, cz] = regionId.split(',').map(Number);
  if (![cx, cz].every(Number.isSafeInteger)) return null;
  const life = agents.filter(a => a?.alive === true && a.regionId === regionId && typeof a.id === 'string' &&
    finite(a.position) && Number.isFinite(a.sizeM) && a.sizeM >= .1 &&
    a.position.y - generator.floorSurface(a.position.x, a.position.z).height <= 7 &&
    a.position.y > generator.floorSurface(a.position.x, a.position.z).height + .25)
    .sort((a, b) => a.id.localeCompare(b.id));
  const plants = elements.filter(e => e?.regionId === regionId && finite(e) && plantKinds.has(e.kind) &&
    Number.isFinite(e.scale?.y) && e.scale.y > 0);
  const clusters = life.map(anchor => {
    const members = life.filter(a => horizontal(a.position, anchor.position) < 7 && Math.abs(a.position.y - anchor.position.y) < 3);
    const center = members.reduce((p, a) => p.add(new THREE.Vector3(a.position.x, a.position.y, a.position.z)), new THREE.Vector3()).multiplyScalar(1 / members.length);
    return { center, members, score: members.length * 3 + plants.filter(e => horizontal(e, center) < 14).length * .1 };
  }).filter(c => c.members.length >= 2).sort((a, b) => b.score - a.score);
  const anchors = [];
  for (const cluster of clusters) {
    if (anchors.every(c => horizontal(c.center, cluster.center) > 6)) anchors.push(cluster);
    if (anchors.length === 3) break;
  }
  let best = null;
  for (const cluster of anchors) {
    const target = cluster.center.clone();
    const preferred = finite(currentPosition) ? Math.atan2(currentPosition.z - target.z, currentPosition.x - target.x) : 0;
    for (let i = 0; i < 8; i++) {
      const angle = preferred + i * Math.PI / 4;
      const position = new THREE.Vector3(target.x + Math.cos(angle) * 7.5, 0, target.z + Math.sin(angle) * 7.5);
      if (position.x < cx * 64 + 1 || position.x > (cx + 1) * 64 - 1 || position.z < cz * 64 + 1 || position.z > (cz + 1) * 64 - 1) continue;
      const safe = safeHeight(position.x, position.z);
      if (!Number.isFinite(safe)) continue;
      position.y = Math.max(target.y + .7, safe + 1.25);
      // A large foreground rock must not turn this into another overhead view.
      if (position.y >= surfaceY - .8 || position.y - target.y > 3.3 || !visible(position, target)) continue;
      const camera = new THREE.PerspectiveCamera(fov, aspect, .05, 65);
      camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const inFrame = (point, radius) => frustum.planes.every(p => p.distanceToPoint(point) >= radius);
      const readable = life.filter(a => {
        const point = new THREE.Vector3(a.position.x, a.position.y, a.position.z), distance = point.distanceTo(position);
        return distance >= 3 && estimatedOceanAnimalLengthPixels(a, camera, viewportHeight) >= 8 && inFrame(point, a.sizeM * .6) && visible(position, point);
      });
      // Small companions can share a readable habitat view with a larger fish;
      // requiring every species to fill the same pixels excludes mixed groups.
      const prominent = readable.filter(a => estimatedOceanAnimalLengthPixels(a, camera, viewportHeight) >= 16);
      if (readable.length < 2 || !prominent.length) continue;
      const scenery = plants.filter(e => horizontal(e, target) < 15 && inFrame(new THREE.Vector3(e.x, e.y + e.scale.y * .5, e.z), .15));
      if (!scenery.length) continue;
      const score = readable.length * 10 + prominent.length * 4 + Math.min(12, scenery.length) - (position.y - target.y) * 2;
      if (!best || score > best.score) best = { position: { x: position.x, y: position.y, z: position.z },
        target: { x: target.x, y: target.y, z: target.z }, score,
        animalIds: readable.map(a => a.id), prominentAnimalIds: prominent.map(a => a.id), elementIds: scenery.map(e => e.id),
        evidence: { scope: 'static-framing-and-solid-centre-rays', maxCandidateCount: 24, minimumEstimatedAnimalPixels: 8,
          minimumProminentAnimalPixels: 16,
          sizeEstimate: 'projected-length-axis-with-current-heading-and-pitch',
          horizontalDistanceM: 7.5, fullBodyVisibilityCertified: false } };
    }
  }
  return best;
}
