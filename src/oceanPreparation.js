// A preparation unit must restore any temporary physical context before it
// returns. Yield only between synchronous units, never inside that context.
const yieldToHost = () => globalThis.scheduler?.yield
  ? globalThis.scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));

export class OceanPreparation {
  constructor({ yieldTask = yieldToHost, now = () => performance.now(), budgetMs = 8 } = {}) {
    this.yieldTask = yieldTask; this.now = now; this.budgetMs = budgetMs;
    this.turnStart = now(); this.units = 0; this.yields = 0; this.maxUnitMs = 0; this.cpuMs = 0;
  }
  async each(items, operation, current = () => true) {
    for (const item of items) {
      if (!current()) return false;
      const start = this.now(), result = operation(item);
      if (result?.then) throw new TypeError('Preparation units must restore context synchronously.');
      const elapsed = this.now() - start;
      this.units++; this.cpuMs += elapsed; this.maxUnitMs = Math.max(this.maxUnitMs, elapsed);
      if (result === false) return false;
      if (this.now() - this.turnStart >= this.budgetMs) {
        await this.yieldTask(); this.yields++; this.turnStart = this.now();
        if (!current()) return false;
      }
    }
    return current();
  }
  stats() { return { units: this.units, yields: this.yields, maxUnitMs: this.maxUnitMs, cpuMs: this.cpuMs }; }
}
