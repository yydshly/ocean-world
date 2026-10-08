import * as THREE from 'three';

export const OCEAN_ANIMAL_SEDIMENT_LIMIT = 256;
const TRACKED_LIMIT = 180, EMISSION_LIMIT = 32, MAX_STEP_SEC = .5;
const VIEW_RADIUS_M = 36, BED_MARGIN_M = .008;
// These are bounded display choices, not measured suspension rates, grain
// sizes, sediment mass, a fluid solver or a change to the ecological model.
const TRAITS = Object.freeze({
  'blue-spotted-ray': { clearance: .065, travelM: .025, moveCount: 8, feedCount: 14, radiusM: .13 },
  'reef-goatfish': { clearance: .33, travelM: Infinity, moveCount: 0, feedCount: 10, radiusM: .07 },
  'spotted-hermit-crab': { clearance: .035, travelM: .008, moveCount: 2, feedCount: 3, radiusM: .035 },
  'black-cucumber': { clearance: .035, travelM: .012, moveCount: 2, feedCount: 3, radiusM: .04 },
});
const finitePoint = p => p && ['x', 'y', 'z'].every(axis => Number.isFinite(p[axis]));
const hash = text => { let value = 2166136261; for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619); return value >>> 0; };
const seedKey = seed => {
  if (!['string', 'number'].includes(typeof seed) || (typeof seed === 'number' && !Number.isFinite(seed))) {
    throw new TypeError('Animal sediment seed must be a string or finite number.');
  }
  return `${typeof seed}:${seed}`;
};

/** A transient animal-driven display layer. All inputs use logical metres.
 * dtSec is the caller's actual model advancement, never elapsed loading time.
 * First exposure establishes a baseline: saved feeding events are not replayed.
 * surfaceAt may provide the existing complete solid-support query; it is read
 * only. This layer never retains agents or writes terrain, food or storage. */
export class OceanAnimalSediment {
  constructor(scene, { seed = 42, surfaceY = 8 } = {}) {
    if (!scene?.add || !Number.isFinite(surfaceY)) throw new TypeError('Animal sediment requires a scene and finite water surface.');
    this.surfaceY = surfaceY;
    this._disposed = false;
    this._position = new Float64Array(OCEAN_ANIMAL_SEDIMENT_LIMIT * 3);
    this._velocity = new Float64Array(OCEAN_ANIMAL_SEDIMENT_LIMIT * 3);
    this._age = new Float64Array(OCEAN_ANIMAL_SEDIMENT_LIMIT);
    this._life = new Float64Array(OCEAN_ANIMAL_SEDIMENT_LIMIT);
    this._sourceIds = new Array(OCEAN_ANIMAL_SEDIMENT_LIMIT).fill(null);
    this._sources = new Map();
    this._renderOrigin = { x: 0, z: 0 };
    this._geometry = new THREE.BufferGeometry();
    this._geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(OCEAN_ANIMAL_SEDIMENT_LIMIT * 3), 3));
    this._geometry.setAttribute('opacity', new THREE.BufferAttribute(new Float32Array(OCEAN_ANIMAL_SEDIMENT_LIMIT), 1));
    this._geometry.setAttribute('pointScale', new THREE.BufferAttribute(new Float32Array(OCEAN_ANIMAL_SEDIMENT_LIMIT), 1));
    this._material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      uniforms: { lightAtDepth: { value: .6 }, blend: { value: 1 } },
      vertexShader: `
        attribute float opacity;
        attribute float pointScale;
        varying float alpha;
        varying float distanceM;
        void main() {
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          distanceM = length(p.xyz);
          alpha = opacity;
          gl_PointSize = clamp(pointScale * 90.0 / max(0.7, -p.z), 1.0, 11.0);
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        uniform float lightAtDepth;
        uniform float blend;
        varying float alpha;
        varying float distanceM;
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5));
          if (radius >= 0.5 || alpha <= 0.0 || blend <= 0.0) discard;
          float edge = 1.0 - smoothstep(0.0, 0.5, radius);
          float attenuation = exp(-distanceM * 0.025);
          vec3 sand = vec3(0.60, 0.55, 0.40) * (0.25 + 0.75 * lightAtDepth);
          gl_FragColor = vec4(sand, alpha * edge * attenuation * blend);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.root = new THREE.Points(this._geometry, this._material);
    this.root.name = 'animal-driven-local-sediment-display';
    this.root.userData.oceanStreaming = true;
    this.root.userData.role = 'display-proxy-from-actual-animal-activity';
    this.root.frustumCulled = false;
    scene.add(this.root);
    this.reset(seed);
  }

  _clear() {
    this._sources.clear();
    this._life.fill(0);
    this._sourceIds.fill(null);
    this._geometry.attributes.opacity.array.fill(0);
    this._geometry.attributes.opacity.needsUpdate = true;
  }

  reset(seed = this.seed) {
    if (this._disposed) return false;
    this._seedKey = seedKey(seed);
    this.seed = seed;
    this._clockSec = 0;
    this._serial = 0;
    this._emitted = 0;
    this._settled = 0;
    this._dropped = 0;
    this._feedTriggers = 0;
    this._moveTriggers = 0;
    this._skippedJumps = 0;
    this._clear();
    this.root.visible = false;
    return true;
  }

  _retire(index) {
    this._life[index] = 0;
    this._sourceIds[index] = null;
  }

  _support(generator, x, z, surfaceAt) {
    const sample = generator.sample(x, z), floor = generator.floorSurface(x, z)?.height;
    if (sample?.substrate !== 'sand' || !Number.isFinite(floor) || this.surfaceY - floor < 1 || this.surfaceY - floor > 25) return null;
    if (surfaceAt) {
      const result = surfaceAt(x, z), solid = typeof result === 'number' ? result : result?.height;
      if (!Number.isFinite(solid) || solid > floor + .025) return null;
    }
    return floor;
  }

  _emit(id, position, floor, trait, count, generator, surfaceAt, budget) {
    const wanted = count;
    count = Math.min(count, budget);
    let emitted = 0;
    let attempts = 0;
    for (let index = 0; index < OCEAN_ANIMAL_SEDIMENT_LIMIT && emitted < count && attempts < count * 2; index++) {
      if (this._life[index] > 0) continue;
      attempts++;
      const serial = this._serial++;
      const random = key => hash(`${this._seedKey}|${id}|${serial}|${key}`) / 4294967296;
      const angle = random('angle') * Math.PI * 2, radius = Math.sqrt(random('radius')) * trait.radiusM;
      const x = position.x + Math.cos(angle) * radius, z = position.z + Math.sin(angle) * radius;
      const localFloor = this._support(generator, x, z, surfaceAt);
      if (localFloor === null || Math.abs(localFloor - floor) > .04) continue;
      const offset = index * 3;
      this._position[offset] = x;
      this._position[offset + 1] = localFloor + .025;
      this._position[offset + 2] = z;
      this._velocity[offset] = (random('vx') - .5) * .03;
      this._velocity[offset + 1] = .16 + random('vy') * .12;
      this._velocity[offset + 2] = (random('vz') - .5) * .03;
      this._age[index] = 0;
      this._life[index] = 4 + random('life') * 2;
      this._sourceIds[index] = id; // A scalar identity, never an entity reference.
      this._geometry.attributes.pointScale.array[index] = .8 + random('scale') * .8;
      emitted++;
    }
    this._emitted += emitted;
    this._dropped += wanted - emitted;
    return emitted;
  }

  _advance(dtSec, generator, currentVector) {
    const steps = Math.ceil(dtSec / .1), dt = dtSec / steps;
    for (let step = 0; step < steps; step++) for (let index = 0; index < OCEAN_ANIMAL_SEDIMENT_LIMIT; index++) {
      if (this._life[index] <= 0) continue;
      const offset = index * 3;
      this._age[index] += dt;
      if (this._age[index] >= this._life[index]) { this._retire(index); continue; }
      this._velocity[offset + 1] -= .065 * dt;
      this._position[offset] += (currentVector.x * .4 + this._velocity[offset]) * dt;
      this._position[offset + 1] += this._velocity[offset + 1] * dt;
      this._position[offset + 2] += (currentVector.z * .4 + this._velocity[offset + 2]) * dt;
      const floor = generator.floorSurface(this._position[offset], this._position[offset + 2])?.height;
      if (!Number.isFinite(floor) || this._position[offset + 1] <= floor + BED_MARGIN_M ||
        this._position[offset + 1] >= this.surfaceY - .04 || this._position[offset + 1] > floor + .7) {
        this._settled++;
        this._retire(index);
      }
    }
    this._clockSec += dtSec;
  }

  _writeAttributes(renderOrigin) {
    const positions = this._geometry.attributes.position, opacity = this._geometry.attributes.opacity;
    for (let index = 0; index < OCEAN_ANIMAL_SEDIMENT_LIMIT; index++) {
      if (this._life[index] <= 0) { opacity.array[index] = 0; continue; }
      const offset = index * 3;
      positions.setXYZ(index, this._position[offset] - renderOrigin.x, this._position[offset + 1], this._position[offset + 2] - renderOrigin.z);
      const progress = this._age[index] / this._life[index];
      opacity.array[index] = .30 * (1 - progress) ** 2;
    }
    positions.needsUpdate = true;
    opacity.needsUpdate = true;
    this._geometry.attributes.pointScale.needsUpdate = true;
    this.root.visible = this._life.some(value => value > 0);
  }

  update({ agents = [], generator, surfaceAt, dtSec = 0, paused = false,
    renderOrigin = { x: 0, z: 0 }, cameraPosition, currentVector = { x: 0, z: 0 }, lightAtDepth = .6, blend = 1 } = {}) {
    if (this._disposed) return false;
    if (!Number.isFinite(renderOrigin.x) || !Number.isFinite(renderOrigin.z) || !finitePoint(cameraPosition)) {
      throw new TypeError('Sediment camera and render origin must contain logical finite metres.');
    }
    this._renderOrigin = { x: renderOrigin.x, z: renderOrigin.z };
    this._material.uniforms.lightAtDepth.value = Number.isFinite(lightAtDepth) ? THREE.MathUtils.clamp(lightAtDepth, 0, 1) : .6;
    this._material.uniforms.blend.value = Number.isFinite(blend) ? THREE.MathUtils.clamp(blend, 0, 1) : 1;
    if (generator?.profile !== 'living-shallows-v1' || typeof generator.sample !== 'function' || typeof generator.floorSurface !== 'function') {
      this._clear(); this.root.visible = false; return true;
    }
    const elapsed = !paused && Number.isFinite(dtSec) && dtSec > 0 && dtSec <= MAX_STEP_SEC ? dtSec : 0;
    const current = { x: Number.isFinite(currentVector.x) ? THREE.MathUtils.clamp(currentVector.x, -1.2, 1.2) : 0,
      z: Number.isFinite(currentVector.z) ? THREE.MathUtils.clamp(currentVector.z, -1.2, 1.2) : 0 };
    if (elapsed > 0) this._advance(elapsed, generator, current);
    const live = new Set();
    let budget = EMISSION_LIMIT;
    for (const agent of agents) {
      const trait = TRAITS[agent?.speciesId], position = agent?.position;
      if (!trait || agent.alive !== true || typeof agent.id !== 'string' || !finitePoint(position) ||
        !Number.isFinite(agent.timeSec) || agent.timeSec < 0 || live.size >= TRACKED_LIMIT) continue;
      if (live.has(agent.id)) continue;
      live.add(agent.id);
      const previous = this._sources.get(agent.id);
      const record = { speciesId: agent.speciesId, timeSec: agent.timeSec, x: position.x, y: position.y, z: position.z,
        lastFeedAt: Number.isFinite(agent.lastFeedAt) ? agent.lastFeedAt : null, travelM: 0,
        lastEmissionAt: previous?.lastEmissionAt ?? -Infinity };
      this._sources.set(agent.id, record);
      const delta = previous ? agent.timeSec - previous.timeSec : 0;
      if (previous && (previous.speciesId !== agent.speciesId || delta < 0 || delta > MAX_STEP_SEC)) {
        record.travelM = 0; record.lastEmissionAt = -Infinity;
      }
      if (!previous || elapsed <= 0 || previous.speciesId !== agent.speciesId || delta <= 0 || delta > MAX_STEP_SEC) {
        if (previous?.speciesId === agent.speciesId && delta === 0 &&
          Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z) < 1e-9) record.travelM = previous.travelM;
        if (previous && delta > MAX_STEP_SEC) this._skippedJumps++;
        continue;
      }
      // The selected ray, goatfish and hermit have actual soft-bottom admission
      // markers. The older cucumber has a generated sand habitat instead.
      const softOwner = agent.speciesId === 'black-cucumber' ? agent.habitat?.startsWith('sand')
        : agent.benthicLifeIndividualVersion === 1 && agent.benthicLifeMode === 'soft';
      if (!softOwner || Math.hypot(position.x - cameraPosition.x, position.y - cameraPosition.y, position.z - cameraPosition.z) > VIEW_RADIUS_M) continue;
      const floor = this._support(generator, position.x, position.z, surfaceAt);
      if (floor === null || position.y < floor - .003 || position.y - floor > trait.clearance ||
        previous.y < floor - .04 || previous.y - floor > trait.clearance + .04) continue;
      const moved = Math.hypot(position.x - previous.x, position.z - previous.z);
      // Reject discontinuous teleports even when someone gives them a short
      // clock delta. Slow crawlers need real accumulated travel to emit.
      if (moved > delta * .5 + .001) continue;
      record.travelM = previous.travelM + moved;
      const fed = record.lastFeedAt !== null && record.lastFeedAt <= record.timeSec + 1e-8 &&
        record.lastFeedAt >= previous.timeSec - 1e-8 && record.timeSec - record.lastFeedAt <= MAX_STEP_SEC &&
        (previous.lastFeedAt === null || record.lastFeedAt > previous.lastFeedAt);
      const traversed = trait.moveCount > 0 && record.travelM >= trait.travelM;
      if ((!fed && !traversed) || record.timeSec - record.lastEmissionAt < .5) continue;
      const count = fed ? trait.feedCount : trait.moveCount;
      if (budget <= 0) { this._dropped += count; continue; }
      const emitted = this._emit(agent.id, position, floor, trait, count, generator, surfaceAt, budget);
      // Failed support attempts consume this frame's request budget too.
      // This bounds terrain work even on an unsuitable edge.
      budget -= Math.min(count, budget);
      if (emitted) {
        record.travelM = 0;
        record.lastEmissionAt = record.timeSec;
        if (fed) this._feedTriggers++; else this._moveTriggers++;
      }
    }
    for (const id of this._sources.keys()) if (!live.has(id)) this._sources.delete(id);
    this._writeAttributes(renderOrigin);
    return true;
  }

  /** Copies for diagnostics: these are display particles, not sediment mass. */
  particleSnapshot() {
    const result = [];
    for (let index = 0; index < OCEAN_ANIMAL_SEDIMENT_LIMIT; index++) if (this._life[index] > 0) {
      const offset = index * 3;
      result.push({ slot: index, sourceId: this._sourceIds[index], position: {
        x: this._position[offset], y: this._position[offset + 1], z: this._position[offset + 2] },
      ageSec: this._age[index], remainingSec: this._life[index] - this._age[index] });
    }
    return result;
  }

  get stats() {
    return { scope: 'finite animal-triggered display proxy; no fluid or sediment mass simulation',
      activeParticles: this._life.reduce((sum, life) => sum + Number(life > 0), 0), capacity: OCEAN_ANIMAL_SEDIMENT_LIMIT,
      trackedSources: this._sources.size, retainedEntityReferences: 0, emittedParticles: this._emitted,
      feedTriggers: this._feedTriggers, moveTriggers: this._moveTriggers, droppedParticles: this._dropped,
      settledParticles: this._settled, skippedClockJumps: this._skippedJumps, clockSec: this._clockSec,
      renderOrigin: { ...this._renderOrigin }, geometryCount: this._disposed ? 0 : 1,
      materialCount: this._disposed ? 0 : 1, textureCount: 0, maxDrawCalls: 1, visible: this.root.visible && !this._disposed };
  }

  dispose() {
    if (this._disposed) return;
    this._clear();
    this._geometry.dispose();
    this._material.dispose();
    this.root.removeFromParent();
    this.root.visible = false;
    this._disposed = true;
  }
}
