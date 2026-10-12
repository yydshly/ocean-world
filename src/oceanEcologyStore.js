// One record per visited region on disk. No unbounded visited-region Map is
// kept in memory. Browser storage is best effort and scoped to this origin.
export class OceanEcologyStore {
  constructor(indexedDB = globalThis.indexedDB, { timeoutMs = 30000 } = {}) {
    this.indexedDB = indexedDB;
    this.available = Boolean(indexedDB);
    this._database = null;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
  }

  async _open() {
    if (!this.available) return null;
    if (!this._database) {
      const opening = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, database) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) reject(error); else resolve(database);
      };
      const timer = setTimeout(() => finish(new Error('Regional storage open timed out.')), this.timeoutMs);
      let request;
      try { request = this.indexedDB.open('continuous-ocean-ecology-v1', 1); }
      catch (error) { finish(error); return; }
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('regions', { keyPath: 'key' });
        store.createIndex('world', 'world', { unique: false });
      };
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        request.result.onversionchange = () => {
          request.result.close();
          if (this._database === opening) this._database = null;
        };
        finish(null, request.result);
      };
      request.onerror = () => finish(request.error || new Error('Regional storage could not open.'));
      request.onblocked = () => finish(new Error('Regional storage upgrade is blocked.'));
      });
      this._database = opening;
      opening.catch(() => { if (this._database === opening) this._database = null; });
    }
    return this._database;
  }

  _transaction(database, mode, operation) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('regions', mode);
      let settled = false, readValue = () => undefined;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) reject(error); else resolve(readValue());
      };
      const timer = setTimeout(() => {
        // Abort the whole transaction; a timed-out read never means virgin
        // terrain, and earlier writes in a batch must not be committed later.
        const error = new Error(`Regional ${mode === 'readonly' ? 'read' : 'write'} timed out.`);
        try { transaction.abort(); } catch { /* The completion event may be pending. */ }
        finish(error);
      }, this.timeoutMs);
      transaction.oncomplete = () => finish();
      transaction.onerror = event => finish(transaction.error || event?.target?.error || new Error('Regional storage transaction failed.'));
      transaction.onabort = () => finish(transaction.error || new Error('Regional storage transaction aborted.'));
      try { readValue = operation(transaction) || readValue; }
      catch (error) {
        try { transaction.abort(); } catch { /* Preserve the original error. */ }
        finish(error);
      }
    });
  }

  async load(world, regionId) {
    const database = await this._open();
    if (!database) return null;
    return this._transaction(database, 'readonly', transaction => {
      const request = transaction.objectStore('regions').get(`${world}|${regionId}`);
      let value = null;
      request.onsuccess = () => { value = request.result?.state ?? null; };
      return () => value;
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
    return this._transaction(database, 'readwrite', transaction => {
      const store = transaction.objectStore('regions');
      for (const [regionId, state] of entries) {
        store.put({ key: `${world}|${regionId}`, world, regionId, state });
      }
    });
  }

  async clear(world) {
    const database = await this._open();
    if (!database) return;
    return this._transaction(database, 'readwrite', transaction => {
      const request = transaction.objectStore('regions').index('world').openCursor(world);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
    });
  }
}
