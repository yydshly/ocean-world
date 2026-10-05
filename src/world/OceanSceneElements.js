import * as THREE from 'three';
import { sceneElementMesh, OCEAN_SCENE_ELEMENT_LIMIT } from '../oceanSceneElements.js';

const KINDS = ['stone', 'plant-clump', 'bottle', 'driftwood'];
const VARIANTS = { stone: [0, 1], 'plant-clump': [0], bottle: [0], driftwood: [0] };
const MAX_INSTANCES = 9 * OCEAN_SCENE_ELEMENT_LIMIT, MAX_BATCHES = 5;
const ROLE = 'scenery-only-not-animals-food-or-biomass';
const finite = Number.isFinite;
const counts = () => Object.fromEntries(KINDS.map(kind => [kind, 0]));

function normalizedElements(elements) {
  if (!Array.isArray(elements) || elements.length > MAX_INSTANCES)
    throw new TypeError('Scene elements must fit the finite nine-owner landscape window.');
  const seen = new Set();
  return elements.map(element => {
    const variant = element?.variant ?? 0, rotationY = element?.rotation ?? element?.rotationY ?? 0;
    if (typeof element?.id !== 'string' || !element.id || seen.has(element.id) ||
      !VARIANTS[element.kind]?.includes(variant) ||
      !['x', 'y', 'z'].every(axis => finite(element[axis])) || !finite(rotationY) ||
      (element.rotation !== undefined && element.rotationY !== undefined && element.rotation !== element.rotationY) ||
      !['x', 'y', 'z'].every(axis => finite(element.scale?.[axis]) && element.scale[axis] > 0))
      throw new TypeError('Scene elements need unique identities and finite supported metre transforms.');
    seen.add(element.id);
    return { id: element.id, kind: element.kind, variant, x: element.x, y: element.y, z: element.z,
      rotationY, scale: { ...element.scale } };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
function sameElements(a, b) {
  return a.length === b.length && a.every((element, index) => {
    const previous = b[index];
    return ['id', 'kind', 'variant', 'x', 'y', 'z', 'rotationY'].every(key => element[key] === previous[key]) &&
      ['x', 'y', 'z'].every(axis => element.scale[axis] === previous.scale[axis]);
  });
}

/** One finite loaded landscape layer. Every vertex uses the shared support
 * mesh; plants and flooded discovery props are scenery rather than food. */
export class OceanSceneElements {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'Ocean scene elements';
    Object.assign(this.root.userData, { oceanStreaming: true, role: ROLE, pickable: false });
    this.renderOrigin = { x: 0, z: 0 }; this._matrixOrigin = { x: 0, z: 0 };
    this._elements = []; this._instances = new Map(); this._geometries = new Map();
    this._materials = {
      stone: new THREE.MeshStandardMaterial({ color: 0x7c8171, roughness: .96, metalness: 0 }),
      'plant-clump': new THREE.MeshStandardMaterial({ color: 0x526646, roughness: .88, metalness: 0, side: THREE.DoubleSide }),
      bottle: new THREE.MeshStandardMaterial({ color: 0x8aaba1, roughness: .7, metalness: 0,
        transparent: true, opacity: .46, depthWrite: false, side: THREE.DoubleSide }),
      driftwood: new THREE.MeshStandardMaterial({ color: 0x726854, roughness: .99, metalness: 0 }),
    };
    this._transform = new THREE.Object3D(); this._disposed = false;
    this._visualTimeSec = 0; this._currentMps = 0;
  }

  _geometry(kind, variant) {
    const key = `${kind}:${variant}`; let geometry = this._geometries.get(key);
    if (geometry) return geometry;
    const data = sceneElementMesh(kind, variant);
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.sharedSceneElement = Object.freeze({ kind, variant });
    this._geometries.set(key, geometry); return geometry;
  }

  _removeInstances() {
    for (const mesh of this._instances.values()) { mesh.removeFromParent(); mesh.dispose(); }
    this._instances.clear();
  }

  update(elements, generator, renderOrigin = this.renderOrigin) {
    if (this._disposed) return false;
    const next = normalizedElements(elements);
    if (!finite(renderOrigin?.x) || !finite(renderOrigin?.z)) throw new TypeError('Scene render origin needs finite X/Z.');
    const rebased = this.setRenderOrigin(renderOrigin);
    if (sameElements(next, this._elements)) return rebased;
    const batches = new Map();
    for (const element of next) {
      const key = `${element.kind}:${element.variant}`;
      if (!batches.has(key)) batches.set(key, []); batches.get(key).push(element);
    }
    // Prepare shared prototypes before replacing this layer's instance buffers.
    for (const batch of batches.values()) this._geometry(batch[0].kind, batch[0].variant);
    this._removeInstances(); this._matrixOrigin = { ...this.renderOrigin }; this.root.position.set(0, 0, 0);
    for (const [key, batch] of batches) {
      const first = batch[0], mesh = new THREE.InstancedMesh(this._geometries.get(key), this._materials[first.kind], batch.length);
      mesh.name = `Scene elements ${key}`;
      Object.assign(mesh.userData, { oceanStreaming: true, role: ROLE, pickable: false,
        landscapeKind: first.kind, variant: first.variant, elementIds: batch.map(element => element.id) });
      mesh.castShadow = false; mesh.receiveShadow = true;
      for (let index = 0; index < batch.length; index++) {
        const element = batch[index];
        this._transform.position.set(element.x - this._matrixOrigin.x, element.y, element.z - this._matrixOrigin.z);
        this._transform.rotation.set(0, element.rotationY, 0);
        this._transform.scale.set(element.scale.x, element.scale.y, element.scale.z);
        this._transform.updateMatrix(); mesh.setMatrixAt(index, this._transform.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      this.root.add(mesh); this._instances.set(key, mesh);
    }
    this._elements = next; this._generator = generator;
    this.root.updateMatrixWorld(true); return true;
  }

  setRenderOrigin(origin) {
    if (this._disposed) return false;
    if (!finite(origin?.x) || !finite(origin?.z)) throw new TypeError('Scene render origin needs finite X/Z.');
    if (origin.x === this.renderOrigin.x && origin.z === this.renderOrigin.z) return false;
    this.renderOrigin = { x: origin.x, z: origin.z };
    this.root.position.set(this._matrixOrigin.x - origin.x, 0, this._matrixOrigin.z - origin.z);
    this.root.updateMatrixWorld(true); return true;
  }

  setEnvironment(environment, visualTimeSec = null) {
    if (this._disposed) return false;
    if (finite(visualTimeSec)) this._visualTimeSec = visualTimeSec;
    if (finite(environment?.currentMps)) this._currentMps = environment.currentMps;
    // World lights and fog provide the environmental appearance. Keeping these
    // vertices static preserves the same complete crown/solid support envelope.
    return true;
  }

  get stats() {
    const typeCounts = counts(); for (const element of this._elements) typeCounts[element.kind]++;
    const prototypeGeometries = this._geometries.size, prototypeMaterials = this._disposed ? 0 : KINDS.length;
    return { counts: { ...typeCounts }, typeCounts, instances: this._elements.length, drawCalls: this._instances.size,
      prototypeGeometries, prototypeMaterials, prototypes: { geometries: prototypeGeometries, materials: prototypeMaterials },
      maxInstances: MAX_INSTANCES, maxDrawCalls: MAX_BATCHES, maxPrototypeGeometries: MAX_BATCHES,
      renderOrigin: { ...this.renderOrigin }, role: ROLE, pickable: false,
      visualTimeSec: this._visualTimeSec, currentMps: this._currentMps, animationScope: 'static-shared-support-geometry' };
  }

  reset() {
    if (this._disposed) return false;
    const changed = this._instances.size > 0;
    this._removeInstances(); this._elements = []; this._generator = null;
    this._matrixOrigin = { ...this.renderOrigin }; this.root.position.set(0, 0, 0); this._visualTimeSec = 0;
    return changed;
  }

  dispose() {
    if (this._disposed) return;
    this.reset(); this._disposed = true;
    for (const geometry of this._geometries.values()) geometry.dispose(); this._geometries.clear();
    for (const material of Object.values(this._materials)) material.dispose();
    this.root.clear(); this.root.removeFromParent();
  }
}
