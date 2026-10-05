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
    records, transactions, opens, schema, abortNextWrite: false,
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
          };
        },
      };
      transactions.push(transaction);
      queueMicrotask(() => queueMicrotask(() => {
        if (transaction.status !== 'pending') return;
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
