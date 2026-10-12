// Offline import: original source image bytes are copied, never repainted.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
const root='output/validation/shallow-living-kit/candidates',out='public/assets/shallow-living-kit';
const {MeshoptSimplifier:S}=await import(pathToFileURL('D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js'));await S.ready;
fs.mkdirSync(out,{recursive:true});const data={},records=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const key of ['table-acropora','acropora-robusta','reef-shark','yellow-tang-low']){
  const source=JSON.parse(fs.readFileSync(`${root}/${key}/model.json`)),meta=JSON.parse(fs.readFileSync(`${root}/${key}.json`));
  if(!['by','by-nc-sa'].includes(meta.license.slug))throw Error('Unapproved redistribution licence');
  const coral=key.includes('acropora'),aspect=(source.sourceBounds[1][1]-source.sourceBounds[0][1])/source.normalization.extent;
  const parts=source.parts.filter(r=>r.image).map(row=>{
    const g=new THREE.BufferGeometry();for(const [name,a]of Object.entries(row.attributes))g.setAttribute(name,new THREE.Float32BufferAttribute(a,name==='uv'?2:3));g.setIndex(row.index);
    if(coral){g.translate(0,.5*aspect,0);g.scale(1,1/aspect,1);}
    const file=`${key}-${row.material}.${row.image.split('.').at(-1)}`;fs.copyFileSync(row.image,`${out}/${file}`);return {g,file,row};
  });
  const variants={};for(const detail of ['near','distant'])variants[detail]=parts.map(({g,file,row})=>{
    const ix=detail==='near'||!coral?Uint32Array.from(g.index.array):S.simplifyWithAttributes(Uint32Array.from(g.index.array),g.attributes.position.array,3,g.attributes.uv.array,2,[2,2],null,Math.max(24,Math.floor(g.index.count*.20/3)*3),.035,['Permissive'])[0];
    const [remap,count]=S.compactMesh(ix),views={},blocks=[];let offset=0;
    for(const [name,a]of Object.entries(g.attributes)){const arr=new Float32Array(count*a.itemSize);for(let i=0;i<remap.length;i++)if(remap[i]<count)arr.set(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize),remap[i]*a.itemSize);views[name]={offset,count,size:a.itemSize};blocks.push(Buffer.from(arr.buffer));offset+=arr.byteLength;}
    views.index={offset,count:ix.length,size:1};blocks.push(Buffer.from(Uint16Array.from(ix).buffer));
    return {file,directory:'shallow-living-kit',indexType:'uint16',wrapS:row.wrapS,wrapT:row.wrapT,triangles:ix.length/3,views,data:Buffer.concat(blocks).toString('base64')};
  });data[key]={aspect,variants};parts.forEach(p=>p.g.dispose());
  records.push({key,title:meta.name,author:meta.user.displayName,source:meta.viewerUrl,license:meta.license.slug,licenseURL:meta.license.url,sourceSha256:sha(fs.readFileSync(`${root}/${key}/source.glb`)),changes:coral?(key==='table-acropora'?'UV-preserving simplification, uniform world scale, source cut terrain buried in the receiving rock. The tiny untextured survey fragment is omitted.':'UV-preserving simplification, original complete textured survey patch, uniform world scale and assembly on the receiving rock.'):'Original complete model, rigid normalization to total length; bounded authored swimming deformation replaces source rig. No new anatomy or species identification claimed.',limits:coral?'Different survey sites assembled as visual reference, not one measured reef. CC BY-NC-SA restrictions retained.':'Artist model, not an anatomical scan.',originalTriangles:source.originalTriangles,nearTriangles:variants.near.reduce((n,r)=>n+r.triangles,0)});
}
fs.writeFileSync('src/world/shallowLivingKitData.js',`// Source and licence records: assets/shallow-living-kit/provenance.json\nexport default ${JSON.stringify(data)};\n`);
fs.writeFileSync(`${out}/provenance.json`,JSON.stringify({date:'2026-10-12',records,textures:fs.readdirSync(out).filter(f=>/\.(png|jpg)$/.test(f)).map(file=>({file,bytes:fs.statSync(`${out}/${file}`).size,sha256:sha(fs.readFileSync(`${out}/${file}`))}))},null,2));
console.log(records.map(r=>({key:r.key,triangles:r.nearTriangles,license:r.license})));
