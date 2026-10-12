import * as THREE from 'three';
import { shallowSeascapeFacies } from '../livingShallowSeascape.js';
import { coastalSeascapeFacies } from '../livingCoastalSeascape.js';
import { reefValleyFacies } from '../reefValleyRegion.js';
import { seagrassMeadowFacies } from '../seagrassMeadowRegion.js';
import { livingShallowsTerrainColor } from './livingShallowsAssets.js';
import { createLivingReefSubstrateIndex, livingReefSubstrateCover, livingReefSubstrateColor } from './livingReefSubstrate.js';
import { createOceanSandHardCoverIndex, oceanSandHardCover, oceanSandSurfaceMask, oceanSandSurfaceCoordinates } from './oceanSandSurface.js';
const TERRAIN_SEGMENTS = 64, COVER_BIN_M = 8;
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

// Whole-habitat colour separation, using the existing committed facies and
// actual grass root envelope. No additional terrain, plants or biomass.
function reefValleyTerrainColor(color, facies, rootEnvelope) {
  const influence=facies.influence, grass=facies.meadow*rootEnvelope;
  color[0]*=1+influence*(.06*facies.sand-.25*facies.reef-.19*facies.slope-.28*grass);
  color[1]*=1+influence*(.035*facies.sand-.19*facies.reef-.14*facies.slope-.12*grass);
  color[2]*=1+influence*(-.025*facies.sand-.18*facies.reef-.10*facies.slope-.35*grass);
  return color;
}

export function buildOceanTerrainBuffers(generator, chunk, { livingShallows = false, sandHabitat = false } = {}) {
    const steps = TERRAIN_SEGMENTS, row = steps + 1, spacing = chunk.size / steps;
    const vertexCount = row * row;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const heights = new Float64Array(vertexCount);
    const indices = new Uint16Array(steps * steps * 6);
    const { x: originX, z: originZ } = chunk.origin;
    const rootIndex = terrainCoverIndex(generator, chunk), color = [0, 0, 0];
    const rubbleIndex = livingShallows ? createLivingReefSubstrateIndex(generator, chunk) : null;
    const sandHardIndex = sandHabitat ? createOceanSandHardCoverIndex(generator, chunk) : null;
    const sandMasks = sandHabitat ? new Float32Array(vertexCount * 3) : null;
    const sandMask = [0, 0, 0];
    const completeSeascape = livingShallows && chunk.ridgePlan?.version === 6 ? chunk.ridgePlan : null;
    const coastalSeascape = livingShallows && chunk.ridgePlan?.version === 7 ? chunk.ridgePlan : null;
    const reefValley = livingShallows && chunk.ridgePlan?.version === 8 ? chunk.ridgePlan : null;
    const meadowRegion = livingShallows && chunk.ridgePlan?.version === 9 ? chunk.ridgePlan : null;
    for (let rz = 0; rz <= steps; rz++) for (let rx = 0; rx <= steps; rx++) {
      const i = rz * row + rx, x = originX + rx * spacing, z = originZ + rz * spacing;
      const sample = generator.sample(x, z);
      heights[i] = sample.floorY;
      positions[i * 3] = rx * spacing;
      positions[i * 3 + 1] = generator.floorVertex?.(x, z) ?? sample.floorY;
      positions[i * 3 + 2] = rz * spacing;
      // Same world UVs on both sides of a chunk edge, including negative
      // coordinates; the authored texture repeats 28 times per 70 metres.
      uvs[i * 2] = x / 70 + .5;
      uvs[i * 2 + 1] = .5 - z / 70;
      const terrainColor = livingShallows ? livingShallowsTerrainColor : oceanTerrainColor;
      const rootEnvelope = grassRootEnvelope(rootIndex, x, z);
      terrainColor(x, z, sample, (generator.baseGenerator ?? generator).coverAt(x, z, sample), rootEnvelope, color);
      const rubbleCover = rubbleIndex ? livingReefSubstrateCover(rubbleIndex, x, z) : 0;
      if (rubbleIndex) livingReefSubstrateColor(color, rubbleCover, color);
      if (sandMasks) sandMasks.set(oceanSandSurfaceMask(sample, oceanSandHardCover(sandHardIndex, x, z),
        rootEnvelope, rubbleCover, sandMask), i * 3);
      if (completeSeascape) completeShallowTerrainColor(color, shallowSeascapeFacies(completeSeascape, x, z), rootEnvelope);
      if (coastalSeascape) completeShallowTerrainColor(color, coastalSeascapeFacies(coastalSeascape, x, z), rootEnvelope);
      if (reefValley) reefValleyTerrainColor(color, reefValleyFacies(reefValley, x, z), rootEnvelope);
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
      const left = rx ? heights[i - 1] : generator.sample(x - spacing, z).floorY;
      const right = rx < steps ? heights[i + 1] : generator.sample(x + spacing, z).floorY;
      const back = rz ? heights[i - row] : generator.sample(x, z - spacing).floorY;
      const front = rz < steps ? heights[i + row] : generator.sample(x, z + spacing).floorY;
      const nx = (left - right) / (2 * spacing), nz = (back - front) / (2 * spacing);
      const length = Math.hypot(nx, 1, nz);
      normals.set([nx / length, 1 / length, nz / length], i * 3);
    }
    return { positions, normals, colors, uvs, indices, sandMasks };
}

export function oceanTerrainGeometry(buffers, owner) {
    const { positions, normals, colors, uvs, indices, sandMasks } = buffers;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (sandMasks) {
      geometry.setAttribute('oceanSandPosition', new THREE.BufferAttribute(oceanSandSurfaceCoordinates(positions, owner), 2));
      geometry.setAttribute('oceanSandMask', new THREE.BufferAttribute(sandMasks, 3));
  }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

export function terrainCoverIndex(generator, chunk) {
    // A transient world-bin index is rebuilt only when a terrain chunk loads.
    // An active 3×3 window touches only its 5×5 neighbourhood (cache limit 32).
    const bins = new Map();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const element of generator.chunk(chunk.cx + dx, chunk.cz + dz).elements) {
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

export function grassRootEnvelope(bins, x, z) {
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

