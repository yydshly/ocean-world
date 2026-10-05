import fs from 'node:fs';
import crypto from 'node:crypto';
import { KelpSimulation } from '../src/kelpSimulation.js';

const output = new URL('../output/validation/kelp-drift-default-before.json', import.meta.url);
if (fs.existsSync(output)) throw new Error('The pre-edit baseline already exists; do not replace it.');
const state = sim => structuredClone(Object.fromEntries(Object.entries(sim)
  .filter(([, value]) => typeof value !== 'function')
  .map(([key, value]) => [key, value instanceof Map ? [...value] : value])));
const hash = path => crypto.createHash('sha256').update(fs.readFileSync(new URL(path, import.meta.url))).digest('hex');
const cases = [42, '42', 'kelp-drift'].map(seed => {
  const sim = new KelpSimulation(seed), initial = state(sim), initialMetrics = structuredClone(sim.metrics);
  sim.step(10);
  return { seed, initial, initialMetrics, seconds: 10, after: state(sim), metrics: structuredClone(sim.metrics) };
});
fs.writeFileSync(output, `${JSON.stringify({ recordedAt: new Date().toISOString(),
  scope: 'Complete serializable default KelpSimulation state including native Map entries, every agent, RNG, all five pools and ledgers before optional regional drift hooks',
  sourceHashes: Object.fromEntries(['../src/kelpSimulation.js', '../src/kelpHabitat.js', '../src/biomes.js'].map(path => [path, hash(path)])), cases }, null, 2)}\n`);
process.stdout.write(`Saved ${cases.length} pre-edit default kelp cases, initial and 10-second complete states.\n`);
