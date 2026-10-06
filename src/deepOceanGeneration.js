import { DEEP_DEPTH_M, DEEP_ANEMONE_ANCHORS, deepFloorHeight } from './deepHabitat.js';
import { oceanRockMesh, oceanRockHeight, oceanRockSurface } from './oceanRockShape.js';
import { createDeepSeascapeGenerator } from './deepSeascape.js';

export const DEEP_OCEAN_CHUNK_SIZE = 64;
export const DEEP_OCEAN_SURFACE_Y = DEEP_DEPTH_M;
export const DEEP_OCEAN_AUTHORED_RADIUS = 40;
export const DEEP_OCEAN_CACHE_LIMIT = 32;
export const DEEP_OCEAN_VERTEX_CACHE_LIMIT = 16384;
export const DEEP_OCEAN_NEIGHBOR_CACHE_LIMIT = 32;
export const DEEP_OCEAN_TERRAIN_SEGMENTS = 64;
export const DEEP_OCEAN_ELEMENT_LIMITS = Object.freeze({ rock: 8, rubble: 24 });
export { oceanRockMesh as deepOceanRockMesh };
const TAU = Math.PI * 2;
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index); value = Math.imul(value, 16777619);
  }
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15; value = Math.imul(value, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}
function coordinates(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Deep ocean coordinates must be finite world metres.');
}
function normalFromGradient(dx, dz) {
  const length = Math.hypot(dx, 1, dz);
  return { x: -dx / length, y: 1 / length, z: -dz / length };
}
function freezeElement(element) { Object.freeze(element.scale); return Object.freeze(element); }

/** Qualitative soft-sediment landscape, not a measured abyssal survey.
 * No generated landform is a simulated animal, food pool or vent system. */
export function createDeepOceanGenerator(seed = 42, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Deep options must be an object.');
  if (options.seascape === true) return createDeepSeascapeGenerator(createDeepOceanGenerator(seed));
  if (!['number', 'string'].includes(typeof seed) || (typeof seed === 'number' && !Number.isFinite(seed))) {
    throw new TypeError('The deep ocean seed must be a finite number or string.');
  }
  const seedKey = `${typeof seed}:${seed}`, cache = new Map(), vertexCache = new Map(), neighborCache = new Map();
  const randomAt = (x, z, salt) => hash(`${seedKey}|deep-ocean|${x}|${z}|${salt}`) / 4294967296;
  function noise(x, z, wavelength, salt) {
    const gx = x / wavelength, gz = z / wavelength, ix = Math.floor(gx), iz = Math.floor(gz);
    const tx = smooth(gx - ix), tz = smooth(gz - iz);
    return mix(mix(randomAt(ix, iz, salt), randomAt(ix + 1, iz, salt), tx),
      mix(randomAt(ix, iz + 1, salt), randomAt(ix + 1, iz + 1, salt), tx), tz);
  }
  function floorY(x, z) {
    const radius = Math.hypot(x, z);
    if (radius <= DEEP_OCEAN_AUTHORED_RADIUS) return deepFloorHeight(x, z);
    const far = -.35 + 7.5 * (noise(x, z, 360, 'plain-relief') - .5)
      + 2.25 * (noise(x, z, 112, 'low-hills') - .5) + .24 * (noise(x, z, 26, 'sediment-relief') - .5);
    return mix(deepFloorHeight(x, z), far, smooth((radius - DEEP_OCEAN_AUTHORED_RADIUS) / 56));
  }
  function sample(x, z) {
    coordinates(x, z);
    const floor = floorY(x, z);
    const slope = Math.hypot((floorY(x + 2, z) - floorY(x - 2, z)) / 4,
      (floorY(x, z + 2) - floorY(x, z - 2)) / 4);
    const blend = smooth((Math.hypot(x, z) - DEEP_OCEAN_AUTHORED_RADIUS) / 56);
    const rockiness = blend * (.78 * noise(x, z, 160, 'sparse-hard-sites') + .22 * noise(x, z, 47, 'rubble-sites'));
    const organicPatchSuitability = clamp01(.18 + .68 * noise(x, z, 88, 'organic-retention') - slope * 1.5 - rockiness * .10);
    const habitat = rockiness > .71 ? 'deep-hard-bottom' : slope > .038 ? 'deep-slope' : 'deep-soft-bottom';
    return { floorY: floor, depthM: DEEP_DEPTH_M - floor, habitat,
      substrate: rockiness > .71 ? 'rock' : rockiness > .55 ? 'mixed' : 'mud',
      rockiness, slope, organicPatchSuitability, foodPatchiness: organicPatchSuitability };
  }
  function floorVertex(x, z) {
    coordinates(x, z);
    const id = `${x},${z}`, cached = vertexCache.get(id);
    if (cached !== undefined) return cached;
    const value = Math.fround(floorY(x, z)); vertexCache.set(id, value);
    // FIFO eviction avoids per-footstep LRU mutation. A vertex is immutable
    // for this generator seed; eviction only recomputes the same Float32 Y.
    if (vertexCache.size > DEEP_OCEAN_VERTEX_CACHE_LIMIT) vertexCache.delete(vertexCache.keys().next().value);
    return value;
  }
  // Matches a,c,b / b,c,d in the 1 m renderer grid, including its Float32 Y.
  function floorSurface(x, z) {
    coordinates(x, z);
    const ix = Math.floor(x), iz = Math.floor(z), tx = x - ix, tz = z - iz;
    const a = floorVertex(ix, iz), b = floorVertex(ix + 1, iz), c = floorVertex(ix, iz + 1), d = floorVertex(ix + 1, iz + 1);
    if (tx + tz <= 1) {
      return { height: a + (b - a) * tx + (c - a) * tz, normal: normalFromGradient(b - a, c - a),
        substrate: 'mud', elementId: null };
    }
    return { height: d + (c - d) * (1 - tx) + (b - d) * (1 - tz),
      normal: normalFromGradient(d - c, d - b), substrate: 'mud', elementId: null };
  }
  function excludesAuthored(x, z, scale) {
    return Math.hypot(x, z) - .5 * Math.hypot(scale.x, scale.z) > DEEP_OCEAN_AUTHORED_RADIUS;
  }
  function buriedRockBase(x, z, scale, rotation) {
    let bottom = floorSurface(x, z).height;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    for (let index = 0; index < 16; index++) {
      const angle = index * TAU / 16, lx = Math.cos(angle) * scale.x * .5, lz = Math.sin(angle) * scale.z * .5;
      bottom = Math.min(bottom, floorSurface(x + lx * cos + lz * sin, z - lx * sin + lz * cos).height);
    }
    return bottom - .015;
  }
  function chunk(cx, cz) {
    if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz)) throw new RangeError('Deep ocean chunk coordinates must be safe integers.');
    const id = `${cx},${cz}`;
    if (cache.has(id)) { const value = cache.get(id); cache.delete(id); cache.set(id, value); return value; }
    const origin = Object.freeze({ x: cx * 64, z: cz * 64 }), rocks = [], rubble = [];
    for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
      const gx = cx * 8 + ix, gz = cz * 8 + iz;
      const x = origin.x + (ix + .20 + .60 * randomAt(gx, gz, 'site-x')) * 8;
      const z = origin.z + (iz + .20 + .60 * randomAt(gx, gz, 'site-z')) * 8;
      const state = sample(x, z), hard = smooth((state.rockiness - .55) / .25);
      if (Math.hypot(x, z) <= 42) continue;
      if (randomAt(gx, gz, 'rock-present') < .006 + hard * .22) {
        const width = .7 + 1.9 * randomAt(gx, gz, 'rock-width');
        const scale = { x: width, y: .18 + .54 * randomAt(gx, gz, 'rock-height'),
          z: width * (.57 + .30 * randomAt(gx, gz, 'rock-depth')) };
        const rotation = randomAt(gx, gz, 'rock-rotation') * TAU;
        if (!excludesAuthored(x, z, scale)) continue;
        rocks.push(freezeElement({ id: `deep-rock:${gx},${gz}`, kind: 'rock', x,
          y: buriedRockBase(x, z, scale, rotation), z, scale, rotation,
          profile: randomAt(gx, gz, 'rock-profile') < .8 ? 'mound' : 'ridge', priority: hard + randomAt(gx, gz, 'rock-priority') * .1 }));
      } else if (randomAt(gx, gz, 'rubble-present') < .025 + hard * .42) {
        const width = .16 + .62 * randomAt(gx, gz, 'rubble-width');
        const scale = { x: width, y: .04 + .12 * randomAt(gx, gz, 'rubble-height'),
          z: width * (.6 + .3 * randomAt(gx, gz, 'rubble-depth')) };
        const rotation = randomAt(gx, gz, 'rubble-rotation') * TAU;
        if (!excludesAuthored(x, z, scale)) continue;
        rubble.push(freezeElement({ id: `deep-rubble:${gx},${gz}`, kind: 'rubble', x,
          y: buriedRockBase(x, z, scale, rotation), z, scale, rotation, profile: 'mound',
          priority: hard + randomAt(gx, gz, 'rubble-priority') * .1 }));
      }
    }
    const order = (a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    rocks.sort(order); rubble.sort(order);
    rocks.length = Math.min(rocks.length, DEEP_OCEAN_ELEMENT_LIMITS.rock);
    rubble.length = Math.min(rubble.length, DEEP_OCEAN_ELEMENT_LIMITS.rubble);
    const habitats = { 'deep-soft-bottom': 0, 'deep-slope': 0, 'deep-hard-bottom': 0 };
    let minDepthM = Infinity, maxDepthM = -Infinity, organicPatchSuitability = 0;
    for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
      const state = sample(origin.x + (ix + .5) * 8, origin.z + (iz + .5) * 8);
      habitats[state.habitat]++; minDepthM = Math.min(minDepthM, state.depthM); maxDepthM = Math.max(maxDepthM, state.depthM);
      organicPatchSuitability += state.organicPatchSuitability;
    }
    const ranked = Object.keys(habitats).sort((a, b) => habitats[b] - habitats[a]);
    const composition = Object.freeze({ samples: 64, habitats: Object.freeze(habitats), primary: ranked[0],
      secondary: habitats[ranked[1]] >= 13 ? ranked[1] : null, minDepthM, maxDepthM,
      organicPatchSuitability: organicPatchSuitability / 64 });
    const value = Object.freeze({ id, cx, cz, size: 64, seed: hash(`${seedKey}|deep-chunk|${cx}|${cz}`), origin,
      bounds: Object.freeze({ minX: origin.x, maxX: origin.x + 64, minZ: origin.z, maxZ: origin.z + 64 }),
      elements: Object.freeze([...rocks, ...rubble]), counts: Object.freeze({ rock: rocks.length, rubble: rubble.length }),
      composition, habitatComposition: composition });
    cache.set(id, value); if (cache.size > DEEP_OCEAN_CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return value;
  }
  function nearbyRocks(x, z) {
    const cx = Math.floor(x / 64), cz = Math.floor(z / 64), id = `${cx},${cz}`;
    let neighbors = neighborCache.get(id);
    if (!neighbors) {
      neighbors = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        neighbors.push(...chunk(cx + dx, cz + dz).elements);
      }
      neighborCache.set(id, neighbors);
      if (neighborCache.size > DEEP_OCEAN_NEIGHBOR_CACHE_LIMIT) neighborCache.delete(neighborCache.keys().next().value);
    }
    const rocks = [];
    for (const element of neighbors) {
      const reach = Math.max(element.scale.x, element.scale.z) * .5;
      if (Math.abs(x - element.x) <= reach && Math.abs(z - element.z) <= reach) rocks.push(element);
    }
    return rocks;
  }
  function supportAt(x, z) {
    const bed = floorSurface(x, z);
    if (Math.hypot(x, z) <= DEEP_OCEAN_AUTHORED_RADIUS) return bed;
    let support = bed;
    for (const rock of nearbyRocks(x, z)) {
      const height = oceanRockHeight(rock, x, z);
      if (!Number.isFinite(height) || height <= support.height) continue;
      const cos = Math.cos(rock.rotation), sin = Math.sin(rock.rotation), wx = x - rock.x, wz = z - rock.z;
      const face = oceanRockSurface(rock.profile, (wx * cos - wz * sin) / rock.scale.x, (wx * sin + wz * cos) / rock.scale.z);
      if (!face) continue;
      const nx = face.normal.x / rock.scale.x, ny = face.normal.y / rock.scale.y, nz = face.normal.z / rock.scale.z;
      const length = Math.hypot(nx, ny, nz);
      support = { height, normal: { x: (nx * cos + nz * sin) / length, y: ny / length,
        z: (-nx * sin + nz * cos) / length }, substrate: 'rock', elementId: rock.id };
    }
    return support;
  }
  function heightAt(x, z) { return supportAt(x, z).height; }
  function floorNormal(x, z) { return supportAt(x, z).normal; }
  function heightForCamera(x, z) {
    let height = floorSurface(x, z).height;
    if (Math.hypot(x, z) <= DEEP_OCEAN_AUTHORED_RADIUS) return height;
    for (const rock of nearbyRocks(x, z)) {
      if (Number.isFinite(oceanRockHeight(rock, x, z))) height = Math.max(height, rock.y + rock.scale.y);
    }
    return height;
  }
  return Object.freeze({ seed, surfaceY: DEEP_DEPTH_M, chunkSize: 64, sample, chunk, floorVertex, floorSurface,
    heightAt, floorNormal, supportAt, heightForCamera, authoredAnchors: DEEP_ANEMONE_ANCHORS,
    cacheStats: () => ({ chunks: cache.size, maxChunks: DEEP_OCEAN_CACHE_LIMIT, size: cache.size, limit: DEEP_OCEAN_CACHE_LIMIT,
      vertices: vertexCache.size, maxVertices: DEEP_OCEAN_VERTEX_CACHE_LIMIT,
      neighborhoods: neighborCache.size, maxNeighborhoods: DEEP_OCEAN_NEIGHBOR_CACHE_LIMIT }),
    clearCache: () => { cache.clear(); vertexCache.clear(); neighborCache.clear(); } });
}
