import * as THREE from 'three';
import { SHALLOW_SCANNED_REEF_DATA } from './ShallowScannedReefData.js';

export const SHALLOW_SCANNED_REEF_KEYS = Object.freeze(['scanned-pocillopora', 'scanned-diploastrea']);
const assetDirectory = 'assets/shallow-scanned-reef/';

function dataFor(key, distant = false) {
  if (!SHALLOW_SCANNED_REEF_KEYS.includes(key)) throw new Error(`Unknown scanned reef variant: ${key}`);
  return SHALLOW_SCANNED_REEF_DATA[`${key}-${distant ? 'distant' : 'near'}`];
}
function geometryFrom(data) {
  const decoded = atob(data.encoded), bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  const source = new Float32Array(bytes.buffer, 0, data.vertices * 8);
  const positions = new Float32Array(data.vertices * 3), normals = new Float32Array(data.vertices * 3), uv = new Float32Array(data.vertices * 2);
  for (let i = 0; i < data.vertices; i++) {
    positions.set(source.subarray(i * 8, i * 8 + 3), i * 3);
    normals.set(source.subarray(i * 8 + 3, i * 8 + 6), i * 3);
    uv.set(source.subarray(i * 8 + 6, i * 8 + 8), i * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(bytes.buffer, data.vertices * 32, data.indices).slice(), 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { role: 'scanned-coral-and-basal-patch-display-not-biomass', sourceKind: 'underwater-photogrammetry-DinaCon2025-Les-Bali', variant: data.key, detail: data.detail, rootRadius: data.rootRadius, rootBandY: data.rootBandY, radius: data.radius, height: data.height, unitEnvelope: 'source +Y; minY=0; max(X/Z)width=1; uniform proportions; not measured metres', nativeBaseColorFile: `public/${assetDirectory}${data.baseColorFile}`, baseColorFactor: [...data.baseColorFactor], sha256: data.sha256, license: 'MIT repository scope; see public/assets/shallow-scanned-reef/provenance.json' };
  return geometry;
}

// Synchronous geometry only. Caller owns and disposes these four possible
// geometries; no fetch, global cache, material or texture is hidden in the call.
export function shallowScannedReefGeometries(distant = false) {
  if (typeof distant !== 'boolean') throw new Error('Scanned reef detail must be boolean');
  return Object.fromEntries(SHALLOW_SCANNED_REEF_KEYS.map(key => [key, geometryFrom(dataFor(key, distant))]));
}

// A separate source-specific material is required to preserve the real albedo
// and UV. Reusing a tinted vertex-color live-coral material loses that identity.
export function shallowScannedReefMaterial(key, map = null) {
  const data = dataFor(key), factor = data.baseColorFactor;
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(factor[0], factor[1], factor[2], THREE.LinearSRGBColorSpace), opacity: factor[3], map, roughness: 1, metalness: 0 });
  material.userData = { nativeBaseColorFile: `public/${assetDirectory}${data.baseColorFile}`, nativeBaseColorFlipY: false, nativeBaseColorWrapS: 'repeat', nativeBaseColorWrapT: 'repeat', baseColorAsset: `${assetDirectory}${data.baseColorFile}`, sourceColorSpace: 'sRGB glTF baseColor', sourceBaseColorFactor: [...factor], roughnessMeaning: 'neutral display fallback; not measured original reef reflectance' };
  return material;
}

// Optional WebGL texture loading. Geometry and material preparation remain
// usable in native inspection. The returned texture has a single caller owner.
export async function loadShallowScannedReefTexture(key, baseURL = import.meta.env?.BASE_URL ?? '/') {
  const data = dataFor(key), texture = await new THREE.TextureLoader().loadAsync(`${baseURL}${assetDirectory}${data.baseColorFile}`);
  texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
