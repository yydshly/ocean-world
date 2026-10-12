import { Worker } from 'node:worker_threads';
import { OceanBackgroundPreparation } from '../../src/oceanBackgroundPreparation.js';
export function nativePreparation() {
  return new OceanBackgroundPreparation({ workerFactory: () => {
    const worker = new Worker(new URL('./ocean-preparation-node-worker.mjs', import.meta.url));
    const adapter = { postMessage: message => worker.postMessage(message), terminate: () => worker.terminate() };
    worker.on('message', data => adapter.onmessage?.({ data }));
    worker.on('error', error => adapter.onerror?.({ message: error.message }));
    worker.on('messageerror', () => adapter.onmessageerror?.());
    return adapter;
  } });
}
