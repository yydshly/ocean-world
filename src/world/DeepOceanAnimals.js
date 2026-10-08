import * as THREE from 'three';
import { createDeepMidwaterLifeAsset, animateDeepMidwaterLifeAsset, disposeDeepMidwaterLifeAsset, isDeepMidwaterLifeSpecies } from './DeepMidwaterLifeAssets.js';
import { createDeepWaterLifeAsset, animateDeepWaterLifeAsset, disposeDeepWaterLifeAsset, isDeepWaterLifeSpecies } from './DeepWaterLifeAssets.js';
import { createDeepHardLifeAsset, animateDeepHardLifeAsset, disposeDeepHardLifeAsset, isDeepHardLifeSpecies } from './DeepHardLifeAssets.js';
import { createDeepBenthicLifeAsset, animateDeepBenthicLifeAsset, disposeDeepBenthicLifeAsset, isDeepBenthicLifeSpecies } from './DeepBenthicLifeAssets.js';
import { createDeepOrganism, animateDeepOrganism, disposeDeepOrganism } from './deepOrganisms.js';
import { createDeepSeaSpiderOrganism, animateDeepSeaSpiderOrganism, disposeDeepSeaSpiderOrganism } from './deepSeaSpiderOrganism.js';
import { DEEP_SEA_SPIDER_SPECIES_ID } from '../deepSeaSpiderGeometry.js';

const supportedSpecies = new Set(['sea-pig-group', 'rattail-family', 'pom-pom-anemone', DEEP_SEA_SPIDER_SPECIES_ID]);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const disposeRegional = object => isDeepMidwaterLifeSpecies(object.userData.speciesId) ? disposeDeepMidwaterLifeAsset(object) : isDeepWaterLifeSpecies(object.userData.speciesId) ? disposeDeepWaterLifeAsset(object) : isDeepHardLifeSpecies(object.userData.speciesId) ? disposeDeepHardLifeAsset(object) : isDeepBenthicLifeSpecies(object.userData.speciesId) ? disposeDeepBenthicLifeAsset(object) : object.userData.speciesId === DEEP_SEA_SPIDER_SPECIES_ID
  ? disposeDeepSeaSpiderOrganism(object) : disposeDeepOrganism(object);

// Regional adapters retain the authored morphology and its support convention.
// The model supplies metre positions and each animal's normalized foot contacts;
// adding root tilt here would invalidate its yaw-only contact/mouth transform.
export class DeepOceanAnimals {
  constructor(catalog) {
    this.catalog = new Map(catalog.map(species => [species.id, species]));
    this.root = new THREE.Group(); this.root.name = 'Regional deep animals';
    this.root.userData.oceanStreaming = true; this.root.userData.role = 'regional-deep-animal-populations';
    this.entities = new Map(); this.objects = this.entities;
    this.renderOrigin = { x: 0, z: 0 }; this._pickableObjects = []; this._disposed = false;
    this._observationAgentId = null;
  }
  sync(agents) {
    if (this._disposed) return false;
    const live = new Map(agents.filter(agent => agent.alive !== false && (supportedSpecies.has(agent.speciesId) || isDeepBenthicLifeSpecies(agent.speciesId) || isDeepHardLifeSpecies(agent.speciesId) || isDeepWaterLifeSpecies(agent.speciesId) || isDeepMidwaterLifeSpecies(agent.speciesId)) &&
      this.catalog.has(agent.speciesId)).map(agent => [agent.id, agent]));
    let changed = false;
    for (const [id, entity] of this.entities) {
      if (!live.has(id) || live.get(id).speciesId !== entity.speciesId) {
        disposeRegional(entity.object); this.entities.delete(id); changed = true;
      }
    }
    for (const [id, agent] of live) {
      if (this.entities.has(id)) continue;
      const species = this.catalog.get(agent.speciesId), object = isDeepMidwaterLifeSpecies(agent.speciesId) ? createDeepMidwaterLifeAsset(species) : isDeepWaterLifeSpecies(agent.speciesId) ? createDeepWaterLifeAsset(species) : isDeepHardLifeSpecies(agent.speciesId) ? createDeepHardLifeAsset(species) : isDeepBenthicLifeSpecies(agent.speciesId) ? createDeepBenthicLifeAsset(species) : agent.speciesId === DEEP_SEA_SPIDER_SPECIES_ID
        ? createDeepSeaSpiderOrganism(species) : createDeepOrganism(species);
      object.userData.agentId = id; object.userData.regionId = agent.regionId; object.userData.oceanStreaming = true;
      let hash = 2166136261; for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      object.userData.phase = (hash >>> 0) / 4294967296 * Math.PI * 2;
      object.traverse(child => { if (child.isMesh) { child.castShadow = false; child.receiveShadow = true; } });
      this.root.add(object); this.entities.set(id, { object, speciesId: agent.speciesId, kind: species.kind }); changed = true;
    }
    if (changed) this._pickableObjects = [...this.entities.values()].map(entity => entity.object);
    return changed;
  }
  setRenderOrigin(origin) {
    if (this._disposed) return false;
    const x = finite(origin?.x), z = finite(origin?.z);
    if (x === this.renderOrigin.x && z === this.renderOrigin.z) return false;
    this.renderOrigin = { x, z }; this.root.position.set(-x, 0, -z); this.root.updateMatrixWorld(true); return true;
  }
  setObservationAgent(id) {
    if (this._disposed) return false;
    const next = typeof id === 'string' && id.length ? id : null;
    if (next === this._observationAgentId) return false;
    this._observationAgentId = next; return true;
  }
  update(agents, timeSec, origin = this.renderOrigin) {
    if (this._disposed) return false;
    const changed = this.sync(agents); this.setRenderOrigin(origin);
    for (const agent of agents) {
      const entity = this.entities.get(agent.id); if (!entity || agent.alive === false) continue;
      const object = entity.object;
      object.position.set(agent.position.x, agent.position.y, agent.position.z);
      object.scale.setScalar(Number.isFinite(agent.sizeM) && agent.sizeM > 0 ? agent.sizeM : .1);
      if (isDeepBenthicLifeSpecies(agent.speciesId) || isDeepHardLifeSpecies(agent.speciesId)) {
        const up = new THREE.Vector3(agent.supportNormal?.x ?? 0, agent.supportNormal?.y ?? 1, agent.supportNormal?.z ?? 0).normalize();
        const forward = new THREE.Vector3(Math.cos(finite(agent.heading)), 0, Math.sin(finite(agent.heading)));
        forward.addScaledVector(up, -forward.dot(up)).normalize();
        const side = new THREE.Vector3().crossVectors(forward, up).normalize();
        object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, up, side));
      } else if (isDeepMidwaterLifeSpecies(agent.speciesId)) object.rotation.set(0, -finite(agent.heading), THREE.MathUtils.clamp(finite(agent.pitch), ...(this.catalog.get(agent.speciesId).motion.pitchRangeRad)), 'XYZ');
      else if (isDeepWaterLifeSpecies(agent.speciesId)) object.rotation.set(0, -finite(agent.heading), finite(agent.pitch), 'XYZ');
      else object.rotation.set(0, -finite(agent.heading), 0);
      object.userData.regionId = agent.regionId;
      if (isDeepMidwaterLifeSpecies(agent.speciesId)) animateDeepMidwaterLifeAsset(object, finite(agent.timeSec, finite(timeSec)), agent);
      else if (isDeepWaterLifeSpecies(agent.speciesId)) animateDeepWaterLifeAsset(object, finite(agent.timeSec, finite(timeSec)), agent);
      else if (isDeepHardLifeSpecies(agent.speciesId)) animateDeepHardLifeAsset(object, finite(agent.timeSec, finite(timeSec)), agent);
      else if (isDeepBenthicLifeSpecies(agent.speciesId)) animateDeepBenthicLifeAsset(object, finite(agent.timeSec, finite(timeSec)), agent);
      else if (agent.speciesId === DEEP_SEA_SPIDER_SPECIES_ID) animateDeepSeaSpiderOrganism(object, finite(agent.timeSec, finite(timeSec)), agent);
      else animateDeepOrganism(object, finite(agent.timeSec, finite(timeSec)), agent, agent.localEnvironment ?? {});
    }
    this.root.updateMatrixWorld(true); return changed;
  }
  getObject(id) { return this.entities.get(id)?.object ?? null; }
  find(id) { return this.getObject(id); }
  get pickableObjects() { return this._pickableObjects; }
  getPickables() { return this._pickableObjects; }
  get detailedHostIds() { return []; }
  get stats() {
    const speciesCounts = {};
    for (const entity of this.entities.values()) speciesCounts[entity.speciesId] = (speciesCounts[entity.speciesId] || 0) + 1;
    return { activeAnimals: this.entities.size, speciesCounts, renderOrigin: { ...this.renderOrigin },
      observationAgentId: this._observationAgentId };
  }
  snapshot() { return this.stats; }
  reset() {
    for (const entity of this.entities.values()) disposeRegional(entity.object);
    this.entities.clear(); this._pickableObjects = []; this._observationAgentId = null;
  }
  dispose() { if (this._disposed) return; this.reset(); this._disposed = true; this.root.removeFromParent(); }
}
