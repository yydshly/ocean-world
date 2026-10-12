// One batch adaptation from the frozen source. Source images are untouched.
// Remove the low survey floor, retaining the upper connected reef community.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import original from '../output/validation/shallow-integrated-pass/before-src/world/shallowNearCommunityData.js';
import {nearSourceGeometry} from '../src/world/ShallowNearCommunity.js';
const {MeshoptSimplifier:S}=await import(pathToFileURL('D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js'));await S.ready;
const cut=.30,records=[],hash=b=>createHash('sha256').update(b).digest('hex');
original.reefscan.variants.near=original.reefscan.variants.near.map(row=>{
  const source=nearSourceGeometry(row),names=Object.keys(source.attributes),arrays=Object.fromEntries(names.map(n=>[n,[]]));
  const vertex=index=>Object.fromEntries(names.map(n=>[n,Array.from(source.attributes[n].array.slice(index*source.attributes[n].itemSize,(index+1)*source.attributes[n].itemSize))]));
  const mix=(a,b,t)=>Object.fromEntries(names.map(n=>[n,a[n].map((v,i)=>v+(b[n][i]-v)*t)]));
  for(let k=0;k<source.index.count;k+=3){
    const triangle=[0,1,2].map(i=>vertex(source.index.getX(k+i))),poly=[];
    for(let i=0;i<3;i++){const a=triangle[i],b=triangle[(i+1)%3],inside=a.position[1]>=cut,next=b.position[1]>=cut;
      if(inside)poly.push(a);if(inside!==next)poly.push(mix(a,b,(cut-a.position[1])/(b.position[1]-a.position[1])));
    }
    for(let i=1;i+1<poly.length;i++)for(const v of [poly[0],poly[i],poly[i+1]])for(const name of names)arrays[name].push(...v[name]);
  }
  const raw=new THREE.BufferGeometry();for(const name of names)raw.setAttribute(name,new THREE.Float32BufferAttribute(arrays[name],source.attributes[name].itemSize));
  const g=mergeVertices(raw,1e-6);raw.dispose();source.dispose();
  const target=Math.max(120,Math.floor(g.index.count*.60/3)*3),idx=S.simplifyWithAttributes(Uint32Array.from(g.index.array),g.attributes.position.array,3,g.attributes.uv.array,2,[2,2],null,target,.008,['LockBorder'])[0];
  const [remap,count]=S.compactMesh(idx),views={},blocks=[];let offset=0;
  for(const [name,a]of Object.entries(g.attributes)){const out=new Float32Array(count*a.itemSize);for(let i=0;i<remap.length;i++)if(remap[i]<count)out.set(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize),remap[i]*a.itemSize);
    views[name]={offset,count,size:a.itemSize};blocks.push(Buffer.from(out.buffer));offset+=out.byteLength;
  }
  const indexType=count>65535?'uint32':'uint16',index=indexType==='uint32'?Uint32Array.from(idx):Uint16Array.from(idx);views.index={offset,count:index.length,size:1};blocks.push(Buffer.from(index.buffer));
  records.push({file:row.file,before:row.triangles,after:index.length/3});g.dispose();
  return {...row,indexType,triangles:index.length/3,views,data:Buffer.concat(blocks).toString('base64')};
});
original.reefscan.clipFloor=cut;
const file='src/world/shallowNearCommunityData.js';fs.writeFileSync(file,`// Attributed source derivatives. See assets/shallow-near-community/provenance.json.\nexport default ${JSON.stringify(original)};\n`);
const receiptFile='public/assets/shallow-near-community/provenance.json',receipt=JSON.parse(fs.readFileSync(receiptFile));
const record=receipt.records.find(r=>r.key==='reefscan');
record.changes="Fixed whole-family crop below 30% source height removes the blue survey-floor apron; interpolate cut triangles, simplify retained upper community with UV and boundary protection. An authored continuous limestone foundation closes the outer cut perimeter and joins the actual sediment bed; its visible top is included in physical support queries. The foundation is not part of the field scan. Original source images untouched. Dimensions authored, not survey scale.";
record.triangles.near=records.reduce((n,r)=>n+r.after,0);receipt.generatedData.sha256=hash(fs.readFileSync(file));receipt.version=2;
fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');
fs.writeFileSync('output/validation/shallow-integrated-pass/reef-adaptation.json',JSON.stringify({cut,records,sourceAspect:original.reefscan.aspect},null,2));
console.log(JSON.stringify({before:records.reduce((n,r)=>n+r.before,0),after:record.triangles.near}));
