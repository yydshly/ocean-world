import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { oceanRockMesh } from '../src/oceanRockShape.js';
import { livingShallowsAssetGeometries, livingShallowsMeadowGeometry } from '../src/world/livingShallowsAssets.js';
import { createLivingShallowsCoralMaterial } from '../src/world/livingShallowsCoralMaterial.js';

// Independently captured from the delivered v3 buffers before replacing the
// coral kit. Includes every typed attribute and actual triangle index.
const before = {
  'coral-branching': 'bfc48963efe3edfcd771dccbab11a4e1bc6f8668e20945e946bbdcf13b3ad899',
  'coral-table': '17d23c7b4b2b21c5e8d47cd6e71c26f1db75fd6255716296d9b974b992fbc030',
  'coral-fan': '35d98157c7b88bc64b41c1a660bd77416cdb47660b4070ec0257cc8e7d79538b',
  seagrass: '93560232e0a86d3802dc77852e6608521535f4f1491708389cd3a21d59811f0c',
  rubble: '86502cb8c6b123d92917174fb4461ab14d409d3e464d7f7384eeb1acd3d7bbb7',
  driftwood: '9587ff7dddc8eb4ecd1a161998f56c2bbd612f7c6b3dc7ed4c3316d12f815068',
  bottle: '4313f75b9a03bc2c6628f290df6021f0de9dd9a64bbeda59b888a16c41802e39',
};
function hash(geometry) {
  const h = createHash('sha256');
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    h.update(name); h.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  }
  if (geometry.index) h.update(Buffer.from(geometry.index.array.buffer, geometry.index.array.byteOffset, geometry.index.array.byteLength));
  return h.digest('hex');
}
function kitFor(t) {
  const kit = livingShallowsAssetGeometries();
  t.after(() => Object.values(kit).forEach(geometry => geometry.dispose()));
  return kit;
}

test('all three entire coral prototypes change within the existing combined triangle budget', t => {
  const kit = kitFor(t), forms = ['coral-branching', 'coral-table', 'coral-fan'];
  const triangles = forms.map(name => {
    const geometry = kit[name];
    assert.notEqual(hash(geometry), before[name], `${name}: actual triangles and tissue colour change`);
    assert.ok(geometry.index.count / 3 <= 2500);
    return geometry.index.count / 3;
  });
  assert.deepEqual(triangles, [2004, 2056, 1579]);
  assert.ok(triangles.reduce((a, b) => a + b) <= 2165 + 1817 + 1813,
    'a complete kit replacement does not expand the combined prototype budget');
  t.diagnostic(`v3 -> v4 triangles: branching 2165 -> ${triangles[0]}, table 1817 -> ${triangles[1]}, fan 1813 -> ${triangles[2]}; total 5795 -> 5639`);
});

test('meadow feeding buffers, rubble and discovery props retain their independent pre-change bytes', t => {
  const kit = kitFor(t), feeding = livingShallowsMeadowGeometry(); t.after(() => feeding.dispose());
  for (const name of ['seagrass', 'rubble', 'driftwood', 'bottle']) assert.equal(hash(kit[name]), before[name], name);
  assert.equal(hash(feeding), before.seagrass, 'the separately allocated feeding reference retains every blade root, tip and triangle');
});

test('one coral surface hooks the installed standard shader without displacement or extra textures', t => {
  const material = createLivingShallowsCoralMaterial(); t.after(() => material.dispose());
  assert.equal(material.vertexColors, true); assert.equal(material.metalness, 0);
  assert.equal(material.map, null); assert.equal(material.normalMap, null); assert.equal(material.roughnessMap, null);
  const original = THREE.ShaderLib.standard;
  assert.ok(original.vertexShader.includes('#include <begin_vertex>'));
  assert.ok(original.fragmentShader.includes('#include <color_fragment>'));
  assert.ok(original.fragmentShader.includes('#include <roughnessmap_fragment>'));
  const shader = { vertexShader: original.vertexShader, fragmentShader: original.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('vLivingColonyLocal = position;'));
  assert.ok(shader.fragmentShader.includes('diffuseColor.rgb *= vec3(colonyShade'));
  assert.ok(shader.fragmentShader.includes('roughnessFactor = clamp('));
  assert.deepEqual(shader.uniforms, {});
  assert.equal(shader.vertexShader.replace('varying vec3 vLivingColonyLocal;\n', '')
    .replace('\n vLivingColonyLocal = position;', ''), original.vertexShader,
  'actual vertex path is identical after removing the one appearance reference');
  assert.equal(material.customProgramCacheKey(), 'living-shallows-colony-surface-v4');
  t.diagnostic('CPU checks the installed Three shader hooks; it does not compile a GPU shader or establish browser visual acceptance.');
});

test('production shallow chunks share the new material and release the same bounded kit exactly once', () => {
  const borrowedTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const borrowedSand = new THREE.MeshStandardMaterial({ map: borrowedTexture });
  const ocean = new OceanChunks('living-shallows-v1|42', { sandMaterial: borrowedSand });
  const legacy = new OceanChunks('42');
  const counts = new Map(), borrowed = { texture: 0, material: 0 };
  borrowedTexture.addEventListener('dispose', () => borrowed.texture++);
  borrowedSand.addEventListener('dispose', () => borrowed.material++);
  const owned = [...Object.values(ocean._geometries), ...Object.values(ocean._materials),
    ocean._terrainMaterial, ...Object.values(ocean._textures)];
  for (const resource of owned) { counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)); }
  try {
    assert.equal(legacy._materials.coral.userData.colonySurface, undefined);
    assert.equal(legacy._materials.coral.vertexColors, false);
    ocean.update({ x: 2, z: 2 });
    assert.equal(ocean.stats.prototypeGeometries, 10); assert.equal(ocean.stats.prototypeMaterials, 7);
    assert.equal(ocean._materials.coral.userData.colonySurface.version, 4);
    let coralBatches = 0;
    for (const record of ocean._chunks.values()) for (const instance of record.instances) {
      if (instance.name.startsWith('generated-coral-')) { assert.equal(instance.material, ocean._materials.coral); coralBatches++; }
    }
    assert.ok(coralBatches > 0);
    for (const profile of ocean._rockProfiles) {
      const geometry = ocean._geometries[`rock-${profile}`], physical = oceanRockMesh(profile);
      assert.deepEqual(geometry.attributes.position.array, new Float32Array(physical.positions));
      assert.deepEqual(Array.from(geometry.index.array), physical.indices);
    }
    const sharedCoralMaterial = ocean._materials.coral;
    ocean.update({ x: 10000, z: 10000 });
    ocean.reset('living-shallows-v1|73');
    assert.equal(ocean._materials.coral, sharedCoralMaterial);
    assert.ok([...counts.values()].every(count => count === 0), 'unload and same-profile reset retain shared resources');
    ocean.dispose(); ocean.dispose();
    assert.ok([...counts.values()].every(count => count === 1));
    assert.deepEqual(borrowed, { texture: 0, material: 0 });
  } finally {
    ocean.dispose(); legacy.dispose(); borrowedSand.dispose(); borrowedTexture.dispose();
  }
});
