import * as THREE from 'three';
import { createKelpBenthicLifeAsset, animateKelpBenthicLifeAsset, disposeKelpBenthicLifeAsset, isKelpBenthicLifeSpecies } from './KelpBenthicLifeAssets.js';
import { createKelpOrganism, animateKelpOrganism, disposeKelpOrganism } from './kelpOrganisms.js';
import { createKelpWaterOrganism, animateKelpWaterOrganism, disposeKelpWaterOrganism } from './kelpWaterOrganisms.js';
import { createKelpVisitorOrganism, animateKelpVisitorOrganism, disposeKelpVisitorOrganism } from './kelpVisitorOrganism.js';

import { isKelpWaterLifeSpecies, createKelpWaterLifeAsset, animateKelpWaterLifeAsset, disposeKelpWaterLifeAsset } from './KelpWaterLifeAssets.js';

const waterSpecies = id => id === 'blue-rockfish';
const visitorSpecies = id => id === 'leopard-shark';
const disposeAnimal = entity => isKelpWaterLifeSpecies(entity.speciesId) ? disposeKelpWaterLifeAsset(entity.object) : isKelpBenthicLifeSpecies(entity.speciesId) ? disposeKelpBenthicLifeAsset(entity.object) :
  visitorSpecies(entity.speciesId) ? disposeKelpVisitorOrganism(entity.object) :
  waterSpecies(entity.speciesId) ? disposeKelpWaterOrganism(entity.object) : disposeKelpOrganism(entity.object);

// Only animals enter entities/picking/counts. Every visible attached snail's
// host uses exactly the attachment clock/anchor (at most 9 cells × 3 hosts);
// the streamed scenery renderer hides those IDs to avoid drawing both meshes.
export class KelpOceanAnimals {
  constructor(catalog) {
    this.catalog = new Map(catalog.map(species => [species.id, species]));
    this.root = new THREE.Group(); this.root.name = 'Regional kelp animals';
    this.root.userData.oceanStreaming = true; this.root.userData.role = 'regional-kelp-animal-populations';
    this.entities = new Map(); this.objects = this.entities; this.hosts = new Map();
    this.renderOrigin = { x: 0, z: 0 }; this._pickableObjects = []; this._disposed = false;
    this._observationAgentId = null;
  }
  sync(agents) {
    if (this._disposed) return false;
    const live = new Map(agents.filter(agent => agent.alive !== false && this.catalog.has(agent.speciesId) &&
      this.catalog.get(agent.speciesId).kind !== 'kelp').map(agent => [agent.id, agent]));
    let changed = false;
    for (const [id, entity] of this.entities) {
      if (!live.has(id) || live.get(id).speciesId !== entity.speciesId) {
        disposeAnimal(entity); this.entities.delete(id); changed = true;
      }
    }
    for (const [id, agent] of live) {
      if (this.entities.has(id)) continue;
      const species = this.catalog.get(agent.speciesId);
      const object = isKelpWaterLifeSpecies(agent.speciesId) ? createKelpWaterLifeAsset(species) : isKelpBenthicLifeSpecies(agent.speciesId) ? createKelpBenthicLifeAsset(species) :
        visitorSpecies(agent.speciesId) ? createKelpVisitorOrganism(species) :
        waterSpecies(agent.speciesId) ? createKelpWaterOrganism(species) : createKelpOrganism(species);
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
    const x = Number.isFinite(origin?.x) ? origin.x : 0, z = Number.isFinite(origin?.z) ? origin.z : 0;
    if (x === this.renderOrigin.x && z === this.renderOrigin.z) return false;
    this.renderOrigin = { x, z }; this.root.position.set(-x, 0, -z); this.root.updateMatrixWorld(true); return true;
  }
  setObservationAgent(id) {
    if (this._disposed) return false;
    const next = typeof id === 'string' && id.length ? id : null;
    if (next === this._observationAgentId) return false;
    this._observationAgentId = next; return true;
  }
  _updateHosts(agents, cameraPosition) {
    const candidates = new Map();
    if (this.catalog.has('giant-kelp')) {
      const worldX = cameraPosition ? cameraPosition.x + this.renderOrigin.x : null;
      const worldZ = cameraPosition ? cameraPosition.z + this.renderOrigin.z : null;
      for (const agent of agents) {
        if (!agent.alive || !agent.hostSceneryId || !agent.hostAnchor) continue;
        const pinned = agent.id === this._observationAgentId;
        const distance = cameraPosition ? Math.hypot(agent.hostAnchor.x - worldX, agent.hostAnchor.z - worldZ) : Infinity;
        if (!pinned && distance > 16) continue;
        const previous = candidates.get(agent.hostSceneryId);
        // A second animal on the same plant must not erase the selected host's
        // priority before the final three-host budget is applied.
        if (!previous || pinned || (!previous.pinned && distance < previous.distance)) {
          candidates.set(agent.hostSceneryId, { agent, distance, pinned });
        }
      }
    }
    const chosen = new Map([...candidates].sort((a, b) => Number(b[1].pinned) - Number(a[1].pinned) ||
      a[1].distance - b[1].distance || a[0].localeCompare(b[0])).slice(0, 27));
    for (const [id, object] of this.hosts) if (!chosen.has(id)) { disposeKelpOrganism(object); this.hosts.delete(id); }
    for (const [id, { agent }] of chosen) {
      let object = this.hosts.get(id);
      if (!object) {
        object = createKelpOrganism(this.catalog.get('giant-kelp'), { anchor: agent.hostAnchor });
        object.userData.sceneryId = id; object.userData.role = 'regional-kelp-attachment-support';
        this.root.add(object); this.hosts.set(id, object);
      }
      animateKelpOrganism(object, agent.hostTimeSec ?? agent.timeSec ?? 0, agent.hostEnvironment ?? agent.localEnvironment ?? {}, agent.hostAnchor);
    }
  }
  update(agents, timeSec, origin = this.renderOrigin, cameraPosition = null) {
    if (this._disposed) return false;
    const changed = this.sync(agents); this.setRenderOrigin(origin);
    for (const agent of agents) {
      const entity = this.entities.get(agent.id); if (!entity || agent.alive === false) continue;
      const object = entity.object, heading = Number.isFinite(agent.heading) ? agent.heading : 0;
      object.position.set(agent.position.x, agent.position.y, agent.position.z); object.scale.setScalar(agent.sizeM || .1);
      object.rotation.set(0, -heading, 0); object.userData.regionId = agent.regionId;
      if (isKelpWaterLifeSpecies(entity.speciesId)) {
        object.rotation.z = entity.kind === 'jellyfish' ? 0 : THREE.MathUtils.clamp(Number.isFinite(agent.pitch) ? agent.pitch : 0, -.12, .12);
      } else if (entity.kind === 'fish') {
        object.rotation.z = THREE.MathUtils.clamp(Math.atan2(agent.velocity?.y || 0,
          Math.max(.08, Math.hypot(agent.velocity?.x || 0, agent.velocity?.z || 0))), -.25, .25);
      } else if (agent.supportNormal) {
        const up = new THREE.Vector3(agent.supportNormal.x, agent.supportNormal.y, agent.supportNormal.z).normalize();
        const forward = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
        forward.addScaledVector(up, -forward.dot(up)).normalize();
        const side = new THREE.Vector3().crossVectors(forward, up).normalize();
        object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, up, side));
      }
      const clock = Number.isFinite(agent.timeSec) ? agent.timeSec : timeSec;
      if (isKelpWaterLifeSpecies(entity.speciesId)) animateKelpWaterLifeAsset(object, clock, agent);
      else if (isKelpBenthicLifeSpecies(entity.speciesId)) animateKelpBenthicLifeAsset(object, clock, agent);
      else if (visitorSpecies(entity.speciesId)) animateKelpVisitorOrganism(object, clock, agent);
      else if (waterSpecies(entity.speciesId)) animateKelpWaterOrganism(object, clock, agent);
      else animateKelpOrganism(object, clock, agent.localEnvironment ?? {});
    }
    this._updateHosts(agents, cameraPosition);
    for (const agent of agents) {
      const entity = this.entities.get(agent.id);
      if (entity) entity.object.visible = !agent.attachment || this.hosts.has(agent.hostSceneryId);
    }
    this.root.updateMatrixWorld(true); return changed;
  }
  getObject(id) { return this.entities.get(id)?.object ?? null; }
  get pickableObjects() { return this._pickableObjects; }
  get detailedHostIds() { return [...this.hosts.keys()]; }
  get stats() {
    const speciesCounts = {};
    for (const entity of this.entities.values()) speciesCounts[entity.speciesId] = (speciesCounts[entity.speciesId] || 0) + 1;
    return { activeAnimals: this.entities.size, speciesCounts, detailedHosts: this.hosts.size,
      detailedHostIds: this.detailedHostIds, observationAgentId: this._observationAgentId, renderOrigin: { ...this.renderOrigin } };
  }
  reset() {
    for (const entity of this.entities.values()) disposeAnimal(entity);
    for (const object of this.hosts.values()) disposeKelpOrganism(object);
    this.entities.clear(); this.hosts.clear(); this._pickableObjects = [];
    this._observationAgentId = null;
  }
  dispose() { if (this._disposed) return; this.reset(); this._disposed = true; this.root.removeFromParent(); }
}
