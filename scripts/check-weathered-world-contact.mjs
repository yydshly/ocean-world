import { readFile, writeFile, access, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Execute the existing real World contact/camera harness unchanged except
// report destinations and an extra source binding. Historical evidence stays
// intact. Its explicit WebGL/browser substitutes still apply to this run.
const root=new URL('../',import.meta.url);
for(const name of ['weathered-world-integration-v1.json','weathered-world-warmup-v1.json']){
  try{await access(new URL(`output/validation/${name}`,root));throw new Error('Keep existing weathered World evidence; use a new report version');}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
const source=await readFile(new URL('scripts/check-world-integration.mjs',root),'utf8');
const adapted=source.replace("const sourcePaths = [","const sourcePaths = ['scripts/check-weathered-world-contact.mjs',")
  .replaceAll('output/validation/world-integration-smoke.json','output/validation/weathered-world-integration-v1.json')
  .replaceAll('output/validation/world-warmup-pause-resource-smoke.json','output/validation/weathered-world-warmup-v1.json');
if(adapted===source)throw new Error('World harness source structure changed');
const temporary=new URL(`scripts/.weathered-world-harness-${Date.now()}.mjs`,root);
await writeFile(temporary,adapted,{flag:'wx'});
try{
  const result=await promisify(execFile)(process.execPath,[fileURLToPath(temporary)],
    {cwd:fileURLToPath(root),encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
  process.stdout.write(result.stdout);process.stderr.write(result.stderr);
}finally{await unlink(temporary);}
