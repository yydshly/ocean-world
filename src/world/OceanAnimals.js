import * as THREE from 'three';
import { createOrganism, animateOrganism, disposeOrganism, updateOrganismDetail } from './organisms.js';
import { createOceanTurtleOrganism, animateOceanTurtleOrganism, disposeOceanTurtleOrganism } from './OceanTurtleOrganisms.js';
import { isReefGuildSpecies, createReefGuildOrganism, animateReefGuildOrganism,
  updateReefGuildDetail, disposeReefGuildOrganism } from './reefGuildAssets.js';
import { isOpenWaterSpecies, createOpenWaterOrganism, animateOpenWaterOrganism,
  updateOpenWaterDetail, disposeOpenWaterOrganism } from './openWaterLifeAssets.js';
const isTurtle = entity => entity.speciesId === 'green-turtle';
const disposeAnimal = entity => isTurtle(entity) ? disposeOceanTurtleOrganism(entity.object)
  : isReefGuildSpecies(entity.speciesId) ? disposeReefGuildOrganism(entity.object)
  : isOpenWaterSpecies(entity.speciesId) ? disposeOpenWaterOrganism(entity.object) : disposeOrganism(entity.object);

// Regional ecology keeps logical world coordinates. Three.js receives the
// translated scene coordinates; the simulation never inherits that translation.
export class OceanAnimals {
  constructor(speciesCatalog) {
    this.catalog = new Map(speciesCatalog.map(species => [species.id, species]));
    this.root = new THREE.Group();
    this.root.name = 'Regional ocean animals';
    this.root.userData.oceanStreaming = true;
    this.root.userData.role = 'regional-animal-populations';
    this.entities = new Map();
    this.renderOrigin = { x: 0, z: 0 };
    this._pickableObjects = [];
    this._disposed = false;
    this._position = new THREE.Vector3();
  }

  sync(agents) {
    if (this._disposed) return false;
    const live = new Map();
    for (const agent of agents) {
      if (agent.alive !== false && this.catalog.has(agent.speciesId)) live.set(agent.id, agent);
    }
    let changed = false;
    for (const [id, entity] of this.entities) {
      if (!live.has(id) || live.get(id).speciesId !== entity.speciesId) {
        disposeAnimal(entity);
        this.entities.delete(id);
        changed = true;
      }
    }
    for (const [id, agent] of live) {
      if (this.entities.has(id)) continue;
      const species = this.catalog.get(agent.speciesId);
      const object = agent.speciesId === 'green-turtle' ? createOceanTurtleOrganism(species)
        : isReefGuildSpecies(agent.speciesId) ? createReefGuildOrganism(species)
        : isOpenWaterSpecies(agent.speciesId) ? createOpenWaterOrganism(species) : createOrganism(species);
      object.userData.agentId = id;
      object.userData.regionId = agent.regionId;
      object.userData.oceanStreaming = true;
      object.userData.sourceLinks = (species.sourceLinks || species.sources || []).map(source => ({ ...source }));
      // Animation phase must survive unloading/reloading, rather than depending
      // on the order in which other organism models happened to be constructed.
      let hash = 2166136261;
      for (const char of String(id)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      object.userData.phase = (hash >>> 0) / 4294967296 * Math.PI * 2;
      object.traverse(child => {
        if (child.isMesh) {
          if (species.kind !== 'fish' && species.kind !== 'ray') child.castShadow = false;
          child.receiveShadow = true;
        }
      });
      this.root.add(object);
      this.entities.set(id, { object, kind: species.kind, speciesId: agent.speciesId });
      changed = true;
    }
    if (changed) this._pickableObjects = [...this.entities.values()].map(entity => entity.object);
    return changed;
  }

  setRenderOrigin(origin) {
    if (this._disposed) return false;
    const x = Number.isFinite(origin?.x) ? origin.x : 0;
    const z = Number.isFinite(origin?.z) ? origin.z : 0;
    if (x === this.renderOrigin.x && z === this.renderOrigin.z) return false;
    this.renderOrigin = { x, z };
    this.root.position.set(-x, 0, -z);
    this.root.updateMatrixWorld(true);
    return true;
  }

  // cameraPosition is in rendered scene coordinates, as is ReefWorld.camera.
  // The agent's Y is already its ecological support height and stays unchanged.
  update(agents, timeSec, renderOrigin = this.renderOrigin, cameraPosition = null) {
    if (this._disposed) return false;
    const changed = this.sync(agents);
    this.setRenderOrigin(renderOrigin);
    for (const agent of agents) {
      const entity = this.entities.get(agent.id);
      if (!entity || agent.alive === false) continue;
      const object = entity.object;
      const agentTimeSec = Number.isFinite(agent.timeSec) ? agent.timeSec : timeSec;
      const sizeM = Number.isFinite(agent.sizeM) && agent.sizeM > 0
        ? agent.sizeM : (this.catalog.get(agent.speciesId)?.lengthM || .3);
      object.position.set(agent.position.x, agent.position.y, agent.position.z);
      object.scale.setScalar(sizeM);
      const heading = Number.isFinite(agent.heading) ? agent.heading
        : Math.atan2(agent.velocity?.z || 0, agent.velocity?.x || 1);
      object.rotation.set(0, -heading, 0);
      if (entity.kind === 'fish') {
        const horizontalSpeed = Math.hypot(agent.velocity?.x || 0, agent.velocity?.z || 0);
        object.rotation.z = THREE.MathUtils.clamp(
          Math.atan2(agent.velocity?.y || 0, Math.max(.08, horizontalSpeed)), -.25, .25);
        if (agent.state === 'grazing' && typeof agent.lastFeedAt === 'number') {
          const since = agentTimeSec - agent.lastFeedAt;
          if (since >= 0 && since < .7) object.rotation.z -= .18 * Math.sin(since / .7 * Math.PI);
        }
      } else if (entity.kind === 'ray') {
        const horizontalSpeed = Math.hypot(agent.velocity?.x || 0, agent.velocity?.z || 0);
        object.rotation.z = THREE.MathUtils.clamp(
          Math.atan2(agent.velocity?.y || 0, Math.max(.08, horizontalSpeed)), -.2, .2);
      }
      object.userData.regionId = agent.regionId;
      if (entity.kind === 'turtle') {
        object.rotation.z = Number.isFinite(agent.pitch) ? THREE.MathUtils.clamp(agent.pitch, -.15, .15) : 0;
        animateOceanTurtleOrganism(object, agentTimeSec, agent);
      } else if (isReefGuildSpecies(entity.speciesId)) animateReefGuildOrganism(object, agentTimeSec, agent);
      else if (isOpenWaterSpecies(entity.speciesId)) {
        if (entity.speciesId === 'reef-squid') {
          const horizontalSpeed = Math.hypot(agent.velocity?.x || 0, agent.velocity?.z || 0);
          object.rotation.z = Number.isFinite(agent.pitch) ? THREE.MathUtils.clamp(agent.pitch, -.2, .2)
            : THREE.MathUtils.clamp(Math.atan2(agent.velocity?.y || 0, Math.max(.08, horizontalSpeed)), -.2, .2);
        }
        animateOpenWaterOrganism(object, agentTimeSec, agent);
      }
      else animateOrganism(object, agentTimeSec, agent.state === 'fleeing' ? 2
        : (agent.state === 'resting' || agent.state === 'fixed' ? .25 : 1));
    }
    // LOD measures distances only after the parent's floating-origin transform
    // is current. Entity local coordinates intentionally remain logical metres.
    this.root.updateMatrixWorld(true);
    if (cameraPosition) {
      for (const entity of this.entities.values()) {
        entity.object.getWorldPosition(this._position);
        const distance = this._position.distanceTo(cameraPosition);
        if (isReefGuildSpecies(entity.speciesId)) updateReefGuildDetail(entity.object, distance);
        else if (isOpenWaterSpecies(entity.speciesId)) updateOpenWaterDetail(entity.object, distance);
        else updateOrganismDetail(entity.object, distance);
      }
    }
    return changed;
  }

  getObject(id) { return this.entities.get(id)?.object ?? null; }
  get pickableObjects() { return this._pickableObjects; }
  get stats() {
    const speciesCounts = {};
    for (const entity of this.entities.values()) {
      speciesCounts[entity.speciesId] = (speciesCounts[entity.speciesId] || 0) + 1;
    }
    return { activeAnimals: this.entities.size, speciesCounts, renderOrigin: { ...this.renderOrigin } };
  }

  reset() {
    for (const entity of this.entities.values()) disposeAnimal(entity);
    this.entities.clear();
    this._pickableObjects = [];
  }

  dispose() {
    if (this._disposed) return;
    this.reset();
    this._disposed = true;
    this.root.removeFromParent();
  }
}
