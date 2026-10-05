import * as THREE from 'three';
import { DEEP_SEA_SPIDER_SPECIES_ID, DEEP_SEA_SPIDER_CONTACTS_LOCAL,
  SEA_SPIDER_BODY_LOCAL, SEA_SPIDER_MOUTH_LOCAL, SEA_SPIDER_PROBOSCIS_BASE_LOCAL,
  seaSpiderReferencePose } from '../deepSeaSpiderGeometry.js';

const cache = new Map();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const startVector = new THREE.Vector3(), endVector = new THREE.Vector3(), delta = new THREE.Vector3();
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
function share(root, key, make) {
  let entry = cache.get(key);
  if (!entry) { entry = { value: make(), refs: 0 }; cache.set(key, entry); }
  if (!root.userData.shared.has(key)) { root.userData.shared.add(key); entry.refs++; }
  return entry.value;
}
function mesh(root, geometry, material, name) {
  const object = new THREE.Mesh(geometry, material); object.name = name;
  object.castShadow = false; object.receiveShadow = true;
  root.add(object); return object;
}
function segment(object, from, to, radius) {
  startVector.set(from.x, from.y, from.z); endVector.set(to.x, to.y, to.z);
  delta.subVectors(endVector, startVector);
  const length = delta.length();
  object.position.copy(startVector).add(endVector).multiplyScalar(.5);
  object.scale.set(radius, Math.max(1e-8, length), radius);
  if (length > 1e-8) object.quaternion.setFromUnitVectors(Y, delta.divideScalar(length));
}

export function createDeepSeaSpiderOrganism(species) {
  if (species?.id !== DEEP_SEA_SPIDER_SPECIES_ID ||
    (species.scientificName && species.scientificName !== 'Colossendeis spp.') ||
    (species.identityLevel && species.identityLevel !== 'genus-group')) {
    throw new Error('The sea-spider representative is only identified as Colossendeis spp. at genus-group level.');
  }
  const root = new THREE.Group(); root.name = species.commonName ?? 'Colossendeis spp.';
  Object.assign(root.userData, { speciesId: DEEP_SEA_SPIDER_SPECIES_ID, scientificName: 'Colossendeis spp.',
    identityLevel: 'genus-group', morphology: 'sea-spider', morphologyProxy: true,
    sizeMeasure: 'leg-span', displaySizeRangeM: [.2, .4], shared: new Set(), disposed: false,
    source: 'https://www.mbari.org/animal/giant-sea-spider/',
    feedingPointLocal: { ...SEA_SPIDER_MOUTH_LOCAL }, bodyReferenceLocal: { ...SEA_SPIDER_BODY_LOCAL },
    focusPointLocal: { ...SEA_SPIDER_BODY_LOCAL },
    contactTemplateLocal: DEEP_SEA_SPIDER_CONTACTS_LOCAL.map(point => [point.x, point.y, point.z]),
    contactOrder: 'anterior-to-posterior, left(-Z), right(+Z), four pairs',
    originConvention: 'lower reference plane; model contacts and mouth use root yaw only',
    animationParametersStatus: 'illustrative middle-joint bending; model foot endpoints and mouth stay exact',
  });
  const cylinder = share(root, 'geometry/cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1, true));
  const toe = share(root, 'geometry/toe', () => new THREE.CylinderGeometry(0, 1, 1, 6, 1, false));
  const sphere = share(root, 'geometry/body', () => new THREE.SphereGeometry(1, 12, 8));
  const circle = share(root, 'geometry/mouth', () => new THREE.CircleGeometry(1, 8));
  const surface = share(root, 'material/surface', () => new THREE.MeshStandardMaterial({ color: '#a99d87',
    metalness: 0, roughness: .79, emissive: '#000000', emissiveIntensity: 0 }));
  const mouthMaterial = share(root, 'material/mouth', () => new THREE.MeshStandardMaterial({ color: '#62574b',
    metalness: 0, roughness: .86, emissive: '#000000', emissiveIntensity: 0, side: THREE.DoubleSide }));
  const body = mesh(root, sphere, surface, 'Small slender sea-spider trunk');
  body.position.set(SEA_SPIDER_BODY_LOCAL.x, SEA_SPIDER_BODY_LOCAL.y, SEA_SPIDER_BODY_LOCAL.z);
  body.scale.set(.095, .018, .026);
  const head = mesh(root, sphere, surface, 'Small proboscis attachment');
  head.position.set(.075, .112, 0); head.scale.set(.027, .020, .024);
  const proboscis = mesh(root, cylinder, surface, 'Long tubular proboscis');
  segment(proboscis, SEA_SPIDER_PROBOSCIS_BASE_LOCAL, SEA_SPIDER_MOUTH_LOCAL, .009);
  const mouth = mesh(root, circle, mouthMaterial, 'Proboscis opening at shared mouth reference');
  mouth.position.set(SEA_SPIDER_MOUTH_LOCAL.x, SEA_SPIDER_MOUTH_LOCAL.y, SEA_SPIDER_MOUTH_LOCAL.z);
  mouth.scale.setScalar(.0091);
  delta.set(SEA_SPIDER_MOUTH_LOCAL.x - SEA_SPIDER_PROBOSCIS_BASE_LOCAL.x,
    SEA_SPIDER_MOUTH_LOCAL.y - SEA_SPIDER_PROBOSCIS_BASE_LOCAL.y, 0).normalize();
  mouth.quaternion.setFromUnitVectors(Z, delta);
  const mouthAnchor = new THREE.Object3D(); mouthAnchor.name = 'Shared sea-spider mouth reference';
  mouthAnchor.position.copy(mouth.position); root.add(mouthAnchor);
  const bodyAnchor = new THREE.Object3D(); bodyAnchor.name = 'Shared sea-spider body reference';
  bodyAnchor.position.copy(body.position); root.add(bodyAnchor);
  const legs = DEEP_SEA_SPIDER_CONTACTS_LOCAL.map((rest, index) => {
    const segments = Array.from({ length: 4 }, (_, part) => mesh(root, part === 3 ? toe : cylinder,
      surface, `Sea-spider leg ${index + 1} segment ${part + 1}`));
    const footAnchor = new THREE.Object3D(); footAnchor.name = `Sea-spider foot ${index + 1} reference`;
    root.add(footAnchor);
    return { index, segments, footAnchor, side: rest.side };
  });
  Object.assign(root.userData, { bodyAnchor, mouthAnchor, legs, proboscis, mouth });
  animateDeepSeaSpiderOrganism(root, 0, { sizeM: 1, heading: 0, position: { x: 0, y: 0, z: 0 },
    state: 'resting', velocity: { x: 0, y: 0, z: 0 } });
  return root;
}

export function animateDeepSeaSpiderOrganism(root, timeSec, agent = {}) {
  if (!root?.userData.legs || root.userData.disposed) return;
  const pose = seaSpiderReferencePose(agent);
  const speed = Math.hypot(finite(agent.velocity?.x), finite(agent.velocity?.y), finite(agent.velocity?.z));
  const state = typeof agent.state === 'string' ? agent.state : agent.state?.name ?? '';
  const activity = state === 'proboscis-feeding' || state === 'sucking' ? 0 : Math.min(1, speed / .002);
  const t = finite(timeSec), phase = finite(agent.phase, root.userData.phase);
  let minY = 0, maxY = .21;
  for (const leg of root.userData.legs) {
    const points = pose.legsLocal[leg.index].map(point => ({ ...point }));
    // Only the lifted middle joints bend. The eight support endpoints are
    // immutable model references; the renderer never invents contact changes,
    // nor raises/lowers the body or the tube mouth during a feeding event.
    const bend = Math.max(0, Math.sin(t * .9 + phase + leg.index * 2.3999632297)) * .008 * activity;
    points[1].y += bend; points[2].y += bend * .6;
    for (let part = 0; part < leg.segments.length; part++) segment(leg.segments[part], points[part], points[part + 1], part < 2 ? .0058 : .0048);
    const foot = pose.contactPointsLocal[leg.index]; leg.footAnchor.position.set(foot.x, foot.y, foot.z);
    for (const point of points) { minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y + .008); }
  }
  root.userData.localEnvelope = { min: { x: -.51, y: minY, z: -.51 }, max: { x: .51, y: maxY, z: .51 },
    status: 'finite reference and segment bound; leg-span scale; not full articulated collision' };
  root.userData.contactPointsLocal = pose.contactPointsLocal;
  root.userData.state = state; root.userData.lastAnimationTimeSec = t;
}

export function disposeDeepSeaSpiderOrganism(root) {
  if (!root?.userData.shared || root.userData.disposed) return;
  root.userData.disposed = true;
  for (const key of root.userData.shared) {
    const entry = cache.get(key);
    if (entry && --entry.refs <= 0) { entry.value.dispose?.(); cache.delete(key); }
  }
  root.userData.shared.clear(); root.removeFromParent();
}

export function deepSeaSpiderResourceStats() {
  return { assets: cache.size, instances: Math.max(0, ...[...cache.values()].map(entry => entry.refs)) };
}
