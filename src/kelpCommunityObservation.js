import { oceanRockHeight } from './oceanRockShape.js';
import { kelpStipePosition } from './kelpHabitat.js';

const CELL_M = 64, TAU = Math.PI * 2, YAW_COUNT = 8;
const finitePoint = point => point && ['x', 'y', 'z'].every(axis => Number.isFinite(point[axis]));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const horizontalDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const mean = points => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  z: points.reduce((sum, p) => sum + p.z, 0) / points.length });
const regionOf = point => `${Math.floor(point.x / CELL_M)},${Math.floor(point.z / CELL_M)}`;
function coordinates(id) {
  if (typeof id !== 'string' || !/^-?\d+,-?\d+$/.test(id)) return null;
  const pair = id.split(',').map(Number);
  return pair.every(Number.isSafeInteger) ? pair : null;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const copyPoint = point => ({ x: point.x, y: point.y, z: point.z });

// Compare complete finite reference spheres against the actual vertical FOV
// and horizontal aspect. This is framing evidence, not an occlusion renderer.
function visible(reference, eye, target, tangentY, tangentX, visibilityM, verticalBounds = [-1, 1]) {
  const delta = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
  const length = Math.hypot(delta.x, delta.y, delta.z), horizontal = Math.hypot(delta.x, delta.z);
  if (!(length > 0) || !(horizontal > 0)) return false;
  const forward = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
  const right = { x: -forward.z / (horizontal / length), y: 0, z: forward.x / (horizontal / length) };
  const up = { x: -forward.y * right.z, y: forward.x * right.z - forward.z * right.x,
    z: forward.y * right.x };
  const offset = { x: reference.position.x - eye.x, y: reference.position.y - eye.y, z: reference.position.z - eye.z };
  const dot = vector => offset.x * vector.x + offset.y * vector.y + offset.z * vector.z;
  const depth = dot(forward), radius = reference.radiusM;
  return depth > radius + .04 && distance(eye, reference.position) + radius <= visibilityM &&
    Math.abs(dot(right)) + radius * Math.sqrt(1 + tangentX ** 2) <= depth * tangentX &&
    dot(up) + radius * Math.sqrt(1 + tangentY ** 2) <= depth * tangentY * verticalBounds[1] &&
    dot(up) - radius * Math.sqrt(1 + tangentY ** 2) >= depth * tangentY * verticalBounds[0];
}

/** A finite three-stop view of an already loaded, living kelp community.
 * This reads real scenery and public animals without adding, resizing or moving
 * actors. Lower-stipe references describe the forest floor view; they do not
 * claim that an entire tall kelp crown is visible through the supplied water.
 * Positions remain in the observer's current cell, so selecting a stop needs
 * no different ecology owners. No observations are stored by this helper. */
export function createKelpCommunityObservationPlan({ generator, position, agents, loadedChunkIds, regionId,
  visibilityM = 14, surfaceY = generator?.surfaceY, aspect = 1, fovDeg = 50 } = {}) {
  try {
    if (!generator || typeof generator.chunk !== 'function' || typeof generator.floorSurface !== 'function' ||
        !finitePoint(position) || !Array.isArray(agents) || !Array.isArray(loadedChunkIds) ||
        !Number.isFinite(surfaceY) || !Number.isFinite(visibilityM) || visibilityM < 7 || visibilityM > 100 ||
        !Number.isFinite(aspect) || aspect <= 0 || aspect > 8 || !Number.isFinite(fovDeg) || fovDeg < 20 || fovDeg > 100) return null;
    const currentRegion = regionOf(position), owner = coordinates(currentRegion);
    if (!owner || (regionId !== undefined && regionId !== currentRegion)) return null;
    const loaded = [...new Set(loadedChunkIds)].sort();
    if (!loaded.length || loaded.length > 9 || !loaded.includes(currentRegion) || loaded.some(id => !coordinates(id))) return null;
    // A stop never requests an unloaded neighbouring support owner. The input
    // window must be the bounded current 3 x 3 rather than remote arbitrary IDs.
    if (loaded.some(id => { const [cx, cz] = coordinates(id); return Math.abs(cx - owner[0]) > 1 || Math.abs(cz - owner[1]) > 1; })) return null;
    const loadedSet = new Set(loaded), elements = [];
    for (const id of loaded) {
      const [cx, cz] = coordinates(id), chunk = generator.chunk(cx, cz);
      if (!chunk || chunk.id !== id || !Array.isArray(chunk.elements)) return null;
      elements.push(...chunk.elements);
    }
    const byId = new Map(elements.map(element => [element.id, element]));
    const rocks = elements.filter(element => element.kind === 'rock' && finitePoint(element) &&
      element.scale && ['x', 'y', 'z'].every(axis => Number.isFinite(element.scale[axis]) && element.scale[axis] > 0) && Number.isFinite(element.rotation));
    const rockIds = new Set(rocks.map(rock => rock.id));
    const roots = elements.filter(element => element.kind === 'kelp' && finitePoint(element) &&
      element.anchor && finitePoint(element.anchor) && Number.isFinite(element.anchor.lengthM) && element.anchor.lengthM > 0 &&
      rockIds.has(element.hostId) && finitePoint({ x: element.anchor.x, y: element.anchor.y, z: element.anchor.z }) &&
      Math.abs(element.x - element.anchor.x) < 1e-8 && Math.abs(element.y - element.anchor.y) < 1e-8 && Math.abs(element.z - element.anchor.z) < 1e-8 &&
      Number.isFinite(oceanRockHeight(byId.get(element.hostId), element.x, element.z)));
    if (!roots.length) return null;
    roots.sort((a, b) => a.id.localeCompare(b.id));
    const rootGroups = new Map();
    for (const root of roots) {
      if (!rootGroups.has(root.hostId)) rootGroups.set(root.hostId, []);
      rootGroups.get(root.hostId).push(root);
    }
    const rootById = new Map(roots.map(root => [root.id, root]));
    const live = agents.filter(agent => agent?.alive === true && typeof agent.id === 'string' && finitePoint(agent.position) &&
      Number.isFinite(agent.sizeM) && agent.sizeM > 0 && loadedSet.has(agent.regionId) && regionOf(agent.position) === agent.regionId)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (new Set(live.map(agent => agent.id)).size !== live.length) return null;
    const contexts = new Map();
    for (const agent of live) if (rootById.has(agent.hostSceneryId) && agent.hostAnchor && finitePoint(agent.hostAnchor) &&
        Number.isFinite(agent.hostAnchor.lengthM) && agent.hostAnchor.lengthM > 0 && Number.isFinite(agent.hostTimeSec)) {
      const root = rootById.get(agent.hostSceneryId);
      if (horizontalDistance(agent.hostAnchor, root.anchor) < 1e-8 && Math.abs(agent.hostAnchor.y - root.anchor.y) < 1e-8 &&
          !contexts.has(root.id)) contexts.set(root.id, { anchor: { ...agent.hostAnchor }, timeSec: agent.hostTimeSec,
        environment: { ...(agent.hostEnvironment ?? agent.localEnvironment ?? {}) } });
    }
    const rootContext = root => contexts.get(root.id) ?? { anchor: { ...root.anchor }, timeSec: 0, environment: { currentMps: 0 } };
    const stipeReference = (root, fraction) => {
      const context = rootContext(root);
      return { kind: fraction === 0 ? 'root' : 'lower-stipe', id: root.id, fraction, frondIndex: 0,
        position: kelpStipePosition(context.anchor, fraction, context.timeSec, context.environment, 0), radiusM: .10,
        referenceTimeSec: context.timeSec, referenceEnvironment: { ...context.environment } };
    };
    const tangentY = Math.tan(fovDeg * Math.PI / 360), tangentX = tangentY * aspect;
    const floor = point => {
      const sample = generator.floorSurface(point.x, point.z);
      return Number.isFinite(sample?.height) ? sample.height : NaN;
    };
    const safeHeight = point => {
      let height = floor(point);
      if (!Number.isFinite(height)) return NaN;
      for (const rock of rocks) if (Number.isFinite(oceanRockHeight(rock, point.x, point.z))) height = Math.max(height, rock.y + rock.scale.y);
      return height;
    };
    const inOwner = point => finitePoint(point) && regionOf(point) === currentRegion &&
      point.x >= owner[0] * CELL_M + .75 && point.x <= (owner[0] + 1) * CELL_M - .75 &&
      point.z >= owner[1] * CELL_M + .75 && point.z <= (owner[1] + 1) * CELL_M - .75;
    const clearEye = eye => {
      if (!inOwner(eye) || eye.y > surfaceY - .5 || eye.y < safeHeight(eye) + .7) return false;
      for (const root of roots) {
        const context = rootContext(root), fraction = clamp((eye.y - context.anchor.y) / context.anchor.lengthM, 0, 1);
        if (eye.y < context.anchor.y - .3 || eye.y > context.anchor.y + context.anchor.lengthM + .5) continue;
        if (horizontalDistance(eye, root) < 1.25 || (fraction > .7 && horizontalDistance(eye, root) < 3.8)) return false;
        if (horizontalDistance(eye, root) > 4.5) continue;
        for (let frond = 0; frond < 4; frond++) if (horizontalDistance(eye,
            kelpStipePosition(context.anchor, fraction, context.timeSec, context.environment, frond)) < .65) return false;
      }
      return true;
    };
    const clearRay = (eye, target) => {
      // Eight fixed interior samples reject obvious rock/bed crossings. This
      // finite test does not certify continuous visibility through animated leaves.
      for (let step = 1; step <= 8; step++) {
        const t = step / 9, point = { x: eye.x + (target.x - eye.x) * t,
          y: eye.y + (target.y - eye.y) * t, z: eye.z + (target.z - eye.z) * t };
        if (!loadedSet.has(regionOf(point)) || point.y < safeHeight(point) + .10) return false;
      }
      return true;
    };
    const clearAnimalRay = (eye, target) => {
      // Reject an obvious foreground stem/leaf-column obstruction to the live
      // cohort, using the existing shared plant shape and a finite envelope.
      // This sampled envelope is not full animated-leaf occlusion proof.
      for (let step = 1; step <= 8; step++) {
        const t = step / 9, point = { x: eye.x + (target.x - eye.x) * t,
          y: eye.y + (target.y - eye.y) * t, z: eye.z + (target.z - eye.z) * t };
        for (const root of roots) {
          if (horizontalDistance(root, point) > 4) continue;
          const context = rootContext(root), fraction = (point.y - context.anchor.y) / context.anchor.lengthM;
          if (fraction < 0 || fraction > 1) continue;
          for (let frond = 0; frond < 3; frond++) if (horizontalDistance(point,
              kelpStipePosition(context.anchor, fraction, context.timeSec, context.environment, frond)) < 1) return false;
        }
      }
      return true;
    };
    const schools = new Map();
    for (const agent of live) if (agent.speciesId === 'blue-rockfish' && typeof agent.groupId === 'string') {
      if (!schools.has(agent.groupId)) schools.set(agent.groupId, []);
      schools.get(agent.groupId).push(agent);
    }
    const candidates = [];
    const addCandidate = (id, members, preferredRootIds, mode) => {
      const center = mean(members.map(member => member.position));
      const preferred = preferredRootIds.map(id => rootById.get(id)).find(root => root && horizontalDistance(root, center) < 10);
      const nearest = preferred ?? roots.filter(root => horizontalDistance(root, center) < 10)
        .sort((a, b) => horizontalDistance(a, center) - horizontalDistance(b, center) || a.id.localeCompare(b.id))[0];
      if (!nearest) return;
      const groupRoots = rootGroups.get(nearest.hostId);
      if (!groupRoots?.length || horizontalDistance(mean(groupRoots), center) > 10) return;
      candidates.push({ id, members, center, groupRoots, mode, distance: horizontalDistance(center, position) });
    };
    for (const [id, members] of schools) if (members.length >= 3) addCandidate(id, members,
      members.map(member => member.sourceSceneryId), 'live-school');
    const hostFish = new Map();
    for (const agent of live) if (agent.speciesId === 'giant-kelpfish' && rootById.has(agent.hostSceneryId)) {
      const host = rootById.get(agent.hostSceneryId).hostId;
      if (!hostFish.has(host)) hostFish.set(host, []);
      hostFish.get(host).push(agent);
    }
    for (const [id, members] of hostFish) addCandidate(id, members, members.map(member => member.hostSceneryId), 'live-host-fish');
    candidates.sort((a, b) => Number(b.mode === 'live-school') - Number(a.mode === 'live-school') || a.distance - b.distance || a.id.localeCompare(b.id));
    // At most four real groups are attempted; failed groups never create actors
    // or relax physical, framing, loaded-owner or opening constraints.
    for (const candidate of candidates.slice(0, 4)) {
      const { members, center, groupRoots } = candidate, sourceAgentIds = members.map(member => member.id), sourceRootIds = groupRoots.map(root => root.id);
      const memberReferences = members.map(member => ({ kind: 'animal', id: member.id,
        position: copyPoint(member.position), radiusM: member.sizeM * .55 }));
      const communityRoots = groupRoots.flatMap(root => [0, .30].map(fraction => stipeReference(root, fraction)));
      const communityReferences = [...memberReferences, ...communityRoots];
      const heading = Math.atan2(position.z - center.z, position.x - center.x);
      const makeStop = (id, label, references, target, radiusM, height, referenceScope, verticalBounds = [-1, 1]) => {
        let best = null;
        for (let yaw = 0; yaw < YAW_COUNT; yaw++) {
          const angle = heading + yaw * TAU / YAW_COUNT;
          const eye = { x: target.x + Math.cos(angle) * radiusM, y: height,
            z: target.z + Math.sin(angle) * radiusM };
          eye.y = Math.max(eye.y, safeHeight(eye) + .7);
          if (horizontalDistance(eye, center) > 24 || !clearEye(eye) ||
              !references.every(reference => visible(reference, eye, target, tangentY, tangentX, visibilityM, verticalBounds)) ||
              !references.every(reference => clearRay(eye, reference.position)) ||
              !references.filter(reference => reference.kind === 'animal').every(reference => clearAnimalRay(eye, reference.position))) continue;
          const score = horizontalDistance(eye, position);
          if (!best || score < best.score) best = { score, stop: { id, label, position: eye, target: copyPoint(target),
            displayEvidence: { sourceAgentIds: [...sourceAgentIds], sourceRootIds: [...sourceRootIds], referenceScope,
              references, visibilityM, fovDeg, aspect, candidateCount: YAW_COUNT,
              supportClearanceM: eye.y - safeHeight(eye), groupMode: candidate.mode, verticalBounds: [...verticalBounds] } } };
        }
        return best?.stop ?? null;
      };
      const communityTarget = mean(communityReferences.map(reference => reference.position));
      const communityMinY = Math.min(...communityReferences.map(reference => reference.position.y - reference.radiusM));
      const communityMaxY = Math.max(...communityReferences.map(reference => reference.position.y + reference.radiusM));
      const communitySpanY = communityMaxY - communityMinY, communityBounds = [-.78, .65];
      // Leave actual screen space above the complete fish group for the toolbar,
      // and below the roots for observation controls. This remains an ordinary
      // whole-community distance within the supplied water visibility.
      communityTarget.y = (communityMinY + communityMaxY) * .5 + communitySpanY * .13 / (2 * 1.43);
      const communityRadius = Math.max(7.8, communitySpanY / (1.43 * tangentY) * 1.10);
      const community = makeStop('community', candidate.mode === 'live-school' ? '林缘鱼群' : '林中群落',
        communityReferences, communityTarget, communityRadius, communityTarget.y + .08,
        'whole-live-group-and-neighbour-roots-and-stipes', communityBounds);
      if (!community) continue;
      // Show the real holdfast cluster and lower forest column in one frame.
      // Tall surface crowns are outside this explicitly named reference scope.
      const forestReferences = groupRoots.flatMap(root => [0, .20, .40].map(fraction => stipeReference(root, fraction)));
      const forestTarget = mean(forestReferences.map(reference => reference.position));
      const bounds = {
        minY: Math.min(...forestReferences.map(reference => reference.position.y - reference.radiusM)),
        maxY: Math.max(...forestReferences.map(reference => reference.position.y + reference.radiusM)) };
      const forestSpanY = bounds.maxY - bounds.minY, forestBounds = [-.74, .78];
      forestTarget.y = (bounds.minY + bounds.maxY) * .5 - forestSpanY * .04 / (2 * 1.52);
      const forestRadius = Math.max(7, forestSpanY / (1.52 * tangentY) * 1.10);
      if (forestRadius > visibilityM - 1) continue;
      const forest = makeStop('forest', '林底与茎群', forestReferences, forestTarget, forestRadius, forestTarget.y + .08,
        'roots-and-lower-stipes', forestBounds);
      if (!forest) continue;
      let opening = null, openingScore = Infinity;
      // Eight outer points around the real host provide a small local sediment
      // opening. Absence at these points is not a survey of a whole clearing.
      const rootCenter = mean(groupRoots), openingRadius = Math.min(12, Math.max(8, visibilityM * .72));
      for (let yaw = 0; yaw < YAW_COUNT; yaw++) {
        const angle = heading + yaw * TAU / YAW_COUNT;
        const point = { x: rootCenter.x + Math.cos(angle) * openingRadius, y: 0,
          z: rootCenter.z + Math.sin(angle) * openingRadius };
        if (!inOwner(point) || horizontalDistance(point, center) > 24) continue;
        const nearestRootDistanceM = Math.min(...roots.map(root => horizontalDistance(root, point)));
        const nearbyRootCount = roots.filter(root => horizontalDistance(root, point) < 4).length;
        if (nearbyRootCount || nearestRootDistanceM < 4) continue;
        const samples = [{ x: point.x, z: point.z }];
        for (let sample = 0; sample < 8; sample++) {
          const a = sample * TAU / 8;
          samples.push({ x: point.x + Math.cos(a) * 1.5, z: point.z + Math.sin(a) * 1.5 });
        }
        const floorSamples = []; let valid = true;
        for (const sample of samples) {
          if (!inOwner({ ...sample, y: 0 })) { valid = false; break; }
          const height = floor(sample), supportHeight = safeHeight(sample);
          if (!Number.isFinite(height) || supportHeight > height + 1e-8) { valid = false; break; }
          floorSamples.push({ ...sample, height, supportHeight });
        }
        if (!valid) continue;
        point.y = floorSamples[0].height + 2.8;
        if (!clearEye(point)) continue;
        const target = { x: rootCenter.x, y: Math.max(floor(rootCenter) + .3, rootCenter.y + .3), z: rootCenter.z };
        const openingReferences = [{ kind: 'sediment-opening', id: currentRegion,
          position: { x: point.x, y: floorSamples[0].height, z: point.z }, radiusM: .1 },
          ...groupRoots.map(root => stipeReference(root, .18))];
        // The floor directly beneath the eye need not enter a forward view;
        // its sampled substrate is evidence for the position, not a FOV claim.
        if (!openingReferences.slice(1).every(reference => visible(reference, point, target, tangentY, tangentX, visibilityM)) ||
            !clearRay(point, target)) continue;
        const score = horizontalDistance(point, community.position);
        if (score >= openingScore) continue;
        openingScore = score;
        opening = { id: 'opening', label: '沉积底与林缘', position: point, target,
          displayEvidence: { sourceAgentIds: [...sourceAgentIds], sourceRootIds: [...sourceRootIds], referenceScope: 'sampled-sediment-opening-and-forest-edge',
            references: openingReferences, visibilityM, fovDeg, aspect, candidateCount: YAW_COUNT,
            supportClearanceM: point.y - safeHeight(point), groupMode: candidate.mode,
            floorSamples, nearbyRootCount, nearestRootDistanceM } };
      }
      if (!opening) continue;
      return freeze({ id: `kelp-community:${candidate.id}`, originCellId: currentRegion, regionIds: [...new Set(members.map(member => member.regionId)
        .concat(groupRoots.map(regionOf), currentRegion))].sort(), sourceAgentIds: [...sourceAgentIds], sourceRootIds: [...sourceRootIds],
        stops: [community, forest, opening], scope: 'observation-only' });
    }
    return null;
  } catch {
    // Failed real support or malformed public data cannot authorize a view.
    return null;
  }
}
