import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the shipped asynchronous method without constructing WebGL or
// importing the Vite-only screenshot transport, as in the other World tests.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
const start = source.indexOf('  async setPaused(');
assert.ok(start >= 0);
const next = /\n  (?:async )?[A-Za-z_]\w*\(/.exec(source.slice(start + 2));
const method = source.slice(start, next ? start + 2 + next.index : source.lastIndexOf('\n}'));
const ReefWorld = new Function(`return class {${method}}`)();

test('pause freezes immediately but resolves only after the latest checkpoint commits', async () => {
  let commit, emitted = 0, requested = 0;
  const world = { paused: false, oceanEcology: { checkpoint: () => { requested++; return new Promise(resolve => { commit = resolve; }); } },
    emitSnapshot: () => emitted++ };
  let acknowledged = false;
  const pending = ReefWorld.prototype.setPaused.call(world, true).then(() => { acknowledged = true; });
  assert.equal(world.paused, true); assert.equal(requested, 1); assert.equal(acknowledged, false); assert.equal(emitted, 0);
  commit(true); await pending; assert.equal(acknowledged, true); assert.equal(emitted, 1);
  await ReefWorld.prototype.setPaused.call(world, false); assert.equal(world.paused, false); assert.equal(requested, 1);
});

test('failed pause save keeps the model frozen and reports failure without claiming a commit', async () => {
  let emitted = 0;
  const world = { paused: false, oceanEcology: { checkpoint: async () => false }, emitSnapshot: () => emitted++ };
  await assert.rejects(ReefWorld.prototype.setPaused.call(world, true), /保存失败/);
  assert.equal(world.paused, true); assert.equal(emitted, 1);
});

test('a reset in progress is never checkpointed as a completed pause save', async () => {
  const world = { paused: false, oceanEcologyResetting: true, oceanEcology: { checkpoint: () => assert.fail('reset state was saved') }, emitSnapshot() {} };
  assert.equal(await ReefWorld.prototype.setPaused.call(world, true), true);
});
