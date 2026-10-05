import fs from 'node:fs';
import crypto from 'node:crypto';
import { DeepSimulation } from '../src/deepSimulation.js';

const output = new URL('../output/validation/deep-predator-default-before.json', import.meta.url);
if (fs.existsSync(output)) throw new Error('The pre-edit baseline already exists; do not replace it.');
const fields = ['_rngState', '_ticks', '_accumulator', 'timeSec', 'environment', 'events', 'agents',
  'primaryProduction', 'totalPrimaryProduction', 'counters', 'ledger', 'energyLedger', '_nextParcelId',
  '_nextRelease', '_nextSummary', 'surfacePatches', 'benthicPatches', 'suspendedPatches'];
const state = sim => structuredClone(Object.fromEntries(fields.map(field => [field, sim[field]])));
const hash = path => crypto.createHash('sha256').update(fs.readFileSync(new URL(path, import.meta.url))).digest('hex');
const cases = [42, '42', 'deep-replay'].map(seed => {
  const sim = new DeepSimulation(seed), initial = state(sim);
  sim.step(10);
  return { seed, initial, seconds: 10, after: state(sim), metrics: structuredClone(sim.metrics) };
});
fs.writeFileSync(output, `${JSON.stringify({ recordedAt: new Date().toISOString(), scope: 'Exact default DeepSimulation states before adding a separate regional predator category',
  sourceHashes: Object.fromEntries(['../src/deepSimulation.js', '../src/deepSpecies.js', '../src/deepHabitat.js'].map(path => [path, hash(path)])),
  fields, cases }, null, 2)}\n`);
process.stdout.write(`Saved ${cases.length} pre-edit default cases with 16 native animals, initial and 10-second full states.\n`);
