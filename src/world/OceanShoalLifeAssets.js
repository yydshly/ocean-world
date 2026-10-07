import * as THREE from 'three';
import { oceanShoalLifeSpeciesCatalog, oceanShoalLifeSpeciesById } from '../oceanShoalLifeSpecies.js';

// One complete kit per persisted real animal, never visual school duplicates.
// +X is forward and neutral whole tip-to-tip total length is one local unit.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const OCEAN_SHOAL_LIFE_ASSET_VERSION = 1;
export const OCEAN_SHOAL_LIFE_IDS = Object.freeze(oceanShoalLifeSpeciesCatalog.map(s => s.id));
export const OCEAN_SHOAL_LIFE_ENVELOPES = Object.freeze(Object.fromEntries(oceanShoalLifeSpeciesCatalog.map(s => [s.id,
  Object.freeze({ sizeMeasure: s.sizeMeasure, horizontalRadius: s.normalizedEnvelope.horizontalRadiusUnits,
    minY: s.normalizedEnvelope.y[0], maxY: s.normalizedEnvelope.y[1], pitchLimit: .12,
    localBounds: Object.freeze({ minX: s.normalizedEnvelope.x[0], maxX: s.normalizedEnvelope.x[1], minZ: s.normalizedEnvelope.z[0], maxZ: s.normalizedEnvelope.z[1] }) })])));
export const isOceanShoalLifeSpecies = id => OCEAN_SHOAL_LIFE_IDS.includes(id);
function share(root, key, make) {
  let entry = resources.get(key); if (!entry) { entry = { value: make(), refs: 0 }; resources.set(key, entry); }
  if (!root.userData.shoalLifeResources.has(key)) { root.userData.shoalLifeResources.add(key); entry.refs++; }
  return entry.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, c) => { const i = positions.length / 3; positions.push(...p); colors.push(...c); return i; };
  const face = (a, b, c) => indices.push(a, b, c);
  function body(profile, colorAt, sides = 24) {
    const start = positions.length / 3;
    for (const [x, y, z] of profile) for (let side = 0; side <= sides; side++) {
      const a = TAU * side / sides, p = [x, Math.cos(a) * y, Math.sin(a) * z]; vertex(p, colorAt(...p));
    }
    for (let row = 0; row < profile.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, b = a + sides + 1; face(a, b, a + 1); face(a + 1, b, b + 1);
    }
    for (const [row, reverse] of [[0, false], [profile.length - 1, true]]) {
      const c = vertex([profile[row][0], 0, 0], colorAt(profile[row][0], 0, 0));
      for (let side = 0; side < sides; side++) { const a = start + row * (sides + 1) + side; reverse ? face(c, a + 1, a) : face(c, a, a + 1); }
    }
  }
  function ellipsoid(center, scale, color, sides = 12, rows = 6) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      const a = TAU * side / sides, latitude = Math.PI * row / rows;
      vertex([center[0] + Math.sin(latitude) * Math.cos(a) * scale[0], center[1] + Math.cos(latitude) * scale[1], center[2] + Math.sin(latitude) * Math.sin(a) * scale[2]], color);
    }
    for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, b = a + sides + 1;
      if (row) face(a, a + 1, b); if (row < rows - 1) face(a + 1, b + 1, b);
    }
  }
  function fin(points, color, thickness = .003, colorAt = null) {
    const start = positions.length / 3;
    for (const offset of [-thickness, thickness]) for (const p of points) vertex([p[0], p[1], p[2] + offset], colorAt?.(...p) ?? color);
    const count = points.length;
    for (let i = 1; i < count - 1; i++) { face(start, start + i, start + i + 1); face(start + count, start + count + i + 1, start + count + i); }
    for (let i = 0; i < count; i++) { const a = start + i, b = start + (i + 1) % count; face(a, a + count, b); face(b, a + count, b + count); }
  }
  return { body, ellipsoid, fin, finish() { const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g; } };
}
function mesh(root, key, make, clearFin = false) {
  const geometry = share(root, `geometry:${key}`, make), material = share(root, clearFin?'material:shoal-clear-fin':'material:shoal', () => new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .65, metalness: .05, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0,
    transparent:clearFin,opacity:clearFin?.62:1,depthWrite:!clearFin }));
  const m = new THREE.Mesh(geometry, material); m.castShadow = false; m.receiveShadow = true; return m;
}
const configs = {
  'blue-and-gold-fusilier': { height: .095, width: .047, eye: .014, tailHeight: .145, forkX: -.075,
    profile: [[-.34,.010,.010],[-.25,.054,.025],[-.10,.085,.041],[.08,.095,.047],[.23,.080,.044],[.37,.049,.031],[.46,.022,.018],[.5,.006,.007]],
    color(x,y) { return y > .045 && x < .08 ? [.79,.66,.18] : y < -.015 ? [.65,.70,.71] : [.20,.42,.60]; }, finColor: [.37,.47,.47], tailColor: [.73,.62,.20] },
  'bigeye-trevally': { height: .16, width: .064, eye: .022, tailHeight: .205, forkX: -.045,
    profile: [[-.34,.013,.012],[-.24,.073,.031],[-.08,.135,.051],[.09,.16,.064],[.24,.137,.061],[.36,.092,.050],[.45,.039,.025],[.5,.005,.008]],
    color(_x,y) { return y > .025 ? [.37,.47,.49] : [.73,.76,.72]; }, finColor: [.46,.50,.46], tailColor: [.44,.49,.45] },
  'silver-stripe-herring': { height: .043, width: .020, eye: .011, tailHeight: .075, forkX: -.065,
    profile: [[-.34,.005,.005],[-.24,.022,.018],[-.09,.036,.030],[.12,.043,.035],[.29,.037,.031],[.41,.025,.023],[.48,.013,.012],[.5,.002,.005]],
    color(_x,y) { return Math.abs(y) < .012 ? [.86,.89,.83] : y > 0 ? [.33,.46,.43] : [.63,.71,.67]; }, finColor: [.66,.72,.66], tailColor: [.63,.69,.63] },
};
function fish(root, parts, id) {
  const p = configs[id], body = mesh(root, `${id}:body`, () => { const b = builder(); b.body(p.profile, p.color);
    for (const side of [-1,1]) { const z = (id === 'bigeye-trevally' ? .049 : id === 'silver-stripe-herring' ? .027 : .032) * side;
      b.ellipsoid([.377, p.height * .25, z], [p.eye,p.eye,p.eye*.30], [.09,.10,.09]); }
    if(id==='bigeye-trevally')for(const side of [-1,1])b.ellipsoid([.237,.041,side*.055],[.018,.022,.006],[.17,.20,.19]);
    b.fin([[.483,-.006,0],[.498,-.007,0],[.485,-.009,0]], [.18,.19,.17], .008); return b.finish(); }); root.add(body); parts.body = body;
  const fixed = mesh(root, `${id}:fixed-fins`, () => { const b = builder();
    if (id === 'bigeye-trevally') {
      b.fin([[.16,.12,0],[.065,.23,0],[-.028,.155,0]], p.finColor);
      b.fin([[.02,.15,0],[-.07,.225,0],[-.29,.067,0],[-.015,.092,0]], p.finColor,.003,(_x,y)=>y>.204?[.82,.84,.79]:p.finColor);
      b.fin([[.02,-.14,0],[-.06,-.208,0],[-.29,-.056,0]], p.finColor,.003,(_x,y)=>y<-.19?[.82,.84,.79]:p.finColor);
    } else { const high = id === 'silver-stripe-herring' ? .088 : .17;
      b.fin([[.12,p.height*.8,0],[.015,high,0],[-.225,p.height*.55,0]], p.finColor);
      b.fin([[-.04,-p.height*.85,0],[-.18,-high*.75,0],[-.29,-p.height*.45,0]], p.finColor); }
    for (const side of [-1,1]) b.fin([[.065,-p.height*.60,side*.016],[-.04,-p.height*.95,side*.052],[-.07,-p.height*.72,side*.018]], p.finColor);
    return b.finish(); },id==='silver-stripe-herring'); root.add(fixed); parts.fixedFins = fixed;
  const tail = new THREE.Group(); tail.position.x = -.31; root.add(tail);
  tail.add(mesh(root, `${id}:tail`, () => { const b = builder(); b.fin([[0,.012,0],[-.19,p.tailHeight,0],[-.15,p.tailHeight*.68,0],[p.forkX,0,0],[-.15,-p.tailHeight*.68,0],[-.19,-p.tailHeight,0],[0,-.012,0]], p.tailColor); return b.finish(); },id==='silver-stripe-herring')); parts.tail = tail;
  parts.pectoralFins = [-1,1].map(side => { const pivot = new THREE.Group(); pivot.position.set(.18,-p.height*.22,side*p.width*.82);
    pivot.userData.side = side; const fin = mesh(root, `${id}:pectoral`, () => { const b = builder();
      b.fin([[0,0,0],[-(id==='bigeye-trevally'?.34:.17),-.055,id==='bigeye-trevally'?.135:.073],[-.09,-.015,.015]], p.finColor); return b.finish(); },id==='silver-stripe-herring');
    fin.scale.z = side; pivot.add(fin); root.add(pivot); return pivot; });
  root.userData.anatomy = { bodyForm: id==='bigeye-trevally'?'laterally-compressed-high-body':id==='silver-stripe-herring'?'very-slender-silver-band':'slender-blue-and-gold', eyes:2,
    dorsalFins:id==='bigeye-trevally'?2:1, analFins:1, pelvicFins:2, pectoralFins:2, tail:'deeply-forked' };
}
function shark(root, parts) {
  const id = 'blacktip-reef-shark', grey = [.40,.46,.46], dark = [.11,.13,.12], pale = [.70,.73,.69];
  const body = mesh(root, `${id}:body`, () => { const b = builder();
    b.body([[-.35,.017,.013],[-.26,.039,.031],[-.11,.072,.055],[.07,.091,.075],[.23,.09,.085],[.36,.071,.070],[.46,.043,.050],[.5,.007,.024]], (_x,y)=>y<-.022?pale:grey,28);
    for (const side of [-1,1]) { b.ellipsoid([.397,.023,side*.065],[.014,.012,.007],dark);
      for(let i=0;i<5;i++) { const x=.25-i*.021,z=(.082-i*.003)*side;
        b.fin([[x,.042,z],[x-.005,-.041,z],[x-.01,-.047,z]],dark,.0015); } }
    b.fin([[.37,-.053,-.033],[.405,-.060,-.018],[.419,-.061,0],[.405,-.060,.018],[.37,-.053,.033],[.394,-.058,0]],dark,.0015);
    return b.finish(); }); root.add(body); parts.body = body;
  const fixed = mesh(root, `${id}:fixed-fins`, () => { const b=builder();
    b.fin([[.075,.077,0],[-.156,.076,0],[-.081,.235,0],[-.021,.235,0]],grey,.004);
    b.fin([[-.021,.235,0],[-.081,.235,0],[-.074,.25,0],[-.031,.25,0]],pale,.004);
    b.fin([[-.031,.25,0],[-.074,.25,0],[-.055,.29,0]],dark,.004);
    b.fin([[-.21,.042,0],[-.26,.119,0],[-.31,.027,0]],grey);
    b.fin([[-.205,-.038,0],[-.261,-.13,0],[-.312,-.022,0]],grey);
    for(const side of [-1,1]) b.fin([[-.105,-.04,side*.030],[-.196,-.102,side*.13],[-.223,-.044,side*.047]],grey);
    return b.finish(); }); root.add(fixed); parts.fixedFins=fixed;
  const tail = new THREE.Group(); tail.position.x=-.34; root.add(tail);
  tail.add(mesh(root, `${id}:tail`,()=>{const b=builder(); b.fin([[0,.015,0],[-.095,.19,0],[-.16,.218,0],[-.145,.156,0],[-.075,.065,0],[-.054,-.01,0],[-.126,-.12,0],[-.095,-.035,0],[0,-.017,0]],grey,.003,(_x,y)=>y<-.085?dark:grey);return b.finish();}));parts.tail=tail;
  parts.pectoralFins=[-1,1].map(side=>{const pivot=new THREE.Group();pivot.position.set(.11,-.035,side*.063);pivot.userData.side=side;
    const fin=mesh(root,`${id}:pectoral`,()=>{const b=builder();b.fin([[0,0,0],[-.245,-.073,.267],[-.14,-.025,.095]],grey,.004,(_x,_y,z)=>z>.22?dark:grey);return b.finish();});
    fin.scale.z=side;pivot.add(fin);root.add(pivot);return pivot;});
  root.userData.anatomy={bodyForm:'grey-shark',eyes:2,mouth:'ventral-curved',gillSlitsPerSide:5,dorsalFins:2,analFins:1,pelvicFins:2,pectoralFins:2,tail:'heterocercal-upper-lobe-longer',blackFinTips:true};
}
export function createOceanShoalLifeAsset(speciesOrId) {
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id,s=oceanShoalLifeSpeciesById[id];if(!s)throw new Error('Unknown shoal-life representative');
  const root=new THREE.Group(),parts={};Object.assign(root.userData,{speciesId:id,kind:s.kind,sizeMeasure:s.sizeMeasure,shoalLifeResources:new Set(),shoalLifeDisposed:false,
    phase:0,morphologyStatus:'complete authored whole form; not a scan or measured body proportions',measureReferences:{neutralTotalLength:1,minX:-.5,maxX:.5},localEnvelope:OCEAN_SHOAL_LIFE_ENVELOPES[id]});
  root.name=s.commonName;instances.add(root);
  try{if(id==='blacktip-reef-shark')shark(root,parts);else fish(root,parts,id);root.userData.shoalLifeParts=parts;return{group:root,parts,envelope:OCEAN_SHOAL_LIFE_ENVELOPES[id]};}
  catch(error){disposeOceanShoalLifeAsset(root);throw error;}
}
export function animateOceanShoalLifeAsset(root,nativeTimeSec,agent={}) {
  const p=root?.userData.shoalLifeParts;if(!p||root.userData.shoalLifeDisposed||agent.alive===false)return;
  const time=Number.isFinite(nativeTimeSec)?nativeTimeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0;
  const speed=Math.hypot(agent.velocity?.x||0,agent.velocity?.y||0,agent.velocity?.z||0),moving=speed>1e-8,shark=root.userData.speciesId==='blacktip-reef-shark';
  const amplitude=moving?(shark?.10:.16):0,beat=time*(shark?2.3:5.2)+phase;
  p.tail.rotation.y=moving?Math.sin(beat)*amplitude:0;
  p.pectoralFins.forEach(fin=>{fin.rotation.x=moving?fin.userData.side*Math.sin(beat*.5)*amplitude*.18:0;});
  root.userData.shoalLifeLastTimeSec=time;
}
export function disposeOceanShoalLifeAsset(root) {
  if(!root||root.userData.shoalLifeDisposed)return;root.userData.shoalLifeDisposed=true;
  for(const key of root.userData.shoalLifeResources??[]){const entry=resources.get(key);if(entry&&--entry.refs<=0){entry.value.dispose();resources.delete(key);}}
  root.userData.shoalLifeResources?.clear();instances.delete(root);root.removeFromParent();root.clear();
}
export const oceanShoalLifeAssetStats=()=>({resources:resources.size,instances:instances.size});
