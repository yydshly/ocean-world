import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const oldSource = new URL('../output/validation/whole-habitat-KelpOceanChunks-before.js', import.meta.url);
const previousFreeze = JSON.parse(readFileSync(new URL('../output/validation/ocean-overall-source-hashes.json', import.meta.url)));
const oldEntry = previousFreeze.find(entry => entry.file === 'src/world/KelpOceanChunks.js');
if (digest(readFileSync(oldSource)) !== oldEntry.sha256) throw new Error('Old renderer does not match the 85-source freeze.');
const unchangedSources = ['src/kelpOceanGeneration.js', 'src/kelpHabitat.js', 'src/kelpOceanEcology.js', 'src/kelpSimulation.js'];
const sourceHashes = unchangedSources.map(file => ({ file, sha256: digest(readFileSync(new URL(`../${file}`, import.meta.url))) }));
for (const current of sourceHashes) {
  if (previousFreeze.find(entry => entry.file === current.file)?.sha256 !== current.sha256) throw new Error(`Pre-change source mismatch: ${current.file}`);
}
const points = [[0, 0], [40, 0], [60, 0], [118, -5], [259, -123], [-203.1, -84.25], [1000259, -1000123]];
const cells = [[0, 0], [1, -1], [4, -1], [10, 5], [-5, 4], [-1, -1], [2, 0], [15628, -15627]];
const cases = [42, '42', 'habitat-seams'].map(seed => {
  const generator = createKelpOceanGenerator(seed);
  return { seed, samples: points.map(([x, z]) => ({ x, z, sample: generator.sample(x, z),
    floorVertex: generator.floorVertex(x, z), floorSurface: generator.floorSurface(x, z),
    supportAt: generator.supportAt(x, z), heightAt: generator.heightAt(x, z), heightForCamera: generator.heightForCamera(x, z) })),
  chunks: cells.map(([cx, cz]) => generator.chunk(cx, cz)) };
});
const baseline = { schema: 'kelp-habitat-cover-before-v1', priorSourceCount: previousFreeze.length,
  oldRenderer: { file: 'output/validation/whole-habitat-KelpOceanChunks-before.js', sha256: oldEntry.sha256 },
  sourceHashes, cases };
const path = new URL('../output/validation/kelp-habitat-cover-before.json', import.meta.url);
writeFileSync(path, JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(`Immutable baseline captured: ${cases.length} typed seeds, ${cases.length * points.length} terrain readings, ${cases.length * cells.length} complete chunks.\n`);
