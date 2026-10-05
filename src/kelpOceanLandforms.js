// Coordinate-seeded display geology. These metre-scale shelves and sediment
// channels are landscape structure, not a surveyed Monterey bathymetric map.
export const KELP_LANDFORM_UNIT_SIZE = 128;
export const KELP_LANDFORM_LIMIT = 2;
const TAU = Math.PI * 2;
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };

export function createKelpOceanLandforms({ randomAt, legacySample, floorSurface, legacyChunk }) {
  const strikeRotation = randomAt(0, 0, 'macro-landscape-strike') * Math.PI;
  const phase = randomAt(0, 0, 'macro-landscape-phase') * TAU;
  const cos = Math.cos(strikeRotation), sin = Math.sin(strikeRotation);
  const cache = new Map();

  function landscapeAt(x, z, state = legacySample(x, z)) {
    // Zero through 44 m also preserves every 2 m triangle touching the authored
    // 40 m disk; otherwise an outside vertex could tilt an inside triangle.
    const blend = smooth((Math.hypot(x, z) - 44) / 52);
    const along = x * cos - z * sin, cross = x * sin + z * cos;
    const meander = 11 * Math.sin(along / 170 + phase) + 6 * Math.sin(along / 67 - phase);
    const crest = .5 + .5 * Math.cos((cross + meander) * TAU / 112 + phase);
    const ridge = smooth((crest - .24) / .60);
    // Keep the old seeded forest allocation: the new relief makes its hard
    // patches contiguous rather than moving or deleting established roots.
    const hardField = .70 * state.forestCover + .30 * state.rockiness;
    const shelfWeight = smooth((hardField - .20) / .70) * (.35 + .65 * ridge) * blend;
    const channelWeight = smooth((.63 - state.forestCover) / .63) * (1 - shelfWeight * .6) * blend;
    const floorY = Math.min(-.65, Math.max(-14.7, state.floorY + 5.8 * shelfWeight - 1.2 * channelWeight));
    // The authored patch must be bit-for-bit unchanged, including its existing
    // positive floor values; the ceiling applies only to the peripheral lift.
    const actualFloorY = blend === 0 ? state.floorY : state.floorY + blend * (floorY - state.floorY);
    return { version: 2, shelfWeight, channelWeight,
      hardBottomWeight: shelfWeight, reliefM: actualFloorY - state.floorY,
      strikeRotation, floorY: actualFloorY };
  }

  function footprint(element) {
    const points = [{ x: element.x, z: element.z }];
    const c = Math.cos(element.rotation), s = Math.sin(element.rotation);
    for (let i = 0; i < 16; i++) {
      const angle = i * TAU / 16;
      const lx = Math.cos(angle) * element.scale.x * .5, lz = Math.sin(angle) * element.scale.z * .5;
      points.push({ x: element.x + lx * c + lz * s, z: element.z - lx * s + lz * c });
    }
    return points;
  }

  function intersectsRock(element, rock) {
    // The hard mesh has a convex sixteen-sided footprint. Test it against a
    // conservative circle enclosing the complete old rock, rather than the
    // much larger outcrop bounding circle that would erase every free gap.
    const polygon = footprint(element).slice(1);
    const radius = Math.max(rock.scale.x, rock.scale.z) * .5 + 1.25;
    let inside = true, sign = 0, minimum = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const dx = b.x - a.x, dz = b.z - a.z, px = rock.x - a.x, pz = rock.z - a.z;
      const cross = dx * pz - dz * px;
      if (Math.abs(cross) > 1e-9) {
        const next = Math.sign(cross); if (sign && next !== sign) inside = false; else sign = next;
      }
      const t = clamp01((px * dx + pz * dz) / (dx * dx + dz * dz));
      minimum = Math.min(minimum, (px - dx * t) ** 2 + (pz - dz * t) ** 2);
    }
    return inside || minimum < radius * radius;
  }

  function candidates(mx, mz) {
    const id = `${mx},${mz}`;
    if (cache.has(id)) return cache.get(id);
    let accepted = [];
    if (randomAt(mx, mz, 'macro-outcrop-present') < .80) {
      const retainedRocks = [];
      // All candidate footprints have a >=16m inset inside this owner unit;
      // its four old scenery cells therefore include every possible obstacle.
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        const scenery = legacyChunk(mx * 2 + dx, mz * 2 + dz).elements;
        for (const rock of scenery) if (rock.kind === 'rock') retainedRocks.push(rock);
      }
      for (let attempt = 0; attempt < 6 && accepted.length !== 2; attempt++) {
      const pair = [];
      const x = (mx + .5) * 128 + (randomAt(mx, mz, `macro-outcrop-x:${attempt}`) - .5) * 44;
      const z = (mz + .5) * 128 + (randomAt(mx, mz, `macro-outcrop-z:${attempt}`) - .5) * 44;
      const channelWidth = 10 + 4 * randomAt(mx, mz, `macro-outcrop-channel:${attempt}`);
      const width = 6 + 2 * randomAt(mx, mz, `macro-outcrop-width:${attempt}`);
      for (let slot = 0; slot < 2; slot++) {
        const across = (slot ? 1 : -1) * (width + channelWidth) * .5;
        const along = (randomAt(mx, mz, `macro-outcrop-along:${attempt}:${slot}`) - .5) * 5;
        const element = { id: `kelp-formation:${mx},${mz}:${slot}`, kind: 'formation',
          groupId: `kelp-landform:${mx},${mz}`, formationIndex: slot, channelWidth,
          x: x + along * cos + across * sin, z: z - along * sin + across * cos,
          rotation: strikeRotation, profile: 'terrace', scale: {
            x: 20 + 8 * randomAt(mx, mz, `macro-outcrop-length:${attempt}:${slot}`),
            y: 3.6 + 1.2 * randomAt(mx, mz, `macro-outcrop-height:${attempt}:${slot}`), z: width } };
        const radius = Math.hypot(element.scale.x, element.scale.z) * .5;
        if (Math.hypot(element.x, element.z) - radius <= 96) continue;
        // Preserve every old rock and its possible saved occupants, not only
        // currently rooted hosts. An unavailable gap simply omits the pair.
        if (retainedRocks.some(rock => intersectsRock(element, rock))) continue;
        const heights = footprint(element).map(point => floorSurface(point.x, point.z).height);
        const minimum = Math.min(...heights), maximum = Math.max(...heights);
        if (maximum - minimum > element.scale.y * .86 - .9) continue;
        element.y = minimum - .08;
        Object.freeze(element.scale); pair.push(Object.freeze(element));
      }
      if (pair.length === 2) accepted = pair;
      }
    }
    // A group is an actual pair with an open channel, never a lone survivor.
    const value = Object.freeze(accepted.length === 2 ? accepted : []);
    cache.set(id, value); if (cache.size > 32) cache.delete(cache.keys().next().value);
    return value;
  }

  function forChunk(cx, cz) {
    return Object.freeze(candidates(Math.floor(cx / 2), Math.floor(cz / 2)).filter(element =>
      Math.floor(element.x / 64) === cx && Math.floor(element.z / 64) === cz).slice(0, KELP_LANDFORM_LIMIT));
  }
  return Object.freeze({ landscapeAt, forChunk, footprint,
    cacheStats: () => ({ landformUnits: cache.size, maxLandformUnits: 32 }), clearCache: () => cache.clear() });
}
