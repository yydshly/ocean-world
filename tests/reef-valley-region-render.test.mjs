import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { OceanChunks } from '../src/world/OceanChunks.js';
import { createLivingCoastalSeascapePlans } from '../src/livingCoastalSeascape.js';
import { createReefValleyRegionPlans, reefValleyFacies } from '../src/reefValleyRegion.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Literal complete CPU outputs captured from isolated HEAD before v8 dispatch.
// Neither buffers nor source boxes certify browser/GPU appearance.
const original={"version":1,"capturedAt":"2026-10-08T05:03:44.650Z","head":"8115e0e3522f85b1726b08c70b59b9fd45884026","scope":"Pre-v8 full native v7 CPU buffers, node/instance matrices, material/texture and shader declarations; no GPU acceptance.","sourceHashes":{"src/world/livingShallowsAssets.js":"1a7867e540bb74157c549a0b6004546e0cc4151af6748804334fd90703f31019","src/world/livingMeadowEnvironment.js":"2549d6249a6933e54369ec9227f8790028e77cdfa73496d288b2209327ac8787","src/world/livingShallowsCoralMaterial.js":"99b6757abd2a19c16710753195ba2a9d7f4335fab407463c9365ed2ff0a761bb","src/world/livingReefSubstrate.js":"e6139ca4ab6e8bd4f15273df83968f71e72ef1238b49323bb3e0a9eaa1ef30d2","src/world/oceanRockFooting.js":"3f13ded85eeece52dd6ce9a9c882c8623e0d0e19c85ebde590b8a838ab0dc13b","src/oceanRockShape.js":"d312a05672d9e303b9f9cc86d9b8d4818e6e9bb9257f63475c8a1fa3d6a21792","src/livingCoastalSeascape.js":"32bbf2cd2a4d413be439f1c26da1d3dd4e706394171c9edcef52e494c53e9d88","src/world/OceanChunks.js":"41290828c0422a879ff2a05248314187dd29bac546927656cd9f976d9b760fe8"},"frames":[{"window":{"cx":151,"cz":4},"input":{"timeSec":0,"currentMps":0.15},"owners":[{"id":"150,4","output":{"geometry":"24837e4af7d6cdc93b8d0ea753538f36343d836a7802a7a569d6717c6ed05d27","nodeMatrices":"65d3131523f14e9c6fa4d253d99509d9b2b45bfbd55e6ff9c1a253aa1baf527b","materialAndShaderDeclarations":"f1afcadcca9f5e78d8eb07194a9d5afd17f028e77bcb61e4839c6457727f0dce","meshes":9,"vertices":10549,"triangles":16307}},{"id":"151,4","output":{"geometry":"6f92f238d06d596a995643e12fe842def9711bf131be6bcfddf9f0adf7190203","nodeMatrices":"553270fa5c6df820a944d5fb55ca4cafecdff59966cd6b4ca130f6832247c50e","materialAndShaderDeclarations":"5cc105458bfea1752ec9ee66d22ed9de9141f4a4490a7cf16943e60cf5b19db6","meshes":10,"vertices":10610,"triangles":16871}},{"id":"152,4","output":{"geometry":"93c2f43c55d02905b45ba459cd522969e07a2cd99243030df02f647f25b4684a","nodeMatrices":"32f31214bc2b6444424aa936665a480535715e500e3129c48a73597fcfd97491","materialAndShaderDeclarations":"07ef0afd654c9c310f99a61482b466e34f0e82787830e3d6af1ba229e9ba8301","meshes":9,"vertices":10482,"triangles":16189}},{"id":"150,5","output":{"geometry":"18359358408c44677198b044da292a3b8a7fad9ade590fc7c6db71e7ca83b6b2","nodeMatrices":"afe1f95cb9f4f8331434da8d4e2b23b3321587d05a17e810acae085d40f461b4","materialAndShaderDeclarations":"f1afcadcca9f5e78d8eb07194a9d5afd17f028e77bcb61e4839c6457727f0dce","meshes":9,"vertices":10263,"triangles":16169}},{"id":"151,5","output":{"geometry":"f22cfba477602089be5abcc8df4008c3de42ed354df79ed02f6b0841199c70a3","nodeMatrices":"fe650ddda06a82b4a63da886751fec6630edbf6aa7f367cd96a9f6296eb11511","materialAndShaderDeclarations":"8c7551fa014c3917ec5aa08c43df4064b00acc9ceeaeaaace89fb323adb6cb72","meshes":7,"vertices":7432,"triangles":13216}},{"id":"152,5","output":{"geometry":"2f64d3b01aa5703f52fb483a79a5c9cf8d7be06fc4357576ae8c56e97a5c9b61","nodeMatrices":"350b0c1060507e3b067d632b4f321436fcbbaf3139a368c26545160f1ba37f89","materialAndShaderDeclarations":"d6414469584981ae746edca8d60c8be05a0fd0147beae68fe7a21e9cae629ea2","meshes":11,"vertices":10580,"triangles":17181}}],"kit":{"geometry":"781e25f6a73b90043df1adbc2a1e18981cbdd00abb5752273b0c1246101df892","nodeMatrices":"c20c1e579ccb332f72234b242858889665b9ce240de16f207ece74df9bdfcffa","materialAndShaderDeclarations":"db007b5f8e13d99675dd147bfc23bfa748f883c89340680d413d62c2a33e1430","meshes":81,"vertices":88136,"triangles":141683},"shaderDeclarations":{"rock":"edd0181fa1860920c6c0c9776ca5650e89d79a70c1d664a4f463bfbe14e854d4","coral":"4148efb2af2e3b7766e56ec9d3c3ab8dd3955ad24fa2ec0b7a0566c13bd575a4","seagrass":"0c90d42678f27c45e33f471ec831112cc11f9b73ce095422e86e2b6be40f0269","rubble":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","algae":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","driftwood":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","bottle":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e"},"displayClock":{"timeSec":0,"currentMps":0.15}},{"window":{"cx":154,"cz":4},"input":{"timeSec":0,"currentMps":0.15},"owners":[{"id":"153,4","output":{"geometry":"37cda4bdf03bb5755b4540e09aee50ceaf5b764539ff69c426ad9ca589922839","nodeMatrices":"57ca2fcd7aa4b8eb22120b89103e51f1c6d5cfff0b07606ed06e8e7c4b2d81ea","materialAndShaderDeclarations":"8596e80d3ba31474070ecda7b49f46c60a8cd02a87d4229319adba3d9571315d","meshes":9,"vertices":9677,"triangles":15084}},{"id":"154,4","output":{"geometry":"aa562ad8f7f4bfe562a91f9b3352e84d19a4cc68186ac8fff540c7a458e49474","nodeMatrices":"5fe6ea31210920d657271c9dbee2049b4d2dfe5e33924860e41666c22cb0696f","materialAndShaderDeclarations":"8596e80d3ba31474070ecda7b49f46c60a8cd02a87d4229319adba3d9571315d","meshes":9,"vertices":10039,"triangles":15290}},{"id":"155,4","output":{"geometry":"070e8bae217b5e2461f1e6ae67af5a4b5142475346b19037cc02606ec1419dfa","nodeMatrices":"3b6036f2d8634d3d781b500d16a6b574086e7e2ef0b439ea36f17cd9daeff9dc","materialAndShaderDeclarations":"21a07d3c0640114893a39eab2c359e9741cd62aa657bb45d96ce40c6a6dcf8af","meshes":10,"vertices":10621,"triangles":16651}},{"id":"153,5","output":{"geometry":"f112a2c82e65aa4bd849abd318731aceab4675edddaa95880b3fd8f6cd921df9","nodeMatrices":"a86dda457dfc59a724c9dd03c1fb1786223e8227f9a5dce3fea9f50ef7dd42b1","materialAndShaderDeclarations":"8596e80d3ba31474070ecda7b49f46c60a8cd02a87d4229319adba3d9571315d","meshes":9,"vertices":8931,"triangles":14750}},{"id":"154,5","output":{"geometry":"a981b97f35e7506d0b97eb1f5a3bba870bef89eaf5a2134e68f88f6bffedd2cc","nodeMatrices":"4d71431aef2e039ad688b1bea2f20f10664ac8144be7791c2a366d2221794f3a","materialAndShaderDeclarations":"8596e80d3ba31474070ecda7b49f46c60a8cd02a87d4229319adba3d9571315d","meshes":9,"vertices":8567,"triangles":14586}},{"id":"155,5","output":{"geometry":"cd8790424f6897b5cb60dac11a7d11c4dfa2f0f15508e71ec5a5f80f9e317fb4","nodeMatrices":"74794aa9a343e2f79b06e386fc9ae91ce36cd1dbedf7ef69096402225d75243e","materialAndShaderDeclarations":"453a058d178b0c257ee924e3bcb3673b5a529303c7da8063f7472b8210751171","meshes":7,"vertices":7278,"triangles":11910}}],"kit":{"geometry":"213eb8b22c362c7c685f02d69e6b49fca4db900e2cb4d1264d777dfa4f524701","nodeMatrices":"b088ea660272776a94625d54358a3f82bb5312bd9151f4d7dc77accb16fc7638","materialAndShaderDeclarations":"e79910dbf1be41efc3d9a9ee47785a020be1c7784c5fd15f2fbc8e41b69159a8","meshes":76,"vertices":79623,"triangles":128934},"shaderDeclarations":{"rock":"edd0181fa1860920c6c0c9776ca5650e89d79a70c1d664a4f463bfbe14e854d4","coral":"4148efb2af2e3b7766e56ec9d3c3ab8dd3955ad24fa2ec0b7a0566c13bd575a4","seagrass":"0c90d42678f27c45e33f471ec831112cc11f9b73ce095422e86e2b6be40f0269","rubble":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","algae":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","driftwood":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e","bottle":"e6af1b08cb03bc20aeb3e64eaf60ee7dc0b91679f92cfd41f49089c97130123e"},"displayClock":{"timeSec":0,"currentMps":0.15}}],"planHash":"573b70057b42603d2831b708485d94c5a683b7ed66717a8740b1d69cb3026707","inputs":[{"timeSec":0,"currentMps":0.15}],"sourceOwners":["150,4","150,5","151,4","151,5","152,4","152,5","153,4","153,5","154,4","154,5","155,4","155,5"],"sourceOwnerCount":12,"frameCount":2,"uniqueOwnerOutputs":12,"prototypeGeometryHashes":{"seagrass":"ec6e57da1014ededbf8f5f5efdd387e1d8d950c3d503a246e3f83c1ada257bdc","rubble":"b1c826d5a967610183a7f966fc9f8b938b553633daa32d260e294135ef13df8a","coral-branching":"da731282ba532e6b2b075b896bce2108af371453b2a39dfa68c539091f944a87","coral-table":"d304b9549f82f8461f30829b85dbbc7715ced4580c40d8f00696ef97f965c2c6","coral-fan":"e14e3d883283c918c02a5f7d584e54f0dc2e83b1e7995a6c3b77d6cb01cf16e6","driftwood":"2e7b706975bab5195596df74ca9b5b2e34f5b6a360cc6418a8eb50c284b2c882","bottle":"fd64212ba0c671546dc42986cb2fb24f8a4754657c4e83f99a00ffe15851049a","rock-natural-a":"1705f7dc9f2c79b621519c1c7083f7de0203fc4d46db5ae1b816f916b84fbf1d","rock-natural-b":"b2f8ae4a3222da5281f90893cd9409efaaa85b2afbdd9a6e906a9f7499eb4899","rock-natural-c":"b31258eff76b48932ceeb18ba4e5546133e8e63957c4e8f3b1e195345f656606"}};
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
const worldSource=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
function shippedMethod(name){const start=worldSource.indexOf('  '+name+'(');assert.ok(start>=0);const next=/\n  (?:async )?[A-Za-z_]\w*\(/.exec(worldSource.slice(start+2));return worldSource.slice(start,next?start+2+next.index:worldSource.lastIndexOf('\n}'));}
const SegmentWorld=new Function('clamp',`return class {${['createReefValleyRegionSegment','sampleReefValleyRegionSegment'].map(shippedMethod).join('\n')}}`)(THREE.MathUtils.clamp);
function fixture(t,all=false){const ocean=new OceanChunks(SEED,{livingGeology:true});t.after(()=>{ocean.dispose();ocean.generator.clearCache?.();});
 const plans=(all?[204,210,216,222]:[204]).flatMap(cx=>createReefValleyRegionPlans(ocean.generator.baseGenerator,cx,4));return{ocean,plans,generator:ocean.generator};}
function publish(ocean,plans,p){const cx=Math.floor(p.x/64),cz=Math.floor(p.z/64),all=new Map(plans.map(p=>[p.id,p])),subset=[],legacy=[];
 for(let z=cz-2;z<=cz+2;z++)for(let x=cx-2;x<=cx+2;x++){const id=x+','+z;if(all.has(id))subset.push(all.get(id));else legacy.push(id);}
 ocean.generator.replaceRidgeOwners(subset,legacy);ocean.update(p);assert.equal(ocean.stats.activeChunks,9);assert.ok(ocean.stats.ridgeReadyOwners<=25);
 assert.ok(ocean.stats.drawCalls<=ocean.stats.maxDrawCalls);assert.equal(ocean.stats.prototypeGeometries,10);assert.equal(ocean.stats.prototypeMaterials,7);}
// The legacy receipt was captured with the complete twelve-owner v7 registry.
function publishOld(ocean,plans,p){const cx=Math.floor(p.x/64),cz=Math.floor(p.z/64),ids=new Set(plans.map(p=>p.id)),extra=[];
 for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++)if(!ids.has(x+','+z))extra.push(x+','+z);ocean.generator.replaceRidgeOwners(plans,extra);ocean.update(p);}
function shaders(ocean){return Object.fromEntries(Object.entries(ocean._materials).map(([kind,m])=>{const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>'};m.onBeforeCompile(shader);return[kind,sha(JSON.stringify(stable(shader)))];}));}
function rowsFor(record,mesh){const kind=mesh.userData.landscapeKind;return record.sourceChunk.elements.filter(e=>e.kind===kind&&
 (kind!=='rock'||mesh.name==='generated-rock-'+e.profile)&&(kind!=='coral'||mesh.userData.morphotype===e.morphotype));}
function geomHash(g){return sha(JSON.stringify({attributes:stable(g.attributes),index:stable(g.index)}));}
function boxes(ocean,camera){ocean.root.updateMatrixWorld(true);camera.updateMatrixWorld(true);const whole={rock:0,coral:0,seagrass:0},intersection={...whole};
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 for(const r of ocean._chunks.values())for(const mesh of r.instances){const kind=mesh.userData.landscapeKind;if(!Object.hasOwn(whole,kind))continue;
 for(let i=0;i<mesh.count;i++){const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);m.premultiply(mesh.matrixWorld);const b=mesh.geometry.boundingBox.clone().applyMatrix4(m);
 if(b.getCenter(new THREE.Vector3()).distanceTo(camera.position)>=30)continue;if(frustum.intersectsBox(b))intersection[kind]++;
 let full=true;for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])full&&=frustum.containsPoint(new THREE.Vector3(x,y,z));if(full)whole[kind]++;}}
 return{wholeSourceBoxes:whole,intersectingSourceBoxes:intersection};}

test('literal pre-v8 twelve-owner v7 geometry matrices material shader buffers and original assets remain exact',t=>{
 for(const[path,hash]of Object.entries(original.sourceHashes))if(path!=='src/world/OceanChunks.js')assert.equal(sha(readFileSync(new URL('../'+path,import.meta.url))),hash,path);
 const ocean=new OceanChunks(SEED,{livingGeology:true});t.after(()=>ocean.dispose());const plans=createLivingCoastalSeascapePlans(ocean.generator.baseGenerator,150,4);
 assert.equal(sha(JSON.stringify(plans)),original.planHash);let checked=0;
 for(const frame of original.frames){publishOld(ocean,plans,{x:frame.window.cx*64+32,z:frame.window.cz*64+32});ocean.setEnvironment({currentMps:frame.input.currentMps},frame.input.timeSec);
 for(const{id,output}of frame.owners){assert.deepEqual(completeHashes(ocean._chunks.get(id).group),output,id);checked++;}
 assert.deepEqual(shaders(ocean),frame.shaderDeclarations);assert.deepEqual(completeHashes(ocean.root),frame.kit);}
 assert.equal(checked,12);for(const[id,hash]of Object.entries(original.prototypeGeometryHashes))assert.equal(geomHash(ocean._geometries[id]),hash,id);
});

test('private v8 candidates stay invisible and published original metre instances retain real floor and rock roots',t=>{
 const{ocean,plans,generator}=fixture(t),p=plans[0].group.routePath[0];ocean.update(p);assert.equal(ocean.stats.activeChunks,0);
 generator.withReefValleyPlans(plans,()=>{for(const plan of plans){assert.equal(generator.isRidgeOwnerReady(plan.id),false);ocean._load(plan.cx,plan.cz);}assert.equal(ocean.stats.activeChunks,0);});
 let checked=0,roots=0,corals=0;for(const cx of[205,208]){publish(ocean,plans,{x:cx*64+32,z:4*64+32});for(const r of ocean._chunks.values()){if(r.ridgePlan?.version!==8)continue;
 assert.equal(r.sourceChunk.ridgePlan,r.ridgePlan);assert.equal(r.sourceChunk.elements,r.ridgePlan.elements);
 for(const[k,n]of Object.entries(r.sourceChunk.counts))assert.equal(r.elementCounts[k],n);
 for(const mesh of r.instances){const rows=rowsFor(r,mesh);assert.equal(rows.length,mesh.count);for(const[i,e]of rows.entries()){
 const a=new THREE.Matrix4();mesh.getMatrixAt(i,a);const b=new THREE.Object3D();b.position.set(e.x-r.origin.x,e.y,e.z-r.origin.z);b.rotation.set(0,e.rotation,0);b.scale.set(e.scale.x,e.scale.y,e.scale.z);b.updateMatrix();
 for(let k=0;k<16;k++)assert.ok(Math.abs(a.elements[k]-b.matrix.elements[k])<3e-5,'actual metre transform '+e.id);checked++;
 if(e.kind==='seagrass'){const ground=mesh.geometry.attributes.meadowGround;assert.ok(ground&&ground.count===rows.length);assert.ok(Math.abs(e.y-generator.floorSurface(e.x,e.z).height)<1e-6);roots++;}
 if(e.kind==='coral'){assert.ok(r.sourceChunk.elements.some(h=>h.id===e.attachmentId&&h.kind==='rock'));corals++;}
 }}}assert.equal(ocean.stats.reefValleyOwners,[...ocean._chunks.values()].filter(r=>r.ridgePlan?.version===8).length);}
 assert.ok(checked>0&&roots>0&&corals>0);t.diagnostic(JSON.stringify({actualInstancesChecked:checked,grassRoots:roots,rockAttachedCorals:corals}));
});

test('forty-eight actual v8 floor meshes preserve source triangles and meet across seventy within-group and group-edge seams',t=>{
 const{ocean,plans,generator}=fixture(t,true),seen=new Set(),seams=new Set();let tinted=0,guarded=0,rays=0;
 for(let cx=204;cx<=226;cx+=2){publish(ocean,plans,{x:cx*64+32,z:4*64+32});ocean.root.updateMatrixWorld(true);
 for(const[id,r]of ocean._chunks){const p=r.ridgePlan;if(p?.version!==8)continue;if(!seen.has(id)){seen.add(id);const g=r.terrainGeometry,plain=ocean._terrainGeometry({...r.sourceChunk,ridgePlan:null});try{
 for(const name of['position','normal','uv'])assert.deepEqual(g.attributes[name].array,plain.attributes[name].array);assert.deepEqual(g.index.array,plain.index.array);
 for(let z=0;z<=64;z++)for(let x=0;x<=64;x++){const i=z*65+x,wx=p.cx*64+x,wz=p.cz*64+z,f=reefValleyFacies(p,wx,wz);assert.equal(g.attributes.position.getY(i),generator.floorVertex(wx,wz));
 for(let c=0;c<3;c++){const v=g.attributes.color.array[i*3+c],old=plain.attributes.color.array[i*3+c];assert.ok(Number.isFinite(v)&&v>0&&v<1.2);if(f.influence===0){assert.equal(v,old);guarded++;}else if(Math.abs(v-old)>.001)tinted++;}}
 }finally{plain.dispose();}const terrain=r.group.children.find(m=>m.name==='sampled-seabed'),wx=p.cx*64+18.23,wz=p.cz*64+20.37;
 const hit=new THREE.Raycaster(new THREE.Vector3(wx,30,wz),new THREE.Vector3(0,-1,0)).intersectObject(terrain,false)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-generator.floorSurface(wx,wz).height)<2e-5);rays++;}
 for(const axis of['x','z']){const nid=axis==='x'?(p.cx+1)+','+p.cz:p.cx+','+(p.cz+1),o=ocean._chunks.get(nid),key=id+'/'+nid;if(o?.ridgePlan?.version!==8||seams.has(key))continue;seams.add(key);
 for(let k=0;k<65;k++)for(const name of['position','normal','color','uv']){const a=r.terrainGeometry.attributes[name],b=o.terrainGeometry.attributes[name],ia=axis==='x'?k*65+64:64*65+k,ib=axis==='x'?k*65:k;
 for(let c=0;c<a.itemSize;c++){let av=a.array[ia*a.itemSize+c],bv=b.array[ib*b.itemSize+c];if(name==='position'&&c===0){av+=r.origin.x;bv+=o.origin.x;}if(name==='position'&&c===2){av+=r.origin.z;bv+=o.origin.z;}assert.equal(av,bv,key+'/'+name);}}}
 }}assert.equal(seen.size,48);assert.equal(seams.size,70);assert.equal(rays,48);assert.ok(tinted>1000&&guarded>1000);
 t.diagnostic('48 actual floor meshes / 70 exact seams / 48 floor rays; colour-only dispatch, original triangles and guarded channels unchanged');
});

test('four actual connected macro routes report whole and intersecting source boxes every sixty metres without appearance claims',t=>{
 const{ocean,plans}=fixture(t,true),w=new SegmentWorld(),segments=[204,210,216,222].map(cx=>w.createReefValleyRegionSegment(plans.find(p=>p.cx===cx&&p.cz===4))),total=segments.reduce((n,s)=>n+s.distanceM,0);
 assert.ok(total>=1000&&total<=2000);for(let i=1;i<segments.length;i++)assert.deepEqual(segments[i-1].points.at(-1),segments[i].points[0]);
 const samples=[],counts={rock:0,coral:0,seagrass:0},intersections={...counts};let longestEmptySampleSpanM=0,emptyStart=null;
 for(const distanceM of[...Array.from({length:Math.floor(total/60)+1},(_,i)=>i*60),total]){let index=0,prefix=0;while(index<segments.length-1&&distanceM>prefix+segments[index].distanceM)prefix+=segments[index++].distanceM;
 const frame=w.sampleReefValleyRegionSegment(segments[index],(distanceM-prefix)/segments[index].distanceM*200,200);publish(ocean,plans,frame.position);
 const camera=new THREE.PerspectiveCamera(49,16/9,.05,65);camera.position.set(frame.position.x,frame.position.y,frame.position.z);camera.lookAt(frame.target.x,frame.target.y,frame.target.z);
 const b=boxes(ocean,camera);for(const k of Object.keys(counts)){counts[k]+=b.wholeSourceBoxes[k];intersections[k]+=b.intersectingSourceBoxes[k];}
 const empty=Object.values(b.intersectingSourceBoxes).every(n=>n===0);if(empty&&emptyStart===null)emptyStart=distanceM;if(!empty&&emptyStart!==null){longestEmptySampleSpanM=Math.max(longestEmptySampleSpanM,distanceM-emptyStart);emptyStart=null;}
 samples.push({distanceM,groupId:segments[index].groupId,position:frame.position,...b});}
 if(emptyStart!==null)longestEmptySampleSpanM=Math.max(longestEmptySampleSpanM,total-emptyStart);assert.ok(samples.length>=25);
 assert.ok(counts.coral>0&&counts.seagrass>0&&intersections.rock>0,JSON.stringify({counts,intersections}));
 const receipt={routeM:total,sampleSpacingM:60,samples,whole:counts,intersection:intersections,longestEmptySampleSpanM,
   limits:'CPU source boxes within30m; actual animals separately in native world case; no occlusion/GPU appearance proof'};
 writeFileSync(process.env.REEF_VALLEY_RENDER_RECEIPT??'output/validation/reef-valley-region-render-native.json',JSON.stringify(receipt,null,2)+'\n');
 t.diagnostic(JSON.stringify(receipt));
});

test('v8 streaming rebases only roots with bounded original shared resources and idempotent release',t=>{
 const{ocean,plans,generator}=fixture(t),p=plans[0].group.routePath[0];publish(ocean,plans,p);const sourceHash=sha(JSON.stringify(plans));
 const shared=[...Object.values(ocean._geometries),...Object.values(ocean._materials),...Object.values(ocean._textures),ocean._terrainMaterial],released=new Map(shared.map(r=>[r,0]));for(const r of shared)r.addEventListener('dispose',()=>released.set(r,released.get(r)+1));
 const saved=[...ocean._chunks.values()].map(r=>({r,geometry:geomHash(r.terrainGeometry),instances:r.instances.map(m=>m.instanceMatrix.array.slice())})),loads=ocean.stats.loads;
 ocean.setEnvironment({currentMps:.18},4);ocean.setRenderOrigin({x:13056,z:256});assert.equal(ocean.stats.loads,loads);for(const s of saved){assert.equal(geomHash(s.r.terrainGeometry),s.geometry);s.r.instances.forEach((m,i)=>assert.deepEqual(m.instanceMatrix.array,s.instances[i]));}
 ocean.setEnvironment({currentMps:.18},4);assert.equal(ocean.stats.meadowEnvironment.clockSec,4);assert.equal(ocean.stats.meadowEnvironment.baseCurrentMps,.18);
 for(const cx of[204,206,208])publish(ocean,plans,{x:cx*64+32,z:4*64+32});assert.ok(ocean.stats.ownedMeadowGeometries<=9&&ocean.stats.ownedOverlayGeometries<=9);assert.equal(sha(JSON.stringify(plans)),sourceHash);
 generator.retainRidgeOwners([]);ocean.update(p);assert.equal(ocean.stats.activeChunks,0);assert.ok([...released.values()].every(n=>n===0));publish(ocean,structuredClone(plans),p);ocean.dispose();ocean.dispose();assert.ok([...released.values()].every(n=>n===1));
});
