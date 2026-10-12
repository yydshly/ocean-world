import { createOceanPreparationJobs } from './oceanPreparationJobs.js';
const run = createOceanPreparationJobs();
self.onmessage = ({ data: { id, kind, payload } }) => {
  const startedMs = performance.now();
  try { const value = run(kind, payload); self.postMessage({ id, value,
    diagnostics: { durationMs: performance.now() - startedMs, contexts: run.stats() } }); }
  catch (error) { self.postMessage({ id, error: { name: error.name, message: error.message } }); }
};
