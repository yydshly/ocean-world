// Native asset-only verification and mapped triangle preview, not WebGL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { shallowScannedReefGeometries, shallowScannedReefMaterial } from '../src/world/ShallowScannedReefAssets.js';
const output = process.argv[2] ?? 'D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-sourced-assets/scout-reef/derivative-preview';
fs.mkdirSync(output, { recursive: true });
const provenance = JSON.parse(fs.readFileSync('public/assets/shallow-scanned-reef/provenance.json', 'utf8'));
const width = 800, height = 660, camera = new THREE.PerspectiveCamera(33, width / height, .01, 20);
camera.position.set(.84, .88, 1.65); camera.lookAt(0, .21, 0); camera.updateMatrixWorld(true);
const view = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
const sun = new THREE.Vector3(-.4, .8, .3).normalize();
const facts = [], frames = [], baseColorTextures = [];
let time = 0;
for (const distant of [false, true]) {
  const family = shallowScannedReefGeometries(distant);
  for (const [key, geometry] of Object.entries(family)) {
    const detail = distant ? 'distant' : 'near', receipt = provenance.geometry.find(g => g.key === key && g.detail === detail);
    const source = fs.readFileSync(`public/assets/shallow-scanned-reef/${receipt.file}`);
    assert.equal(createHash('sha256').update(source).digest('hex'), receipt.sha256);
    assert.equal(source.length, receipt.byteLength);
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv'), index = geometry.index;
    assert.equal(p.count, receipt.vertices); assert.equal(index.count / 3, receipt.triangles);
    assert.equal(n.count, p.count); assert.equal(uv.count, p.count);
    for (const a of [p.array, n.array, uv.array]) assert.ok(a.every(Number.isFinite));
    assert.ok(index.array.every(i => i < p.count));
    assert.ok(index.count / 3 <= (distant ? 1000 : 4000));
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(Math.abs(Math.max(size.x, size.z) - 1) < 1e-6); assert.ok(Math.abs(geometry.boundingBox.min.y) < 1e-7);
    assert.ok(Math.abs(size.y - receipt.height) < 1e-7);
    const material = shallowScannedReefMaterial(key);
    assert.equal(material.vertexColors, false); assert.equal(material.map, null);
    assert.equal(material.userData.nativeBaseColorFlipY, false);
    assert.ok(fs.existsSync(material.userData.nativeBaseColorFile));
    const textureReceipt = provenance.textures.find(t => t.key === key), textureSource = fs.readFileSync(material.userData.nativeBaseColorFile);
    assert.equal(createHash('sha256').update(textureSource).digest('hex'), textureReceipt.sha256);
    // Each frame's real material has a stable table index, even when the same
    // source image is reused for near/far. No vertex tint is substituted.
    const textureKind = baseColorTextures.length + 3;
    baseColorTextures.push({ kind: textureKind, file: material.userData.nativeBaseColorFile, flipY: false, wrapS: 'repeat', wrapT: 'repeat', alphaTest: 0, transparent: false, depthWrite: true });
    const points = [], projected = [], projectedW = [];
    for (let i = 0; i < p.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(p, i), clip = point.clone().applyMatrix4(view), e = view.elements;
      points.push(point); projected.push([(clip.x + 1) * width / 2, (1 - clip.y) * height / 2, clip.z]);
      projectedW.push(1 / (e[3] * point.x + e[7] * point.y + e[11] * point.z + e[15]));
    }
    const rows = [];
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)], pixels = ids.map(id => projected[id]);
      if (pixels.some(p => p[2] < -1 || p[2] > 1)) continue;
      const area = (pixels[1][0] - pixels[0][0]) * (pixels[2][1] - pixels[0][1]) - (pixels[1][1] - pixels[0][1]) * (pixels[2][0] - pixels[0][0]);
      if (area >= 0 || Math.abs(area) < .01) continue;
      const averageNormal = new THREE.Vector3(); ids.forEach(id => averageNormal.add(new THREE.Vector3().fromBufferAttribute(n, id))); averageNormal.normalize();
      const light = .65 + .35 * Math.max(0, averageNormal.dot(sun));
      const center = points[ids[0]].clone().add(points[ids[1]]).add(points[ids[2]]).multiplyScalar(1 / 3);
      rows.push(...pixels.flat(), material.color.r * light, material.color.g * light, material.color.b * light, center.distanceTo(camera.position), 1,
        ...ids.map(id => projectedW[id]), ...ids.flatMap(id => points[id].toArray()), ...ids.flatMap(id => [uv.getX(id), uv.getY(id)]), textureKind, 1, 0, 0, 0);
    }
    assert.ok(rows.length > 37 * 100, 'Asset must contribute visible front-facing actual triangles');
    const file = path.join(output, `frame-${time}.f32`); fs.writeFileSync(file, new Uint8Array(new Float32Array(rows).buffer));
    frames.push({ time, key, detail, file, width, height, triangles: rows.length / 37, cameraMatrix: camera.matrixWorld.toArray() });
    facts.push({ key, detail, vertices: p.count, triangles: index.count / 3, bounds: [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()], ...geometry.userData, textureSha256: textureReceipt.sha256 });
    time++; geometry.dispose(); material.dispose();
  }
}
fs.writeFileSync(path.join(output, 'render.json'), JSON.stringify({ kind: 'native-asset-only-perspective-albedo-projection-not-webgl', sourceOrientation: 'original glTF identity-node +Y retained; no rotation applied', stride: 37, baseColorTextures, frames }, null, 2));
fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ passed: true, checks: 'all four derivative binary SHA/length; indices; finite POS/computedNORMAL/UV; budgets; source-proportion normalized bounds; matching same-source texture SHA; native material UV/flipY; actual front-facing projected triangles', facts, limits: 'No source-survey-scale, cleaned basal contour, scene root fit, biome, browser WebGL or FPS validation.' }, null, 2));
console.log(JSON.stringify({ passed: true, output, frames: frames.map(f => ({ key: f.key, detail: f.detail, triangles: f.triangles })), facts: facts.map(f => ({ key: f.key, detail: f.detail, height: f.height, radius: f.radius, rootRadius: f.rootRadius })) }));
