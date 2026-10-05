import { Mesh, StaticDrawUsage } from 'three';
import { MeshBVH, acceleratedRaycast, disposeBoundsTree } from 'three-mesh-bvh';

// Each shared geometry owns one tree and one dispose listener. Do not patch
// Three prototypes: animated organisms keep their existing raycast behavior.
const geometryTrees = new WeakMap();

/**
 * Enable ray queries for an explicitly static mesh or static subtree.
 *
 * Vertex positions, indices, groups and draw ranges must stay unchanged until
 * geometry disposal. Object transforms may change normally. Call only on reef
 * terrain and authored static corals, never on a whole mixed organism scene.
 * Setting a query's raycaster.firstHitOnly = true preserves the nearest hit
 * and obstruction result, while avoiding the other hits in each static mesh.
 */
export function enableStaticRayQueries(root) {
  const result = { meshes: 0, geometriesBuilt: 0, geometriesReused: 0, skippedMeshes: 0 };
  root?.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry, position = geometry?.getAttribute('position');
    // Reject mesh types and attribute hints that can invalidate a static BVH,
    // as well as custom raycasts whose semantics we should not replace.
    if (object.isSkinnedMesh || object.isInstancedMesh || object.isBatchedMesh ||
      !geometry?.isBufferGeometry || !position || position.count < 3 ||
      position.usage !== StaticDrawUsage || geometry.morphAttributes.position?.length ||
      (object.raycast !== Mesh.prototype.raycast && object.raycast !== acceleratedRaycast)) {
      result.skippedMeshes++;
      return;
    }

    let state = geometryTrees.get(geometry);
    if (!state) {
      // Indirect mode preserves the authored index buffer, material groups and
      // faceIndex identity. CENTER (the default) keeps initial construction cheap.
      const tree = geometry.boundsTree ?? new MeshBVH(geometry, { indirect: true });
      const ownsTree = !geometry.boundsTree;
      geometry.boundsTree = tree;
      const onDispose = () => {
        // BufferGeometry.dispose can be called repeatedly. Clear once, and do
        // not clear a replacement tree installed by a different owner.
        geometry.removeEventListener('dispose', onDispose);
        if (geometry.boundsTree === tree) disposeBoundsTree.call(geometry);
        geometryTrees.delete(geometry);
      };
      state = { tree, onDispose };
      geometryTrees.set(geometry, state);
      geometry.addEventListener('dispose', onDispose);
      if (ownsTree) result.geometriesBuilt++;
      else result.geometriesReused++;
    } else {
      result.geometriesReused++;
    }
    object.raycast = acceleratedRaycast;
    result.meshes++;
  });
  return result;
}
