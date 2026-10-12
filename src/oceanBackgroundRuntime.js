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
      if (this.disposed || ecology._generation !== generation ||
          ecology.generator !== generator || generator.ridgeRevision !== topology ||
          active.some(([id, row]) => ecology._active.get(id) !== row)) return;
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
    }).catch(error => { if (!this.disposed) this.error = error; }).finally(() => {
      if (this.pending === flight) this.pending = null;
      if (!this.barriers) this.pump();
    });
    this.pending = flight;
  }
  payload(frames = []) {
    const ecology = this.ecology, generator = ecology.generator;
    const registry = generator.registryStats();
    const plans = registry.ids.map(id => generator.getRidgePlan(id)).filter(Boolean);
    return { seed: ecology.seed, wholeSeabed: generator.wholeSeabedVersion === 1,
      options: ecology._backgroundBirthOptions, topology: generator.ridgeRevision, plans,
      legacyIds: registry.ids.filter(id => !generator.getRidgePlan(id)),
      rows: [...ecology._active.values()].map(row => structuredClone(row)),
      locked: [...ecology._lockedRegions], desired: [...ecology._planktonDesiredRegions],
      sceneSupports: [...ecology._sceneSupports], habitatSupports: [...ecology._habitatSupports],
      macroSupports: [...ecology._macroSupports], birthView: ecology._biodiversityBirthView,
      activeTime: ecology._activeTime, accumulator: ecology._accumulator, frames };
  }
  async validateHistory(kind, rows, valid = true) {
    if (!this.barriers) throw new Error('Historical validation requires an owner publication barrier.');
    const payload = this.payload();
    return this.preparation.run('history', { ...payload, kind, validationRows: structuredClone(rows), valid });
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
    try { await this.flush(); return await operation(); }
    finally { this.barriers--; if (!this.barriers) this.pump(); }
  }
  reset() { this.frames.length = 0; this.error = null; }
  async shutdown() {
    try { await this.flush(); }
    finally { this.disposed = true; this.preparation.dispose(); }
  }
  stats() { return { pending: !!this.pending, queuedFrames: this.frames.length,
    queuedSeconds: this.frames.reduce((sum, frame) => sum + frame.deltaSec, 0),
    computationMs: this.computationMs, error: this.error?.message ?? null };
  }
}
