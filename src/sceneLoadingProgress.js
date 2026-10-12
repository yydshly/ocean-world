const listeners = new Set(), files = new Map();
let snapshot = { started: 0, complete: 0, bytes: 0 };
export const sceneLoadingProgress = {
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot() { return snapshot; },
  update(url, bytes, complete = false) {
    files.set(url, { bytes, complete });
    snapshot = { started: files.size, complete: [...files.values()].filter(file => file.complete).length,
      bytes: [...files.values()].reduce((sum, file) => sum + file.bytes, 0) };
    for (const listener of listeners) listener();
  },
};
