import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createShallowSample,sampleRouteProgress,sampleShallowCamera,SHALLOW_SAMPLE_SECONDS} from '../src/shallowSample.js';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {oceanRockHeight,oceanRockMesh,SHALLOW_SAMPLE_ROCK_PROFILES} from '../src/oceanRockShape.js';
import {NATURAL_SAMPLE_FISH,ShallowNaturalFishAssets,shallowNaturalCoralGeometries,sampleBodyWave} from '../src/world/ShallowNaturalAssets.js';
import {decodeReefScanForInspection} from '../scripts/lib/decode-reef-scan.mjs';
import {SAMPLE_HERO_IDS,ShallowHeroAnimals,sampleHeroDeform} from '../src/world/ShallowHeroAnimals.js';
import {SHALLOW_ARTIST_FISH_IDS,ShallowArtistFish,sampleArtistVertex} from '../src/world/ShallowArtistFish.js';
import {createShallowPlaybackMetrics} from '../src/shallowSamplePlayback.js';
import fs from 'node:fs';

test('large sample animals retain their true size measure and bounded full-body movement',()=>{
  const assets=new ShallowHeroAnimals();
  for(const id of SAMPLE_HERO_IDS){
    const model=assets.create(id),mesh=model.root.children[0],box=mesh.geometry.boundingBox,p=mesh.geometry.attributes.position,roles=mesh.geometry.attributes.heroRole;
    if(id==='blue-spotted-ray')assert.ok(Math.abs(box.max.z-box.min.z-1)<.01,'ray catalogue scale is disc width, not total length');
    else assert.ok(box.max.x-box.min.x<=1.011,'hero changed the natural total-length unit');
    assert.ok(Array.from(p.array).every(Number.isFinite));
    for(let i=0;i<p.count;i+=17)for(let t=0;t<=75;t+=.7){
      const v=sampleHeroDeform(p.getX(i),p.getY(i),p.getZ(i),roles.getX(i),t,.83,model.kind);
      assert.ok(v.y>=box.min.y-(model.kind===1?.15:model.kind===2?.045:0)-1e-6);
      assert.ok(Math.abs(v.z-p.getZ(i))<=.035,'hero moved beyond horizontal padding');
    }
  }
  const counts=new Map([...assets.resources].map(r=>[r,0]));for(const r of counts.keys())r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
  assets.dispose();assets.dispose();assert.ok([...counts.values()].every(n=>n===1));
});

test('distant coral detail reduces geometry while exact sand tiles keep shared physical support',()=>{
  const world=new ShallowSampleScene(),ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  for(const batch of world.coralBatches)assert.ok(batch.farGeometry.index.count<batch.nearGeometry.index.count);
  const beds=world.environment.children.filter(o=>o.name.startsWith('Sand terrain /')||o.name==='Continuous shallow sand bed');assert.equal(beds.length,25);
  for(const t of [0,20,42,58,75]){
    world.update(t);world.scene.updateMatrixWorld(true);
    const {x,z}=world.camera.position;ray.set(new THREE.Vector3(x,30,z),down);const hit=ray.intersectObjects(beds)[0];
    assert.ok(hit&&Math.abs(hit.point.y-world.model.floor(x,z))<1e-6,'sand tiling changed physical triangles');
  }
  world.dispose();
});

test('sample hard reef uses its actual eroded triangles; individual fish waves remain inside reserved motion clearance',()=>{
  const world=new ShallowSampleScene(),point=new THREE.Vector3(),ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  assert.equal(world.model.rocks.filter(r=>SHALLOW_SAMPLE_ROCK_PROFILES.includes(r.profile)).length,15);
  assert.equal(world.model.rocks.filter(r=>r.fieldAsset).length,70,'55 outer source outcrops, 12 natural banks and 3 natural resident habitats');
  assert.equal(world.model.rocks.filter(r=>r.id.startsWith('sample-reef-backbone-')).length,6);
  for(const profile of SHALLOW_SAMPLE_ROCK_PROFILES){
    const data=oceanRockMesh(profile),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);
    const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld();
    const rock={profile,x:0,y:0,z:0,scale:{x:1,y:1,z:1},rotation:0};
    for(let k=0;k<30;k++){const x=.25*Math.cos(k*2.4),z=.25*Math.sin(k*2.4);ray.set(new THREE.Vector3(x,2,z),down);
      const hit=ray.intersectObject(mesh)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-oceanRockHeight(rock,x,z))<1e-6,'display and physical support diverged');
    }g.dispose();mesh.material.dispose();
  }
  for(const batch of world.animals.batches.filter(b=>NATURAL_SAMPLE_FISH[b.id]&&!SHALLOW_ARTIST_FISH_IDS.includes(b.id))){
    const wave=batch.parts[0].mesh.geometry.getAttribute('sampleSwim');
    if(batch.agents.length>1)assert.notEqual(wave.getX(0),wave.getX(1),'shoal members share identical swim phase');
    for(let i=0;i<wave.count;i++)for(let t=0;t<75;t+=.25){
      const value=sampleBodyWave(-.5,t,wave.getX(i),wave.getY(i),wave.getZ(i));assert.ok(Math.abs(value.offset)<.04&&Number.isFinite(value.slope));
    }
  }
  world.dispose();
});

test('original-sized dead scan installs within existing colony clearance, with actual substrate clearance and safe cancellation',async()=>{
  const world=new ShallowSampleScene(),scan=await decodeReefScanForInspection();
  const sites=await world.installSkeleton(scan,{yieldWork:()=>Promise.resolve()});assert.ok(sites.length>=12&&sites.length<=32);
  const p=scan.geometry.attributes.position,point=new THREE.Vector3();
  for(const s of sites){const co=Math.cos(s.rotation),si=Math.sin(s.rotation);
    assert.ok(s.y+scan.geometry.boundingBox.max.y<=s.c.y+s.c.height);
    assert.ok(s.y-s.c.y<=.04);
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p,i);const x=s.x+point.x*co+point.z*si,z=s.z-point.x*si+point.z*co;
      assert.ok(Math.hypot(point.x,point.z)<=s.c.radius);
      assert.ok(point.y+s.y>=world.model.surface(x,z)+.00399,'dead scan penetrated a rock triangle');
    }
  }
  const matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
  for(const mesh of world.skeletonMeshes)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);scale.setFromMatrixScale(matrix);assert.ok(scale.distanceTo(new THREE.Vector3(1,1,1))<1e-7,'museum specimen was enlarged');}
  assert.equal(world.coralBatches.reduce((n,b)=>n+b.visibility.count-b.visibility.excluded.size,0)+world.skeletonMeshes.reduce((n,m)=>n+m.count,0),world.model.corals.length);
  let disposals=0;scan.geometry.addEventListener('dispose',()=>disposals++);world.dispose();world.dispose();assert.equal(disposals,1);
  const cancelled=new ShallowSampleScene(),late=await decodeReefScanForInspection();let lateDisposals=0;
  late.geometry.addEventListener('dispose',()=>lateDisposals++);
  await cancelled.installSkeleton(late,{yieldWork:()=>{cancelled.dispose();return Promise.resolve();}});
  assert.equal(lateDisposals,1);assert.equal(cancelled.skeletonMeshes.length,0);
  const sealed=new ShallowSampleScene(),expired=await decodeReefScanForInspection();let expiredDisposals=0;
  expired.geometry.addEventListener('dispose',()=>expiredDisposals++);
  await sealed.installSkeleton(expired,{yieldWork:()=>{sealed.assetsSealed=true;return Promise.resolve();}});
  assert.equal(expiredDisposals,1);assert.equal(sealed.skeletonMeshes.length,0);assert.equal(sealed.skeletonHandle,null);sealed.dispose();assert.equal(expiredDisposals,1);
});

test('replacement fish have front-facing continuous bodies, coloured surfaces and moving fins; owned assets release once',()=>{
  const assets=new ShallowNaturalFishAssets(),ray=new THREE.Raycaster();
  for(const id of Object.keys(NATURAL_SAMPLE_FISH)){
    const model=assets.create(id),body=model.root.children.find(o=>o.name==='continuous body and inset eyes');
    ray.set(new THREE.Vector3(.1,0,2),new THREE.Vector3(0,0,-1));
    const hits=ray.intersectObject(body);assert.ok(hits.length>0,`${id} has an inward or missing flank`);
    assert.ok(hits[0].face.normal.z>.5,`${id} flank faces inward`);
    const box=new THREE.Box3().setFromObject(model.root);assert.ok(box.max.x-box.min.x<1.06,'replacement must preserve the catalogue metre scale');
    const colours=body.geometry.getAttribute('color');assert.ok(Array.from(colours.array).every(Number.isFinite));
    assert.ok(Math.min(...colours.array)<.4,'body must carry its own pattern rather than white placeholder material');
  }
  const trevally=assets.models.get('bigeye-trevally'),dorsals=trevally.root.children.find(o=>o.name==='shared static dorsal and anal membranes');
  // Both separate upper fins still have real surface after merging draws.
  for(const [x,y]of [[.15,.19],[-.05,.23]]){ray.set(new THREE.Vector3(x,y,2),new THREE.Vector3(0,0,-1));assert.ok(ray.intersectObject(dorsals).length,'merging removed a trevally dorsal fin');}
  assets.update(1,new Map(Object.keys(NATURAL_SAMPLE_FISH).map(id=>[id,.6])));
  assert.ok([...assets.models.values()].every(m=>Math.abs(m.tail.rotation.y)>.01));
  const counts=new Map([...assets.resources].map(r=>[r,0]));for(const r of counts.keys())r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
  assets.dispose();assets.dispose();assert.ok([...counts.values()].every(n=>n===1));
});

test('whole coral replacements stay inside the physical colony envelopes and share batched geometry',()=>{
  const geometries=shallowNaturalCoralGeometries();assert.equal(new Set(Object.values(geometries).map(g=>g.userData.form)).size,4);
  for(const g of Object.values(geometries)){
    const p=g.getAttribute('position'),n=g.getAttribute('normal');
    for(let i=0;i<p.count;i++){
      assert.ok(p.getY(i)>=-1e-6&&p.getY(i)<=1.000001,'coral exceeded vertical support envelope');
      assert.ok(Math.hypot(p.getX(i),p.getZ(i))<=.500001,'coral exceeded root radius');
      assert.ok(Number.isFinite(n.getX(i))&&Number.isFinite(n.getY(i))&&Number.isFinite(n.getZ(i)));
    }g.dispose();
  }
  const world=new ShallowSampleScene(),corals=world.environment.children.filter(o=>o.name.startsWith('Living coral /'));
  const matrix=new THREE.Matrix4(),scale=new THREE.Vector3();let count=0;
  for(const mesh of corals){
    assert.ok(mesh.isInstancedMesh&&mesh.receiveShadow);count+=mesh.count;
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);scale.setFromMatrixScale(matrix);assert.ok(scale.x>0&&scale.y>0&&scale.z>0);}
  }
  assert.ok(count>0&&count<world.model.corals.length,'camera should submit only visible crown instances');
  assert.equal(world.coralBatches.reduce((n,b)=>n+b.rows.length,0),world.model.corals.length,'culling deleted authored colonies');
  assert.ok(corals.length<=22,'draw groups should scale with source families and two LODs, not colony count');
  world.dispose();
});

test('finite sample is deterministic and has distinct animal communities, not scene clones',()=>{
  const a=createShallowSample(55),b=createShallowSample(55),other=createShallowSample(56);
  assert.deepEqual(a.agents,b.agents);assert.deepEqual(a.rocks,b.rocks);assert.notDeepEqual(a.rocks,other.rocks);
  assert.equal(a.seconds,75);assert.equal(new Set(a.agents.map(x=>x.id)).size,a.agents.length);
  assert.ok(a.agents.length>=240);assert.ok(new Set(a.agents.map(x=>x.speciesId)).size>=30);
  assert.ok(a.agents.some(x=>x.kind==='turtle'));assert.ok(a.agents.some(x=>x.kind==='ray'));
  assert.ok(a.agents.some(x=>x.mode==='crawl'));assert.ok(a.agents.some(x=>x.mode==='fixed'));
});

test('colonies share actual rock support, grass roots are on soft bed, camera crosses a continuous landscape',()=>{
  const model=createShallowSample();
  for(const c of model.corals){const host=model.rocks.find(r=>r.id===c.host);assert.ok(Math.abs(oceanRockHeight(host,c.x,c.z)-c.y)<1e-7);}
  for(const g of model.grass){assert.ok(Math.abs(g.y-model.floor(g.x,g.z))<1e-7);assert.ok(model.surface(g.x,g.z)-g.y<.02);}
  let previous=sampleShallowCamera(model,0),distance=0;
  for(let t=.1;t<=75;t+=.1){const view=sampleShallowCamera(model,t),step=view.position.distanceTo(previous.position);
    assert.ok(step>0&&step<.4,`camera discontinuity at ${t}`);assert.ok(view.position.y>=model.surface(view.position.x,view.position.z,true)+.89);
    assert.ok(view.target.clone().sub(view.position).length()>2.5);distance+=step;previous=view;}
  assert.ok(distance>90&&distance<105);
});

test('nearby communities pass broadside at natural scale; observation motion stays continuous',()=>{
  const world=new ShallowSampleScene();world.camera.aspect=1280/720;world.camera.updateProjectionMatrix();
  for(const encounter of world.model.encounters){
    world.update(encounter.time);world.camera.updateMatrixWorld(true);
    let inFrame=0,broadside=0;const sizes=[];
    for(const a of encounter.agents){
      const p=new THREE.Vector3(a.position.x,a.position.y,a.position.z),distance=p.distanceTo(world.camera.position);
      const view=p.clone().sub(world.camera.position).normalize(),forward=new THREE.Vector3(Math.cos(a.heading),0,Math.sin(a.heading));
      const side=Math.sqrt(Math.max(0,1-forward.dot(view)**2)),ndc=p.clone().project(world.camera);
      if(distance<8&&Math.abs(ndc.x)<.85&&Math.abs(ndc.y)<.8&&ndc.z>-1&&ndc.z<1){
        inFrame++;if(side>.7)broadside++;sizes.push(a.sizeM*side/distance*720/(2*Math.tan(58*Math.PI/360)));
      }
    }
    assert.ok(inFrame>=encounter.agents.length*.9,`${encounter.label} too distant or out of frame`);
    assert.ok(broadside>=inFrame*.8,`${encounter.label} is mostly nose-on`);
    sizes.sort((a,b)=>a-b);assert.ok(sizes[Math.floor(sizes.length/2)]>25,`${encounter.label} still has tiny body envelopes`);
  }
  let prior=0,previousPosition=null,previousDirection=null;
  for(let i=0;i<=750;i++){
    const t=i/10,progress=sampleRouteProgress(t);assert.ok(progress>=prior&&progress<=1);prior=progress;
    world.update(t);const direction=world.camera.getWorldDirection(new THREE.Vector3());
    if(previousPosition){assert.ok(world.camera.position.distanceTo(previousPosition)<.4);assert.ok(direction.angleTo(previousDirection)<.1,'hard camera turn');}
    const turtles=world.model.encounters.find(e=>e.label==='草床旁的海龟').agents;
    const [a,b]=turtles;assert.ok(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>a.clearance.radius+b.clearance.radius,'turtle bodies overlap');
    previousPosition=world.camera.position.clone();previousDirection=direction;
  }
  assert.equal(prior,1);world.dispose();
});

test('full 75 model seconds retain identities and body clearance; shoals face their individual movement and all mobile guilds move',()=>{
  const world=new ShallowSampleScene(),model=world.model,ids=model.agents.map(a=>a.id),initial=model.agents.map(a=>({...a.position}));
  const mobile=new Set();
  for(let frame=0;frame<=450;frame++){
    const t=frame/6;world.update(t);
    for(let i=0;i<model.agents.length;i++){
      const a=model.agents[i];assert.ok(Object.values(a.position).every(Number.isFinite));
      assert.ok(a.position.y-a.clearance.bottom>=model.surface(a.position.x,a.position.z)-1e-6,`${a.id} entered substrate`);
      if(Math.hypot(a.position.x-initial[i].x,a.position.z-initial[i].z)>.05)mobile.add(a.mode);
    }
    for(const species of ['blue-and-gold-fusilier','unidentified-reef-fish','doubleline-fusilier']){
      const school=model.agents.filter(a=>a.speciesId===species);
      for(const a of school)assert.ok(Math.abs(a.heading-Math.atan2(a.velocity.z,a.velocity.x))<1e-10,'fish does not face its actual motion');
      assert.ok(new Set(school.map(a=>a.heading.toFixed(4))).size>1,'shoal still rotates as one rigid object');
    }
  }
  assert.deepEqual(model.agents.map(a=>a.id),ids);assert.ok(mobile.has('school')&&mobile.has('cruise')&&mobile.has('crawl'));assert.ok(!mobile.has('fixed'));
  const final=JSON.stringify(model.agents);world.update(SHALLOW_SAMPLE_SECONDS);assert.equal(JSON.stringify(model.agents),final);
  let draws=0;world.scene.traverse(o=>{if(o.isMesh)draws++;});assert.ok(draws<350,'population must remain batched');
  let disposals=0;const geometry=world.resources.find(r=>r.isBufferGeometry);geometry.addEventListener('dispose',()=>disposals++);
  world.dispose();world.dispose();assert.equal(disposals,1);assert.equal(world.animals.templates.entities.size,0);
});

test('credited artist fish preserve source colouring and bounded source poses, including late-load disposal',async()=>{
  const source=JSON.parse(fs.readFileSync(new URL('../public/assets/shallow-artist/provenance.json',import.meta.url)));
  assert.match(source.license,/CC-BY-4.0|CC BY 4.0/);assert.match(source.author,/LasquetiSpice/);
  const assets=new ShallowArtistFish(),v=new THREE.Vector3();
  for(const id of SHALLOW_ARTIST_FISH_IDS){
    const model=assets.create(id),g=model.root.children[0].geometry;
    assert.ok(g.index.count/3>900&&g.index.count/3<1100);
    assert.ok(Math.abs(g.attributes.position.array.filter((_,i)=>i%3===0).reduce((a,b)=>Math.max(a,b),-Infinity)-g.attributes.position.array.filter((_,i)=>i%3===0).reduce((a,b)=>Math.min(a,b),Infinity)-1)<1e-5);
    assert.ok(g.attributes.color.count===g.attributes.position.count&&g.attributes.color.array.every(Number.isFinite));
    for(let i=0;i<g.attributes.position.count;i+=11)for(let t=0;t<4;t+=.13){sampleArtistVertex(g,i,t,.87,v);assert.ok(g.boundingBox.containsPoint(v),'source animation escaped full-body clearance');}
  }
  const pending=[],textures=[];
  const loading=assets.loadTextures({loader:{loadAsync:()=>new Promise(resolve=>pending.push(resolve))}});
  assets.sealed=true;
  for(const resolve of pending){const texture=new THREE.Texture();texture.userData.disposals=0;texture.addEventListener('dispose',()=>texture.userData.disposals++);textures.push(texture);resolve(texture);}
  await loading;assert.ok(textures.every(t=>t.userData.disposals===1));assert.ok([...assets.models.values()].every(m=>!m.material.map));assets.dispose();
});

test('complete playback metrics retain full runs, freeze spikes, resolution changes and interrupted-run status',()=>{
  const d=createShallowPlaybackMetrics();d.start(0,{speed:1,width:1920,height:1080});
  for(let i=1;i<=4500;i++)d.frame(i*1000/60,1000/60,i/60,i<2000?1:.85);
  d.finish(75000);const full=d.metrics.runs[0];assert.equal(full.intervalsMs.length,4500);assert.equal(full.elapsedWallSeconds,75);
  assert.ok(Math.abs(full.averageFps-60)<1e-7);assert.ok(full.p95FrameMs<17);assert.equal(full.resolutionHistory.length,2);assert.ok(full.uninterrupted);
  d.start(100000,{speed:1});d.frame(100016,16,.016,1);d.frame(100400,384,.116,1);d.interrupt('background');d.finish(180000);
  assert.equal(d.metrics.runs[1].maxFrameMs,384);assert.equal(d.metrics.runs[1].uninterrupted,false);
  d.start(200000,{});d.start(300000,{});assert.equal(d.metrics.runs.length,3);
});

test('reef passage includes attached and crawling residents on clear rock, with separate fish patrols',()=>{
  const world=new ShallowSampleScene(),model=world.model,{residents,fish}=model.reefCommunity;
  world.camera.aspect=1280/720;world.camera.updateProjectionMatrix();
  const visible=new Set(),original=new Map(residents.map(a=>[a.id,{...a.position}]));
  for(let t=0;t<=75;t+=1){
    world.update(t);world.camera.updateMatrixWorld(true);
    for(const a of residents){
      const host=model.rocks.find(r=>r.id===a.host),r=a.clearance.radius;
      for(let i=0;i<8;i++){
        const x=a.position.x+r*Math.cos(i*Math.PI/4),z=a.position.z+r*Math.sin(i*Math.PI/4),height=oceanRockHeight(host,x,z);
        assert.ok(height!==null&&height>model.floor(x,z),`${a.id} lost its hard-bottom footprint`);
      }
      if(a.mode==='fixed')assert.deepEqual(a.position,original.get(a.id));
      if(t>=14&&t<=29){
        const p=new THREE.Vector3(a.position.x,a.position.y,a.position.z),distance=p.distanceTo(world.camera.position),ndc=p.project(world.camera);
        const pixels=r*2/distance*720/(2*Math.tan(58*Math.PI/360));
        if(Math.abs(ndc.x)<.95&&Math.abs(ndc.y)<.95&&ndc.z>-1&&ndc.z<1&&pixels>18)visible.add(a.speciesId);
      }
    }
    for(let i=0;i<residents.length;i++)for(let j=i+1;j<residents.length;j++){
      const a=residents[i],b=residents[j];assert.ok(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>a.clearance.radius+b.clearance.radius,`${a.id} and ${b.id} overlap`);
    }
  }
  for(const species of ['fluted-giant-clam','tropical-urchin','tube-sponge','shallow-feather-star','day-octopus','spotted-reef-crab','painted-spiny-lobster'])
    assert.ok(visible.has(species),`${species} has no near passage in the native view`);
  const patrol=fish.filter(a=>a.reefPatrol);assert.equal(new Set(patrol.map(a=>a.speciesId)).size,3);
  assert.ok(patrol.some(a=>Math.abs(a.pitch)>.01),'parrotfish patrol must visibly rise or dip');
  assert.equal(world.animals.contactFauna.clock.value,75);
  for(const species of ['day-octopus','spotted-reef-crab']){
    const body=world.animals.contactFauna.models.get(species);assert.ok(body);
    assert.equal(world.animals.templates.getObject(`sample-template-${species}`),null,'unused legacy animal must not be allocated');
    assert.ok(!world.animals.cephalopods.models.has(species)&&!world.animals.benthic.models.has(species));
    for(const part of body.root.children){
      const shader={uniforms:{},fragmentShader:'#include <alphamap_fragment>',vertexShader:'#include <common>\n#include <begin_vertex>'};part.material.onBeforeCompile(shader);
      assert.equal(shader.uniforms.contactTime.value,75);assert.ok(shader.vertexShader.includes('contactWeight'));
    }
  }
  const lobster=world.animals.templates.getObject('sample-template-painted-spiny-lobster');
  assert.ok(lobster.userData.motion.legs.some(p=>Math.abs(p.rotation.z)>.00001),'moving lobster must animate its gait');
  for(const batch of world.animals.batches)for(const part of batch.parts){
    for(let parent=part.source;parent;parent=parent.parent)assert.ok(parent.visible,'hidden LOD must not become an extra instanced body');
  }
  world.dispose();
});
