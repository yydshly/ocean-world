// One private CPU job per world. The worker never writes storage or publishes
// terrain; only the main model can commit a completed current request.
export class OceanBackgroundPreparation {
  constructor({ workerFactory = () => new Worker(new URL('./oceanPreparation.worker.js', import.meta.url), { type: 'module' }), timeoutMs = 90000 } = {}) {
    this.workerFactory = workerFactory; this.timeoutMs = timeoutMs;
    this.worker = null; this.pending = null; this.sequence = 0; this.disposed = false;
    this.completed = 0; this.cancelled = 0;
  }
  run(kind, payload, { signal } = {}) {
    if (this.disposed) return Promise.reject(new Error('Ocean preparation is disposed.'));
    if (this.pending) return Promise.reject(new Error('Only one ocean preparation job may run.'));
    if (signal?.aborted) return Promise.reject(new DOMException('Preparation cancelled.', 'AbortError'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const finish = (error, value, terminate = false) => {
        if (this.pending?.id !== id) return;
        clearTimeout(this.pending.timer); signal?.removeEventListener('abort', abort);
        this.pending = null;
        if (terminate) { this.worker?.terminate(); this.worker = null; }
        if (error) reject(error); else { this.completed++; resolve(value); }
      };
      const abort = () => { this.cancelled++; finish(new DOMException('Preparation cancelled.', 'AbortError'), null, true); };
      this.pending = { id, finish, timer: setTimeout(() => finish(new Error('Ocean background preparation timed out.'), null, true), this.timeoutMs) };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        if (!this.worker) {
          this.worker = this.workerFactory();
          const worker = this.worker;
          worker.onmessage = ({ data }) => {
            if (this.worker !== worker) return;
            if (data?.id !== this.pending?.id) return;
            const ErrorType = { Error, RangeError, TypeError }[data.error?.name] ?? Error;
            const error = data.error ? new ErrorType(data.error.message) : null;
            this.pending.finish(error, data.value);
          };
          worker.onerror = event => { if (this.worker === worker) this.pending?.finish(new Error(event.message || 'Ocean preparation worker failed.'), null, true); };
          worker.onmessageerror = () => { if (this.worker === worker) this.pending?.finish(new Error('Ocean preparation reply could not be read.'), null, true); };
        }
        this.worker.postMessage({ id, kind, payload });
      } catch (error) { finish(error, null, true); }
    });
  }
  cancel() { if (this.pending) { this.cancelled++; this.pending.finish(new DOMException('Preparation cancelled.', 'AbortError'), null, true); } }
  dispose() { this.disposed = true; this.cancel(); this.worker?.terminate(); this.worker = null; }
  stats() { return { pending: !!this.pending, completed: this.completed, cancelled: this.cancelled }; }
}
