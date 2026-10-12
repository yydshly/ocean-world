// One finite derivative pass over the unmodified public DinaCon source GLBs.
// Requires meshoptimizer in an external scratch directory and Python with Pillow.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';

const args = Object.fromEntries(process.argv.slice(2).map(v => v.replace(/^--/, '').split('=')));
const project = fileURLToPath(new URL('../', import.meta.url));
const sourceDir = args.source ?? 'D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-sourced-assets/scout-reef';
const productionOutput = path.join(project, 'public/assets/shallow-scanned-reef');
const output = args.output ?? productionOutput;
const meshoptFile = args.meshopt ?? path.join(sourceDir, 'tooling/node_modules/meshoptimizer/meshopt_simplifier.js');
const { MeshoptSimplifier } = await import(pathToFileURL(meshoptFile).href);
await MeshoptSimplifier.ready;
fs.mkdirSync(output, { recursive: true });
const hash = v => createHash('sha256').update(v).digest('hex');
const sources = [
  { key: 'scanned-pocillopora', source: 'pocillopora_meandrina_komang', sha256: '7e63ec720e21cc47735376b2662eb0d9cba1c53f85d04eb32b6ce5b3a83294a2' },
  { key: 'scanned-diploastrea', source: 'diploastrea_heliopora_komang', sha256: '8ac2db30d21168635a8fd87799c2af0d1d3f75f352ba7b7fe1a02bab4c6b5648' },
];
const records = {}, receipts = [], binaryWrites = [];
function readGlb(file) {
  const raw = fs.readFileSync(file);
  if (raw.toString('ascii', 0, 4) !== 'glTF' || raw.readUInt32LE(4) !== 2 || raw.readUInt32LE(8) !== raw.length) throw new Error('Invalid source GLB header');
  const length = raw.readUInt32LE(12), json = JSON.parse(raw.subarray(20, 20 + length).toString());
  const binary = raw.subarray(20 + length + 8);
  if (json.meshes.length !== 1 || json.meshes[0].primitives.length !== 1 || json.nodes.length !== 1 || Object.keys(json.nodes[0]).some(k => k !== 'mesh')) throw new Error('Unexpected source node placement');
  function accessor(id) {
    const a = json.accessors[id], view = json.bufferViews[a.bufferView];
    const count = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    const values = a.componentType === 5126 ? new Float32Array(a.count * count) : new Uint32Array(a.count * count);
    const stride = view.byteStride ?? count * size, offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const reader = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' }[a.componentType];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < count; k++) values[i * count + k] = binary[reader](offset + i * stride + k * size);
    if (!values.every(Number.isFinite)) throw new Error('Nonfinite source accessor');
    return values;
  }
  const p = json.meshes[0].primitives[0];
  return { raw, json, positions: accessor(p.attributes.POSITION), uv: accessor(p.attributes.TEXCOORD_0), indices: accessor(p.indices) };
}
function bounds(p) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i++) { const k = i % 3; min[k] = Math.min(min[k], p[i]); max[k] = Math.max(max[k], p[i]); }
  return { min, max, size: max.map((v, k) => v - min[k]) };
}
for (const item of sources) {
  const glb = readGlb(path.join(sourceDir, `${item.source}.glb`));
  if (hash(glb.raw) !== item.sha256) throw new Error('Source hash mismatch');
  if (!glb.indices.every(v => v < glb.positions.length / 3)) throw new Error('Invalid source index');
  const sourceBounds = bounds(glb.positions), width = Math.max(sourceBounds.size[0], sourceBounds.size[2]);
  const center = [(sourceBounds.min[0] + sourceBounds.max[0]) / 2, sourceBounds.min[1], (sourceBounds.min[2] + sourceBounds.max[2]) / 2];
  const positions = Float32Array.from(glb.positions, (v, i) => (v - center[i % 3]) / width);
  const attributes = glb.uv;
  // Retain the six actual extremes, including the original lowest contact vertex.
  const locked = new Uint8Array(positions.length / 3);
  for (let axis = 0; axis < 3; axis++) for (const extreme of [sourceBounds.min[axis], sourceBounds.max[axis]]) {
    const id = Array.from(glb.positions).findIndex((v, i) => i % 3 === axis && v === extreme) / 3;
    locked[Math.floor(id)] = 1;
  }
  // Detect actual source UV discontinuities at geometrically identical points.
  // The whole duplicated boundary is immutable, not only a heuristic UV jump
  // in a single triangle. No Permissive crossing of chart boundaries is allowed.
  const positionRemap = MeshoptSimplifier.generatePositionRemap(positions, 3), groups = new Map();
  for (let i = 0; i < positionRemap.length; i++) {
    const group = groups.get(positionRemap[i]) ?? []; group.push(i); groups.set(positionRemap[i], group);
  }
  let seamGroups = 0, seamVertices = 0;
  for (const group of groups.values()) {
    const a = group[0];
    if (group.some(b => Math.abs(glb.uv[b * 2] - glb.uv[a * 2]) > 1e-6 || Math.abs(glb.uv[b * 2 + 1] - glb.uv[a * 2 + 1]) > 1e-6)) {
      seamGroups++; seamVertices += group.length;
      for (const vertex of group) locked[vertex] = 1;
    }
  }
  for (const [detail, target] of [['near', 3800], ['distant', 900]]) {
    const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(glb.indices, positions, 3, attributes, 2, [.5, .5], locked, target * 3, 1, []);
    const budgetMet = simplified.length / 3 <= (detail === 'near' ? 4000 : 1000);
    const [remap, count] = MeshoptSimplifier.compactMesh(simplified);
    const vertex = new Float32Array(count * 8);
    for (let old = 0; old < remap.length; old++) if (remap[old] < count) {
      vertex.set(positions.subarray(old * 3, old * 3 + 3), remap[old] * 8);
      vertex.set(glb.uv.subarray(old * 2, old * 2 + 2), remap[old] * 8 + 6);
    }
    const index = Uint16Array.from(simplified);
    // These GLBs contain no NORMAL accessor. Generate normals from each actual
    // derivative topology rather than inventing a preserved source normal field.
    const normalGeometry = new THREE.BufferGeometry();
    const normalPositions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) normalPositions.set(vertex.subarray(i * 8, i * 8 + 3), i * 3);
    normalGeometry.setAttribute('position', new THREE.BufferAttribute(normalPositions, 3));
    normalGeometry.setIndex(new THREE.BufferAttribute(index, 1)); normalGeometry.computeVertexNormals();
    const computedNormals = normalGeometry.getAttribute('normal').array;
    for (let i = 0; i < count; i++) vertex.set(computedNormals.subarray(i * 3, i * 3 + 3), i * 8 + 3);
    normalGeometry.dispose();
    const buffer = Buffer.concat([Buffer.from(vertex.buffer), Buffer.from(index.buffer)]);
    const filename = `${item.key}-${detail}.bin`;
    binaryWrites.push({ filename, buffer });
    const compactPositions = new Float32Array(count * 3);
    let rootRadius = 0, radius = 0;
    for (let i = 0; i < count; i++) {
      compactPositions.set(vertex.subarray(i * 8, i * 8 + 3), i * 3);
      const r = Math.hypot(vertex[i * 8], vertex[i * 8 + 2]); radius = Math.max(radius, r);
      if (vertex[i * 8 + 1] <= .025) rootRadius = Math.max(rootRadius, r);
    }
    const b = bounds(compactPositions);
    if (Math.abs(b.min[1]) > 1e-7 || Math.abs(Math.max(b.size[0], b.size[2]) - 1) > 1e-6) throw new Error('Derivative normalization changed the retained envelope');
    const data = { key: item.key, detail, file: filename, byteLength: buffer.length, sha256: hash(buffer), vertices: count, indices: index.length, triangles: index.length / 3, simplifierError: error, budgetMet, seamGroups, seamVertices, bounds: b, radius, rootRadius, height: b.size[1], rootBandY: .025, baseColorFile: `${item.key}-albedo-1024.jpg`, baseColorFactor: glb.json.materials[0].pbrMetallicRoughness.baseColorFactor ?? [1, 1, 1, 1] };
    records[`${item.key}-${detail}`] = { ...data, encoded: buffer.toString('base64') };
    receipts.push({ ...data, source: `${item.source}.glb`, sourceSha256: item.sha256, sourceBounds, sourceToUnitScale: 1 / width, sourceRecenterTranslation: center.map(v => -v), sourceOrientation: 'source node identity; supplied +Y and positive-height coral/background patch retained', dimensions: 'unit display envelope; not measured metres' });
  }
}
// A failed budget pass is inspection-only and cannot silently overwrite runtime
// data. Supply --output=an-external-scratch-directory to inspect such candidates.
if (path.resolve(output) === path.resolve(productionOutput) && receipts.some(r => !r.budgetMet)) {
  console.log(JSON.stringify(receipts.map(r => ({ key: r.key, detail: r.detail, triangles: r.triangles, budgetMet: r.budgetMet, seamVertices: r.seamVertices }))));
  throw new Error('Chart-safe derivatives exceed the original budget; production assets were not replaced');
}
for (const item of binaryWrites) fs.writeFileSync(path.join(output, item.filename), item.buffer);
const dataModule = path.resolve(output) === path.resolve(productionOutput) ? path.join(project, 'src/world/ShallowScannedReefData.js') : path.join(output, 'ShallowScannedReefData.js');
fs.writeFileSync(dataModule, `// Generated by scripts/prepare-shallow-scanned-reef.mjs; unchanged MIT source scan derivatives.\nexport const SHALLOW_SCANNED_REEF_DATA = ${JSON.stringify(records)};\n`);
const python = String.raw`
import pathlib,struct,json,io,hashlib,sys
from PIL import Image
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);receipts=[]
for key,name in [('scanned-pocillopora','pocillopora_meandrina_komang'),('scanned-diploastrea','diploastrea_heliopora_komang')]:
 raw=(source/(name+'.glb')).read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);b=raw[20+n+8:];slot=j['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index'];image=j['images'][j['textures'][slot]['source']];v=j['bufferViews'][image['bufferView']];imagebytes=b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];im=Image.open(io.BytesIO(imagebytes)).convert('RGB');original=list(im.size);im.resize((1024,1024),Image.Resampling.LANCZOS).save(out/(key+'-albedo-1024.jpg'),quality=92,subsampling=0,optimize=True);derivative=(out/(key+'-albedo-1024.jpg')).read_bytes();receipts.append({'key':key,'sourceEmbeddedImage':j['textures'][slot]['source'],'sourceImageSha256':hashlib.sha256(imagebytes).hexdigest(),'sourceSize':original,'file':key+'-albedo-1024.jpg','bytes':len(derivative),'sha256':hashlib.sha256(derivative).hexdigest(),'size':[1024,1024],'colorSpace':'sRGB baseColor per original glTF semantic','change':'Lanczos 8192 to 1024; JPEG92; no recolor or invented PBR maps'})
(out/'texture-receipts.json').write_text(json.dumps(receipts,indent=2),encoding='utf8')
`;
const result = spawnSync(args.python ?? 'D:/software/python310/python.exe', ['-c', python, sourceDir, output], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr);
fs.copyFileSync(path.join(sourceDir, 'LICENSE'), path.join(output, 'SOURCE-MIT-LICENSE.txt'));
const provenance = { version: 2, sourceKind: 'underwater-photogrammetry-from-author-published-DinaCon-2025-Bali-assets-not-museum-skeletons', sourcePage: 'https://scan3d.dinacon.org/', repository: 'https://github.com/Reobos/Dina3D', authors: [{ sourceCredit: 'Komang', fullCredit: 'Komang Ngurah Semita Dana', creditPage: 'https://blunderboffins.itch.io/karang-lestari' }], geography: 'Les Village, Bali, Indonesia', license: { name: 'MIT', scope: 'published asset repository root LICENSE; no nested license paths or GLB extras overrides observed; not a single-model Creative Commons declaration', copyright: 'Copyright (c) 2025 Kyle Chisholm', file: 'SOURCE-MIT-LICENSE.txt', source: 'https://github.com/Reobos/Dina3D/blob/main/LICENSE' }, tool: { name: 'MeshoptSimplifier', version: '1.3.0', method: 'simplifyWithAttributes; UV .5 each; six source extrema and every actual same-position/different-UV vertex locked; no Permissive; target near3800/far900 triangles; compact original retained vertices; no remeshing or filled holes' }, changes: ['Uniform source max(X/Z)width normalization to 1; original +Y retained; source minY translated to zero', 'Original POS/UV at retained source vertices, UV-aware index simplification; original GLBs have no NORMAL attribute, derived normals computed from actual derivative topology', 'Only original embedded baseColor image retained; Lanczos downsample to 1024; no wet-scene normal/roughness reinterpretation', 'Compact Float32 POS/computedNORMAL/UV plus Uint16 indices in binary and synchronous base64 module'], limits: ['Source has no supplied survey scale/calibration: unit dimensions do not claim real metres', 'Original coral plus irregular basal/background patch retained; not a clean narrow-root colony and not terrain collision or a biological tissue model', 'UV discontinuity vertices are immutable; actual chart constraint floor can prevent the requested runtime budgets', 'Photographic albedo can contain source underwater lighting; no measured reflectance or color correction claimed', 'Only derivative asset preview/data checks; no full scene, browser/WebGL or FPS acceptance'], geometry: receipts, textures: JSON.parse(fs.readFileSync(path.join(output, 'texture-receipts.json'), 'utf8')) };
fs.writeFileSync(path.join(output, 'provenance.json'), JSON.stringify(provenance, null, 2));
console.log(JSON.stringify(receipts.map(r => ({ key: r.key, detail: r.detail, triangles: r.triangles, vertices: r.vertices, height: r.height, radius: r.radius, rootRadius: r.rootRadius, simplifierError: r.simplifierError, bytes: r.byteLength }))));
