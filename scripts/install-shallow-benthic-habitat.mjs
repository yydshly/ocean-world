import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
const folder='output/validation/shallow-benthic-habitat/candidates',output='public/assets/shallow-benthic-habitat';
const {MeshoptSimplifier:S}=await import(pathToFileURL('D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js'));await S.ready;
fs.mkdirSync(output,{recursive:true});const packed={},records=[],hash=b=>createHash('sha256').update(b).digest('hex');
for(const key of ['reef-lettuce','reef-lobed','sponge-stove']){
 const source=JSON.parse(fs.readFileSync(`${folder}/${key}/model.json`)),meta=JSON.parse(fs.readFileSync(`${folder}/${key}-metadata.json`));
 if(meta.license?.slug!=='by')throw Error('Missing redistributable CC BY source');
 const box=new THREE.Box3(),parts=source.parts.map(row=>{const g=new THREE.BufferGeometry();for(const [n,v]of Object.entries(row.attributes))g.setAttribute(n,new THREE.Float32BufferAttribute(v,n==='uv'?2:3));g.setIndex(row.index);g.computeBoundingBox();box.union(g.boundingBox);return {g,row};});
 const center=box.getCenter(new THREE.Vector3()),height=box.max.y-box.min.y;let r=0;
 for(const {g}of parts){const p=g.attributes.position;for(let i=0;i<p.count;i++)r=Math.max(r,Math.hypot(p.getX(i)-center.x,p.getZ(i)-center.z));}
 const width=key==='sponge-stove'?height:r/.489;
 for(const {g}of parts){const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setXYZ(i,(p.getX(i)-center.x)/width,(p.getY(i)-box.min.y)/height,(p.getZ(i)-center.z)/width);g.computeVertexNormals();}
 const variants={};
 for(const detail of key==='sponge-stove'?['near']:['near','distant','cover'])variants[detail]=parts.map(({g,row})=>{
  const ix=detail==='near'?Uint32Array.from(g.index.array):S.simplifyWithAttributes(Uint32Array.from(g.index.array),g.attributes.position.array,3,g.attributes.uv.array,2,[2,2],null,detail==='cover'?2400:Math.floor(g.index.count*.18/3)*3,.04,['Permissive'])[0];
  const [remap,count]=S.compactMesh(ix),views={},blocks=[];let offset=0;
  for(const [name,a]of Object.entries(g.attributes)){const array=new Float32Array(count*a.itemSize);for(let i=0;i<remap.length;i++)if(remap[i]<count)array.set(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize),remap[i]*a.itemSize);views[name]={offset,count,size:a.itemSize};const b=Buffer.from(array.buffer);blocks.push(b);offset+=b.length;}
  const array=Uint16Array.from(ix);views.index={offset,count:ix.length,size:1};blocks.push(Buffer.from(array.buffer));
  const file=`${key}-${row.material}.jpg`;fs.copyFileSync(row.image,`${output}/${file}`);
  return {file,views,data:Buffer.concat(blocks).toString('base64'),indexType:'uint16',triangles:ix.length/3,wrapS:row.wrapS,wrapT:row.wrapT};
 });
 packed[key]={aspect:height/width,variants};records.push({key,title:meta.name,author:meta.user.displayName,source:meta.viewerUrl,uid:meta.uid,license:meta.license,description:meta.description,originalSHA256:hash(fs.readFileSync(`${folder}/${key}.glb`)),changes:key==='sponge-stove'?'Selected the complete main tube cluster using one fixed XYZ region; removed surrounding ledge. Decimated to 6499 triangles, normalized all axes equally to height=1. Open basal cuts; no invented cap or tube repair. Original image bytes retained.':'Complete colony mesh decimated and normalized. Original colour photograph bytes unchanged. Low reef layer conforms to actual supporting triangles. Authored display widths and placements, not survey dimensions.',limitations:'Roatan Caribbean sources used as explicitly cross-region visual reference in this authored sample; not a reconstruction of one Indo-Pacific field site. Lobed source includes one diseased/exposed area described by its author.',triangles:Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,v.reduce((s,r)=>s+r.triangles,0)]))});
 parts.forEach(({g})=>g.dispose());
}
const file='src/world/shallowBenthicCoralData.js';fs.writeFileSync(file,`// Source attribution: assets/shallow-benthic-habitat/provenance.json\nexport default ${JSON.stringify(packed)};\n`);
fs.writeFileSync(`${output}/provenance.json`,JSON.stringify({version:1,date:'2026-10-11',records,generatedData:{file,sha256:hash(fs.readFileSync(file))},textures:fs.readdirSync(output).filter(f=>f.endsWith('.jpg')).map(file=>({file,sha256:hash(fs.readFileSync(`${output}/${file}`))})),redistribution:'CC BY 4.0 for these three derived colony meshes and original images. Preserve source, author, licence and adaptation notices. Other existing assets retain their own licences.',authoredAnimals:'The new clam and crab family and cephalopod v2 are project-authored approximations, not sourced scans.'},null,2));console.log(JSON.stringify(records.map(r=>({key:r.key,triangles:r.triangles}))));
