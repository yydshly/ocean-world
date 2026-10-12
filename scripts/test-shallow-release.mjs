import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('tests').filter(name => name.startsWith('shallow-') && name.endsWith('.test.mjs')).sort().map(name => `tests/${name}`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
