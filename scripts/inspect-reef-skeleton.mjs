import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import * as THREE from 'three';
import { decodeReefScanForInspection } from './lib/decode-reef-scan.mjs';
import { prepareReefSkeletonDisplay, REEF_SCAN_MOUNT_CUT_Y_M } from '../src/world/reefScanDisplay.js';
import { placeReefSkeletonOnSubstrate } from '../src/world/reefScanPlacement.js';

// Geometry evidence only. The official bundled Draco wrapper and WASM execute
// in Node. No GLTFLoader browser path, JPEG decoder, Worker or WebGL is used.
const root = new URL('../', import.meta.url), rootPath = fileURLToPath(root);
const output = new URL('output/validation/reef-skeleton-geometry-inspection-v1.json', root);
const sourceFiles = [
  'public/assets/reef-scan/usnm_229-20k-thumb.glb', 'public/assets/reef-scan/document.json',
  'public/assets/reef-scan/draco_wasm_wrapper.js', 'public/assets/reef-scan/draco_decoder.wasm',
  'public/assets/reef-scan/download-receipts.json', 'public/assets/reef-scan/decoder-receipts.json',
  'public/assets/reef-scan/license-evidence.json',
  'src/world/reefScanAssets.js', 'src/world/reefScanDisplay.js', 'src/world/reefScanPlacement.js',
  'src/world/reefTerrain.js', 'src/world/reefSpatialQueries.js', 'src/world/ReefWorld.js',
  'src/world/organisms.js', 'src/habitat.js', 'src/capture.js',
  'scripts/lib/decode-reef-scan.mjs', 'scripts/inspect-reef-skeleton.mjs',
  'tests/reef-scan-display.test.mjs', 'tests/reef-scan-placement.test.mjs',
  'package.json', 'package-lock.json', 'node_modules/three/package.json', 'node_modules/three-mesh-bvh/package.json',
];
async function receipts() {
  return Object.fromEntries(await Promise.all(sourceFiles.map(async path => {
    const bytes = await readFile(new URL(path, root));
    return [path, { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }];
  })));
}
function attributeSummary(geometry) {
  const position = geometry.getAttribute('position');
  assert.equal(position.itemSize, 3);
  const attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    assert.equal(attribute.count, position.count, `${name} count differs`);
    const min = Array(attribute.itemSize).fill(Infinity), max = Array(attribute.itemSize).fill(-Infinity);
    let nonFiniteValues = 0;
    for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) {
      const value = attribute.getComponent(i, c);
      if (!Number.isFinite(value)) nonFiniteValues++;
      min[c] = Math.min(min[c], value); max[c] = Math.max(max[c], value);
    }
    assert.equal(nonFiniteValues, 0);
    attributes[name] = { count: attribute.count, itemSize: attribute.itemSize, min, max, nonFiniteValues,
      arraySha256: createHash('sha256').update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)).digest('hex') };
  }
  assert.equal(geometry.getAttribute('normal').itemSize, 3);
  assert.equal(geometry.getAttribute('uv').itemSize, 2);
  const index = geometry.getIndex(), referencedVertices = new Set(index.array);
  const normal = geometry.getAttribute('normal');
  let minNormalLength = Infinity, maxNormalLength = -Infinity, zeroNormalVertices = 0;
  let minReferencedNormalLength = Infinity, maxReferencedNormalLength = -Infinity;
  for (let i = 0; i < normal.count; i++) {
    const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    minNormalLength = Math.min(minNormalLength, length); maxNormalLength = Math.max(maxNormalLength, length);
    if (!length) zeroNormalVertices++;
    if (referencedVertices.has(i)) { minReferencedNormalLength = Math.min(minReferencedNormalLength, length); maxReferencedNormalLength = Math.max(maxReferencedNormalLength, length); }
  }
  // SphereGeometry contains unused pole-seam vertices whose computed normal is
  // zero. Report all vertices, but unit-length assertion covers drawn vertices.
  assert.ok(minReferencedNormalLength > .999 && maxReferencedNormalLength < 1.001, 'Referenced normals lost unit length');
  assert.equal(index.count % 3, 0);
  let outOfRangeIndices = 0;
  for (const value of index.array) if (!Number.isInteger(value) || value < 0 || value >= position.count) outOfRangeIndices++;
  assert.equal(outOfRangeIndices, 0);
  geometry.computeBoundingBox();
  return { vertices: position.count, referencedVertices: referencedVertices.size, triangles: index.count / 3, attributes,
    minNormalLength, maxNormalLength, zeroNormalVertices, minReferencedNormalLength, maxReferencedNormalLength,
    indices: { count: index.count, outOfRangeIndices,
      arraySha256: createHash('sha256').update(Buffer.from(index.array.buffer, index.array.byteOffset, index.array.byteLength)).digest('hex') },
    boundsM: { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray(),
      size: geometry.boundingBox.getSize(new THREE.Vector3()).toArray() } };
}
function unchangedUpperTriangles(before, geometry) {
  const after = { position: geometry.attributes.position, normal: geometry.attributes.normal, uv: geometry.attributes.uv, index: geometry.index };
  const vertexKey = (data, i, offset = 0) => [data.position.getX(i), Math.fround(data.position.getY(i) + offset), data.position.getZ(i),
    data.normal.getX(i), data.normal.getY(i), data.normal.getZ(i), data.uv.getX(i), data.uv.getY(i)].join('/');
  const triangleKey = (data, k, offset = 0) => [0, 1, 2].map(j => vertexKey(data, data.index.getX(k + j), offset)).join('|');
  const triangles = new Set();
  for (let k = 0; k < after.index.count; k += 3) triangles.add(triangleKey(after, k));
  let retained = 0;
  for (let k = 0; k < before.index.count; k += 3) {
    if ([0, 1, 2].some(j => before.position.getY(before.index.getX(k + j)) < REEF_SCAN_MOUNT_CUT_Y_M)) continue;
    assert.ok(triangles.has(triangleKey(before, k, -REEF_SCAN_MOUNT_CUT_Y_M)), 'Upper triangle, winding, normals or UV changed');
    retained++;
  }
  assert.equal(retained, 19038);
  return retained;
}

const beforeReceipts = await receipts();
assert.equal(beforeReceipts[sourceFiles[0]].sha256, 'c3ce125d357952ff1caa68efb920fcd4876d29459517d83b2de2a3aa211f8060');
assert.equal(beforeReceipts[sourceFiles[1]].sha256, 'a6332dc422504fc2793124b159301a5aa33a82096d0a591dcfd7fa1d704c8418');
const decoderReceipts = JSON.parse(await readFile(new URL('public/assets/reef-scan/decoder-receipts.json', root)));
for (const file of ['draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
  assert.equal(beforeReceipts[`public/assets/reef-scan/${file}`].sha256, decoderReceipts.find(row => row.file === file).sha256);
}

const testFiles = ['tests/reef-scan-display.test.mjs', 'tests/reef-scan-placement.test.mjs'];
const testStartedAtUtc = new Date().toISOString();
const tests = spawnSync(process.execPath, ['--test', ...testFiles], { cwd: rootPath, encoding: 'utf8', timeout: 120000 });
assert.equal(tests.error, undefined, tests.error?.message);
assert.equal(tests.status, 0, tests.stdout + tests.stderr);
assert.match(tests.stdout, /# pass 4\b/); assert.match(tests.stdout, /# fail 0\b/);

const server = await createServer({ root: rootPath, configFile: false, server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] } });
let scan, world, disposeOrganism, original, display, displayExcision, placement, independentContact, substrateRecord;
let substrateBoundsTreeDisposed = false;
try {
  const [{ ReefWorld }, habitat, organismModule] = await Promise.all([
    server.ssrLoadModule('/src/world/ReefWorld.js'), server.ssrLoadModule('/src/habitat.js'), server.ssrLoadModule('/src/world/organisms.js'),
  ]);
  disposeOrganism = organismModule.disposeOrganism;
  // Execute the actual habitat method including seeded auxiliary rocks and
  // merging. Its platform-only floor, texture and highlight calls are omitted;
  // no copied rock-generation algorithm or substitute raycaster is involved.
  world = Object.create(ReefWorld.prototype);
  Object.assign(world, { isKelp: false, isDeep: false, rocks: habitat.REEF_ROCKS, scene: new THREE.Scene(),
    worldGeometries: new Set(), worldMaterials: new Set(), worldTextures: new Set(),
    texture() { return null; }, caustics(material) { return material; }, makeFloor() {}, makeHighlight() {}, attachReefSkeleton() {} });
  const geometryCreations = [];
  world.ownGeometry = geometry => { world.worldGeometries.add(geometry); geometryCreations.push({
    type: geometry.type, vertices: geometry.attributes.position.count, triangles: geometry.index.count / 3 }); return geometry; };
  world.makeHabitat();
  assert.ok(world.reefMesh.geometry.boundsTree);
  assert.equal(world.worldGeometries.size, 1);
  substrateRecord = { construction: 'actual ReefWorld.prototype.makeHabitat through Vite SSR; actual shared createReefRockGeometry and merged mesh',
    authoredRockCount: habitat.REEF_ROCKS.length, auxiliaryRockCount: geometryCreations.length - 1 - habitat.REEF_ROCKS.length,
    auxiliaryPlacementSeed: 851, bridgeRockIndex: habitat.REEF_BRIDGE_ROCK_INDEX, individualRockGeometryCreations: geometryCreations.slice(0, -1),
    mergedGeometry: attributeSummary(world.reefMesh.geometry), staticBoundsTreePresent: true,
    platformCallsOmitted: ['texture loading (material map/bumpMap null)', 'makeFloor', 'makeHighlight', 'attachReefSkeleton'],
    noWorldConstructorOrRenderer: true };

  scan = await decodeReefScanForInspection();
  original = attributeSummary(scan.geometry);
  assert.equal(original.triangles, 20000); assert.equal(original.vertices, 23488);
  const upper = { position: scan.geometry.attributes.position.clone(), normal: scan.geometry.attributes.normal.clone(),
    uv: scan.geometry.attributes.uv.clone(), index: scan.geometry.index.clone() };
  displayExcision = prepareReefSkeletonDisplay(scan.group);
  const cut = displayExcision.meshes[0];
  assert.deepEqual([cut.removedTriangles, cut.clippedSourceTriangles, cut.unchangedSourceTriangles, cut.displayTriangles, cut.displayVertices],
    [892, 70, 19038, 19146, 22909]);
  display = attributeSummary(scan.geometry);
  display.upperTrianglesRetainedExactly = unchangedUpperTriangles(upper, scan.geometry);
  assert.equal(display.boundsM.min[1], 0);
  for (const [axis, size] of [[0, .6265922784805298], [1, .2832714319229126], [2, .4115196466445923]]) {
    assert.ok(Math.abs(display.boundsM.size[axis] - size) < 1e-12, 'Original metre size changed');
  }
  assert.deepEqual(scan.group.scale.toArray(), [1, 1, 1]);
  const positionsBeforePlacement = scan.geometry.attributes.position.array.slice();
  placement = placeReefSkeletonOnSubstrate(scan.group, world.reefMesh);
  assert.equal(placement.vertexSamples, 22909);
  assert.equal(placement.physicalScaleMultiplier, 1);
  assert.deepEqual(scan.geometry.attributes.position.array, positionsBeforePlacement);
  assert.deepEqual(scan.group.scale.toArray(), [1, 1, 1]);
  world.reefMesh.updateMatrixWorld(true); scan.group.updateMatrixWorld(true);
  const substrateBounds = new THREE.Box3().setFromObject(world.reefMesh);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), point = new THREE.Vector3();
  ray.firstHitOnly = true;
  let checkedVertices = 0, misses = 0, minGapM = Infinity, maxGapM = -Infinity, belowClearanceVertices = 0, nearContactVertices = 0;
  let minGapVertex = null, maxGapVertex = null;
  scan.group.traverse(object => {
    if (!object.isMesh) return;
    const position = object.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      ray.set(new THREE.Vector3(point.x, substrateBounds.max.y + 1, point.z), down);
      const hit = ray.intersectObject(world.reefMesh, false)[0];
      checkedVertices++;
      if (!hit) { misses++; continue; }
      const gapM = point.y - hit.point.y;
      assert.ok(Number.isFinite(gapM));
      if (gapM < placement.clearanceM - 1e-9) belowClearanceVertices++;
      if (gapM <= placement.clearanceM + .001) nearContactVertices++;
      const sample = { vertexIndex: i, worldPositionM: point.toArray(), substrateIntersectionM: hit.point.toArray(), gapM, substrateFaceIndex: hit.faceIndex };
      if (gapM < minGapM) { minGapM = gapM; minGapVertex = sample; }
      if (gapM > maxGapM) { maxGapM = gapM; maxGapVertex = sample; }
    }
  });
  assert.equal(checkedVertices, 22909); assert.equal(misses, 0); assert.equal(belowClearanceVertices, 0);
  assert.ok(Math.abs(minGapM - .004) < 1e-9);
  assert.ok(Math.abs(minGapM - placement.minVertexGapM) < 1e-9);
  assert.ok(Math.abs(maxGapM - placement.maxVertexGapM) < 1e-9);
  assert.equal(nearContactVertices, placement.nearContactVertices);
  independentContact = { checkedVertices, misses, belowClearanceVertices, toleranceM: 1e-9, minGapM, maxGapM,
    nearContactVertices, nearContactThresholdM: placement.clearanceM + .001, minGapVertex, maxGapVertex,
    method: 'second per-vertex world-space downward ray pass against actual merged substrate using actual static BVH',
    agreesWithPlacementRecord: true };
} finally {
  scan?.dispose();
  if (world) {
    for (const coral of [...(world.decorations?.children || [])]) disposeOrganism?.(coral);
    for (const geometry of world.worldGeometries) geometry.dispose();
    substrateBoundsTreeDisposed = world.reefMesh?.geometry.boundsTree === null;
    for (const material of world.worldMaterials) material.dispose();
    world.scene.clear();
  }
  await server.close();
}
assert.equal(substrateBoundsTreeDisposed, true, 'Static BVH survived owned geometry disposal');
const afterReceipts = await receipts();
assert.deepEqual(afterReceipts, beforeReceipts, 'Inputs changed while inspection ran; rerun against a stable source snapshot');
const packageVersion = async path => JSON.parse(await readFile(new URL(path, root))).version;
const report = { schema: 'reef-skeleton-node-geometry-inspection-v1', generatedAtUtc: new Date().toISOString(), passed: true,
  command: 'node scripts/inspect-reef-skeleton.mjs', outputFile: 'output/validation/reef-skeleton-geometry-inspection-v1.json',
  runtime: { node: process.version, platform: process.platform, arch: process.arch, three: await packageVersion('node_modules/three/package.json'),
    threeMeshBvh: await packageVersion('node_modules/three-mesh-bvh/package.json') },
  sourceFiles: beforeReceipts, sourceFilesUnchangedBeforeAfter: true, originalGlbAndManifestKnownSha256Preserved: true,
  decoderCopiesMatchReceipts: true,
  geometryDecoder: { module: 'scripts/lib/decode-reef-scan.mjs', engine: 'actual bundled official Draco WASM and wrapper executed in Node VM',
    file: 'public/assets/reef-scan/usnm_229-20k-thumb.glb', actualGeometryDecoded: true, jpegDecoded: false, browserWorkerUsed: false,
    gltfLoaderBrowserPathUsed: false, webglRendererInstantiated: false },
  testsExecuted: { command: `node --test ${testFiles.join(' ')}`, startedAtUtc: testStartedAtUtc, exitCode: tests.status, passed: 4, failed: 0,
    stdout: tests.stdout, stderr: tests.stderr, stdoutSha256: createHash('sha256').update(tests.stdout).digest('hex') },
  sourceNormalizedGeometry: original, displayExcision, displayedGeometry: display,
  transform: scan.transform, rootScale: [1, 1, 1], displayedPhysicalScaleMultiplier: 1,
  substrate: substrateRecord, placement, independentContact, cleanup: { ownedSubstrateBoundsTreeClearedOnDispose: substrateBoundsTreeDisposed },
  limits: [
    'Node CPU geometry inspection only: no browser, JPEG decoding, GPU execution, rendered texture/colour judgement, FPS or soak evidence.',
    'The museum mount is removed by an authored 0.060 m cut in normalized coordinates. Its cut basal surface remains open and is not reconstructed biological attachment.',
    'All 22,909 displayed vertices are checked against downward intersections with the actual rendered hard-substrate triangles. This is not a whole-triangle intersection/contact guarantee or a rigid-body stability test.',
    'The authored 4 mm clearance convention is not a calibrated biological contact measurement.',
    'The original dry Acropora cytherea specimen is represented as a dead skeleton environment asset, not living tissue, A. muricata, biomass, an additional simulated species, or evidence of ecological co-occurrence.',
    'Actual makeHabitat is invoked without a World constructor; texture loading, floor, highlight and scan-attach calls are deliberately omitted. Reef/auxiliary rock geometry, merging, display clipping, placement and static BVH queries execute their current app code.',
    'Only this stable source snapshot is covered. Existing frozen validation builds and reports are neither modified nor extended by this report.',
  ] };
await mkdir(new URL('output/validation/', root), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ passed: true, outputFile: report.outputFile, sourceTriangles: original.triangles, sourceVertices: original.vertices,
  displayedTriangles: display.triangles, displayedVertices: display.vertices, displayedSizeM: display.boundsM.size,
  rootPositionM: placement.rootPositionM, checkedVertices: independentContact.checkedVertices, minGapM: independentContact.minGapM,
  maxGapM: independentContact.maxGapM, auxiliaryRockCount: substrateRecord.auxiliaryRockCount, testsPassed: 4 }, null, 2));
