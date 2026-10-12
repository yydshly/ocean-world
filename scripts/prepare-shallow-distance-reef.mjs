import fs from 'node:fs';
import {createHash} from 'node:crypto';
import data from '../src/world/shallowNearCommunityData.js';
import {nearSourceGeometry} from '../src/world/ShallowNearCommunity.js';
import {MeshoptSimplifier as S} from 'file:///D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js';
await S.ready;
const records=[];
const rows=data.reefscan.variants.near.map(row=>{
  const g=nearSourceGeometry(row),target=Math.max(90,Math.floor(g.index.count*.22/3)*3);
  const [idx,error]=S.simplifyWithAttributes(Uint32Array.from(g.index.array),g.attributes.position.array,3,g.attributes.uv.array,2,[1,1],null,target,.04,[]);
  const [remap,count]=S.compactMesh(idx),views={},blocks=[];let offset=0;
  for(const [name,a]of Object.entries(g.attributes)){
    const out=new Float32Array(count*a.itemSize);
    for(let i=0;i<remap.length;i++)if(remap[i]<count)out.set(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize),remap[i]*a.itemSize);
    views[name]={offset,count,size:a.itemSize};blocks.push(Buffer.from(out.buffer));offset+=out.byteLength;
  }
  const index=Uint16Array.from(idx);views.index={offset,count:index.length,size:1};blocks.push(Buffer.from(index.buffer));
  const result={...row,indexType:'uint16',views,triangles:index.length/3,data:Buffer.concat(blocks).toString('base64')};
  records.push({file:row.file,near:row.triangles,far:result.triangles,error});g.dispose();return result;
});
const file='src/world/shallowReefDistanceData.js';fs.writeFileSync(file,`// Existing CC BY 4.0 VIVID REALITY reef, display-only distant derivative. Original images unchanged.\nexport default ${JSON.stringify(rows)};\n`);
const source=JSON.parse(fs.readFileSync('public/assets/shallow-near-community/provenance.json')).records.find(r=>r.key==='reefscan').source;
fs.writeFileSync('public/assets/shallow-near-community/distance-provenance.json',JSON.stringify({author:'VIVID REALITY',source,license:'CC-BY-4.0',licenseURL:'https://creativecommons.org/licenses/by/4.0/',sourceRecord:'provenance.json',changes:'Simplify cropped upper community for distant views with UV protection. Original positions, source images and near physical support retained. Select whole instances by camera frustum and distance.',generatedData:{file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')},records},null,2));
console.log(JSON.stringify({near:records.reduce((n,r)=>n+r.near,0),far:records.reduce((n,r)=>n+r.far,0)}));
