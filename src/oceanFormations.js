// A bounded, coordinate-seeded outcrop system. These are additional geometry,
// not a replacement bathymetry field or an estimate of surveyed geology.
export const OCEAN_FORMATIONS_VERSION = 1;
export const OCEAN_FORMATION_UNIT_SIZE = 192;
export const OCEAN_FORMATION_LIMIT = 4;
const CHUNK_SIZE = 64;
const TAU = Math.PI * 2;

export function oceanFormationFootprint(formation) {
  const points = [{ x: formation.x, z: formation.z }];
  const cos = Math.cos(formation.rotation), sin = Math.sin(formation.rotation);
  for (const [radius, sectors] of [[.5, 16], [.25, 8]]) for (let index = 0; index < sectors; index++) {
    const angle = index * TAU / sectors;
    const x = Math.cos(angle) * radius * formation.scale.x, z = Math.sin(angle) * radius * formation.scale.z;
    points.push({ x: formation.x + x * cos + z * sin, z: formation.z - x * sin + z * cos });
  }
  return points;
}

export function createOceanFormations({ randomAt, noise, sample }) {
  const directionAt = (x, z) => {
    const rotation = noise(x, z, 420, 'formation-strike') * Math.PI;
    return { x: Math.cos(rotation), z: -Math.sin(rotation), rotation };
  };

  function candidates(mx, mz, sceneryAt) {
    if (randomAt(mx, mz, 'formation-present') > .76) return [];
    const x = (mx + .5) * OCEAN_FORMATION_UNIT_SIZE + (randomAt(mx, mz, 'formation-centre-x') - .5) * 20;
    const z = (mz + .5) * OCEAN_FORMATION_UNIT_SIZE + (randomAt(mx, mz, 'formation-centre-z') - .5) * 20;
    const direction = directionAt(x, z), cos = Math.cos(direction.rotation), sin = Math.sin(direction.rotation);
    const count = 2 + Math.floor(randomAt(mx, mz, 'formation-count') * 3);
    const channelWidth = 8 + 6 * randomAt(mx, mz, 'formation-channel');
    const widths = Array.from({ length: count }, (_, index) => 4 + 5 * randomAt(mx, mz, `formation-width-${index}`));
    const groupWidth = widths.reduce((sum, width) => sum + width, 0) + channelWidth * (count - 1);
    const geology = noise(x, z, 150, 'reef-geology');
    const profile = geology < .25 ? 'mound' : geology > .60 ? 'ridge' : 'terrace';
    const accepted = [];
    let cross = -groupWidth * .5;
    for (let index = 0; index < count; index++) {
      const width = widths[index];
      const along = (randomAt(mx, mz, `formation-along-${index}`) - .5) * 4;
      const centre = cross + width * .5;
      cross += width + channelWidth;
      const formation = { id: `formation:${mx},${mz}:${index}`, kind: 'formation',
        groupId: `formation-group:${mx},${mz}`, formationIndex: index, channelWidth,
        x: x + along * cos + centre * sin, z: z - along * sin + centre * cos,
        scale: { x: 12 + 18 * randomAt(mx, mz, `formation-length-${index}`),
          y: 1.6 + 1.4 * randomAt(mx, mz, `formation-height-${index}`), z: width },
        rotation: direction.rotation, profile };
      const radius = Math.hypot(formation.scale.x, formation.scale.z) * .5;
      if (Math.hypot(formation.x, formation.z) - radius < 40) continue;
      const environments = oceanFormationFootprint(formation).map(point => sample(point.x, point.z));
      if (environments.some(environment => environment.depthM <= 22.2)) continue;
      const floorMinimum = Math.min(...environments.map(environment => environment.floorY));
      const floorMaximum = Math.max(...environments.map(environment => environment.floorY));
      // Bury the base and require a readable exposed top even on a sloping bed.
      const topFactor = profile === 'terrace' ? .86 : 1;
      if (floorMaximum - floorMinimum > formation.scale.y * topFactor - .7) continue;
      const cx = Math.floor(formation.x / CHUNK_SIZE), cz = Math.floor(formation.z / CHUNK_SIZE);
      let obstructed = false;
      for (let dz = -1; dz <= 1 && !obstructed; dz++) for (let dx = -1; dx <= 1 && !obstructed; dx++) {
        const scenery = sceneryAt(cx + dx, cz + dz).elements;
        const occupiedHosts = new Set(scenery.filter(element => element.kind === 'coral').map(element => element.attachmentId));
        obstructed = scenery.some(element => {
          if (!['coral', 'seagrass'].includes(element.kind) && !(element.kind === 'rock' && occupiedHosts.has(element.id))) return false;
          // Circumscribed circles deliberately leave existing plants/colonies
          // untouched, including rotated silhouettes and cross-seam hosts.
          return Math.hypot(element.x - formation.x, element.z - formation.z) <
            radius + Math.hypot(element.scale.x, element.scale.z) * .5 + .75;
        });
      }
      if (obstructed) continue;
      formation.y = floorMinimum - .07;
      Object.freeze(formation.scale); Object.freeze(formation);
      accepted.push(formation);
    }
    // Partial groups remain coherent; a lone surviving large rock is omitted.
    return accepted.length >= 2 ? accepted : [];
  }

  function forChunk(cx, cz, sceneryAt) {
    // Every centre stays inside its 192m owner unit, so no unbounded scan or
    // extra history/cache is needed to collect a 64m cell's formations.
    const mx = Math.floor(cx / 3), mz = Math.floor(cz / 3);
    return Object.freeze(candidates(mx, mz, sceneryAt).filter(formation =>
      Math.floor(formation.x / CHUNK_SIZE) === cx && Math.floor(formation.z / CHUNK_SIZE) === cz)
      .slice(0, OCEAN_FORMATION_LIMIT));
  }

  return Object.freeze({ forChunk, directionAt });
}
