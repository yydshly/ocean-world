import { pathToFileURL } from 'node:url';
// Current geometry inspection; this entry point cannot overwrite or reproduce
// the historical asymmetric-v1 report as a claim about the revised terrain.
export { inspectLowMoundSupport as inspectAsymmetricReefShoulder } from './inspect-low-mound-support.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  throw new Error('Use inspect-low-mound-support.mjs to save current refitted terrain evidence under its new immutable namespace.');
