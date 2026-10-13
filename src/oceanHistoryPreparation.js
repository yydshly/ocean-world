import { OceanBackgroundPreparation } from './oceanBackgroundPreparation.js';

// A transaction still has one publication barrier. Its independent owner
// checks run in three bounded lanes, each with the complete native terrain.
// Only immutable context handles are retained; every history row is checked
// again, and no lane can write storage or publish a partial verdict.
export class OceanHistoryPreparation {
  constructor({ createPreparation = () => new OceanBackgroundPreparation(), lanes = 3 } = {}) {
    if (!Number.isInteger(lanes) || lanes < 1 || lanes > 3) throw new RangeError('History preparation supports one to three lanes.');
    this.lanes = Array.from({ length: lanes }, createPreparation);
    this.contexts = new Map(); this.pending = null; this.disposed = false;
    this.sequence = 0; this.jobs = []; this.completed = 0; this.cancelled = 0;
  }
  run(kind, payload, options) {
    if (this.disposed) return Promise.reject(new Error('Ocean preparation is disposed.'));
    if (this.pending) return Promise.reject(new Error('Only one ocean preparation transaction may run.'));
    const startedMs = performance.now(), id = ++this.sequence;
    let status = 'complete';
    const flight = this.execute(kind, payload, options).then(value => {
      this.completed++; return value;
    }).catch(error => {
      // A lost worker invalidates the entire set of handles. Cancel siblings
      // before permitting the next transaction; late replies cannot commit.
      status = error.name; this.contexts.clear(); this.lanes.forEach(lane => lane.cancel()); throw error;
    }).finally(() => {
      if (this.pending === flight) this.pending = null;
      this.jobs.push({ id, kind, startedMs, roundTripMs: performance.now() - startedMs, lanes: this.lanes.length, status });
      if (this.jobs.length > 24) this.jobs.shift();
    });
    this.pending = flight; return flight;
  }
  async execute(kind, payload, options) {
    if (kind === 'validate-group' && payload.retainContext === true) {
      const replies = await Promise.all(this.lanes.map(lane => lane.run(kind, payload, options)));
      if (replies.some(reply => reply?.valid !== true || typeof reply.contextToken !== 'string'))
        throw new TypeError('Incomplete history terrain acknowledgement.');
      const contextToken = replies[0].contextToken;
      // Same bound as each native worker. Native tokens remain authoritative
      // on eviction, seed changes, failure or worker replacement.
      this.contexts.delete(contextToken);
      if (this.contexts.size >= 6) this.contexts.delete(this.contexts.keys().next().value);
      this.contexts.set(contextToken, { tokens: replies.map(reply => reply.contextToken),
        ownerIds: payload.plans.map(plan => plan.id) });
      return { valid: true, contextToken };
    }
    if (kind === 'history' && this.contexts.has(payload.contextToken)) {
      const context = this.contexts.get(payload.contextToken);
      if (!Array.isArray(payload.rows) || payload.rows.length > 12) throw new TypeError('Invalid background history batch.');
      const partitions = this.lanes.map(() => []);
      for (const row of payload.rows) {
        const index = context.ownerIds.indexOf(row.id);
        if (index < 0) return false;
        partitions[index % partitions.length].push(row);
      }
      // Stable owner-to-lane assignment keeps terrain-derived layouts warm.
      // All rows and all lanes finish before the single combined decision.
      const replies = await Promise.all(this.lanes.map((lane, index) => lane.run(kind,
        { ...payload, contextToken: context.tokens[index], rows: partitions[index] }, options)));
      return replies.every(value => value === true);
    }
    return this.lanes[0].run(kind, payload, options);
  }
  cancel() {
    if (!this.pending) return;
    this.cancelled++; this.contexts.clear(); this.lanes.forEach(lane => lane.cancel());
  }
  dispose() { this.disposed = true; this.contexts.clear(); this.lanes.forEach(lane => lane.dispose()); }
  stats() { return { pending: !!this.pending, completed: this.completed, cancelled: this.cancelled,
    laneCount: this.lanes.length, contexts: this.contexts.size, jobs: [...this.jobs], transitionJobs: [...this.jobs],
    lanes: this.lanes.map(lane => { const stats = lane.stats(); return { pending: stats.pending,
      completed: stats.completed, cancelled: stats.cancelled, lastJob: stats.jobs.at(-1) ?? null }; }) }; }
}
