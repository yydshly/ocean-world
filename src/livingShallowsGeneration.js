import { LIVING_SHALLOWS_PROFILE, isLivingShallowsSeed } from './livingShallows.js';
import { LIVING_SHALLOWS_ROCK_PROFILES, oceanRockHeight, oceanRockSurface,
  OCEAN_ROCK_SURFACE_VERSION } from './oceanRockShape.js';
import { sceneElementMesh, sceneElementHeight } from './oceanSceneElements.js';

const SIZE = 64, SURFACE_Y = 8, CACHE_LIMIT = 32, VERTEX_LIMIT = 16384;
export const LIVING_SHALLOWS_ELEMENT_LIMITS = Object.freeze({ rock: 20, coral: 36, seagrass: 256, rubble: 128, algae: 48, formation: 0,
  driftwood: 1, bottle: 1 });
const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const assertPoint = (x, z) => { if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Ocean coordinates must be finite world metres.'); };

function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) { value ^= text.charCodeAt(index); value = Math.imul(value, 16777619); }
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15; value = Math.imul(value, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}

function freezeElement(element) {
  for (const key of ['scale', 'normal', 'surfaceLocal', 'surfaceDirection']) if (element[key]) Object.freeze(element[key]);
  return Object.freeze(element);
}

// Reserve the complete existing soft-site candidate lattice, including sites
// that occupancy does not choose. This is a conservative scenery exclusion,
// never an animal-placement change or a new food stock. The salt contract is
// the same as the existing community's 8 m soft-site stream.
export function livingShallowsSoftActivitySites(seed, cx, cz) {
  const world = `ecology-v1:${typeof seed}:${seed}`, region = `${cx},${cz}`;
  const random = salt => hash(`${world}|${region}|${salt}`) / 4294967296;
  return Array.from({ length: 64 }, (_, index) => {
    const ix = index % 8, iz = Math.floor(index / 8), id = `soft:${ix},${iz}`;
    return { x: cx * SIZE + (ix + .2 + random(`${id}:x`) * .6) * 8,
      z: cz * SIZE + (iz + .2 + random(`${id}:z`) * .6) * 8 };
  });
}

export function livingShallowsPropWorldVertex(element, positions, index) {
  const c = Math.cos(element.rotation), s = Math.sin(element.rotation);
  const x = positions[index] * element.scale.x, z = positions[index + 2] * element.scale.z;
  return { x: element.x + x * c + z * s, y: positions[index + 1] * element.scale.y,
    z: element.z - x * s + z * c };
}

export function livingShallowsPropGroundY(generator, element) {
  const mesh = sceneElementMesh(element.kind, element.variant), positions = mesh.positions;
  let y = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    const point = livingShallowsPropWorldVertex(element, positions, index);
    y = Math.max(y, generator.floorSurface(point.x, point.z).height - point.y);
  }
  return y;
}

// These are landmarks in a continuously generated field, not a finite map or
// camera-selected collection. Ordinary exploration extends beyond this route.
export const LIVING_SHALLOWS_ROUTE = Object.freeze([
  Object.freeze({ id: 'reef-garden', label: '连片礁群', x: 224, z: 224 }),
  Object.freeze({ id: 'sand-channel', label: '沙地通道', x: 336, z: 224 }),
  Object.freeze({ id: 'seagrass-meadow', label: '浅海草床', x: 448, z: 240 }),
  Object.freeze({ id: 'outer-reef', label: '外礁坡面', x: 576, z: 272 }),
]);

/** A single coordinate plan feeds terrain, cover, attachment and ecology.
 * Display plants remain scenery descriptors; ecology explicitly selects
 * representative resource patches instead of treating every tuft as biomass. */
export function createLivingShallowsGenerator(seed) {
  if (!isLivingShallowsSeed(seed)) throw new TypeError('Living shallows require their explicit scene-version seed.');
  const random = (x, z, salt) => hash(`${seed}|${x}|${z}|${salt}`) / 4294967296;
  const chunks = new Map(), vertices = new Map();

  function noise(x, z, wavelength, salt) {
    const gx = x / wavelength, gz = z / wavelength, ix = Math.floor(gx), iz = Math.floor(gz);
    const tx = smooth(gx - ix), tz = smooth(gz - iz);
    return mix(mix(random(ix, iz, salt), random(ix + 1, iz, salt), tx),
      mix(random(ix, iz + 1, salt), random(ix + 1, iz + 1, salt), tx), tz);
  }

  function fields(x, z) {
    const broad = noise(x, z, 310, 'shelf-depth'), ridge = noise(x, z, 145, 'reef-ridges');
    const channelCenter = 250 + 24 * Math.sin(x / 160) + 38 * (noise(x, 0, 230, 'channel-course') - .5);
    const channel = Math.exp(-(((z - channelCenter) / 24) ** 2));
    const naturalHard = clamp(.22 + .92 * (ridge - .22) - .55 * channel);
    const naturalGrass = clamp((noise(x, z, 165, 'meadow-fields') - .20) * 1.5 * (1 - naturalHard) * (1 - .7 * channel));
    // The first route is a broad habitat sequence blended into the same world
    // fields. Gaussian influence has no chunk edge or finite world boundary.
    const guides = [
      Math.exp(-(((x - 224) / 86) ** 2 + ((z - 224) / 94) ** 2)),
      Math.exp(-(((x - 336) / 49) ** 2 + ((z - 224) / 104) ** 2)),
      Math.exp(-(((x - 448) / 79) ** 2 + ((z - 240) / 98) ** 2)),
      Math.exp(-(((x - 576) / 86) ** 2 + ((z - 272) / 110) ** 2)),
    ];
    const background = 1 - Math.max(...guides), denominator = background + guides.reduce((sum, value) => sum + value, 0);
    const weighted = (base, targets) => (base * background + guides.reduce((sum, value, index) => sum + value * targets[index], 0)) / denominator;
    const rockiness = clamp(weighted(naturalHard, [.90, .035, .055, .70]));
    const seagrassSuitability = clamp(weighted(naturalGrass, [.025, .07, .92, .015]) * (1 - rockiness));
    const sandOpening = clamp(weighted(channel * (1 - naturalHard), [.10, .96, .08, .12]));
    const depthBase = weighted(-3.3 - broad * 10.2, [-3.0, -4.4, -2.6, -12.4]);
    const outcropRelief = rockiness * (1.5 * (noise(x, z, 46, 'joined-reef-hills') - .25) +
      .75 * Math.sin(x / 24 + .6 * Math.sin(z / 43)) * Math.cos(z / 29));
    const floorY = depthBase + outcropRelief + .45 * (noise(x, z, 19, 'sediment-relief') - .5);
    return { floorY, depthM: SURFACE_Y - floorY, rockiness, seagrassSuitability, sandOpening };
  }

  function sample(x, z) {
    assertPoint(x, z);
    const state = fields(x, z);
    const substrate = state.rockiness > .52 ? 'rock' : state.rockiness > .31 ? 'mixed' : 'sand';
    const habitat = state.depthM > 18.5 ? 'slope' : state.rockiness > .52 ? 'reef' :
      state.seagrassSuitability > .40 ? 'seagrass' : 'sand';
    return { ...state, habitat, substrate };
  }

  function coverAt(x, z, environment = undefined) {
    assertPoint(x, z);
    const state = environment ?? sample(x, z);
    if (!Number.isFinite(state.rockiness) || !Number.isFinite(state.seagrassSuitability)) {
      throw new TypeError('Ocean cover requires the finite local habitat fields.');
    }
    const hardBottom = smooth((state.rockiness - .30) / .30);
    const seagrass = smooth((state.seagrassSuitability - .25) / .42) * (1 - hardBottom);
    return { seagrass, hardBottom, sandOpening: (state.sandOpening ?? fields(x, z).sandOpening) * (1 - seagrass), authoredBlend: 1 };
  }

  function floorVertex(x, z) {
    assertPoint(x, z);
    const id = `${x},${z}`, previous = vertices.get(id);
    if (previous !== undefined) return previous;
    const value = Math.fround(sample(x, z).floorY);
    vertices.set(id, value);
    if (vertices.size > VERTEX_LIMIT) vertices.delete(vertices.keys().next().value);
    return value;
  }

  function floorSurface(x, z) {
    assertPoint(x, z);
    const ix = Math.floor(x), iz = Math.floor(z), tx = x - ix, tz = z - iz;
    const a = floorVertex(ix, iz), b = floorVertex(ix + 1, iz), c = floorVertex(ix, iz + 1), d = floorVertex(ix + 1, iz + 1);
    const lower = tx + tz <= 1, dx = lower ? b - a : d - c, dz = lower ? c - a : d - b, length = Math.hypot(dx, 1, dz);
    return { height: lower ? a + dx * tx + dz * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz),
      normal: { x: -dx / length, y: 1 / length, z: -dz / length }, elementId: null };
  }

  const outsideOriginal = (x, z, width, depth) => Math.hypot(x, z) - .5 * Math.hypot(width, depth) > 42;
  const rockDirection = (x, z) => .28 * Math.sin(z / 190) + .40 * (noise(x, z, 250, 'ridge-direction') - .5);

  function baseRocks(cx, cz) {
    const rocks = [];
    for (let iz = 0; iz < 4; iz++) for (let ix = 0; ix < 4; ix++) {
      const gx = cx * 4 + ix, gz = cz * 4 + iz;
      const x = (gx + .22 + .56 * random(gx, gz, 'rock-x')) * 16;
      const z = (gz + .22 + .56 * random(gx, gz, 'rock-z')) * 16, state = sample(x, z);
      if (random(gx, gz, 'rock-present') > .035 + .96 * state.rockiness || state.sandOpening > .65) continue;
      const width = 10 + 15 * random(gx, gz, 'rock-width'), depth = width * (.52 + .32 * random(gx, gz, 'rock-depth'));
      if (!outsideOriginal(x, z, width, depth)) continue;
      const geology = noise(x, z, 155, 'rock-forms');
      const profile = LIVING_SHALLOWS_ROCK_PROFILES[geology < .35 ? 0 : geology < .64 ? 1 : 2];
      rocks.push(freezeElement({ id: `living-rock:${gx},${gz}`, kind: 'rock', profile, x, y: floorSurface(x, z).height - .18, z,
        rotation: rockDirection(x, z) + (random(gx, gz, 'rock-turn') - .5) * .75,
        scale: { x: width, y: 1.5 + 2.9 * random(gx, gz, 'rock-height'), z: depth } }));
    }
    return rocks;
  }

  function buildChunk(cx, cz) {
    const origin = Object.freeze({ x: cx * SIZE, z: cz * SIZE });
    const bounds = Object.freeze({ minX: origin.x, minZ: origin.z, maxX: origin.x + SIZE, maxZ: origin.z + SIZE });
    const rocks = baseRocks(cx, cz), elements = [...rocks];
    const counts = { rock: rocks.length, coral: 0, seagrass: 0, rubble: 0, algae: 0, formation: 0, driftwood: 0, bottle: 0 };
    const surrounding = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) surrounding.push(...(dx || dz ? baseRocks(cx + dx, cz + dz) : rocks));
    const hardHeight = (x, z) => {
      let height = floorSurface(x, z).height;
      for (const rock of surrounding) { const support = oceanRockHeight(rock, x, z); if (support !== null) height = Math.max(height, support); }
      return height;
    };
    const local = (x, z, margin = .1) => x >= bounds.minX + margin && x < bounds.maxX - margin && z >= bounds.minZ + margin && z < bounds.maxZ - margin;
    const transform = (rock, lx, lz) => {
      const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation);
      return { x: rock.x + lx * rock.scale.x * c + lz * rock.scale.z * s, z: rock.z - lx * rock.scale.x * s + lz * rock.scale.z * c };
    };

    for (const rock of rocks) {
      if (sample(rock.x, rock.z).depthM > 22) continue;
      const attached = [];
      // Several silhouettes belong to the same hard-host plan. Branching
      // colonies supply real existing refuge niches rather than decorative fish.
      for (let index = 0; index < 4 && counts.coral < LIVING_SHALLOWS_ELEMENT_LIMITS.coral; index++) {
        const angle = index * TAU / 4 + random(rock.id, index, 'coral-angle') * .55;
        const radius = index === 0 ? .04 : .17 + .05 * random(rock.id, index, 'coral-radius');
        const { x, z } = transform(rock, Math.cos(angle) * radius, Math.sin(angle) * radius);
        const y = oceanRockHeight(rock, x, z), state = sample(x, z);
        if (!local(x, z, 2.4) || y === null || y < floorSurface(x, z).height + .25 || hardHeight(x, z) > y + 1e-6 || state.depthM > 22) continue;
        const morphotype = index < 2 ? 'branching' : index === 2 ? 'table' : 'fan';
        const width = morphotype === 'table' ? 2.5 + 2.0 * random(rock.id, index, 'coral-width') :
          morphotype === 'fan' ? 1.8 + 1.4 * random(rock.id, index, 'coral-width') : 2.2 + 2.0 * random(rock.id, index, 'coral-width');
        if (attached.some(other => Math.hypot(other.x - x, other.z - z) < .5 * (other.scale.x + width) + .2)) continue;
        const height = morphotype === 'table' ? .75 + .65 * random(rock.id, index, 'coral-height') :
          morphotype === 'fan' ? 1.7 + 1.1 * random(rock.id, index, 'coral-height') : 1.1 + 1.4 * random(rock.id, index, 'coral-height');
        const coral = freezeElement({ id: `living-coral:${rock.id}:${index}`, kind: 'coral', morphotype,
          x, y, z, attachmentId: rock.id, rotation: random(rock.id, index, 'coral-rotation') * TAU,
          scale: { x: width, y: height, z: width * (morphotype === 'table' ? .85 : .75) } });
        elements.push(coral); attached.push(coral); counts.coral++;
      }
      // Broad exposed side patches remain available to actual grazers. Each
      // root and every clipped render patch uses the same Float32 rock mesh.
      for (let index = 0; index < 3 && counts.algae < LIVING_SHALLOWS_ELEMENT_LIMITS.algae; index++) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const angle = random(rock.id, index, `algae-angle-${attempt}`) * TAU;
          const radius = .27 + .025 * random(rock.id, index, 'algae-offset');
          const surfaceLocal = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
          const surface = oceanRockSurface(rock.profile, surfaceLocal.x, surfaceLocal.z);
          if (!surface) continue;
          const { x, z } = transform(rock, surfaceLocal.x, surfaceLocal.z), y = rock.y + surface.height * rock.scale.y;
          const patchRadius = .035 + .018 * random(rock.id, index, 'algae-radius');
          const worldRadius = Math.max(rock.scale.x, rock.scale.z) * patchRadius;
          if (!local(x, z, worldRadius) || y < floorSurface(x, z).height + .12 || hardHeight(x, z) > y + 1e-6 ||
            attached.some(coral => Math.hypot(x - coral.x, z - coral.z) < coral.scale.x * .5 + worldRadius)) continue;
          const c = Math.cos(rock.rotation), s = Math.sin(rock.rotation), nx = surface.normal.x / rock.scale.x,
            ny = surface.normal.y / rock.scale.y, nz = surface.normal.z / rock.scale.z, length = Math.hypot(nx, ny, nz);
          elements.push(freezeElement({ id: `living-algae:${rock.id}:${index}`, kind: 'algae', attachmentId: rock.id,
            x, y, z, surfaceLocal, patchRadius, rotation: rock.rotation,
            normal: { x: (nx * c + nz * s) / length, y: ny / length, z: (-nx * s + nz * c) / length },
            scale: { x: rock.scale.x * patchRadius * 2, y: .018, z: rock.scale.z * patchRadius * 2 } }));
          counts.algae++; break;
        }
      }
    }

    const grassCandidates = [];
    // 3 m roots form beds in the broad shared field; chunk boundaries simply
    // slice this lattice. Exact hard support keeps roots out of neighbouring rocks.
    const gxStart = Math.floor((bounds.minX - .6) / 3), gzStart = Math.floor((bounds.minZ - .6) / 3);
    for (let gz = gzStart; gz * 3 < bounds.maxZ + .6; gz++) for (let gx = gxStart; gx * 3 < bounds.maxX + .6; gx++) {
      const x = gx * 3 + (random(gx, gz, 'grass-x') - .5) * 1.1;
      const z = gz * 3 + (random(gx, gz, 'grass-z') - .5) * 1.1, state = sample(x, z);
      if (!local(x, z, 0) || state.substrate === 'rock' || state.depthM > 20 || state.seagrassSuitability < .30 ||
        random(gx, gz, 'grass-present') > .20 + state.seagrassSuitability * .95 || !outsideOriginal(x, z, 2, 2)) continue;
      const width = 1.25 + .65 * random(gx, gz, 'grass-width'), floor = floorSurface(x, z).height;
      let clear = true;
      for (const [dx, dz] of [[0, 0], [width * .5, 0], [-width * .5, 0], [0, width * .5], [0, -width * .5]]) {
        if (hardHeight(x + dx, z + dz) > floorSurface(x + dx, z + dz).height + .035) { clear = false; break; }
      }
      if (!clear) continue;
      grassCandidates.push({ score: state.seagrassSuitability + .12 * random(gx, gz, 'grass-priority'), element: freezeElement({
        id: `living-grass:${gx},${gz}`, kind: 'seagrass', x, y: floor, z,
        scale: { x: width, y: .45 + .45 * random(gx, gz, 'grass-height'), z: width }, rotation: random(gx, gz, 'grass-rotation') * TAU }) });
    }
    grassCandidates.sort((a, b) => b.score - a.score || a.element.id.localeCompare(b.element.id));
    for (const candidate of grassCandidates.slice(0, LIVING_SHALLOWS_ELEMENT_LIMITS.seagrass)) { elements.push(candidate.element); counts.seagrass++; }

    for (let iz = 0; iz < 16; iz++) for (let ix = 0; ix < 16; ix++) {
      const gx = cx * 16 + ix, gz = cz * 16 + iz, x = (gx + .2 + .6 * random(gx, gz, 'rubble-x')) * 4,
        z = (gz + .2 + .6 * random(gx, gz, 'rubble-z')) * 4, state = sample(x, z);
      if (counts.rubble >= LIVING_SHALLOWS_ELEMENT_LIMITS.rubble || !outsideOriginal(x, z, 1, 1) ||
        random(gx, gz, 'rubble-present') > .12 + .45 * state.rockiness || hardHeight(x, z) > floorSurface(x, z).height + .035) continue;
      const width = .18 + .65 * random(gx, gz, 'rubble-width');
      elements.push(freezeElement({ id: `living-rubble:${gx},${gz}`, kind: 'rubble', x, y: floorSurface(x, z).height, z,
        scale: { x: width, y: .05 + .12 * random(gx, gz, 'rubble-height'), z: width * (.55 + .30 * random(gx, gz, 'rubble-depth')) },
        rotation: random(gx, gz, 'rubble-rotation') * TAU }));
      counts.rubble++;
    }

    // One sparse discovery pair belongs to the route's natural sandy reach.
    // Elsewhere independently seeded low probabilities leave most cells bare.
    // This appended stream cannot change existing flora, RNG or animal state.
    const routeReach = cx === 5 && cz === 3, activity = livingShallowsSoftActivitySites(seed, cx, cz);
    for (const kind of ['driftwood', 'bottle']) {
      if (!routeReach && random(cx, cz, `${kind}-present`) > (kind === 'driftwood' ? .16 : .035)) continue;
      for (let attempt = 0; attempt < 144; attempt++) {
        const x = routeReach ? 326 + random(cx, cz, `${kind}-x:${attempt}`) * 25 : origin.x + 5 + random(cx, cz, `${kind}-x:${attempt}`) * 54;
        const z = routeReach ? 210 + random(cx, cz, `${kind}-z:${attempt}`) * 31 : origin.z + 5 + random(cx, cz, `${kind}-z:${attempt}`) * 54;
        const state = sample(x, z);
        if (!local(x, z, 4) || state.substrate === 'rock' || state.seagrassSuitability > .35 || state.depthM < 3 || state.depthM > 23) continue;
        const element = { id: `living-${kind}:${cx},${cz}`, kind, variant: 0, x, y: 0, z,
          rotation: random(cx, cz, `${kind}-rotation:${attempt}`) * TAU,
          scale: kind === 'driftwood' ? { x: 1 + random(cx, cz, 'wood-length'), y: .10 + .10 * random(cx, cz, 'wood-height'), z: .15 + .13 * random(cx, cz, 'wood-width') } :
            { x: .25 + .10 * random(cx, cz, 'bottle-length'), y: .07 + .015 * random(cx, cz, 'bottle-diameter'), z: .07 + .015 * random(cx, cz, 'bottle-diameter') },
          physicalState: kind === 'bottle' ? 'grounded-flooded' : 'grounded',
          ...(kind === 'bottle' ? { flooded: true, sealed: false } : {}) };
        const radius = Math.hypot(element.scale.x, element.scale.z) * .5;
        if (activity.some(point => Math.hypot(point.x - x, point.z - z) < radius + 3.2) ||
          surrounding.some(rock => Math.hypot(rock.x - x, rock.z - z) < radius + Math.hypot(rock.scale.x, rock.scale.z) * .5 + 1.8) ||
          elements.some(row => Math.hypot(row.x - x, row.z - z) < radius +
            (row.kind === 'seagrass' ? 6.5 : Math.hypot(row.scale.x, row.scale.z) * .5 + .3))) continue;
        const mesh = sceneElementMesh(kind, 0);
        if (mesh.positions.some((_, index) => {
          if (index % 3) return false;
          const point = livingShallowsPropWorldVertex(element, mesh.positions, index);
          return hardHeight(point.x, point.z) > floorSurface(point.x, point.z).height + 1e-6;
        })) continue;
        element.y = livingShallowsPropGroundY({ floorSurface }, element);
        elements.push(freezeElement(element)); counts[kind]++; break;
      }
    }

    const habitats = { reef: 0, sand: 0, seagrass: 0, slope: 0, 'authored-reef': 0 };
    let minDepthM = Infinity, maxDepthM = -Infinity;
    for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
      const state = sample(origin.x + (ix + .5) * 8, origin.z + (iz + .5) * 8);
      habitats[state.habitat]++; minDepthM = Math.min(minDepthM, state.depthM); maxDepthM = Math.max(maxDepthM, state.depthM);
    }
    const ranked = Object.keys(habitats).sort((a, b) => habitats[b] - habitats[a]);
    const landform = Object.fromEntries(LIVING_SHALLOWS_ROCK_PROFILES.map(profile => [profile, 0]));
    for (const rock of rocks) landform[rock.profile]++;
    return Object.freeze({ id: `${cx},${cz}`, cx, cz, seed: hash(`${seed}|chunk|${cx}|${cz}`), origin, bounds, size: SIZE,
      profile: LIVING_SHALLOWS_PROFILE, elements: Object.freeze(elements), counts: Object.freeze(counts),
      surfaceVersion: OCEAN_ROCK_SURFACE_VERSION, formationsVersion: 0,
      formationSummary: Object.freeze({ count: 0, groups: Object.freeze([]) }), landform: Object.freeze(landform),
      habitatComposition: Object.freeze({ samples: 64, habitats: Object.freeze(habitats), primary: ranked[0],
        secondary: habitats[ranked[1]] >= 13 ? ranked[1] : null, minDepthM, maxDepthM }) });
  }

  function chunk(cx, cz) {
    if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz)) throw new RangeError('Chunk coordinates must be safe integers.');
    const id = `${cx},${cz}`;
    if (chunks.has(id)) { const previous = chunks.get(id); chunks.delete(id); chunks.set(id, previous); return previous; }
    const value = buildChunk(cx, cz); chunks.set(id, value);
    if (chunks.size > CACHE_LIMIT) chunks.delete(chunks.keys().next().value);
    return value;
  }

  function heightForCamera(x, z) {
    assertPoint(x, z);
    let height = Math.max(floorSurface(x, z).height, sample(x, z).floorY);
    const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const element of chunk(cx + dx, cz + dz).elements) {
      if (element.kind === 'algae') continue;
      if (element.kind === 'bottle' || element.kind === 'driftwood') {
        const support = sceneElementHeight(element, x, z);
        if (support !== null) height = Math.max(height, support);
        continue;
      }
      const c = Math.cos(element.rotation), s = Math.sin(element.rotation), wx = x - element.x, wz = z - element.z;
      if (((wx * c - wz * s) / (element.scale.x * .5)) ** 2 + ((wx * s + wz * c) / (element.scale.z * .5)) ** 2 <= 1) {
        height = Math.max(height, element.y + element.scale.y);
      }
    }
    return height;
  }

  return Object.freeze({ seed, profile: LIVING_SHALLOWS_PROFILE, chunkSize: SIZE, surfaceY: SURFACE_Y,
    routeStops: LIVING_SHALLOWS_ROUTE, rockProfiles: LIVING_SHALLOWS_ROCK_PROFILES,
    sample, coverAt, chunk, floorVertex, floorSurface, floorSurfaceVersion: 1, heightForCamera,
    formationDirectionAt: (x, z) => { assertPoint(x, z); return rockDirection(x, z); },
    cacheStats: () => ({ size: chunks.size, limit: CACHE_LIMIT, vertices: vertices.size, maxVertices: VERTEX_LIMIT }) });
}
