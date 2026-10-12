import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { loadCompressedModelData } from '../src/world/loadCompressedModelData.js';
import { sceneLoadingProgress } from '../src/sceneLoadingProgress.js';
import { observeMainThreadStalls } from '../src/mainThreadStalls.js';

test('streamed model loading preserves data and never reports corrupt or missing data as complete', async () => {
  const oldFetch = globalThis.fetch;
  const data = { default: { vertices: [0, 1, 3.5], label: '原始模型' } };
  try {
    globalThis.fetch = async () => new Response(gzipSync(JSON.stringify(data)));
    assert.deepEqual(await loadCompressedModelData('/ok.bin'), data);
    assert.equal(sceneLoadingProgress.getSnapshot().complete, 1);
    globalThis.fetch = async () => new Response('missing', { status: 404 });
    await assert.rejects(loadCompressedModelData('/missing.bin'), /404/);
    globalThis.fetch = async () => new Response('corrupt');
    await assert.rejects(loadCompressedModelData('/corrupt.bin'));
    assert.equal(sceneLoadingProgress.getSnapshot().complete, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test('stall evidence stays bounded and retains browser script attribution with visibility', () => {
  let deliver, disconnected = false;
  class Observer {
    static supportedEntryTypes = ['long-animation-frame'];
    constructor(callback) { deliver = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const diagnostic = observeMainThreadStalls(() => ({ visible: true, paused: false }), Observer);
  deliver({ getEntries: () => Array.from({ length: 100 }, (_, i) => ({ startTime: i, duration: 200,
    scripts: [{ sourceURL: 'app.js', sourceFunctionName: 'restore', invoker: 'IDBTransaction.oncomplete', duration: 180 }] })) });
  assert.equal(diagnostic.events.length, 64);
  assert.equal(diagnostic.events[0].startMs, 36);
  assert.equal(diagnostic.events[63].scripts[0].invoker, 'IDBTransaction.oncomplete');
  assert.equal(diagnostic.events[63].visible, true);
  diagnostic.dispose(); assert.equal(disconnected, true);
});
