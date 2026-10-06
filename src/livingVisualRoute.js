import { speciesCatalog } from './species.js';
import { oceanSlopeSpeciesCatalog } from './oceanSlopeSpecies.js';
import { oceanPelagicSpeciesCatalog } from './oceanPelagicSpecies.js';
import { openWaterSpeciesCatalog } from './oceanOpenWaterSpecies.js';
import { oceanRockHeight } from './oceanRockShape.js';

const catalogDefault = new Map([...speciesCatalog, ...oceanSlopeSpeciesCatalog,
  ...oceanPelagicSpeciesCatalog, ...openWaterSpeciesCatalog].map(species => [species.id, species]));
const point = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
const copy = value => ({ x: value.x, y: value.y, z: value.z });
const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const owner = value => `${Math.floor(value.x / 64)},${Math.floor(value.z / 64)}`;
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const empty = reason => freeze({ status: 'empty', reason, scope: 'actual-loaded-reef-edge',
  sourceChunkIds: [], sourceElementIds: [], sourceAgentIds: [], stops: [], path: [] });
const interpolate = (a, b, fraction) => Object.fromEntries(['x', 'y', 'z'].map(axis =>
  [axis, a[axis] + (b[axis] - a[axis]) * fraction]));

function framed(position, target, reference, radius = 0, fov = 49, aspect = 16 / 9) {
  const dx = target.x - position.x, dy = target.y - position.y, dz = target.z - position.z;
  const length = Math.hypot(dx, dy, dz), flat = Math.hypot(dx, dz);
  if (!(length > .1 && flat > .1)) return false;
  const forward = { x: dx / length, y: dy / length, z: dz / length };
  const right = { x: -dz / flat, z: dx / flat };
  const up = { x: -dx * dy / (flat * length), y: flat / length, z: -dz * dy / (flat * length) };
  const r = { x: reference.x - position.x, y: reference.y - position.y, z: reference.z - position.z };
  const depth = r.x * forward.x + r.y * forward.y + r.z * forward.z;
  const width = r.x * right.x + r.z * right.z, height = r.x * up.x + r.y * up.y + r.z * up.z;
  const tangent = Math.tan(fov * Math.PI / 360);
  return depth > radius + .1 && Math.abs(width) + radius < depth * tangent * aspect &&
    Math.abs(height) + radius < depth * tangent;
}

function reference(element, generator) {
  const base = generator.heightAt(element.x, element.z);
  return { x: element.x, y: element.kind === 'rock' ? base + .08
    : Math.max(element.y, generator.floorSurface(element.x, element.z).height) + element.scale.y * .55, z: element.z };
}

function clearReference(position, target, generator) {
  // Finite height-field references exclude intervening bed/rock. This is not
  // a mesh/transparent-leaf occlusion certificate or a rendered image review.
  for (let i = 1; i < 12; i++) {
    const p = interpolate(position, target, i / 12), support = generator.heightAt(p.x, p.z);
    if (!Number.isFinite(support) || p.y < support + .015) return false;
  }
  return true;
}

function sedimentOpening(center, grass, generator, loaded) {
  const first = grass[0], preferred = Math.atan2(first.z - center.z, first.x - center.x);
  for (const radius of [6, 9, 12]) for (const turn of [0, .7, -.7, 1.4, -1.4, Math.PI]) {
    const angle = preferred + turn, p = { x: center.x + radius * Math.cos(angle), z: center.z + radius * Math.sin(angle) };
    if (!loaded.has(owner(p))) continue;
    let valid = true;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, z = p.z + dz, sample = generator.sample(x, z);
      const floor = generator.floorSurface(x, z).height, support = generator.heightAt(x, z);
      if (!loaded.has(owner({ x, z })) || !Number.isFinite(floor) || !Number.isFinite(support) ||
          sample.substrate === 'rock' || support - floor > .035 ||
          grass.some(root => Math.hypot(root.x - x, root.z - z) < Math.max(root.scale.x, root.scale.z) * .55)) { valid = false; break; }
    }
    if (valid) return { ...p, y: generator.floorSurface(p.x, p.z).height + .04 };
  }
  return null;
}

/** Build an observation of current public descriptors and actual living fish.
 * Reading at most nine explicit loaded owners never creates or moves a life
 * record. References remain world metres, independent of a renderer origin.
 * Empty means no complete, safely framed reef/grass/sediment combination was
 * found in the finite window; it does not substitute decorative organisms. */
export function createLivingVisualRoute({ generator, agents = [], loadedChunkIds = [], cameraPosition,
  surfaceY = 8, safeHeight, catalog = catalogDefault, fov = 49, aspect = 16 / 9 } = {}) {
  try {
    if (!point(cameraPosition) || !Array.isArray(agents) || !Array.isArray(loadedChunkIds) ||
        !loadedChunkIds.length || loadedChunkIds.length > 9 || !Number.isFinite(surfaceY) ||
        !Number.isFinite(fov) || fov < 25 || fov > 90 || !Number.isFinite(aspect) || aspect <= 0 || aspect > 8 ||
        typeof generator?.chunk !== 'function' || typeof generator.sample !== 'function' ||
        typeof generator.floorSurface !== 'function') return empty('invalid-loaded-input');
    const loaded = new Set(), elements = [], supportElements = [], elementIds = new Set();
    for (const id of loadedChunkIds) {
      if (typeof id !== 'string' || !/^-?\d+,-?\d+$/.test(id) || loaded.has(id)) return empty('invalid-loaded-owners');
      const coordinates = id.split(',').map(Number);
      if (!coordinates.every(Number.isSafeInteger) || coordinates.join(',') !== id) return empty('invalid-loaded-owners');
      loaded.add(id);
      const chunk = generator.chunk(...coordinates);
      if (chunk?.id !== id || !Array.isArray(chunk.elements)) return empty('missing-public-chunk');
      supportElements.push(...chunk.elements.filter(element => ['rock', 'rubble'].includes(element?.kind) && point(element) &&
        ['x', 'y', 'z'].every(axis => Number.isFinite(element.scale?.[axis]) && element.scale[axis] > 0)));
      for (const element of chunk.elements) if (['rock', 'coral', 'seagrass'].includes(element?.kind) &&
        point(element) && typeof element.id === 'string' && element.id && !elementIds.has(element.id) && owner(element) === id &&
        ['x', 'y', 'z'].every(axis => Number.isFinite(element.scale?.[axis]) && element.scale[axis] > 0)) {
        elements.push(element); elementIds.add(element.id);
      }
    }
    const publicGenerator = generator;
    const heightAt = typeof publicGenerator.heightAt === 'function' ? (x, z) => publicGenerator.heightAt(x, z) : (x, z) => {
      let height = publicGenerator.floorSurface(x, z).height;
      for (const element of supportElements) {
        const top = oceanRockHeight(element, x, z); if (top !== null) height = Math.max(height, top);
      }
      return height;
    };
    generator = { sample: (x, z) => publicGenerator.sample(x, z),
      floorSurface: (x, z) => publicGenerator.floorSurface(x, z), heightAt,
      ...(typeof publicGenerator.heightForCamera === 'function' ? { heightForCamera: (x, z) => publicGenerator.heightForCamera(x, z) } : {}) };
    const lookup = id => catalog instanceof Map ? catalog.get(id) : catalog.find(species => species.id === id);
    const seen = new Set(), fish = agents.filter(agent => {
      if (agent?.alive !== true || !point(agent.position) || typeof agent.id !== 'string' || !agent.id || seen.has(agent.id) ||
          !loaded.has(agent.regionId) || owner(agent.position) !== agent.regionId || !Number.isFinite(agent.sizeM) || agent.sizeM < .06 ||
          lookup(agent.speciesId)?.kind !== 'fish') return false;
      seen.add(agent.id); return true;
    });
    const rocks = elements.filter(e => e.kind === 'rock'), corals = elements.filter(e => e.kind === 'coral');
    const grass = elements.filter(e => e.kind === 'seagrass');
    if (!rocks.length || corals.length < 3 || !grass.length) return empty('missing-reef-grass-composition');
    if (!fish.length) return empty('no-live-fish-in-loaded-window');
    const candidates = rocks.map(rock => {
      const nearbyCorals = corals.filter(e => horizontal(e, rock) <= 12), nearbyFish = fish.filter(a => horizontal(a.position, rock) <= 14);
      const nearGrass = grass.filter(e => horizontal(e, rock) <= 14);
      return { rock, nearbyCorals, nearbyFish, nearGrass, score: nearbyCorals.length * 3 + nearGrass.length * .08 +
        nearbyFish.reduce((sum, a) => sum + Math.min(1, a.sizeM) * 20, 0) - horizontal(rock, cameraPosition) * .08 };
    }).filter(c => c.nearbyCorals.length >= 3 && c.nearbyFish.length && c.nearGrass.length)
      .sort((a, b) => b.score - a.score || a.rock.id.localeCompare(b.rock.id)).slice(0, 8);
    if (!candidates.length) return empty('no-complete-28m-core');
    const guard = typeof safeHeight === 'function' ? safeHeight : typeof generator.heightForCamera === 'function'
      ? (x, z) => generator.heightForCamera(x, z) : (x, z) => generator.heightAt(x, z);
    for (const candidate of candidates) {
      const center = { x: candidate.rock.x, y: generator.floorSurface(candidate.rock.x, candidate.rock.z).height, z: candidate.rock.z };
      const nearGrass = candidate.nearGrass.sort((a, b) => horizontal(a, center) - horizontal(b, center) || a.id.localeCompare(b.id));
      const opening = sedimentOpening(center, nearGrass, generator, loaded); if (!opening) continue;
      const reef = candidate.nearbyCorals.sort((a, b) => horizontal(a, center) - horizontal(b, center) || a.id.localeCompare(b.id)).slice(0, 8);
      const sourceRocks = rocks.filter(e => horizontal(e, center) <= 14).sort((a, b) => horizontal(a, center) - horizontal(b, center)).slice(0, 4);
      const refs = [...sourceRocks, ...reef].map(element => ({ element, point: reference(element, generator) }));
      const grassRefs = nearGrass.slice(0, 8).map(element => ({ element, point: reference(element, generator) }));
      const preferred = Math.atan2(cameraPosition.z - center.z, cameraPosition.x - center.x);
      for (const turn of [0, .8, -.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
        const heading = preferred + turn, forward = { x: -Math.cos(heading), z: -Math.sin(heading) };
        const side = { x: -forward.z, z: forward.x }, stops = [], visibleIds = new Set(), usedElements = new Set();
        for (const across of [-6, 0, 6]) {
          const x = center.x - forward.x * 9 + side.x * across, z = center.z - forward.z * 9 + side.z * across;
          if (!loaded.has(owner({ x, z }))) break;
          const floor = generator.floorSurface(x, z).height, solid = guard(x, z);
          const y = Math.max(floor + 2.7, solid + .7), position = { x, y, z };
          const target = { x: center.x + forward.x * .7, y: center.y + 1, z: center.z + forward.z * .7 };
          if (!point(position) || y > surfaceY - .6) break;
          const inReef = refs.filter(ref => framed(position, target, ref.point, 0, fov, aspect) && clearReference(position, ref.point, generator));
          const inGrass = grassRefs.filter(ref => framed(position, target, ref.point, 0, fov, aspect) && clearReference(position, ref.point, generator));
          const inFish = candidate.nearbyFish.filter(agent => {
            const p = { ...agent.position, y: agent.position.y + agent.sizeM * .12 };
            return framed(position, target, p, agent.sizeM * .2, fov, aspect) && clearReference(position, p, generator) &&
              720 / (2 * Math.tan(fov * Math.PI / 360)) * agent.sizeM / distance(position, p) >= 5;
          });
          if (inReef.filter(ref => ref.element.kind === 'coral').length < 3 || !inReef.some(ref => ref.element.kind === 'rock') ||
              !inGrass.length || !inFish.length || !framed(position, target, opening, 0, fov, aspect)) break;
          [...inReef, ...inGrass].forEach(ref => usedElements.add(ref.element.id)); inFish.forEach(a => visibleIds.add(a.id));
          stops.push({ id: ['reef-edge-wide', 'reef-edge-life', 'reef-edge-grass'][stops.length], position, target });
        }
        if (stops.length !== 3) continue;
        const path = [], ceiling = surfaceY - .6; let failed = false;
        for (let segment = 0; segment < 2; segment++) {
          const start = stops[segment], end = stops[segment + 1], count = Math.ceil(horizontal(start.position, end.position) / .5);
          for (let i = segment === 0 ? 0 : 1; i <= count; i++) {
            const position = interpolate(start.position, end.position, i / count), target = interpolate(start.target, end.target, i / count);
            const support = guard(position.x, position.z), floor = generator.floorSurface(position.x, position.z).height;
            if (!loaded.has(owner(position)) || !Number.isFinite(support) || !Number.isFinite(floor)) { failed = true; break; }
            position.y = Math.max(position.y, support + .7, floor + 2.7);
            if (position.y > ceiling) { failed = true; break; }
            path.push({ position, target });
          }
          if (failed) break;
        }
        if (failed) continue;
        // A single upper envelope keeps interpolation between finite terrain
        // samples above their support, without vertical sawtooth camera motion.
        const altitude = Math.max(...path.map(row => row.position.y));
        path.forEach(row => { row.position.y = altitude; }); stops.forEach(stop => { stop.position.y = altitude; });
        // References belong to the final safe altitude, not an earlier pose
        // that was subsequently lifted above intervening terrain.
        visibleIds.clear(); usedElements.clear();
        for (const stop of stops) {
          const inReef = refs.filter(ref => framed(stop.position, stop.target, ref.point, 0, fov, aspect) && clearReference(stop.position, ref.point, generator));
          const inGrass = grassRefs.filter(ref => framed(stop.position, stop.target, ref.point, 0, fov, aspect) && clearReference(stop.position, ref.point, generator));
          const inFish = candidate.nearbyFish.filter(agent => {
            const p = { ...agent.position, y: agent.position.y + agent.sizeM * .12 };
            return framed(stop.position, stop.target, p, agent.sizeM * .2, fov, aspect) && clearReference(stop.position, p, generator) &&
              720 / (2 * Math.tan(fov * Math.PI / 360)) * agent.sizeM / distance(stop.position, p) >= 5;
          });
          if (inReef.filter(ref => ref.element.kind === 'coral').length < 3 || !inReef.some(ref => ref.element.kind === 'rock') ||
              !inGrass.length || !inFish.length || !framed(stop.position, stop.target, opening, 0, fov, aspect)) { failed = true; break; }
          [...inReef, ...inGrass].forEach(ref => usedElements.add(ref.element.id)); inFish.forEach(a => visibleIds.add(a.id));
        }
        if (failed) continue;
        const pathLengthM = path.slice(1).reduce((sum, row, i) => sum + distance(row.position, path[i].position), 0);
        const sourceElementIds = [...usedElements].sort(), sourceAgentIds = [...visibleIds].sort();
        const sources = elements.filter(e => usedElements.has(e.id));
        return freeze({ status: 'ready', reason: null, scope: 'actual-loaded-reef-edge', sourceChunkIds: [...new Set([
          ...sources.map(owner), ...fish.filter(a => visibleIds.has(a.id)).map(a => a.regionId)])].sort(),
          sourceElementIds, sourceAgentIds, coreCenter: center, coreDiameterM: 28, sedimentOpening: opening, stops, path, pathLengthM,
          evidence: { directOwnerReads: loaded.size, maxOwnerReads: 9, candidateCores: candidates.length,
            positionSampleSpacingM: .5, horizontalPathLengthM: pathLengthM, clearanceM: .7,
            framing: 'finite-world-reference-frustum-and-bed-rock-height-probes',
            actualRenderedOcclusion: false, movingAnimalsRemainInFrame: false, fishScaleChanged: false } });
      }
    }
    return empty('no-safe-framed-continuous-path');
  } catch { return empty('public-source-query-failed'); }
}

/** Sample only the admitted polyline. Camera playback has no ecology clock or
 * animal input; its normalized progress does not require a rendering origin. */
export function sampleLivingVisualRoute(route, progress) {
  if (route?.status !== 'ready' || !Array.isArray(route.path) || route.path.length < 2 || !Number.isFinite(progress) ||
      route.path.some(row => !point(row?.position) || !point(row?.target))) return null;
  const p = Math.max(0, Math.min(1, progress)), lengths = route.path.slice(1).map((row, i) => distance(row.position, route.path[i].position));
  const total = lengths.reduce((sum, length) => sum + length, 0); if (!(total > 0)) return null;
  let remaining = p * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] > 0 ? Math.max(0, Math.min(1, remaining / lengths[i])) : 0;
      return { position: interpolate(route.path[i].position, route.path[i + 1].position, t),
        target: interpolate(route.path[i].target, route.path[i + 1].target, t) };
    }
    remaining -= lengths[i];
  }
  return null;
}
