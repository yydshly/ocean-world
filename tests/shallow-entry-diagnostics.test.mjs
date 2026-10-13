import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { loadCompressedModelData } from '../src/world/loadCompressedModelData.js';
import { createSceneLoadingProgress, sceneLoadingProgress } from '../src/sceneLoadingProgress.js';
import { captureShallowEntryDiagnostics } from '../src/shallowEntryDiagnostics.js';

test('a streamed model keeps its full data while recording headers, receipt and decode completion', async () => {
  const previousFetch = globalThis.fetch, path = '/assets/shallowDiagnosticData-ok.bin';
  const authored = { default: { positions: [1, 2.25, -3], label: '既有动物' } };
  const compressed = gzipSync(JSON.stringify(authored)), statuses = [];
  const unsubscribe = sceneLoadingProgress.subscribe(() => {
    const row = sceneLoadingProgress.getSnapshot().models.find(row => row.path === path);
    if (row) statuses.push(row.status);
  });
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(compressed.subarray(0, 12));
      controller.enqueue(compressed.subarray(12)); controller.close();
    } }));
    assert.deepEqual(await loadCompressedModelData(path), authored);
    const row = sceneLoadingProgress.getSnapshot().models.find(row => row.path === path);
    assert.equal(row.bytes, compressed.length);
    assert.equal(row.status, 'complete');
    for (const status of ['fetching', 'receiving', 'decoding', 'complete']) assert.ok(statuses.includes(status), status);
    const milestones = [row.startMs, row.responseMs, row.receivedMs, row.decodeMs, row.endMs];
    assert.ok(milestones.every(Number.isFinite));
    assert.deepEqual([...milestones].sort((a, b) => a - b), milestones);
    assert.equal(row.elapsedMs, row.endMs - row.startMs);
    assert.equal(row.error, '');
  } finally { globalThis.fetch = previousFetch; unsubscribe(); }
});

test('missing and corrupt models fail without completing or replacing their data', async () => {
  const previousFetch = globalThis.fetch;
  try {
    for (const [suffix, response] of [['missing', new Response('missing', { status: 404 })], ['corrupt', new Response('not gzip')]]) {
      const path = `/assets/shallowDiagnosticData-${suffix}.bin`;
      globalThis.fetch = async () => response;
      await assert.rejects(loadCompressedModelData(path));
      const row = sceneLoadingProgress.getSnapshot().models.find(row => row.path === path);
      assert.equal(row.status, 'failed');
      assert.equal(row.decodeMs, null);
      assert.ok(row.error.length > 0);
      assert.ok(row.endMs >= row.responseMs);
    }
  } finally { globalThis.fetch = previousFetch; }
});

test('the original 60-second abort rejects once and retains the error rather than retrying', async () => {
  const previous = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const path = '/assets/shallowDiagnosticData-aborted.bin', abortError = new DOMException('原请求中止', 'AbortError');
  let callback, delay, attempts = 0, cleared;
  try {
    globalThis.setTimeout = (fn, ms) => { callback = fn; delay = ms; return 'model-timer'; };
    globalThis.clearTimeout = token => { cleared = token; };
    globalThis.fetch = (_url, { signal }) => { attempts++; return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(abortError), { once: true });
    }); };
    const result = loadCompressedModelData(path);
    assert.equal(delay, 60000); callback();
    await assert.rejects(result, error => error === abortError);
    assert.equal(attempts, 1); assert.equal(cleared, 'model-timer');
    const row = sceneLoadingProgress.getSnapshot().models.find(row => row.path === path);
    assert.equal(row.status, 'failed'); assert.equal(row.errorName, 'AbortError');
    assert.equal(row.responseMs, null); assert.equal(row.decodeMs, null);
  } finally { Object.assign(globalThis, previous); }
});

test('model evidence is bounded, path-only, finite and retains prior snapshot values', () => {
  let time = 0;
  const progress = createSceneLoadingProgress(() => time), path = 'https://example.test/assets/model.bin?token=private#fragment';
  progress.start(path); const first = progress.getSnapshot();
  time = 12; progress.response(path); time = 21; progress.received(path, 42);
  time = 23; progress.update(path, 42, true);
  assert.equal(first.models[0].status, 'fetching'); assert.equal(first.models[0].responseMs, null);
  const completed = progress.getSnapshot();
  assert.equal(completed.models[0].path, '/assets/model.bin');
  assert.equal(completed.models[0].elapsedMs, 23);
  assert.equal(progress.getSnapshot(), completed, 'React subscriptions need a stable unchanged snapshot');
  for (let i = 0; i < 40; i++) progress.start(`/assets/model-${i}.bin`);
  assert.equal(progress.getSnapshot().models.length, 32);
  progress.update('/assets/model-39.bin', Infinity);
  progress.fail('/assets/model-39.bin', new Error('x'.repeat(500)));
  const last = progress.getSnapshot().models.at(-1);
  assert.equal(last.bytes, 0); assert.equal(last.error.length, 240);
  assert.ok(Number.isFinite(progress.getSnapshot().bytes));
});

test('public resource evidence keeps only bounded same-origin critical requests and distinguishes unavailable sizes', () => {
  const entry = (name, extra = {}) => ({ name, initiatorType: 'link', startTime: 12, fetchStart: 12,
    responseStart: 18, responseEnd: 35, duration: 23, transferSize: 0, encodedBodySize: 1234, decodedBodySize: 2345, ...extra });
  const requests = Array.from({ length: 70 }, (_, i) => entry(`https://example.test/ocean-world/assets/model-${i}.js?token=private`));
  requests.push(entry('https://foreign.test/ocean-world/assets/index-remote.js'),
    entry('https://example.test/voice/school-0.mp3'), entry('not a URL'),
    entry('https://example.test/ocean-world/assets/ShallowSampleApp-same.js', { duration: Infinity, transferSize: -1 }));
  const result = captureShallowEntryDiagnostics({ pageUrl: 'https://example.test/ocean-world/?seed=55',
    timing: { now: () => 100, getEntriesByType: type => type === 'resource' ? requests : [{ responseEnd: 7 }] },
    componentStartedAtMs: 60, modelSnapshot: { models: [{ startMs: 10, endMs: null, elapsedMs: null, status: 'receiving' }] } });
  assert.equal(result.resourceTimingAvailable, true); assert.equal(result.relevantResourceCount, 71);
  assert.equal(result.resources.length, 64); assert.equal(result.navigation.responseEnd, 7);
  assert.equal(result.componentStartedAtMs, 60); assert.equal(result.models[0].elapsedMs, 90);
  assert.equal(result.resources[0].transferBytes, 0);
  assert.doesNotMatch(JSON.stringify(result), /private|foreign|mp3|cacheHit/);
  const invalidSizes = captureShallowEntryDiagnostics({ pageUrl: 'https://example.test/',
    timing: { now: () => NaN, getEntriesByType: type => type === 'resource' ? [requests.at(-1)] : [] }, modelSnapshot: {} });
  assert.equal(invalidSizes.capturedAtMs, null); assert.equal(invalidSizes.resources[0].durationMs, null);
  assert.equal(invalidSizes.resources[0].transferBytes, null);
});

test('unavailable browser timing stays explicit without hiding completed model evidence', () => {
  const modelSnapshot = { models: [{ startMs: 0, endMs: 50, elapsedMs: 50, status: 'complete' }] };
  for (const timing of [null, {}, { now() { throw new Error('unavailable'); }, getEntriesByType() { throw new Error('unavailable'); } }]) {
    const result = captureShallowEntryDiagnostics({ timing, pageUrl: 'https://example.test/ocean-world/', modelSnapshot });
    assert.equal(result.resourceTimingAvailable, false); assert.deepEqual(result.resources, []);
    assert.equal(result.models[0].status, 'complete');
  }
  const invalidPage = captureShallowEntryDiagnostics({ pageUrl: 'invalid', modelSnapshot });
  assert.equal(invalidPage.resourceTimingAvailable, false);
  const malformed = captureShallowEntryDiagnostics({ pageUrl: 'https://example.test/',
    timing: { get getEntriesByType() { throw new Error('unavailable'); } },
    modelSnapshot: { models: [null, 'invalid', { get startMs() { throw new Error('invalid row'); } }] } });
  assert.equal(malformed.resourceTimingAvailable, false); assert.deepEqual(malformed.models, []);
  assert.equal(captureShallowEntryDiagnostics({ modelSnapshot: null }).models.length, 0);
  const bounded = captureShallowEntryDiagnostics({ pageUrl: 'https://example.test/',
    timing: { now: () => 100, getEntriesByType: type => type === 'resource'
      ? Array.from({ length: 1000 }, () => ({ name: 'https://example.test/assets/index-valid.js' })) : [] },
    modelSnapshot: { models: Array.from({ length: 1000 }, () => ({ status: 'receiving', error: 'x'.repeat(1000) })) } });
  assert.equal(bounded.resourceEntriesObserved, 1000); assert.equal(bounded.resourceEntriesScanned, 256);
  assert.equal(bounded.models.length, 32); assert.equal(bounded.models[0].error.length, 240);
});
