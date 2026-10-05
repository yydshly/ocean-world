import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setImmediate as immediate } from 'node:timers/promises';
import * as THREE from 'three';
import { createReefScanResourceOwner, inspectReefSkeletonSource, REEF_SKELETON_VARIANTS, loadReefSkeletonScan as loadScan, normalizeReefSkeletonGroup } from '../src/world/reefScanAssets.js';

// Historical 20k cancellation fixtures retain their original two-image contract.
const loadReefSkeletonScan = options => loadScan({ ...options, detail: 'thumbnail' });

const asset = name => readFileSync(new URL('../public/assets/reef-scan/' + name, import.meta.url));
const fixture = asset('usnm_229-20k-thumb.glb');
const fixtureJson = JSON.parse(fixture.subarray(20, 20 + fixture.readUInt32LE(12)).toString('utf8'));

function temporaryGlobal(t, name, value) {
  const old = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => { if (old) Object.defineProperty(globalThis, name, old); else delete globalThis[name]; });
}

function jpegSize(bytes) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset < bytes.length) {
    assert.equal(bytes[offset++], 0xff);
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    const length = bytes.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= bytes.length);
    if (sof.has(marker)) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    offset += length;
  }
  throw new Error('No JPEG dimensions in fixture');
}

// Uses the real GLTFParser on the real source GLB, with mocked image decoding
// and worker messages. It deliberately does not perform actual Draco/JPEG decode.
function mockedParserEnvironment(t, { delayedImages = false, failedLibrary = false, decodeError = false, detail = 'thumbnail' } = {}) {
  const nativeFetch = globalThis.fetch, workers = [], images = [], createdURLs = [], revokedURLs = [], librarySignals = [];
  const createURL = URL.createObjectURL.bind(URL), revokeURL = URL.revokeObjectURL.bind(URL);
  let decodeStarted, librariesAborted = 0;
  const decodeReady = new Promise(resolve => { decodeStarted = resolve; });
  temporaryGlobal(t, 'window', { location: { href: 'http://localhost:4173/' } });
  temporaryGlobal(t, 'self', globalThis);
  temporaryGlobal(t, 'createImageBitmap', () => new Promise(resolve => {
    const image = { width: REEF_SKELETON_VARIANTS[detail].textureSize, height: REEF_SKELETON_VARIANTS[detail].textureSize, closed: 0, close() { this.closed++; } };
    images.push({ image, resolve: () => resolve(image) });
    if (!delayedImages) resolve(image);
  }));
  temporaryGlobal(t, 'Worker', class extends EventTarget {
    constructor(url) { super(); this.url = url; this.terminated = 0; workers.push(this); }
    postMessage(message) {
      if (message.type === 'decode') {
        decodeStarted();
        if (decodeError) queueMicrotask(() => this.onmessage({ data: { type: 'error', id: message.id, error: 'mock Draco decode error' } }));
      }
    }
    terminate() { this.terminated++; }
  });
  t.mock.method(URL, 'createObjectURL', blob => { const url = createURL(blob); createdURLs.push(url); return url; });
  t.mock.method(URL, 'revokeObjectURL', url => { revokedURLs.push(url); revokeURL(url); });
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', (url, options = {}) => {
    if (String(url).startsWith('blob:')) return nativeFetch(url, options);
    const name = new URL(url).pathname.split('/').at(-1);
    if (['draco_wasm_wrapper.js', 'draco_decoder.wasm'].includes(name)) librarySignals.push(options.signal);
    if (failedLibrary && name === 'draco_wasm_wrapper.js') return Promise.resolve(new Response('missing', { status: 404 }));
    if (failedLibrary && name === 'draco_decoder.wasm') return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => { librariesAborted++; reject(options.signal.reason); }, { once: true });
    });
    return Promise.resolve(new Response(asset(name)));
  });
  return { workers, images, decodeReady, createdURLs, revokedURLs, librarySignals, get librariesAborted() { return librariesAborted; } };
}

test('the original GLB hash, embedded JPEG headers, and Draco structure match the receipt', () => {
  assert.equal(fixture.length, 323096);
  assert.equal(createHash('sha256').update(fixture).digest('hex'), 'c3ce125d357952ff1caa68efb920fcd4876d29459517d83b2de2a3aa211f8060');
  assert.deepEqual(fixtureJson.nodes, [{ mesh: 0 }]);
  assert.deepEqual(fixtureJson.extensionsRequired, ['KHR_draco_mesh_compression']);
  assert.equal(fixtureJson.accessors[3].count / 3, 20000);
  assert.ok(fixtureJson.accessors[0].min[2] < -85000);
  const binaryStart = 20 + fixture.readUInt32LE(12) + 8;
  assert.equal(fixture.readUInt32LE(binaryStart - 4), 0x004e4942);
  assert.equal(fixtureJson.images.length, 2);
  for (const image of fixtureJson.images) {
    assert.equal(image.mimeType, 'image/jpeg'); assert.equal(image.uri, undefined);
    const view = fixtureJson.bufferViews[image.bufferView];
    assert.ok(binaryStart + view.byteOffset + view.byteLength <= fixture.length);
    assert.deepEqual(jpegSize(fixture.subarray(binaryStart + view.byteOffset, binaryStart + view.byteOffset + view.byteLength)), { width: 512, height: 512 });
  }
});

test('each permitted derivative has its own exact source identity, geometry declaration and JPEG sizes', () => {
  for (const [detail, variant] of Object.entries(REEF_SKELETON_VARIANTS)) {
    const bytes = asset(variant.file), data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), variant.sha256);
    const json = inspectReefSkeletonSource(data, detail), start = 20 + bytes.readUInt32LE(12) + 8;
    assert.equal(json.images.length, variant.imageCount);
    for (const image of json.images) {
      const view = json.bufferViews[image.bufferView], offset = start + (view.byteOffset || 0);
      assert.ok(offset + view.byteLength <= bytes.length);
      assert.deepEqual(jpegSize(bytes.subarray(offset, offset + view.byteLength)), { width: variant.textureSize, height: variant.textureSize });
    }
    const other = detail === 'thumbnail' ? 'low' : 'thumbnail';
    assert.throws(() => inspectReefSkeletonSource(data, other), /格式或字节数/);
  }
  assert.throws(() => inspectReefSkeletonSource(new ArrayBuffer(0)), /数据不完整/);
  assert.throws(() => inspectReefSkeletonSource(new ArrayBuffer(20), 'unknown'), /未知/);
});

function triangle() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -85400, 100, 0, -85400, 0, 100, -85300], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

const model = { units: 'mm', translation: [123, 85400, 411], rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('manifest rotation precedes mm translation and both convert to metres', () => {
  const group = new THREE.Group(), geometry = triangle(), material = new THREE.MeshStandardMaterial();
  group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  const result = normalizeReefSkeletonGroup(group, model);
  result.transformedBoundsM.min.forEach((value, i) => close(value, [.123, 0, .311][i]));
  result.transformedBoundsM.max.forEach((value, i) => close(value, [.223, .1, .411][i]));
  result.localBoundsM.min.forEach((value, i) => close(value, [-.05, 0, -.05][i]));
  result.localBoundsM.max.forEach((value, i) => close(value, [.05, .1, .05][i]));
  close(geometry.getAttribute('normal').getY(0), 1);
  assert.deepEqual(group.scale.toArray(), [1, 1, 1]);
  assert.equal(result.physicalScaleMultiplier, 1);
  geometry.dispose(); material.dispose();
});

test('invalid units, nonfinite vertices, and unexpected node placement reject', () => {
  const group = new THREE.Group(), geometry = triangle(), material = new THREE.MeshStandardMaterial();
  group.add(new THREE.Mesh(geometry, material));
  assert.throws(() => normalizeReefSkeletonGroup(group, { ...model, units: 'm' }), /单位/);
  geometry.getAttribute('position').setX(0, NaN);
  assert.throws(() => normalizeReefSkeletonGroup(group, model), /非有限/);
  geometry.getAttribute('position').setX(0, 0);
  group.position.setX(1);
  assert.throws(() => normalizeReefSkeletonGroup(group, model), /节点变换/);
  geometry.dispose(); material.dispose();
});

test('one owner releases shared resources and bitmap-backed clones exactly once', () => {
  const counts = { geometry: 0, material: 0, texture: 0, bitmap: 0, decoder: 0 };
  const bitmap = { width: 512, height: 512, close: () => counts.bitmap++ };
  const geometry = triangle(), texture = new THREE.Texture(bitmap), clone = texture.clone();
  const materials = [new THREE.MeshStandardMaterial({ map: texture }), new THREE.MeshStandardMaterial({ map: clone })];
  geometry.addEventListener('dispose', () => counts.geometry++);
  for (const item of materials) item.addEventListener('dispose', () => counts.material++);
  for (const item of [texture, clone]) item.addEventListener('dispose', () => counts.texture++);
  const parent = new THREE.Group(), group = new THREE.Group();
  group.add(...materials.map(material => new THREE.Mesh(geometry, material))); parent.add(group);
  const owner = createReefScanResourceOwner(); owner.collect(group); owner.collect(group);
  owner.setDecoder({ dispose: () => counts.decoder++ });
  owner.releaseDecoder();
  owner.dispose(group); owner.dispose(group);
  assert.deepEqual(counts, { geometry: 1, material: 2, texture: 2, bitmap: 1, decoder: 1 });
  assert.equal(parent.children.length, 0);
  assert.equal(group.children.length, 0);
  assert.equal(owner.cleanupErrors.length, 0);
});

test('cleanup continues after one disposer throws', () => {
  const group = new THREE.Group(), geometry = triangle(), material = new THREE.MeshStandardMaterial();
  let geometryDisposed = 0;
  geometry.addEventListener('dispose', () => geometryDisposed++);
  material.addEventListener('dispose', () => { throw new Error('synthetic disposal failure'); });
  group.add(new THREE.Mesh(geometry, material));
  const owner = createReefScanResourceOwner(); owner.collect(group);
  assert.deepEqual(owner.dispose(group), ['synthetic disposal failure']);
  assert.equal(geometryDisposed, 1);
  owner.dispose(group);
  assert.equal(geometryDisposed, 1);
});

test('cleanup barrier waits for sibling work created after an earlier rejection', async () => {
  const owner = createReefScanResourceOwner();
  let finish;
  const first = owner.track(Promise.resolve().then(() => {
    owner.track(new Promise(resolve => { finish = resolve; }));
    throw new Error('synthetic parse failure');
  }));
  first.catch(() => {});
  let settled = false;
  const barrier = owner.settle().then(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false);
  finish(); await barrier;
  assert.equal(settled, true);
  owner.dispose();
});

test('already aborted preparation rejects before browser or network access', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadReefSkeletonScan({ signal: controller.signal }), { name: 'AbortError' });
});

test('closed owner disposes late resources and closes their shared bitmap once', () => {
  const owner = createReefScanResourceOwner(); owner.dispose();
  let geometryDisposed = 0, materialDisposed = 0, textureDisposed = 0, imageClosed = 0;
  const bitmap = { close: () => imageClosed++ }, geometry = triangle(), texture = new THREE.Texture(bitmap);
  const material = new THREE.MeshStandardMaterial({ map: texture });
  geometry.addEventListener('dispose', () => geometryDisposed++);
  material.addEventListener('dispose', () => materialDisposed++);
  texture.addEventListener('dispose', () => textureDisposed++);
  const group = new THREE.Group(); group.add(new THREE.Mesh(geometry, material));
  owner.collect(group); owner.collect(group); owner.ownBitmap(bitmap); owner.dispose(group);
  assert.deepEqual([geometryDisposed, materialDisposed, textureDisposed, imageClosed], [1, 1, 1, 1]);
  assert.equal(owner.geometries.size + owner.materials.size + owner.textures.size + owner.bitmaps.size, 0);
});

test('cancel during real-parser mock decode rejects immediately, terminates worker, and closes late images', { timeout: 5000 }, async t => {
  const environment = mockedParserEnvironment(t, { delayedImages: true });
  const controller = new AbortController();
  const loading = loadReefSkeletonScan({ signal: controller.signal });
  loading.catch(() => {});
  await environment.decodeReady;
  while (environment.images.length < 2) await immediate();
  controller.abort();
  await assert.rejects(loading, { name: 'AbortError' });
  assert.equal(environment.workers.length, 1);
  assert.equal(environment.workers[0].terminated, 1);
  for (const image of environment.images) image.resolve();
  await immediate(); await immediate();
  assert.deepEqual(environment.images.map(value => value.image.closed), [1, 1]);
  assert.equal(Object.keys(environment.workers[0]._callbacks).length, 0);
  assert.equal(Object.keys(environment.workers[0]._taskCosts).length, 0);
  for (const url of environment.createdURLs) assert.ok(environment.revokedURLs.includes(url));
});

test('150k preparation cancels its worker and owns all three late baseColor/AO/normal images', { timeout: 5000 }, async t => {
  const environment = mockedParserEnvironment(t, { delayedImages: true, detail: 'low' });
  const controller = new AbortController();
  const loading = loadScan({ signal: controller.signal });
  loading.catch(() => {});
  await environment.decodeReady;
  while (environment.images.length < 3) await immediate();
  controller.abort();
  await assert.rejects(loading, { name: 'AbortError' });
  assert.equal(environment.workers[0].terminated, 1);
  for (const image of environment.images) image.resolve();
  await immediate(); await immediate();
  assert.deepEqual(environment.images.map(value => value.image.closed), [1, 1, 1]);
  for (const url of environment.createdURLs) assert.ok(environment.revokedURLs.includes(url));
});

test('silent mock worker reaches the 30s watchdog and all owned resources release', { timeout: 5000 }, async t => {
  const environment = mockedParserEnvironment(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const loading = loadReefSkeletonScan(); loading.catch(() => {});
  await environment.decodeReady;
  while (environment.images.length < 2) await immediate();
  t.mock.timers.tick(30000);
  await assert.rejects(loading, { name: 'TimeoutError' });
  await immediate();
  assert.equal(environment.workers[0].terminated, 1);
  assert.deepEqual(environment.images.map(value => value.image.closed), [1, 1]);
  for (const url of environment.createdURLs) assert.ok(environment.revokedURLs.includes(url));
});

test('failed decoder library aborts its hanging sibling without waiting for the watchdog', { timeout: 5000 }, async t => {
  const environment = mockedParserEnvironment(t, { failedLibrary: true });
  await assert.rejects(loadReefSkeletonScan(), /Draco.*HTTP 404/);
  await immediate();
  assert.equal(environment.librariesAborted, 1);
  assert.equal(environment.workers.length, 0);
});

test('cancelling one StrictMode-like load does not abort the next load sharing the same asset URLs', { timeout: 5000 }, async t => {
  const environment = mockedParserEnvironment(t);
  const first = new AbortController(), second = new AbortController();
  const firstLoad = loadReefSkeletonScan({ signal: first.signal }), secondLoad = loadReefSkeletonScan({ signal: second.signal });
  firstLoad.catch(() => {}); secondLoad.catch(() => {});
  let secondSettled = false;
  secondLoad.then(() => { secondSettled = true; }, () => { secondSettled = true; });
  while (environment.workers.length < 2) await immediate();
  first.abort();
  await assert.rejects(firstLoad, { name: 'AbortError' });
  await immediate();
  assert.equal(secondSettled, false);
  assert.deepEqual(environment.workers.map(worker => worker.terminated).sort(), [0, 1]);
  const signals = [...new Set(environment.librarySignals)];
  assert.equal(signals.length, 2);
  assert.equal(signals.filter(signal => signal.aborted).length, 1);
  second.abort();
  await assert.rejects(secondLoad, { name: 'AbortError' });
  await immediate();
  assert.deepEqual(environment.workers.map(worker => worker.terminated), [1, 1]);
});

test('a Draco error message becomes an Error with decoder details and releases its worker', { timeout: 5000 }, async t => {
  const environment = mockedParserEnvironment(t, { decodeError: true });
  await assert.rejects(loadReefSkeletonScan(), error => error instanceof Error && error.message === 'mock Draco decode error');
  await immediate();
  assert.equal(environment.workers[0].terminated, 1);
  assert.equal(Object.keys(environment.workers[0]._callbacks).length, 0);
});
