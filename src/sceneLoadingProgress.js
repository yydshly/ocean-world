const MODEL_LIMIT = 32;
const safeBytes = bytes => Number.isFinite(bytes) && bytes >= 0 ? bytes : 0;
const pathOnly = url => {
  try { return new URL(url, globalThis.location?.href ?? 'https://diagnostics.invalid/').pathname.slice(0, 300); }
  catch { return '(invalid model URL)'; }
};

// The model loader streams gzip decoding while bytes arrive. These milestones
// distinguish its unresolved module gate without claiming a pure decode time.
export function createSceneLoadingProgress(now = () => performance.now()) {
  const listeners = new Set(), files = new Map();
  let snapshot = { started: 0, complete: 0, bytes: 0, models: [] };
  const clock = () => { try { const value = now(); return Number.isFinite(value) && value >= 0 ? value : null; } catch { return null; } };
  const publish = () => {
    const models = [...files.values()].map(row => ({ ...row }));
    snapshot = { started: models.length, complete: models.filter(row => row.status === 'complete').length,
      bytes: models.reduce((sum, row) => sum + row.bytes, 0), models };
    for (const listener of listeners) listener();
  };
  const start = url => {
    if (!files.has(url) && files.size >= MODEL_LIMIT) files.delete(files.keys().next().value);
    files.set(url, { path: pathOnly(url), bytes: 0, status: 'fetching', startMs: clock(), responseMs: null,
      receivedMs: null, decodeMs: null, endMs: null, elapsedMs: null, error: '', errorName: '' });
    publish();
  };
  const patch = (url, changes) => {
    if (!files.has(url)) start(url);
    const row = files.get(url), endMs = changes.endMs ?? row.endMs;
    files.set(url, { ...row, ...changes,
      elapsedMs: endMs !== null && row.startMs !== null ? Math.max(0, endMs - row.startMs) : null });
    publish();
  };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot() { return snapshot; },
    start,
    response(url) { patch(url, { responseMs: clock(), status: 'receiving' }); },
    received(url, bytes) { patch(url, { bytes: safeBytes(bytes), receivedMs: clock(), status: 'decoding' }); },
    update(url, bytes, complete = false) {
      const count = safeBytes(bytes);
      patch(url, complete ? { bytes: count, status: 'complete', decodeMs: clock(), endMs: clock() } : { bytes: count });
    },
    fail(url, error) { patch(url, { status: 'failed', endMs: clock(),
      error: String(error?.message || error || 'Unknown model error').slice(0, 240),
      errorName: String(error?.name ?? 'Error').slice(0, 80) }); },
  };
}

export const sceneLoadingProgress = createSceneLoadingProgress();
