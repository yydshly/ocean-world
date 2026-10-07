import { oceanRockMesh, oceanRockHeight } from './oceanRockShape.js';

// The colony's actual mesh and hard support share these existing Float32
// triangles. Surface colours do not displace them or create hidden footing.
export function oceanBiodiversityPatchMesh(speciesId) {
  return speciesId === 'biodiversity-massive-coral' ? oceanRockMesh('mound') : null;
}
export function oceanBiodiversityPatchHeight(patch, x, z) {
  return patch?.speciesId === 'biodiversity-massive-coral' ? oceanRockHeight(patch, x, z) : null;
}
