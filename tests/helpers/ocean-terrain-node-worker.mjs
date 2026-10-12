import { parentPort } from 'node:worker_threads';
globalThis.self={postMessage:(message,transfers)=>parentPort.postMessage(message,transfers)};
await import('../../src/oceanTerrain.worker.js');
parentPort.on('message',data=>self.onmessage({data}));
