import * as THREE from 'three';
import { enableStaticRayQueries } from './reefSpatialQueries.js';

// Authored broad crown, selected by actual basal-vertex gap comparisons.
// This scene site is separate from the specimen's source collection locality.
export const REEF_SKELETON_REEF_SITE = Object.freeze({ x: 4.8, z: -4.8 });

/** Rigid vertical placement in metres; display contact is separate from ecology. */
export function placeReefSkeletonOnSubstrate(group, substrate, { x = REEF_SKELETON_REEF_SITE.x, z = REEF_SKELETON_REEF_SITE.z, clearanceM = .004 } = {}) {
  if (![x, z, clearanceM].every(Number.isFinite) || clearanceM < 0) throw new RangeError('扫描安放参数必须为有限米值');
  if (!group?.isObject3D || !substrate?.isMesh) throw new TypeError('扫描安放需要模型与硬底网格');
  if (group.parent || !group.scale.equals(new THREE.Vector3(1, 1, 1)) || !group.quaternion.equals(new THREE.Quaternion())) {
    throw new Error('扫描安放保持原比例与归一后的朝向，需未挂接的独立根节点');
  }
  const started = performance.now();
  enableStaticRayQueries(substrate);
  substrate.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(substrate);
  if (bounds.isEmpty()) throw new Error('扫描下方硬底为空');
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), vertex = new THREE.Vector3();
  ray.firstHitOnly = true;
  const previousPosition = group.position.clone();
  group.position.set(x, 0, z);
  group.updateMatrixWorld(true);
  const samples = [];
  let rootY = -Infinity;
  try {
    group.traverse(object => {
      if (!object.isMesh) return;
      const positions = object.geometry.getAttribute('position');
      if (!positions?.count) throw new Error('扫描顶点为空');
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        if (!vertex.toArray().every(Number.isFinite)) throw new Error('扫描顶点包含非有限值');
        ray.set(new THREE.Vector3(vertex.x, bounds.max.y + 1, vertex.z), down);
        const hit = ray.intersectObject(substrate, false)[0];
        if (!hit || !Number.isFinite(hit.point.y)) throw new Error('扫描足迹超出可验证的礁体硬底');
        rootY = Math.max(rootY, hit.point.y - vertex.y + clearanceM);
        samples.push({ vertexY: vertex.y, substrateY: hit.point.y });
      }
    });
    if (!samples.length || !Number.isFinite(rootY)) throw new Error('扫描安放没有有效采样');
    group.position.y = rootY;
    group.updateMatrixWorld(true);
    let minGapM = Infinity, maxGapM = -Infinity, nearContactVertices = 0;
    for (const sample of samples) {
      const gap = sample.vertexY + rootY - sample.substrateY;
      minGapM = Math.min(minGapM, gap); maxGapM = Math.max(maxGapM, gap);
      if (gap <= clearanceM + .001) nearContactVertices++;
    }
    const placedBounds = new THREE.Box3().setFromObject(group);
    return {
      method: 'rigid-Y maximum of actual vertex-to-hard-substrate downward intersections',
      physicalScaleMultiplier: 1, rootPositionM: group.position.toArray(), quaternionXyzw: group.quaternion.toArray(),
      clearanceM, vertexSamples: samples.length, minVertexGapM: minGapM, maxVertexGapM: maxGapM, nearContactVertices,
      boundsM: { min: placedBounds.min.toArray(), max: placedBounds.max.toArray(), size: placedBounds.getSize(new THREE.Vector3()).toArray() },
      cpuQueryMs: performance.now() - started,
      scope: 'sampled vertices against rendered hard substrate only; no whole-triangle contact, stability, co-occurrence or ecology inference',
    };
  } catch (error) {
    group.position.copy(previousPosition); group.updateMatrixWorld(true);
    throw error;
  }
}
