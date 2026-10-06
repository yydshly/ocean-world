import * as THREE from 'three';
import { createDeepOceanGenerator, DEEP_OCEAN_CHUNK_SIZE, DEEP_OCEAN_TERRAIN_SEGMENTS,
  deepOceanRockMesh } from '../deepOceanGeneration.js';

const SEGMENTS = DEEP_OCEAN_TERRAIN_SEGMENTS, MAX_CHUNKS = 9, PROFILES = ['mound', 'ridge'];
function rockGeometry(profile) {
  const data = deepOceanRockMesh(profile), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

/** A bounded soft-sediment scenery window, lit only by the scene's observer.
 * No lights, photosynthesis, landscape organisms or inferred food masses. */
export class DeepOceanChunks {
  constructor(seed, { sandMaterial, seascape = false } = {}) {
    this.root = new THREE.Group(); this.root.name = 'continuous-deep-ocean-landscape';
    this.root.userData.oceanStreaming = true; this.root.userData.role = 'generated-soft-bottom-not-simulated-populations';
    this._seascapeRequested = seascape === true;
    this.generator = createDeepOceanGenerator(seed, { seascape: this._seascapeRequested });
    this._seascapeRevision = this.generator.seascapeRevision ?? null; this.renderOrigin = { x: 0, z: 0 };
    this._chunks = new Map(); this._center = null; this._position = { x: 0, z: 0 };
    this._loads = 0; this._unloads = 0; this._disposed = false; this._transform = new THREE.Object3D();
    this._color = new THREE.Color(); this._environment = { clockSec: 0, currentMps: 0, observerLight: 0 };
    this._terrainMaterial = sandMaterial ? sandMaterial.clone() : new THREE.MeshStandardMaterial({ color: 0x71685d, roughness: .99 });
    if (sandMaterial) {
      this._terrainMaterial.onBeforeCompile = sandMaterial.onBeforeCompile;
      this._terrainMaterial.customProgramCacheKey = sandMaterial.customProgramCacheKey;
    }
    this._terrainMaterial.vertexColors = true; this._terrainMaterial.needsUpdate = true;
    this._materials = { rock: new THREE.MeshStandardMaterial({ color: 0x777168, roughness: .99 }),
      rubble: new THREE.MeshStandardMaterial({ color: 0x79746b, roughness: .99 }) };
    this._geometries = Object.fromEntries(PROFILES.map(profile => [`rock-${profile}`, rockGeometry(profile)]));
    this._refreshStats();
  }
  _terrainGeometry(chunk) {
    const row = SEGMENTS + 1, spacing = DEEP_OCEAN_CHUNK_SIZE / SEGMENTS;
    const positions = [], normals = [], colors = [], uvs = [], indices = [];
    // Reuse the expanded height grid for central differences instead of
    // resampling the full habitat/noise fields for every neighbouring normal.
    const expanded = new Float32Array((row + 2) ** 2), expandedRow = row + 2;
    for (let iz = -1; iz <= SEGMENTS + 1; iz++) for (let ix = -1; ix <= SEGMENTS + 1; ix++) {
      expanded[(iz + 1) * expandedRow + ix + 1] = this.generator.floorVertex(chunk.origin.x + ix * spacing, chunk.origin.z + iz * spacing);
    }
    for (let iz = 0; iz <= SEGMENTS; iz++) for (let ix = 0; ix <= SEGMENTS; ix++) {
      const x = chunk.origin.x + ix * spacing, z = chunk.origin.z + iz * spacing, index = (iz + 1) * expandedRow + ix + 1;
      const floor = expanded[index]; positions.push(ix * spacing, floor, iz * spacing);
      const nx = (expanded[index - 1] - expanded[index + 1]) / (2 * spacing);
      const nz = (expanded[index - expandedRow] - expanded[index + expandedRow]) / (2 * spacing), length = Math.hypot(nx, 1, nz);
      normals.push(nx / length, 1 / length, nz / length);
      // A quiet bed tint follows broad relief. Food quantities do not colour
      // the floor and visible particle brightness never represents biomass.
      const tint = .96 + .035 * Math.sin(x / 71 + z / 93) + .012 * floor;
      colors.push(tint, tint, tint); uvs.push(x / 70 + .5, .5 - z / 70);
      if (ix < SEGMENTS && iz < SEGMENTS) {
        const a = iz * row + ix, b = a + 1, c = a + row, d = c + 1; indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  }
  _load(cx, cz) {
    const chunk = this.generator.chunk(cx, cz), group = new THREE.Group(); group.name = `deep-chunk:${chunk.id}`;
    group.position.set(chunk.origin.x - this.renderOrigin.x, 0, chunk.origin.z - this.renderOrigin.z); group.userData.chunkId = chunk.id;
    const terrainGeometry = this._terrainGeometry(chunk), floor = new THREE.Mesh(terrainGeometry, this._terrainMaterial);
    floor.userData.landscapeKind = 'floor'; floor.receiveShadow = true; group.add(floor);
    const instances = [], elementCounts = { rock: 0, rubble: 0 }, rockProfileCounts = { mound: 0, ridge: 0 };
    for (const kind of ['rock', 'rubble']) for (const profile of PROFILES) {
      const elements = chunk.elements.filter(element => element.kind === kind && element.profile === profile);
      if (!elements.length) continue;
      const mesh = new THREE.InstancedMesh(this._geometries[`rock-${profile}`], this._materials[kind], elements.length);
      mesh.name = `${chunk.id}:${kind}:${profile}`; mesh.userData.landscapeKind = kind;
      mesh.userData.role = 'scenery-not-ecological-biomass'; mesh.userData.elementIds = elements.map(element => element.id);
      for (let index = 0; index < elements.length; index++) {
        const element = elements[index]; this._transform.position.set(element.x - chunk.origin.x, element.y, element.z - chunk.origin.z);
        this._transform.rotation.set(0, element.rotation, 0); this._transform.scale.set(element.scale.x, element.scale.y, element.scale.z);
        this._transform.updateMatrix(); mesh.setMatrixAt(index, this._transform.matrix);
        const tint = .89 + element.rotation / (Math.PI * 2) * .12; this._color.setRGB(tint, tint, tint); mesh.setColorAt(index, this._color);
      }
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.receiveShadow = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      elementCounts[kind] += elements.length; rockProfileCounts[profile] += elements.length; group.add(mesh); instances.push(mesh);
    }
    this.root.add(group); this._chunks.set(chunk.id, { group, origin: chunk.origin, terrainGeometry, instances,
      elementCounts, rockProfileCounts,
      ...(this._seascapeRequested ? { seascapePlan: this.generator.seascapePlan(cx, cz) ?? null } : {}) }); this._loads++;
  }
  _unload(id) {
    const record = this._chunks.get(id); if (!record) return;
    record.group.removeFromParent(); record.terrainGeometry.dispose(); for (const mesh of record.instances) mesh.dispose(); record.group.clear();
    this._chunks.delete(id); this._unloads++;
  }
  _refreshStats() {
    const elementCounts = { rock: 0, rubble: 0 }, rockProfileCounts = { mound: 0, ridge: 0 };
    let sceneryDraws = 0, sceneryTriangles = 0;
    for (const record of this._chunks.values()) {
      sceneryDraws += record.instances.length;
      for (const kind of ['rock', 'rubble']) elementCounts[kind] += record.elementCounts[kind];
      for (const profile of PROFILES) rockProfileCounts[profile] += record.rockProfileCounts[profile];
      for (const mesh of record.instances) sceneryTriangles += (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3 * mesh.count;
    }
    this._stats = Object.freeze({ seed: this.generator.seed, chunkSize: DEEP_OCEAN_CHUNK_SIZE,
      activeChunks: this._chunks.size, maxActiveChunks: MAX_CHUNKS, center: this._center ? Object.freeze({ ...this._center }) : null,
      renderOrigin: Object.freeze({ ...this.renderOrigin }), loadedChunks: Object.freeze([...this._chunks.keys()]),
      sceneryInstances: elementCounts.rock + elementCounts.rubble, elementCounts: Object.freeze(elementCounts),
      rockProfileCounts: Object.freeze(rockProfileCounts), sceneryTriangles,
      prototypeGeometries: Object.keys(this._geometries).length, prototypeMaterials: 3, ownedOverlayGeometries: 0,
      terrainTriangles: this._chunks.size * SEGMENTS ** 2 * 2, drawCalls: this._chunks.size + sceneryDraws, maxDrawCalls: MAX_CHUNKS * 4,
      loads: this._loads, unloads: this._unloads, landscapeRole: 'soft-sediment-and-sparse-hard-scenery-not-simulated-biomass',
      environment: Object.freeze({ ...this._environment }), naturalLight: 0, photosyntheticScenery: 0,
      ...(this._seascapeRequested ? { seascapeRevision: this._seascapeRevision,
        seascapeOwners: Object.freeze([...this._chunks.values()].filter(r => r.seascapePlan).map(r => r.group.userData.chunkId)),
        seascapeAddedRocks: [...this._chunks.values()].reduce((n, r) => n + (r.seascapePlan?.addedRockIds.length ?? 0), 0) } : {}) });
  }
  update(position) {
    if (this._disposed) return false;
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) throw new TypeError('Deep ocean position needs finite X/Z.');
    if (this.generator.seascapeCandidatesActive) return false;
    this._position = { x: position.x, z: position.z }; const cx = Math.floor(position.x / 64), cz = Math.floor(position.z / 64);
    const revision = this.generator.seascapeRevision ?? null;
    if (this._center?.cx === cx && this._center?.cz === cz && this._seascapeRevision === revision) return false;
    const wanted = new Set(); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) wanted.add(`${cx + dx},${cz + dz}`);
    const previousLoads = this._loads, previousUnloads = this._unloads;
    for (const [id, record] of this._chunks) if (!wanted.has(id) || (this._seascapeRequested &&
      record.seascapePlan !== (this.generator.seascapePlan(...id.split(',').map(Number)) ?? null))) this._unload(id);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this._chunks.has(`${cx + dx},${cz + dz}`)) this._load(cx + dx, cz + dz);
    this._center = { cx, cz }; this._seascapeRevision = revision; this._refreshStats();
    return this._loads !== previousLoads || this._unloads !== previousUnloads;
  }
  setRenderOrigin(origin) {
    if (this._disposed) return false;
    if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.z)) throw new TypeError('Deep rendering origin needs finite X/Z.');
    if (origin.x === this.renderOrigin.x && origin.z === this.renderOrigin.z) return false;
    this.renderOrigin = { x: origin.x, z: origin.z };
    for (const record of this._chunks.values()) record.group.position.set(record.origin.x - origin.x, 0, record.origin.z - origin.z);
    this._refreshStats(); return true;
  }
  setEnvironment(water, visualTime) {
    if (this._disposed) return;
    if (Number.isFinite(visualTime)) this._environment.clockSec = visualTime;
    if (Number.isFinite(water?.currentMps)) this._environment.currentMps = Math.max(0, water.currentMps);
    if (Number.isFinite(water?.observerLight)) this._environment.observerLight = Math.max(0, water.observerLight);
    this._refreshStats();
  }
  reset(seed) {
    if (this._disposed) return false;
    for (const id of this._chunks.keys()) this._unload(id); this.generator.clearCache();
    this.generator = createDeepOceanGenerator(seed, { seascape: this._seascapeRequested });
    this._seascapeRevision = this.generator.seascapeRevision ?? null;
    this._center = null; this._environment.clockSec = 0; return this.update(this._position);
  }
  get stats() { return this._stats; }
  dispose() {
    if (this._disposed) return; this._disposed = true;
    for (const id of this._chunks.keys()) this._unload(id);
    for (const geometry of Object.values(this._geometries)) geometry.dispose();
    for (const material of Object.values(this._materials)) material.dispose();
    this._terrainMaterial.dispose(); this.generator.clearCache(); this.root.clear(); this.root.removeFromParent(); this._refreshStats();
  }
}
