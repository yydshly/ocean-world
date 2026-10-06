import { livingSeabedFloorSurface, sampleLivingSeabedRelief } from './livingSeabedRelief.js';
import { oceanRockHeight, oceanRockMesh, oceanRockSurface } from './oceanRockShape.js';
import { sceneElementHeight } from './oceanSceneElements.js';
import { LIVING_SHALLOWS_ELEMENT_LIMITS, livingShallowsSoftActivitySites,
  livingShallowsPropGroundY, livingShallowsPropWorldVertex } from './livingShallowsGeneration.js';
import { sceneElementMesh } from './oceanSceneElements.js';

const OWNER = 64, WIDTH = 384, DEPTH = 128, ROW = 385, GUARD = 16, TAU = Math.PI * 2, CACHE_LIMIT = 4;
const models = new WeakMap(), coverIndices = new WeakMap(), baseCoverIndices = new WeakMap();
const stamp = value => JSON.stringify(value);
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
export const SHALLOW_SEASCAPE_ANCHOR = Object.freeze({ cx: 96, cz: 2 });
const routeOffsets = [
  { id: 'shallow-scene-reef', label: '整景礁群', x: 76, z: 42 },
  { id: 'shallow-scene-sand', label: '整景砂道', x: 164, z: 64 },
  { id: 'shallow-scene-meadow', label: '整景草床', x: 264, z: 42 },
  { id: 'shallow-scene-slope', label: '整景外礁坡', x: 360, z: 96 },
];
export const SHALLOW_SEASCAPE_ROUTE_STOPS = freeze(routeOffsets.map(p => ({ ...p,
  x: SHALLOW_SEASCAPE_ANCHOR.cx * OWNER + p.x, z: SHALLOW_SEASCAPE_ANCHOR.cz * OWNER + p.z })));
function random(seed, salt) {
  let h = 2166136261;
  for (const ch of `${typeof seed}:${seed}|shallow-seascape-v6|${salt}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function source(generator, cx, cz) {
  const base = generator.baseGenerator ?? generator;
  if (base.profile !== 'living-shallows-v1' || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || cx % 6 || cz % 2)
    throw new TypeError('A complete shallow seascape requires a 6 by 2 aligned living-shallows origin.');
  const chunks = [];
  for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 6; dx++) chunks.push(base.chunk(cx + dx, cz + dz));
  return { base, chunks, origin: { x: cx * OWNER, z: cz * OWNER } };
}
/** One world-coordinate facies field is shared across all twelve owner edges.
 * Weights describe scenery composition, never fictitious hard support or food. */
export function shallowSeascapeFacies(plan, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Facies coordinates must be finite world metres.');
  const g = plan.group, lx = x - g.cx * OWNER, lz = z - g.cz * OWNER;
  const edge = Math.min(lx, WIDTH - lx, lz, DEPTH - lz), influence = smooth((edge - GUARD) / 8);
  const along = Math.max(0, Math.min(WIDTH, lx + 8 * Math.sin((lz - 64) / 50)));
  const fields = [Math.exp(-(((along - 64) / 56) ** 2)), Math.exp(-(((along - 164) / 50) ** 2)),
    Math.exp(-(((along - 264) / 58) ** 2)), Math.exp(-(((along - 344) / 50) ** 2))];
  const total = fields.reduce((a, b) => a + b, 0), names = ['reef', 'sand', 'meadow', 'slope'];
  const result = { influence }; names.forEach((name, i) => result[name] = fields[i] / total);
  result.dominant = names[fields.indexOf(Math.max(...fields))]; return result;
}
function world(e, x, z) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  return { x: e.x + x * e.scale.x * c + z * e.scale.z * s,
    z: e.z - x * e.scale.x * s + z * e.scale.z * c };
}
const ring = (x, z, radius) => [{ x, z }, ...Array.from({ length: 8 }, (_, i) => ({
  x: x + Math.cos(i * TAU / 8) * radius, z: z + Math.sin(i * TAU / 8) * radius }))];
function halo(base, cx, cz) {
  const rows = [];
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 6; dx++) rows.push(...base.chunk(cx + dx, cz + dz).elements);
  return rows;
}
function protection(rows) {
  const bins = new Map();
  for (const e of rows) if (['rock', 'coral', 'algae', 'seagrass', 'driftwood', 'bottle'].includes(e.kind)) {
    const radius = Math.hypot(e.scale.x, e.scale.z) * .5 + 1.5, reach = radius + 6;
    const p = { x: e.x, z: e.z, radius };
    for (let iz = Math.floor((e.z - reach) / 16); iz <= Math.floor((e.z + reach) / 16); iz++)
      for (let ix = Math.floor((e.x - reach) / 16); ix <= Math.floor((e.x + reach) / 16); ix++) {
        const key = `${ix},${iz}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(p);
      }
  }
  return (x, z) => {
    let value = 1;
    for (const p of bins.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
      value = Math.min(value, smooth((Math.hypot(x - p.x, z - p.z) - p.radius) / 6)); if (!value) break;
    }
    return value;
  };
}
function amplitudeLimit(baseline, unit) {
  let amplitude = 1; const permitted = .6499 ** 2;
  for (let iz = 0; iz < DEPTH; iz++) for (let ix = 0; ix < WIDTH; ix++) {
    const a = iz * ROW + ix, b = a + 1, c = a + ROW, d = c + 1;
    for (const [i, j, k] of [[a, b, c], [d, c, b]]) {
      const bx = baseline[j] - baseline[i], bz = baseline[k] - baseline[i], ux = unit[j] - unit[i], uz = unit[k] - unit[i];
      const bb = bx * bx + bz * bz, uu = ux * ux + uz * uz, dot = bx * ux + bz * uz;
      if (bb > permitted) return 0;
      if (uu > 1e-16) amplitude = Math.min(amplitude, (-dot + Math.sqrt(dot * dot + uu * (permitted - bb))) / uu);
    }
  }
  for (let i = 0; i < unit.length; i++) if (unit[i] > 0) amplitude = Math.min(amplitude, (5 - baseline[i]) / unit[i]);
  return Math.max(0, amplitude * .999);
}
function measurements(heights, baseline, width, depth, row, origin, surfaceY) {
  let deltaMinM = Infinity, deltaMaxM = -Infinity, minDepthM = Infinity, maxDepthM = -Infinity, maxSlope = 0, mostDisplaced = null;
  for (let i = 0; i < heights.length; i++) {
    const deltaM = heights[i] - baseline[i], depthM = surfaceY - heights[i];
    deltaMinM = Math.min(deltaMinM, deltaM); deltaMaxM = Math.max(deltaMaxM, deltaM);
    minDepthM = Math.min(minDepthM, depthM); maxDepthM = Math.max(maxDepthM, depthM);
    if (!mostDisplaced || Math.abs(deltaM) > Math.abs(mostDisplaced.deltaM)) mostDisplaced = {
      x: origin.x + i % row, z: origin.z + Math.floor(i / row), deltaM };
  }
  for (let iz = 0; iz < depth; iz++) for (let ix = 0; ix < width; ix++) {
    const a = iz * row + ix, b = a + 1, c = a + row, d = c + 1;
    maxSlope = Math.max(maxSlope, Math.hypot(heights[b] - heights[a], heights[c] - heights[a]),
      Math.hypot(heights[d] - heights[c], heights[d] - heights[b]));
  }
  return { deltaMinM, deltaMaxM, deltaSpanM: deltaMaxM - deltaMinM, minDepthM, maxDepthM, maxSlope, mostDisplaced };
}
function fits(e, chunk, origin) {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation), hx = .5 * (Math.abs(c) * e.scale.x + Math.abs(s) * e.scale.z),
    hz = .5 * (Math.abs(s) * e.scale.x + Math.abs(c) * e.scale.z);
  return e.x - hx >= chunk.bounds.minX + .5 && e.x + hx <= chunk.bounds.maxX - .5 &&
    e.z - hz >= chunk.bounds.minZ + .5 && e.z + hz <= chunk.bounds.maxZ - .5 &&
    e.x - hx >= origin.x + GUARD && e.x + hx <= origin.x + WIDTH - GUARD &&
    e.z - hz >= origin.z + GUARD && e.z + hz <= origin.z + DEPTH - GUARD;
}
function floorView(base, plans) {
  const byId = new Map(plans.map(p => [p.id, p]));
  return { floorSurface: (x, z) => livingSeabedFloorSurface(base, byId.get(`${Math.floor(x / OWNER)},${Math.floor(z / OWNER)}`), x, z) };
}
function hardHeight(view, rows, x, z) {
  let y = view.floorSurface(x, z).height;
  for (const e of rows) {
    if (!['rock', 'driftwood', 'bottle'].includes(e.kind) || Math.hypot(e.x - x, e.z - z) > Math.hypot(e.scale.x, e.scale.z) * .5 + .1) continue;
    const h = e.kind === 'rock' ? oceanRockHeight(e, x, z) : sceneElementHeight(e, x, z, true);
    if (h !== null) y = Math.max(y, h);
  }
  return y;
}
const clearFloor = (view, rows, p, radius) => ring(p.x, p.z, radius).every(q =>
  hardHeight(view, rows, q.x, q.z) <= view.floorSurface(q.x, q.z).height + .035);
function protectedFromRock(rows, rock) {
  return rows.every(e => {
    if (!['rock', 'coral', 'algae', 'seagrass', 'driftwood', 'bottle'].includes(e.kind)) return true;
    const radius = Math.hypot(e.scale.x, e.scale.z) * .5;
    if (Math.hypot(e.x - rock.x, e.z - rock.z) > radius + Math.hypot(rock.scale.x, rock.scale.z) * .5 + .1) return true;
    return ring(e.x, e.z, radius).every(p => { const y = oceanRockHeight(rock, p.x, p.z); return y === null || y <= e.y + .012; });
  });
}
function addRocks(base, chunks, plans, rows, view, origin) {
  const newRocks = [], originalHard = rows.filter(e => e.kind === 'rock');
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci], plan = plans[ci], col = chunk.cx - chunks[0].cx;
    if (!(col <= 1 || col === 5 && chunk.cz === chunks[0].cz + 1)) continue;
    const sites = livingShallowsSoftActivitySites(base.seed, chunk.cx, chunk.cz).filter(p =>
      base.sample(p.x, p.z).substrate !== 'rock' && clearFloor(view, originalHard, p, .6));
    const candidates = [];
    for (const z of [14, 26, 38, 50]) for (const x of [14, 26, 38, 50]) candidates.push({
      x: chunk.origin.x + x + (random(base.seed, `${chunk.id}:${x},${z}:x`) - .5) * 2,
      z: chunk.origin.z + z + (random(base.seed, `${chunk.id}:${x},${z}:z`) - .5) * 2, salt: `${chunk.id}:${x},${z}` });
    candidates.sort((a, b) => random(base.seed, `${a.salt}:order`) - random(base.seed, `${b.salt}:order`));
    for (const p of candidates) {
      if (plan.newRockIds.length >= 3 || plan.elements.filter(e => e.kind === 'rock').length >= LIVING_SHALLOWS_ELEMENT_LIMITS.rock) break;
      const width = 9 + random(base.seed, `${p.salt}:width`) * 5;
      const e = { id: `shallow-seascape:${chunk.id}:rock:${plan.newRockIds.length}`, kind: 'rock',
        profile: ['natural-a', 'natural-b', 'natural-c'][Math.floor(random(base.seed, `${p.salt}:profile`) * 3)], x: p.x, y: 0, z: p.z,
        rotation: random(base.seed, `${p.salt}:turn`) * TAU,
        scale: { x: width, y: 3.2 + random(base.seed, `${p.salt}:height`) * 2, z: width * (.63 + random(base.seed, `${p.salt}:depth`) * .18) } };
      const mesh = oceanRockMesh(e.profile); let ground = Infinity;
      for (let i = 0; i < mesh.positions.length; i += 3) if (mesh.positions[i + 1] === 0) {
        const q = world(e, mesh.positions[i], mesh.positions[i + 2]); ground = Math.min(ground, view.floorSurface(q.x, q.z).height);
      }
      e.y = ground - .06;
      if (!fits(e, chunk, origin) || base.surfaceY - view.floorSurface(e.x, e.z).height > 22 ||
        !protectedFromRock(rows, e) || !protectedFromRock(newRocks, e) || sites.some(p => !clearFloor(view, [e], p, .6)) ||
        oceanRockHeight(e, e.x, e.z) < view.floorSurface(e.x, e.z).height + .5) continue;
      plan.elements.push(e); plan.newRockIds.push(e.id); plan.ridgeIds.push(e.id); newRocks.push(e);
    }
  }
  return newRocks;
}
function attach(base, chunks, plans, rows, view, origin) {
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci], plan = plans[ci], hosts = plan.elements.filter(e => plan.newRockIds.includes(e.id));
    for (const host of hosts) for (let i = 0; i < 5; i++) {
      const p = world(host, Math.cos(i * TAU / 5 + .17) * .17, Math.sin(i * TAU / 5 + .17) * .17);
      const y = oceanRockHeight(host, p.x, p.z), width = 1.8 + random(base.seed, `${host.id}:coral:${i}`) * .6;
      const morphotype = ['branching', 'table', 'fan', 'branching', 'table'][i];
      const e = { id: `${host.id}:coral:${i}`, kind: 'coral', attachmentId: host.id, morphotype,
        x: p.x, y, z: p.z, rotation: random(base.seed, `${host.id}:coral-turn:${i}`) * TAU,
        scale: { x: width, y: morphotype === 'table' ? .85 : 1.4, z: width * .72 } };
      if (y === null || y < view.floorSurface(e.x, e.z).height + .25 || !fits(e, chunk, origin) ||
        hardHeight(view, rows, e.x, e.z) > y + 1e-6 || plan.elements.filter(q => q.kind === 'coral').length >= LIVING_SHALLOWS_ELEMENT_LIMITS.coral ||
        [...rows, ...plan.elements].some(q => ['coral', 'algae'].includes(q.kind) &&
          Math.hypot(q.x - e.x, q.z - e.z) < .5 * (Math.max(q.scale.x, q.scale.z) + width) + .15)) continue;
      plan.elements.push(e);
    }
    for (const host of hosts) for (let i = 0; i < 3; i++) {
      const local = { x: Math.cos(i * TAU / 3 + .8) * .29, z: Math.sin(i * TAU / 3 + .8) * .29 }, srf = oceanRockSurface(host.profile, local.x, local.z);
      if (!srf) continue;
      const p = world(host, local.x, local.z), y = host.y + srf.height * host.scale.y, radius = .037;
      const nx = srf.normal.x / host.scale.x, ny = srf.normal.y / host.scale.y, nz = srf.normal.z / host.scale.z,
        length = Math.hypot(nx, ny, nz), c = Math.cos(host.rotation), s = Math.sin(host.rotation);
      const e = { id: `${host.id}:algae:${i}`, kind: 'algae', attachmentId: host.id, x: p.x, y, z: p.z,
        surfaceLocal: local, patchRadius: radius, rotation: host.rotation,
        normal: { x: (nx * c + nz * s) / length, y: ny / length, z: (-nx * s + nz * c) / length },
        scale: { x: host.scale.x * radius * 2, y: .018, z: host.scale.z * radius * 2 } };
      if (!fits(e, chunk, origin) || y < view.floorSurface(e.x, e.z).height + .12 ||
        hardHeight(view, rows, e.x, e.z) > y + 1e-6 || plan.elements.filter(q => q.kind === 'algae').length >= LIVING_SHALLOWS_ELEMENT_LIMITS.algae ||
        plan.elements.some(q => ['coral', 'algae'].includes(q.kind) && Math.hypot(q.x - e.x, q.z - e.z) <
          .5 * (Math.max(q.scale.x, q.scale.z) + Math.max(e.scale.x, e.scale.z)) + .1)) continue;
      plan.elements.push(e);
    }
  }
}
function addGrass(base, chunks, plans, rows, view, origin) {
  const obstacles = rows.filter(e => ['coral', 'driftwood', 'bottle'].includes(e.kind));
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci], plan = plans[ci], oldGrass = plan.elements.filter(e => e.kind === 'seagrass');
    const sites = livingShallowsSoftActivitySites(base.seed, chunk.cx, chunk.cz).filter(p => clearFloor(view, rows, p, .6));
    let amount = oldGrass.length;
    for (let gz = Math.ceil(chunk.bounds.minZ / 3); gz * 3 < chunk.bounds.maxZ; gz++) for (let gx = Math.ceil(chunk.bounds.minX / 3); gx * 3 < chunk.bounds.maxX; gx++) {
      if (amount >= LIVING_SHALLOWS_ELEMENT_LIMITS.seagrass) break;
      const x = gx * 3 + (random(base.seed, `grass:${gx},${gz}:x`) - .5) * .7,
        z = gz * 3 + (random(base.seed, `grass:${gx},${gz}:z`) - .5) * .7, f = shallowSeascapeFacies(plan, x, z);
      if (f.meadow < .6 || f.influence < 1 || Math.abs(Math.sin((x * .86 + z * .51) / 24)) < .12) continue;
      const width = 1.6 + random(base.seed, `grass:${gx},${gz}:width`) * .25;
      const e = { id: `shallow-seascape:${chunk.id}:grass:${gx},${gz}`, kind: 'seagrass', x, y: view.floorSurface(x, z).height, z,
        rotation: random(base.seed, `grass:${gx},${gz}:turn`) * TAU, scale: { x: width, y: .6 + random(base.seed, `grass:${gx},${gz}:height`) * .3, z: width } };
      const radius = width * .5;
      if (!fits(e, chunk, origin) || !ring(x, z, radius).every(p => {
        const depthM = base.surfaceY - view.floorSurface(p.x, p.z).height; return depthM >= 3 && depthM <= 20;
      }) || !clearFloor(view, rows, e, radius) || [[-.5, -.5], [-.5, .5], [.5, -.5], [.5, .5]].some(([lx, lz]) =>
        !clearFloor(view, rows, world(e, lx, lz), .05)) ||
        obstacles.some(q => Math.hypot(q.x - x, q.z - z) < Math.hypot(q.scale.x, q.scale.z) * .5 + radius + .2) ||
        sites.some(p => Math.hypot(p.x - x, p.z - z) < radius + .32) ||
        oldGrass.some(q => Math.hypot(q.x - x, q.z - z) < (q.scale.x + width) * .46)) continue;
      plan.elements.push(e); amount++;
    }
  }
}
function sandCorridor(base, plans, rows, view, origin) {
  for (const lengthM of [32, 24, 20, 16]) for (const lx of [164, 148, 180, 132, 196]) for (const lz of [80, 64, 44, 92, 32]) {
    const center = { x: origin.x + lx, z: origin.z + lz }, samples = []; let legal = true;
    for (let along = -lengthM / 2; along <= lengthM / 2 && legal; along += 2) for (const across of [-2, 0, 2]) {
      const p = { x: center.x + along, z: center.z + across }, depthM = base.surfaceY - view.floorSurface(p.x, p.z).height;
      if (depthM < 3 || depthM > 22 || !clearFloor(view, rows, p, .6) || rows.some(e =>
        ['coral', 'seagrass'].includes(e.kind) && Math.hypot(e.x - p.x, e.z - p.z) < Math.hypot(e.scale.x, e.scale.z) * .5 + .6)) { legal = false; break; }
      samples.push({ ...p, y: view.floorSurface(p.x, p.z).height });
    }
    if (legal) return { center, lengthM, openingM: 4, heading: 0, bodyRadiusM: .6, spacingM: 2, samples, clearSamples: samples.length };
  }
  return null;
}
function addMissingProps(base, chunks, plans, rows, view, origin, corridor) {
  for (const kind of ['driftwood', 'bottle']) {
    if (plans.some(p => p.elements.some(e => e.kind === kind))) continue;
    let placed = false;
    for (const offsetZ of [7, -7, 11, -11]) for (const offsetX of [-8, 0, 8, -14, 14]) {
      if (placed) break;
      const x = corridor.center.x + offsetX, z = corridor.center.z + offsetZ;
      const ci = chunks.findIndex(c => x >= c.bounds.minX && x < c.bounds.maxX && z >= c.bounds.minZ && z < c.bounds.maxZ);
      if (ci < 0) continue;
      const chunk = chunks[ci], plan = plans[ci], e = { id: `shallow-seascape:${chunk.id}:${kind}`, kind, variant: 0,
        x, y: 0, z, rotation: random(base.seed, `${chunk.id}:${kind}:turn`) * TAU,
        scale: kind === 'bottle' ? { x: .32, y: .078, z: .078 } : { x: 1.6, y: .15, z: .23 },
        physicalState: kind === 'bottle' ? 'grounded-flooded' : 'grounded',
        ...(kind === 'bottle' ? { flooded: true, sealed: false } : {}) };
      const radius = Math.hypot(e.scale.x, e.scale.z) * .5, sites = livingShallowsSoftActivitySites(base.seed, chunk.cx, chunk.cz);
      const depthM = base.surfaceY - view.floorSurface(x, z).height;
      if (!fits(e, chunk, origin) || depthM < 3 || depthM > 23 || !clearFloor(view, rows, e, radius) ||
        sites.some(p => Math.hypot(p.x - x, p.z - z) < radius + 3.2) || rows.some(q =>
          q.kind !== 'rubble' && Math.hypot(q.x - x, q.z - z) < radius + Math.hypot(q.scale.x, q.scale.z) * .5 + .3)) continue;
      const mesh = sceneElementMesh(kind, 0);
      if (mesh.positions.some((_, i) => {
        if (i % 3) return false;
        const p = livingShallowsPropWorldVertex(e, mesh.positions, i);
        return hardHeight(view, rows, p.x, p.z) > view.floorSurface(p.x, p.z).height + 1e-6;
      })) continue;
      e.y = livingShallowsPropGroundY(view, e); plan.elements.push(e); rows.push(e); placed = true;
    }
    if (!placed) throw new RangeError(`Shallow group ${chunks[0].id} has no supported sparse ${kind} discovery site.`);
  }
}
function summary(base, plan) {
  const habitats = { reef: 0, sand: 0, seagrass: 0, slope: 0, 'authored-reef': 0 }; let minDepthM = Infinity, maxDepthM = -Infinity;
  for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++) {
    const s = sampleLivingShallowSeascape(base, plan, plan.cx * OWNER + 4 + ix * 8, plan.cz * OWNER + 4 + iz * 8);
    habitats[s.habitat]++; minDepthM = Math.min(minDepthM, s.depthM); maxDepthM = Math.max(maxDepthM, s.depthM);
  }
  const ranked = Object.keys(habitats).sort((a, b) => habitats[b] - habitats[a]);
  return { samples: 64, habitats, primary: ranked[0], secondary: habitats[ranked[1]] >= 13 ? ranked[1] : null, minDepthM, maxDepthM };
}
function build(base, chunks, cx, cz, origin) {
  const rows = halo(base, cx, cz), mask = protection(rows), skeleton = { group: { cx, cz } }, baseline = [], unit = [];
  for (let iz = 0; iz <= DEPTH; iz++) for (let ix = 0; ix <= WIDTH; ix++) {
    const x = origin.x + ix, z = origin.z + iz, y = base.floorVertex(x, z), f = shallowSeascapeFacies(skeleton, x, z);
    const target = -5.3 * f.reef - 7.3 * f.sand - 6.5 * f.meadow - 11.5 * f.slope +
      .35 * Math.sin((x * .72 + z * .69) / 90 + random(base.seed, 'bed-phase') * TAU);
    baseline.push(y); unit.push((target - y) * f.influence * mask(x, z));
  }
  const amplitude = amplitudeLimit(baseline, unit), heights = baseline.map((y, i) => Math.fround(y + unit[i] * amplitude));
  const measured = measurements(heights, baseline, WIDTH, DEPTH, ROW, origin, base.surfaceY);
  if (measured.deltaSpanM < .75 || measured.maxSlope > .65 || measured.minDepthM < 3)
    throw new RangeError(`Shallow group ${cx},${cz} cannot support a complete gentle shared bed around its original hosts.`);
  const group = { id: `shallow-seascape:${cx},${cz}`, cx, cz, seed: base.seed, origin, ownerIds: chunks.map(c => c.id),
    widthM: WIDTH, depthM: DEPTH, outerGuardM: GUARD, gridSizeX: ROW, gridSizeZ: DEPTH + 1,
    facies: ['reef', 'sand', 'meadow', 'slope'], ...measured, controls: { amplitude, protectionRampM: 6 }, addedCoverElements: [] };
  const plans = chunks.map(chunk => {
    const local = [], old = [], ox = (chunk.cx - cx) * OWNER, oz = (chunk.cz - cz) * OWNER;
    for (let iz = 0; iz <= OWNER; iz++) for (let ix = 0; ix <= OWNER; ix++) {
      const i = (oz + iz) * ROW + ox + ix; local.push(heights[i]); old.push(baseline[i]);
    }
    return { version: 6, id: chunk.id, cx: chunk.cx, cz: chunk.cz, seed: base.seed, theme: 'complete-shallow-seascape', baseStamp: stamp(chunk), group,
      floorPatch: { gridSize: 65, spacingM: 1, widthM: OWNER, boundaryGuardM: 0, groupOuterGuardM: GUARD, heights: local,
        ...measurements(local, old, OWNER, OWNER, 65, chunk.origin, base.surfaceY) },
      elements: [...chunk.elements], retainedRockIds: chunk.elements.filter(e => e.kind === 'rock').map(e => e.id), newRockIds: [], ridgeIds: [],
      overview: { center: { x: chunk.origin.x + 32, z: chunk.origin.z + 32 }, heading: 0, extentM: 52 },
      displayScope: 'one finite twelve-owner bed and actual native scene descriptors; ecological births and resource inventories are separate atomic records' };
  });
  const view = floorView(base, plans);
  for (const plan of plans) plan.elements = plan.elements.map(e => e.kind === 'rubble' ? { ...e, y: view.floorSurface(e.x, e.z).height } : e);
  const newRocks = addRocks(base, chunks, plans, rows, view, origin), actualRows = [...rows, ...newRocks];
  attach(base, chunks, plans, actualRows, view, origin); addGrass(base, chunks, plans, [...actualRows, ...plans.flatMap(p => p.elements.filter(e => e.kind === 'coral'))], view, origin);
  const allRows = plans.flatMap(p => p.elements), nativeIds = new Set(chunks.flatMap(c => c.elements.map(e => e.id)));
  group.addedCoverElements = allRows.filter(e => !nativeIds.has(e.id) && ['rock', 'seagrass'].includes(e.kind));
  const outside = rows.filter(e => !nativeIds.has(e.id)), corridor = sandCorridor(base, plans, [...allRows, ...outside], view, origin);
  if (corridor) addMissingProps(base, chunks, plans, [...allRows, ...outside], view, origin, corridor);
  const added = kind => allRows.filter(e => e.kind === kind && !nativeIds.has(e.id)).length;
  group.metrics = { addedRockCount: added('rock'), addedCoralCount: added('coral'), addedAlgaeCount: added('algae'), addedGrassCount: added('seagrass'),
    rockCount: allRows.filter(e => e.kind === 'rock').length, coralCount: allRows.filter(e => e.kind === 'coral').length,
    grassCount: allRows.filter(e => e.kind === 'seagrass').length,
    driftwoodCount: plans.reduce((n, p) => n + p.elements.filter(e => e.kind === 'driftwood').length, 0),
    bottleCount: plans.reduce((n, p) => n + p.elements.filter(e => e.kind === 'bottle').length, 0) };
  if (!corridor || group.metrics.addedRockCount < 3 || group.metrics.addedCoralCount < 3 || group.metrics.addedGrassCount < 16)
    throw new RangeError(`Shallow group ${cx},${cz} has no admitted complete rock-cluster, attached coral, open sand and rooted meadow composition (${stamp(group.metrics)}; corridor ${!!corridor}).`);
  group.corridor = corridor;
  group.route = routeOffsets.map(p => ({ ...p, x: p.id === 'shallow-scene-sand' ? corridor.center.x : origin.x + p.x,
    z: p.id === 'shallow-scene-sand' ? corridor.center.z : origin.z + p.z }));
  for (const plan of plans) {
    if (Object.entries(LIVING_SHALLOWS_ELEMENT_LIMITS).some(([kind, limit]) => plan.elements.filter(e => e.kind === kind).length > limit))
      throw new RangeError(`Shallow owner ${plan.id} exceeds an original native element budget.`);
    plan.habitatComposition = summary(base, plan);
  }
  return freeze(plans);
}
function model(generator, cx, cz) {
  const { base, chunks, origin } = source(generator, cx, cz); let cache = models.get(base);
  if (!cache) { cache = new Map(); models.set(base, cache); }
  const key = `${cx},${cz}`;
  if (!cache.has(key)) {
    let entry; try { entry = { plans: build(base, chunks, cx, cz, origin) }; }
    catch (error) { if (!(error instanceof RangeError)) throw error; entry = { declined: error.message }; }
    cache.set(key, entry); if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }
  const entry = cache.get(key); cache.delete(key); cache.set(key, entry);
  if (entry.declined) throw new RangeError(entry.declined); return entry.plans;
}
/** Publishing is the caller's job after all twelve truly absent owner records
 * have admitted their real ecological births and one durable atomic save. */
export function createLivingShallowSeascapePlans(base, cx, cz) { return model(base, cx, cz); }
export function validateLivingShallowSeascapePlan(base, plan) {
  try {
    if (!plan || plan.version !== 6 || plan.theme !== 'complete-shallow-seascape' || !plan.group ||
      !Array.isArray(plan.floorPatch?.heights) || plan.id !== `${plan.cx},${plan.cz}`) return false;
    const expected = model(base, plan.group.cx, plan.group.cz).find(p => p.id === plan.id);
    return !!expected && stamp(expected) === stamp(plan);
  } catch { return false; }
}
function coverRows(base, plan, x, z) {
  let index = coverIndices.get(plan.group);
  if (!index) {
    let cache = baseCoverIndices.get(base);
    if (!cache) { cache = new Map(); baseCoverIndices.set(base, cache); }
    index = cache.get(plan.group.id);
    if (!index) {
      index = new Map();
      // The base world is immutable. Survey its finite 8 by 4 native source
      // halo once, rather than rebuilding nine complete owners per terrain
      // vertex. Only admitted canonical groups reach the public facade.
      const rows = [...halo(base, plan.group.cx, plan.group.cz).filter(e => e.kind === 'rock' || e.kind === 'seagrass'),
        ...plan.group.addedCoverElements];
      for (const e of rows) {
      const reach = Math.hypot(e.scale.x, e.scale.z) * .5 + 8;
      for (let iz = Math.floor((e.z - reach) / 8); iz <= Math.floor((e.z + reach) / 8); iz++)
        for (let ix = Math.floor((e.x - reach) / 8); ix <= Math.floor((e.x + reach) / 8); ix++) {
          const key = `${ix},${iz}`; if (!index.has(key)) index.set(key, []); index.get(key).push(e);
        }
      }
      cache.set(plan.group.id, index); if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    }
    coverIndices.set(plan.group, index);
  }
  return index.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? [];
}
export function sampleLivingShallowSeascape(generator, plan, x, z) {
  const base = generator.baseGenerator ?? generator, original = base.sample(x, z), f = shallowSeascapeFacies(plan, x, z);
  if (!f.influence) return original;
  const bed = sampleLivingSeabedRelief(base, plan, x, z), floor = livingSeabedFloorSurface(base, plan, x, z).height;
  let hard = 0, grass = 0, bareRock = false;
  for (const e of coverRows(base, plan, x, z)) {
    const distance = Math.hypot(e.x - x, e.z - z), reach = Math.hypot(e.scale.x, e.scale.z) * .5 + 8;
    if (distance > reach) continue;
    if (e.kind === 'rock') {
      const y = oceanRockHeight(e, x, z); if (y !== null && y > floor + .06) { bareRock = true; hard = 1; }
      hard = Math.max(hard, .30 * smooth(1 - Math.max(0, distance - Math.max(e.scale.x, e.scale.z) * .5) / 8));
    } else grass = Math.max(grass, .92 * smooth(1 - Math.max(0, distance - e.scale.x * .5) / 5));
  }
  if (bareRock) grass = 0;
  const mix = (a, b) => a + (b - a) * f.influence, rockiness = mix(original.rockiness, hard),
    seagrassSuitability = mix(original.seagrassSuitability, grass), sandOpening = mix(original.sandOpening, (1 - hard) * (1 - grass));
  return { ...bed, rockiness, seagrassSuitability, sandOpening,
    substrate: f.influence < .5 ? original.substrate : bareRock ? 'rock' : 'sand',
    habitat: bed.depthM > 18.5 ? 'slope' : f.influence < .5 ? original.habitat : bareRock ? 'reef' : grass > .4 ? 'seagrass' : 'sand' };
}
