import * as THREE from 'three';
import { deepWaterLifeSpeciesCatalog, deepWaterLifeSpeciesById } from '../deepWaterLifeSpecies.js';

// One complete source-informed kit per persisted animal. Mantle/standard
// length, whole-body clearance and visible fixed mouth remain separate.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const DEEP_WATER_LIFE_ASSET_VERSION = 1;
export const DEEP_WATER_LIFE_IDS = Object.freeze(deepWaterLifeSpeciesCatalog.map(s => s.id));
export const DEEP_WATER_LIFE_ENVELOPES = Object.freeze(Object.fromEntries(deepWaterLifeSpeciesCatalog.map(s => [s.id,
  Object.freeze({ sizeMeasure: s.sizeMeasure, horizontalRadius: s.normalizedEnvelope.horizontalRadiusUnits,
    minY: s.normalizedEnvelope.y[0], maxY: s.normalizedEnvelope.y[1], pitchLimit: .12,
    localBounds: Object.freeze({ minX: s.normalizedEnvelope.x[0], maxX: s.normalizedEnvelope.x[1],
      minZ: s.normalizedEnvelope.z[0], maxZ: s.normalizedEnvelope.z[1] }) })])));
export const isDeepWaterLifeSpecies = id => DEEP_WATER_LIFE_IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.deepWaterLifeResources.has(key)) { root.userData.deepWaterLifeResources.add(key); row.refs++; }
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
function add(root, key, make, parent = root) {
  const geometry = share(root, `geometry/${root.userData.speciesId}/${key}`, make);
  const material = share(root, 'material/tissue', () => new THREE.MeshStandardMaterial({ color: 0xffffff,
    vertexColors: true, roughness: .8, metalness: 0, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0 }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
const octoGrey = [.54, .49, .48], octoOral = [.39, .19, .30], finTint = [.42, .27, .25], fishTint = [.54, .48, .43];
function dumbo(root, parts) {
  parts.mantle = add(root, 'unit mantle with head and paired eyes', () => { const b = builder();
    b.body([[-.5,.002,.002],[-.42,.21,.24],[-.20,.38,.38],[.07,.40,.39],[.30,.34,.35],[.5,.23,.26]], octoGrey);
    b.ellipsoid([.51,-.13,0], [.27,.29,.31], octoGrey);
    for (const side of [-1, 1]) { b.ellipsoid([.48,.035,side*.28], [.085,.07,.045], [.32,.27,.27]);
      b.ellipsoid([.51,.035,side*.314], [.036,.036,.018], [.075,.065,.07]); }
    return b.finish();
  });
  parts.feedingOrgan = add(root, 'fixed real ventral mouth at the arm crown', () => { const b = builder();
    b.ellipsoid([.65,-.465,0], [.10,.075,.10], octoOral); b.ellipsoid([.65,-.525,0], [.045,.025,.045], [.10,.045,.07]); return b.finish(); });
  parts.fins = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(-.08,.10,side*.25); pivot.scale.z=side; pivot.userData.side = side; root.add(pivot); parts.fins.push(pivot);
    add(root, 'lateral broad dumbo fin', () => { const b = builder(); b.ellipsoid([-.08,.06,.25], [.28,.058,.36], octoGrey);
      b.ellipsoid([-.22,.06,.29], [.08,.06,.31], finTint); return b.finish(); }, pivot);
  }
  parts.arms = new THREE.Group(); parts.arms.position.set(.72,-.30,0); root.add(parts.arms);
  parts.web = add(root, 'thick web extending nearly to eight arm tips', () => {
    const b = builder(), rings = [[.02,.13],[.35,.47],[.82,.69],[1.26,.75]], sides = 64;
    for (const dx of [-.018,.018]) for (const [x,radius] of rings) for (let i=0;i<=sides;i++) {
      const a=TAU*i/sides; b.vertex([x+dx,Math.cos(a)*radius,Math.sin(a)*radius],octoOral);
    }
    const layer=rings.length*(sides+1);
    for (let r=0;r<rings.length-1;r++) for (let i=0;i<sides;i++) { const a=r*(sides+1)+i,c=a+sides+1;
      b.face(a,c,a+1); b.face(a+1,c,c+1); b.face(a+layer,a+1+layer,c+layer); b.face(a+1+layer,c+1+layer,c+layer); }
    for (const r of [0,rings.length-1]) for (let i=0;i<sides;i++) { const a=r*(sides+1)+i; b.face(a,a+1,a+layer); b.face(a+1,a+1+layer,a+layer); }
    return b.finish();
  },parts.arms);
  parts.armBodies = [];
  for (let arm=0;arm<8;arm++) parts.armBodies.push(add(root, `subequal arm ${arm} with one sucker row and paired short cirri`, () => {
    const b=builder(),a=TAU*arm/8,radial=r=>[Math.cos(a)*r,Math.sin(a)*r],rings=[[.02,.13],[.35,.47],[.82,.69],[1.26,.75],[1.46,.77]];
    const line=rings.map(([x,r])=>[x,...radial(r)]); b.tube(line,[.075,.069,.053,.036,.014],octoGrey,8);
    for(let sample=1;sample<=6;sample++){const u=sample/7,x=.05+u*1.26,r=.13+.62*u,p=[x,...radial(r-.035)];
      b.ellipsoid(p,[.021,.021,.021],[.62,.39,.47],8,4);
      for(const side of [-1,1]){const tangent=[-Math.sin(a)*side*.038,Math.cos(a)*side*.038];
        b.tube([p,[x+.018,p[1]+tangent[0],p[2]+tangent[1]]],[.005,.001],octoOral,4);}
    }return b.finish();
  },parts.arms));
  root.userData.anatomy={bodyForm:'finned cirrate octopus',arms:8,subequalArms:true,deepInterbrachialWeb:true,
    lateralFins:2,suckerRowsPerArm:1,pairedShortCirri:true,extraSquidTentacles:false};
  root.userData.measureReferences={mantleLength:1,mantlePosteriorX:-.5,mantleAnteriorX:.5,maximumBodyAxialSpanML:2.8,
    armWebHeadAndFinsExcludedFromMantleLength:true};
}
function cusk(root,parts){
  const profile=[[-.5,.010,.008],[-.41,.031,.025],[-.27,.059,.043],[-.12,.089,.059],[.03,.109,.073],[.18,.128,.078],[.30,.131,.069],[.41,.100,.050],[.49,.045,.025],[.5,.004,.009]];
  parts.body=add(root,'elongated standard-length body and fixed head',()=>{const b=builder();b.body(profile.filter(p=>p[0]>=-.12),fishTint);
    b.ellipsoid([.42,-.095,0],[.068,.060,.056],fishTint);
    for(const side of[-1,1]){b.ellipsoid([.35,.055,side*.059],[.022,.022,.009],[.12,.105,.095]);
      b.ellipsoid([.451,.025,side*.034],[.007,.009,.006],[.22,.17,.15]);
      b.tube([[.28,.098,side*.05],[.245,.03,side*.078],[.28,-.082,side*.055]],[.004,.004,.003],[.36,.30,.27],5);
      b.tube([[.27,-.110,side*.020],[.215,-.165,side*.028],[.11,-.193,side*.025]],[.006,.004,.0015],[.47,.40,.36],5);}
    b.fin([[.28,.10,0],[.28,.175,0],[.10,.201,0],[-.12,.170,0],[-.12,.079,0]],[.42,.37,.33]);
    b.fin([[.08,-.10,0],[.08,-.18,0],[-.12,-.172,0],[-.12,-.079,0]],[.42,.37,.33]);return b.finish();});
  parts.feedingOrgan=add(root,'fixed actual lower mouth',()=>{const b=builder();b.ellipsoid([.47,-.14,0],[.024,.020,.022],[.15,.105,.105]);return b.finish();});
  parts.tail=new THREE.Group();parts.tail.position.x=-.10;root.add(parts.tail);
  add(root,'tapered posterior body with continuous dorsal anal and rounded caudal fins',()=>{const b=builder();
    b.body(profile.filter(p=>p[0]<=-.12).concat([[-.09,.094,.063]]).map(([x,y,z])=>[x+.10,y,z]),fishTint);
    b.fin([[.02,.074,0],[.02,.173,0],[-.10,.135,0],[-.29,.070,0],[-.44,.043,0],[-.47,0,0],[-.44,-.043,0],[-.29,-.070,0],[-.10,-.135,0],[.02,-.172,0],[.02,-.074,0],[-.30,-.009,0],[-.30,.009,0]],[.43,.37,.32]);
    return b.finish();},parts.tail);
  parts.pectoralFins=[];
  for(const side of[-1,1]){const fin=new THREE.Group();fin.position.set(.23,-.016,side*.075);fin.scale.z=side;fin.userData.side=side;root.add(fin);parts.pectoralFins.push(fin);
    add(root,'paired short pectoral fin',()=>{const b=builder();b.fin([[0,0,0],[-.09,.016,.10],[-.15,-.027,.072],[-.06,-.042,.025]],[.47,.40,.36]);return b.finish();},fin);}
  root.userData.anatomy={bodyForm:'large elongated cusk-eel',continuousDorsalAnalCaudalFin:true,pectoralFins:2,pelvicFins:2,forkedTail:false};
  root.userData.measureReferences={standardLength:1,snoutX:.5,tailBaseX:-.5,distalCaudalFinX:-.57,caudalFinExcludedFromStandardLength:true};
}
export function createDeepWaterLifeAsset(speciesOrId){
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id,s=deepWaterLifeSpeciesById[id];
  if(!s)throw new TypeError('Unknown deep water-life representative.');
  if(typeof speciesOrId==='object'&&((speciesOrId.scientificName&&speciesOrId.scientificName!==s.scientificName)||
    (speciesOrId.identityLevel&&speciesOrId.identityLevel!==s.identityLevel)))throw new TypeError('Conflicting deep water-life identity.');
  const root=new THREE.Group(),parts={};root.name=s.commonName;
  Object.assign(root.userData,{speciesId:id,scientificName:s.scientificName,identityLevel:s.identityLevel,kind:s.kind,sizeMeasure:s.sizeMeasure,phase:0,assetVersion:1,
    deepWaterLifeResources:new Set(),deepWaterLifeDisposed:false,localEnvelope:DEEP_WATER_LIFE_ENVELOPES[id],feedingPointLocal:{...s.morphology.feedingPointLocal},
    originConvention:'local +X forward, +Y world up; mantle midpoint or standard-length midpoint',
    morphologyStatus:'whole source-informed procedural reference; ratios, sample counts and motion are uncalibrated display choices'});
  instances.add(root);try{if(id==='abyssal-dumbo-octopus')dumbo(root,parts);else cusk(root,parts);root.userData.deepWaterLifeParts=parts;return root;}
  catch(error){disposeDeepWaterLifeAsset(root);throw error;}
}
export function animateDeepWaterLifeAsset(root,nativeTimeSec,agent={}){
  const p=root?.userData.deepWaterLifeParts;if(!p||root.userData.deepWaterLifeDisposed||agent.alive===false)return;
  const time=Number.isFinite(nativeTimeSec)?nativeTimeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0;
  const moving=Math.hypot(agent.velocity?.x??0,agent.velocity?.y??0,agent.velocity?.z??0)>1e-8;
  if(root.userData.speciesId==='abyssal-dumbo-octopus'){
    p.fins.forEach(fin=>{fin.rotation.x=moving?fin.userData.side*Math.sin(time*2.1+phase)*.085:0;});
    p.arms.rotation.x=moving?Math.sin(time*.9+phase)*.024:0;
  }else{p.tail.rotation.y=moving?Math.sin(time*2.8+phase)*.048:0;
    p.pectoralFins.forEach(fin=>{fin.rotation.x=moving?fin.userData.side*Math.sin(time*2.2+phase)*.038:0;});}
  root.userData.deepWaterLifeLastTimeSec=time;
}
export function disposeDeepWaterLifeAsset(root){
  if(!root||root.userData.deepWaterLifeDisposed)return;root.userData.deepWaterLifeDisposed=true;
  for(const key of root.userData.deepWaterLifeResources??[]){const row=resources.get(key);if(row&&--row.refs<=0){row.value.dispose();resources.delete(key);}}
  root.userData.deepWaterLifeResources?.clear();instances.delete(root);root.removeFromParent();root.clear();
}
export const deepWaterLifeAssetStats=()=>({resources:resources.size,instances:instances.size});
