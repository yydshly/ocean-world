import { Worker } from 'node:worker_threads';
export function nativeTerrainWorkerFactory() {
  const worker=new Worker(new URL('./ocean-terrain-node-worker.mjs',import.meta.url));
  const adapter={postMessage:message=>worker.postMessage(message),terminate:()=>worker.terminate()};
  worker.on('message',data=>adapter.onmessage?.({data}));
  worker.on('error',error=>adapter.onerror?.({message:error.message}));
  worker.on('messageerror',()=>adapter.onmessageerror?.());
  return adapter;
}
