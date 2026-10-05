import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createCoralLandscape, disposeOrganism } from '../../src/world/organisms.js';
import { createReefLandscapeCoral, updateReefLandscapeDetail, disposeReefLandscapeCoral } from '../../src/world/reefLandscapeDetail.js';

function shapeHash(root) {
  const hash = createHash('sha256');
  root.traverse(object => {
    if (!object.geometry) return;
    for (const attribute of Object.values(object.geometry.attributes)) hash.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    if (object.geometry.index) hash.update(new Uint8Array(object.geometry.index.array.buffer));
  });
  return hash.digest('hex');
}
function inventory(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const mat of object.material ? [object.material] : []) {
      materials.add(mat);
      for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}
const triangles = root => { let count = 0; root.traverse(o => { if(o.geometry) count += (o.geometry.index?.count ?? o.geometry.attributes.position.count)/3; }); return count; };

export function inspectReefLandscapeDetail() {
  const rows = [];
  for (const morphotype of ['branching', 'table']) for (let variant = 0; variant < 4; variant++) {
    const root = createReefLandscapeCoral(morphotype, undefined, variant), sibling = createReefLandscapeCoral(morphotype, undefined, variant);
    const low = createCoralLandscape(morphotype, undefined, variant, 'low'), parent = new THREE.Group();
    try {
      const detail = root.userData.landscapeDetail;
      assert.equal(shapeHash(detail.far), shapeHash(low), 'Low geometry must remain byte-identical');
      const shapesBefore = shapeHash(root), resourcesBefore = inventory(root), disposalCounts = new Map();
      for (const set of Object.values(resourcesBefore)) for (const resource of set) { disposalCounts.set(resource, 0); resource.addEventListener('dispose', () => disposalCounts.set(resource, disposalCounts.get(resource) + 1)); }
      parent.position.set(2, 3, -4); parent.scale.setScalar(1.2); parent.add(root); root.position.set(.3, .5, -.2); root.scale.setScalar(.8); root.rotation.y = .63;
      const center = root.getWorldPosition(new THREE.Vector3()), diameter = detail.diameterLocalM * .96, camera = center.clone();
      const check = (distance, expected) => {
        camera.copy(center).add(new THREE.Vector3(distance,0,0));
        assert.equal(updateReefLandscapeDetail(root, camera), expected);
        assert.equal(detail.near.visible, expected === 'near'); assert.equal(detail.far.visible, expected === 'far');
      };
      for (let cycle = 0; cycle < 24; cycle++) {
        check(diameter * 2, 'near'); check(diameter * 2.5, 'near');
        check(diameter * 3.1, 'far'); check(diameter * 2.5, 'far');
      }
      assert.equal(shapeHash(root), shapesBefore); assert.deepEqual(inventory(root), resourcesBefore);
      const nearTriangles = triangles(detail.near), farTriangles = triangles(detail.far);
      assert.ok(nearTriangles > farTriangles); assert.ok(farTriangles < 6000);
      const nearSize = new THREE.Box3().setFromObject(detail.near).getSize(new THREE.Vector3()).toArray();
      const farSize = new THREE.Box3().setFromObject(detail.far).getSize(new THREE.Vector3()).toArray();
      disposeReefLandscapeCoral(root); disposeReefLandscapeCoral(root);
      assert.ok([...disposalCounts.values()].every(count => count === 0), 'Sibling and standalone low owner retain shared resources');
      disposeOrganism(low); disposeReefLandscapeCoral(sibling); disposeReefLandscapeCoral(sibling);
      assert.ok([...disposalCounts.values()].every(count => count === 1), 'Each unique resource releases once after all owners');
      rows.push({morphotype, variant, farTriangles, nearTriangles, nearSizeM:nearSize, farSizeM:farSize,
        uniqueGeometries:resourcesBefore.geometries.size, uniqueMaterials:resourcesBefore.materials.size, uniqueTextures:resourcesBefore.textures.size,
        visibilityTransitions:48, hysteresisChecks:48, lowGeometryUnchanged:true, allBuffersUnchanged:true, sharedDisposalsEach:1});
    } finally { disposeOrganism(low); disposeReefLandscapeCoral(root); disposeReefLandscapeCoral(sibling); }
  }
  const massive = createReefLandscapeCoral('boulder');
  try { assert.equal(massive.userData.landscapeDetail, undefined); assert.equal(inventory(massive).geometries.size,1); }
  finally { disposeReefLandscapeCoral(massive); }
  return {schema:'reef-landscape-detail-v1', status:'passed', rows, massiveColoniesRetainSingleFittedSurface:true,
    scope:'Node actual preallocated geometry, viewing hysteresis, cache ownership and disposal; not browser/GPU performance or final visual quality',
    limitations:['The medium crown adds small branches; recorded bounds may differ slightly from the low crown.',
      'Viewing thresholds are authored display choices. Geometry has no additional modeled biomass or growth.',
      'Stable scene resources do not prove JavaScript heap or total GPU memory stability.']};
}
