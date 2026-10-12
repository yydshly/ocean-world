// Native actual-mesh projections of the complete crown family. No browser,
// source screenshot, image editing or WebGL performance claim is involved.
import fs from 'node:fs';
import * as THREE from 'three';
import { shallowNaturalCoralGeometries } from '../src/world/ShallowNaturalAssets.js';
import { shallowLiveReefGeometries, shallowReefRubbleGeometry } from '../src/world/ShallowLiveReefAssets.js';

const output = process.argv[2] ?? 'output/validation/shallow-live-reef-assets';
fs.mkdirSync(output, { recursive: true });
const width = 1440, height = 810, camera = new THREE.PerspectiveCamera(39, width / height, .05, 50);
camera.position.set(-.35, 3.6, 12); camera.lookAt(0, .75, 0); camera.updateMatrixWorld(true);
const view = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
const sun = new THREE.Vector3(-.48, .82, -.31).normalize(), stats = [], frames = [];
for (const [time, family] of [[0, shallowNaturalCoralGeometries()], [1, shallowLiveReefGeometries()]]) {
  const rows = [], forms = ['branching', 'table', 'massive', 'fan'];
  for (let col = 0; col < forms.length; col++) {
    const form = forms[col], geometry = family[`${form}-0`], pos = geometry.attributes.position, colors = geometry.attributes.color, index = geometry.index;
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3((col - 1.5) * 2.8, 0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), form === 'fan' ? .12 : .35), new THREE.Vector3(2, form === 'fan' ? 1.95 : form === 'table' ? 1.25 : 1.55, 2));
    const positions = [], projected = [], normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(matrix), v = p.clone().applyMatrix4(view);
      positions.push(p); projected.push([(v.x + 1) * width / 2, (1 - v.y) * height / 2, v.z]);
    }
    for (let t = 0; t < index.count; t += 3) {
      const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)], vertices = ids.map(i => positions[i]), pixels = ids.map(i => projected[i]);
      if (pixels.some(p => p[2] < -1 || p[2] > 1)) continue;
      const normal = new THREE.Vector3().subVectors(vertices[1], vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2], vertices[0])).normalize(), center = vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1 / 3);
      if (normal.dot(camera.position.clone().sub(center)) < 0) normal.negate();
      const average = new THREE.Vector3();
      ids.forEach(i => average.add(new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, i)));
      average.applyMatrix3(normalMatrix).normalize(); if (average.dot(normal) < 0) average.negate();
      const color = new THREE.Color(0, 0, 0);
      ids.forEach(i => { color.r += colors.getX(i) / 3; color.g += colors.getY(i) / 3; color.b += colors.getZ(i) / 3; });
      color.multiplyScalar(.48 + .78 * Math.max(0, average.dot(sun)));
      rows.push(...pixels.flat(), color.r, color.g, color.b, center.distanceTo(camera.position), 1);
    }
    stats.push({ phase: time === 0 ? 'previous-family' : 'new-family', form, triangles: index.count / 3, ...geometry.userData });
  }
  const file = `${output}/frame-${time}.f32`;
  fs.writeFileSync(file, new Uint8Array(new Float32Array(rows).buffer));
  frames.push({ time, file, width, height, triangles: rows.length / 14, cameraMatrix: camera.matrixWorld.toArray() });
  Object.values(family).forEach(g => g.dispose());
}
const statsFamilies = [];
for (const detail of ['near', 'distant']) for (const [id, g] of Object.entries(shallowLiveReefGeometries(detail))) {
  statsFamilies.push({ id, detail, vertices: g.attributes.position.count, triangles: g.index.count / 3, rootRadius: g.userData.rootRadius, bounds: [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()] }); g.dispose();
}
const rubble = shallowReefRubbleGeometry();
fs.writeFileSync(`${output}/render.json`, JSON.stringify({ kind: 'offline-actual-growth-form-mesh-board-not-webgl', stride: 14, order: ['branching', 'table', 'massive', 'fan'], exactSameCamera: true, frames, stats }, null, 2));
fs.writeFileSync(`${output}/geometry-summary.json`, JSON.stringify({ sourceKind: 'project-authored-growth-form-approximations-not-scans', family: statsFamilies, rubble: { triangles: rubble.index.count / 3, vertices: rubble.attributes.position.count, bounds: [rubble.boundingBox.min.toArray(), rubble.boundingBox.max.toArray()], ...rubble.userData } }, null, 2));
rubble.dispose();
console.log(JSON.stringify({ output, frames: frames.map(f => f.triangles), family: statsFamilies.length }));
