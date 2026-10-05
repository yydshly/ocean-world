import * as THREE from 'three';
import { createCoralLandscape, disposeOrganism } from './organisms.js';
import { configureReefMassiveCoralProjection } from './reefCoralMaterial.js';

// Landscape colonies are display habitat, separate from the ecological agents.
// Allocate both branching detail levels once, before the world's GPU warmup.
// Massive-colony basal fitting keeps its single, verified low surface.
export function createReefLandscapeCoral(morphotype, colors, variant = 0, options = {}) {
  const root = createCoralLandscape(morphotype, colors, variant, 'low');
  if (morphotype === 'boulder') {
    root.traverse(object => { if (object.isMesh) configureReefMassiveCoralProjection(object.material); });
    return root;
  }
  let near;
  try {
    const nearDetail=options.nearDetail==='medium-prototype'&&morphotype==='branching'?'medium-prototype':'medium';
    near = createCoralLandscape(morphotype, colors, variant, nearDetail);
    const far = new THREE.Group();
    far.name = 'landscape-coral-low';
    for (const child of [...root.children]) far.add(child);
    root.add(far, near);
    near.name = 'landscape-coral-medium'; near.visible = false;
    const size = new THREE.Box3().setFromObject(far).getSize(new THREE.Vector3());
    root.userData.landscapeDetail = { near, far, level: 'far',
      diameterLocalM: Math.max(size.x, size.z), nearBelowDiameters: 2.25, farAboveDiameters: 3,
      ...(nearDetail==='medium-prototype'?{tissuePrototype:'v3'}:{}),
      status: 'authored viewing thresholds; not measured coral growth or additional biomass' };
    return root;
  } catch (error) {
    if (near) disposeOrganism(near);
    disposeOrganism(root); throw error;
  }
}

const worldScale = new THREE.Vector3(), worldPosition = new THREE.Vector3(), segment = new THREE.Vector3(), closest = new THREE.Vector3();
// Select a prospective view without changing current visibility or ownership.
// A straight approach can enter the near band and finish within its hysteresis
// band; use its nearest point when choosing obstacles for an autofocus move.
export function reefLandscapeLevelAt(root, cameraPosition, fromCameraPosition = null) {
  const detail = root?.userData.landscapeDetail;
  if (!detail || !cameraPosition?.isVector3) return;
  root.getWorldScale(worldScale); root.getWorldPosition(worldPosition);
  const diameterM = detail.diameterLocalM * Math.max(Math.abs(worldScale.x), Math.abs(worldScale.z));
  const distanceM = worldPosition.distanceTo(cameraPosition);
  if (!Number.isFinite(distanceM) || !Number.isFinite(diameterM) || diameterM <= 0) return;
  let next = detail.level === 'near'
    ? (distanceM > diameterM * detail.farAboveDiameters ? 'far' : 'near')
    : (distanceM < diameterM * detail.nearBelowDiameters ? 'near' : 'far');
  if (next === 'far' && distanceM <= diameterM * detail.farAboveDiameters && fromCameraPosition?.isVector3) {
    segment.copy(cameraPosition).sub(fromCameraPosition);
    const lengthSquared = segment.lengthSq();
    const t = lengthSquared > 1e-12 ? THREE.MathUtils.clamp(closest.copy(worldPosition).sub(fromCameraPosition).dot(segment) / lengthSquared, 0, 1) : 0;
    closest.copy(fromCameraPosition).addScaledVector(segment, t);
    if (closest.distanceTo(worldPosition) < diameterM * detail.nearBelowDiameters) next = 'near';
  }
  return next;
}
export function updateReefLandscapeDetail(root, cameraPosition) {
  const next = reefLandscapeLevelAt(root, cameraPosition), detail = root?.userData.landscapeDetail;
  if (!next) return;
  detail.level = next; detail.near.visible = next === 'near'; detail.far.visible = next === 'far';
  return next;
}

export function disposeReefLandscapeCoral(root) {
  // Each original root owns its own cache references. Release the medium
  // owner first; the low root then releases its references exactly once.
  const detail = root?.userData.landscapeDetail;
  if (detail) {
    disposeOrganism(detail.near);
    delete root.userData.landscapeDetail;
  }
  disposeOrganism(root);
}
