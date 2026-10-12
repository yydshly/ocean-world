import * as THREE from 'three';
import { OCEAN_REEF_COLOR_FISH_IDS, oceanReefColorFishSpeciesById } from '../oceanReefColorFishSpecies.js';
// +X forward. Immutable shared geometry; instance-local fin pivots. Animation
// consumes the owner's model clock and never moves an ecological record.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const isReefColorFishAnimal = id => OCEAN_REEF_COLOR_FISH_IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefColorFishAnimalResources.has(key)) { root.userData.reefColorFishAnimalResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, tint) => { const index = positions.length / 3; positions.push(...p);
    colors.push(...(typeof tint === 'function' ? tint(...p) : tint)); return index; };
  const triangle = (a, b, c) => indices.push(a, b, c);
  function body(profile, tint, sides = 36, roundness = 1) {
    const start = positions.length / 3;
    for (const [x, y, z] of profile) for (let i = 0; i <= sides; i++) {
      const angle = TAU * i / sides; vertex([x, Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** roundness * y, Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** roundness * z], tint);
    }
    for (let row = 0; row < profile.length - 1; row++) for (let i = 0; i < sides; i++) {
      const a = start + row * (sides + 1) + i, b = a + sides + 1; triangle(a, b, a + 1); triangle(a + 1, b, b + 1);
    }
    for (const [row, reverse] of [[0, false], [profile.length - 1, true]]) {
      const c = vertex([profile[row][0], 0, 0], tint);
      for (let i = 0; i < sides; i++) { const a = start + row * (sides + 1) + i;
        reverse ? triangle(c, a + 1, a) : triangle(c, a, a + 1); }
    }
  }
  function ellipsoid(center, scale, tint, sides = 12, rows = 7) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let i = 0; i <= sides; i++) {
      const a = TAU * i / sides, t = Math.PI * row / rows;
      vertex([center[0] + Math.sin(t) * Math.cos(a) * scale[0], center[1] + Math.cos(t) * scale[1],
        center[2] + Math.sin(t) * Math.sin(a) * scale[2]], tint);
    }
    for (let row = 0; row < rows; row++) for (let i = 0; i < sides; i++) {
      const a = start + row * (sides + 1) + i, b = a + sides + 1;
      if (row) triangle(a, a + 1, b); if (row < rows - 1) triangle(a + 1, b + 1, b);
    }
  }
  function tube(points, radii, tint, sides = 7) {
    const start = positions.length / 3;
    for (let row = 0; row < points.length; row++) {
      const p = new THREE.Vector3(...points[row]), tangent = new THREE.Vector3(...points[Math.min(row + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(0, row - 1)])).normalize(),
        side = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize(),
        up = new THREE.Vector3().crossVectors(side, tangent).normalize();
      for (let i = 0; i <= sides; i++) { const a = TAU * i / sides;
        vertex(p.clone().addScaledVector(side, Math.cos(a) * radii[row]).addScaledVector(up, Math.sin(a) * radii[row]).toArray(), tint); }
    }
    for (let row = 0; row < points.length - 1; row++) for (let i = 0; i < sides; i++) {
      const a = start + row * (sides + 1) + i, b = a + sides + 1; triangle(a, a + 1, b); triangle(a + 1, b + 1, b);
    }
  }
  function sheet(points, tint) {
    const start = positions.length / 3; points.forEach(p => vertex(p, tint));
    for (let i = 1; i < points.length - 1; i++) triangle(start, start + i, start + i + 1);
  }
  return { body, ellipsoid, tube, sheet, finish() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices); g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  } };
}
const shape = build => { const b = builder(); build(b); return b.finish(); };
function part(root, name, make, parent = root) {
  const geometry = share(root, `${root.userData.speciesId}/geometry/${name}`, make),
    material = share(root, 'material/nonemissive-fish-tissue', () => new THREE.MeshStandardMaterial({ vertexColors: true,
      roughness: .67, metalness: 0, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0 })), mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = false; parent.add(mesh); return mesh;
}
const profile = (start, end, rows, ry, rz) => Array.from({ length: rows }, (_, i) => {
  const t = i / (rows - 1), full = Math.sin(Math.PI * (.025 + .95 * t)); return [start + (end - start) * t, ry * full, rz * full];
});
function eyes(root, x, y, z, radius = .02) {
  part(root, 'paired eyes', () => shape(b => { for (const s of [-1, 1]) {
    b.ellipsoid([x, y, s * z], [radius, radius, .006], [.73, .69, .42]);
    b.ellipsoid([x + .003, y, s * (z + .005)], [radius * .56, radius * .56, .003], [.025, .028, .025]);
  } }));
}
function tail(root, x, outline, tint) {
  const pivot = new THREE.Group(); pivot.name = 'tail pivot'; pivot.position.x = x; root.add(pivot);
  part(root, 'complete caudal fin', () => shape(b => b.sheet(outline, tint)), pivot); return pivot;
}
function pectorals(root, x, y, z, reach, tint) {
  return [-1, 1].map(s => { const pivot = new THREE.Group(); pivot.name = `pectoral pivot ${s}`; pivot.position.set(x, y, s * z); root.add(pivot);
    part(root, `paired pectoral fin ${s}`, () => shape(b => b.sheet([[0, 0, 0], [-.10, -.05, s * reach], [-.13, .035, s * reach * .65]], tint)), pivot);
    return pivot; });
}




const blue = [.25,.36,.59], yellow = [.78,.69,.32];
function emperor(root) {
  const tint=(x,y,z)=>x>.20?((y>.005&&y<.16)?[.10,.13,.18]:[.63,.65,.51]):
    Math.sin((y+x*.20)*Math.PI*45)>.05?yellow:blue;
  part(root,'deep adult body with diagonal blue yellow bands',()=>shape(b=>b.body(profile(-.32,.36,105,.222,.061),tint,60)));
  part(root,'blunt snout lips and paired preopercular spines',()=>shape(b=>{
    b.ellipsoid([.428,-.012,0],[.072,.094,.052],tint,36,20);
    for(const s of[-1,1]){
      b.tube([[.45,-.026,s*.027],[.493,-.012,s*.009]],[.003,.002],[.29,.27,.21]);
      b.tube([[.17,-.092,s*.066],[.105,-.146,s*.074]],[.008,0],[.55,.57,.48]);
    }
  }));eyes(root,.349,.077,.058,.025);
  part(root,'long dorsal and rounded anal paired pelvic fins',()=>shape(b=>{
    b.sheet([[.28,.13,0],[.18,.29,0],[.02,.31,0],[-.21,.36,0],[-.32,.08,0]],blue);
    b.sheet([[.11,-.19,0],[-.11,-.30,0],[-.28,-.25,0],[-.32,-.05,0]],blue);
    for(const s of[-1,1])b.sheet([[.12,-.16,s*.02],[.005,-.29,s*.054],[-.09,-.15,s*.025]],yellow);
  }));
  root.userData.motion={tail:tail(root,-.32,[[0,.035,0],[-.12,.15,0],[-.18,.105,0],[-.18,-.105,0],[-.12,-.15,0],[0,-.035,0]],yellow),
    pectorals:pectorals(root,.19,-.035,.055,.075,[.61,.64,.43])};
}
function cruising(root,snapper) {
  const tint=(x,y,z)=>{
    if(snapper){if(y<-.038)return Math.abs(Math.sin(y*240))<.2?[.63,.64,.57]:[.78,.78,.69];
      if([-.006,.043,.092,.141].some(line=>Math.abs(y-line)<.009))return [.22,.43,.60];return yellow;}
    if(y<-.025)return [.72,.74,.67];if([.012,.073].some(line=>Math.abs(y-line)<.007))return yellow;return [.35,.52,.53];
  };
  part(root,snapper?'four blue bands on yellow snapper body':'slender blue green fusilier with two yellow lateral stripes',()=>shape(b=>b.body(profile(-.32,.39,105,snapper?.139:.101,snapper?.064:.049),tint,64)));
  part(root,'complete head small mouth and opercular curve',()=>shape(b=>{
    b.ellipsoid([.44,-.002,0],[.06,snapper?.062:.050,.043],snapper?yellow:[.40,.56,.55],32,16);
    for(const s of[-1,1]){b.tube([[.461,-.016,s*.031],[.492,-.001,s*.016]],[.002,.001],[.21,.23,.22]);
      b.tube([[.25,.082,s*.047],[.22,.009,s*.065],[.245,-.065,s*.047]],[.002,.002,.002],[.35,.40,.38]);}
  }));eyes(root,.353,.044,.061,.025);
  part(root,'spiny and yellow soft dorsal anal and paired pelvic fins',()=>shape(b=>{
    b.sheet([[.26,.09,0],[.18,.235,0],[.12,.19,0],[.05,.225,0],[-.03,.125,0],[-.14,.22,0],[-.29,.09,0]],snapper?yellow:[.62,.67,.61]);
    b.sheet([[.0,-.13,0],[-.16,-.235,0],[-.30,-.05,0]],snapper?yellow:[.62,.67,.61]);
    for(const s of[-1,1])b.sheet([[.16,-.097,s*.028],[.05,-.23,s*.06],[-.04,-.11,s*.035]],snapper?yellow:[.62,.67,.61]);
  }));
  root.userData.motion={tail:tail(root,-.32,[[0,.035,0],[-.18,.17,0],[-.12,0,0],[-.18,-.17,0],[0,-.035,0]],snapper?yellow:(x,y,z)=>x<-.14&&Math.abs(y)>.13?[.10,.14,.14]:[.63,.69,.64]),
    pectorals:pectorals(root,.19,-.035,.055,.075,snapper?yellow:[.63,.69,.64])};
}
const builds={'emperor-angelfish':emperor,'doubleline-fusilier':r=>cruising(r,false),'bluestripe-snapper':r=>cruising(r,true)};
export function createReefColorFishAnimal(speciesOrId){
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id;
  if(!isReefColorFishAnimal(id))throw new RangeError('Unknown reef visitor species.');
  const descriptor=oceanReefColorFishSpeciesById[id],root=new THREE.Group();root.name=descriptor.commonName;
  Object.assign(root.userData,{speciesId:id,reefColorFishAnimalResources:new Set(),reefColorFishAnimalDisposed:false,independentAnimal:true,
    sizeMeasure:descriptor.sizeMeasure,normalizedEnvelope:descriptor.normalizedEnvelope,morphology:descriptor.morphology,
    emissionEnabled:false,sourceLinks:descriptor.sourceLinks.map(s=>({...s})),axes:descriptor.normalizedEnvelope.axes});
  try{builds[id](root);instances.add(root);animateReefColorFishAnimal(root,null,0);return root;}
  catch(error){disposeReefColorFishAnimal(root);throw error;}
}
export function animateReefColorFishAnimal(root,agent=null,timeSec=0){
  if(!root?.userData||root.userData.reefColorFishAnimalDisposed)return false;
  const descriptor=oceanReefColorFishSpeciesById[root.userData.speciesId],m=root.userData.motion,
    clock=Number.isFinite(timeSec)?timeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0,
    alive=agent?.alive!==false,resting=['resting','ambush-waiting'].includes(agent?.state),moving=alive&&Math.hypot(agent?.velocity?.x??0,agent?.velocity?.y??0,agent?.velocity?.z??0)>.0001;
  m.tail.rotation.y=alive?Math.sin(clock*(moving?3.2:1.1)+phase)*descriptor.animationBounds.tailYawRad*(resting?.15:moving?1:.3):0;
  m.pectorals.forEach((p,i)=>{p.rotation.x=alive?Math.sin(clock*1.7+phase+i*Math.PI)*descriptor.animationBounds.pectoralRollRad*(resting?.2:1):0;});
  m.wings?.forEach((p,i)=>{p.rotation.x=alive?Math.sin(clock*1.5+phase)*descriptor.animationBounds.wingRollRad*(i===0?-1:1):0;});
  return true;
}
export function disposeReefColorFishAnimal(root){
  if(!root?.userData||root.userData.reefColorFishAnimalDisposed)return false;
  root.userData.reefColorFishAnimalDisposed=true;
  for(const key of root.userData.reefColorFishAnimalResources??[]){const r=resources.get(key);if(r&&--r.refs===0){r.value.dispose();resources.delete(key);}}
  root.userData.reefColorFishAnimalResources?.clear();instances.delete(root);root.removeFromParent();return true;
}
export const reefColorFishAnimalAssetStats=()=>({resources:resources.size,instances:instances.size});
