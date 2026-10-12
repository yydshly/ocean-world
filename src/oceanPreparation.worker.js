import { createOceanPreparationJobs } from './oceanPreparationJobs.js';
const run = createOceanPreparationJobs();
self.onmessage = ({ data: { id, kind, payload } }) => {
  try { self.postMessage({ id, value: run(kind, payload) }); }
  catch (error) { self.postMessage({ id, error: { name: error.name, message: error.message } }); }
};
