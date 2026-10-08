import * as THREE from 'three';
import { createOceanGenerator, OCEAN_CHUNK_SIZE, OCEAN_FORMATION_LIMIT } from '../oceanGeneration.js';
import { createLivingRidgeGenerator } from '../livingRidgeGeology.js';
import { shallowSeascapeFacies } from '../livingShallowSeascape.js';
import { coastalSeascapeFacies } from '../livingCoastalSeascape.js';
import { reefValleyFacies } from '../reefValleyRegion.js';
import { seagrassMeadowFacies } from '../seagrassMeadowRegion.js';
import { OCEAN_ROCK_PROFILES, OCEAN_ROCK_SURFACE_VERSION, oceanRockMesh } from '../oceanRockShape.js';
import { habitatSceneMesh } from '../oceanHabitatScenes.js';
import { enableStaticRayQueries } from './reefSpatialQueries.js';
import { oceanRockFootingMesh } from './oceanRockFooting.js';
import { createOceanMacroSurfaceMaterial, macroSurfaceCoordinates, macroSurfaceOwnerPhase } from './oceanMacroSurfaceMaterial.js';
import { createOceanEnvironment } from '../oceanEnvironment.js';
import { createLivingShallowsCoralMaterial } from './livingShallowsCoralMaterial.js';
import { OCEAN_SAND_SURFACE_VERSION, applyOceanSandSurface, oceanSandSurfaceCoordinates,
  createOceanSandHardCoverIndex, oceanSandHardCover, oceanSandSurfaceMask } from './oceanSandSurface.js';
import { createMeadowInstanceGeometry, disposeMeadowInstanceGeometry,
  MEADOW_SHADER_DECLARATIONS, MEADOW_SHADER_TRANSFORM } from './livingMeadowEnvironment.js';
import { LIVING_REEF_SUBSTRATE_VERSION, createLivingReefSubstrateIndex,
  livingReefSubstrateCover, livingReefSubstrateColor } from './livingReefSubstrate.js';
import { LIVING_SHALLOWS_ASSET_VERSION, LIVING_SHALLOWS_CORAL_FORMS, LIVING_SHALLOWS_PALETTE,
  livingShallowsAssetGeometries, livingShallowsRockFootingMesh, livingShallowsTerrainColor } from './livingShallowsAssets.js';

const TERRAIN_SEGMENTS = 64;
const ACTIVE_RADIUS = 1;
const KINDS = ['rock', 'coral', 'seagrass', 'rubble', 'algae', 'formation'];
const ALGAE_OFFSET_M = .0015;
const PALETTE = { rock: '#8c8978', coral: '#8a7e62', seagrass: '#51683f', rubble: '#9a917c', algae: '#59694d' };
const MAX_ACTIVE_CHUNKS = (ACTIVE_RADIUS * 2 + 1) ** 2;
const COVER_BIN_M = 8;
const smoothstep = (a, b, value) => {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Ground colour is a display cue around generated grass roots. Neither the
 * continuous field nor the root envelope is a measured area or biomass. */
export function oceanTerrainColor(x, z, sample, cover, rootEnvelope, target = [0, 0, 0]) {
  const fade = smoothstep(40, 80, Math.hypot(x, z));
  const hard = THREE.MathUtils.clamp(sample.rockiness || 0, 0, 1) * fade;
  // coverAt already blends to zero in the authored reef. Actual seeded roots
  // prevent its potential bed field from tinting large unoccupied clearings.
  const grass = THREE.MathUtils.clamp(cover.seagrass || 0, 0, 1) * THREE.MathUtils.clamp(rootEnvelope, 0, 1);
  const variation = Math.sin(x * .15 + z * .09) * .025 * fade;
  target[0] = 1 - hard * .29 - grass * .56 + variation;
  target[1] = 1 - hard * .24 - grass * .32 + variation;
  target[2] = 1 - hard * .29 - grass * .68 + variation;
  return target;
}

// Only a committed complete seascape supplies this broad bottom treatment.
// Facies are authored appearance, not additional raised rocks or vegetation;
// the meadow contribution remains tied to the actual generated root envelope.
function completeShallowTerrainColor(color, facies, rootEnvelope) {
  const influence = facies.influence, grass = facies.meadow * rootEnvelope;
  color[0] *= 1 + influence * (.015 * facies.sand - .12 * facies.reef - .07 * facies.slope - .11 * grass);
  color[1] *= 1 + influence * (.009 * facies.sand - .105 * facies.reef - .075 * facies.slope - .06 * grass);
  color[2] *= 1 + influence * (-.008 * facies.sand - .14 * facies.reef - .08 * facies.slope - .16 * grass);
  return color;
}

// Landscape prototypes have their base at y=0, height 1 and approximately
// unit-wide footprints. Generator scale values therefore remain metres.
// Renderer and ecology share these actual triangular support surfaces.
function rockGeometry(profile) {
  const data = oceanRockMesh(profile), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setIndex(data.indices);
  const positions = geometry.attributes.position, colors = [];
  const uvs = [];
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const top = smoothstep(.05, .72, positions.getY(vertex));
    colors.push(.77 + top * .23, .82 + top * .18, .80 + top * .15);
    uvs.push(positions.getX(vertex) + .5, positions.getZ(vertex) + .5);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function rubbleGeometry() {
  const geometry = new THREE.IcosahedronGeometry(.5, 0);
  const positions = geometry.attributes.position;
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const x = positions.getX(vertex), y = positions.getY(vertex), z = positions.getZ(vertex);
    const uneven = .88 + .12 * Math.sin(x * 11 + z * 7 + y * 5);
    positions.setXYZ(vertex, x * uneven, (y + .5) * .96, z * uneven);
  }
  geometry.computeBoundingBox();
  const bottom = geometry.boundingBox.min.y, height = geometry.boundingBox.max.y - bottom;
  for (let vertex = 0; vertex < positions.count; vertex++) positions.setY(vertex, (positions.getY(vertex) - bottom) / height);
  geometry.computeVertexNormals();
  return geometry;
}

function clipToPatch(triangle, patch) {
  let polygon = triangle;
  for (let edge = 0; edge < patch.length && polygon.length; edge++) {
    const a = patch[edge], b = patch[(edge + 1) % patch.length];
    const side = p => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    const result = [];
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index], end = polygon[(index + 1) % polygon.length];
      const ds = side(start), de = side(end), startInside = ds >= -1e-12, endInside = de >= -1e-12;
      if (startInside) result.push(start);
      if (startInside !== endInside) {
        const t = THREE.MathUtils.clamp(ds / (ds - de), 0, 1);
        result.push({ x: THREE.MathUtils.lerp(start.x, end.x, t), y: THREE.MathUtils.lerp(start.y, end.y, t),
          z: THREE.MathUtils.lerp(start.z, end.z, t) });
      }
    }
    polygon = result;
  }
  return polygon;
}

function stoneTexture() {
  const size = 64, bytes = new Uint8Array(size * size * 4);
  const lattice = (x, y, cells) => {
    const px = ((x % cells) + cells) % cells, py = ((y % cells) + cells) % cells;
    const value = Math.sin(px * 127.1 + py * 311.7 + cells * 19.3) * 43758.5453;
    return value - Math.floor(value);
  };
  const noise = (x, y, cells) => {
    const gx = x / size * cells, gy = y / size * cells, ix = Math.floor(gx), iy = Math.floor(gy);
    const tx = smoothstep(0, 1, gx - ix), ty = smoothstep(0, 1, gy - iy);
    const a = THREE.MathUtils.lerp(lattice(ix, iy, cells), lattice(ix + 1, iy, cells), tx);
    const b = THREE.MathUtils.lerp(lattice(ix, iy + 1, cells), lattice(ix + 1, iy + 1, cells), tx);
    return THREE.MathUtils.lerp(a, b, ty);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const brightness = .76 + .18 * noise(x, y, 5) + .06 * noise(x, y, 13);
    const index = (y * size + x) * 4, channel = Math.round(brightness * 255);
    bytes.set([channel, channel, channel, 255], index);
  }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function coralGeometry() {
  const data = habitatSceneMesh('coral-branch'), geometry = new THREE.BufferGeometry();
  const positions = data.positions.map((value, index) => value * (index % 3 === 1 ? .98 : .84));
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function seagrassGeometry() {
  const positions = [], colors = [], uvs = [], indices = [];
  // Several leaves share each of the original seven local attachment points.
  // The upright cluster stays inside the previous unit footprint and height;
  // the generated source, scale, ground contact and sway remain unchanged.
  for (let blade = 0; blade < 32; blade++) {
    const root = blade % 7, rootAngle = root * 2.3999632297;
    const radius = root === 0 ? 0 : .12 + (root % 3) * .08;
    const angle = rootAngle + (Math.floor(blade / 7) - 2) * .42 + Math.sin(blade * 1.73) * .18;
    const height = blade === 0 ? 1 : .55 + .43 * (.5 + Math.sin(blade * 12.9898 + root * .91) * .5);
    const bend = .11 + .035 * (.5 + Math.sin(blade * 2.17 + .4) * .5);
    const baseX = Math.cos(rootAngle) * radius, baseZ = Math.sin(rootAngle) * radius;
    const offset = positions.length / 3;
    for (let level = 0; level <= 4; level++) {
      const t = level / 4, direction = angle + Math.sin(blade * .91) * .18 * t * t;
      const x = baseX + Math.cos(direction) * bend * t * t, z = baseZ + Math.sin(direction) * bend * t * t;
      const sideX = -Math.sin(direction), sideZ = Math.cos(direction);
      const width = (.022 + .024 * Math.sin(Math.PI * t)) * (1 - t * .84) * (.9 + Math.sin(blade * 1.21 + .7) * .18);
      const light = smoothstep(.05, .9, t);
      for (const side of [-1, 1]) {
        positions.push(x + sideX * width * side, t * height, z + sideZ * width * side);
        colors.push(.85 + light * .72, .93 + light * .60, .72 + light * .13);
        uvs.push((side + 1) / 2, t);
      }
      if (level < 4) {
        const a = offset + level * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A bounded 3×3 window of seed-generated landscape, separate from animals. */
export class OceanChunks {
  constructor(seed, { sandMaterial, livingGeology = false, sandHabitat = false } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'continuous-ocean-landscape';
    this.root.userData.oceanStreaming = true;
    this.root.userData.role = 'generated-landscape-not-simulated-populations';
    this._livingGeologyRequested = Boolean(livingGeology);
    this._sandHabitatRequested = Boolean(sandHabitat);
    this.generator = this._createGenerator(seed);
    this._ridgeRevision = this.generator.ridgeRevision ?? null;
    this.renderOrigin = { x: 0, z: 0 };
    this._chunks = new Map();
    this._center = null;
    this._position = { x: 0, z: 0 };
    this._loads = 0;
    this._unloads = 0;
    this._disposed = false;
    this._transform = new THREE.Object3D();
    this._color = new THREE.Color();
    this._grassUniforms = { time: { value: 0 }, bend: { value: .1875 }, current: { value: .15 } };

    // Borrow the authored texture and caustic hooks, but own the cloned
    // material. Disposing this renderer never disposes the borrowed texture.
    this._terrainMaterial = sandMaterial
      ? sandMaterial.clone()
      : new THREE.MeshStandardMaterial({ color: 0xe1d8bd, roughness: .99 });
    if (sandMaterial) {
      this._terrainMaterial.onBeforeCompile = sandMaterial.onBeforeCompile;
      this._terrainMaterial.customProgramCacheKey = sandMaterial.customProgramCacheKey;
    }
    this._terrainMaterial.vertexColors = true;
    this._terrainMaterial.needsUpdate = true;
    this._textures = { stone: stoneTexture() };
    this._configureAssetKit();
    this._refreshStats();
  }

  _createGenerator(seed) {
    const base = createOceanGenerator(seed);
    return this._livingGeologyRequested && base.profile === 'living-shallows-v1'
      ? createLivingRidgeGenerator(base) : base;
  }

  _configureAssetKit() {
    this._livingShallows = this.generator.profile === 'living-shallows-v1';
    this._restoreSandSurface?.();
    this._sandHabitat = this._sandHabitatRequested && this._livingShallows;
    this._restoreSandSurface = this._sandHabitat ? applyOceanSandSurface(this._terrainMaterial) : null;
    this._meadowWater = this._livingShallows ? createOceanEnvironment(this.generator.seed, this.generator) : null;
    this._kinds = this._livingShallows ? [...KINDS, 'driftwood', 'bottle'] : KINDS;
    this._rockProfiles = this.generator.rockProfiles || OCEAN_ROCK_PROFILES;
    this._palette = this._livingShallows ? LIVING_SHALLOWS_PALETTE : PALETTE;
    this._geometries = this._livingShallows ? livingShallowsAssetGeometries()
      : { coral: coralGeometry(), seagrass: seagrassGeometry(), rubble: rubbleGeometry() };
    for (const profile of this._rockProfiles) this._geometries[`rock-${profile}`] = rockGeometry(profile);
    this._materials = {
      rock: createOceanMacroSurfaceMaterial({ map: this._textures.stone }),
      coral: this._livingShallows ? createLivingShallowsCoralMaterial()
        : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .94, vertexColors: false }),
      seagrass: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .92, vertexColors: true, side: THREE.DoubleSide }),
      rubble: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .99, map: this._textures.stone }),
      algae: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .99, vertexColors: true, side: THREE.DoubleSide, map: this._textures.stone }),
      ...(this._livingShallows ? {
        driftwood: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .99 }),
        bottle: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7,
          transparent: true, opacity: .46, depthWrite: false, side: THREE.DoubleSide }),
      } : {}),
    };
    this._materials.seagrass.onBeforeCompile = shader => {
      shader.uniforms.oceanGrassTime = this._grassUniforms.time;
      shader.uniforms.oceanGrassBend = this._grassUniforms.bend;
      if (this._livingShallows) {
        shader.uniforms.oceanMeadowCurrent = this._grassUniforms.current;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
          uniform float oceanGrassTime; ${MEADOW_SHADER_DECLARATIONS}`);
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          ${MEADOW_SHADER_TRANSFORM}`);
        return;
      }
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        uniform float oceanGrassTime;
        uniform float oceanGrassBend;`);
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          // Instance translations remain chunk-local across floating origins.
          float grassPhase = instanceMatrix[3].x * 0.17 + instanceMatrix[3].z * 0.13;
          float grassTip = clamp(position.y, 0.0, 1.0);
          grassTip *= grassTip;
          transformed.x += sin(oceanGrassTime * 0.75 + grassPhase) * 0.10 * oceanGrassBend * grassTip;
          transformed.z += cos(oceanGrassTime * 0.56 + grassPhase * 0.83) * 0.035 * oceanGrassBend * grassTip;
        #endif`);
    };
    this._materials.seagrass.customProgramCacheKey = () => this._livingShallows ? 'living-meadow-environment-v2' : 'generated-seagrass-sway-v1';
  }

  _terrainGeometry(chunk) {
    const steps = TERRAIN_SEGMENTS, row = steps + 1, spacing = chunk.size / steps;
    const vertexCount = row * row;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const heights = new Float64Array(vertexCount);
    const indices = new Uint16Array(steps * steps * 6);
    const { x: originX, z: originZ } = chunk.origin;
    const rootIndex = this._terrainCoverIndex(chunk), color = [0, 0, 0];
    const rubbleIndex = this._livingShallows ? createLivingReefSubstrateIndex(this.generator, chunk) : null;
    const sandHardIndex = this._sandHabitat ? createOceanSandHardCoverIndex(this.generator, chunk) : null;
    const sandMasks = this._sandHabitat ? new Float32Array(vertexCount * 3) : null;
    const sandMask = [0, 0, 0];
    const completeSeascape = this._livingShallows && chunk.ridgePlan?.version === 6 ? chunk.ridgePlan : null;
    const coastalSeascape = this._livingShallows && chunk.ridgePlan?.version === 7 ? chunk.ridgePlan : null;
    const reefValley = this._livingShallows && chunk.ridgePlan?.version === 8 ? chunk.ridgePlan : null;
    const meadowRegion = this._livingShallows && chunk.ridgePlan?.version === 9 ? chunk.ridgePlan : null;
    for (let rz = 0; rz <= steps; rz++) for (let rx = 0; rx <= steps; rx++) {
      const i = rz * row + rx, x = originX + rx * spacing, z = originZ + rz * spacing;
      const sample = this.generator.sample(x, z);
      heights[i] = sample.floorY;
      positions[i * 3] = rx * spacing;
      positions[i * 3 + 1] = this.generator.floorVertex?.(x, z) ?? sample.floorY;
      positions[i * 3 + 2] = rz * spacing;
      // Same world UVs on both sides of a chunk edge, including negative
      // coordinates; the authored texture repeats 28 times per 70 metres.
      uvs[i * 2] = x / 70 + .5;
      uvs[i * 2 + 1] = .5 - z / 70;
      const terrainColor = this._livingShallows ? livingShallowsTerrainColor : oceanTerrainColor;
      const rootEnvelope = this._grassRootEnvelope(rootIndex, x, z);
      terrainColor(x, z, sample, this.generator.coverAt(x, z, sample), rootEnvelope, color);
      const rubbleCover = rubbleIndex ? livingReefSubstrateCover(rubbleIndex, x, z) : 0;
      if (rubbleIndex) livingReefSubstrateColor(color, rubbleCover, color);
      if (sandMasks) sandMasks.set(oceanSandSurfaceMask(sample, oceanSandHardCover(sandHardIndex, x, z),
        rootEnvelope, rubbleCover, sandMask), i * 3);
      if (completeSeascape) completeShallowTerrainColor(color, shallowSeascapeFacies(completeSeascape, x, z), rootEnvelope);
      if (coastalSeascape) completeShallowTerrainColor(color, coastalSeascapeFacies(coastalSeascape, x, z), rootEnvelope);
      if (reefValley) completeShallowTerrainColor(color, reefValleyFacies(reefValley, x, z), rootEnvelope);
      if (meadowRegion) completeShallowTerrainColor(color, seagrassMeadowFacies(meadowRegion, x, z), rootEnvelope);
      colors.set(color, i * 3);
      if (rz < steps && rx < steps) {
        const j = (rz * steps + rx) * 6, a = i, b = a + 1, c = a + row, d = c + 1;
        indices.set([a, c, b, b, c, d], j);
      }
    }
    // Central differences use the same globally sampled neighbours at every
    // shared edge. Local computeVertexNormals would shade seams differently.
    for (let rz = 0; rz <= steps; rz++) for (let rx = 0; rx <= steps; rx++) {
      const i = rz * row + rx, x = originX + rx * spacing, z = originZ + rz * spacing;
      const left = rx ? heights[i - 1] : this.generator.sample(x - spacing, z).floorY;
      const right = rx < steps ? heights[i + 1] : this.generator.sample(x + spacing, z).floorY;
      const back = rz ? heights[i - row] : this.generator.sample(x, z - spacing).floorY;
      const front = rz < steps ? heights[i + row] : this.generator.sample(x, z + spacing).floorY;
      const nx = (left - right) / (2 * spacing), nz = (back - front) / (2 * spacing);
      const length = Math.hypot(nx, 1, nz);
      normals.set([nx / length, 1 / length, nz / length], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (sandMasks) {
      geometry.setAttribute('oceanSandPosition', new THREE.BufferAttribute(oceanSandSurfaceCoordinates(positions, chunk.id), 2));
      geometry.setAttribute('oceanSandMask', new THREE.BufferAttribute(sandMasks, 3));
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  _terrainCoverIndex(chunk) {
    // A transient world-bin index is rebuilt only when a terrain chunk loads.
    // An active 3×3 window touches only its 5×5 neighbourhood (cache limit 32).
    const bins = new Map();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const element of this.generator.chunk(chunk.cx + dx, chunk.cz + dz).elements) {
        if (element.kind !== 'seagrass') continue;
        const key = `${Math.floor(element.x / COVER_BIN_M)},${Math.floor(element.z / COVER_BIN_M)}`;
        let entries = bins.get(key);
        if (!entries) { entries = []; bins.set(key, entries); }
        const width = Math.max(element.scale.x, element.scale.z);
        entries.push({ x: element.x, z: element.z, radius: 2 + width * .5, core: .35 + width * .1 });
      }
    }
    return bins;
  }

  _grassRootEnvelope(bins, x, z) {
    const bx = Math.floor(x / COVER_BIN_M), bz = Math.floor(z / COVER_BIN_M);
    let envelope = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const roots = bins.get(`${bx + dx},${bz + dz}`);
      if (!roots) continue;
      for (const root of roots) {
        const distance2 = (x - root.x) ** 2 + (z - root.z) ** 2;
        if (distance2 >= root.radius ** 2) continue;
        envelope = Math.max(envelope, 1 - smoothstep(root.core, root.radius, Math.sqrt(distance2)));
        if (envelope >= 1) return 1;
      }
    }
    return envelope;
  }

  _elementMatrix(element, chunk) {
    this._transform.position.set(element.x - chunk.origin.x, element.y, element.z - chunk.origin.z);
    this._transform.rotation.set(0, element.rotation, 0);
    this._transform.scale.set(element.scale.x, element.scale.y, element.scale.z);
    this._transform.updateMatrix();
    return this._transform.matrix;
  }

  _algaeGeometry(elements, attachments, chunk) {
    const positions = [], normals = [], colors = [], uvs = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3(), edge = new THREE.Vector3();
    for (const element of elements) {
      const rock = attachments.get(element.attachmentId), data = oceanRockMesh(rock.profile || 'mound');
      const cos = Math.cos(rock.rotation), sin = Math.sin(rock.rotation);
      const wx = element.x - rock.x, wz = element.z - rock.z;
      const center = element.surfaceLocal || { x: (wx * cos - wz * sin) / rock.scale.x,
        z: (wx * sin + wz * cos) / rock.scale.z };
      const radius = element.patchRadius || Math.sin(element.surfaceRadius || .18) * .5;
      const patch = Array.from({ length: 8 }, (_, index) => ({ x: center.x + Math.cos(index * Math.PI / 4) * radius,
        z: center.z + Math.sin(index * Math.PI / 4) * radius }));
      const variation = .93 + (Math.sin(element.x * 1.87 + element.z * .71) + 1) * .065;
      this._color.set(this._palette.algae).multiplyScalar(variation);
      for (let triangle = 0; triangle < data.indices.length; triangle += 3) {
        a.fromArray(data.positions, data.indices[triangle] * 3);
        b.fromArray(data.positions, data.indices[triangle + 1] * 3);
        c.fromArray(data.positions, data.indices[triangle + 2] * 3);
        if (Math.max(a.x, b.x, c.x) < center.x - radius || Math.min(a.x, b.x, c.x) > center.x + radius ||
          Math.max(a.z, b.z, c.z) < center.z - radius || Math.min(a.z, b.z, c.z) > center.z + radius) continue;
        normal.copy(b).sub(a).cross(edge.copy(c).sub(a)).normalize();
        if (normal.y <= 1e-8) continue;
        const polygon = clipToPatch([{ x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z }, { x: c.x, y: c.y, z: c.z }], patch);
        if (polygon.length < 3) continue;
        normal.set(normal.x / rock.scale.x, normal.y / rock.scale.y, normal.z / rock.scale.z).normalize();
        const nx = normal.x * cos + normal.z * sin, ny = normal.y, nz = -normal.x * sin + normal.z * cos;
        for (let fan = 1; fan + 1 < polygon.length; fan++) {
          const vertices = [polygon[0], polygon[fan], polygon[fan + 1]];
          const area = Math.abs((vertices[1].x - vertices[0].x) * (vertices[2].z - vertices[0].z) -
            (vertices[1].z - vertices[0].z) * (vertices[2].x - vertices[0].x));
          if (area < 1e-13) continue;
          for (const vertex of vertices) {
            const x = vertex.x * rock.scale.x, z = vertex.z * rock.scale.z;
            positions.push(rock.x - chunk.origin.x + x * cos + z * sin + nx * ALGAE_OFFSET_M,
              rock.y + vertex.y * rock.scale.y + ny * ALGAE_OFFSET_M,
              rock.z - chunk.origin.z - x * sin + z * cos + nz * ALGAE_OFFSET_M);
            normals.push(nx, ny, nz);
            colors.push(this._color.r, this._color.g, this._color.b);
            uvs.push((vertex.x + .5) * rock.scale.x * .5, (vertex.z + .5) * rock.scale.z * .5);
          }
        }
      }
    }
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  _load(cx, cz) {
    // Saved original owners and committed plans are the only render sources.
    // Candidate geology can be queried without exposing provisional bodies.
    if (this.generator.isRidgeOwnerReady && !this.generator.isRidgeOwnerReady(`${cx},${cz}`)) return;
    const chunk = this.generator.chunk(cx, cz);
    const group = new THREE.Group();
    group.name = `ocean-chunk-${chunk.id}`;
    group.userData.oceanChunk = chunk.id;
    group.userData.oceanStreaming = true;
    group.position.set(chunk.origin.x - this.renderOrigin.x, 0, chunk.origin.z - this.renderOrigin.z);
    const terrainGeometry = this._terrainGeometry(chunk);
    const terrain = new THREE.Mesh(terrainGeometry, this._terrainMaterial);
    terrain.name = 'sampled-seabed';
    terrain.receiveShadow = true;
    terrain.userData.oceanChunk = chunk.id;
    terrain.userData.oceanStreaming = true;
    enableStaticRayQueries(terrain);
    group.add(terrain);
    const instances = [], overlays = [], ownedGeometries = [], elementCounts = {}, batches = [];
    const rocks = chunk.elements.filter(element => element.kind === 'rock' || element.kind === 'formation');
    const footingBuilder = this._livingShallows ? livingShallowsRockFootingMesh : oceanRockFootingMesh;
    const footing = footingBuilder(rocks, chunk.origin,
      (x, z) => this.generator.floorSurface?.(x, z).height ?? this.generator.sample(x, z).floorY);
    let footingGeometry = null;
    if (footing.positions.length) {
      footingGeometry = new THREE.BufferGeometry();
      footingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(footing.positions, 3));
      footingGeometry.setIndex(footing.indices);
      const colors = [], uvs = [];
      for (let rockIndex = 0; rockIndex < rocks.length; rockIndex++) {
        const rock = rocks[rockIndex], variation = .93 + (Math.sin(rock.x * 1.87 + rock.z * .71) + 1) * .065;
        this._color.set(this._palette.rock).multiplyScalar(variation);
        const vertices = this._livingShallows ? footing.footings[rockIndex].rim.length * 2 : 32;
        for (let vertex = 0; vertex < vertices; vertex++) colors.push(this._color.r * .77, this._color.g * .82, this._color.b * .80);
      }
      for (let vertex = 0; vertex < footing.positions.length / 3; vertex++) {
        uvs.push((footing.positions[vertex * 3] + chunk.origin.x) / 3, footing.positions[vertex * 3 + 1] / 3);
      }
      footingGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      footingGeometry.setAttribute('macroSurfacePosition', new THREE.BufferAttribute(
        macroSurfaceCoordinates(footingGeometry.attributes.position.array, chunk.id), 3));
      footingGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      footingGeometry.computeVertexNormals(); footingGeometry.computeBoundingBox(); footingGeometry.computeBoundingSphere();
      const footingMesh = new THREE.Mesh(footingGeometry, this._materials.rock);
      footingMesh.name = 'generated-buried-rock-sides'; footingMesh.userData.landscapeKind = 'rock-base';
      footingMesh.userData.oceanStreaming = true; footingMesh.receiveShadow = true; footingMesh.castShadow = true;
      group.add(footingMesh);
    }
    const rockProfileCounts = Object.fromEntries(this._rockProfiles.map(profile => [profile, 0]));
    const attachments = new Map(chunk.elements.filter(element => element.kind === 'rock').map(element => [element.id, element]));
    for (const kind of this._kinds) {
      const elements = chunk.elements.filter(element => element.kind === kind &&
        (kind !== 'algae' || attachments.has(element.attachmentId)));
      elementCounts[kind] = elements.length;
      if (kind === 'rock' || kind === 'formation') {
        for (const profile of this._rockProfiles) {
          const rocks = elements.filter(element => (element.profile || 'mound') === profile);
          if (kind === 'rock') rockProfileCounts[profile] = rocks.length;
          batches.push({ kind, geometryKey: `rock-${profile}`, materialKey: 'rock', elements: rocks });
        }
      } else if (kind === 'coral' && this._livingShallows) {
        for (const form of LIVING_SHALLOWS_CORAL_FORMS) batches.push({ kind, geometryKey: `coral-${form}`,
          paletteKey: form, elements: elements.filter(element => element.morphotype === form) });
      } else if (kind !== 'algae') batches.push({ kind, geometryKey: kind, elements });
    }
    for (const { kind, geometryKey, materialKey = kind, paletteKey = materialKey, elements } of batches) {
      if (!elements.length) continue;
      const geometry = kind === 'seagrass' && this._livingShallows
        ? createMeadowInstanceGeometry(this._geometries[geometryKey], elements, this.generator, this._meadowWater)
        : this._geometries[geometryKey];
      const mesh = new THREE.InstancedMesh(geometry, this._materials[materialKey], elements.length);
      mesh.name = kind === 'formation' ? `generated-formation-${geometryKey}` : `generated-${geometryKey}`;
      mesh.userData.oceanChunk = chunk.id;
      mesh.userData.oceanStreaming = true;
      mesh.userData.landscapeKind = kind;
      if (this._livingShallows) {
        mesh.userData.assetVersion = LIVING_SHALLOWS_ASSET_VERSION;
        if (kind === 'coral') mesh.userData.morphotype = geometryKey.slice('coral-'.length);
        if (kind === 'bottle' || kind === 'driftwood') {
          mesh.userData.role = 'grounded-discovery-prop-not-biomass';
          mesh.userData.physicalState = kind === 'bottle' ? 'grounded-flooded' : 'grounded';
        }
      }
      const rockSurface = kind === 'rock' || kind === 'formation';
      const surfacePhase = rockSurface ? macroSurfaceOwnerPhase(chunk.id) : null;
      if (rockSurface) mesh.userData.surfacePhaseBuffer = 'instanceColor: owner X/Z phase and brightness';
      mesh.receiveShadow = true;
      mesh.castShadow = kind === 'rock' || kind === 'formation';
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        mesh.setMatrixAt(i, this._elementMatrix(element, chunk));
        const variation = .93 + (Math.sin(element.x * 1.87 + element.z * .71) + 1) * .065;
        if (rockSurface) this._color.setRGB(surfacePhase[0], surfacePhase[1], variation);
        else this._color.set(this._palette[paletteKey]).multiplyScalar(variation);
        mesh.setColorAt(i, this._color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      if (kind === 'seagrass') {
        const bendMargin = elements.reduce((largest, element) => Math.max(largest, element.scale.x, element.scale.z), 0) * .12;
        mesh.boundingBox.expandByScalar(bendMargin);
        mesh.boundingSphere.radius += bendMargin;
        if (this._livingShallows) {
          const groundMargin = elements.reduce((largest, element) => Math.max(largest, element.scale.y), 0) *
            Math.max(...Array.from(geometry.attributes.meadowGround.array, Math.abs));
          mesh.boundingBox.expandByScalar(groundMargin); mesh.boundingSphere.radius += groundMargin;
          mesh.userData.meadowEnvironment = 'local water direction; terrain-grounded display roots; existing crown unchanged';
        }
      }
      group.add(mesh);
      instances.push(mesh);
    }
    const algaeElements = chunk.elements.filter(element => element.kind === 'algae' && attachments.has(element.attachmentId));
    const algaeGeometry = this._algaeGeometry(algaeElements, attachments, chunk);
    if (algaeGeometry) {
      const mesh = new THREE.Mesh(algaeGeometry, this._materials.algae);
      mesh.name = 'generated-algae-cover';
      mesh.userData.oceanChunk = chunk.id;
      mesh.userData.oceanStreaming = true;
      mesh.userData.landscapeKind = 'algae';
      mesh.userData.surfaceOffsetM = ALGAE_OFFSET_M;
      mesh.receiveShadow = true;
      group.add(mesh);
      overlays.push(mesh);
      ownedGeometries.push(algaeGeometry);
    }
    this.root.add(group);
    this._chunks.set(chunk.id, { group, origin: chunk.origin, terrainGeometry, footingGeometry, footings: footing.footings,
      instances, overlays, ownedGeometries, elementCounts, rockProfileCounts,
      ...(this.generator.isRidgeOwnerReady ? { sourceChunk: chunk, ridgePlan: chunk.ridgePlan ?? null } : {}) });
    this._loads++;
  }

  _unload(id) {
    const record = this._chunks.get(id);
    if (!record) return;
    record.group.removeFromParent();
    record.terrainGeometry.dispose();
    record.footingGeometry?.dispose();
    // InstancedMesh owns its instance buffers, not the shared prototypes.
    for (const mesh of record.instances) {
      mesh.dispose();
      if (mesh.geometry.userData.meadowInstanceBuffers) disposeMeadowInstanceGeometry(mesh.geometry);
    }
    for (const geometry of record.ownedGeometries) geometry.dispose();
    record.group.clear();
    this._chunks.delete(id);
    this._unloads++;
  }

  _refreshStats() {
    const elementCounts = Object.fromEntries(this._kinds.map(kind => [kind, 0]));
    const rockProfileCounts = Object.fromEntries(this._rockProfiles.map(profile => [profile, 0]));
    let sceneryDraws = 0, sceneryTriangles = 0, ownedOverlayGeometries = 0, ownedMeadowGeometries = 0, formationTriangles = 0, formationDrawCalls = 0;
    for (const record of this._chunks.values()) {
      sceneryDraws += record.instances.length + record.overlays.length + (record.footingGeometry ? 1 : 0);
      if (record.footingGeometry) sceneryTriangles += record.footingGeometry.index.count / 3;
      ownedOverlayGeometries += record.ownedGeometries.length;
      for (const kind of this._kinds) elementCounts[kind] += record.elementCounts[kind];
      for (const profile of this._rockProfiles) rockProfileCounts[profile] += record.rockProfileCounts[profile];
      for (const mesh of record.instances) {
        if (mesh.geometry.userData.meadowInstanceBuffers) ownedMeadowGeometries++;
        const triangles = (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3 * mesh.count;
        sceneryTriangles += triangles;
        if (mesh.userData.landscapeKind === 'formation') { formationTriangles += triangles; formationDrawCalls++; }
      }
      for (const mesh of record.overlays) sceneryTriangles += mesh.geometry.attributes.position.count / 3;
    }
    const ridge = this.generator.registryStats?.();
    const ridgePlanIds = ridge?.ridgePlanOwnerIds ?? [];
    const activePlanVersions = {}, activeHabitatThemes = {};
    for (const record of this._chunks.values()) if (record.ridgePlan) {
      const plan = record.ridgePlan;
      activePlanVersions[plan.version] = (activePlanVersions[plan.version] ?? 0) + 1;
      activeHabitatThemes[plan.theme] = (activeHabitatThemes[plan.theme] ?? 0) + 1;
    }
    this._stats = Object.freeze({
      seed: this.generator.seed,
      ...(ridge ? { ridgeGeologyEnabled: true, ridgeRevision: ridge.revision,
        ridgeGenerationVersion: 1,
        activePlanVersions: Object.freeze(activePlanVersions), activeHabitatThemes: Object.freeze(activeHabitatThemes),
        seabedReliefOwners: (activePlanVersions[3] ?? 0) + (activePlanVersions[4] ?? 0),
        seabedReliefScope: 'committed floor grids; compatible boundary supports; shared terrain and ecological queries',
        connectedSeascapeOwners: activePlanVersions[4] ?? 0,
        connectedSeascapeScope: '128m four-owner committed beds; shared interior seams; original outer supports; same real ecological births',
        habitatBeltOwners: activePlanVersions[5] ?? 0,
        habitatBeltScope: 'four atomically born owners; reef, sediment passage and meadow share scene descriptors with real ecology; unchanged bed',
        completeShallowSeascapeOwners: activePlanVersions[6] ?? 0,
        completeShallowSeascapeScope: 'committed 384m by 128m scene; shared physical floor, source instances and world-coordinate bottom facies; nine-owner active window',
        ...(activePlanVersions[7] ? { coastalSeascapeOwners: activePlanVersions[7],
          coastalSeascapeScope: 'committed continuous coastal life belt; actual floor and attached source instances; ordinary nine-owner streaming' } : {}),
        ...(activePlanVersions[8] ? { reefValleyOwners: activePlanVersions[8],
          reefValleyScope: 'committed coordinate-seeded reef-valley regions; actual floor and source instances; ordinary nine-owner streaming' } : {}),
        ...(activePlanVersions[9] ? { seagrassMeadowOwners: activePlanVersions[9],
          seagrassMeadowScope: 'committed continuous grass core, edges and sand channels; actual plants and saved independent animals' } : {}),
        ridgeReadyOwners: ridge.size, ridgeReadyOwnerIds: Object.freeze([...ridge.ridgeReadyOwnerIds]),
        ridgePlanOwners: ridgePlanIds.length, ridgePlanOwnerIds: Object.freeze([...ridgePlanIds]),
        ridgeRenderedOwners: this._chunks.size, ridgeRenderedOwnerIds: Object.freeze([...this._chunks.keys()]),
        maxRidgeRegistryOwners: ridge.limit,
        ridgeScope: 'up to 25 database-ready owners; original saved scenery or committed ridge plans; unknown owners wait before rendering' } : {}),
      ...(this._livingShallows ? { sceneProfile: 'living-shallows-v1', assetVersion: LIVING_SHALLOWS_ASSET_VERSION,
        substrateDisplayVersion: LIVING_REEF_SUBSTRATE_VERSION,
        ...(this._sandHabitat ? { sandSurfaceDisplayVersion: OCEAN_SAND_SURFACE_VERSION,
          sandSurfaceScope: 'soft-bottom colour, grain and ripple normal; actual hard and root envelopes; no floor relief or sediment simulation' } : {}),
        ownedMeadowGeometries, maxOwnedMeadowGeometries: MAX_ACTIVE_CHUNKS,
        meadowEnvironment: { clockSec: this._grassUniforms.time.value, baseCurrentMps: this._grassUniforms.current.value,
          bendLimit: .05, scope: 'saved world clock; shared local water field; displayed shoots, no added stock or plant physics' } } : {}),
      chunkSize: OCEAN_CHUNK_SIZE,
      activeChunks: this._chunks.size,
      maxActiveChunks: MAX_ACTIVE_CHUNKS,
      center: this._center ? Object.freeze({ ...this._center }) : null,
      renderOrigin: Object.freeze({ ...this.renderOrigin }),
      loadedChunks: Object.freeze([...this._chunks.keys()]),
      sceneryInstances: Object.values(elementCounts).reduce((sum, count) => sum + count, 0),
      elementCounts: Object.freeze(elementCounts),
      rockProfileCounts: Object.freeze(rockProfileCounts),
      rockSurfaceVersion: OCEAN_ROCK_SURFACE_VERSION,
      sceneryTriangles,
      formationTriangles,
      formationDrawCalls,
      maxFormationInstances: MAX_ACTIVE_CHUNKS * OCEAN_FORMATION_LIMIT,
      prototypeGeometries: Object.keys(this._geometries).length,
      prototypeMaterials: Object.keys(this._materials).length,
      ownedOverlayGeometries,
      terrainTriangles: this._chunks.size * TERRAIN_SEGMENTS ** 2 * 2,
      drawCalls: this._chunks.size + sceneryDraws,
      maxDrawCalls: MAX_ACTIVE_CHUNKS * (this._livingShallows ? 13 : 12),
      loads: this._loads,
      unloads: this._unloads,
    });
  }

  /** Returns true when the active window or one of its committed sources changed. */
  update(position) {
    if (this._disposed) return false;
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) throw new TypeError('Ocean position must contain finite x and z');
    this._position = { x: position.x, z: position.z };
    const cx = Math.floor(position.x / OCEAN_CHUNK_SIZE), cz = Math.floor(position.z / OCEAN_CHUNK_SIZE);
    const centerChanged = this._center?.cx !== cx || this._center?.cz !== cz;
    const revision = this.generator.ridgeRevision ?? null;
    const revisionChanged = revision !== this._ridgeRevision;
    if (!centerChanged && !revisionChanged) return false;
    const loads = this._loads, unloads = this._unloads;
    const wanted = new Set();
    for (let z = cz - ACTIVE_RADIUS; z <= cz + ACTIVE_RADIUS; z++) for (let x = cx - ACTIVE_RADIUS; x <= cx + ACTIVE_RADIUS; x++) wanted.add(`${x},${z}`);
    // Release first so crossing a boundary never doubles the resident window.
    for (const [id, record] of this._chunks) {
      if (!wanted.has(id) || this.generator.isRidgeOwnerReady &&
        (!this.generator.isRidgeOwnerReady(id) || record.ridgePlan !== (this.generator.getRidgePlan(id) ?? null))) this._unload(id);
    }
    for (let z = cz - ACTIVE_RADIUS; z <= cz + ACTIVE_RADIUS; z++) for (let x = cx - ACTIVE_RADIUS; x <= cx + ACTIVE_RADIUS; x++) {
      if (!this._chunks.has(`${x},${z}`)) this._load(x, z);
    }
    this._center = { cx, cz };
    this._ridgeRevision = revision;
    this._refreshStats();
    return centerChanged || loads !== this._loads || unloads !== this._unloads;
  }

  reset(seed) {
    if (this._disposed) return false;
    for (const id of this._chunks.keys()) this._unload(id);
    this.generator = this._createGenerator(seed);
    this._ridgeRevision = this.generator.ridgeRevision ?? null;
    this._meadowWater = this.generator.profile === 'living-shallows-v1' ? createOceanEnvironment(seed, this.generator) : null;
    if ((this.generator.profile === 'living-shallows-v1') !== this._livingShallows) {
      for (const geometry of Object.values(this._geometries)) geometry.dispose();
      for (const material of Object.values(this._materials)) material.dispose();
      this._configureAssetKit();
    }
    this._center = null;
    return this.update(this._position);
  }

  /** Move existing render groups while retaining all logical world positions. */
  setRenderOrigin(origin) {
    if (this._disposed) return false;
    if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.z)) throw new TypeError('Render origin must contain finite x and z');
    if (this.renderOrigin.x === origin.x && this.renderOrigin.z === origin.z) return false;
    this.renderOrigin = { x: origin.x, z: origin.z };
    for (const record of this._chunks.values()) {
      record.group.position.set(record.origin.x - origin.x, 0, record.origin.z - origin.z);
    }
    this._refreshStats();
    return true;
  }

  get stats() {
    if (!this._livingShallows) return this._stats;
    return { ...this._stats, meadowEnvironment: { ...this._stats.meadowEnvironment,
      clockSec: this._grassUniforms.time.value, baseCurrentMps: this._grassUniforms.current.value } };
  }

  /** Visual bending only; the caller's paused visual clock stays unchanged. */
  setEnvironment(environment, visualTimeSec) {
    if (this._disposed) return;
    if (Number.isFinite(visualTimeSec)) this._grassUniforms.time.value = visualTimeSec;
    if (Number.isFinite(environment?.currentMps)) this._grassUniforms.bend.value = THREE.MathUtils.clamp(environment.currentMps / .8, 0, 1);
    if (Number.isFinite(environment?.currentMps)) this._grassUniforms.current.value = THREE.MathUtils.clamp(environment.currentMps, 0, 1.2);
  }

  dispose() {
    if (this._disposed) return;
    for (const id of this._chunks.keys()) this._unload(id);
    for (const geometry of Object.values(this._geometries)) geometry.dispose();
    for (const material of Object.values(this._materials)) material.dispose();
    for (const texture of Object.values(this._textures)) texture.dispose();
    this._terrainMaterial.dispose();
    this.root.removeFromParent();
    this.root.clear();
    this._disposed = true;
    this._center = null;
    this._refreshStats();
  }
}
