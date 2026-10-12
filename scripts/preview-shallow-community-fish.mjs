// Native projections of the actual three shared fish kits. This is an asset
// inspection board in normalized units, not a browser image or a scene census.
import fs from 'node:fs';
import * as THREE from 'three';
import { ShallowCommunityFishAssets, SHALLOW_COMMUNITY_FISH_IDS, SHALLOW_COMMUNITY_MOTION_PADDING } from '../src/world/ShallowCommunityFishAssets.js';

const output = process.argv[2] ?? 'output/validation/shallow-community-fish-assets';
fs.mkdirSync(output, { recursive: true });
const width = 1440, height = 810, camera = new THREE.PerspectiveCamera(39, width / height, .05, 30);
camera.position.set(0, 1.25, 7.3); camera.lookAt(0, .10, 0); camera.updateMatrixWorld(true);
const view = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), sun = new THREE.Vector3(.27, .83, .52).normalize(), rows = [], stats = [];
const kit = new ShallowCommunityFishAssets();
for (let row = 0; row < 2; row++) for (let col = 0; col < SHALLOW_COMMUNITY_FISH_IDS.length; col++) {
  const id = SHALLOW_COMMUNITY_FISH_IDS[col], { root } = kit.create(id);
  root.position.set((col - 1) * 1.85, row === 0 ? .91 : -.62, 0);
  root.rotation.set(row === 0 ? 0 : -.63, row === 0 ? -.22 : -.28, 0); root.updateMatrixWorld(true);
  let total = 0;
  root.traverse(m => {
    if (!m.isMesh) return;
    const g = m.geometry, p = g.attributes.position, c = g.attributes.color, normal = g.attributes.normal, idx = g.index;
    const points = [], projected = [], nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    total += idx.count / 3;
    for (let i = 0; i < p.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld), pixel = point.clone().applyMatrix4(view);
      points.push(point); projected.push([(pixel.x + 1) * width / 2, (1 - pixel.y) * height / 2, pixel.z]);
    }
    for (let t = 0; t < idx.count; t += 3) {
      const ids = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)], vertices = ids.map(i => points[i]), pixels = ids.map(i => projected[i]);
      if (pixels.some(p => p[2] < -1 || p[2] > 1)) continue;
      const face = new THREE.Vector3().subVectors(vertices[1], vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2], vertices[0])), center = vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1 / 3);
      if (face.dot(camera.position.clone().sub(center)) < 0 && m.material.side !== THREE.DoubleSide) continue;
      const n = new THREE.Vector3(), color = new THREE.Color(0, 0, 0);
      ids.forEach(i => { n.add(new THREE.Vector3().fromBufferAttribute(normal, i)); color.r += c.getX(i) / 3; color.g += c.getY(i) / 3; color.b += c.getZ(i) / 3; }); n.applyMatrix3(nm).normalize();
      if (m.material.side === THREE.DoubleSide && n.dot(camera.position.clone().sub(center)) < 0) n.negate();
      color.multiplyScalar(.54 + .79 * Math.max(0, n.dot(sun)));
      rows.push(...pixels.flat(), color.r, color.g, color.b, center.distanceTo(camera.position), 1);
    }
  });
  stats.push({ id, row, completeTriangles: total, motionPaddingUnitM: SHALLOW_COMMUNITY_MOTION_PADDING[id] });
}
const file = `${output}/frame-0.f32`;
fs.writeFileSync(file, new Uint8Array(new Float32Array(rows).buffer));
fs.writeFileSync(`${output}/render.json`, JSON.stringify({ kind: 'offline-actual-whole-fish-mesh-board-not-webgl', stride: 14, order: SHALLOW_COMMUNITY_FISH_IDS, sizeUnits: 'equal normalized unit length for asset inspection, not actual catalogue sizes', rows: ['side profile', 'slightly elevated view'], frames: [{ time: 0, file, width, height, triangles: rows.length / 14, cameraMatrix: camera.matrixWorld.toArray() }], stats }, null, 2));
kit.dispose(); console.log(JSON.stringify({ output, projectedTriangles: rows.length / 14, stats }));
