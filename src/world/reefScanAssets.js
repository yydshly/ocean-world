import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const REEF_SKELETON_VARIANTS = Object.freeze({
  thumbnail: Object.freeze({ file: 'usnm_229-20k-thumb.glb', bytes: 323096, triangles: 20000, vertices: 23488, imageCount: 2, textureSize: 512, sha256: 'c3ce125d357952ff1caa68efb920fcd4876d29459517d83b2de2a3aa211f8060' }),
  low: Object.freeze({ file: 'usnm_229-150k-1024-low.glb', bytes: 1729252, triangles: 150000, vertices: 120929, imageCount: 3, textureSize: 1024, sha256: '11a2bedd6925eae830831e191eb4a13668eb93e6ba9c44270534f574ec89f12b' }),
  medium: Object.freeze({ file: 'usnm_229-150k-2048-medium.glb', bytes: 4244612, triangles: 150000, vertices: 120929, imageCount: 3, textureSize: 2048, sha256: '20563502ece6c714c6a8853fa7add4d8dc4e3897d77f27aff1c93fda3c78a114' }),
});
const MANIFEST_SHA256 = 'a6332dc422504fc2793124b159301a5aa33a82096d0a591dcfd7fa1d704c8418';
const SOURCE_URL = 'https://3d-api.si.edu/content/document/3d_package:ad22ed7a-d030-4162-8880-e9cd65232514/';
const RECORD_URL = 'https://www.si.edu/object/madrepora-cytherea%3Anmnhinvertebratezoology_13935';

function check(condition, message) {
  if (!condition) throw new Error(`USNM 229 扫描：${message}`);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('扫描加载已取消', 'AbortError');
}

function finiteArray(values, count, label) {
  check(Array.isArray(values) && values.length === count && values.every(Number.isFinite), `${label} 无效`);
}

function validateGeometry(geometry) {
  const position = geometry.getAttribute('position');
  check(position?.itemSize === 3 && position.count > 0, '缺少顶点');
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    check(attribute.count === position.count, `${name} 顶点数不一致`);
    for (let i = 0; i < attribute.count; i++) {
      for (let component = 0; component < attribute.itemSize; component++) {
        check(Number.isFinite(attribute.getComponent(i, component)), `${name} 包含非有限数值`);
      }
    }
  }
  check(geometry.getAttribute('normal')?.itemSize === 3, '缺少法线');
  check(geometry.getAttribute('uv')?.itemSize === 2, '缺少 UV');
  const index = geometry.getIndex();
  check(index && index.count > 0 && index.count % 3 === 0, '缺少三角索引');
  for (let i = 0; i < index.count; i++) {
    const value = index.getX(i);
    check(Number.isInteger(value) && value >= 0 && value < position.count, '三角索引越界');
  }
}

function boundsRecord(box) {
  check(!box.isEmpty(), '包围盒为空');
  const min = box.min.toArray(), max = box.max.toArray(), size = box.getSize(new THREE.Vector3()).toArray();
  check([...min, ...max, ...size].every(Number.isFinite), '包围盒包含非有限数值');
  return { min, max, size };
}

/** Bake the external Voyager transform once, retaining physical size in metres. */
export function normalizeReefSkeletonGroup(group, model) {
  check(model?.units === 'mm', 'manifest 单位必须为 mm');
  finiteArray(model.translation, 3, 'manifest translation');
  finiteArray(model.rotation, 4, 'manifest quaternion');
  const quaternion = new THREE.Quaternion().fromArray(model.rotation);
  check(quaternion.lengthSq() > 0, 'quaternion 长度为零');
  quaternion.normalize();
  const transform = new THREE.Matrix4().makeScale(.001, .001, .001).multiply(
    new THREE.Matrix4().compose(new THREE.Vector3().fromArray(model.translation), quaternion, new THREE.Vector3(1, 1, 1)),
  );
  const geometries = new Set();
  group.updateMatrixWorld(true);
  group.traverse(object => {
    if (!object.isMesh) return;
    // The original file has one mesh node with no transform. Reject extra placement
    // instead of silently applying the external manifest twice or baking instances twice.
    check(object.matrixWorld.equals(new THREE.Matrix4()), '原始 GLB 含意外的节点变换');
    if (geometries.has(object.geometry)) return;
    validateGeometry(object.geometry);
    geometries.add(object.geometry);
    object.geometry.applyMatrix4(transform);
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
  });
  check(geometries.size > 0, '没有解析出网格');
  const transformedBounds = new THREE.Box3();
  for (const geometry of geometries) transformedBounds.union(geometry.boundingBox);
  const transformed = boundsRecord(transformedBounds);
  const center = transformedBounds.getCenter(new THREE.Vector3());
  const recenter = new THREE.Vector3(-center.x, -transformedBounds.min.y, -center.z);
  for (const geometry of geometries) {
    geometry.translate(recenter.x, recenter.y, recenter.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    validateGeometry(geometry);
  }
  const localBounds = new THREE.Box3();
  for (const geometry of geometries) localBounds.union(geometry.boundingBox);
  return {
    sourceUnits: 'mm', worldUnits: 'm', millimetresToMetres: .001,
    translationMm: [...model.translation], quaternionXyzw: [...model.rotation],
    appliedQuaternionXyzw: quaternion.toArray(),
    matrixOrder: 'S(0.001) * T(manifest-mm) * R(manifest-quaternion)',
    matrixColumnMajor: transform.toArray(),
    recenterTranslationM: recenter.toArray(), transformedBoundsM: transformed,
    localBoundsM: boundsRecord(localBounds), physicalScaleMultiplier: 1,
  };
}

/** One owner per load; Set identity also covers shared meshes and bitmap-backed clones. */
export function createReefScanResourceOwner() {
  const geometries = new Set(), materials = new Set(), textures = new Set(), bitmaps = new Set();
  const pending = new Set(), objectURLs = new Set(), cleanupErrors = [];
  const released = new WeakSet(), closedBitmaps = new WeakSet();
  let disposed = false, decoderDisposed = false, decoder = null;
  const release = action => { try { action(); } catch (error) { cleanupErrors.push(error.message); } };
  const disposeResource = resource => {
    if (!resource || released.has(resource)) return;
    released.add(resource);
    release(() => resource.dispose());
  };
  const closeBitmap = bitmap => {
    if (!bitmap || closedBitmaps.has(bitmap)) return;
    closedBitmaps.add(bitmap);
    release(() => bitmap.close());
  };
  const ownBitmap = bitmap => {
    if (typeof bitmap?.close !== 'function') return;
    if (disposed) closeBitmap(bitmap); else bitmaps.add(bitmap);
  };
  const ownGeometry = geometry => {
    if (disposed) disposeResource(geometry); else geometries.add(geometry);
    return geometry;
  };
  const ownTexture = texture => {
    if (!texture?.isTexture) return texture;
    const image = texture.source?.data ?? texture.image;
    for (const item of Array.isArray(image) ? image : [image]) ownBitmap(item);
    if (disposed) disposeResource(texture); else textures.add(texture);
    return texture;
  };
  const ownMaterial = material => {
    if (!material) return material;
    for (const value of Object.values(material)) if (value?.isTexture) ownTexture(value);
    if (disposed) disposeResource(material); else materials.add(material);
    return material;
  };
  const collect = root => root?.traverse(object => {
    if (object.geometry) ownGeometry(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) ownMaterial(material);
  });
  const track = promise => {
    const task = Promise.resolve(promise);
    if (!disposed) pending.add(task);
    // The parent parse may fail before siblings finish. Keep every rejection handled
    // while retaining the original task for the all-settled cleanup barrier.
    task.catch(() => {});
    return task;
  };
  const settle = async () => {
    let count = -1;
    while (count !== pending.size) { count = pending.size; await Promise.allSettled([...pending]); }
  };
  const revoke = url => {
    if (objectURLs.delete(url)) release(() => URL.revokeObjectURL(url));
  };
  const ownObjectURL = url => {
    objectURLs.add(url);
    if (disposed) revoke(url);
  };
  const releaseDecoder = () => {
    if (decoderDisposed || !decoder) return;
    decoderDisposed = true;
    release(() => decoder.dispose());
  };
  const dispose = root => {
    if (disposed) return cleanupErrors;
    disposed = true;
    release(() => root?.removeFromParent());
    for (const material of materials) disposeResource(material);
    for (const texture of textures) disposeResource(texture);
    for (const geometry of geometries) disposeResource(geometry);
    for (const bitmap of bitmaps) closeBitmap(bitmap);
    for (const url of [...objectURLs]) revoke(url);
    releaseDecoder();
    release(() => root?.clear());
    geometries.clear(); materials.clear(); textures.clear(); bitmaps.clear(); pending.clear();
    return cleanupErrors;
  };
  return { geometries, materials, textures, bitmaps, objectURLs, cleanupErrors, ownBitmap, ownGeometry, ownTexture, ownMaterial, ownObjectURL, collect, track, settle, revoke, releaseDecoder, dispose, get disposed() { return disposed; }, setDecoder: value => { decoder = value; } };
}

class OwnedDracoLoader extends DRACOLoader {
  constructor(owner, manager, signal, guard) { super(manager); this.owner = owner; this.signal = signal; this.guard = guard; this.closed = false; }
  preload() {
    this.owner.track(this._initDecoder());
    return this;
  }
  _loadLibrary(url, responseType) {
    // FileLoader coalesces by URL across instances. Dedicated fetches avoid one
    // StrictMode instance aborting the next instance's decoder download.
    const work = fetch(url, { signal: this.signal, credentials: 'omit' }).then(response => {
      check(response.ok, `本地 Draco ${url}（HTTP ${response.status}）`);
      return responseType === 'arraybuffer' ? response.arrayBuffer() : response.text();
    });
    return this.guard(this.owner.track(work));
  }
  _initDecoder() {
    if (this.closed) return Promise.reject(this.closeReason);
    if (!this.ownedInit) {
      const initialized = super._initDecoder().then(() => {
        if (this.closed) {
          if (this.workerSourceURL) URL.revokeObjectURL(this.workerSourceURL);
          this.workerSourceURL = '';
          throw this.closeReason;
        }
      });
      this.ownedInit = this.guard(this.owner.track(initialized));
    }
    return this.ownedInit;
  }
  decodeGeometry(buffer, config) {
    if (this.closed) return Promise.reject(this.closeReason);
    return this.guard(this.owner.track(super.decodeGeometry(buffer, config).then(geometry => {
      this.owner.ownGeometry(geometry);
      return geometry;
    })));
  }
  _getWorker(taskID, taskCost) {
    if (this.closed) return Promise.reject(this.closeReason);
    return this.owner.track(super._getWorker(taskID, taskCost).then(worker => {
      if (this.closed) {
        worker.terminate();
        this.workerPool = this.workerPool.filter(value => value !== worker);
        if (worker._taskCosts[taskID] !== undefined) this._releaseTask(worker, taskID);
        throw this.closeReason;
      }
      if (!worker.reefScanErrorHandler) {
        const originalMessage = worker.onmessage, originalPost = worker.postMessage.bind(worker), originalTerminate = worker.terminate.bind(worker);
        worker.terminate = () => { if (!worker.reefScanTerminated) { worker.reefScanTerminated = true; originalTerminate(); } };
        worker.postMessage = (message, ...args) => {
          if (this.closed && message.type === 'decode') throw this.closeReason;
          return originalPost(message, ...args);
        };
        worker.onmessage = event => {
          if (this.closed || (['decode', 'error'].includes(event.data.type) && !worker._callbacks[event.data.id])) return;
          originalMessage(event);
        };
        worker.reefScanErrorHandler = event => {
          const error = new Error(`USNM 229 Draco worker: ${event.message || event.type}`);
          for (const callback of Object.values(worker._callbacks)) callback.reject(error);
        };
        worker.addEventListener('error', worker.reefScanErrorHandler);
        worker.addEventListener('messageerror', worker.reefScanErrorHandler);
      }
      return worker;
    }));
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.closeReason = this.signal.reason instanceof Error ? this.signal.reason : new DOMException('Draco 已释放', 'AbortError');
    for (const worker of this.workerPool) {
      // Preserve these dictionaries for base _releaseTask's pending microtask.
      for (const callback of Object.values(worker._callbacks)) callback.reject(this.closeReason);
    }
    super.dispose();
    this.workerSourceURL = '';
  }
}

function trackImageLoader(parser, owner) {
  const original = parser.textureLoader.load.bind(parser.textureLoader);
  parser.textureLoader.load = (url, onLoad, onProgress, onError) => {
    let complete;
    owner.track(new Promise(resolve => { complete = resolve; }));
    if (url.startsWith('blob:')) owner.ownObjectURL(url);
    if (owner.disposed) {
      complete(); onError?.(new DOMException('扫描加载已取消', 'AbortError'));
      return;
    }
    const success = image => {
      owner.ownBitmap(image);
      if (image?.isTexture) owner.ownTexture(image);
      owner.revoke(url);
      complete();
      if (owner.disposed) onError?.(new DOMException('扫描加载已取消', 'AbortError'));
      else onLoad(image);
    };
    const failure = error => { owner.revoke(url); complete(); onError?.(error); };
    try {
      const result = original(url, success, onProgress, failure);
      // TextureLoader returns its Texture before its image completes; own that
      // placeholder as well so a failed fallback image cannot escape cleanup.
      if (result?.isTexture) owner.ownTexture(result);
      return result;
    }
    catch (error) { failure(error); throw error; }
  };
}

export function inspectReefSkeletonSource(data, detail = 'low') {
  check(Object.hasOwn(REEF_SKELETON_VARIANTS, detail), '未知的源文件精度');
  const variant = REEF_SKELETON_VARIANTS[detail];
  check(variant, '未知的源文件精度');
  check(data instanceof ArrayBuffer && data.byteLength >= 20, 'GLB 数据不完整');
  const view = new DataView(data);
  check(data.byteLength === variant.bytes && view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2, 'GLB 格式或字节数不符');
  check(view.getUint32(8, true) === data.byteLength && view.getUint32(16, true) === 0x4e4f534a, 'GLB chunk 无效');
  const jsonSize = view.getUint32(12, true);
  check(20 + jsonSize + 8 < data.byteLength, 'GLB JSON 长度无效');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonSize)));
  check(json.buffers?.length === 1 && !json.buffers[0].uri, 'GLB 必须自包含');
  check(json.nodes?.length === 1 && json.nodes[0].mesh === 0 && Object.keys(json.nodes[0]).length === 1, '源模型节点与馆藏文件不符');
  check(json.meshes?.length === 1 && json.meshes[0].primitives?.length === 1, '源模型网格结构不符');
  check(json.extensionsRequired?.includes('KHR_draco_mesh_compression'), '源模型缺少 Draco 声明');
  check(json.images?.length === variant.imageCount && json.images.every(image => Number.isInteger(image.bufferView) && image.mimeType === 'image/jpeg' && !image.uri), '预期的内嵌 JPEG 不完整');
  const primitive = json.meshes[0].primitives[0];
  check(json.accessors?.[primitive.indices]?.count === variant.triangles * 3 && json.accessors?.[primitive.attributes?.POSITION]?.count === variant.vertices, '源文件面数或顶点数不符');
  return json;
}

async function verifyHash(data, expected) {
  if (!globalThis.crypto?.subtle) return { verified: false, sha256: null, reason: 'Web Crypto unavailable; local download receipt retains verified source hash' };
  const digest = await crypto.subtle.digest('SHA-256', data);
  const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  check(sha256 === expected, '本地文件 SHA-256 与下载留存不符');
  return { verified: true, sha256 };
}

/** Prepare before constructing ReefWorld. Cancellation disposes now; late results are also owned. */
export async function loadReefSkeletonScan({ signal, detail = 'low' } = {}) {
  const started = performance.now(), owner = createReefScanResourceOwner();
  const controller = new AbortController(), manager = new THREE.LoadingManager();
  let group = null;
  let rejectAbort;
  const aborted = new Promise((resolve, reject) => { rejectAbort = reject; });
  aborted.catch(() => {});
  const abort = () => {
    manager.abort();
    owner.dispose(group);
    rejectAbort(controller.signal.reason);
  };
  controller.signal.addEventListener('abort', abort, { once: true });
  const externalAbort = () => controller.abort(signal.reason instanceof Error ? signal.reason : new DOMException('扫描加载已取消', 'AbortError'));
  signal?.addEventListener('abort', externalAbort, { once: true });
  if (signal?.aborted) externalAbort();
  const watchdog = setTimeout(() => controller.abort(new DOMException('扫描准备超过 30 秒，已停止解码并释放资源', 'TimeoutError')), 30000);
  const guard = promise => Promise.race([Promise.resolve(promise), aborted]);
  try {
    throwIfAborted(controller.signal);
    check(Object.hasOwn(REEF_SKELETON_VARIANTS, detail), '未知的源文件精度');
    const variant = REEF_SKELETON_VARIANTS[detail];
    check(variant, '未知的源文件精度');
    check(typeof WebAssembly !== 'undefined', '浏览器不支持本地 WASM 解码器');
    const base = import.meta.env?.BASE_URL ?? '/';
    const directory = new URL(`${base.endsWith('/') ? base : base + '/'}assets/reef-scan/`, window.location.href);
    const localUrl = name => new URL(name, directory).href;
    const fetched = await guard(Promise.allSettled([variant.file, 'document.json'].map(async name => {
      const response = await fetch(localUrl(name), { signal: controller.signal, credentials: 'omit' });
      check(response.ok, `无法读取本地 ${name}（HTTP ${response.status}）`);
      return response.arrayBuffer();
    })));
    const failed = fetched.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    const [data, manifestData] = fetched.map(result => result.value);
    const integrity = await guard(Promise.all([verifyHash(data, variant.sha256), verifyHash(manifestData, MANIFEST_SHA256)]));
    const source = inspectReefSkeletonSource(data, detail);
    const manifest = JSON.parse(new TextDecoder().decode(manifestData));
    const model = manifest.models?.[0];
    check(model?.units === 'mm' && model.derivatives?.some(item => item.assets?.some(asset => asset.uri === variant.file && asset.numFaces === variant.triangles)), 'manifest 与该网格精度不匹配');
    throwIfAborted(controller.signal);
    const draco = new OwnedDracoLoader(owner, manager, controller.signal, guard).setWorkerLimit(1).setDecoderPath({ js: localUrl('draco_wasm_wrapper.js'), wasm: localUrl('draco_decoder.wasm') });
    owner.setDecoder(draco);
    const loader = new GLTFLoader(manager).setDRACOLoader(draco);
    loader.register(parser => {
      trackImageLoader(parser, owner);
      return {
        name: 'REEF_SCAN_OWNERSHIP',
        loadTexture: index => owner.track(parser.loadTexture(index).then(owner.ownTexture)),
        loadMaterial: index => owner.track(parser.loadMaterial(index).then(owner.ownMaterial)),
        loadMesh: index => owner.track(parser.loadMesh(index).then(mesh => { owner.collect(mesh); return mesh; })),
        afterRoot: result => { for (const scene of result.scenes) owner.collect(scene); },
      };
    });
    const parsing = loader.parseAsync(data, directory.href).then(result => {
      for (const scene of result.scenes || [result.scene]) {
        owner.collect(scene);
        if (owner.disposed) { scene.removeFromParent(); scene.clear(); }
      }
      return result;
    });
    const gltf = await guard(parsing);
    group = gltf.scene;
    owner.collect(group);
    await guard(owner.settle());
    throwIfAborted(controller.signal);
    const transform = normalizeReefSkeletonGroup(group, model);
    let triangles = 0, vertices = 0, meshCount = 0;
    const textureDetails = [], materialDetails = [];
    group.traverse(object => {
      if (!object.isMesh) return;
      meshCount++; vertices += object.geometry.getAttribute('position').count; triangles += object.geometry.getIndex().count / 3;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        check(material?.isMeshStandardMaterial, '预期的 PBR 材质缺失');
        check([material.metalness, material.roughness, material.opacity, ...material.color.toArray()].every(Number.isFinite), '材质包含非有限数值');
        materialDetails.push({ metalness: material.metalness, roughness: material.roughness, opacity: material.opacity,
          colorLinear: material.color.toArray(), normalMapType: material.normalMap ? material.normalMapType : null,
          normalScale: material.normalMap ? material.normalScale.toArray() : null,
          geometryHasTangents: !!object.geometry.getAttribute('tangent'), authoredMaterialUnmodified: true });
        const maps = [['baseColor', material.map], ['occlusion', material.aoMap]];
        if (variant.imageCount === 3) maps.push(['normal', material.normalMap]);
        for (const [role, texture] of maps) {
          const image = texture?.source?.data ?? texture?.image;
          const width = image?.width ?? image?.naturalWidth, height = image?.height ?? image?.naturalHeight;
          check(texture?.isTexture && width === variant.textureSize && height === variant.textureSize, `${role} 贴图未就绪或尺寸不符`);
          check(texture.colorSpace === (role === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace), `${role} 色彩空间不符`);
          textureDetails.push({ role, width, height, colorSpace: texture.colorSpace, channel: texture.channel, flipY: texture.flipY, mimeType: texture.userData.mimeType });
        }
      }
      object.castShadow = true; object.receiveShadow = true;
    });
    check(meshCount === 1 && triangles === variant.triangles && vertices === variant.vertices, '实际网格面数或顶点数与源文件精度不符');
    group.name = 'USNM 229 — Acropora cytherea dry skeleton';
    // Existing world capture skips shared roots. This module, not organisms.js,
    // remains the sole owner; the caller must invoke the returned disposer.
    group.userData.shared = true;
    group.userData.role = 'museum-dry-coral-skeleton-environment';
    const metadata = {
      schema: 'reef-skeleton-scan-v1', specimen: 'USNM 229', scientificName: 'Acropora cytherea', originalPublishedName: 'Madrepora cytherea',
      preparation: 'Dry', representedAs: 'dead-skeleton-environment; not-live-Acropora-muricata', completeness: 'unverified-colony-or-fragment',
      collectionLocality: 'Tahiti, Society Islands, French Polynesia, South Pacific Ocean', collectionDate: '1838–1842',
      sourceUrl: SOURCE_URL + variant.file, manifestUrl: SOURCE_URL + 'document.json', recordUrl: RECORD_URL,
      sourceBytes: data.byteLength, sourceSha256: variant.sha256, manifestSha256: MANIFEST_SHA256,
      derivative: { detail, file: variant.file, declaredSourceTriangles: variant.triangles, declaredTextureSize: variant.textureSize },
      runtimeIntegrity: { glb: integrity[0], manifest: integrity[1] }, sourceGenerator: source.asset.generator,
      license: 'public-domain 3D media; Smithsonian Open Access CC0', licenseEvidence: 'assets/reef-scan/license-evidence.json',
      manifestCopyright: manifest.asset?.copyright, copyrightTextMismatchRetained: true,
      ...transform, meshCount, vertices, triangles, textures: textureDetails, materials: materialDetails,
      resources: { geometries: owner.geometries.size, materials: owner.materials.size, textures: owner.textures.size, bitmaps: owner.bitmaps.size },
      preparationMs: performance.now() - started, decoder: { local: true, draco: true, workers: 1, disposedBeforeReturn: true },
      placementAndContactValidated: false, visualAppearanceValidated: false, cleanupErrors: owner.cleanupErrors,
    };
    group.userData.scanMetadata = metadata;
    owner.releaseDecoder();
    throwIfAborted(controller.signal);
    return { group, metadata, dispose: () => owner.dispose(group) };
  } catch (error) {
    // Do not wait for an image decoder or silent worker indefinitely. The
    // closed owner immediately disposes every resource delivered afterwards.
    // r186 Draco's error message rejects with { type, id, error }, rather than
    // an Error instance. Preserve the decoder detail for the app's error panel.
    if (!(error instanceof Error)) error = new Error(error?.error || error?.message || String(error));
    if (!controller.signal.aborted) controller.abort(error);
    owner.dispose(group);
    throw error;
  } finally {
    clearTimeout(watchdog);
    signal?.removeEventListener('abort', externalAbort);
    controller.signal.removeEventListener('abort', abort);
  }
}
