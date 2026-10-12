import { OceanBackgroundPreparation } from './oceanBackgroundPreparation.js';

export class OceanBackgroundRuntime {
  constructor(ecology, { preparation = new OceanBackgroundPreparation({
    workerFactory: () => new Worker(new URL('./oceanRuntime.worker.js', import.meta.url), { type: 'module' }),
  }) } = {}) {
    this.ecology = ecology; this.preparation = preparation;
    this.frames = []; this.pending = null; this.barriers = 0;
    this.error = null; this.disposed = false; this.computationMs = 0;
  }
  advance(deltaSec, environment) {
    if (this.error) throw this.error;
    if (this.disposed || this.barriers || !this.ecology._active.size || !deltaSec) return;
    // Retain original per-frame inputs, including the fractional accumulator;
    // never merge environments, skip ticks, or extrapolate animal positions.
    if (this.frames.length >= 2048) throw new Error('后台生态计算未能跟上，已暂停模拟，请降低模拟速度。');
    this.frames.push({ deltaSec, environment: { ...environment } });
    this.pump();
  }
  pump() {
    if (this.pending || !this.frames.length || this.disposed || this.error) return;
    const ecology = this.ecology;
    if (!this.barriers && ecology._accumulator + this.frames.reduce((sum, frame) => sum + frame.deltaSec, 0) < .1 - 1e-10) return;
    const frames = this.frames.splice(0, Math.min(16, this.frames.length));
    const generation = ecology._generation;
    const generator = ecology.generator, topology = generator.ridgeRevision;
    const active = [...ecology._active];
    const payload = this.payload(frames);
    const flight = this.preparation.run('step', payload).then(result => {
      const applyStartedMs = performance.now();
      if (this.disposed || ecology._generation !== generation ||
          ecology.generator !== generator || generator.ridgeRevision !== topology ||
          active.some(([id, row]) => ecology._active.get(id) !== row)) return;
      this.acknowledgeContext(payload, generator);
      if (result.rows.length !== active.length || result.rows.some(row => !ecology._active.has(row.id)))
        throw new Error('后台生态回复的区域不匹配。');
      for (const row of result.rows) {
        const current = ecology._active.get(row.id), plan = current.livingRidgePlan;
        for (const field of Object.keys(current)) if (!Object.hasOwn(row, field)) delete current[field];
        Object.assign(current, row);
        if (plan) current.livingRidgePlan = plan;
      }
      ecology._activeTime = result.activeTime; ecology._accumulator = result.accumulator;
      ecology._planktonLastStep = result.planktonLastStep;
      ecology._planktonFaces = new Map(result.planktonFaces);
      this.computationMs = result.computationMs;
      this.replyApplyMs = performance.now() - applyStartedMs;
    }).catch(error => { if (!this.disposed) this.error = error; }).finally(() => {
      if (this.pending === flight) this.pending = null;
      if (!this.barriers) this.pump();
    });
    this.pending = flight;
  }
  payload(frames = []) {
    const payloadStartedMs = performance.now();
    const ecology = this.ecology, generator = ecology.generator;
    const context = JSON.stringify([ecology.seed, generator.wholeSeabedVersion === 1, ecology._backgroundBirthOptions]);
    const changed = this._acknowledgedGenerator !== generator || this._acknowledgedTopology !== generator.ridgeRevision || this._acknowledgedContext !== context;
    const registry = changed ? generator.registryStats() : null;
    const payload = { seed: ecology.seed, wholeSeabed: generator.wholeSeabedVersion === 1,
      options: ecology._backgroundBirthOptions, topology: generator.ridgeRevision, context,
      ...(changed ? { plans: registry.ids.map(id => generator.getRidgePlan(id)).filter(Boolean),
        legacyIds: registry.ids.filter(id => !generator.getRidgePlan(id)) } : {}),
      planRowIds: [...ecology._active.values()].filter(row => row.livingRidgePlan).map(row => row.id),
      rows: [...ecology._active.values()].map(({ livingRidgePlan, ...row }) => structuredClone(row)),
      locked: [...ecology._lockedRegions], desired: [...ecology._planktonDesiredRegions],
      sceneSupports: [...ecology._sceneSupports], habitatSupports: [...ecology._habitatSupports],
      macroSupports: [...ecology._macroSupports], birthView: ecology._biodiversityBirthView,
      atomicStore: typeof ecology.store?.saveMany === 'function', environment: { ...ecology._environment }, activeTime: ecology._activeTime, accumulator: ecology._accumulator, frames };
    this.payloadMs = performance.now() - payloadStartedMs; return payload;
  }
  acknowledgeContext(payload, generator) {
    if (this.disposed || this.ecology.generator !== generator || generator.ridgeRevision !== payload.topology) return;
    this._acknowledgedGenerator = generator; this._acknowledgedTopology = payload.topology;
    this._acknowledgedContext = payload.context;
  }
  async validateHistory(kind, rows, valid = true) {
    if (!this.barriers) throw new Error('Historical validation requires an owner publication barrier.');
    const generator = this.ecology.generator, payload = this.payload();
    const result = await this.preparation.run('history', { ...payload, kind, validationRows: structuredClone(rows), valid });
    this.acknowledgeContext(payload, generator);
    return result;
  }
  async prepareOwner(saved, coordinates, valid, freshPlan = null, validateActive = false) {
    if (!this.barriers) throw new Error('Owner preparation requires a publication barrier.');
    const generator = this.ecology.generator, payload = this.payload();
    const result = await this.preparation.run('prepare-owner', { ...payload, kind: 'prepare-owner', saved: structuredClone(saved), coordinates, valid, freshPlan, validateActive });
    this.acknowledgeContext(payload, generator);
    // Preserve the certified immutable terrain identity on main-owned records.
    if (saved?.livingRidgePlan) for (const key of ['region', 'beforeCommunity', 'beforeMobility', 'beforeTransport'])
      if (result[key]?.livingRidgePlan) result[key].livingRidgePlan = saved.livingRidgePlan;
    return result;
  }
  async prepareGroup(plans) {
    if (!this.barriers) throw new Error('Group preparation requires a publication barrier.');
    const generator = this.ecology.generator, payload = this.payload();
    const rows = await this.preparation.run('prepare-group', { ...payload, kind: 'prepare-group', groupPlans: structuredClone(plans) });
    if (!Array.isArray(rows) || rows.length !== plans.length || rows.some((row, i) => row.id !== plans[i].id))
      throw new Error('Background owner group did not return every original owner in order.');
    this.acknowledgeContext(payload, generator);
    return rows;
  }
  async flush() {
    this.barriers++;
    try {
      while (this.pending || this.frames.length) {
        if (this.error) throw this.error;
        this.pump();
        await this.pending;
      }
      if (this.error) throw this.error;
    } finally { this.barriers--; }
  }
  async withBarrier(operation) {
    this.barriers++;
    const barrierStartedMs = performance.now();
    try { await this.flush(); this.barrierWaitMs = performance.now() - barrierStartedMs; return await operation(); }
    finally { this.barriers--; if (!this.barriers) this.pump(); }
  }
  reset() { this.frames.length = 0; this.error = null; this._acknowledgedGenerator = null; }
  async shutdown() {
    try { await this.flush(); }
    finally { this.disposed = true; this.preparation.dispose(); }
  }
  stats() { const preparationStats = this.preparation.stats?.() ?? {}; return { pending: !!this.pending, queuedFrames: this.frames.length,
    queuedSeconds: this.frames.reduce((sum, frame) => sum + frame.deltaSec, 0),
    computationMs: this.computationMs, payloadMs: this.payloadMs ?? 0, replyApplyMs: this.replyApplyMs ?? 0,
    barrierWaitMs: this.barrierWaitMs ?? 0, jobs: preparationStats.jobs ?? [],
    transitionJobs: preparationStats.transitionJobs ?? [], error: this.error?.message ?? null };
  }
}
