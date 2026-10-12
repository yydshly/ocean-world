// Offline import: original source image bytes are copied, never repainted.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
const root='output/validation/shallow-contact-fauna/candidates',out='public/assets/shallow-contact-fauna';
const {MeshoptSimplifier:S}=await import(pathToFileURL('D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js'));await S.ready;
fs.mkdirSync(out,{recursive:true});const data={},records=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const key of ['crab-blue','octopus-lukas']){
  const source=JSON.parse(fs.readFileSync(`${root}/${key}/model.json`)),meta=JSON.parse(fs.readFileSync(`${root}/${key}.json`));
  if(!['by','by-nc'].includes(meta.license.slug))throw Error('Unapproved redistribution licence');
  const coral=key.includes('acropora'),aspect=(source.sourceBounds[1][1]-source.sourceBounds[0][1])/source.normalization.extent;
  const parts=source.parts.map(row=>{
    const g=new THREE.BufferGeometry();for(const [name,a]of Object.entries(row.attributes))g.setAttribute(name,new THREE.Float32BufferAttribute(a,name==='uv'?2:3));g.setIndex(row.index);
    if(key==='crab-blue'){
      const body=source.parts.find(p=>p.material===0).attributes.position,x=body.filter((_,i)=>i%3===0),width=Math.max(...x)-Math.min(...x);
      g.rotateY(Math.PI/2);g.scale(1/width,1/width,1/width);
    }
    // Whole animal contact uses the original source's lowest point.
    const lowest=(source.sourceBounds[0][1]-source.normalization.center[1])/source.normalization.extent;
    const body=source.parts.find(p=>p.material===0).attributes.position,x=body.filter((_,i)=>i%3===0),unit=key==='crab-blue'?Math.max(...x)-Math.min(...x):1;
    g.translate(0,-lowest/unit,0);
    const file=row.image?`${key}-${row.material}.${row.image.split('.').at(-1)}`:null;if(file)fs.copyFileSync(row.image,`${out}/${file}`);const normalFile=row.normalImage?`${key}-${row.material}-normal.${row.normalImage.split('.').at(-1)}`:null;if(normalFile)fs.copyFileSync(row.normalImage,`${out}/${normalFile}`);return {g,file,normalFile,row};
  });
  const variants={};for(const detail of ['near'])variants[detail]=parts.map(({g,file,normalFile,row})=>{
    const ix=detail==='near'||!coral?Uint32Array.from(g.index.array):S.simplifyWithAttributes(Uint32Array.from(g.index.array),g.attributes.position.array,3,g.attributes.uv.array,2,[2,2],null,Math.max(24,Math.floor(g.index.count*.20/3)*3),.035,['Permissive'])[0];
    const [remap,count]=S.compactMesh(ix),views={},blocks=[];let offset=0;
    for(const [name,a]of Object.entries(g.attributes)){const arr=new Float32Array(count*a.itemSize);for(let i=0;i<remap.length;i++)if(remap[i]<count)arr.set(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize),remap[i]*a.itemSize);views[name]={offset,count,size:a.itemSize};blocks.push(Buffer.from(arr.buffer));offset+=arr.byteLength;}
    views.index={offset,count:ix.length,size:1};blocks.push(Buffer.from(Uint16Array.from(ix).buffer));
    return {file,normalFile,factor:row.factor,directory:'shallow-contact-fauna',indexType:'uint16',wrapS:row.wrapS,wrapT:row.wrapT,triangles:ix.length/3,views,data:Buffer.concat(blocks).toString('base64')};
  });data[key]={aspect,variants};parts.forEach(p=>p.g.dispose());
  records.push({key,title:meta.name,author:meta.user.displayName,source:meta.viewerUrl,license:meta.license.slug,licenseURL:meta.license.url,sourceSha256:sha(fs.readFileSync(`${root}/${key}/source.glb`)),changes:'Complete source model; UV-preserving simplification and rigid scale/orientation. Blue crab units are source carapace width; octopus units are the full horizontal arm envelope. Source image bytes unmodified. Original material replaced with shared marine response; untextured octopus receives authored muted skin colour and retains original normal map.',limits:'Artist reference without precise taxonomic certification. Blue crab is a coastal sand/grass visitor in this mixed-source demonstration, not a verified local reef population. Octopus is not identified as Octopus cyanea. Original CC BY or CC BY-NC restrictions retained.',originalTriangles:source.originalTriangles,nearTriangles:variants.near.reduce((n,r)=>n+r.triangles,0)});
}
fs.writeFileSync('src/world/shallowContactFaunaData.js',`// Source and licence records: assets/shallow-contact-fauna/provenance.json\nexport default ${JSON.stringify(data)};\n`);
fs.writeFileSync(`${out}/provenance.json`,JSON.stringify({date:'2026-10-12',records,textures:fs.readdirSync(out).filter(f=>/\.(png|jpg)$/.test(f)).map(file=>({file,bytes:fs.statSync(`${out}/${file}`).size,sha256:sha(fs.readFileSync(`${out}/${file}`))}))},null,2));
console.log(records.map(r=>({key:r.key,triangles:r.nearTriangles,license:r.license})));
