import * as THREE from 'three';
import { habitatSceneMesh } from '../oceanHabitatScenes.js';

const KINDS = ['coral-branch', 'coral-table', 'sea-fan', 'grass-meadow'];
const MAX_OWNERS = 9, MAX_PER_OWNER = 36, MAX_INSTANCES = MAX_OWNERS * MAX_PER_OWNER;
const ROLE = 'habitat-scenery-only-not-animals-food-or-biomass';
const emptyCounts = () => Object.fromEntries(KINDS.map(kind => [kind, 0]));

function normalize(elements) {
  if (!Array.isArray(elements) || elements.length > MAX_INSTANCES)
    throw new TypeError('Habitat scenes must fit the finite loaded nine-owner window.');
  const ids = new Set(), owners = new Map();
  return elements.map(element => {
    if (typeof element?.id !== 'string' || !element.id || ids.has(element.id) || !KINDS.includes(element.kind) ||
      !['x', 'y', 'z'].every(axis => Number.isFinite(element[axis])) || !Number.isFinite(element.rotation ?? 0) ||
      !['x', 'y', 'z'].every(axis => Number.isFinite(element.scale?.[axis]) && element.scale[axis] > 0))
      throw new TypeError('Habitat scenes require unique identities and finite positive metre transforms.');
    const owner = `${Math.floor(element.x / 64)},${Math.floor(element.z / 64)}`;
    if (element.regionId !== undefined && element.regionId !== owner)
      throw new TypeError('Habitat scene roots must belong to their declared loaded owner.');
    owners.set(owner, (owners.get(owner) ?? 0) + 1);
    if (owners.get(owner) > MAX_PER_OWNER || owners.size > MAX_OWNERS)
      throw new TypeError('Habitat scene allocation exceeds the finite owner limits.');
    ids.add(element.id);
    return { id: element.id, kind: element.kind, owner, x: element.x, y: element.y, z: element.z,
      rotation: element.rotation ?? 0, scale: { x: element.scale.x, y: element.scale.y, z: element.scale.z } };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
const equal = (a, b) => a.length === b.length && a.every((element, index) =>
  ['id', 'kind', 'owner', 'x', 'y', 'z', 'rotation'].every(key => element[key] === b[index][key]) &&
  ['x', 'y', 'z'].every(axis => element.scale[axis] === b[index].scale[axis]));

/** A bounded loaded habitat field using the exact shared, static CPU meshes.
 * These visual colonies and meadows do not allocate species, food or biomass. */
export class OceanHabitatScenes {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'Ocean habitat scenes';
    Object.assign(this.root.userData, { oceanStreaming: true, role: ROLE, pickable: false });
    this.renderOrigin = { x: 0, z: 0 }; this._matrixOrigin = { x: 0, z: 0 };
    this._elements = []; this._instances = new Map(); this._geometries = new Map();
    this._materials = {
      'coral-branch': new THREE.MeshStandardMaterial({ color: 0xc3ab7d, roughness: .94, metalness: 0 }),
      'coral-table': new THREE.MeshStandardMaterial({ color: 0xbb9364, roughness: .94, metalness: 0 }),
      'sea-fan': new THREE.MeshStandardMaterial({ color: 0xb96f62, roughness: .96, metalness: 0, side: THREE.DoubleSide }),
      'grass-meadow': new THREE.MeshStandardMaterial({ color: 0x608a40, roughness: .89, metalness: 0, side: THREE.DoubleSide }),
    };
    this._transform = new THREE.Object3D(); this._disposed = false;
  }

  _geometry(kind) {
    let geometry = this._geometries.get(kind); if (geometry) return geometry;
    const shared = habitatSceneMesh(kind); geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(shared.positions, 3)); geometry.setIndex(shared.indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.sharedHabitatScene = Object.freeze({ kind });
    this._geometries.set(kind, geometry); return geometry;
  }

  _removeInstances() {
    for (const mesh of this._instances.values()) { mesh.removeFromParent(); mesh.dispose(); }
    this._instances.clear();
  }

  update(elements, generator, renderOrigin = this.renderOrigin) {
    if (this._disposed) return false;
    const next = normalize(elements);
    if (!Number.isFinite(renderOrigin?.x) || !Number.isFinite(renderOrigin?.z))
      throw new TypeError('Habitat render origin requires finite X/Z.');
    const rebased = this.setRenderOrigin(renderOrigin);
    if (equal(next, this._elements)) return rebased;
    const batches = new Map();
    for (const element of next) {
      if (!batches.has(element.kind)) batches.set(element.kind, []); batches.get(element.kind).push(element);
    }
    for (const kind of batches.keys()) this._geometry(kind);
    this._removeInstances(); this._matrixOrigin = { ...this.renderOrigin }; this.root.position.set(0, 0, 0);
    for (const [kind, batch] of batches) {
      const mesh = new THREE.InstancedMesh(this._geometries.get(kind), this._materials[kind], batch.length);
      mesh.name = `Habitat scenes ${kind}`;
      Object.assign(mesh.userData, { oceanStreaming: true, role: ROLE, pickable: false,
        landscapeKind: kind, elementIds: batch.map(element => element.id), ownerIds: [...new Set(batch.map(element => element.owner))] });
      mesh.castShadow = false; mesh.receiveShadow = true;
      for (let index = 0; index < batch.length; index++) {
        const element = batch[index];
        this._transform.position.set(element.x - this._matrixOrigin.x, element.y, element.z - this._matrixOrigin.z);
        this._transform.rotation.set(0, element.rotation, 0);
        this._transform.scale.set(element.scale.x, element.scale.y, element.scale.z);
        this._transform.updateMatrix(); mesh.setMatrixAt(index, this._transform.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      this.root.add(mesh); this._instances.set(kind, mesh);
    }
    this._elements = next; this._generator = generator;
    this.root.updateMatrixWorld(true); return true;
  }

  setRenderOrigin(origin) {
    if (this._disposed) return false;
    if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.z)) throw new TypeError('Habitat render origin requires finite X/Z.');
    if (origin.x === this.renderOrigin.x && origin.z === this.renderOrigin.z) return false;
    this.renderOrigin = { x: origin.x, z: origin.z };
    this.root.position.set(this._matrixOrigin.x - origin.x, 0, this._matrixOrigin.z - origin.z);
    this.root.updateMatrixWorld(true); return true;
  }

  get stats() {
    const typeCounts = emptyCounts(); for (const element of this._elements) typeCounts[element.kind]++;
    const prototypeGeometries = this._geometries.size, prototypeMaterials = this._disposed ? 0 : KINDS.length;
    return { counts: { ...typeCounts }, typeCounts, instances: this._elements.length, drawCalls: this._instances.size,
      owners: new Set(this._elements.map(element => element.owner)).size, maxOwners: MAX_OWNERS, maxPerOwner: MAX_PER_OWNER,
      prototypeGeometries, prototypeMaterials, prototypes: { geometries: prototypeGeometries, materials: prototypeMaterials },
      maxInstances: MAX_INSTANCES, maxDrawCalls: KINDS.length, maxPrototypeGeometries: KINDS.length,
      renderOrigin: { ...this.renderOrigin }, role: ROLE, pickable: false, animationScope: 'static-shared-support-geometry' };
  }

  reset() {
    if (this._disposed) return false;
    const changed = this._instances.size > 0;
    this._removeInstances(); this._elements = []; this._generator = null;
    this._matrixOrigin = { ...this.renderOrigin }; this.root.position.set(0, 0, 0); return changed;
  }

  dispose() {
    if (this._disposed) return;
    this.reset(); this._disposed = true;
    for (const geometry of this._geometries.values()) geometry.dispose(); this._geometries.clear();
    for (const material of Object.values(this._materials)) material.dispose();
    this.root.clear(); this.root.removeFromParent();
  }
}
