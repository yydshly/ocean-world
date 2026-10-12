import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
const root='output/validation/shallow-natural-habitat/candidates',out='public/assets/shallow-natural-habitat';
const {MeshoptSimplifier:S}=await import(pathToFileURL('D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js'));await S.ready;
fs.mkdirSync(out,{recursive:true});
const packed={},records=[],sha=b=>createHash('sha256').update(b).digest('hex');
for(const key of ['coast_land_rocks_02',...(process.argv.includes('--evaluate-specimen')&&fs.existsSync(`${root}/bigeye-trevally/model.json`)?['bigeye-trevally']:[])]){
  const source=JSON.parse(fs.readFileSync(`${root}/${key}/model.json`)),rock=key==='coast_land_rocks_02';
  const parts=source.parts.filter(r=>r.image&&(rock||r.material!==0)).map(row=>{
    const g=new THREE.BufferGeometry();for(const [name,values]of Object.entries(row.attributes))g.setAttribute(name,new THREE.Float32BufferAttribute(values,name==='uv'?2:3));g.setIndex(row.index);
    if(rock){g.rotateY(Math.PI/2);g.translate(0,-source.sourceBounds[0][1]/source.normalization.extent+source.normalization.center[1]/source.normalization.extent-.006,0);}
    const file=`${key}-${row.material}.${row.image.split('.').at(-1)}`;fs.copyFileSync(row.image,`${out}/${file}`);return {g,file,row};
  });
  if(!rock){
    const box=new THREE.Box3();parts.forEach(({g})=>{g.computeBoundingBox();box.union(g.boundingBox);});
    const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    // The supplied specimen faces -X; a rigid 180-degree turn retains its full shape.
    for(const {g}of parts){g.translate(-center.x,-center.y,-center.z);g.scale(1/size.x,1/size.x,1/size.x);g.rotateY(Math.PI);}
  }
  const variants={};for(const detail of ['near','distant'])variants[detail]=parts.map(({g,file,row})=>{
    const ix=detail==='near'?Uint32Array.from(g.index.array):S.simplifyWithAttributes(Uint32Array.from(g.index.array),g.attributes.position.array,3,g.attributes.uv.array,2,[2,2],null,Math.floor(g.index.count*.18/3)*3,.025,['Permissive'])[0];
    const [remap,count]=S.compactMesh(ix),views={},blocks=[];let offset=0;
    for(const [name,a]of Object.entries(g.attributes)){const array=new Float32Array(count*a.itemSize);for(let i=0;i<remap.length;i++)if(remap[i]<count)array.set(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize),remap[i]*a.itemSize);views[name]={offset,count,size:a.itemSize};const bytes=Buffer.from(array.buffer);blocks.push(bytes);offset+=bytes.length;}
    const indexType=count>65535?'uint32':'uint16';views.index={offset,count:ix.length,size:1};blocks.push(Buffer.from((indexType==='uint32'?Uint32Array.from(ix):Uint16Array.from(ix)).buffer));
    return {file,indexType,wrapS:row.wrapS,wrapT:row.wrapT,triangles:ix.length/3,views,data:Buffer.concat(blocks).toString('base64')};
  });packed[key]={variants};
  records.push(rock?{key,title:'Coast Land Rocks 02',authors:['Rob Tuytel','Rico Cilliers'],source:'https://polyhaven.com/a/coast_land_rocks_02',license:'CC0-1.0',changes:'Whole coastal formation simplified with original UV and original unmodified albedo. Rigid orientation and uniform scale; lower photographed ground is buried. No artificial contact platforms.',limits:'Coastal geology used as submerged habitat substrate; not a measured tropical reef scan.'}:{key,...JSON.parse(fs.readFileSync(`${root}/${key}/metadata.json`)),changes:'Whole specimen, simplified and rigidly oriented; authored bounded swim deformation. Source image unchanged.',limits:'Specimen photogrammetry, not an in-water scan or biomechanical animation.'});
}
fs.writeFileSync('src/world/shallowNaturalHabitatData.js',`// Asset licences and sources: assets/shallow-natural-habitat/provenance.json\nexport default ${JSON.stringify(packed)};\n`);
fs.writeFileSync(`${out}/provenance.json`,JSON.stringify({date:'2026-10-12',records:records.map(r=>{const {thumbnails,archives,...keep}=r;return keep;}),textures:fs.readdirSync(out).filter(f=>/\.(png|jpg)$/.test(f)).map(file=>({file,sha256:sha(fs.readFileSync(`${out}/${file}`))}))},null,2));
console.log(Object.fromEntries(Object.entries(packed).map(([key,v])=>[key,Object.fromEntries(Object.entries(v.variants).map(([d,rows])=>[d,rows.reduce((s,r)=>s+r.triangles,0)]))])));
