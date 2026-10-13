import { sceneLoadingProgress } from './sceneLoadingProgress.js';

const RESOURCE_LIMIT = 64;
const RESOURCE_SCAN_LIMIT = 256;
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const text = (value, limit) => String(value ?? '').slice(0, limit);
const criticalFile = file => /^(?:index-|ShallowSampleApp-|reefScanAssets-|model-).+\.js$/i.test(file)
  || /^(?:shallow.*Data-.+|shallow-static-v1(?:-gzip)?)\.bin$/i.test(file);

// Local, bounded public evidence. Zero transfer bytes can mean cache or missing
// timing information; the record deliberately does not label a cache hit.
export function captureShallowEntryDiagnostics({ timing = globalThis.performance,
  pageUrl = globalThis.location?.href, componentStartedAtMs = null,
  modelSnapshot = sceneLoadingProgress.getSnapshot() } = {}) {
  let page, resourceEntries = [], navigationEntry = null, resourceTimingAvailable = false;
  try { page = new URL(pageUrl); } catch { /* Non-browser and invalid-location evidence remains explicit. */ }
  try {
    if (page && typeof timing?.getEntriesByType === 'function') {
      const entries = timing.getEntriesByType('resource');
      if (!Array.isArray(entries)) throw new Error('Resource timing unavailable');
      resourceEntries = entries;
      resourceTimingAvailable = true;
      try { navigationEntry = timing.getEntriesByType('navigation')?.[0] ?? null; } catch { /* Optional navigation timing. */ }
    }
  } catch { /* Unsupported browser timing never changes loading behavior. */ }
  let capturedAtMs = null;
  try { capturedAtMs = finite(timing?.now?.()); } catch { /* Timing is optional evidence. */ }
  const resources = [];
  let relevantResourceCount = 0;
  for (const entry of resourceEntries.slice(0, RESOURCE_SCAN_LIMIT)) {
    try {
    let url;
    try { url = new URL(entry.name); } catch { continue; }
    if (url.origin !== page.origin || !criticalFile(url.pathname.split('/').at(-1))) continue;
    relevantResourceCount++;
    if (resources.length >= RESOURCE_LIMIT) continue;
    resources.push({ path: url.pathname.slice(0, 300), initiatorType: text(entry.initiatorType, 40),
      startMs: finite(entry.startTime), fetchStartMs: finite(entry.fetchStart), responseStartMs: finite(entry.responseStart),
      responseEndMs: finite(entry.responseEnd), durationMs: finite(entry.duration),
      transferBytes: finite(entry.transferSize), encodedBytes: finite(entry.encodedBodySize), decodedBytes: finite(entry.decodedBodySize) });
    } catch { /* A malformed individual entry cannot break the public diagnostic. */ }
  }
  let navigation = null, modelRows = [], models = [];
  try { if (navigationEntry) navigation = Object.fromEntries(['startTime', 'requestStart', 'responseStart', 'responseEnd',
    'domInteractive', 'domContentLoadedEventEnd', 'loadEventEnd'].map(key => [key, finite(navigationEntry[key])])); } catch { /* Optional navigation timing. */ }
  try { if (Array.isArray(modelSnapshot?.models)) modelRows = modelSnapshot.models.slice(0, 32); } catch { /* Optional model evidence. */ }
  for (const row of modelRows) {
    if (!row || typeof row !== 'object') continue;
    try {
      const item = { path: text(row.path, 300), bytes: finite(row.bytes), status: text(row.status, 40),
        error: text(row.error, 240), errorName: text(row.errorName, 80),
        ...Object.fromEntries(['startMs', 'responseMs', 'receivedMs', 'decodeMs', 'endMs', 'elapsedMs'].map(key => [key, finite(row[key])])) };
      if (item.endMs === null && item.startMs !== null && capturedAtMs !== null) item.elapsedMs = Math.max(0, capturedAtMs - item.startMs);
      models.push(item);
    } catch { /* A malformed individual model cannot break loading or rendering. */ }
  }
  return { version: 1, capturedAtMs, componentStartedAtMs: finite(componentStartedAtMs),
    resourceTimingAvailable, resourceLimit: RESOURCE_LIMIT, resourceScanLimit: RESOURCE_SCAN_LIMIT,
    resourceEntriesObserved: resourceEntries.length, resourceEntriesScanned: Math.min(resourceEntries.length, RESOURCE_SCAN_LIMIT),
    relevantResourceCount, resources, navigation, modelTimingKind: 'streaming-receive-and-decode-overlap', models };
}
