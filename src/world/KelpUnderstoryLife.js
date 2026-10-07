import * as THREE from 'three';
import { isKelpUnderstoryLifePlant, createKelpUnderstoryLifeAsset,
  animateKelpUnderstoryLifeAsset, disposeKelpUnderstoryLifeAsset } from './KelpUnderstoryLifeAssets.js';

const MAX_REGIONS = 9, MAX_PLANTS = 12;
const finiteVector = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));

/** Actual committed root descriptors. Visual leaves never add animals or biomass. */
export class KelpUnderstoryLife {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'Rock-attached understory community plants';
    Object.assign(this.root.userData, { oceanStreaming: true, role: 'persistent-plant-scenery-not-biomass', pickable: false });
    this.objects = new Map(); this.renderOrigin = { x: 0, z: 0 }; this._disposed = false;
  }
  setRenderOrigin(origin) {
    if (this._disposed) return false;
    if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.z)) throw new TypeError('Understory life origin needs finite X/Z.');
    if (origin.x === this.renderOrigin.x && origin.z === this.renderOrigin.z) return false;
    this.renderOrigin = { x: origin.x, z: origin.z };
    this.root.position.set(-origin.x, 0, -origin.z); this.root.updateMatrixWorld(true); return true;
  }
  _remove(id) {
    const entry = this.objects.get(id); if (!entry) return;
    disposeKelpUnderstoryLifeAsset(entry.object); this.objects.delete(id);
  }
  update(regions, origin = this.renderOrigin) {
    if (this._disposed) return false;
    this.setRenderOrigin(origin);
    const selected = new Map(), owners = new Set();
    for (const region of regions ?? []) {
      if (owners.size >= MAX_REGIONS || typeof region?.id !== 'string' || owners.has(region.id)) continue;
      if (!Array.isArray(region.understoryLife?.plants) || !Number.isFinite(region.timeSec)) continue;
      owners.add(region.id); let count = 0;
      for (const plant of region.understoryLife.plants) {
        if (count >= MAX_PLANTS) break;
        if (plant?.regionId !== region.id || !isKelpUnderstoryLifePlant(plant.speciesId) ||
            !finiteVector(plant.position) || !finiteVector(plant.supportNormal) ||
            !Number.isFinite(plant.sizeM) || plant.sizeM <= 0 || typeof plant.id !== 'string' || selected.has(plant.id)) continue;
        selected.set(plant.id, { plant, region }); count++;
      }
    }
    let changed = false;
    for (const [id, entry] of this.objects) if (!selected.has(id) || selected.get(id).plant.speciesId !== entry.speciesId) {
      this._remove(id); changed = true;
    }
    for (const [id, { plant, region }] of selected) {
      let entry = this.objects.get(id);
      if (!entry) {
        const object = createKelpUnderstoryLifeAsset(plant.speciesId);
        Object.assign(object.userData, { plantId: id, regionId: region.id, oceanStreaming: true, pickable: false,
          role: 'persistent-plant-scenery-not-biomass' });
        object.traverse(child => { if (child.isMesh) { child.castShadow = false; child.receiveShadow = true; } });
        this.root.add(object); entry = { object, speciesId: plant.speciesId }; this.objects.set(id, entry); changed = true;
      }
      const object = entry.object, heading = plant.heading ?? 0;
      object.position.set(plant.position.x, plant.position.y, plant.position.z); object.scale.setScalar(plant.sizeM);
      const up = new THREE.Vector3(plant.supportNormal.x, plant.supportNormal.y, plant.supportNormal.z).normalize();
      const forward = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
      forward.addScaledVector(up, -forward.dot(up)).normalize();
      const side = new THREE.Vector3().crossVectors(forward, up).normalize();
      object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, up, side));
      animateKelpUnderstoryLifeAsset(object, region.timeSec, { ...plant, timeSec: region.timeSec,
        localEnvironment: region.localEnvironment ?? {} });
    }
    this.root.updateMatrixWorld(true); return changed;
  }
  get stats() {
    const speciesCounts = {};
    for (const { speciesId } of this.objects.values()) speciesCounts[speciesId] = (speciesCounts[speciesId] ?? 0) + 1;
    return { activePlants: this.objects.size, speciesCounts, renderOrigin: { ...this.renderOrigin }, role: 'scenery-not-biomass' };
  }
  reset() { for (const id of [...this.objects.keys()]) this._remove(id); }
  dispose() { if (this._disposed) return; this.reset(); this.root.removeFromParent(); this._disposed = true; }
}
