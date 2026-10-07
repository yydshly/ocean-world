import * as THREE from 'three';
import { kelpNearBottomLifeSpeciesCatalog, kelpNearBottomLifeSpeciesById } from '../kelpNearBottomLifeSpecies.js';

// One complete source-informed kit per persisted animal. CW/TL/DW
// measures, whole-body clearance and visible fixed mouth remain separate.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const KELP_NEAR_BOTTOM_LIFE_ASSET_VERSION = 1;
export const KELP_NEAR_BOTTOM_LIFE_IDS = Object.freeze(kelpNearBottomLifeSpeciesCatalog.map(s => s.id));
export const KELP_NEAR_BOTTOM_LIFE_ENVELOPES = Object.freeze(Object.fromEntries(kelpNearBottomLifeSpeciesCatalog.map(s => [s.id,
  Object.freeze({ sizeMeasure: s.sizeMeasure, horizontalRadius: s.normalizedEnvelope.horizontalRadiusUnits,
    minY: s.normalizedEnvelope.y[0], maxY: s.normalizedEnvelope.y[1], pitchLimit: s.maximumDisplayPitchRad,
    localBounds: Object.freeze({ minX: s.normalizedEnvelope.x[0], maxX: s.normalizedEnvelope.x[1],
      minZ: s.normalizedEnvelope.z[0], maxZ: s.normalizedEnvelope.z[1] }) })])));
export const isKelpNearBottomLifeSpecies = id => KELP_NEAR_BOTTOM_LIFE_IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.kelpNearBottomLifeResources.has(key)) { root.userData.kelpNearBottomLifeResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, c) => { const i = positions.length / 3; positions.push(...p); colors.push(...c); return i; };
  const face = (a, b, c) => indices.push(a, b, c);
  function body(profile, tint, sides = 24) {
    const start = positions.length / 3;
    for (const [x, y, z] of profile) for (let i = 0; i <= sides; i++) {
      const angle = TAU * i / sides; const point=[x, Math.cos(angle)*y, Math.sin(angle)*z];vertex(point,typeof tint==='function'?tint(...point):tint);
    }
    for (let r = 0; r < profile.length - 1; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * (sides + 1) + i, b = a + sides + 1; face(a, b, a + 1); face(a + 1, b, b + 1);
    }
    for (const [r, reverse] of [[0, false], [profile.length - 1, true]]) {
      const point=[profile[r][0],0,0],c=vertex(point,typeof tint==='function'?tint(...point):tint);
      for (let i = 0; i < sides; i++) { const a = start + r * (sides + 1) + i; reverse ? face(c, a + 1, a) : face(c, a, a + 1); }
    }
  }
  function ellipsoid(center, scale, tint, sides = 16, rows = 8) {
    const start = positions.length / 3;
    for (let r = 0; r <= rows; r++) for (let i = 0; i <= sides; i++) {
      const lat = Math.PI * r / rows, angle = TAU * i / sides;
      vertex([center[0] + Math.sin(lat) * Math.cos(angle) * scale[0], center[1] + Math.cos(lat) * scale[1],
        center[2] + Math.sin(lat) * Math.sin(angle) * scale[2]], tint);
    }
    for (let r = 0; r < rows; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * (sides + 1) + i, b = a + sides + 1;
      if (r) face(a, a + 1, b); if (r < rows - 1) face(a + 1, b + 1, b);
    }
  }
  function fin(points, tint, thickness = .003) {
    const start = positions.length / 3, n = points.length;
    for (const dz of [-thickness, thickness]) for (const p of points) vertex([p[0], p[1], p[2] + dz], tint);
    for (let i = 1; i < n - 1; i++) { face(start, start + i, start + i + 1); face(start + n, start + n + i + 1, start + n + i); }
    for (let i = 0; i < n; i++) { const a = start + i, b = start + (i + 1) % n; face(a, a + n, b); face(b, a + n, b + n); }
  }
  function tube(points, radii, tint, sides = 7) {
    const start = positions.length / 3; let previous;
    for (let r = 0; r < points.length; r++) {
      const p = new THREE.Vector3(...points[r]), tangent = new THREE.Vector3(...points[Math.min(r + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(r - 1, 0)])).normalize();
      let a = previous?.clone().addScaledVector(tangent, -previous.dot(tangent));
      if (!a || a.lengthSq() < 1e-7) a = new THREE.Vector3().crossVectors(tangent,
        Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
      a.normalize(); previous = a; const b = new THREE.Vector3().crossVectors(tangent, a);
      for (let i = 0; i < sides; i++) vertex(p.clone().addScaledVector(a, Math.cos(TAU * i / sides) * radii[r])
        .addScaledVector(b, Math.sin(TAU * i / sides) * radii[r]).toArray(), tint);
    }
    for (let r = 0; r < points.length - 1; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * sides + i, b = start + r * sides + (i + 1) % sides; face(a, b, a + sides); face(b, b + sides, a + sides);
    }
    for (const [r, reverse] of [[0, false], [points.length - 1, true]]) {
      const c = vertex(points[r], tint); for (let i = 0; i < sides; i++) {
        const a = start + r * sides + i, b = start + r * sides + (i + 1) % sides; reverse ? face(c, a, b) : face(c, b, a);
      }
    }
  }
  return { vertex, face, body, ellipsoid, fin, tube, finish() {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  } };
}
function add(root, key, make, parent = root) {
  const geometry = share(root, `geometry/${root.userData.speciesId}/${key}`, make);
  const material = share(root, 'material/tissue', () => new THREE.MeshStandardMaterial({ color: 0xffffff,
    vertexColors: true, roughness: .8, metalness: 0, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0 }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
const red=[.55,.23,.18],black=[.065,.07,.063],cream=[.72,.61,.47],rockTint=[.43,.36,.28],hornTint=[.50,.44,.34],rayTint=[.48,.40,.29];
function mouth(root,point,scale,tint=black){return add(root,'fixed actual mouth',()=>{const b=builder();
  b.ellipsoid([point.x,point.y+scale[1],point.z],scale,tint);return b.finish();});}
function crab(root,p,s){
  p.body=add(root,'unit-width broad red carapace ventral body and stalked eyes',()=>{const b=builder();
    b.ellipsoid([0,.28,0],[.36,.19,.5],red,32,12);b.ellipsoid([.04,.18,0],[.28,.085,.33],cream);
    for(const side of[-1,1]){b.tube([[.28,.35,side*.16],[.32,.42,side*.20]],[.018,.013],red,7);
      b.ellipsoid([.32,.433,side*.20],[.031,.026,.028],black);}
    return b.finish();});
  p.feedingOrgan=mouth(root,s.morphology.feedingPointLocal,[.027,.015,.025]);p.legs=[];
  for(const foot of s.morphology.footContactPointsLocal){const leg=new THREE.Group();leg.position.set(foot.x,0,foot.z);leg.scale.z=Math.sign(foot.z);root.add(leg);p.legs.push(leg);
    add(root,'whole walking leg with fixed real sole',()=>{const b=builder();
      b.tube([[.015,.19,-.45],[-.075,.14,-.25],[-.025,.068,-.10],[0,.012,0]],[.035,.027,.017,.009],red,8);
      b.ellipsoid([0,.006,0],[.028,.006,.019],black,12,6);return b.finish();},leg);}
  p.claws=[];
  for(const side of[-1,1]){const claw=new THREE.Group();claw.position.set(.27,.20,side*.36);claw.scale.z=side;claw.userData.side=side;root.add(claw);p.claws.push(claw);
    add(root,'large red claw with two black terminal fingers',()=>{const b=builder();
      b.tube([[0,.02,0],[.17,.06,.06],[.34,.05,.10]],[.065,.069,.063],red,10);
      b.ellipsoid([.35,.045,.10],[.16,.12,.13],red,16,8);
      b.tube([[.39,.085,.10],[.49,.10,.11],[.55,.016,.10]],[.041,.027,.007],black,8);
      b.tube([[.38,-.045,.10],[.50,-.055,.11],[.55,-.012,.10]],[.031,.022,.006],black,8);return b.finish();},claw);}
  root.userData.anatomy={bodyForm:'broad-red-crab',walkingLegs:8,claws:2,blackTerminalFingers:true,stalkedEyes:2};
  root.userData.measureReferences={carapaceWidth:1,carapaceMinZ:-.5,carapaceMaxZ:.5,legsAndClawsExcluded:true};
  root.userData.footContactPointsLocal=s.morphology.footContactPointsLocal.map(q=>({...q}));
}
function rockfish(root,p,s){
  p.body=add(root,'deep mottled body complete head eyes and opercula',()=>{const b=builder();
    b.body([[-.32,.022,.016],[-.24,.092,.035],[-.10,.168,.064],[.09,.181,.082],[.25,.154,.078],[.38,.104,.057],[.48,.037,.023],[.5,.007,.008]],
      (x,y,z)=>Math.sin(x*24+z*16)*Math.cos(y*18-1.7)>.44?[.75,.68,.58]:rockTint);
    b.ellipsoid([.41,-.039,0],[.085,.033,.043],rockTint);
    for(const side of[-1,1]){b.ellipsoid([.366,.055,side*.054],[.022,.022,.012],cream);
      b.ellipsoid([.371,.055,side*.063],[.012,.013,.005],black);
      b.tube([[.27,.11,side*.052],[.225,.02,side*.079],[.26,-.10,side*.054]],[.003,.003,.002],cream,5);}
    return b.finish();});
  p.feedingOrgan=mouth(root,s.morphology.feedingPointLocal,[.019,.015,.022]);
  p.fixedFins=add(root,'connected spiny and soft dorsal plus anal and paired pelvic fins',()=>{const b=builder();
    b.fin([[.27,.122,0],[.25,.23,0],[.05,.25,0],[-.10,.212,0],[-.10,.145,0]],rockTint);
    for(let i=0;i<9;i++){const x=.24-i*.038;b.fin([[x,.205,0],[x-.012,.278-i*.005,0],[x-.029,.210,0]],cream,.002);}
    b.fin([[-.08,.15,0],[-.13,.235,0],[-.26,.16,0],[-.29,.041,0]],rockTint);
    b.fin([[.005,-.16,0],[-.08,-.24,0],[-.23,-.125,0],[-.27,-.028,0]],rockTint);
    for(const side of[-1,1])b.fin([[.11,-.135,side*.025],[.01,-.215,side*.070],[-.065,-.158,side*.034]],rockTint);
    return b.finish();});
  p.tail=new THREE.Group();p.tail.position.x=-.31;root.add(p.tail);
  add(root,'full shallowly concave caudal fin',()=>{const b=builder();b.fin([[0,.023,0],[-.19,.118,0],[-.16,.035,0],[-.175,0,0],[-.16,-.035,0],[-.19,-.118,0],[0,-.023,0]],rockTint);return b.finish();},p.tail);
  p.pectoralFins=pairedPectorals(root,[.20,-.045,.070],[[0,0,0],[-.15,.065,.105],[-.21,-.051,.097],[-.14,-.078,.033]],rockTint);
  root.userData.anatomy={bodyForm:'deep-mottled-rockfish',connectedSpinySoftDorsal:true,tail:'shallowly-concave',pectoralFins:2,pelvicFins:2,analFins:1};
  root.userData.measureReferences={totalLength:1,snoutX:.5,distalCaudalFinX:-.5};
}
function pairedPectorals(root,position,points,tint){return[-1,1].map(side=>{const fin=new THREE.Group();fin.position.set(position[0],position[1],position[2]*side);fin.scale.z=side;fin.userData.side=side;root.add(fin);
  add(root,'paired pectoral fin',()=>{const b=builder();b.fin(points,tint);return b.finish();},fin);return fin;});}
function horn(root,p,s){
  p.body=add(root,'robust blunt head high brows and five paired gill slits',()=>{const b=builder();
    b.body([[-.35,.019,.018],[-.24,.047,.045],[-.07,.076,.071],[.12,.091,.095],[.29,.094,.107],[.41,.076,.091],[.48,.042,.064],[.5,.010,.044]],
      (x,y,z)=>Math.sin(x*47+y*19)*Math.sin(z*41-x*8)>.62?[.27,.23,.18]:hornTint);
    for(const side of[-1,1]){b.ellipsoid([.369,.068,side*.066],[.017,.015,.009],black);
      b.ellipsoid([.367,.087,side*.063],[.039,.016,.022],hornTint);
      for(let i=0;i<5;i++){const x=.25-i*.021,z=(.092-i*.005)*side;b.tube([[x,.054,z],[x-.004,-.048,z]],[.0025,.0017],black,4);}}
    return b.finish();});p.feedingOrgan=mouth(root,s.morphology.feedingPointLocal,[.046,.018,.039]);
  p.fixedFins=add(root,'two spined dorsals anal and paired pelvic fins',()=>{const b=builder();
    b.fin([[.10,.084,0],[.03,.276,0],[-.095,.098,0]],hornTint);
    b.tube([[.104,.087,0],[.107,.268,0],[.104,.294,0]],[.008,.003,.0008],cream,6);
    b.fin([[-.205,.046,0],[-.255,.179,0],[-.315,.028,0]],hornTint);
    b.tube([[-.201,.048,0],[-.202,.178,0],[-.211,.196,0]],[.005,.002,.0007],cream,6);
    b.fin([[-.213,-.041,0],[-.260,-.127,0],[-.32,-.026,0]],hornTint);
    for(const side of[-1,1])b.fin([[-.11,-.046,side*.039],[-.22,-.088,side*.143],[-.24,-.027,side*.052]],hornTint);
    return b.finish();});
  p.pectoralFins=pairedPectorals(root,[.12,-.037,.085],[[0,0,0],[-.225,-.034,.208],[-.153,.010,.151],[-.07,.018,.036]],hornTint);
  p.tail=new THREE.Group();p.tail.position.x=-.34;root.add(p.tail);
  add(root,'complete unequal-lobed caudal fin',()=>{const b=builder();b.fin([[0,.021,0],[-.095,.119,0],[-.16,.176,0],[-.143,.10,0],[-.060,.037,0],[-.055,-.018,0],[-.132,-.075,0],[-.096,-.036,0],[0,-.020,0]],hornTint);return b.finish();},p.tail);
  root.userData.anatomy={bodyForm:'blunt-headed-benthic-shark',highBrows:true,dorsalFins:2,dorsalSpines:2,analSpines:0,analFins:1,gillSlitsPerSide:5,pectoralFins:2,pelvicFins:2,tail:'heterocercal'};
  root.userData.measureReferences={totalLength:1,snoutX:.5,distalCaudalFinX:-.5};
}
function ray(root,p,s){
  p.disc=add(root,'fixed central round disc eyes and posterior spiracles',()=>{const b=builder();
    b.ellipsoid([0,.009,0],[.485,.055,.175],rayTint,32,12);
    for(const side of[-1,1]){b.ellipsoid([.225,.065,side*.091],[.026,.019,.026],rayTint);
      b.ellipsoid([.232,.079,side*.094],[.012,.010,.013],black);
      b.ellipsoid([.154,.058,side*.100],[.028,.007,.019],black);}
    return b.finish();});p.feedingOrgan=mouth(root,s.morphology.feedingPointLocal,[.028,.022,.031]);
  p.wings=[];
  for(const side of[-1,1]){const wing=new THREE.Group();wing.position.z=side*.13;wing.scale.z=side;wing.userData.side=side;root.add(wing);p.wings.push(wing);
    add(root,'rounded full pectoral disc edge',()=>{const b=builder(),rows=20,sides=20;
      for(const lower of[false,true])for(let r=0;r<=rows;r++){const z=.37*r/rows,half=.485*Math.sqrt(Math.max(0,1-((z+.13)/.5)**2));
        for(let i=0;i<=sides;i++){const x=(i/sides*2-1)*half,u=(x/.485)**2+((z+.13)/.5)**2;
          b.vertex([x,lower?-.024*Math.max(0,1-u):.042*Math.max(0,1-u),z],lower?cream:rayTint);}}
      const layer=(rows+1)*(sides+1);
      for(let r=0;r<rows;r++)for(let i=0;i<sides;i++){const a=r*(sides+1)+i,c=a+sides+1;b.face(a,c,a+1);b.face(a+1,c,c+1);b.face(a+layer,a+1+layer,c+layer);b.face(a+1+layer,c+1+layer,c+layer);}
      for(const r of[0,rows])for(let i=0;i<sides;i++){const a=r*(sides+1)+i;b.face(a,a+layer,a+1);b.face(a+1,a+layer,a+1+layer);}
      return b.finish();},wing);}
  p.tail=new THREE.Group();p.tail.position.x=-.40;root.add(p.tail);
  add(root,'complete relatively short tail with caudal fin and one sting',()=>{const b=builder();
    b.tube([[0,0,0],[-.23,-.009,0],[-.53,-.014,.005],[-.85,-.020,.006],[-1.01,-.022,.005]],[.022,.018,.013,.008,.002],rayTint,9);
    b.fin([[-.72,-.019,0],[-.86,.013,0],[-1.02,-.022,0],[-.87,-.055,0]],rayTint,.020);
    b.tube([[-.22,.006,0],[-.31,.050,0],[-.47,.070,0]],[.009,.004,.0008],cream,6);return b.finish();},p.tail);
  root.userData.anatomy={bodyForm:'near-circular-round-stingray',eyes:2,posteriorSpiracles:2,ventralMouth:true,tailFin:true,tailSting:true,cephalicLobes:false};
  root.userData.measureReferences={discWidth:1,discMinZ:-.5,discMaxZ:.5,tailAndStingExcludedFromDiscWidth:true};
}
export function createKelpNearBottomLifeAsset(speciesOrId){
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id,s=kelpNearBottomLifeSpeciesById[id];if(!s)throw new TypeError('Unknown kelp near-bottom representative.');
  const root=new THREE.Group(),parts={};root.name=s.commonName;
  Object.assign(root.userData,{speciesId:id,scientificName:s.scientificName,identityLevel:s.identityLevel,kind:s.kind,sizeMeasure:s.sizeMeasure,phase:0,assetVersion:1,
    kelpNearBottomLifeResources:new Set(),kelpNearBottomLifeDisposed:false,localEnvelope:KELP_NEAR_BOTTOM_LIFE_ENVELOPES[id],feedingPointLocal:{...s.morphology.feedingPointLocal},
    originConvention:s.motionMode==='grounded'?'foot plane; +Y actual support normal and +X projected heading':'measurement midpoint; +X forward +Y world up',
    morphologyStatus:'complete source-informed authored whole kit; ratios and bounded poses are uncalibrated display choices'});
  instances.add(root);try{if(id==='red-rock-crab')crab(root,parts,s);else if(id==='gopher-rockfish')rockfish(root,parts,s);else if(id==='horn-shark')horn(root,parts,s);else ray(root,parts,s);
    root.userData.kelpNearBottomLifeParts=parts;return root;}catch(error){disposeKelpNearBottomLifeAsset(root);throw error;}
}
export function animateKelpNearBottomLifeAsset(root,nativeTimeSec,agent={}){
  const p=root?.userData.kelpNearBottomLifeParts;if(!p||root.userData.kelpNearBottomLifeDisposed||agent.alive===false)return;
  const time=Number.isFinite(nativeTimeSec)?nativeTimeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0,moving=Math.hypot(agent.velocity?.x??0,agent.velocity?.y??0,agent.velocity?.z??0)>1e-8;
  if(root.userData.speciesId==='red-rock-crab'){
    p.legs.forEach((leg,i)=>{leg.rotation.y=moving?Math.sin(time*3+phase+i*Math.PI)*.018:0;});
    const feeding=Number.isFinite(agent.lastFeedAt)&&time>=agent.lastFeedAt&&time-agent.lastFeedAt<.8;
    p.claws.forEach((claw,i)=>{claw.rotation.y=feeding?Math.sin(time*1.7+phase+i)*.014:0;});
  }else if(root.userData.speciesId==='round-stingray'){
    p.wings.forEach(wing=>{wing.rotation.x=moving?wing.userData.side*Math.sin(time*2.2+phase)*.095:0;});p.tail.rotation.y=moving?Math.sin(time*1.1+phase)*.026:0;
  }else{const shark=root.userData.speciesId==='horn-shark';p.tail.rotation.y=moving?Math.sin(time*(shark?2.6:4)+phase)*(shark?.075:.13):0;
    p.pectoralFins.forEach(fin=>{fin.rotation.x=moving?fin.userData.side*Math.sin(time*2.1+phase)*.035:0;});}
  root.userData.kelpNearBottomLifeLastTimeSec=time;
}
export function disposeKelpNearBottomLifeAsset(root){
  if(!root||root.userData.kelpNearBottomLifeDisposed)return;root.userData.kelpNearBottomLifeDisposed=true;
  for(const key of root.userData.kelpNearBottomLifeResources??[]){const row=resources.get(key);if(row&&--row.refs<=0){row.value.dispose();resources.delete(key);}}
  root.userData.kelpNearBottomLifeResources?.clear();instances.delete(root);root.removeFromParent();root.clear();
}
export const kelpNearBottomLifeAssetStats=()=>({resources:resources.size,instances:instances.size});
