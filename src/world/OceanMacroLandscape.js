import * as THREE from 'three';
import { macroLandscapeMesh, macroPlantMesh, OCEAN_MACRO_LANDSCAPE_LIMITS } from '../oceanMacroLandscape.js';
import { enableStaticRayQueries } from './reefSpatialQueries.js';
import { createOceanMacroSurfaceMaterial, macroSurfaceCoordinates } from './oceanMacroSurfaceMaterial.js';

const KINDS = ['reef-mass', 'meadow-shoot', 'reef-colony'];
const PLANT_KINDS = ['meadow-shoot', 'coral-branch', 'coral-table', 'sea-fan'];
const MAX_OWNERS = 9;
const ROLE = 'macro-landscape-scenery-only-not-animals-food-or-biomass';
const emptyCounts = () => Object.fromEntries(KINDS.map(kind => [kind, 0]));
const signature = elements => JSON.stringify(elements);
const hash = value => { let n = 2166136261; for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619); return (n >>> 0) / 4294967296; };
const plantKind = element => element.kind === 'meadow-shoot' ? element.kind : element.colonyKind;

function normalize(elements) {
  if (!Array.isArray(elements) || elements.length > MAX_OWNERS * OCEAN_MACRO_LANDSCAPE_LIMITS.total)
    throw new TypeError('Macro landscape must fit the finite nine-owner loaded window.');
  const ids = new Set(), owners = new Map();
  return elements.map(element => {
    if (typeof element?.id !== 'string' || !element.id || ids.has(element.id) || !KINDS.includes(element.kind) ||
      !['x', 'y', 'z'].every(axis => Number.isFinite(element[axis])) || !Number.isFinite(element.rotation ?? 0) ||
      !['x', 'y', 'z'].every(axis => Number.isFinite(element.scale?.[axis]) && element.scale[axis] > 0))
      throw new TypeError('Macro landscape requires unique identities and finite metre transforms.');
    const cx = Math.floor(element.x / 64), cz = Math.floor(element.z / 64), owner = `${cx},${cz}`;
    if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz) || element.regionId !== owner)
      throw new TypeError('Macro landscape roots must belong to their declared loaded owner.');
    const counts = owners.get(owner) ?? emptyCounts(); counts[element.kind]++;
    owners.set(owner, counts);
    if (owners.size > MAX_OWNERS || counts[element.kind] > OCEAN_MACRO_LANDSCAPE_LIMITS[element.kind])
      throw new TypeError('Macro landscape exceeds its finite per-owner allocation.');
    const next = { id: element.id, regionId: owner, kind: element.kind, x: element.x, y: element.y, z: element.z,
      rotation: element.rotation ?? 0, scale: { x: element.scale.x, y: element.scale.y, z: element.scale.z } };
    if (element.kind === 'reef-colony') {
      next.colonyKind = element.colonyKind ?? 'coral-branch';
      if (!PLANT_KINDS.slice(1).includes(next.colonyKind)) throw new TypeError('Unknown macro colony prototype.');
    }
    if (element.kind === 'reef-mass') {
      const grid = element.grid;
      if ((grid?.topology !== undefined && grid.topology !== 'continuous-v1') ||
        !Number.isFinite(grid?.origin?.x) || !Number.isFinite(grid?.origin?.z) || !Number.isFinite(grid.step) || grid.step <= 0 ||
        !Number.isInteger(grid.columns) || !Number.isInteger(grid.rows) || grid.columns <= 0 || grid.rows <= 0 ||
        grid.columns * grid.rows > OCEAN_MACRO_LANDSCAPE_LIMITS.massGridCells || !Array.isArray(grid.cells) ||
        !grid.cells.length || grid.cells.length > OCEAN_MACRO_LANDSCAPE_LIMITS.massGridCells)
        throw new TypeError('Macro reef mass requires a finite persisted floor grid.');
      const cells = new Set();
      for (const cell of grid.cells) {
        const key = `${cell.i},${cell.j}`;
        if (!Number.isInteger(cell.i) || !Number.isInteger(cell.j) || cell.i < 0 || cell.j < 0 ||
          cell.i >= grid.columns || cell.j >= grid.rows || !Number.isFinite(cell.riseM) || cell.riseM <= 0 || cells.has(key))
          throw new TypeError('Macro reef mass contains an invalid or duplicate grid cell.');
        cells.add(key);
      }
      next.grid = { origin: { x: grid.origin.x, z: grid.origin.z }, step: grid.step, columns: grid.columns, rows: grid.rows,
        cells: grid.cells.map(cell => ({ i: cell.i, j: cell.j, riseM: cell.riseM })).sort((a, b) => a.j - b.j || a.i - b.i) };
      if (grid.topology !== undefined) next.grid.topology = grid.topology;
    }
    ids.add(element.id); return next;
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** Loaded macro scenery. Persisted floor triangles and roots are shared with the
 * physical helper; this layer has no species, food, growth or per-frame layout. */
export class OceanMacroLandscape {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'Ocean macro landscape';
    Object.assign(this.root.userData, { oceanStreaming: true, role: ROLE, pickable: false, elementIds: [] });
    this.renderOrigin = { x: 0, z: 0 }; this._elements = []; this._masses = new Map(); this._instances = new Map();
    this._geometries = new Map(); this._generator = null; this._disposed = false; this._transform = new THREE.Object3D();
    this._materials = {
      'reef-mass': createOceanMacroSurfaceMaterial(),
      'meadow-shoot': new THREE.MeshStandardMaterial({ color: 0x718844, roughness: .91, metalness: 0, side: THREE.DoubleSide }),
      'coral-branch': new THREE.MeshStandardMaterial({ color: 0xbba178, roughness: .95, metalness: 0 }),
      'coral-table': new THREE.MeshStandardMaterial({ color: 0xb59567, roughness: .96, metalness: 0 }),
      'sea-fan': new THREE.MeshStandardMaterial({ color: 0xa76c58, roughness: .96, metalness: 0, side: THREE.DoubleSide }),
    };
  }

  _geometry(kind) {
    let geometry = this._geometries.get(kind); if (geometry) return geometry;
    const source = macroPlantMesh(kind); geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.positions, 3)); geometry.setIndex(source.indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.macroPrototype = kind; this._geometries.set(kind, geometry); return geometry;
  }

  _mass(owner, elements, generator, descriptor) {
    const sources = elements.map(element => macroLandscapeMesh(element, generator));
    const positionCount = sources.reduce((sum, source) => sum + source.positions.length, 0);
    const positions = new Float32Array(positionCount), indices = []; let cursor = 0, offset = 0;
    for (const source of sources) {
      positions.set(source.positions, cursor);
      for (const index of source.indices) indices.push(index + offset);
      cursor += source.positions.length; offset += source.positions.length / 3;
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const [cx, cz] = owner.split(',').map(Number);
    geometry.setAttribute('macroSurfacePosition', new THREE.BufferAttribute(macroSurfaceCoordinates(positions, owner), 3));
    const mesh = new THREE.Mesh(geometry, this._materials['reef-mass']); mesh.name = `Macro reef mass ${owner}`;
    Object.assign(mesh.userData, { oceanStreaming: true, role: ROLE, pickable: false, landscapeKind: 'reef-mass',
      ownerId: owner, ownerIds: [owner], elementIds: elements.map(element => element.id) });
    mesh.castShadow = false; mesh.receiveShadow = true;
    enableStaticRayQueries(mesh);
    return { mesh, cx, cz, descriptor };
  }

  _plantBatch(kind, elements, descriptor, origin) {
    const mesh = new THREE.InstancedMesh(this._geometry(kind), this._materials[kind], elements.length);
    mesh.name = `Macro landscape ${kind}`;
    Object.assign(mesh.userData, { oceanStreaming: true, role: ROLE, pickable: false, landscapeKind: kind,
      elementIds: elements.map(element => element.id), ownerIds: [...new Set(elements.map(element => element.regionId))] });
    mesh.castShadow = false; mesh.receiveShadow = true;
    const tint = new THREE.Color();
    for (let index = 0; index < elements.length; index++) {
      const element = elements[index];
      this._transform.position.set(element.x - origin.x, element.y, element.z - origin.z);
      this._transform.rotation.set(0, element.rotation, 0); this._transform.scale.set(element.scale.x, element.scale.y, element.scale.z);
      this._transform.updateMatrix(); mesh.setMatrixAt(index, this._transform.matrix);
      const tone = .88 + .2 * hash(element.id); tint.setRGB(tone, tone, tone); mesh.setColorAt(index, tint);
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); return { mesh, descriptor, matrixOrigin: { ...origin } };
  }

  update(elements, generator, renderOrigin = this.renderOrigin) {
    if (this._disposed) return false;
    if (!Number.isFinite(renderOrigin?.x) || !Number.isFinite(renderOrigin?.z)) throw new TypeError('Macro render origin requires finite X/Z.');
    const next = normalize(elements), masses = new Map(), batches = new Map();
    for (const element of next) {
      const target = element.kind === 'reef-mass' ? masses : batches;
      const key = element.kind === 'reef-mass' ? element.regionId : plantKind(element);
      if (!target.has(key)) target.set(key, []); target.get(key).push(element);
    }
    const preparedMasses = new Map(), preparedBatches = new Map();
    try {
      for (const [owner, batch] of masses) {
        const descriptor = signature(batch), previous = this._masses.get(owner);
        if (!previous || previous.descriptor !== descriptor || generator !== this._generator)
          preparedMasses.set(owner, this._mass(owner, batch, generator, descriptor));
      }
      for (const [kind, batch] of batches) {
        const descriptor = signature(batch), previous = this._instances.get(kind);
        if (!previous || previous.descriptor !== descriptor)
          preparedBatches.set(kind, this._plantBatch(kind, batch, descriptor, renderOrigin));
      }
    } catch (error) {
      for (const { mesh } of preparedMasses.values()) mesh.geometry.dispose();
      for (const { mesh } of preparedBatches.values()) mesh.dispose();
      throw error;
    }
    let changed = preparedMasses.size > 0 || preparedBatches.size > 0;
    for (const [owner, record] of this._masses) if (!masses.has(owner) || preparedMasses.has(owner)) {
      record.mesh.removeFromParent(); record.mesh.geometry.dispose(); this._masses.delete(owner); changed = true;
    }
    for (const [kind, record] of this._instances) if (!batches.has(kind) || preparedBatches.has(kind)) {
      record.mesh.removeFromParent(); record.mesh.dispose(); this._instances.delete(kind); changed = true;
    }
    for (const [owner, record] of preparedMasses) { this._masses.set(owner, record); this.root.add(record.mesh); }
    for (const [kind, record] of preparedBatches) { this._instances.set(kind, record); this.root.add(record.mesh); }
    this._elements = next; this._generator = generator; this.root.userData.elementIds = next.map(element => element.id);
    const rebased = this.setRenderOrigin(renderOrigin); this._place(); return changed || rebased;
  }

  _place() {
    for (const { mesh, cx, cz } of this._masses.values()) mesh.position.set(cx * 64 - this.renderOrigin.x, 0, cz * 64 - this.renderOrigin.z);
    for (const { mesh, matrixOrigin } of this._instances.values())
      mesh.position.set(matrixOrigin.x - this.renderOrigin.x, 0, matrixOrigin.z - this.renderOrigin.z);
    this.root.updateMatrixWorld(true);
  }

  setRenderOrigin(origin) {
    if (this._disposed) return false;
    if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.z)) throw new TypeError('Macro render origin requires finite X/Z.');
    if (origin.x === this.renderOrigin.x && origin.z === this.renderOrigin.z) return false;
    this.renderOrigin = { x: origin.x, z: origin.z }; this._place(); return true;
  }

  get stats() {
    const typeCounts = emptyCounts(); for (const element of this._elements) typeCounts[element.kind]++;
    const prototypeGeometries = this._geometries.size, prototypeMaterials = this._disposed ? 0 : 5;
    return { counts: { ...typeCounts }, typeCounts, instances: this._elements.length,
      owners: new Set(this._elements.map(element => element.regionId)).size, activeRegions: new Set(this._elements.map(element => element.regionId)).size,
      massDrawCalls: this._masses.size, plantDrawCalls: this._instances.size, drawCalls: this._masses.size + this._instances.size,
      ownedMassGeometries: this._masses.size, prototypeGeometries, prototypeMaterials,
      geometries: this._masses.size + prototypeGeometries, materials: prototypeMaterials, textures: 0,
      prototypes: { geometries: prototypeGeometries, materials: prototypeMaterials }, maxOwners: MAX_OWNERS,
      maxPerOwner: OCEAN_MACRO_LANDSCAPE_LIMITS.total, maxInstances: MAX_OWNERS * OCEAN_MACRO_LANDSCAPE_LIMITS.total,
      limits: { ...OCEAN_MACRO_LANDSCAPE_LIMITS }, maxDrawCalls: MAX_OWNERS + PLANT_KINDS.length, maxPrototypeGeometries: PLANT_KINDS.length,
      renderOrigin: { ...this.renderOrigin }, role: ROLE, pickable: false, animationScope: 'static-shared-support-geometry' };
  }

  reset() {
    if (this._disposed) return false;
    const changed = this._masses.size > 0 || this._instances.size > 0;
    for (const { mesh } of this._masses.values()) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    for (const { mesh } of this._instances.values()) { mesh.removeFromParent(); mesh.dispose(); }
    this._masses.clear(); this._instances.clear(); this._elements = []; this._generator = null; this.root.userData.elementIds = []; return changed;
  }

  dispose() {
    if (this._disposed) return;
    this.reset(); this._disposed = true;
    for (const geometry of this._geometries.values()) geometry.dispose(); this._geometries.clear();
    for (const material of Object.values(this._materials)) material.dispose();
    this.root.clear(); this.root.removeFromParent();
  }
}
