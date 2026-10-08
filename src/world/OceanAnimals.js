import * as THREE from 'three';
import { createOrganism, animateOrganism, disposeOrganism, updateOrganismDetail } from './organisms.js';
import { createOceanTurtleOrganism, animateOceanTurtleOrganism, disposeOceanTurtleOrganism } from './OceanTurtleOrganisms.js';
import { isReefGuildSpecies, createReefGuildOrganism, animateReefGuildOrganism,
  updateReefGuildDetail, disposeReefGuildOrganism } from './reefGuildAssets.js';
import { isOpenWaterSpecies, createOpenWaterOrganism, animateOpenWaterOrganism,
  updateOpenWaterDetail, disposeOpenWaterOrganism } from './openWaterLifeAssets.js';
import { isOceanBiodiversitySpecies, createOceanBiodiversityAsset, animateOceanBiodiversityAsset,
  disposeOceanBiodiversityAsset, OceanBiodiversityPatches } from './OceanBiodiversityAssets.js';
import { isOceanBenthicLifeSpecies, createOceanBenthicLifeAsset, animateOceanBenthicLifeAsset,
  disposeOceanBenthicLifeAsset } from './OceanBenthicLifeAssets.js';
import { isOceanMeadowLifeSpecies, createOceanMeadowLifeAsset, animateOceanMeadowLifeAsset,
  disposeOceanMeadowLifeAsset } from './OceanMeadowLifeAssets.js';
import { isOceanShoalLifeSpecies, createOceanShoalLifeAsset, animateOceanShoalLifeAsset,
  disposeOceanShoalLifeAsset } from './OceanShoalLifeAssets.js';
import { isReefResidentSpecies, createReefResidentAnimal, animateReefResidentAnimal,
  disposeReefResidentAnimal } from './OceanReefResidentsAssets.js';
import { isReefDiversityFish, createReefDiversityFish, animateReefDiversityFish, disposeReefDiversityFish } from './OceanReefDiversityFishAssets.js';
import { isReefDiversityBenthic, createReefDiversityBenthic, animateReefDiversityBenthic, disposeReefDiversityBenthic } from './OceanReefDiversityBenthicAssets.js';
import { isReefCommunityFish, createReefCommunityFish, animateReefCommunityFish, disposeReefCommunityFish } from './OceanReefCommunityFishAssets.js';
import { isReefCommunityBenthic, createReefCommunityBenthic, animateReefCommunityBenthic, disposeReefCommunityBenthic } from './OceanReefCommunityBenthicAssets.js';
import { isReefLifeFish, createReefLifeFish, animateReefLifeFish, disposeReefLifeFish } from './OceanReefLifeFishAssets.js';
import { isReefLifeBenthic, createReefLifeBenthic, animateReefLifeBenthic, disposeReefLifeBenthic } from './OceanReefLifeBenthicAssets.js';
import { isReefFaunaFish, createReefFaunaFish, animateReefFaunaFish, disposeReefFaunaFish } from './OceanReefFaunaFishAssets.js';
import { isReefFaunaBenthic, createReefFaunaBenthic, animateReefFaunaBenthic, disposeReefFaunaBenthic } from './OceanReefFaunaBenthicAssets.js';
import { isReefAssemblageFish, createReefAssemblageFish, animateReefAssemblageFish, disposeReefAssemblageFish } from './OceanReefAssemblageFishAssets.js';
import { isReefAssemblageBenthic, createReefAssemblageBenthic, animateReefAssemblageBenthic, disposeReefAssemblageBenthic } from './OceanReefAssemblageBenthicAssets.js';
const isTurtle = entity => entity.speciesId === 'green-turtle';
const disposeAnimal = entity => isTurtle(entity) ? disposeOceanTurtleOrganism(entity.object)
  : isReefAssemblageFish(entity.speciesId) ? disposeReefAssemblageFish(entity.object)
  : isReefAssemblageBenthic(entity.speciesId) ? disposeReefAssemblageBenthic(entity.object)
  : isReefFaunaFish(entity.speciesId) ? disposeReefFaunaFish(entity.object)
  : isReefFaunaBenthic(entity.speciesId) ? disposeReefFaunaBenthic(entity.object)
  : isReefLifeFish(entity.speciesId) ? disposeReefLifeFish(entity.object)
  : isReefLifeBenthic(entity.speciesId) ? disposeReefLifeBenthic(entity.object)
  : isReefCommunityFish(entity.speciesId) ? disposeReefCommunityFish(entity.object)
  : isReefCommunityBenthic(entity.speciesId) ? disposeReefCommunityBenthic(entity.object)
  : isReefDiversityFish(entity.speciesId) ? disposeReefDiversityFish(entity.object)
  : isReefDiversityBenthic(entity.speciesId) ? disposeReefDiversityBenthic(entity.object)
  : isReefResidentSpecies(entity.speciesId) ? disposeReefResidentAnimal(entity.object)
  : isOceanBiodiversitySpecies(entity.speciesId) ? disposeOceanBiodiversityAsset(entity.object)
  : isOceanShoalLifeSpecies(entity.speciesId) ? disposeOceanShoalLifeAsset(entity.object)
  : isOceanMeadowLifeSpecies(entity.speciesId) ? disposeOceanMeadowLifeAsset(entity.object)
  : isOceanBenthicLifeSpecies(entity.speciesId) ? disposeOceanBenthicLifeAsset(entity.object)
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
    this._biodiversityPatches = null;
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
        : isReefAssemblageFish(agent.speciesId) ? createReefAssemblageFish(species)
        : isReefAssemblageBenthic(agent.speciesId) ? createReefAssemblageBenthic(species)
        : isReefFaunaFish(agent.speciesId) ? createReefFaunaFish(species)
        : isReefFaunaBenthic(agent.speciesId) ? createReefFaunaBenthic(species)
        : isReefLifeFish(agent.speciesId) ? createReefLifeFish(species)
        : isReefLifeBenthic(agent.speciesId) ? createReefLifeBenthic(species)
        : isReefCommunityFish(agent.speciesId) ? createReefCommunityFish(species)
        : isReefCommunityBenthic(agent.speciesId) ? createReefCommunityBenthic(species)
        : isReefDiversityFish(agent.speciesId) ? createReefDiversityFish(species)
        : isReefDiversityBenthic(agent.speciesId) ? createReefDiversityBenthic(species)
        : isReefResidentSpecies(agent.speciesId) ? createReefResidentAnimal(species, agent)
        : isOceanBiodiversitySpecies(agent.speciesId) ? createOceanBiodiversityAsset(species).group
        : isOceanShoalLifeSpecies(agent.speciesId) ? createOceanShoalLifeAsset(species).group
        : isOceanMeadowLifeSpecies(agent.speciesId) ? createOceanMeadowLifeAsset(species).group
        : isOceanBenthicLifeSpecies(agent.speciesId) ? createOceanBenthicLifeAsset(species).group
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
  update(agents, timeSec, renderOrigin = this.renderOrigin, cameraPosition = null, scenery = []) {
    if (this._disposed) return false;
    let changed = this.sync(agents);
    if (Array.isArray(scenery) && scenery.length && !this._biodiversityPatches) {
      this._biodiversityPatches = new OceanBiodiversityPatches(); this.root.add(this._biodiversityPatches.root);
    }
    if (this._biodiversityPatches) changed = this._biodiversityPatches.update(scenery, renderOrigin) || changed;
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
      if (isReefResidentSpecies(entity.speciesId) || isReefDiversityFish(entity.speciesId) || isReefDiversityBenthic(entity.speciesId) || isReefCommunityFish(entity.speciesId) || isReefCommunityBenthic(entity.speciesId) || isReefLifeFish(entity.speciesId) || isReefLifeBenthic(entity.speciesId) || isReefFaunaFish(entity.speciesId) || isReefFaunaBenthic(entity.speciesId) || isReefAssemblageFish(entity.speciesId) || isReefAssemblageBenthic(entity.speciesId)) {
        if (entity.speciesId === 'painted-spiny-lobster' || isReefDiversityBenthic(entity.speciesId) || isReefCommunityBenthic(entity.speciesId) || isReefLifeBenthic(entity.speciesId) || isReefFaunaBenthic(entity.speciesId) || isReefAssemblageBenthic(entity.speciesId)) {
          const up = new THREE.Vector3(agent.supportNormal?.x ?? 0, agent.supportNormal?.y ?? 1, agent.supportNormal?.z ?? 0).normalize();
          const forward = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
          forward.addScaledVector(up, -forward.dot(up)).normalize();
          const side = new THREE.Vector3().crossVectors(forward, up).normalize();
          object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, up, side));
        } else {
          const pitchLimit = this.catalog.get(entity.speciesId)?.support?.pitchLimitRad ?? .10;
          object.rotation.z = Number.isFinite(agent.pitch) ? THREE.MathUtils.clamp(agent.pitch, -pitchLimit, pitchLimit) : 0;
        }
      } else if (isOceanShoalLifeSpecies(entity.speciesId)) {
        object.rotation.z = Number.isFinite(agent.pitch) ? THREE.MathUtils.clamp(agent.pitch, -.12, .12) : 0;
      } else if (isOceanMeadowLifeSpecies(entity.speciesId)) {
        if (entity.speciesId === 'barrel-sea-pen' || entity.speciesId === 'spider-conch') {
          const up = new THREE.Vector3(agent.supportNormal?.x ?? 0, agent.supportNormal?.y ?? 1, agent.supportNormal?.z ?? 0).normalize();
          const forward = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
          forward.addScaledVector(up, -forward.dot(up)).normalize();
          const side = new THREE.Vector3().crossVectors(forward, up).normalize();
          object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, up, side));
        } else if (entity.speciesId === 'reef-cuttlefish') object.rotation.z = Number.isFinite(agent.pitch) ? THREE.MathUtils.clamp(agent.pitch, -.15, .15) : 0;
      } else if (entity.kind === 'fish') {
        const horizontalSpeed = Math.hypot(agent.velocity?.x || 0, agent.velocity?.z || 0);
        object.rotation.z = THREE.MathUtils.clamp(
          Math.atan2(agent.velocity?.y || 0, Math.max(.08, horizontalSpeed)), -.25, .25);
        if (agent.state === 'grazing' && typeof agent.lastFeedAt === 'number') {
          const since = agentTimeSec - agent.lastFeedAt;
          if (since >= 0 && since < .7) object.rotation.z -= .18 * Math.sin(since / .7 * Math.PI);
        }
      } else if (entity.kind === 'ray') {
        // This bottom ray admits its whole long tail in a horizontal pose;
        // sampled floor-height changes are translation, not body pitch.
        if (entity.speciesId === 'blue-spotted-ray') object.rotation.z = 0;
        else {
          const horizontalSpeed = Math.hypot(agent.velocity?.x || 0, agent.velocity?.z || 0);
          object.rotation.z = THREE.MathUtils.clamp(
            Math.atan2(agent.velocity?.y || 0, Math.max(.08, horizontalSpeed)), -.2, .2);
        }
      }
      object.userData.regionId = agent.regionId;
      if (entity.kind === 'turtle') {
        object.rotation.z = Number.isFinite(agent.pitch) ? THREE.MathUtils.clamp(agent.pitch, -.15, .15) : 0;
        animateOceanTurtleOrganism(object, agentTimeSec, agent);
      } else if (isReefAssemblageFish(entity.speciesId)) animateReefAssemblageFish(object, agent, agentTimeSec);
      else if (isReefAssemblageBenthic(entity.speciesId)) animateReefAssemblageBenthic(object, agent, agentTimeSec);
      else if (isReefFaunaFish(entity.speciesId)) animateReefFaunaFish(object, agent, agentTimeSec);
      else if (isReefFaunaBenthic(entity.speciesId)) animateReefFaunaBenthic(object, agent, agentTimeSec);
      else if (isReefLifeFish(entity.speciesId)) animateReefLifeFish(object, agent, agentTimeSec);
      else if (isReefLifeBenthic(entity.speciesId)) animateReefLifeBenthic(object, agent, agentTimeSec);
      else if (isReefCommunityFish(entity.speciesId)) animateReefCommunityFish(object, agent, agentTimeSec);
      else if (isReefCommunityBenthic(entity.speciesId)) animateReefCommunityBenthic(object, agent, agentTimeSec);
      else if (isReefDiversityFish(entity.speciesId)) animateReefDiversityFish(object, agent, agentTimeSec);
      else if (isReefDiversityBenthic(entity.speciesId)) animateReefDiversityBenthic(object, agent, agentTimeSec);
      else if (isReefResidentSpecies(entity.speciesId)) animateReefResidentAnimal(object, agent, agentTimeSec);
      else if (isOceanShoalLifeSpecies(entity.speciesId)) animateOceanShoalLifeAsset(object, agentTimeSec, agent);
      else if (isOceanMeadowLifeSpecies(entity.speciesId)) animateOceanMeadowLifeAsset(object, agentTimeSec, agent);
      else if (isOceanBiodiversitySpecies(entity.speciesId)) animateOceanBiodiversityAsset(object, agentTimeSec, agent);
      else if (isOceanBenthicLifeSpecies(entity.speciesId)) animateOceanBenthicLifeAsset(object, agentTimeSec, agent);
      else if (isReefGuildSpecies(entity.speciesId)) animateReefGuildOrganism(object, agentTimeSec, agent);
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
    return { activeAnimals: this.entities.size, speciesCounts, renderOrigin: { ...this.renderOrigin },
      ...(this._biodiversityPatches ? { biodiversityScenery: this._biodiversityPatches.stats } : {}) };
  }

  reset() {
    for (const entity of this.entities.values()) disposeAnimal(entity);
    this.entities.clear();
    this._pickableObjects = [];
    this._biodiversityPatches?.reset();
  }

  dispose() {
    if (this._disposed) return;
    this.reset();
    this._biodiversityPatches?.dispose(); this._biodiversityPatches = null;
    this._disposed = true;
    this.root.removeFromParent();
  }
}
