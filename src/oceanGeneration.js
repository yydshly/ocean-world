import { floorHeight, habitatHeight } from './habitat.js';
import { oceanRockHeight, oceanRockSurface, OCEAN_ROCK_PROFILES, OCEAN_ROCK_SURFACE_VERSION } from './oceanRockShape.js';
import { createOceanFormations, OCEAN_FORMATIONS_VERSION, OCEAN_FORMATION_LIMIT } from './oceanFormations.js';
import { isLivingShallowsSeed } from './livingShallows.js';
import { createLivingShallowsGenerator } from './livingShallowsGeneration.js';
export { OCEAN_FORMATIONS_VERSION, OCEAN_FORMATION_LIMIT } from './oceanFormations.js';

// World metres. Chunks are a loading unit, never the outer boundary of the sea.
export const OCEAN_CHUNK_SIZE = 64;
export const OCEAN_SURFACE_Y = 8;
export const OCEAN_AUTHORED_RADIUS = 40;
export const OCEAN_CHUNK_CACHE_LIMIT = 32;
export const OCEAN_FLOOR_SURFACE_VERSION = 1;
export const OCEAN_FLOOR_VERTEX_CACHE_LIMIT = 16384;
export const OCEAN_ELEMENT_LIMITS = Object.freeze({ rock: 20, coral: 36, seagrass: 256, rubble: 128, algae: 48,
  formation: OCEAN_FORMATION_LIMIT });
// Keep the first generation's grass records stable as well as its hard habitat.
// Extra bed tufts are a separate coordinate stream with separately named IDs.
const LEGACY_SEAGRASS_LIMIT = 96;
const TAU = Math.PI * 2;
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// Hash full coordinate strings rather than advancing a shared random stream.
// Negative coordinates and chunk load order therefore have no special cases.
function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15; value = Math.imul(value, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}

function assertCoordinates(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Ocean coordinates must be finite world metres.');
}

function freezeElement(element) {
  Object.freeze(element.scale);
  if (element.normal) Object.freeze(element.normal);
  if (element.surfaceDirection) Object.freeze(element.surfaceDirection);
  if (element.surfaceLocal) Object.freeze(element.surfaceLocal);
  return Object.freeze(element);
}

export function createOceanGenerator(seed = 42) {
  if ((typeof seed !== 'number' && typeof seed !== 'string') || (typeof seed === 'number' && !Number.isFinite(seed))) {
    throw new TypeError('The ocean seed must be a finite number or a string.');
  }
  if (isLivingShallowsSeed(seed)) return createLivingShallowsGenerator(seed);
  const seedKey = `${typeof seed}:${seed}`;
  const randomAt = (x, z, salt) => hash(`${seedKey}|${x}|${z}|${salt}`) / 4294967296;
  const cache = new Map(), vertexCache = new Map();

  function noise(x, z, wavelength, salt) {
    const gx = x / wavelength, gz = z / wavelength;
    const ix = Math.floor(gx), iz = Math.floor(gz), tx = smooth(gx - ix), tz = smooth(gz - iz);
    return mix(mix(randomAt(ix, iz, salt), randomAt(ix + 1, iz, salt), tx),
      mix(randomAt(ix, iz + 1, salt), randomAt(ix + 1, iz + 1, salt), tx), tz);
  }

  function sample(x, z) {
    assertCoordinates(x, z);
    const radius = Math.hypot(x, z);
    const macro = noise(x, z, 230, 'bathymetry');
    const relief = noise(x, z, 74, 'low-hills');
    const detail = noise(x, z, 23, 'bed-relief');
    const farFloor = Math.max(-22, Math.min(-2, -2 - 20 * (.66 * macro + .24 * relief + .10 * detail)));
    // Preserve the entire local sample; join gradually rather than making a rim.
    const transition = smooth((radius - OCEAN_AUTHORED_RADIUS) / 56);
    const floorY = mix(floorHeight(x, z), farFloor, transition);
    const depthM = OCEAN_SURFACE_Y - floorY;
    const corridor = 1 - smooth(Math.abs(noise(x, z, 130, 'sand-corridors') - .5) / .15);
    const rockiness = clamp01(.78 * noise(x, z, 91, 'hard-substrate') + .22 * relief - .36 * corridor);
    const seagrassSuitability = clamp01(noise(x, z, 105, 'vegetation') * (1 - rockiness) *
      (1 - smooth((depthM - 17) / 6)));
    const habitat = radius <= OCEAN_AUTHORED_RADIUS ? 'authored-reef' : depthM > 22 ? 'slope' :
      rockiness > .54 ? 'reef' : seagrassSuitability > .36 ? 'seagrass' : 'sand';
    const substrate = rockiness > .54 ? 'rock' : rockiness > .38 ? 'mixed' : 'sand';
    return { floorY, habitat, substrate, depthM, rockiness, seagrassSuitability };
  }

  function floorVertex(x, z) {
    assertCoordinates(x, z);
    const id = `${x},${z}`, cached = vertexCache.get(id);
    if (cached !== undefined) return cached;
    const height = Math.fround(sample(x, z).floorY);
    vertexCache.set(id, height);
    if (vertexCache.size > OCEAN_FLOOR_VERTEX_CACHE_LIMIT) vertexCache.delete(vertexCache.keys().next().value);
    return height;
  }

  // Exact Float32 triangles of the renderer's 1 m a,c,b / b,c,d grid.
  // The analytic sample remains the independent seeded habitat field.
  function floorSurface(x, z) {
    assertCoordinates(x, z);
    const ix = Math.floor(x), iz = Math.floor(z), tx = x - ix, tz = z - iz;
    const a = floorVertex(ix, iz), b = floorVertex(ix + 1, iz), c = floorVertex(ix, iz + 1), d = floorVertex(ix + 1, iz + 1);
    const lower = tx + tz <= 1;
    const dx = lower ? b - a : d - c, dz = lower ? c - a : d - b;
    const length = Math.hypot(dx, 1, dz);
    return { height: lower ? a + dx * tx + dz * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz),
      normal: { x: -dx / length, y: 1 / length, z: -dz / length }, elementId: null };
  }

  function bedFields(x, z) {
    return { bedCover: noise(x, z, 26, 'grass-bed-cover'),
      corridor: 1 - smooth(Math.abs(noise(x, z, 130, 'sand-corridors') - .5) / .15) };
  }

  /** Continuous display weights from the unchanged vegetation conditions.
   * These indicate potential bed/gap structure, not actual plant abundance,
   * surface area or biomass. A renderer must also use the real tuft envelope.
   * Supplied environment must be sample(x,z) from these same coordinates. */
  function coverAt(x, z, environment = undefined) {
    assertCoordinates(x, z);
    const authoredBlend = smooth((Math.hypot(x, z) - OCEAN_AUTHORED_RADIUS) / 40);
    if (authoredBlend === 0) return { seagrass: 0, sandOpening: 0, hardBottom: 0, authoredBlend: 0 };
    const state = environment ?? sample(x, z);
    if (!Number.isFinite(state.rockiness) || !Number.isFinite(state.seagrassSuitability)) {
      throw new TypeError('Ocean cover environment must contain finite rockiness and seagrass suitability.');
    }
    const { bedCover, corridor } = bedFields(x, z);
    // Start at the existing bed acceptance thresholds, then fade smoothly
    // into supported bed interiors. No candidate, cap or placement changes.
    const hardBottom = smooth((state.rockiness - .38) / .16);
    const seagrass = smooth((state.seagrassSuitability - .36) / .12) *
      smooth((bedCover - .28) / .22) * (1 - smooth((corridor - .85) / .08)) * (1 - hardBottom);
    const sandOpening = corridor * (1 - hardBottom) * (1 - seagrass);
    // All three weights already include the old 40–80m terrain transition.
    return { seagrass: seagrass * authoredBlend, sandOpening: sandOpening * authoredBlend,
      hardBottom: hardBottom * authoredBlend, authoredBlend };
  }

  const excludesAuthored = (x, z, width, depth) =>
    Math.hypot(x, z) - .5 * Math.hypot(width, depth) >= OCEAN_AUTHORED_RADIUS;

  function buildBaseChunk(cx, cz) {
    const origin = Object.freeze({ x: cx * OCEAN_CHUNK_SIZE, z: cz * OCEAN_CHUNK_SIZE });
    const elements = [], counts = { rock: 0, coral: 0, seagrass: 0 };
    // An 8 m world lattice bounds the workload. Individual candidates have
    // independent identity; visiting another chunk cannot consume their seed.
    for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
      const gx = cx * 8 + ix, gz = cz * 8 + iz;
      const x = origin.x + (ix + .15 + .70 * randomAt(gx, gz, 'site-x')) * 8;
      const z = origin.z + (iz + .15 + .70 * randomAt(gx, gz, 'site-z')) * 8;
      const environment = sample(x, z);
      if (Math.hypot(x, z) <= OCEAN_AUTHORED_RADIUS + 2) continue;
      const rockChance = .035 + .60 * environment.rockiness;
      if (counts.rock < OCEAN_ELEMENT_LIMITS.rock && randomAt(gx, gz, 'rock-present') < rockChance) {
        const width = 2.2 + 6 * randomAt(gx, gz, 'rock-width');
        const depth = width * (.72 + .36 * randomAt(gx, gz, 'rock-depth'));
        const height = .65 + 2.75 * randomAt(gx, gz, 'rock-height');
        if (!excludesAuthored(x, z, width, depth)) continue;
        const rotation = randomAt(gx, gz, 'rock-rotation') * TAU;
        // Broad spatial bands give neighbouring outcrops related silhouettes.
        // This field adds style without consuming any existing placement stream.
        const geology = noise(x, z, 150, 'reef-geology');
        const profile = geology < .36 ? 'mound' : geology > .65 ? 'ridge' : 'terrace';
        const rock = freezeElement({ id: `rock:${gx},${gz}`, kind: 'rock', x, y: environment.floorY - .06, z,
          scale: { x: width, y: height, z: depth }, rotation, profile });
        elements.push(rock); counts.rock++;
        // Decorative colonies require existing hard attachment and shallow
        // depth. They are scenery, not additional animal population or biomass.
        if (environment.depthM <= 22 && environment.rockiness > .43) {
          const colonies = randomAt(gx, gz, 'coral-count') > .48 ? 2 : 1;
          for (let index = 0; index < colonies && counts.coral < OCEAN_ELEMENT_LIMITS.coral; index++) {
            const angle = randomAt(gx, gz, `coral-angle-${index}`) * TAU;
            const distance = .12 + .43 * randomAt(gx, gz, `coral-distance-${index}`);
            const lx = Math.cos(angle) * distance * width * .5;
            const lz = Math.sin(angle) * distance * depth * .5;
            const cos = Math.cos(rotation), sin = Math.sin(rotation);
            const coralX = x + lx * cos + lz * sin, coralZ = z - lx * sin + lz * cos;
            const size = .65 + 1.4 * randomAt(gx, gz, `coral-size-${index}`);
            if (!excludesAuthored(coralX, coralZ, size, size)) continue;
            elements.push(freezeElement({ id: `coral:${gx},${gz}:${index}`, kind: 'coral', x: coralX,
              y: oceanRockHeight(rock, coralX, coralZ), z: coralZ,
              scale: { x: size, y: size * .72, z: size },
              rotation: randomAt(gx, gz, `coral-rotation-${index}`) * TAU, attachmentId: rock.id }));
            counts.coral++;
          }
        }
      } else if (environment.substrate !== 'rock' && environment.seagrassSuitability > .27 &&
        randomAt(gx, gz, 'grass-present') < environment.seagrassSuitability * 1.75) {
        const patches = 1 + Math.floor(randomAt(gx, gz, 'grass-count') * 3);
        for (let index = 0; index < patches && counts.seagrass < LEGACY_SEAGRASS_LIMIT; index++) {
          const px = x + (randomAt(gx, gz, `grass-x-${index}`) - .5) * 1.8;
          const pz = z + (randomAt(gx, gz, `grass-z-${index}`) - .5) * 1.8;
          const width = .7 + 1.2 * randomAt(gx, gz, `grass-width-${index}`);
          if (!excludesAuthored(px, pz, width, width)) continue;
          elements.push(freezeElement({ id: `seagrass:${gx},${gz}:${index}`, kind: 'seagrass', x: px,
            y: floorSurface(px, pz).height, z: pz,
            scale: { x: width, y: .32 + .55 * randomAt(gx, gz, `grass-height-${index}`), z: width },
            rotation: randomAt(gx, gz, `grass-rotation-${index}`) * TAU }));
          counts.seagrass++;
        }
      }
    }
    return Object.freeze({ id: `${cx},${cz}`, cx, cz, seed: hash(`${seedKey}|chunk|${cx}|${cz}`), origin,
      size: OCEAN_CHUNK_SIZE, bounds: Object.freeze({ minX: origin.x, minZ: origin.z,
        maxX: origin.x + OCEAN_CHUNK_SIZE, maxZ: origin.z + OCEAN_CHUNK_SIZE }),
      elements: Object.freeze(elements), counts: Object.freeze(counts) });
  }

  function buildSceneryChunk(cx, cz) {
    const base = buildBaseChunk(cx, cz);
    const elements = [...base.elements], counts = { ...base.counts, rubble: 0, algae: 0 };
    // Only a temporary neighbourhood of old hard habitat is needed to exclude
    // bed cover beneath rocks spanning a seam. No visited-region history grows.
    const neighbours = new Map([[base.id, base]]);
    const nearbyRocks = (x, z) => {
      const chunks = [[cx, cz]];
      const edgeX = x - base.origin.x, edgeZ = z - base.origin.z;
      const dx = edgeX < 6 ? -1 : edgeX > 58 ? 1 : 0;
      const dz = edgeZ < 6 ? -1 : edgeZ > 58 ? 1 : 0;
      if (dx) chunks.push([cx + dx, cz]);
      if (dz) chunks.push([cx, cz + dz]);
      if (dx && dz) chunks.push([cx + dx, cz + dz]);
      return chunks.flatMap(([nx, nz]) => {
        const id = `${nx},${nz}`;
        if (!neighbours.has(id)) neighbours.set(id, buildBaseChunk(nx, nz));
        return neighbours.get(id).elements.filter(element => element.kind === 'rock');
      });
    };
    const underRock = (x, z, padding) => nearbyRocks(x, z).some(rock => {
      const cos = Math.cos(rock.rotation), sin = Math.sin(rock.rotation);
      const wx = x - rock.x, wz = z - rock.z;
      return ((wx * cos - wz * sin) / (rock.scale.x * .5 + padding)) ** 2 +
        ((wx * sin + wz * cos) / (rock.scale.z * .5 + padding)) ** 2 <= 1;
    });
    const withinChunk = (x, z, radius) => x - radius >= base.bounds.minX && x + radius < base.bounds.maxX &&
      z - radius >= base.bounds.minZ && z + radius < base.bounds.maxZ;

    // Turf colour is a thin surface cover, independent of the ecology model's
    // reference algae pool. Existing centres are reattached to the shared mesh.
    for (const rock of base.elements.filter(element => element.kind === 'rock')) {
      const environment = sample(rock.x, rock.z);
      if (environment.depthM > 22 || environment.rockiness < .38 ||
        randomAt(rock.id, 0, 'algae-present') > .45 + .45 * environment.rockiness) continue;
      const corals = base.elements.filter(element => element.attachmentId === rock.id && element.kind === 'coral');
      const cos = Math.cos(rock.rotation), sin = Math.sin(rock.rotation);
      const capCount = rock.scale.x > 4.5 ? 2 : 1;
      const caps = [];
      for (let index = 0; index < capCount && counts.algae < OCEAN_ELEMENT_LIMITS.algae; index++) {
        const surfaceRadius = [.12, .18, .24][Math.floor(randomAt(rock.id, index, 'algae-radius') * 3)];
        const footprintRadius = Math.max(rock.scale.x, rock.scale.z) * Math.sin(surfaceRadius / 2);
        for (let attempt = 0; attempt < 6; attempt++) {
          const angle = randomAt(rock.id, index, `algae-angle-${attempt}`) * TAU;
          const distance = .63 + .15 * randomAt(rock.id, index, `algae-distance-${attempt}`);
          const direction = { x: Math.cos(angle) * distance, y: Math.sqrt(1 - distance * distance),
            z: Math.sin(angle) * distance };
          if (caps.some(cap => Math.acos(Math.min(1, cap.direction.x * direction.x +
            cap.direction.y * direction.y + cap.direction.z * direction.z)) < cap.radius + surfaceRadius + .02)) continue;
          const lx = direction.x * rock.scale.x * .5, lz = direction.z * rock.scale.z * .5;
          const x = rock.x + lx * cos + lz * sin, z = rock.z - lx * sin + lz * cos;
          if (!excludesAuthored(x, z, footprintRadius * 2, footprintRadius * 2) ||
            corals.some(coral => Math.hypot(x - coral.x, z - coral.z) <
              Math.max(coral.scale.x, coral.scale.z) * .5 + footprintRadius + .08)) continue;
          const surfaceLocal = { x: direction.x * .5, z: direction.z * .5 };
          const surface = oceanRockSurface(rock.profile, surfaceLocal.x, surfaceLocal.z);
          const nx = surface.normal.x / rock.scale.x, ny = surface.normal.y / rock.scale.y,
            nz = surface.normal.z / rock.scale.z, length = Math.hypot(nx, ny, nz);
          elements.push(freezeElement({ id: `algae:${rock.id}:${index}`, kind: 'algae', x,
            y: rock.y + surface.height * rock.scale.y, z, attachmentId: rock.id,
            surfaceDirection: direction, surfaceRadius, surfaceLocal, patchRadius: Math.sin(surfaceRadius) * .5,
            normal: { x: (nx * cos + nz * sin) / length, y: ny / length, z: (-nx * sin + nz * cos) / length },
            scale: { x: rock.scale.x * Math.sin(surfaceRadius), y: .014 + .010 * randomAt(rock.id, index, 'algae-thickness'),
              z: rock.scale.z * Math.sin(surfaceRadius) }, rotation: rock.rotation }));
          caps.push({ direction, radius: surfaceRadius });
          counts.algae++; break;
        }
      }
    }

    const bedCandidates = [];
    // A finer lattice fills coherent beds; broad clearings and the strongest
    // existing sand-corridor field leave readable open bottom between them.
    for (let iz = 0; iz < 16; iz++) for (let ix = 0; ix < 16; ix++) {
      const gx = cx * 16 + ix, gz = cz * 16 + iz;
      const x = base.origin.x + (ix + .20 + .60 * randomAt(gx, gz, 'cover-x')) * 4;
      const z = base.origin.z + (iz + .20 + .60 * randomAt(gx, gz, 'cover-z')) * 4;
      const environment = sample(x, z);
      if (environment.substrate === 'rock' || Math.hypot(x, z) <= OCEAN_AUTHORED_RADIUS + 1) continue;
      if (counts.rubble < OCEAN_ELEMENT_LIMITS.rubble &&
        randomAt(gx, gz, 'rubble-present') < .08 + .42 * environment.rockiness) {
        const width = .12 + .42 * randomAt(gx, gz, 'rubble-width');
        const depth = width * (.68 + .25 * randomAt(gx, gz, 'rubble-depth'));
        if (excludesAuthored(x, z, width, depth) && !underRock(x, z, Math.max(width, depth) * .5)) {
          elements.push(freezeElement({ id: `rubble:${gx},${gz}`, kind: 'rubble', x, y: floorSurface(x, z).height, z,
            scale: { x: width, y: .025 + .08 * randomAt(gx, gz, 'rubble-height'), z: depth },
            rotation: randomAt(gx, gz, 'rubble-rotation') * TAU }));
          counts.rubble++;
        }
      }
      const { bedCover, corridor } = bedFields(x, z);
      if (environment.seagrassSuitability <= .36 || bedCover < .28 || corridor > .93) continue;
      const patches = 2 + Math.floor(randomAt(gx, gz, 'bed-count') * 2);
      for (let index = 0; index < patches; index++) {
        const px = x + (randomAt(gx, gz, `bed-x-${index}`) - .5) * 2.2;
        const pz = z + (randomAt(gx, gz, `bed-z-${index}`) - .5) * 2.2;
        const width = 1.0 + .9 * randomAt(gx, gz, `bed-width-${index}`);
        const support = sample(px, pz);
        if (support.substrate === 'rock' || support.seagrassSuitability <= .36 ||
          !withinChunk(px, pz, width * .5) || !excludesAuthored(px, pz, width, width) ||
          underRock(px, pz, width * .5)) continue;
        bedCandidates.push({ priority: support.seagrassSuitability + .14 * bedCover +
          .025 * randomAt(gx, gz, `bed-priority-${index}`), element: freezeElement({
          id: `seagrass:${gx},${gz}:bed-${index}`, kind: 'seagrass', x: px, y: floorSurface(px, pz).height, z: pz,
          scale: { x: width, y: .35 + .5 * randomAt(gx, gz, `bed-height-${index}`), z: width },
          rotation: randomAt(gx, gz, `bed-rotation-${index}`) * TAU }) });
      }
    }
    // Cap by habitat suitability rather than scan order, which would leave an
    // artificial bare strip at the far side of a densely vegetated chunk.
    bedCandidates.sort((a, b) => b.priority - a.priority || (a.element.id < b.element.id ? -1 : a.element.id > b.element.id ? 1 : 0));
    for (const candidate of bedCandidates.slice(0, OCEAN_ELEMENT_LIMITS.seagrass - counts.seagrass)) {
      elements.push(candidate.element); counts.seagrass++;
    }
    // Both historic and added tufts use their final displaced root position.
    // Kelp may anchor to rock; rooted seagrass needs sediment and an unoccupied
    // root bed. Removing an invalid scenery tuft never rewrites animal records.
    const supportedElements = elements.filter(element => {
      if (element.kind !== 'seagrass') return true;
      const root = sample(element.x, element.z);
      const valid = root.substrate !== 'rock' && root.depthM < 23 &&
        !underRock(element.x, element.z, Math.max(element.scale.x, element.scale.z) * .5);
      if (!valid) counts.seagrass--;
      return valid;
    });
    const landform = Object.fromEntries(OCEAN_ROCK_PROFILES.map(profile => [profile, 0]));
    for (const rock of elements.filter(element => element.kind === 'rock')) landform[rock.profile]++;
    const habitats = { reef: 0, seagrass: 0, sand: 0, slope: 0, 'authored-reef': 0 };
    let minDepthM = Infinity, maxDepthM = -Infinity;
    // Regular samples describe generated habitat composition, not surveyed
    // area or a new ecological quantity. Keep the original sample API intact.
    for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
      const environment = sample(base.origin.x + (ix + .5) * 8, base.origin.z + (iz + .5) * 8);
      habitats[environment.habitat]++;
      minDepthM = Math.min(minDepthM, environment.depthM); maxDepthM = Math.max(maxDepthM, environment.depthM);
    }
    const ranked = Object.keys(habitats).sort((a, b) => habitats[b] - habitats[a]);
    const habitatComposition = Object.freeze({ samples: 64, habitats: Object.freeze(habitats), primary: ranked[0],
      secondary: habitats[ranked[1]] >= 64 * .2 ? ranked[1] : null, minDepthM, maxDepthM });
    return Object.freeze({ ...base, elements: Object.freeze(supportedElements), counts: Object.freeze(counts),
      surfaceVersion: OCEAN_ROCK_SURFACE_VERSION, landform: Object.freeze(landform), habitatComposition });
  }

  const formations = createOceanFormations({ randomAt, noise, sample });
  function buildChunk(cx, cz) {
    const original = buildSceneryChunk(cx, cz);
    const scenery = new Map([[original.id, original]]);
    const sceneryAt = (x, z) => {
      const id = `${x},${z}`;
      if (!scenery.has(id)) scenery.set(id, cache.get(id) ?? buildSceneryChunk(x, z));
      return scenery.get(id);
    };
    const added = formations.forChunk(cx, cz, sceneryAt);
    const groups = new Map();
    for (const formation of added) {
      if (!groups.has(formation.groupId)) groups.set(formation.groupId, { id: formation.groupId, count: 0,
        profile: formation.profile, rotation: formation.rotation, channelWidth: formation.channelWidth });
      groups.get(formation.groupId).count++;
    }
    const formationSummary = Object.freeze({ count: added.length,
      groups: Object.freeze([...groups.values()].map(group => Object.freeze(group))) });
    return Object.freeze({ ...original, elements: Object.freeze([...original.elements, ...added]),
      counts: Object.freeze({ ...original.counts, formation: added.length }),
      formationsVersion: OCEAN_FORMATIONS_VERSION, formationSummary });
  }

  function chunk(cx, cz) {
    if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz)) throw new RangeError('Chunk coordinates must be safe integers.');
    const key = `${cx},${cz}`;
    if (cache.has(key)) {
      const value = cache.get(key); cache.delete(key); cache.set(key, value); return value;
    }
    const value = buildChunk(cx, cz); cache.set(key, value);
    if (cache.size > OCEAN_CHUNK_CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return value;
  }

  function heightForCamera(x, z) {
    assertCoordinates(x, z);
    let height = Math.max(floorSurface(x, z).height, sample(x, z).floorY);
    if (Math.hypot(x, z) <= OCEAN_AUTHORED_RADIUS) height = Math.max(height, habitatHeight(x, z));
    const cx = Math.floor(x / OCEAN_CHUNK_SIZE), cz = Math.floor(z / OCEAN_CHUNK_SIZE);
    // Adjacent cells own features whose footprint may cross a chunk seam.
    // The whole-height ellipse is intentionally a conservative camera guard,
    // not a surveyed terrain surface or a new animal habitat-height rule.
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const element of chunk(cx + dx, cz + dz).elements) {
        const cos = Math.cos(element.rotation), sin = Math.sin(element.rotation);
        const wx = x - element.x, wz = z - element.z;
        const lx = wx * cos - wz * sin, lz = wx * sin + wz * cos;
        const radius = (lx / (element.scale.x * .5)) ** 2 + (lz / (element.scale.z * .5)) ** 2;
        if (radius <= 1) height = Math.max(height, element.y + element.scale.y);
      }
    }
    return height;
  }

  return Object.freeze({ seed, chunkSize: OCEAN_CHUNK_SIZE, sample, coverAt, chunk, floorVertex, floorSurface,
    floorSurfaceVersion: OCEAN_FLOOR_SURFACE_VERSION, heightForCamera,
    formationDirectionAt: (x, z) => { assertCoordinates(x, z); return formations.directionAt(x, z); },
    cacheStats: () => ({ size: cache.size, limit: OCEAN_CHUNK_CACHE_LIMIT,
      vertices: vertexCache.size, maxVertices: OCEAN_FLOOR_VERTEX_CACHE_LIMIT }) });
}
