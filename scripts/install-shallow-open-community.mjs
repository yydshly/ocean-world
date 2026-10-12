// Sample-only adaptation. Echinopora was rejected by the whole-scene review.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
const evidence='D:/codex/home/visualizations/2026/10/02/01a0fd5a-f501-7b70-8e91-7fa5c43b20bd';
const folder=`${evidence}/shallow-main-community`,output='public/assets/shallow-open-community';
const {MeshoptSimplifier:S}=await import(pathToFileURL(`${evidence}/shallow-sourced-assets/scout-reef/tooling/node_modules/meshoptimizer/meshopt_simplifier.js`));await S.ready;
fs.mkdirSync(output,{recursive:true});const packed={},records=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const key of ['giant-trevally','blacktail-snapper','porites-live']){
  const source=JSON.parse(fs.readFileSync(`${folder}/${key}/model.json`)),meta=JSON.parse(fs.readFileSync(`${folder}/${key}-metadata.json`));
  if(!['cc0','by'].includes(meta.license.slug))throw Error('Unapproved licence');
  const fish=key.includes('trevally')||key.includes('snapper'),parts=[];
  for(const row of source.parts){
    // A separate, explicitly identified calibration mesh is never an animal.
    if((fish&&row.name==='Material.001')||(!fish&&row.name==='GeneratedMat2'))continue;
    const p=row.attributes.position,n=row.attributes.normal,uv=row.attributes.uv,index=[];
    for(let t=0;t<row.index.length;t+=3){
      const ids=row.index.slice(t,t+3),v=ids.map(i=>new THREE.Vector3().fromArray(p,i*3));
      const c=v.reduce((a,b)=>a.add(b),new THREE.Vector3()).multiplyScalar(1/3);
      // Fixed whole-colony crop, published in provenance. It excludes survey
      // context; no new branches, texture painting or cavity filling occurs.
      if(key==='porites-live'&&(c.x*c.x/.32**2+(c.z-.10)**2/.31**2>1||c.y<-.13))continue;
      if(key==='echinopora'&&((c.x-.015)**2/.24**2+(c.y+.08)**2/.21**2>1))continue;
      index.push(...ids);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);
    if(fish)g.rotateY(Math.PI);if(key==='echinopora')g.rotateX(-Math.PI/2);
    const ext=row.image.split('.').at(-1),file=`${key}-${row.material}.${ext}`;fs.copyFileSync(row.image,`${output}/${file}`);
    parts.push({g,file,material:row.material,wrapS:row.wrapS??'repeat',wrapT:row.wrapT??'repeat'});
  }
  const box=new THREE.Box3(),v=new THREE.Vector3();
  for(const {g}of parts)for(const i of g.index.array)box.expandByPoint(v.fromBufferAttribute(g.attributes.position,i));
  const center=box.getCenter(new THREE.Vector3()),height=box.max.y-box.min.y;let radius=0;
  for(const {g}of parts)for(const i of g.index.array){v.fromBufferAttribute(g.attributes.position,i);radius=Math.max(radius,Math.hypot(v.x-center.x,v.z-center.z));}
  const length=box.max.x-box.min.x,aspect=height/(radius/.489);
  for(const {g}of parts){
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++)p.setXYZ(i,(p.getX(i)-center.x)*(fish?1/length:.489/radius),(p.getY(i)-(fish?center.y:box.min.y))/(fish?length:height),(p.getZ(i)-center.z)*(fish?1/length:.489/radius));
    if(!fish)g.computeVertexNormals();
  }
  const variants={};
  for(const detail of fish?['near']:['near','distant']){
    const rows=[];
    for(const part of parts){
      const {g}=part,budget=fish?g.index.count:Math.min(g.index.count,(detail==='near'?3600:900)*3);
      const [idx,error]=S.simplifyWithAttributes(Uint32Array.from(g.index.array),g.attributes.position.array,3,g.attributes.uv.array,2,[2,2],null,budget,1,['Permissive']);
      const [remap,count]=S.compactMesh(idx),views={},blocks=[];let offset=0;
      for(const [name,a]of Object.entries(g.attributes)){
        const values=new Float32Array(count*a.itemSize);for(let old=0;old<remap.length;old++)if(remap[old]<count)values.set(a.array.subarray(old*a.itemSize,(old+1)*a.itemSize),remap[old]*a.itemSize);
        views[name]={offset,count,size:a.itemSize};const b=Buffer.from(values.buffer);blocks.push(b);offset+=b.length;
      }
      views.index={offset,count:idx.length,size:1};blocks.push(Buffer.from(Uint16Array.from(idx).buffer));
      rows.push({file:part.file,wrapS:part.wrapS,wrapT:part.wrapT,views,data:Buffer.concat(blocks).toString('base64'),triangles:idx.length/3,error});
    }
    variants[detail]=rows;
  }
  packed[key]={kind:fish?'fish':'coral',aspect,variants};
  records.push({key,title:meta.name,author:meta.user.displayName,authorURL:meta.user.profileUrl,source:meta.viewerUrl,uid:meta.uid,
    license:meta.license.slug==='cc0'?'CC0-1.0':'CC-BY-4.0',licenseURL:meta.license.url,
    downloadMirror:'https://huggingface.co/datasets/allenai/objaverse',sourceSHA256:hash(fs.readFileSync(`${folder}/${key}.glb`)),metadataSHA256:hash(fs.readFileSync(`${folder}/${key}-metadata.json`)),
    normalizedBounds:[box.min.toArray(),box.max.toArray()],sourceAspect:aspect,displayDimensions:'Authored metre dimensions; source relative proportions preserved, not a survey measurement.',
    crop:fish?'Remove separate Material.001 calibration cube.':key==='echinopora'?'Remove GeneratedMat2; retain triangle centroids in source-normalized XY ellipse centre(.015,-.08), radii(.24,.21); rotate X -90 degrees.':'Retain triangle centroids in source-normalized XZ ellipse centre(0,.10), radii(.32,.31), Y >= -.13.',
    limits:fish?'Photogrammetric specimen, original photo colours (including capture shading); bounded project-authored swim, no source rig.':'Field photogrammetry with fixed colony crop; open basal boundary remains, no repaired or invented surface.',
    derivatives:Object.fromEntries(Object.entries(variants).map(([level,rows])=>[level,rows.map(({data,views,...r})=>r)]))});
  for(const {g}of parts)g.dispose();
}
const dataFile='src/world/shallowOpenCommunityData.js';
fs.writeFileSync(dataFile,`// Three public source models; licences and alterations in assets/shallow-open-community/provenance.json.\nexport default ${JSON.stringify(packed)};\n`);
const textures=[...new Set(Object.values(packed).flatMap(r=>r.variants.near.map(p=>p.file)))].map(file=>({file,bytes:fs.statSync(`${output}/${file}`).size,sha256:hash(fs.readFileSync(`${output}/${file}`))}));
fs.writeFileSync(`${output}/provenance.json`,JSON.stringify({version:1,scope:'75-second local shallow sample',records,textures,generatedData:{file:dataFile,sha256:hash(fs.readFileSync(dataFile))}},null,2));
console.log(JSON.stringify({assets:records.map(r=>({key:r.key,license:r.license,detail:r.derivatives})),textureBytes:textures.reduce((a,b)=>a+b.bytes,0)}));
