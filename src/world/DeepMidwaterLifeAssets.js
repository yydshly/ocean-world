import * as THREE from 'three';
import { deepMidwaterLifeSpeciesCatalog, deepMidwaterLifeSpeciesById } from '../deepMidwaterLifeSpecies.js';

// Independent complete kits. The catalogue's measured axis, conservative
// whole-body clearance and fixed real capture organ are distinct contracts.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const DEEP_MIDWATER_LIFE_ASSET_VERSION = 1;
export const DEEP_MIDWATER_LIFE_IDS = Object.freeze(deepMidwaterLifeSpeciesCatalog.map(s => s.id));
export const DEEP_MIDWATER_LIFE_ENVELOPES = Object.freeze(Object.fromEntries(deepMidwaterLifeSpeciesCatalog.map(s => [s.id,
  Object.freeze({ sizeMeasure: s.sizeMeasure, horizontalRadius: s.normalizedEnvelope.horizontalRadiusUnits,
    minY: s.normalizedEnvelope.y[0], maxY: s.normalizedEnvelope.y[1], pitchLimit: s.kind === 'jellyfish' ? 0 : .12,
    localBounds: Object.freeze({ minX: s.normalizedEnvelope.x[0], maxX: s.normalizedEnvelope.x[1],
      minZ: s.normalizedEnvelope.z[0], maxZ: s.normalizedEnvelope.z[1] }) })])));
export const isDeepMidwaterLifeSpecies = id => DEEP_MIDWATER_LIFE_IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.deepMidwaterLifeResources.has(key)) { root.userData.deepMidwaterLifeResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, c) => { const i = positions.length / 3; positions.push(...p); colors.push(...c); return i; };
  const face = (a, b, c) => indices.push(a, b, c);
  function body(profile, tint, sides = 24) {
    const start = positions.length / 3;
    for (const [x, y, z] of profile) for (let i = 0; i <= sides; i++) {
      const angle = TAU * i / sides; vertex([x, Math.cos(angle) * y, Math.sin(angle) * z], tint);
    }
    for (let r = 0; r < profile.length - 1; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * (sides + 1) + i, b = a + sides + 1; face(a, b, a + 1); face(a + 1, b, b + 1);
    }
    for (const [r, reverse] of [[0, false], [profile.length - 1, true]]) {
      const c = vertex([profile[r][0], 0, 0], tint);
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
function add(root, key, make, parent = root, translucent = false) {
  const geometry = share(root, `geometry/${root.userData.speciesId}/${key}`, make);
  const material = share(root, translucent ? 'material/gelatinous' : 'material/tissue', () => new THREE.MeshStandardMaterial({ color: 0xffffff,
    vertexColors: true, roughness: .72, metalness: 0, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0,
    transparent: translucent, opacity: translucent ? .78 : 1, depthWrite: !translucent }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function helmet(root, parts) {
  const red = [.43,.075,.10], edge = [.53,.10,.13];
  parts.bell = new THREE.Group(); root.add(parts.bell);
  parts.bellSurface = add(root, 'pointed high helmet bell', () => { const b = builder();
    b.body([[0,.50,.50],[.20,.47,.47],[.49,.36,.36],[.80,.23,.23],[1.05,.105,.105],[1.20,.008,.008]],red,32);
    const g=b.finish();g.rotateZ(Math.PI/2);return g;
  }, parts.bell, true);
  parts.rim = add(root, 'sixteen bell-margin lappets and four rhopalia', () => { const b=builder();
    for(let i=0;i<16;i++){const a=TAU*i/16;b.ellipsoid([Math.cos(a)*.47,-.047,Math.sin(a)*.47],[.066,.076,.055],edge,10,5);}
    for(let i=0;i<4;i++){const a=TAU*(i+.5)/4;b.ellipsoid([Math.cos(a)*.49,-.027,Math.sin(a)*.49],[.031,.022,.028],[.62,.31,.25],8,4);}
    // A short connected manubrium; no invented four long oral arms.
    b.ellipsoid([0,-.11,0],[.12,.13,.12],red);return b.finish();
  });
  parts.tentacles=[];
  for(let i=0;i<12;i++){
    const a=TAU*i/12,pivot=new THREE.Group();root.add(pivot);parts.tentacles.push(pivot);
    const radius=r=>[Math.cos(a)*r,Math.sin(a)*r];
    const line=i===0?[[.48,-.04,0],[.61,-.59,0],[.55,-1.31,0],[.50,-1.90,0]]:
      [[...radius(.48).slice(0,1),-.04,radius(.48)[1]],[radius(.62)[0],-.52,radius(.62)[1]],
        [radius(.68)[0],-1.18,radius(.68)[1]],[radius(.63)[0],-1.86,radius(.63)[1]]];
    const mesh=add(root, `complete margin tentacle ${i}`,()=>{const b=builder();b.tube(line,[.026,.021,.013,.005],edge,8);return b.finish();},pivot);
    if(i===0){parts.feedingOrgan=mesh;parts.fixedTentacle=pivot;}
  }
  root.userData.anatomy={bodyForm:'high pointed helmet bell',marginTentacles:12,lappets:16,rhopalia:4,longOralArms:0};
  root.userData.measureReferences={bellDiameter:1,rootAtBellMargin:true,neutralRimRadius:.5};
}
function vampire(root, parts) {
  const mantle=[.32,.12,.15],arms=[.42,.14,.18],filament=[.60,.34,.32];
  parts.body=add(root,'unit mantle and compact large-eyed head',()=>{const b=builder();
    b.body([[-.5,.004,.004],[-.42,.20,.21],[-.20,.32,.31],[.07,.34,.33],[.29,.28,.28],[.5,.20,.23]],mantle);
    b.ellipsoid([.57,-.02,0],[.23,.23,.26],mantle);
    for(const side of[-1,1]){b.ellipsoid([.57,.025,side*.235],[.105,.105,.051],[.18,.075,.09]);b.ellipsoid([.585,.025,side*.274],[.058,.064,.020],[.055,.04,.04]);}
    return b.finish();
  });
  parts.fins=[];
  for(const side of[-1,1]){const pivot=new THREE.Group();pivot.position.set(-.11,.06,side*.24);pivot.scale.z=side;root.add(pivot);parts.fins.push(pivot);pivot.userData.side=side;
    add(root,'adult lateral swimming fin',()=>{const b=builder();b.ellipsoid([-.04,.02,.19],[.29,.036,.30],mantle);return b.finish();},pivot);}
  parts.arms=new THREE.Group();parts.arms.position.set(.70,-.08,0);root.add(parts.arms);
  parts.web=add(root,'complete umbrella web between eight arms',()=>{const b=builder(),rings=[[0,.15],[.39,.44],[.83,.56]],n=64;
    for(const dx of[-.012,.012])for(const[x,r]of rings)for(let i=0;i<=n;i++){const a=TAU*i/n;b.vertex([x+dx,Math.cos(a)*r,Math.sin(a)*r],arms);}
    const layer=rings.length*(n+1);for(let r=0;r<rings.length-1;r++)for(let i=0;i<n;i++){const a=r*(n+1)+i,c=a+n+1;b.face(a,c,a+1);b.face(a+1,c,c+1);b.face(a+layer,a+1+layer,c+layer);b.face(a+1+layer,c+1+layer,c+layer);}
    for(const r of[0,rings.length-1])for(let i=0;i<n;i++){const a=r*(n+1)+i;b.face(a,a+1,a+layer);b.face(a+1,a+1+layer,a+layer);}return b.finish();
  },parts.arms);
  parts.armBodies=[];
  for(let i=0;i<8;i++)parts.armBodies.push(add(root,`complete webbed arm ${i} with short inner cirri`,()=>{const b=builder(),a=TAU*i/8;
    const radial=r=>[Math.cos(a)*r,Math.sin(a)*r];b.tube([[0,...radial(.15)],[.39,...radial(.44)],[.83,...radial(.56)],[1.05,...radial(.57)]],[.05,.039,.025,.009],arms,8);
    for(const u of[.25,.5,.75]){const x=u*.84,r=.15+u*.41,p=[x,...radial(r-.018)];for(const side of[-1,1]){const dy=-Math.sin(a)*side*.065,dz=Math.cos(a)*side*.065;b.tube([p,[x+.018,p[1]+dy,p[2]+dz]],[.004,.0008],arms,4);}}
    return b.finish();
  },parts.arms));
  parts.filaments=[];
  const lines=[[[.69,0,.20],[1.45,.04,.24],[2.65,.02,.22],[3.65,-.015,.20],[4.50,0,.20]],
    [[.69,0,-.20],[.92,-.15,-.57],[.36,-.31,-.75],[-.79,-.32,-.66],[-1.97,-.21,-.44]]];
  for(let i=0;i<2;i++){const pivot=new THREE.Group();root.add(pivot);parts.filaments.push(pivot);const mesh=add(root,`complete fine feeding filament ${i}`,()=>{const b=builder();b.tube(lines[i],[.009,.007,.005,.004,.0025],filament,6);return b.finish();},pivot);if(i===0)parts.feedingOrgan=mesh;}
  root.userData.anatomy={bodyForm:'eight-arm webbed vampire squid',arms:8,adultFins:2,retractileFeedingFilaments:2,clubTentacles:0,partialFilamentExtension:true};
  root.userData.measureReferences={mantleLength:1,mantleBackX:-.5,mantleFrontX:.5,armsAndFilamentsExcluded:true};
}
function mysid(root, parts) {
  const red=[.58,.075,.075],dark=[.27,.055,.07];
  parts.body=add(root,'complete rostrum carapace six-segment abdomen and tail fan',()=>{const b=builder();
    b.body([[-.43,.048,.059],[-.34,.075,.078],[-.21,.096,.085],[-.05,.111,.100],[.12,.133,.119],[.28,.096,.096],[.34,.042,.048]],red,24);
    b.tube([[.28,.078,0],[.40,.081,0],[.50,.076,0]],[.025,.014,.0005],red,8);
    for(let i=0;i<6;i++){const x=-.105-i*.057;b.ellipsoid([x,.009,0],[.029,.099-i*.007,.090-i*.005],red,12,6);}
    b.fin([[-.38,.013,0],[-.45,.026,.03],[-.50,.008,0],[-.45,-.021,-.025]],red,.009);
    for(const side of[-1,1])b.fin([[-.39,.015,side*.033],[-.45,.028,side*.126],[-.50,.008,side*.139],[-.48,-.018,side*.067]],red,.010);
    return b.finish();
  });
  parts.feedingOrgan=add(root,'fixed real anterior ventral mouthparts',()=>{const b=builder();
    b.ellipsoid([.17,-.123,0],[.045,.017,.046],dark,16,8);
    for(const side of[-1,1])b.tube([[.23,-.083,side*.055],[.21,-.132,side*.038],[.175,-.14,side*.014]],[.015,.009,.003],red,6);
    return b.finish();
  });
  parts.eyes=add(root,'paired stalked eyes and two pairs of long antennae',()=>{const b=builder();
    for(const side of[-1,1]){b.tube([[.27,.04,side*.054],[.32,.09,side*.125]],[.013,.011],red,7);b.ellipsoid([.32,.09,side*.132],[.030,.026,.029],[.06,.045,.045],12,6);
      b.tube([[.28,-.012,side*.059],[.52,.01,side*.18],[.82,-.025,side*.29],[1.24,-.085,side*.34]],[.013,.010,.006,.001],red,6);
      b.tube([[.29,.02,side*.03],[.48,.15,side*.16],[.74,.21,side*.31],[1.02,.13,side*.49]],[.012,.008,.004,.001],red,6);}
    return b.finish();
  });
  parts.swimmingLegs=[];
  for(const side of[-1,1]){const pivot=new THREE.Group();root.add(pivot);parts.swimmingLegs.push(pivot);pivot.userData.side=side;
    add(root,'thoracic appendages and abdominal swimming paddles',()=>{const b=builder();
      for(let i=0;i<6;i++){const x=.19-i*.055;b.tube([[x,-.064,side*.066],[x-.014,-.175,side*.12],[x+.035,-.273,side*.16]],[.013,.009,.002],red,6);}
      for(let i=0;i<5;i++){const x=-.09-i*.056;b.tube([[x,-.070,side*.050],[x-.026,-.150,side*.09],[x-.073,-.195,side*.11]],[.012,.009,.002],red,6);b.ellipsoid([x-.055,-.165,side*.115],[.026,.031,.012],red,8,4);}
      return b.finish();
    },pivot);}
  root.userData.anatomy={bodyForm:'elongated red lophogastrid mysid',stalkedEyes:2,antennaPairs:2,segmentedAbdomen:true,completeTailFan:true,decapodClaws:0};
  root.userData.measureReferences={rostrumToTelsonLength:1,rostrumTipX:.5,telsonTipX:-.5,antennaeExcludedFromLength:true};
}
export function createDeepMidwaterLifeAsset(speciesOrId) {
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id,s=deepMidwaterLifeSpeciesById[id];
  if(!s)throw new TypeError('Unknown deep midwater-life representative.');
  if(typeof speciesOrId==='object'&&((speciesOrId.scientificName&&speciesOrId.scientificName!==s.scientificName)||
    (speciesOrId.identityLevel&&speciesOrId.identityLevel!==s.identityLevel)))throw new TypeError('Conflicting deep midwater-life identity.');
  const root=new THREE.Group(),parts={};root.name=s.commonName;
  const capture=s.foodCapturePointLocal??s.morphology.foodCapturePointLocal??s.morphology.feedingPointLocal;
  Object.assign(root.userData,{speciesId:id,scientificName:s.scientificName,identityLevel:s.identityLevel,kind:s.kind,sizeMeasure:s.sizeMeasure,phase:0,assetVersion:1,
    deepMidwaterLifeResources:new Set(),deepMidwaterLifeDisposed:false,localEnvelope:DEEP_MIDWATER_LIFE_ENVELOPES[id],foodCapturePointLocal:{...capture},feedingPointLocal:{...capture},
    originConvention:s.kind==='jellyfish'?'bell-margin centre, +Y upright':'measured-axis midpoint, +X forward and +Y world-up',
    morphologyStatus:'Whole source-informed reference; finite ratios, sample counts and motion are uncalibrated display choices.'});
  instances.add(root);try{if(id==='helmet-jelly')helmet(root,parts);else if(id==='vampire-squid')vampire(root,parts);else mysid(root,parts);
    root.userData.deepMidwaterLifeParts=parts;return root;}catch(error){disposeDeepMidwaterLifeAsset(root);throw error;}
}
export function animateDeepMidwaterLifeAsset(root,nativeTimeSec,agent={}) {
  const p=root?.userData.deepMidwaterLifeParts;if(!p||root.userData.deepMidwaterLifeDisposed||agent.alive===false)return;
  const time=Number.isFinite(nativeTimeSec)?nativeTimeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0;
  const moving=Math.hypot(agent.velocity?.x??0,agent.velocity?.y??0,agent.velocity?.z??0)>1e-8;
  const flow=THREE.MathUtils.clamp((agent.localEnvironment?.currentMps??0)/.4,0,1);
  if(root.userData.speciesId==='helmet-jelly'){
    p.bell.scale.y=1+(moving?.025:0)*Math.sin(time*1.7+phase);
    p.tentacles.forEach((pivot,i)=>{if(i===0)return;pivot.rotation.x=flow*Math.sin(time*.7+phase+i)*.023;pivot.rotation.z=flow*Math.sin(time*.65+phase+i*.7)*.023;});
  }else if(root.userData.speciesId==='vampire-squid'){
    p.fins.forEach(fin=>{fin.rotation.x=moving?fin.userData.side*Math.sin(time*2+phase)*.068:0;});
    p.arms.rotation.x=moving?Math.sin(time*.8+phase)*.027:0;
    p.filaments[1].rotation.x=flow*Math.sin(time*.6+phase)*.016;
  }else p.swimmingLegs.forEach(legs=>{legs.rotation.x=moving?legs.userData.side*Math.sin(time*4+phase)*.08:0;});
  root.userData.deepMidwaterLifeLastTimeSec=time;
}
export function disposeDeepMidwaterLifeAsset(root) {
  if(!root||root.userData.deepMidwaterLifeDisposed)return;root.userData.deepMidwaterLifeDisposed=true;
  for(const key of root.userData.deepMidwaterLifeResources??[]){const row=resources.get(key);if(row&&--row.refs<=0){row.value.dispose();resources.delete(key);}}
  root.userData.deepMidwaterLifeResources?.clear();instances.delete(root);root.removeFromParent();root.clear();
}
export const deepMidwaterLifeAssetStats=()=>({resources:resources.size,instances:instances.size});
