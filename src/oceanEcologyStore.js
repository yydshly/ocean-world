// One record per visited region on disk. No unbounded visited-region Map is
// kept in memory. Browser storage is best effort and scoped to this origin.
export class OceanEcologyStore {
  constructor(indexedDB = globalThis.indexedDB) {
    this.indexedDB = indexedDB;
    this.available = Boolean(indexedDB);
    this._database = null;
  }

  async _open() {
    if (!this.available) return null;
    if (!this._database) this._database = new Promise((resolve, reject) => {
      const request = this.indexedDB.open('continuous-ocean-ecology-v1', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('regions', { keyPath: 'key' });
        store.createIndex('world', 'world', { unique: false });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error('Regional storage could not open.'));
      request.onblocked = () => reject(new Error('Regional storage upgrade is blocked.'));
    });
    return this._database;
  }

  async load(world, regionId) {
    const database = await this._open();
    if (!database) return null;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('regions', 'readonly');
      const request = transaction.objectStore('regions').get(`${world}|${regionId}`);
      let value = null;
      request.onsuccess = () => { value = request.result?.state ?? null; };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || new Error('Regional read aborted.'));
    });
  }

  async save(world, regionId, state) {
    return this.saveMany(world, [[regionId, state]]);
  }

  // A missing/unavailable load returns null. Writes resolve undefined, including
  // session-only operation; available distinguishes durable storage support.
  async saveMany(world, entries) {
    const database = await this._open();
    if (!database) return;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('regions', 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = event => reject(transaction.error || event?.target?.error || new Error('Regional save failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Regional save aborted.'));
      try {
        const store = transaction.objectStore('regions');
        for (const [regionId, state] of entries) {
          store.put({ key: `${world}|${regionId}`, world, regionId, state });
        }
      } catch (error) {
        // A synchronous put failure must discard earlier queued writes too.
        transaction.abort();
        reject(error);
      }
    });
  }

  async clear(world) {
    const database = await this._open();
    if (!database) return;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('regions', 'readwrite');
      const request = transaction.objectStore('regions').index('world').openCursor(world);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || new Error('Regional reset aborted.'));
    });
  }
}
