import { createOceanRuntimeJobs } from './oceanRuntimeJobs.js';
const run = createOceanRuntimeJobs();
self.onmessage = ({ data: { id, payload } }) => {
  const startedMs = performance.now();
  try { const value = run(payload); self.postMessage({ id, value,
    diagnostics: { durationMs: performance.now() - startedMs } }); }
  catch (error) { self.postMessage({ id, error: { name: error.name, message: error.message } }); }
};
