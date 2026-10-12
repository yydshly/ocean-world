import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const shards = JSON.parse(readFileSync(new URL('../tests/release-world-shards.json', import.meta.url)));
const files = shards.flat();
assert.equal(shards.length, 8);
assert.equal(files.length, 236, '236 world files plus the build-dependent sites-worker suite retain all 237 previous checks');
assert.equal(new Set(files).size, files.length, 'no duplicate test files');
for (const file of files) assert.ok(existsSync(file), `missing required test: ${file}`);
const index = Number(process.argv[2]);
assert.ok(Number.isInteger(index) && index >= 0 && index < shards.length, 'supply a shard number from 0 through 7');
assert.ok(shards[index].length > 0);
console.log(`World regression group ${index + 1}/8: ${shards[index].length} files`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...shards[index]], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
