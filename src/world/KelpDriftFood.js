import * as THREE from 'three';
import { kelpDriftFootprint, KELP_DRIFT_VERTEX_COUNT } from '../kelpDriftGeometry.js';

const shared = new Map();
const MAX_REGIONS = 9, MAX_HOSTS_PER_REGION = 3, MAX_PATCHES_PER_HOST = 3;
const finitePoint = point => point && ['x', 'y', 'z'].every(axis => Number.isFinite(point[axis]));
function acquire(owner, key, make) {
  let entry = shared.get(key);
  if (!entry) { entry = { value: make(), refs: 0 }; shared.set(key, entry); }
  if (!owner._shared.has(key)) { owner._shared.add(key); entry.refs++; }
  return entry.value;
}
function template(count, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setIndex(indices);
  return geometry;
}

// One supported thin leaf segment represents a positive local food stock.
// Its fixed authored footprint is neither tissue mass nor fallen leaf count.
// The ecology owns placement/contact/stock; this display adds no transport,
// clock, decay, animal, food, or independent placement randomness.
export class KelpDriftFood {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'Regional settled drift-kelp food';
    this.root.userData.oceanStreaming = true;
    this.root.userData.role = 'regional-drift-kelp-stock-proxy';
    this.objects = new Map(); this.renderOrigin = { x: 0, z: 0 };
    this._shared = new Set(); this._disposed = false;
    this.material = acquire(this, 'material/settled-kelp', () => new THREE.MeshStandardMaterial({
      color: '#958044', roughness: .88, metalness: 0, side: THREE.DoubleSide,
      emissive: '#000000', emissiveIntensity: 0,
    }));
  }
  setRenderOrigin(origin) {
    if (this._disposed) return false;
    const x = Number.isFinite(origin?.x) ? origin.x : 0, z = Number.isFinite(origin?.z) ? origin.z : 0;
    if (x === this.renderOrigin.x && z === this.renderOrigin.z) return false;
    this.renderOrigin = { x, z }; this.root.position.set(-x, 0, -z); this.root.updateMatrixWorld(true);
    return true;
  }
  _remove(id) {
    const object = this.objects.get(id); if (!object) return;
    object.removeFromParent(); object.geometry.dispose(); this.objects.delete(id);
  }
  update(patches, generator, origin = this.renderOrigin) {
    if (this._disposed) return false;
    this.setRenderOrigin(origin);
    const selected = new Map(), regions = new Map(), hosts = new Map();
    for (const patch of [...(patches ?? [])].sort((a, b) => String(a?.id).localeCompare(String(b?.id)))) {
      if (typeof patch?.id !== 'string' || typeof patch.hostId !== 'string' ||
        typeof patch.regionId !== 'string' || !finitePoint(patch.position) ||
        !Number.isFinite(patch.stock) || patch.stock <= 0 || patch.aliveHost === false || selected.has(patch.id)) continue;
      const hostKey = `${patch.regionId}|${patch.hostId}`;
      if (!regions.has(patch.regionId)) {
        if (regions.size >= MAX_REGIONS) continue;
        regions.set(patch.regionId, new Set());
      }
      const regionHosts = regions.get(patch.regionId);
      if (!regionHosts.has(patch.hostId) && regionHosts.size >= MAX_HOSTS_PER_REGION) continue;
      if ((hosts.get(hostKey) ?? 0) >= MAX_PATCHES_PER_HOST) continue;
      regionHosts.add(patch.hostId); hosts.set(hostKey, (hosts.get(hostKey) ?? 0) + 1);
      selected.set(patch.id, patch);
    }
    let changed = false;
    for (const id of this.objects.keys()) if (!selected.has(id)) { this._remove(id); changed = true; }
    for (const [id, patch] of selected) {
      let object = this.objects.get(id);
      const signature = [patch.position.x, patch.position.y, patch.position.z, patch.heading ?? 0].join('/');
      if (!object || object.userData.placementSignature !== signature || object.userData.generator !== generator) {
        const footprint = kelpDriftFootprint(patch, generator);
        const points = footprint?.verticesWorld;
        if (!finitePoint(footprint?.center) || !Array.isArray(points) || points.length !== KELP_DRIFT_VERTEX_COUNT ||
          !points.every(finitePoint)) { if (object) { this._remove(id); changed = true; } continue; }
        if (!object || object.geometry.attributes.position.count !== points.length) {
          if (object) this._remove(id);
          const base = acquire(this, `geometry/leaf-segment-${points.length}`, () => template(points.length, footprint.indices));
          object = new THREE.Mesh(base.clone(), this.material);
          object.name = 'Supported drift-kelp food proxy'; object.castShadow = false; object.receiveShadow = true;
          Object.assign(object.userData, { patchId: id, role: 'regional-drift-kelp-stock-proxy', oceanStreaming: true });
          this.root.add(object); this.objects.set(id, object);
        }
        object.position.set(footprint.center.x, footprint.center.y, footprint.center.z);
        const positions = object.geometry.attributes.position;
        points.forEach((point, index) => positions.setXYZ(index, point.x - footprint.center.x,
          point.y - footprint.center.y, point.z - footprint.center.z));
        positions.needsUpdate = true;
        object.geometry.computeVertexNormals(); object.geometry.computeBoundingBox(); object.geometry.computeBoundingSphere();
        object.userData.placementSignature = signature; object.userData.generator = generator;
        object.userData.contactPointWorld = { ...footprint.center };
        changed = true;
      }
      Object.assign(object.userData, { hostId: patch.hostId, regionId: patch.regionId, stock: patch.stock,
        timeSec: patch.timeSec, stockDisplay: 'positive-stock marker; fixed illustrative footprint, not calibrated tissue mass' });
    }
    this.root.updateMatrixWorld(true); return changed;
  }
  get stats() {
    const objects = [...this.objects.values()];
    return { activePatches: objects.length, activeHosts: new Set(objects.map(object => `${object.userData.regionId}|${object.userData.hostId}`)).size,
      activeRegions: new Set(objects.map(object => object.userData.regionId)).size,
      storedRelativeUnits: objects.reduce((sum, object) => sum + object.userData.stock, 0),
      ownedGeometries: objects.length, maxActivePatches: MAX_REGIONS * MAX_HOSTS_PER_REGION * MAX_PATCHES_PER_HOST,
      renderOrigin: { ...this.renderOrigin }, scope: 'positive stock at loaded live-host collection points; fixed supported leaf-segment proxy' };
  }
  reset() {
    for (const id of [...this.objects.keys()]) this._remove(id);
  }
  dispose() {
    if (this._disposed) return;
    this.reset(); this._disposed = true;
    for (const key of this._shared) {
      const entry = shared.get(key);
      if (entry && --entry.refs <= 0) { entry.value.dispose(); shared.delete(key); }
    }
    this._shared.clear(); this.root.removeFromParent();
  }
}

export function kelpDriftFoodResourceStats() {
  return { assets: shared.size, instances: Math.max(0, ...[...shared.values()].map(entry => entry.refs)) };
}
