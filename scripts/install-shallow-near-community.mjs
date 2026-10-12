// Whole-source asset adaptation. Images remain byte-identical to the source GLB.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
const folder='output/validation/shallow-near-community/candidates',output='public/assets/shallow-near-community';
const {MeshoptSimplifier:S}=await import(pathToFileURL('D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js'));await S.ready;
fs.mkdirSync(output,{recursive:true});const packed={},records=[],hash=b=>createHash('sha256').update(b).digest('hex');
for(const key of ['fish','foliose',...(fs.existsSync(`${folder}/reefscan/model.json`)?['reefscan']:[])]){
  const source=JSON.parse(fs.readFileSync(`${folder}/${key}/model.json`)),meta=JSON.parse(fs.readFileSync(`${folder}/${key}-metadata.json`,'utf8').replace(/^\uFEFF/,''));
  if(!['by','by-nc-sa'].includes(meta.license.slug))throw Error('Unsupported source license');
  const fish=key==='fish',box=new THREE.Box3(),parts=source.parts.filter(r=>r.image).map(row=>{
    const g=new THREE.BufferGeometry();for(const [name,values]of Object.entries(row.attributes))g.setAttribute(name,new THREE.Float32BufferAttribute(values,name==='uv'?2:3));g.setIndex(row.index);g.computeBoundingBox();box.union(g.boundingBox);
    const file=`${key}-${row.material}.${row.image.split('.').at(-1)}`;fs.copyFileSync(row.image,`${output}/${file}`);return {g,file,row};
  });
  const centre=box.getCenter(new THREE.Vector3()),height=box.max.y-box.min.y,length=box.max.x-box.min.x;let radius=0;
  for(const {g}of parts){const p=g.attributes.position;for(let i=0;i<p.count;i++)radius=Math.max(radius,Math.hypot(p.getX(i)-centre.x,p.getZ(i)-centre.z));}
  const width=radius/.489,aspect=height/width,variants={};
  for(const {g}of parts){const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setXYZ(i,(p.getX(i)-centre.x)/(fish?length:width),(p.getY(i)-(fish?centre.y:box.min.y))/(fish?length:height),(p.getZ(i)-centre.z)/(fish?length:width));if(!fish)g.computeVertexNormals();}
  for(const detail of fish||key==='reefscan'?['near']:['near','distant']){
    variants[detail]=parts.map(({g,file,row})=>{
      const idx=detail==='near'?Uint32Array.from(g.index.array):S.simplifyWithAttributes(Uint32Array.from(g.index.array),g.attributes.position.array,3,g.attributes.uv.array,2,[2,2],null,Math.max(120,Math.floor(g.index.count*.2)),.025,['Permissive'])[0];
      const [remap,count]=S.compactMesh(idx),views={},blocks=[];let offset=0;
      for(const [name,a]of Object.entries(g.attributes)){const array=new Float32Array(count*a.itemSize);for(let i=0;i<remap.length;i++)if(remap[i]<count)array.set(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize),remap[i]*a.itemSize);views[name]={offset,count,size:a.itemSize};const bytes=Buffer.from(array.buffer);blocks.push(bytes);offset+=bytes.length;}
      const indexType=count>65535?'uint32':'uint16',array=indexType==='uint32'?Uint32Array.from(idx):Uint16Array.from(idx);views.index={offset,count:idx.length,size:1};blocks.push(Buffer.from(array.buffer));
      return {file,indexType,wrapS:row.wrapS,wrapT:row.wrapT,triangles:idx.length/3,views,data:Buffer.concat(blocks).toString('base64')};
    });
  }
  packed[key]={aspect,kind:fish?'unclassified-source-fish':'whole-field-reef-colony',variants};
  records.push({key,title:meta.name,author:meta.user.displayName,source:meta.viewerUrl,uid:meta.uid,license:meta.license,sourceSHA256:hash(fs.readFileSync(`${folder}/${key==='reefscan'?'reefscan-complete':key}.glb`)),changes:'Retain complete source and original albedo; simplify mesh, normalize axes/width; runtime dimensions authored, not survey measurements.',limits:fish?'Author supplies no taxonomic identification. Shown as an unidentified reef-fish study, not labelled as the former blacktail snapper. Project bounded swim deformation, not a source animation rig.':'Source field photogrammetry; lighting and missing scan surfaces remain. No fabricated tissue, no per-branch repair.',triangles:Object.fromEntries(Object.entries(variants).map(([d,rows])=>[d,rows.reduce((n,r)=>n+r.triangles,0)]))});
  parts.forEach(p=>p.g.dispose());
}
const file='src/world/shallowNearCommunityData.js';fs.writeFileSync(file,`// Original sources, attribution and derivative licence: assets/shallow-near-community/provenance.json\nexport default ${JSON.stringify(packed)};\n`);
fs.writeFileSync(`${output}/provenance.json`,JSON.stringify({version:1,date:'2026-10-11',scope:'Finite local shallow sample',records,generatedData:{file,sha256:hash(fs.readFileSync(file))},textures:[...new Set(Object.values(packed).flatMap(a=>a.variants.near.map(r=>r.file)))].map(file=>({file,sha256:hash(fs.readFileSync(`${output}/${file}`))})),redistribution:'Preserve attribution, source and licence links. Foliose derivative remains CC BY-NC-SA 4.0; non-commercial, share-alike for this asset. Fish and reefscan CC BY 4.0. Existing assets retain their own licences.'},null,2));
console.log(JSON.stringify(records.map(r=>({key:r.key,license:r.license.slug,triangles:r.triangles}))));
