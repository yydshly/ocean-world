import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanEcologyStore } from '../src/oceanEcologyStore.js';

// Stage writes until completion so an abort really discards the whole batch.
// This fake covers only the IndexedDB surface used by these store tests.
function fakeIndexedDB() {
  const records = new Map();
  const transactions = [];
  const opens = [];
  const schema = [];
  let initialized = false;
  const fake = {
    records, transactions, opens, schema, abortNextWrite: false, hangNextTransaction: false,
    open(name, version) {
      opens.push({ name, version });
      const request = { result: database };
      queueMicrotask(() => {
        if (!initialized) {
          initialized = true;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
  };
  const database = {
    close() {},
    createObjectStore(name, options) {
      schema.push({ name, options });
      return { createIndex: (index, keyPath, indexOptions) => schema.push({ index, keyPath, options: indexOptions }) };
    },
    transaction(name, mode) {
      const hang = fake.hangNextTransaction; fake.hangNextTransaction = false;
      const staged = new Map();
      const abortOnFinish = mode === 'readwrite' && fake.abortNextWrite;
      if (mode === 'readwrite') fake.abortNextWrite = false;
      const transaction = {
        name, mode, writes: [], status: 'pending', error: null,
        abort() {
          transaction.status = 'aborted';
          staged.clear();
          queueMicrotask(() => transaction.onabort?.());
        },
        objectStore(storeName) {
          assert.equal(storeName, 'regions');
          return {
            put(record) {
              const cloned = structuredClone(record);
              transaction.writes.push(cloned);
              staged.set(cloned.key, cloned);
              return {};
            },
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = structuredClone(records.get(key));
                request.onsuccess?.();
              });
              return request;
            },
            index() { return { openCursor() { const request = {}; queueMicrotask(() => request.onsuccess?.()); return request; } }; },
          };
        },
      };
      transactions.push(transaction);
      queueMicrotask(() => queueMicrotask(() => {
        if (transaction.status !== 'pending' || hang) return;
        if (abortOnFinish) {
          transaction.error = new Error('Injected transaction abort.');
          transaction.abort();
          return;
        }
        for (const [key, value] of staged) records.set(key, value);
        transaction.status = 'complete';
        transaction.oncomplete?.();
      }));
      return transaction;
    },
  };
  return fake;
}

test('saveMany commits every region in one transaction and keeps the v1 namespace', async () => {
  const indexedDB = fakeIndexedDB();
  const store = new OceanEcologyStore(indexedDB);
  const entries = [['2,3', { clockSec: 10 }], ['3,3', { clockSec: 20 }], ['3,4', { clockSec: 30 }]];

  assert.equal(await store.saveMany('ocean:42', entries), undefined);
  assert.deepEqual(indexedDB.opens, [{ name: 'continuous-ocean-ecology-v1', version: 1 }]);
  assert.deepEqual(indexedDB.schema, [
    { name: 'regions', options: { keyPath: 'key' } },
    { index: 'world', keyPath: 'world', options: { unique: false } },
  ]);
  assert.equal(indexedDB.transactions.length, 1);
  const [transaction] = indexedDB.transactions;
  assert.equal(transaction.mode, 'readwrite');
  assert.equal(transaction.name, 'regions');
  assert.equal(transaction.status, 'complete');
  assert.deepEqual(transaction.writes, entries.map(([regionId, state]) => ({
    key: `ocean:42|${regionId}`, world: 'ocean:42', regionId, state,
  })));
  entries[0][1].clockSec = 999;
  assert.deepEqual(await store.load('ocean:42', '2,3'), { clockSec: 10 });
  assert.equal(await store.load('ocean:other', '2,3'), null);
  assert.equal(await store.load('ocean:42', 'missing'), null);
});

test('save delegates its single record to saveMany', async () => {
  const store = new OceanEcologyStore(null);
  const calls = [];
  store.saveMany = async (...args) => { calls.push(args); };
  const state = { clockSec: 15 };
  assert.equal(await store.save('ocean:7', '-1,0', state), undefined);
  assert.deepEqual(calls, [['ocean:7', [['-1,0', state]]]]);
});

test('an aborted batch discards all writes and preserves prior records', async () => {
  const indexedDB = fakeIndexedDB();
  const store = new OceanEcologyStore(indexedDB);
  await store.save('world', 'source', { agents: ['migrant'] });
  indexedDB.abortNextWrite = true;

  await assert.rejects(store.saveMany('world', [
    ['source', { agents: [] }], ['destination', { agents: ['migrant'] }],
  ]), /Injected transaction abort/);
  assert.equal(indexedDB.transactions[1].writes.length, 2);
  assert.equal(indexedDB.transactions[1].status, 'aborted');
  assert.deepEqual([...indexedDB.records], [['world|source', {
    key: 'world|source', world: 'world', regionId: 'source', state: { agents: ['migrant'] },
  }]]);
});

test('a synchronous put failure aborts earlier queued writes', async () => {
  const indexedDB = fakeIndexedDB();
  const store = new OceanEcologyStore(indexedDB);
  await assert.rejects(store.saveMany('world', [
    ['source', { agents: [] }], ['destination', { invalid: () => {} }],
  ]), { name: 'DataCloneError' });
  assert.equal(indexedDB.transactions.length, 1);
  assert.equal(indexedDB.transactions[0].writes.length, 1);
  assert.equal(indexedDB.transactions[0].status, 'aborted');
  assert.equal(indexedDB.records.size, 0);
});

test('unavailable IndexedDB remains session-only with null reads and undefined writes', async () => {
  const store = new OceanEcologyStore(null);
  assert.equal(store.available, false);
  assert.equal(await store.saveMany('world', [['0,0', { clockSec: 1 }]]), undefined);
  assert.equal(await store.save('world', '1,0', { clockSec: 2 }), undefined);
  assert.equal(await store.load('world', '0,0'), null);
  assert.equal(await store.clear('world'), undefined);
});

test('a never-completing read rejects, aborts and allows a fresh read without treating failure as virgin terrain', async () => {
  const indexedDB = fakeIndexedDB(), store = new OceanEcologyStore(indexedDB, { timeoutMs: 10 });
  const original = { agents: [{ id: 'old-death', alive: false }], stock: .4, clockSec: 17 };
  await store.save('world', '0,0', original);
  indexedDB.hangNextTransaction = true;
  await assert.rejects(store.load('world', '0,0'), /read timed out/);
  assert.equal(indexedDB.transactions.at(-1).status, 'aborted');
  assert.deepEqual(await store.load('world', '0,0'), original);
});

test('a stalled atomic save discards the whole batch and later completion cannot acknowledge it', async () => {
  const indexedDB = fakeIndexedDB(), store = new OceanEcologyStore(indexedDB, { timeoutMs: 10 });
  await store.save('world', 'source', { agents: ['migrant'] });
  indexedDB.hangNextTransaction = true;
  await assert.rejects(store.saveMany('world', [['source', { agents: [] }], ['destination', { agents: ['migrant'] }]]), /write timed out/);
  const stalled = indexedDB.transactions.at(-1);
  assert.equal(stalled.status, 'aborted'); stalled.oncomplete();
  assert.deepEqual(await store.load('world', 'source'), { agents: ['migrant'] });
  assert.equal(await store.load('world', 'destination'), null);
  await store.save('world', 'destination', { agents: ['new'] });
  assert.deepEqual(await store.load('world', 'destination'), { agents: ['new'] });
});

test('a stalled clear rejects and retains the prior records', async () => {
  const indexedDB = fakeIndexedDB(), store = new OceanEcologyStore(indexedDB, { timeoutMs: 10 });
  await store.save('world', '0,0', { clockSec: 7 }); indexedDB.hangNextTransaction = true;
  await assert.rejects(store.clear('world'), /write timed out/);
  assert.equal(indexedDB.transactions.at(-1).status, 'aborted');
  assert.deepEqual(await store.load('world', '0,0'), { clockSec: 7 });
});

test('a stalled database opening is retryable and closes a late old connection', async () => {
  const good = fakeIndexedDB(); let first, opens = 0, closed = 0;
  const indexedDB = { open(...args) { if (++opens === 1) return first = {}; return good.open(...args); } };
  const store = new OceanEcologyStore(indexedDB, { timeoutMs: 10 });
  await assert.rejects(store.load('world', '0,0'), /open timed out/);
  assert.equal(await store.load('world', '0,0'), null);
  first.result = { close() { closed++; } }; first.onsuccess();
  assert.equal(closed, 1);
  await store.save('world', '0,0', { clockSec: 17 });
  assert.deepEqual(await store.load('world', '0,0'), { clockSec: 17 }); assert.equal(opens, 2);
});
