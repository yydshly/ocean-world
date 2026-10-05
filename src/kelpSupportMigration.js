import { leafAttachmentPosition } from './kelpHabitat.js';
import { kelpWaterPositionValid } from './kelpWaterCommunity.js';

/** One committed geometry migration, never a simulation step or population
 * recipe. Biological stocks, clocks, identities and historical poses survive. */
export function migrateKelpSupport(region, generator, version) {
  if (region.supportGeometryVersion >= version) return false;
  const sim = region.sim, oldVersion = region.supportGeometryVersion || 1;
  const normal = (x, z) => {
    if (typeof generator.supportNormal === 'function') return generator.supportNormal(x, z);
    const d = .015, dx = (generator.heightAt(x + d, z) - generator.heightAt(x - d, z)) / (2 * d);
    const dz = (generator.heightAt(x, z + d) - generator.heightAt(x, z - d)) / (2 * d), length = Math.hypot(dx, 1, dz);
    return { x: -dx / length, y: 1 / length, z: -dz / length };
  };
  for (const patch of sim.groundPatches) patch.position.y = generator.heightAt(patch.position.x, patch.position.z);
  for (const agent of sim.agents) {
    if (!agent.alive) continue;
    if (version >= 2 && agent.lastDriftIntake && agent.lastDriftIntake.supportGeometryVersion === undefined)
      agent.lastDriftIntake.supportGeometryVersion = oldVersion;
    if (['purple-urchin', 'gumboot-chiton', 'bat-star'].includes(agent.speciesId)) {
      for (const key of version >= 2 ? ['position', 'home', 'target'] : ['position'])
        agent[key].y = generator.heightAt(agent[key].x, agent[key].z) + .003;
      agent.supportNormal = normal(agent.position.x, agent.position.z);
    }
  }
  if (version >= 2) {
    const roots = new Map(generator.chunk(region.cx, region.cz).elements.filter(item => item.kind === 'kelp').map(item => [item.id, item]));
    const displacements = new Map();
    for (const plant of sim.hostById.values()) {
      if (!plant.alive) continue;
      const root = roots.get(plant.sceneryId ?? plant.anchor.sceneryId);
      if (!root) throw new Error('Saved kelp host has no corresponding generated root.');
      const dy = root.anchor.y - plant.anchor.y, growth = plant.sizeM - plant.initialSizeM;
      const length = Math.min(root.lengthM, generator.surfaceY - root.anchor.y - .2 - growth);
      if (!(length > 0)) throw new Error('Saved kelp growth has no submerged space after support migration.');
      displacements.set(plant.id, dy);
      plant.anchor.y = root.anchor.y; plant.anchor.lengthM = length;
      plant.initialSizeM = length; plant.sizeM = length + growth;
      for (const key of ['position', 'home', 'target']) plant[key].y += dy;
    }
    for (const agent of sim.agents) {
      if (!agent.alive) continue;
      if (agent.speciesId === 'brown-turban-snail') {
        const next = leafAttachmentPosition(sim.getKelpAnchor(agent.attachment.hostId), agent.attachment, sim.timeSec, sim.environment);
        const delta = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, next[axis] - agent.position[axis]]));
        agent.position = next;
        for (const key of ['home', 'target']) for (const axis of ['x', 'y', 'z']) agent[key][axis] += delta[axis];
      } else if (agent.speciesId === 'giant-kelpfish') {
        const dy = displacements.get(agent.hostId) ?? 0;
        for (const key of ['position', 'home', 'target']) {
          const point = agent[key], floor = sim._fishFloor(agent, point.x, point.z), ceiling = generator.surfaceY - .25;
          if (floor > ceiling) throw new Error('Saved kelpfish has no submerged space after support migration.');
          point.y = Math.min(ceiling, Math.max(floor, point.y + dy));
        }
      }
    }
    for (const agent of region.waterAgents) {
      if (!agent.alive) continue;
      const point = agent.position, radius = agent.sizeM * .5 + .12;
      let floor = -Infinity;
      for (let index = 0; index < 9; index++) {
        const angle = (index - 1) * Math.PI / 4, r = index ? radius : 0;
        floor = Math.max(floor, generator.heightAt(point.x + Math.cos(angle) * r, point.z + Math.sin(angle) * r) + .8 + agent.sizeM * .22);
      }
      const ceiling = generator.surfaceY - .8 - agent.sizeM * .22;
      if (floor > ceiling) throw new Error('Saved water-layer body has no static water clearance after support migration.');
      point.y = Math.min(ceiling, Math.max(floor, point.y));
      if (!kelpWaterPositionValid(generator, point, agent.sizeM, { cx: region.cx, cz: region.cz, elements: [], ownerMarginM: agent.waterRoamingVersion ? 0 : .6 }))
        throw new Error('Saved water-layer body cannot activate after support migration.');
    }
  }
  for (const patch of version >= 2 ? region.driftPatches ?? [] : []) {
    const receiver = sim.rockPatches.find(item => item.id === patch.rockPatchId);
    if (!receiver) throw new Error('Saved kelp drift receiver is missing.');
    patch.position = structuredClone(receiver.position); patch.supportNormal = normal(patch.position.x, patch.position.z);
  }
  region.supportGeometryVersion = version;
  return true;
}
