import * as THREE from 'three';
import { OCEAN_REEF_SLOPE_IDS, oceanReefSlopeSpeciesById } from '../oceanReefSlopeSpecies.js';
// +X forward. Immutable shared geometry; instance-local fin pivots. Animation
// consumes the owner's model clock and never moves an ecological record.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const isReefSlopeAnimal = id => OCEAN_REEF_SLOPE_IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefSlopeAnimalResources.has(key)) { root.userData.reefSlopeAnimalResources.add(key); row.refs++; }
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



const red=(x,y,z)=>Math.sin(x*169+Math.sin(y*133)*.6)>.79 ? [.40,.18,.16] : y>0?[.65,.36,.31]:[.77,.52,.44];
function soldier(root){
  part(root,'deep body with red scale edges',()=>shape(b=>b.body(profile(-.32,.36,85,.175,.071),red,40)));
  part(root,'projecting lower jaw and dark opercular margin',()=>shape(b=>{
    b.ellipsoid([.413,-.013,0],[.075,.08,.054],red,28,14);
    b.ellipsoid([.449,-.056,0],[.051,.029,.038],[.67,.41,.34],24,12);
    for(const s of[-1,1])b.tube([[.20,.105,s*.061],[.18,.015,s*.076],[.21,-.105,s*.059]],[.008,.009,.005],[.19,.15,.14]);
  }));eyes(root,.346,.072,.063,.041);
  part(root,'yellow spiny dorsal separate soft dorsal and pelvic fins',()=>shape(b=>{
    b.sheet([[.28,.095,0],[.20,.29,0],[.14,.19,0],[.075,.29,0],[.00,.18,0],[-.06,.265,0],[-.115,.15,0]],[.66,.54,.27]);
    b.sheet([[-.14,.14,0],[-.20,.25,0],[-.30,.13,0]],[.66,.36,.29]);
    b.sheet([[-.04,-.165,0],[-.20,-.28,0],[-.30,-.07,0]],[.68,.43,.35]);
    for(const s of[-1,1])b.sheet([[.09,-.14,s*.03],[-.035,-.27,s*.08],[-.10,-.14,s*.025]],[.75,.54,.42]);
  }));root.userData.motion={tail:tail(root,-.32,[[0,.045,0],[-.18,.18,0],[-.11,0,0],[-.18,-.18,0],[0,-.045,0]],[.69,.45,.36]),
    pectorals:pectorals(root,.18,-.055,.07,.08,[.71,.47,.36])};
}
function bigeye(root){
  part(root,'compressed red slope body',()=>shape(b=>b.body(profile(-.32,.40,85,.171,.061),red,40)));
  part(root,'oblique upturned mouth',()=>shape(b=>{
    b.ellipsoid([.447,.039,0],[.053,.082,.046],[.73,.43,.37],28,14);
    for(const s of[-1,1])b.tube([[.365,-.025,s*.057],[.478,.084,s*.024]],[.003,.002],[.24,.14,.13]);
  }));eyes(root,.333,.055,.063,.052);
  part(root,'angular high posterior dorsal and anal fin',()=>shape(b=>{
    b.sheet([[.30,.11,0],[.23,.235,0],[.07,.22,0],[-.12,.335,0],[-.27,.25,0],[-.32,.05,0]],[.61,.29,.25]);
    b.sheet([[.02,-.17,0],[-.20,-.29,0],[-.31,-.05,0]],[.66,.34,.29]);
    for(const s of[-1,1])b.sheet([[.13,-.135,s*.022],[.01,-.26,s*.075],[-.05,-.125,s*.028]],[.68,.40,.33]);
  }));root.userData.motion={tail:tail(root,-.32,[[0,.035,0],[-.18,.19,0],[-.13,.13,0],[-.08,.06,0],[-.065,0,0],[-.08,-.06,0],[-.13,-.13,0],[-.18,-.19,0],[0,-.035,0]],[.69,.36,.30]),
    pectorals:pectorals(root,.15,-.035,.06,.075,[.70,.41,.33])};
}
function bottomPectorals(root){
  return [-1,1].map(s=>{const pivot=new THREE.Group();pivot.position.set(.18,.035,s*.05);root.add(pivot);
    part(root,`supported pectoral ${s}`,()=>shape(b=>b.sheet([[0,0,0],[-.11,-.024,s*.11],[-.15,.009,s*.06]],[.54,.51,.39])),pivot);return pivot;});
}
const sandTint=(lizard)=>(x,y,z)=>{
  const saddle=lizard?Math.sin((x+.035)*TAU*8)>.48 && y>.066:
    Math.sin(x*TAU*12)>.57 && (Math.abs(y-.07)<.018 || Math.abs(y-.105)<.016);
  if(saddle)return [.30,.27,.22];
  if(lizard&&Math.abs(y-.068)<.004)return [.49,.58,.57];
  return y>.061?[.57,.51,.42]:[.71,.70,.60];
};
function bottom(root,lizard){
  const tint=sandTint(lizard);
  part(root,lizard?'long low lizardfish body':'elongate spotted sandperch body',()=>shape(b=>{
    const rows=profile(-.32,.39,89,lizard?.052:.066,lizard?.043:.052);
    b.body(rows,tint,40);
  }));
  // Root is the support plane; lift only the immutable body geometry.
  root.children.at(-1).position.y=lizard?.054:.068;
  part(root,'low broad head mouth and six-contact belly',()=>shape(b=>{
    b.ellipsoid([.426,lizard?.057:.076,0],[.074,lizard?.047:.060,lizard?.071:.065],tint,32,16);
    for(const s of[-1,1]){
      b.tube([[.36,.034,s*.069],[.491,.051,s*.022]],[.0028,.001],[.23,.21,.17]);
      b.sheet([[.07,.009,s*.018],[-.13,.007,s*.09],[-.20,.012,s*.026]],[.62,.59,.45]);
    }
  }));eyes(root,.362,lizard?.087:.115,.050,lizard?.019:.024);
  part(root,lizard?'single triangular dorsal small adipose and anal':'long five-spine and soft dorsal and anal',()=>shape(b=>{
    if(lizard){b.sheet([[.15,.097,0],[.055,.23,0],[-.08,.099,0]],[.57,.51,.39]);
      b.sheet([[-.205,.081,0],[-.242,.116,0],[-.29,.070,0]],[.56,.51,.41]);}
    else b.sheet([[.20,.122,0],[.14,.20,0],[.05,.155,0],[-.08,.205,0],[-.24,.18,0],[-.31,.077,0]],[.57,.52,.40]);
    b.sheet([[-.12,.016,0],[-.23,.004,0],[-.30,.028,0]],[.65,.62,.48]);
  }));const caudal=tail(root,-.32,[[0,.025,0],[-.15,.09,0],[-.18,.055,0],[-.16,0,0],[-.18,-.044,0],[-.15,-.053,0],[0,-.024,0]],
    (x,y,z)=>!lizard&&Math.abs(y)<.025?[.82,.82,.71]:[.56,.50,.38]);caudal.position.y=.056;
  root.userData.motion={tail:caudal,pectorals:bottomPectorals(root)};
}
const builds={'bigscale-soldierfish':soldier,'lunartail-bigeye':bigeye,
  'banded-lizardfish':r=>bottom(r,true),'thousand-spot-sandperch':r=>bottom(r,false)};
export function createReefSlopeAnimal(speciesOrId){
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id;
  if(!isReefSlopeAnimal(id))throw new RangeError('Unknown reef visitor species.');
  const descriptor=oceanReefSlopeSpeciesById[id],root=new THREE.Group();root.name=descriptor.commonName;
  Object.assign(root.userData,{speciesId:id,reefSlopeAnimalResources:new Set(),reefSlopeAnimalDisposed:false,independentAnimal:true,
    sizeMeasure:descriptor.sizeMeasure,normalizedEnvelope:descriptor.normalizedEnvelope,morphology:descriptor.morphology,
    emissionEnabled:false,sourceLinks:descriptor.sourceLinks.map(s=>({...s})),axes:descriptor.normalizedEnvelope.axes});
  try{builds[id](root);instances.add(root);animateReefSlopeAnimal(root,null,0);return root;}
  catch(error){disposeReefSlopeAnimal(root);throw error;}
}
export function animateReefSlopeAnimal(root,agent=null,timeSec=0){
  if(!root?.userData||root.userData.reefSlopeAnimalDisposed)return false;
  const descriptor=oceanReefSlopeSpeciesById[root.userData.speciesId],m=root.userData.motion,
    clock=Number.isFinite(timeSec)?timeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0,
    alive=agent?.alive!==false,resting=['resting','ambush-waiting'].includes(agent?.state),moving=alive&&Math.hypot(agent?.velocity?.x??0,agent?.velocity?.y??0,agent?.velocity?.z??0)>.0001;
  m.tail.rotation.y=alive?Math.sin(clock*(moving?3.2:1.1)+phase)*descriptor.animationBounds.tailYawRad*(resting?.15:moving?1:.3):0;
  m.pectorals.forEach((p,i)=>{p.rotation.x=alive?Math.sin(clock*1.7+phase+i*Math.PI)*descriptor.animationBounds.pectoralRollRad*(resting?.2:1):0;});
  m.wings?.forEach((p,i)=>{p.rotation.x=alive?Math.sin(clock*1.5+phase)*descriptor.animationBounds.wingRollRad*(i===0?-1:1):0;});
  return true;
}
export function disposeReefSlopeAnimal(root){
  if(!root?.userData||root.userData.reefSlopeAnimalDisposed)return false;
  root.userData.reefSlopeAnimalDisposed=true;
  for(const key of root.userData.reefSlopeAnimalResources??[]){const r=resources.get(key);if(r&&--r.refs===0){r.value.dispose();resources.delete(key);}}
  root.userData.reefSlopeAnimalResources?.clear();instances.delete(root);root.removeFromParent();return true;
}
export const reefSlopeAnimalAssetStats=()=>({resources:resources.size,instances:instances.size});
