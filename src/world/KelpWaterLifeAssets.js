import * as THREE from 'three';
import { kelpWaterLifeSpeciesCatalog, kelpWaterLifeSpeciesById } from '../kelpWaterLifeSpecies.js';

// One whole procedural kit for one real persisted individual. Ratios and
// appendage poses are authored references, not measured local anatomy.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const KELP_WATER_LIFE_ASSET_VERSION = 1;
export const KELP_WATER_LIFE_IDS = Object.freeze(kelpWaterLifeSpeciesCatalog.map(s => s.id));
export const KELP_WATER_LIFE_ENVELOPES = Object.freeze(Object.fromEntries(kelpWaterLifeSpeciesCatalog.map(s => [s.id,
  Object.freeze({ sizeMeasure: s.sizeMeasure, horizontalRadius: s.normalizedEnvelope.horizontalRadiusUnits,
    minY: s.normalizedEnvelope.y[0], maxY: s.normalizedEnvelope.y[1], pitchLimit: s.kind === 'jellyfish' ? 0 : .12,
    localBounds: Object.freeze({ minX: s.normalizedEnvelope.x[0], maxX: s.normalizedEnvelope.x[1], minZ: s.normalizedEnvelope.z[0], maxZ: s.normalizedEnvelope.z[1] }) })])));
export const isKelpWaterLifeSpecies = id => KELP_WATER_LIFE_IDS.includes(id);
function share(root, key, make) {
  let r = resources.get(key); if (!r) { r = { value: make(), refs: 0 }; resources.set(key, r); }
  if (!root.userData.kelpWaterLifeResources.has(key)) { root.userData.kelpWaterLifeResources.add(key); r.refs++; } return r.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, c) => { const i = positions.length / 3; positions.push(...p); colors.push(...c); return i; };
  const face = (a, b, c) => indices.push(a, b, c);
  function body(profile, colorAt, sides = 24) {
    const start = positions.length / 3;
    for (const [x, y, z] of profile) for (let i = 0; i <= sides; i++) {
      const a = TAU * i / sides, p = [x, Math.cos(a) * y, Math.sin(a) * z]; vertex(p, colorAt(...p));
    }
    for (let r = 0; r < profile.length - 1; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * (sides + 1) + i, b = a + sides + 1; face(a, b, a + 1); face(a + 1, b, b + 1);
    }
    for (const [r, reverse] of [[0, false], [profile.length - 1, true]]) {
      const c = vertex([profile[r][0], 0, 0], colorAt(profile[r][0], 0, 0));
      for (let i = 0; i < sides; i++) { const a = start + r * (sides + 1) + i; reverse ? face(c, a + 1, a) : face(c, a, a + 1); }
    }
  }
  function ellipsoid(center, scale, tint, sides = 16, rows = 8) {
    const start = positions.length / 3;
    for (let r = 0; r <= rows; r++) for (let i = 0; i <= sides; i++) {
      const lat = Math.PI * r / rows, a = TAU * i / sides;
      vertex([center[0] + Math.sin(lat) * Math.cos(a) * scale[0], center[1] + Math.cos(lat) * scale[1], center[2] + Math.sin(lat) * Math.sin(a) * scale[2]], tint);
    }
    for (let r = 0; r < rows; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * (sides + 1) + i, b = a + sides + 1; if (r) face(a, a + 1, b); if (r < rows - 1) face(a + 1, b + 1, b);
    }
  }
  function fin(points, tint, thickness = .003) {
    const start = positions.length / 3, n = points.length;
    for (const dz of [-thickness, thickness]) for (const p of points) vertex([p[0], p[1], p[2] + dz], tint);
    for (let i = 1; i < n - 1; i++) { face(start, start + i, start + i + 1); face(start + n, start + n + i + 1, start + n + i); }
    for (let i = 0; i < n; i++) { const a = start + i, b = start + (i + 1) % n; face(a, a + n, b); face(b, a + n, b + n); }
  }
  function tube(points, radii, tint, sides = 6) {
    const start = positions.length / 3;
    for (let r = 0; r < points.length; r++) {
      const p = new THREE.Vector3(...points[r]), tangent = new THREE.Vector3(...points[Math.min(r + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(r - 1, 0)])).normalize();
      const a = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize(), b = new THREE.Vector3().crossVectors(tangent, a);
      for (let i = 0; i < sides; i++) { const angle = TAU * i / sides; vertex(p.clone().addScaledVector(a, Math.cos(angle) * radii[r]).addScaledVector(b, Math.sin(angle) * radii[r]).toArray(), tint); }
    }
    for (let r = 0; r < points.length - 1; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * sides + i, b = start + r * sides + (i + 1) % sides; face(a, b, a + sides); face(b, b + sides, a + sides);
    }
    for (const [r, reverse] of [[0, false], [points.length - 1, true]]) {
      const c = vertex(points[r], tint); for (let i = 0; i < sides; i++) { const a = start + r * sides + i, b = start + r * sides + (i + 1) % sides; reverse ? face(c, a, b) : face(c, b, a); }
    }
  }
  return { vertex, face, body, ellipsoid, fin, tube, finish() { const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices);
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g; } };
}
function add(root, key, make, parent = root, clear = false) {
  const geometry = share(root, `geometry:${root.userData.speciesId}:${key}`, make), material = share(root, clear ? 'material:gelatinous' : 'material:tissue',
    () => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .73, metalness: 0, emissive: 0, emissiveIntensity: 0,
      transparent: clear, opacity: clear ? .68 : 1, depthWrite: !clear }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.receiveShadow = true; mesh.castShadow = false; parent.add(mesh); return mesh;
}
function fish(root, parts, opaleye) {
  const h = opaleye ? .18 : .073, w = opaleye ? .075 : .041, tint = opaleye ? [.24, .29, .19] : [.38, .52, .56];
  const profile = opaleye ? [[-.34,.016,.012],[-.24,.105,.043],[-.09,.166,.069],[.10,.18,.075],[.27,.15,.071],[.39,.078,.043],[.48,.025,.015],[.5,.004,.006]]
    : [[-.35,.009,.008],[-.27,.035,.021],[-.11,.064,.036],[.10,.073,.041],[.27,.063,.038],[.40,.037,.027],[.48,.014,.013],[.5,.003,.005]];
  parts.body = add(root, 'whole body paired eyes mouth and opercula', () => { const b = builder(); b.body(profile, (_x, y) => !opaleye && y < -.01 ? [.73,.76,.70] : tint);
    for (const side of [-1, 1]) {
      const z = (opaleye ? .045 : .026) * side;
      b.ellipsoid([.385, h * .23, z], [opaleye ? .024 : .014, opaleye ? .024 : .014, .007], opaleye ? [.23,.57,.53] : [.14,.19,.17]);
      b.ellipsoid([.391, h * .23, z + side * .005], [.008,.010,.003], [.07,.09,.07]);
      if (!opaleye) b.ellipsoid([.23,.023,side*.039], [.019,.018,.003], [.13,.17,.15]);
      else for (const x of [-.005, .135]) b.ellipsoid([x,.142,side*.043], [.028,.021,.003], [.80,.82,.70]);
    } return b.finish(); });
  parts.fixedFins = add(root, 'dorsal anal and paired pelvic fins', () => { const b = builder();
    if (opaleye) b.fin([[.30,.11,0],[.17,.237,0],[.02,.216,0],[-.25,.088,0]], tint);
    else { b.fin([[.17,.053,0],[.11,.137,0],[.015,.065,0]], tint); b.fin([[.005,.062,0],[-.08,.11,0],[-.28,.032,0]], tint); }
    b.fin([[-.02,-h*.8,0],[-.12,-h*1.16,0],[-.27,-h*.45,0]], tint);
    for (const side of [-1,1]) b.fin([[.12,-h*.58,side*.02],[.015,-h*1.18,side*.065],[-.005,-h*.73,side*.027]], tint); return b.finish(); });
  parts.tail = new THREE.Group(); parts.tail.position.x = -.31; root.add(parts.tail);
  add(root, opaleye ? 'shallow concave tail' : 'deep forked tail', () => { const b = builder(), height = opaleye ? .14 : .12;
    b.fin([[0,.014,0],[-.19,height,0],[opaleye ? -.165 : -.085,0,0],[-.19,-height,0],[0,-.014,0]], tint); return b.finish(); }, parts.tail);
  parts.pectoralFins = [-1,1].map(side => { const pivot = new THREE.Group(); pivot.position.set(.19,-h*.22,side*w*.8); pivot.userData.side = side; root.add(pivot);
    const mesh = add(root, 'paired pectoral fin', () => { const b = builder(); b.fin([[0,0,0],[-.18,-.036,.075],[-.06,-.025,.016]], tint); return b.finish(); }, pivot); mesh.scale.z = side; return pivot; });
  root.userData.anatomy = { bodyForm: opaleye ? 'deep-oval-opaleye' : 'slender-jack-mackerel', eyes: 2, dorsalFins: opaleye ? 1 : 2, analFins: 1, pelvicFins: 2, pectoralFins: 2, tail: opaleye ? 'shallow-concave' : 'deeply-forked' };
}
function squid(root, parts) {
  const tint = [.64,.58,.46], pale = [.71,.66,.54];
  parts.mantle = add(root, 'unit dorsal mantle excluding head and arms', () => { const b = builder();
    b.body([[-.5,.002,.003],[-.42,.055,.044],[-.25,.089,.067],[-.05,.11,.082],[.24,.113,.085],[.43,.102,.075],[.5,.088,.067]], () => tint, 28); return b.finish(); });
  parts.head = add(root, 'compact head paired eyes and funnel', () => { const b = builder(); b.ellipsoid([.635,0,0], [.135,.075,.084], pale);
    for (const side of [-1,1]) b.ellipsoid([.635,.013,side*.080], [.048,.045,.015], [.13,.17,.16]);
    b.tube([[.54,-.053,0],[.64,-.084,0],[.69,-.081,0]], [.025,.021,.015], pale); return b.finish(); });
  parts.fins = [-1,1].map(side => { const pivot = new THREE.Group(); pivot.userData.side = side; root.add(pivot);
    const fin = add(root, 'paired posterior diamond fin', () => { const b = builder(); b.fin([[-.47,0,.025],[-.27,0,.295],[.01,0,.049],[-.18,0,.067]], pale); return b.finish(); }, pivot); fin.scale.z = side; return pivot; });
  parts.arms = new THREE.Group(); parts.arms.position.x = .75; root.add(parts.arms);
  add(root, 'eight short arms', () => { const b = builder(); for (let i = 0; i < 8; i++) {
    const a = TAU * i / 8, y = Math.cos(a), z = Math.sin(a); b.tube([[0,y*.05,z*.05],[.19,y*.12,z*.13],[.35,y*.16,z*.17],[.50,y*.11,z*.12]], [.021,.017,.010,.002], pale); } return b.finish(); }, parts.arms);
  parts.tentacles = add(root, 'two slender tentacles with real distal clubs', () => { const b = builder();
    b.tube([[.75,.013,.026],[1.02,.06,.044],[1.24,.048,.025],[1.40,.025,0]], [.009,.008,.007,.009], pale);
    b.ellipsoid([1.45,.025,0], [.05,.016,.016], pale);
    b.tube([[.75,-.014,-.023],[1.0,-.052,-.042],[1.22,-.038,-.052],[1.38,-.032,-.047]], [.009,.008,.007,.009], pale);
    b.ellipsoid([1.425,-.032,-.047], [.045,.016,.016], pale); return b.finish(); });
  root.userData.anatomy = { bodyForm: 'slender-mantle-market-squid', eyes: 2, fins: 2, shortArms: 8, feedingTentacles: 2, clubs: 2, feedingAppendagesFixed: true };
}
function nettle(root, parts) {
  parts.bell = add(root, 'unit circular bell and underside', () => { const b = builder(), sides = 48, rings = [[.39,0],[.35,.20],[.23,.37],[.09,.47],[-.035,.5],[-.12,.46],[-.14,0]];
    const start = 0; for (const [y,radius] of rings) for (let i=0;i<=sides;i++) { const a=TAU*i/sides;
      b.vertex([Math.cos(a)*radius,y,Math.sin(a)*radius], [.62+.10*Math.cos(a*16),.36+.08*Math.cos(a*16),.21]); }
    for(let r=0;r<rings.length-1;r++)for(let i=0;i<sides;i++){const a=start+r*(sides+1)+i,c=a+sides+1;b.face(a,c,a+1);b.face(a+1,c,c+1);} return b.finish(); },root,true);
  parts.oralArms = new THREE.Group(); root.add(parts.oralArms);
  add(root, 'four long folded oral arms', () => { const b=builder(); for(let arm=0;arm<4;arm++) {const angle=TAU*arm/4+.4, start=arm*66;
    for(let r=0;r<=32;r++){const u=r/32,y=-.13-u*(7.95-arm*.12),radial=.10+.09*Math.sin(u*TAU*1.8+arm)*Math.sin(Math.PI*u), width=(.035+.055*Math.sin(Math.PI*u))*(1-u*.60);
      for(const side of [-1,1])b.vertex([Math.cos(angle)*radial-Math.sin(angle)*side*width,y+.015*Math.sin(u*TAU*8+side),Math.sin(angle)*radial+Math.cos(angle)*side*width], [.63,.37,.24]);}
    for(let r=0;r<32;r++){const a=start+r*2;b.face(a,a+2,a+1);b.face(a+1,a+2,a+3);} }return b.finish(); },parts.oralArms,true);
  parts.tentacles=add(root,'twenty-four full marginal tentacles with fixed feeding tip',()=>{const b=builder();for(let i=0;i<24;i++){
    const a=TAU*i/24,length=i===0?7.5:6.6+(i%6)*.30,points=Array.from({length:33},(_,r)=>{const u=r/32,wave=.045*Math.sin(u*TAU*2+i)*Math.sin(Math.PI*u);
      return[Math.cos(a)*(.47+wave),-.045+u*(-length+.045),Math.sin(a)*(.47+wave)];});
    b.tube(points,points.map((_,r)=>.005*(1-r/32*.6)),[.60,.34,.22],5);}return b.finish();},root,true);
  root.userData.anatomy={bodyForm:'upright-long-armed-sea-nettle',oralArms:4,marginalTentacles:24,feedingAppendagesFixed:true};
}
export function createKelpWaterLifeAsset(speciesOrId) {
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id,s=kelpWaterLifeSpeciesById[id];if(!s)throw new TypeError('Unknown kelp water-life representative.');
  const root=new THREE.Group(),parts={};Object.assign(root.userData,{speciesId:id,kind:s.kind,sizeMeasure:s.sizeMeasure,phase:0,assetVersion:1,
    kelpWaterLifeResources:new Set(),kelpWaterLifeDisposed:false,localEnvelope:KELP_WATER_LIFE_ENVELOPES[id],
    measureReferences:id==='california-market-squid'?{mantleLength:1,minX:-.5,maxX:.5}:id==='pacific-sea-nettle'?{bellDiameter:1,bellAxis:'positive-y'}:{totalLength:1,minX:-.5,maxX:.5},
    feedingPointLocal:{...s.morphology.feedingPointLocal},morphologyStatus:'whole source-informed procedural reference; ratios and motion are uncalibrated display choices'});
  root.name=s.commonName;instances.add(root);try{if(id==='california-market-squid')squid(root,parts);else if(id==='pacific-sea-nettle')nettle(root,parts);else fish(root,parts,id==='opaleye');root.userData.kelpWaterLifeParts=parts;return root;}
  catch(error){disposeKelpWaterLifeAsset(root);throw error;}
}
export function animateKelpWaterLifeAsset(root,nativeTimeSec,agent={}) {
  const p=root?.userData.kelpWaterLifeParts;if(!p||root.userData.kelpWaterLifeDisposed||agent.alive===false)return;
  const time=Number.isFinite(nativeTimeSec)?nativeTimeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0,moving=Math.hypot(agent.velocity?.x??0,agent.velocity?.y??0,agent.velocity?.z??0)>1e-8;
  if(root.userData.speciesId==='pacific-sea-nettle'){const pulse=moving?.975+Math.sin(time*1.2+phase)*.025:1;p.bell.scale.set(pulse,1,pulse);p.oralArms.rotation.y=moving?Math.sin(time*.6+phase)*.018:0;}
  else if(root.userData.speciesId==='california-market-squid'){p.fins.forEach(fin=>{fin.rotation.x=moving?fin.userData.side*Math.sin(time*2.8+phase)*.045:0;});p.arms.rotation.x=moving?Math.sin(time*1.3+phase)*.025:0;}
  else{p.tail.rotation.y=moving?Math.sin(time*5+phase)*.14:0;p.pectoralFins.forEach(fin=>{fin.rotation.x=moving?fin.userData.side*Math.sin(time*2.5+phase)*.024:0;});}
  root.userData.kelpWaterLifeLastTimeSec=time;
}
export function disposeKelpWaterLifeAsset(root) {
  if(!root||root.userData.kelpWaterLifeDisposed)return;root.userData.kelpWaterLifeDisposed=true;
  for(const key of root.userData.kelpWaterLifeResources??[]){const r=resources.get(key);if(r&&--r.refs<=0){r.value.dispose();resources.delete(key);}}
  root.userData.kelpWaterLifeResources?.clear();instances.delete(root);root.removeFromParent();root.clear();
}
export const kelpWaterLifeAssetStats=()=>({resources:resources.size,instances:instances.size});
