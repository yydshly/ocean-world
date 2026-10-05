// A frozen, loopback-only build for continuous browser soak validation.
// Vite HMR cannot change this build while the development scene is improved.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { validationCapturePlugin } from './validation-capture-plugin.mjs';
const buildName=process.argv[2]||'validation',port=Number(process.argv[3]||4176);
if(!/^[a-z][a-z0-9-]*$/.test(buildName)||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Expected a dist subdirectory name and a valid local port.');
const root=process.cwd(),directory=path.resolve(root,'dist',buildName);
let capture;
validationCapturePlugin().configureServer({config:{root},middlewares:{use(handler){capture=handler;}}});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((request,response)=>capture(request,response,async()=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname),file=path.resolve(directory,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(directory+path.sep)){response.writeHead(403);response.end();return;}
    const bytes=await readFile(file);response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(request.method==='HEAD'?undefined:bytes);
  }catch{response.writeHead(404);response.end('Not found');}
}));
server.listen(port,'127.0.0.1',()=>process.stdout.write(`Frozen ${buildName} build: http://127.0.0.1:${port}/\n`));
