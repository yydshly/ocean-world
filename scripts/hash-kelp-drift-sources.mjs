import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function paths(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? paths(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
  return nested.flat();
}
const rows = await Promise.all((await paths('src')).sort().map(async file => ({ file,
  sha256: createHash('sha256').update(await readFile(file)).digest('hex') })));
await writeFile('output/validation/kelp-drift-source-hashes.json', `${JSON.stringify(rows, null, 2)}\n`);
console.log(`${rows.length} production source files frozen.`);
