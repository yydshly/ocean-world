import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { createLivingShallowSeascapePlans } from '../src/livingShallowSeascape.js';
import { createLivingCoastalSeascapePlans, coastalSeascapeFacies } from '../src/livingCoastalSeascape.js';
import { createCoastalSeascapeMotion, sampleCoastalSeascapeMotion } from '../src/coastalSeascapeMotion.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Literal before-dispatch HEAD outputs. CPU buffers and shader declarations
// do not constitute browser/GPU appearance or complete foliage visibility.
const original = {"version":1,"capturedAt":"2026-10-08T03:20:02.020Z","head":"d88b263495278cb92ac373ddfd5394bf528a199e","scope":"Pre-v7 full native v6 CPU buffers, node/instance matrices, material/texture and shader declarations; no GPU acceptance.","sourceHashes":{"src/world/livingShallowsAssets.js":"1a7867e540bb74157c549a0b6004546e0cc4151af6748804334fd90703f31019","src/world/livingMeadowEnvironment.js":"2549d6249a6933e54369ec9227f8790028e77cdfa73496d288b2209327ac8787","src/world/livingShallowsCoralMaterial.js":"99b6757abd2a19c16710753195ba2a9d7f4335fab407463c9365ed2ff0a761bb","src/world/livingReefSubstrate.js":"e6139ca4ab6e8bd4f15273df83968f71e72ef1238b49323bb3e0a9eaa1ef30d2","src/world/oceanRockFooting.js":"3f13ded85eeece52dd6ce9a9c882c8623e0d0e19c85ebde590b8a838ab0dc13b","src/oceanRockShape.js":"d312a05672d9e303b9f9cc86d9b8d4818e6e9bb9257f63475c8a1fa3d6a21792","src/livingShallowSeascape.js":"67bc701f098708a64a59372fb7067198b19718700f01e29bd7115957584a5049","src/world/OceanChunks.js":"dcc648350856dcd9712a53a3715f8a961e3e4d5ad8c9a302e0377c1955343919"},"frames":[{"window":{"cx":97,"cz":2},"input":{"timeSec":0,"currentMps":0.15},"owners":[{"id":"96,2","output":{"geometry":"50c0e0a099fb6485d86906cca3ad6c3351a71022a82f4abd021831aca5ba14eb","nodeMatrices":"ddf1c0e331335167052a97a093d7003bb3757df16070448b2e7488d82232e078","materialAndShaderDeclarations":"21a07d3c0640114893a39eab2c359e9741cd62aa657bb45d96ce40c6a6dcf8af","meshes":10,"vertices":11625,"triangles":17199}},{"id":"97,2","output":{"geometry":"6e30750775835f340ee10ac523c40d822c9fd92c372c3a00ded1636fef902d59","nodeMatrices":"8b0fa74d1129f9a11ebb6bfe2846aa284bae94247138c909c9de23274a33bf2b","materialAndShaderDeclarations":"f1afcadcca9f5e78d8eb07194a9d5afd17f028e77bcb61e4839c6457727f0dce","meshes":9,"vertices":10057,"triangles":16143}},{"id":"98,2","output":{"geometry":"9b9e92103116d76007245ed3803e6e2f30273fb1ad506cda56d677b46768c53a","nodeMatrices":"b84982ad44f7ce950c8ce07ee886559ae0a61d17ab5eb331a7fd0e6a3a861361","materialAndShaderDeclarations":"500457625b86d2f331aa8db08b72f5e3a31f2ca980f8bf34f00ac430c9e6c65e","meshes":8,"vertices":8468,"triangles":13798}},{"id":"96,3","output":{"geometry":"027c3aff33ea751881761f379a8c35c30457a3ce4f7a574eb8147fd804cd743a","nodeMatrices":"7d2969edab8a77ab335ec7bb8541236b535b98278579a3a91b2844ed9fe4d8b9","materialAndShaderDeclarations":"21a07d3c0640114893a39eab2c359e9741cd62aa657bb45d96ce40c6a6dcf8af","meshes":10,"vertices":10065,"triangles":16423}},{"id":"97,3","output":{"geometry":"8c669b59565d9762769d118f1fee545c6e247894686cb09a0fcb4866b8d5ff53","nodeMatrices":"131e95a05a8193b22d47fb8e90ecf14716b568a597e66cf53f4845b68d434373","materialAndShaderDeclarations":"21a07d3c0640114893a39eab2c359e9741cd62aa657bb45d96ce40c6a6dcf8af","meshes":10,"vertices":10757,"triangles":16739}},{"id":"98,3","output":{"geometry":"62e68bbf7ed0305f50e84b533cba1275e2941f129fdf8ca74b6a34d052a1497e","nodeMatrices":"18f25d4322fc4aef2a39c97e794704f9949d4a97d9e969e73d0950f33eb5a767","materialAndShaderDeclarations":"8a54eb117e1bf7ae18a12c7b5446a4923c10fc1ad87d3b6c09f0bb22eac50896","meshes":9,"vertices":9485,"triangles":15431}}],"kit":{"geometry":"b622a7ffc64231df0263b4c60c6d85314213546b1b973f60a46d6d91f14e349a","nodeMatrices":"fc5a2099540b7aa6f994c92d38f679443861a32f321fd0526eeb419acad89394","materialAndShaderDeclarations":"5ea88248d997e0e206652b9a4fa1f67141650bc3ded3cc3d41e6d25842293014","meshes":80,"vertices":88937,"triangles":139934},"shaderDeclarations":{"rock":"edd0181fa1860920c6c0c9776ca5650e89d79a70c1d664a4f463bfbe14e854d4","coral":"4148efb2af2e3b7766e56ec9d3c3ab8dd3955ad24fa2ec0b7a0566c13bd575a4","seagrass":"0c90d42678f27c45e33f471ec831112cc11f9b73ce095422e86e2b6be40f0269","rubble":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","algae":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","driftwood":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","bottle":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e"},"displayClock":{"timeSec":0,"currentMps":0.15}},{"window":{"cx":100,"cz":2},"input":{"timeSec":0,"currentMps":0.15},"owners":[{"id":"99,2","output":{"geometry":"013696f8bbfa0ae3a6a0c025e2c0bd53f9aaa774de234d27b70b66e88f496b52","nodeMatrices":"19f0944f2a3b57312882ee50dc5fea25d4dd50f62897bb46f29d34051dcaa577","materialAndShaderDeclarations":"07ef0afd654c9c310f99a61482b466e34f0e82787830e3d6af1ba229e9ba8301","meshes":9,"vertices":10134,"triangles":15945}},{"id":"100,2","output":{"geometry":"328ea7f4809a1cc83958daf9e11c851959f5c8177c4ce286fbba8cc178a9e329","nodeMatrices":"7e63be97ad0f7e48c134f6efba9675a7f653fad81cd7c94152e047ce1a0dc474","materialAndShaderDeclarations":"21a07d3c0640114893a39eab2c359e9741cd62aa657bb45d96ce40c6a6dcf8af","meshes":10,"vertices":10669,"triangles":16667}},{"id":"101,2","output":{"geometry":"7718d04d18fadc8f0a15f5216adbb42670aca25f5f91e831ef853747efdf0dd3","nodeMatrices":"7254fcd0c81682e5a9911588381a00612be62dd28e16a6d92c147b819e30989a","materialAndShaderDeclarations":"07ef0afd654c9c310f99a61482b466e34f0e82787830e3d6af1ba229e9ba8301","meshes":9,"vertices":10086,"triangles":15929}},{"id":"99,3","output":{"geometry":"692fd4e71b37be0ef14fae60dbc026f83340d8b974b10b998d5a2316480e94ed","nodeMatrices":"4600980a0f16b9726335a777af17af23859520a3cbedde856bef09f008a6ca5e","materialAndShaderDeclarations":"41a7fb502a3e954bbf7949f0d8b489467f1759aaf1cd8919ea6eaa94143e6932","meshes":8,"vertices":9856,"triangles":14728}},{"id":"100,3","output":{"geometry":"136f1ab5ed15e402d27fa590f8d56171dfc2c1500b85bc9679e94cc9a8930172","nodeMatrices":"aad186c53cf8817a8a908c26efadcb4ab01fc09277c051eb057cb01f59aaade3","materialAndShaderDeclarations":"21a07d3c0640114893a39eab2c359e9741cd62aa657bb45d96ce40c6a6dcf8af","meshes":10,"vertices":10955,"triangles":16805}},{"id":"101,3","output":{"geometry":"57c509ab586298d568764d74659f59e50d073825ff878dcca5e275d72b7adc38","nodeMatrices":"770bad7a341ebbefb598fcf0f189f04018f3c3aa679cee94d8cb59aee5dec191","materialAndShaderDeclarations":"21a07d3c0640114893a39eab2c359e9741cd62aa657bb45d96ce40c6a6dcf8af","meshes":10,"vertices":11609,"triangles":17151}}],"kit":{"geometry":"8e3a05eaea62c0ccdb34d2a1fcb1a11a0bf4fafcbbb0f35335e82f679a9c205a","nodeMatrices":"08e893a80a681116cf86130f8f98a0765ae3a721c60206f53c19d17178027318","materialAndShaderDeclarations":"28960a277bb1a8402e213eb2b8b5fa86461b1ff16b0c59960bf64f32116c2d1f","meshes":83,"vertices":93025,"triangles":143414},"shaderDeclarations":{"rock":"edd0181fa1860920c6c0c9776ca5650e89d79a70c1d664a4f463bfbe14e854d4","coral":"4148efb2af2e3b7766e56ec9d3c3ab8dd3955ad24fa2ec0b7a0566c13bd575a4","seagrass":"0c90d42678f27c45e33f471ec831112cc11f9b73ce095422e86e2b6be40f0269","rubble":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","algae":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","driftwood":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","bottle":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e"},"displayClock":{"timeSec":0,"currentMps":0.15}}],"planHash":"19bfd56c8609f43e7f52b9c5fe74cc097c11eb1dece513980801df4ff323a524","inputs":[{"timeSec":0,"currentMps":0.15}],"sourceOwners":["100,2","100,3","101,2","101,3","96,2","96,3","97,2","97,3","98,2","98,3","99,2","99,3"],"sourceOwnerCount":12,"frameCount":2,"uniqueOwnerOutputs":12,"prototypeGeometryHashes":{"seagrass":"ec6e57da1014ededbf8f5f5efdd387e1d8d950c3d503a246e3f83c1ada257bdc","rubble":"b1c826d5a967610183a7f966fc9f8b938b553633daa32d260e294135ef13df8a","coral-branching":"da731282ba532e6b2b075b896bce2108af371453b2a39dfa68c539091f944a87","coral-table":"d304b9549f82f8461f30829b85dbbc7715ced4580c40d8f00696ef97f965c2c6","coral-fan":"e14e3d883283c918c02a5f7d584e54f0dc2e83b1e7995a6c3b77d6cb01cf16e6","driftwood":"2e7b706975bab5195596df74ca9b5b2e34f5b6a360cc6418a8eb50c284b2c882","bottle":"fd64212ba0c671546dc42986cb2fb24f8a4754657c4e83f99a00ffe15851049a","rock-natural-a":"1705f7dc9f2c79b621519c1c7083f7de0203fc4d46db5ae1b816f916b84fbf1d","rock-natural-b":"b2f8ae4a3222da5281f90893cd9409efaaa85b2afbdd9a6e906a9f7499eb4899","rock-natural-c":"b31258eff76b48932ceeb18ba4e5546133e8e63957c4e8f3b1e195345f656606"}};
function stable(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') return typeof value === 'function' ? value.toString() : value;
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name, bytes: sha(Buffer.from(value.buffer, value.byteOffset, value.byteLength)), length: value.length };
  if (seen.has(value)) return 'shared-reference'; seen.add(value);
  if (value.isTexture) return { type: value.type, mapping: value.mapping, wrapS: value.wrapS, wrapT: value.wrapT,
    magFilter: value.magFilter, minFilter: value.minFilter, anisotropy: value.anisotropy, format: value.format,
    colorSpace: value.colorSpace, flipY: value.flipY, generateMipmaps: value.generateMipmaps,
    premultiplyAlpha: value.premultiplyAlpha, unpackAlignment: value.unpackAlignment,
    offset: value.offset.toArray(), repeat: value.repeat.toArray(), center: value.center.toArray(), rotation: value.rotation,
    image: stable(value.image, seen), mipmaps: stable(value.mipmaps, seen) };
  if (value.isColor || value.isVector2 || value.isVector3 || value.isVector4 || value.isMatrix3 || value.isMatrix4 || value.isQuaternion || value.isEuler) return value.toArray();
  if (Array.isArray(value)) return value.map(v => stable(v, new Set(seen)));
  const result = {}; for (const key of Object.keys(value).sort()) if (!['uuid', 'id', '_listeners', 'parent'].includes(key)) result[key] = stable(value[key], new Set(seen));
  return result;
}
function completeHashes(root) {
  root.updateMatrixWorld(true);
  const geometry = createHash('sha256'), nodes = createHash('sha256'), materials = createHash('sha256');
  let meshes = 0, vertices = 0, triangles = 0;
  root.traverse(node => {
    nodes.update(JSON.stringify({ name: node.name, type: node.type, matrix: node.matrix.toArray(), worldMatrix: node.matrixWorld.toArray(),
      visible: node.visible, castShadow: node.castShadow, receiveShadow: node.receiveShadow,
      renderOrder: node.renderOrder, frustumCulled: node.frustumCulled, count: node.count,
      instanceMatrix: stable(node.instanceMatrix), instanceColor: stable(node.instanceColor) }));
    if (!node.isMesh) return; meshes++; const g = node.geometry;
    vertices += g.attributes.position.count; triangles += (g.index?.count ?? g.attributes.position.count) / 3;
    geometry.update(JSON.stringify({ groups: g.groups, drawRange: g.drawRange, morphTargetsRelative: g.morphTargetsRelative }));
    for (const [name, attribute] of Object.entries(g.attributes).sort()) { geometry.update(name); geometry.update(JSON.stringify({
      itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized, type: attribute.array.constructor.name, gpuType: attribute.gpuType }));
      geometry.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)); }
    if (g.index) { geometry.update(JSON.stringify({ type: g.index.array.constructor.name, itemSize: g.index.itemSize, normalized: g.index.normalized, count: g.index.count }));
      geometry.update(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength)); }
    for (const material of [].concat(node.material)) materials.update(JSON.stringify({ properties: stable(material),
      onBeforeCompile: material.onBeforeCompile.toString(), customProgramCacheKey: material.customProgramCacheKey(),
      vertexShader: material.vertexShader ?? null, fragmentShader: material.fragmentShader ?? null, uniforms: stable(material.uniforms ?? null) }));
  });
  return { geometry: geometry.digest('hex'), nodeMatrices: nodes.digest('hex'), materialAndShaderDeclarations: materials.digest('hex'), meshes, vertices, triangles };
}

const SEED='living-shallows-v1|string:42';
function fixture(t){const ocean=new OceanChunks(SEED,{livingGeology:true});t.after(()=>{ocean.dispose();ocean.generator.clearCache?.();});
  const plans=createLivingCoastalSeascapePlans(ocean.generator.baseGenerator,150,4);assert.equal(plans.length,12);return{ocean,plans,generator:ocean.generator};}
function publish(ocean,plans,p){const cx=Math.floor(p.x/64),cz=Math.floor(p.z/64),ids=new Set(plans.map(p=>p.id)),extra=[];
  for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++)if(!ids.has(x+','+z))extra.push(x+','+z);
  ocean.generator.replaceRidgeOwners(plans,extra);ocean.update(p);assert.equal(ocean.stats.activeChunks,9);assert.ok(ocean.stats.ridgeReadyOwners<=25);
  assert.ok(ocean.stats.drawCalls<=ocean.stats.maxDrawCalls);assert.equal(ocean.stats.prototypeGeometries,10);assert.equal(ocean.stats.prototypeMaterials,7);}
function shaders(ocean){return Object.fromEntries(Object.entries(ocean._materials).map(([kind,m])=>{const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>'};m.onBeforeCompile(shader);return[kind,sha(JSON.stringify(stable(shader)))];}));}
function rowsFor(record,mesh){const kind=mesh.userData.landscapeKind;return record.sourceChunk.elements.filter(e=>e.kind===kind&&
  (kind!=='rock'||mesh.name==='generated-rock-'+e.profile)&&(kind!=='coral'||mesh.userData.morphotype===e.morphotype));}
function geomHash(g){return sha(JSON.stringify({attributes:stable(g.attributes),index:stable(g.index)}));}

test('pre-v7 complete twelve-owner v6 geometry instances material shaders and original kits remain literal exact',t=>{
  for(const[path,hash]of Object.entries(original.sourceHashes))if(path!=='src/world/OceanChunks.js')assert.equal(sha(readFileSync(new URL('../'+path,import.meta.url))),hash,path);
  const ocean=new OceanChunks(SEED,{livingGeology:true});t.after(()=>ocean.dispose());const plans=createLivingShallowSeascapePlans(ocean.generator.baseGenerator,96,2);
  assert.equal(sha(JSON.stringify(plans)),original.planHash);let checked=0;
  for(const frame of original.frames){const p={x:frame.window.cx*64+32,z:frame.window.cz*64+32};publish(ocean,plans,p);ocean.setEnvironment({currentMps:frame.input.currentMps},frame.input.timeSec);ocean.root.updateMatrixWorld(true);
    for(const {id,output}of frame.owners){assert.deepEqual(completeHashes(ocean._chunks.get(id).group),output,id);checked++;}
    assert.deepEqual(shaders(ocean),frame.shaderDeclarations);assert.deepEqual(completeHashes(ocean.root),frame.kit);
  }
  assert.equal(checked,12);assert.equal(original.sourceOwnerCount,12);for(const[id,hash]of Object.entries(original.prototypeGeometryHashes))assert.equal(geomHash(ocean._geometries[id]),hash,id);
});

test('candidate is private and the published v7 window draws only actual persistent source instances with fixed roots',t=>{
  const{ocean,plans,generator}=fixture(t),p=plans[0].group.routePath[0];ocean.update(p);assert.equal(ocean.stats.activeChunks,0);
  generator.withCoastalSeascapePlans(plans,()=>{for(const plan of plans){assert.equal(generator.isRidgeOwnerReady(plan.id),false);ocean._load(plan.cx,plan.cz);}assert.equal(ocean.stats.activeChunks,0);});
  publish(ocean,plans,p);let checked=0,roots=0;
  for(const view of[p,sampleCoastalSeascapeMotion(createCoastalSeascapeMotion(plans[0]),140).position]){publish(ocean,plans,view);for(const record of ocean._chunks.values()){if(record.ridgePlan?.version!==7)continue;
    assert.equal(record.sourceChunk.ridgePlan,record.ridgePlan);assert.equal(record.sourceChunk.elements,record.ridgePlan.elements);
    for(const[k,n]of Object.entries(record.sourceChunk.counts))assert.equal(record.elementCounts[k],n);
    for(const mesh of record.instances){const rows=rowsFor(record,mesh);assert.equal(mesh.count,rows.length);for(const[i,e]of rows.entries()){
      const actual=new THREE.Matrix4();mesh.getMatrixAt(i,actual);const expected=new THREE.Object3D();expected.position.set(e.x-record.origin.x,e.y,e.z-record.origin.z);expected.rotation.set(0,e.rotation,0);expected.scale.set(e.scale.x,e.scale.y,e.scale.z);expected.updateMatrix();
      for(let k=0;k<16;k++)assert.ok(Math.abs(actual.elements[k]-expected.matrix.elements[k])<3e-5,'actual metre transform '+e.id);checked++;
      if(e.kind==='seagrass'){const ground=mesh.geometry.attributes.meadowGround;assert.ok(ground&&ground.count===rows.length);for(const v of Array.from(ground.array.slice(i*4,i*4+4)))assert.ok(Number.isFinite(v));assert.ok(Math.abs(e.y-generator.floorSurface(e.x,e.z).height)<1e-6);roots++;}
      if(e.kind==='coral'){const host=record.sourceChunk.elements.find(h=>h.id===e.attachmentId);assert.ok(host&&host.kind==='rock','actual persistent rock host');assert.ok(Number.isFinite(generator.heightForCamera(e.x,e.z)));}
    }}
  }}assert.ok(checked>0&&roots>0);assert.equal(ocean.stats.coastalSeascapeOwners,[...ocean._chunks.values()].filter(r=>r.ridgePlan?.version===7).length);
});

test('all twelve actual floor meshes and coastal facies meet across sixteen seams without changing triangles for color',t=>{
  const{ocean,plans,generator}=fixture(t),seen=new Set(),seams=new Set();let tinted=0,guarded=0,rays=0;
  for(const cx of[150,152,154]){publish(ocean,plans,{x:cx*64+32,z:4*64+32});ocean.root.updateMatrixWorld(true);
    for(const[id,record]of ocean._chunks){const plan=record.ridgePlan;if(plan?.version!==7)continue;
      if(!seen.has(id)){seen.add(id);const g=record.terrainGeometry,plain=ocean._terrainGeometry({...record.sourceChunk,ridgePlan:null});try{
        for(const name of['position','normal','uv'])assert.deepEqual(g.attributes[name].array,plain.attributes[name].array);assert.deepEqual(g.index.array,plain.index.array);
        for(let z=0;z<=64;z++)for(let x=0;x<=64;x++){const i=z*65+x,wx=plan.cx*64+x,wz=plan.cz*64+z,f=coastalSeascapeFacies(plan,wx,wz);assert.equal(g.attributes.position.getY(i),generator.floorVertex(wx,wz));
          for(let c=0;c<3;c++){const value=g.attributes.color.array[i*3+c],old=plain.attributes.color.array[i*3+c];assert.ok(Number.isFinite(value)&&value>0&&value<1.2);if(f.influence===0){assert.equal(value,old);guarded++;}else if(Math.abs(value-old)>.001)tinted++;}}
      }finally{plain.dispose();}
      const terrain=record.group.children.find(m=>m.name==='sampled-seabed');for(const[x,z]of[[18.23,20.37],[46.18,42.39]]){const wx=plan.cx*64+x,wz=plan.cz*64+z;const ray=new THREE.Raycaster(new THREE.Vector3(wx,30,wz),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(terrain,false)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-generator.floorSurface(wx,wz).height)<2e-5);rays++;}}
      for(const axis of['x','z']){const nid=axis==='x'?(plan.cx+1)+','+plan.cz:plan.cx+','+(plan.cz+1),other=ocean._chunks.get(nid),key=id+'/'+nid;if(other?.ridgePlan?.version!==7||seams.has(key))continue;seams.add(key);
        for(let k=0;k<65;k++)for(const name of['position','normal','color','uv']){const a=record.terrainGeometry.attributes[name],b=other.terrainGeometry.attributes[name],ia=axis==='x'?k*65+64:64*65+k,ib=axis==='x'?k*65:k;
          for(let c=0;c<a.itemSize;c++){let av=a.array[ia*a.itemSize+c],bv=b.array[ib*b.itemSize+c];if(name==='position'&&c===0){av+=record.origin.x;bv+=other.origin.x;}if(name==='position'&&c===2){av+=record.origin.z;bv+=other.origin.z;}assert.equal(av,bv,key+'/'+name);}}}
    }}assert.equal(seen.size,12);assert.equal(seams.size,16);assert.equal(rays,24);assert.ok(tinted>1000&&guarded>1000);t.diagnostic('actual12 owners,16 seams,24 floor rays; color-only coastal dispatch; old guard channels exact');
});

test('one actual curved route reveals whole persistent reef and meadow silhouettes at finite ordinary camera samples',t=>{
  const{ocean,plans}=fixture(t),shot=createCoastalSeascapeMotion(plans[0],{durationSec:200}),counts={coral:0,seagrass:0,rock:0},intersections={coral:0,seagrass:0,rock:0};assert.ok(shot.distanceM>=300&&shot.distanceM<=500);
  const positions=[],samples=[];for(const seconds of[0,33,66,100,133,166,200]){const frame=sampleCoastalSeascapeMotion(shot,seconds);positions.push(frame.position);publish(ocean,plans,frame.position);ocean.root.updateMatrixWorld(true);const local={coral:0,seagrass:0,rock:0},intersecting={coral:0,seagrass:0,rock:0};
    const camera=new THREE.PerspectiveCamera(49,16/9,.05,65);camera.position.set(frame.position.x,frame.position.y,frame.position.z);camera.lookAt(frame.target.x,frame.target.y,frame.target.z);camera.updateMatrixWorld(true);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    for(const record of ocean._chunks.values())for(const mesh of record.instances){const kind=mesh.userData.landscapeKind;if(!Object.hasOwn(counts,kind))continue;for(let i=0;i<mesh.count;i++){
      const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix),corners=[];
      for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z));
      if(box.getCenter(new THREE.Vector3()).distanceTo(camera.position)<30){if(frustum.intersectsBox(box)){intersections[kind]++;intersecting[kind]++;}if(corners.every(p=>frustum.containsPoint(p))){counts[kind]++;local[kind]++;}}
    }}samples.push({seconds,position:frame.position,wholeSourceBoxes:local,intersectingSourceBoxes:intersecting});
  }t.diagnostic('seven real route CPU samples: '+JSON.stringify(samples));assert.ok(positions.at(-1).x-positions[0].x>250);assert.ok(counts.coral>0&&counts.seagrass>0&&intersections.rock>0,JSON.stringify({counts,intersections}));t.diagnostic('whole boxes/intersecting boxes within30m: '+JSON.stringify({counts,intersections})+'; native large rock bounds include buried shoulders; no foliage/animal occlusion or GPU appearance certification');
});

test('streaming rebase repeat publication and disposal preserve bounded shared kit and native display clock',t=>{
  const{ocean,plans,generator}=fixture(t),p=plans[0].group.routePath[0];publish(ocean,plans,p);const sourceHash=sha(JSON.stringify(plans));
  const shared=[...Object.values(ocean._geometries),...Object.values(ocean._materials),...Object.values(ocean._textures),ocean._terrainMaterial],released=new Map(shared.map(r=>[r,0]));
  for(const r of shared)r.addEventListener('dispose',()=>released.set(r,released.get(r)+1));
  const records=[...ocean._chunks.values()],old=records.map(r=>({record:r,geometry:geomHash(r.terrainGeometry),instances:r.instances.map(m=>m.instanceMatrix.array.slice())})),loads=ocean.stats.loads;
  ocean.setEnvironment({currentMps:.18},4);ocean.setRenderOrigin({x:9600,z:256});assert.equal(ocean.stats.loads,loads);for(const saved of old){assert.equal(geomHash(saved.record.terrainGeometry),saved.geometry);saved.record.instances.forEach((m,i)=>assert.deepEqual(m.instanceMatrix.array,saved.instances[i]));}
  ocean.setEnvironment({currentMps:.18},4);assert.equal(ocean.stats.meadowEnvironment.clockSec,4);assert.equal(ocean.stats.meadowEnvironment.baseCurrentMps,.18);
  for(const cx of[150,152,154])publish(ocean,plans,{x:cx*64+32,z:4*64+32});assert.ok(ocean.stats.ownedMeadowGeometries<=9&&ocean.stats.ownedOverlayGeometries<=9);assert.equal(sha(JSON.stringify(plans)),sourceHash);
  generator.retainRidgeOwners([]);ocean.update(p);assert.equal(ocean.stats.activeChunks,0);assert.ok([...released.values()].every(n=>n===0));
  publish(ocean,structuredClone(plans),p);ocean.dispose();ocean.dispose();assert.ok([...released.values()].every(n=>n===1));
});
