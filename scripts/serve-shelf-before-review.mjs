import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {validationCapturePlugin} from './validation-capture-plugin.mjs';

// Re-render the genuine pre-shelf terrain with today's otherwise unchanged
// application. This read-only loader does not replace production source files.
const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=await readFile(resolve(root,'output/validation/sources/reef-low-mound-v1/src/habitat.js'));
const baselineSha256=createHash('sha256').update(baseline).digest('hex');
if(baselineSha256!=='8879c21b072aaae7a5bf63ad3bbb4f153a078850124a219c944f3ab7ed00ede1')throw new Error('Preserve the original low-mound habitat snapshot');
const normalize=value=>value.replaceAll('\\','/').toLowerCase();
const habitatPath=normalize(resolve(root,'src/habitat.js'));
const server=await createServer({root,configFile:false,
  plugins:[{name:'shelf-review-original-terrain',enforce:'pre',load(id){
    if(normalize(id.split('?')[0])===habitatPath)return baseline.toString('utf8');
  }},react(),validationCapturePlugin()],
  server:{host:'127.0.0.1',port:4174,strictPort:true}});
await server.listen();
console.log(JSON.stringify({url:'http://127.0.0.1:4174/',baselineSha256,
  scope:'original pre-shelf habitat; other application files read from the current held source'}));
