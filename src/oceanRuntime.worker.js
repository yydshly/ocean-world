import { createOceanRuntimeJobs } from './oceanRuntimeJobs.js';
const run = createOceanRuntimeJobs();
self.onmessage = ({ data: { id, payload } }) => {
  try { self.postMessage({ id, value: run(payload) }); }
  catch (error) { self.postMessage({ id, error: { name: error.name, message: error.message } }); }
};
