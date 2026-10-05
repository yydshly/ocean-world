import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const name=process.argv[2],output=process.argv[3];
if(!/^[a-z][a-z0-9-]*$/.test(name||'')||!/^output\/validation\/[a-z0-9-]+\.json$/.test(output||''))throw new Error('Pass a named dist build and a validation JSON path.');
const directory=path.resolve('dist',name),files=[];
async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await walk(file);else files.push(file);}}
await walk(directory);files.sort();
const records=await Promise.all(files.map(async file=>{const bytes=await readFile(file);return {file:path.relative(directory,file).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}));
await writeFile(output,JSON.stringify({schema:'tidal-frozen-build-manifest-v1',recordedAt:new Date().toISOString(),directory:`dist/${name}`,files:records,notes:['Manifest identifies the exact served files, including bundled application code and original textures.']},null,2)+'\n',{flag:'wx'});
console.log(`${records.length} files recorded in ${output}`);
