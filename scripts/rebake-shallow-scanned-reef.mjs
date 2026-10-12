// Fixed-geometry source-image reprojection, following one failed chart-safe
// simplification pass. No additional geometry tuning, source recolor or PBR bake.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
const options = Object.fromEntries(process.argv.slice(2).map(v => v.replace(/^--/, '').split('=')));
const project = fileURLToPath(new URL('../', import.meta.url));
const scratch = options.source ?? 'D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-sourced-assets/scout-reef';
const initial = path.join(scratch, 'initial-permissive'), output = path.resolve(options.output ?? path.join(project, 'public/assets/shallow-scanned-reef'));
const temporary = path.join(scratch, 'texture-rebake'); fs.mkdirSync(temporary, { recursive: true }); fs.mkdirSync(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const frozenText = fs.readFileSync(path.join(initial, 'ShallowScannedReefData.js'), 'utf8');
const prefix = 'export const SHALLOW_SCANNED_REEF_DATA = ';
const data = JSON.parse(frozenText.slice(frozenText.indexOf(prefix) + prefix.length).trim().replace(/;$/, ''));
const provenance = JSON.parse(fs.readFileSync(path.join(initial, 'assets/provenance.json'), 'utf8'));
const records = {}, geometryReceipts = [], bakeReceipts = [];
function sourceGeometry(filename) {
  const raw = fs.readFileSync(filename), size = raw.readUInt32LE(12), j = JSON.parse(raw.subarray(20, 20 + size).toString()), bin = raw.subarray(20 + size + 8);
  const primitive = j.meshes[0].primitives[0];
  function read(id) {
    const a = j.accessors[id], b = j.bufferViews[a.bufferView], c = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type], scalar = a.componentType === 5126 ? 4 : a.componentType === 5125 ? 4 : 2;
    const v = a.componentType === 5126 ? new Float32Array(a.count * c) : new Uint32Array(a.count * c), method = a.componentType === 5126 ? 'readFloatLE' : a.componentType === 5125 ? 'readUInt32LE' : 'readUInt16LE';
    for (let i = 0; i < a.count; i++) for (let k = 0; k < c; k++) v[i * c + k] = bin[method]((b.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (b.byteStride ?? scalar * c) + k * scalar);
    return v;
  }
  const p = read(primitive.attributes.POSITION), uv = read(primitive.attributes.TEXCOORD_0), index = read(primitive.indices), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i++) { min[i % 3] = Math.min(min[i % 3], p[i]); max[i % 3] = Math.max(max[i % 3], p[i]); }
  const width = Math.max(max[0] - min[0], max[2] - min[2]), center = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(p, (v, i) => (v - center[i % 3]) / width), 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(index, 1));
  return { geometry: g, sourceJson: j, hash: hash(raw) };
}
function decode(record) {
  const bytes = Buffer.from(record.encoded, 'base64'), vertices = new Float32Array(bytes.buffer, bytes.byteOffset, record.vertices * 8);
  const indices = new Uint16Array(bytes.buffer, bytes.byteOffset + record.vertices * 32, record.indices);
  return { vertices, indices };
}
for (const key of ['scanned-pocillopora', 'scanned-diploastrea']) {
  const sourceRecord = provenance.geometry.find(g => g.key === key), source = sourceGeometry(path.join(scratch, sourceRecord.source));
  if (source.hash !== sourceRecord.sourceSha256) throw new Error('Original source hash differs from frozen receipt');
  const sourceG = source.geometry, bvh = new MeshBVH(sourceG), sourceP = sourceG.getAttribute('position'), sourceUV = sourceG.getAttribute('uv'), sourceIndex = sourceG.index;
  const details = ['near', 'distant'], totalFaces = details.reduce((s, d) => s + data[`${key}-${d}`].triangles, 0), grid = Math.ceil(Math.sqrt(totalFaces)), cell = Math.floor(1024 / grid), gutter = 2;
  const lookup = new Float32Array(1024 * 1024 * 2), mask = new Uint8Array(1024 * 1024), distances = [];
  const vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], point = new THREE.Vector3(), closest = { point: new THREE.Vector3() }, triangle = new THREE.Triangle(), bary = new THREE.Vector3();
  let faceOffset = 0, queries = 0;
  for (const detail of details) {
    const old = data[`${key}-${detail}`], original = decode(old), packed = new Float32Array(old.triangles * 3 * 8), indices = new Uint16Array(old.triangles * 3);
    for (let face = 0; face < old.triangles; face++) {
      const cellId = faceOffset + face, x = (cellId % grid) * cell, y = Math.floor(cellId / grid) * cell, extent = cell - gutter * 2 - 1;
      const atlasUV = [[(x + gutter + .5) / 1024, (y + gutter + .5) / 1024], [(x + gutter + extent + .5) / 1024, (y + gutter + .5) / 1024], [(x + gutter + .5) / 1024, (y + gutter + extent + .5) / 1024]];
      for (let corner = 0; corner < 3; corner++) {
        const oldId = original.indices[face * 3 + corner], newId = face * 3 + corner;
        packed.set(original.vertices.subarray(oldId * 8, oldId * 8 + 6), newId * 8); packed.set(atlasUV[corner], newId * 8 + 6); indices[newId] = newId;
        vertices[corner].fromArray(original.vertices, oldId * 8);
      }
      // Every texel, including a bounded edge-extended gutter, projects onto the
      // original 100k surface. UV is interpolated only inside its returned face.
      for (let py = y; py < y + cell; py++) for (let px = x; px < x + cell; px++) {
        let u = THREE.MathUtils.clamp((px - x - gutter) / extent, 0, 1), v = THREE.MathUtils.clamp((py - y - gutter) / extent, 0, 1);
        if (u + v > 1) { const sum = u + v; u /= sum; v /= sum; }
        point.copy(vertices[0]).multiplyScalar(1 - u - v).addScaledVector(vertices[1], u).addScaledVector(vertices[2], v);
        bvh.closestPointToPoint(point, closest); const f = closest.faceIndex * 3;
        const a = sourceIndex.getX(f), b = sourceIndex.getX(f + 1), c = sourceIndex.getX(f + 2);
        triangle.a.fromBufferAttribute(sourceP, a); triangle.b.fromBufferAttribute(sourceP, b); triangle.c.fromBufferAttribute(sourceP, c); triangle.getBarycoord(closest.point, bary);
        const pixel = py * 1024 + px;
        lookup[pixel * 2] = sourceUV.getX(a) * bary.x + sourceUV.getX(b) * bary.y + sourceUV.getX(c) * bary.z;
        lookup[pixel * 2 + 1] = sourceUV.getY(a) * bary.x + sourceUV.getY(b) * bary.y + sourceUV.getY(c) * bary.z;
        mask[pixel] = 1; queries++;
        if ((queries & 31) === 0) distances.push(closest.distance);
      }
    }
    faceOffset += old.triangles;
    const buffer = Buffer.concat([Buffer.from(packed.buffer), Buffer.from(indices.buffer)]);
    const receipt = { ...old, vertices: old.triangles * 3, byteLength: buffer.length, sha256: hash(buffer), normals: 'unchanged computed normals from fixed first-pass derivative; face duplication preserves smoothing', uv: 'independent per-face atlas cells with two-texel edge-extended gutters', baseColorFile: `${key}-albedo-1024.jpg`, sourceGeometrySha256: old.sha256 };
    delete receipt.encoded;
    fs.writeFileSync(path.join(output, receipt.file), buffer); records[`${key}-${detail}`] = { ...receipt, encoded: buffer.toString('base64') };
    const prior = provenance.geometry.find(g => g.key === key && g.detail === detail); geometryReceipts.push({ ...prior, ...receipt });
  }
  if (!lookup.every(Number.isFinite)) throw new Error('Nonfinite source-surface UV reprojection');
  fs.writeFileSync(path.join(temporary, `${key}-lookup.f32`), new Uint8Array(lookup.buffer)); fs.writeFileSync(path.join(temporary, `${key}-mask.u8`), mask);
  distances.sort((a, b) => a - b);
  bakeReceipts.push({ key, originalSourceSha256: source.hash, queryCount: queries, atlasSize: [1024, 1024], nearAndFarSharedAtlas: true, faceCellGrid: grid, cellPixels: cell, gutterPixels: gutter, method: 'per-texel MeshBVH.closestPointToPoint original100k then that source face barycentric UV and original embedded baseColor; no cross-chart vertex interpolation', sampledDistance: { samples: distances.length, median: distances[Math.floor(distances.length / 2)], p95: distances[Math.floor(distances.length * .95)], max: distances.at(-1), units: 'normalized source-width units; not metres' } });
  sourceG.dispose(); console.log(JSON.stringify({ key, queries, distanceP95: bakeReceipts.at(-1).sampledDistance.p95 }));
}
const python = String.raw`
import sys,pathlib,json,struct,io,hashlib
import numpy as np
from PIL import Image
root=pathlib.Path(sys.argv[1]);temp=pathlib.Path(sys.argv[2]);out=pathlib.Path(sys.argv[3]);receipts=[]
for key,name in [('scanned-pocillopora','pocillopora_meandrina_komang'),('scanned-diploastrea','diploastrea_heliopora_komang')]:
 raw=(root/(name+'.glb')).read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);b=raw[20+n+8:];slot=j['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index'];imj=j['images'][j['textures'][slot]['source']];v=j['bufferViews'][imj['bufferView']];imagebytes=b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];im=np.array(Image.open(io.BytesIO(imagebytes)).convert('RGB'));h,w=im.shape[:2];uv=np.fromfile(temp/(key+'-lookup.f32'),dtype=np.float32).reshape(1024,1024,2);mask=np.fromfile(temp/(key+'-mask.u8'),dtype=np.uint8).reshape(1024,1024);pixels=np.zeros((1024,1024,3),dtype=np.uint8)
 for row in range(0,1024,32):
  a=uv[row:row+32];xx=(a[:,:,0]%1)*w-.5;yy=(a[:,:,1]%1)*h-.5;x=np.floor(xx).astype(np.int32);y=np.floor(yy).astype(np.int32);dx=(xx-x)[:,:,None];dy=(yy-y)[:,:,None];value=np.zeros((32,1024,3),np.float32)
  for ox,oy,weight in [(0,0,(1-dx)*(1-dy)),(1,0,dx*(1-dy)),(0,1,(1-dx)*dy),(1,1,dx*dy)]:
   color=im[(y+oy)%h,(x+ox)%w].astype(np.float32)/255;color=np.where(color<=.04045,color/12.92,((color+.055)/1.055)**2.4);value+=color*weight
  srgb=np.where(value<=.0031308,value*12.92,1.055*np.maximum(value,0)**(1/2.4)-.055);pixels[row:row+32]=np.clip(srgb*255+.5,0,255).astype(np.uint8)
 pixels[mask==0]=0;file=out/(key+'-albedo-1024.jpg');Image.fromarray(pixels).save(file,quality=95,subsampling=0,optimize=True);result=file.read_bytes();receipts.append({'key':key,'sourceEmbeddedImage':j['textures'][slot]['source'],'sourceImageSha256':hashlib.sha256(imagebytes).hexdigest(),'sourceSize':[w,h],'file':file.name,'bytes':len(result),'sha256':hashlib.sha256(result).hexdigest(),'size':[1024,1024],'colorSpace':'sRGB; bilinear original pixels interpolated in linear color then encoded sRGB','change':'Nearest-original-surface per-texel albedo rebake into per-face near/far shared atlas; two-texel edge gutters; JPEG95; no invented PBR'})
 del im
(out/'texture-receipts.json').write_text(json.dumps(receipts,indent=2),encoding='utf8')
`;
const baked = spawnSync(options.python ?? 'D:/software/python310/python.exe', ['-c', python, scratch, temporary, output], { encoding: 'utf8' });
if (baked.status !== 0) throw new Error(baked.stderr);
fs.writeFileSync(path.join(project, 'src/world/ShallowScannedReefData.js'), `// Generated by scripts/rebake-shallow-scanned-reef.mjs; MIT source scan derivatives.\nexport const SHALLOW_SCANNED_REEF_DATA = ${JSON.stringify(records)};\n`);
provenance.version = 2; provenance.geometry = geometryReceipts; provenance.textures = JSON.parse(fs.readFileSync(path.join(output, 'texture-receipts.json'), 'utf8')); provenance.textureReprojection = bakeReceipts;
provenance.tool.geometryFixedFrom = 'initial-permissive; original near3796/3800 and far899 geometry frozen, no further geometry parameter tuning';
provenance.tool.uvReplacement = 'MeshBVH0.9.15 original surface nearest point / barycentric original UV to independent per-LOD-face atlas';
provenance.changes.push('Fixed first-pass POS/computedNORMAL triangles retained exactly; face vertices duplicated only to assign independent atlas UV', 'Original 8k real baseColor rebaked directly, not source-normal/PBR/color synthesis');
provenance.limits.push('Nearest-surface albedo reprojection may choose adjacent surfaces where the fixed simplified mesh bridges fine branches or gaps; low per-face texel resolution loses detail', 'Independent atlas chart gutters reduce bilinear bleed; no measured physical reflectance or texture visual acceptance implied by budgets');
fs.writeFileSync(path.join(output, 'provenance.json'), JSON.stringify(provenance, null, 2));
console.log(JSON.stringify({ geometry: geometryReceipts.map(g => ({ key: g.key, detail: g.detail, vertices: g.vertices, triangles: g.triangles })), bake: bakeReceipts }));
