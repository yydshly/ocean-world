import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCoralLandscape, createOrganism, disposeOrganism } from '../src/world/organisms.js';
import { speciesCatalog } from '../src/species.js';

// Geometry/resource inspection only. Documentary visual quality and surface
// contact on the authored reef still require actual browser screenshots.
function inspect(root) {
  const meshes = [];
  root.traverse(object => { if (object.isMesh) meshes.push(object); });
  assert.equal(meshes.length, 1, 'A colony must remain one mesh/draw');
  const mesh = meshes[0], geo = mesh.geometry;
  for (const attribute of Object.values(geo.attributes)) {
    assert([...attribute.array].every(Number.isFinite), 'Non-finite geometry attribute');
  }
  assert(geo.index);
  assert(Math.max(...geo.index.array) < geo.attributes.position.count);
  geo.computeBoundingBox();
  const position = geo.getAttribute('position'), normal = geo.getAttribute('normal');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let minimumDoubleArea = Infinity;
  for (let i = 0; i < geo.index.count; i += 3) {
    a.fromBufferAttribute(position, geo.index.array[i]);
    b.fromBufferAttribute(position, geo.index.array[i + 1]);
    c.fromBufferAttribute(position, geo.index.array[i + 2]);
    minimumDoubleArea = Math.min(minimumDoubleArea, b.sub(a).cross(c.sub(a)).length());
  }
  let minimumNormalLength = Infinity, maximumNormalLength = 0;
  for (let i = 0; i < normal.count; i++) {
    const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    minimumNormalLength = Math.min(minimumNormalLength, length);
    maximumNormalLength = Math.max(maximumNormalLength, length);
  }
  const bounds = { min: geo.boundingBox.min.toArray(), max: geo.boundingBox.max.toArray() };
  const dimensions = geo.boundingBox.getSize(new THREE.Vector3());
  const report = { vertices: position.count, triangles: geo.index.count / 3,
    mainDraws: 1, bounds, dimensions: dimensions.toArray(), minimumDoubleArea,
    minimumNormalLength, maximumNormalLength,
    positionSHA256: createHash('sha256').update(Buffer.from(position.array.buffer)).digest('hex') };
  const shared = resources(root);
  assert.equal([...shared].filter(resource => resource.isBufferGeometry).length, 1);
  assert.equal([...shared].filter(resource => resource.isMaterial).length, 1);
  assert.equal([...shared].filter(resource => resource.isTexture).length, 2);
  assert.equal(shared.size, 4, 'Coral added resources beyond one geometry, material, color and bump');
  report.surfaceChannels = {};
  for (const [channel, texture] of [['color', mesh.material.map], ['bump', mesh.material.bumpMap]]) {
    assert.equal(texture.image.width, 256); assert.equal(texture.image.height, 256);
    assert.equal(texture.image.data.length, 256 * 256 * 4);
    assert.equal(texture.wrapS, THREE.RepeatWrapping); assert.equal(texture.wrapT, THREE.RepeatWrapping);
    assert.equal(texture.generateMipmaps, true);
    report.surfaceChannels[channel] = { dimensions: [256, 256],
      pixelSHA256: createHash('sha256').update(texture.image.data).digest('hex'),
      colorSpace: texture.colorSpace };
  }
  if (geo.userData.coralBranches?.count) {
    const vertices = new Map(), welded = [], edges = new Map();
    for (let i = 0; i < position.count; i++) {
      const key = [position.getX(i), position.getY(i), position.getZ(i)]
        .map(value => Math.round(value * 1e6)).join(',');
      if (!vertices.has(key)) vertices.set(key, vertices.size);
      welded.push(vertices.get(key));
    }
    for (let i = 0; i < geo.index.count; i += 3) {
      const triangle = [0, 1, 2].map(offset => welded[geo.index.array[i + offset]]);
      assert.equal(new Set(triangle).size, 3, 'Rounded branch created a collapsed triangle');
      for (let edge = 0; edge < 3; edge++) {
        const a = triangle[edge], b = triangle[(edge + 1) % 3];
        const key = a < b ? `${a}/${b}` : `${b}/${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    const boundaryEdges = [...edges.values()].filter(count => count === 1).length;
    const nonManifoldEdges = [...edges.values()].filter(count => count > 2).length;
    assert.equal(boundaryEdges, 0, 'Coral still exposes an open branch pipe');
    assert.equal(nonManifoldEdges, 0, 'Branch caps created a non-manifold edge');
    assert(minimumDoubleArea > 1e-9, 'Coral branch tip has degenerate triangles');
    assert(minimumNormalLength > .99 && maximumNormalLength < 1.01);
    assert.equal(geo.userData.coralBranches.closedEnds, geo.userData.coralBranches.count * 2);
    assert.equal(mesh.material.emissive.getHex(), 0);
    assert.equal(mesh.material.transparent, false);
    const branches = geo.userData.coralBranches, corallites = geo.userData.coralCorallites;
    assert(branches.radiusCoefficientOfVariation > .20, 'Branch diameters became uniform');
    assert(branches.maximumEndRatio - branches.minimumEndRatio > .20, 'All branches regained one taper ratio');
    assert(branches.meanCenterlineExcess > .005, 'Curved branching became straight sticks');
    assert(corallites.axialCount > 0 && corallites.radialCount > 0);
    assert.equal(corallites.axialCount, branches.axialCups);
    assert.equal(mesh.material.bumpScale, .0017);
    report.corallites = { ...corallites, actualGeometry: inspectCoralliteSections(geo) };
    report.solidBranches = { ...geo.userData.coralBranches, boundaryEdges, nonManifoldEdges,
      edgeWeldToleranceMeters: 1e-6,
      note: 'Every source branch is a closed shell; intersecting branch junctions are not a boolean-union surface.' };
  }
  if (root.userData.morphotype === 'boulder') {
    assert(minimumDoubleArea > 1e-8, 'Boulder crown has degenerate triangles');
    assert(minimumNormalLength > .99 && maximumNormalLength < 1.01);
    assert(dimensions.y / Math.max(dimensions.x, dimensions.z) > .29,
      'Massive colony was flattened back into a smooth low cap');
    const edgeRadii = [];
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getY(i) + .014) < 1e-6) edgeRadii.push(Math.hypot(position.getX(i), position.getZ(i)));
    }
    const mean = edgeRadii.reduce((sum, radius) => sum + radius, 0) / edgeRadii.length;
    const deviation = Math.sqrt(edgeRadii.reduce((sum, radius) => sum + (radius - mean) ** 2, 0) / edgeRadii.length);
    report.attachmentOutline = { samples: edgeRadii.length,
      minimumRadius: Math.min(...edgeRadii), maximumRadius: Math.max(...edgeRadii),
      radialCoefficientOfVariation: deviation / mean };
    assert(report.attachmentOutline.radialCoefficientOfVariation > .08,
      'Attachment outline has become circular');
    assert.equal(mesh.material.bumpScale, .0024);
    assert.equal(mesh.material.emissive.getHex(), 0, 'Proxy coral gained emissive color');
    assert.equal(root.userData.speciesId, undefined, 'Decorative morphology gained a species identity');
    assert.equal(root.userData.landscapeCoral, true);
    const texture = mesh.material.map.image, coarsePixels = [];
    for (let by = 0; by < texture.height; by += 32) for (let bx = 0; bx < texture.width; bx += 32) {
      let sum = 0;
      for (let y = by; y < by + 32; y++) for (let x = bx; x < bx + 32; x++) {
        sum += texture.data[(y * texture.width + x) * 4 + 1];
      }
      coarsePixels.push(sum / 1024);
    }
    const coarseMean = coarsePixels.reduce((sum, value) => sum + value, 0) / coarsePixels.length;
    const coarseDeviation = Math.sqrt(coarsePixels.reduce((sum, value) => sum + (value - coarseMean) ** 2, 0) /
      coarsePixels.length);
    report.coarseAlbedo = { boxFilterWidthPixels: 32, outputWidthPixels: texture.width / 32,
      greenChannelMeanByte: coarseMean, greenChannelStandardDeviationByte: coarseDeviation };
    assert(coarseDeviation > 8, 'Wide-view filtering removed all broad tissue variation');
  }
  return report;
}

function inspectCoralliteSections(geo) {
  const position = geo.getAttribute('position'), normal = geo.getAttribute('normal');
  const origin = new THREE.Vector3(), rim = new THREE.Vector3(), pole = new THREE.Vector3();
  const vertex = new THREE.Vector3(), direction = new THREE.Vector3(), axis = new THREE.Vector3();
  let minimumDepression = Infinity, minimumOutwardNormalDot = Infinity, maximumSeamNormalDifference = 0;
  const measured = { axial: [], radial: [] }, basalRadii = [];
  for (const section of geo.userData.coralSurfaceSections) {
    const stride = section.sides + 1, first = section.vertexStart;
    origin.set(0, 0, 0);
    for (let side = 0; side < section.sides; side++) origin.add(vertex.fromBufferAttribute(position, first + side));
    origin.multiplyScalar(1 / section.sides);
    let radiusSum = 0;
    for (let side = 0; side < section.sides; side++) {
      vertex.fromBufferAttribute(position, first + side);
      direction.copy(vertex).sub(origin).normalize();
      minimumOutwardNormalDot = Math.min(minimumOutwardNormalDot,
        direction.dot(vertex.fromBufferAttribute(normal, first + side)));
      radiusSum += vertex.fromBufferAttribute(position, first + side).distanceTo(origin);
    }
    if (section.kind === 'branch') basalRadii.push(radiusSum / section.sides);
    for (let ring = 0; ring < section.rings; ring++) {
      direction.fromBufferAttribute(normal, first + ring * stride);
      maximumSeamNormalDifference = Math.max(maximumSeamNormalDifference,
        direction.distanceTo(vertex.fromBufferAttribute(normal, first + ring * stride + section.sides)));
    }
    if (!section.axialCup && section.kind !== 'radial') continue;
    rim.set(0, 0, 0);
    for (let side = 0; side < section.sides; side++) {
      rim.add(vertex.fromBufferAttribute(position, first + section.lipRing * stride + side));
    }
    rim.multiplyScalar(1 / section.sides);
    pole.fromBufferAttribute(position, first + section.mouthPole);
    axis.fromArray(section.axis);
    const depression = direction.copy(rim).sub(pole).dot(axis);
    let outerRadius = 0;
    for (let side = 0; side < section.sides; side++) {
      outerRadius += vertex.fromBufferAttribute(position, first + section.lipRing * stride + side).distanceTo(rim);
    }
    outerRadius /= section.sides;
    assert(depression > .0006 && depression < .0035, 'Corallite mouth is no longer a shallow concavity');
    assert(outerRadius > .001 && outerRadius < .0033, 'Corallite became an oversized pipe or vanished');
    minimumDepression = Math.min(minimumDepression, depression);
    measured[section.kind === 'radial' ? 'radial' : 'axial'].push({ outerDiameter: outerRadius * 2, depression });
  }
  assert(minimumOutwardNormalDot > .15, 'Branch/cup exterior normals point into the colony');
  assert(maximumSeamNormalDifference < 1e-6, 'UV seam has discontinuous lighting normals');
  assert.equal(measured.axial.length, geo.userData.coralCorallites.axialCount);
  assert.equal(measured.radial.length, geo.userData.coralCorallites.radialCount);
  const mean = basalRadii.reduce((sum, value) => sum + value, 0) / basalRadii.length;
  const cv = Math.sqrt(basalRadii.reduce((sum, value) => sum + (value - mean) ** 2, 0) / basalRadii.length) / mean;
  assert(cv > .20, 'Actual geometry lost branch-diameter variation');
  return { measuredAxialCups: measured.axial.length, measuredRadialCups: measured.radial.length,
    minimumMouthDepressionMeters: minimumDepression, minimumExteriorNormalDot: minimumOutwardNormalDot,
    maximumDuplicatedSeamNormalDifference: maximumSeamNormalDifference,
    basalRadiusCoefficientOfVariation: cv,
    note: 'Rims, concavity and exterior lighting normals are measured from generated vertices, not only metadata.' };
}

function resources(root) {
  const result = new Set();
  root.traverse(object => {
    if (object.geometry) result.add(object.geometry);
    if (object.material) {
      result.add(object.material);
      for (const value of Object.values(object.material)) if (value?.isTexture) result.add(value);
    }
  });
  return result;
}

const records = [];
for (const morphology of ['boulder', 'table', 'branching']) {
  for (let variant = 0; variant < 4; variant++) {
    const lods = {};
    for (const detail of ['low', 'medium', 'high']) {
      const first = createCoralLandscape(morphology, ['#b2aa88'], variant, detail);
      const second = createCoralLandscape(morphology, ['#b2aa88'], variant, detail);
      const report = inspect(first);
      assert.equal(report.positionSHA256, inspect(second).positionSHA256, 'Same variant/detail changed shape');
      const shared = resources(first), secondResources = resources(second);
      assert([...shared].every(resource => secondResources.has(resource)), 'Colony cache sharing failed');
      const disposed = new Map([...shared].map(resource => [resource, 0]));
      for (const resource of shared) resource.addEventListener('dispose', () => {
        disposed.set(resource, disposed.get(resource) + 1);
      });
      disposeOrganism(first); disposeOrganism(first);
      assert([...disposed.values()].every(count => count === 0));
      disposeOrganism(second);
      assert([...disposed.values()].every(count => count === 1));
      const recreated = createCoralLandscape(morphology, ['#b2aa88'], variant, detail);
      assert([...resources(recreated)].every(resource => !shared.has(resource)));
      assert.equal(report.positionSHA256, inspect(recreated).positionSHA256);
      disposeOrganism(recreated);
      lods[detail] = { ...report, sharedResources: shared.size, disposalExactlyOnce: true, rebuildFresh: true };
    }
    for (const detail of ['medium', 'high']) for (const endpoint of ['min', 'max']) {
        for (let axis = 0; axis < 3; axis++) assert(
          Math.abs(lods.low.bounds[endpoint][axis] - lods[detail].bounds[endpoint][axis]) < .025,
          `${morphology} growth envelope moves significantly with detail`);
    }
    records.push({ morphology, variant, lods });
  }
}
for (const morphology of ['boulder', 'table', 'branching']) assert.equal(new Set(records.filter(record => record.morphology === morphology)
  .map(record => record.lods.low.positionSHA256)).size, 4, `${morphology} variants are identical`);
const source = readFileSync('src/world/organisms.js', 'utf8');
const nonCoralSource = source.slice(0, source.indexOf('// Coral-only solid branches.')) +
  source.slice(source.indexOf('function createShrimp(root, species)'));
const nonCoralSourceSHA256 = createHash('sha256').update(nonCoralSource).digest('hex');
assert.equal(nonCoralSourceSHA256, '209b7ea93bb4370db957abc0447dfaf7c6c33ff1368587b001abc4c570a8b845',
  'Non-coral anatomy, fish LOD or shared resource helpers changed in this coral-only revision');
const report = { schema: 'tidal-coral-corallite-node-inspection-v2', inspectedAt: new Date().toISOString(),
  sourceSHA256: createHash('sha256').update(readFileSync('src/world/organisms.js')).digest('hex'),
  inspectionScriptSHA256: createHash('sha256').update(readFileSync('scripts/inspect-coral-morphology.mjs')).digest('hex'),
  previousSourceSHA256: 'ba62b2c4d2e274c0de0de6fbd53460f7eb72a9db39263f0ee3d7cd66cd5090ee',
  nonCoralSourceSHA256, nonCoralSourceUnchanged: true,
  passed: true, records,
  notes: ['Finite indexed geometry and resource disposal are inspected without a WebGL context.',
    'Every decorative colony retains one indexed mesh/material and one estimated main draw.',
    'Four massive-colony variants have unequal fused growth lobes, noncircular attachment outlines and shallow authored cups.',
    'Rounded broad lobes replace the narrow peaks found in the first actual browser review. A 32-pixel box-filter check retains broad albedo variation; it does not establish GPU rendering quality.',
    'The surface is an uncalibrated visual morphology proxy; no named species, individual or ecological biomass is added.',
    'Lowest-detail boulder geometry changes from 2304 to 3096 triangles. There are 33 boulder placements in the 165-slot authored reef, so this adds at most 26136 triangles before placement rejection.',
    'Branching and table crowns have unequal branch diameters, variable taper, curved cylindrical axes and sparse tissue-covered tubular radial cups. Tip lips and concave mouths are merged into the single indexed mesh. Animal tube geometry and fish LOD are unchanged.',
    'A. muricata guidance: https://www.coralsoftheworld.org/species_factsheets/species_factsheet_summary/acropora-muricata/ (read 2026-10-03). Expert factsheet supports compact shallow-water thickets, cylindrical branches, exsert axial corallites, tubular radial corallites of similar or mixed sizes and regular or irregular distribution, with pale branch ends. Angles, microstructure and branch diameters remain authored proxies.',
    'Living tissue is represented by pigmented continuous color, pale growth tips and shallow recessed mouths. Dry-skeleton photographs were not used as textures and no bleached-state interpretation is assigned.',
    'Actual image quality, reef contact and GPU performance remain browser checks.'] };
const namedCoral = speciesCatalog.find(species => species.id === 'staghorn-coral');
report.namedStaghorn = [];
const namedRoots = Array.from({ length: 4 }, () => createOrganism(namedCoral));
const namedPeers = Array.from({ length: 4 }, () => createOrganism(namedCoral));
for (let variant = 0; variant < 4; variant++) {
  const root = namedRoots[variant], peer = namedPeers[variant];
  const inspection = inspect(root);
  assert(inspection.triangles <= 36500, 'Named coral exceeds the previous 36500-triangle budget');
  assert.equal(root.userData.speciesId, namedCoral.id);
  assert.equal(inspection.positionSHA256, inspect(peer).positionSHA256);
  const shared = resources(root), disposal = new Map([...shared].map(resource => [resource, 0]));
  assert([...shared].every(resource => resources(peer).has(resource)));
  for (const resource of shared) resource.addEventListener('dispose', () => {
    disposal.set(resource, disposal.get(resource) + 1);
  });
  disposeOrganism(root); disposeOrganism(root);
  assert([...disposal.values()].every(count => count === 0));
  const uniqueGeometry = [...shared].find(resource => resource.isBufferGeometry);
  disposeOrganism(peer);
  assert.equal(disposal.get(uniqueGeometry), 1);
  // Materials and textures are also held by the other three named variants.
  // The final pair must release those shared resources exactly once.
  assert([...disposal.values()].every(count => count <= 1));
  inspection.sharedResources = shared.size;
  inspection.geometryDisposalExactlyOnce = true;
  report.namedStaghorn.push(inspection);
  if (variant === 3) assert([...disposal.values()].every(count => count === 1));
}
report.renderBudget = { previousLowTriangles: { boulder: 3096, table: 4752, branching: 4032 },
  currentLowTriangles: Object.fromEntries(['boulder', 'table', 'branching'].map(morphology =>
    [morphology, records.find(record => record.morphology === morphology).lods.low.triangles])),
  authoredMaximumPlacements: { boulder: 33, table: 66, branching: 66 },
  mainDrawsPerColony: 1, additionalMaterials: 0, additionalTextures: 0 };
report.renderBudget.maximumReefTriangleChangeBeforePlacementRejection =
  Object.entries(report.renderBudget.currentLowTriangles).reduce((sum, [morphology, current]) =>
    sum + (current - report.renderBudget.previousLowTriangles[morphology]) *
    report.renderBudget.authoredMaximumPlacements[morphology], 0);
for (const record of records) assert(record.lods.low.triangles <= 6000, 'Landscape low mesh exceeds the 6000-triangle budget');
writeFileSync('output/validation/coral-corallite-smoke-v2.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: true, inspectedVariants: records.length,
  renderBudget: report.renderBudget,
  namedStaghornTriangles: report.namedStaghorn.map(record => record.triangles),
  boulders: records.filter(record => record.morphology === 'boulder').map(record => ({
    variant: record.variant, lowTriangles: record.lods.low.triangles,
    dimensions: record.lods.low.dimensions,
    outlineVariation: record.lods.low.attachmentOutline.radialCoefficientOfVariation,
  })) }, null, 2));
