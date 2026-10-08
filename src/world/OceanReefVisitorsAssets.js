import * as THREE from 'three';
import { OCEAN_REEF_VISITOR_IDS, oceanReefVisitorsSpeciesById } from '../oceanReefVisitorsSpecies.js';
// +X forward. Immutable shared geometry; instance-local fin pivots. Animation
// consumes the owner's model clock and never moves an ecological record.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const isReefVisitor = id => OCEAN_REEF_VISITOR_IDS.includes(id);
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefVisitorResources.has(key)) { root.userData.reefVisitorResources.add(key); row.refs++; }
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


const silver = (x,y,z) => {
  const bars = Math.sin(x * 59 + y * 9) > .72 && y > -.015;
  return bars ? [.25,.31,.27] : y > 0 ? [.48,.56,.53] : [.69,.73,.66];
};
function barracuda(root) {
  part(root, 'long narrow barracuda body', () => shape(b => b.body(profile(-.32,.39,81,.066,.043),silver,36)));
  part(root, 'pointed snout and protruding lower jaw', () => shape(b => {
    b.ellipsoid([.413,.007,0],[.075,.031,.028],silver,24,12);
    b.ellipsoid([.447,-.025,0],[.053,.013,.022],[.65,.70,.63],24,10);
    b.tube([[.407,-.008,.027],[.482,-.008,.009]],[.0025,.001],[.13,.18,.15]);
    b.tube([[.407,-.008,-.027],[.482,-.008,-.009]],[.0025,.001],[.13,.18,.15]);
  })); eyes(root,.390,.032,.032,.009);
  part(root, 'two separated dorsals and opposed anal fin', () => shape(b => {
    b.sheet([[.14,.063,0],[.08,.162,0],[-.035,.062,0]], [.37,.45,.39]);
    b.sheet([[-.17,.046,0],[-.205,.137,0],[-.31,.028,0]], [.39,.47,.42]);
    b.sheet([[-.16,-.046,0],[-.22,-.124,0],[-.31,-.028,0]], [.43,.51,.44]);
    for(const s of [-1,1]) b.sheet([[.08,-.045,s*.018],[.00,-.085,s*.055],[-.045,-.045,s*.014]],[.48,.54,.46]);
  }));
  root.userData.motion={tail:tail(root,-.32,[[0,.025,0],[-.14,.12,0],[-.18,.08,0],[-.165,.030,0],
    [-.18,.018,0],[-.158,0,0],[-.18,-.018,0],[-.165,-.030,0],[-.18,-.08,0],[-.14,-.12,0],[0,-.025,0]], [.24,.31,.27]),
    pectorals:pectorals(root,.20,-.012,.044,.042,[.48,.56,.49])};
}
const blueTint=(x,y,z)=>{
  if(y>-.10&&Math.abs(z)>.035&&Math.sin(x*135+Math.sin(y*63)*2)> .89&&Math.cos(y*151+x*17)>.20)return [.12,.23,.27];
  return y>0?[.44,.56,.57]:[.68,.73,.66];
};
const blue=[.19,.39,.52];
function trevally(root) {
  part(root,'compressed spotted spindle body',()=>shape(b=>b.body(profile(-.30,.45,110,.183,.084),blueTint,60)));
  part(root,'tapered trevally snout and mouth',()=>shape(b=>{
    b.ellipsoid([.456,.001,0],[.044,.035,.028],[.55,.64,.60],20,10);
    b.ellipsoid([.499,-.009,0],[.001,.003,.021],[.11,.18,.15]);
  }));eyes(root,.353,.075,.063,.016);
  part(root,'separated dorsal and falcate second dorsal and anal fins',()=>shape(b=>{
    b.sheet([[.22,.143,0],[.13,.211,0],[.055,.185,0]],blue);
    b.sheet([[.02,.183,0],[-.062,.273,0],[-.105,.185,0],[-.30,.028,0]],blue);
    b.sheet([[.01,-.178,0],[-.07,-.260,0],[-.11,-.183,0],[-.30,-.029,0]],blue);
    for(const s of [-1,1])b.sheet([[.11,-.145,s*.022],[-.06,-.204,s*.065],[-.02,-.128,s*.022]],blue);
  }));
  root.userData.motion={tail:tail(root,-.30,[[0,.029,0],[-.20,.185,0],[-.13,.052,0],[-.07,0,0],
    [-.13,-.052,0],[-.20,-.185,0],[0,-.029,0]],blue), pectorals:pectorals(root,.20,-.013,.084,.07,blue)};
}
const sweetTint=(x,y,z)=> x>.38?[.68,.58,.25]:Math.sin(y*69)>0?[.16,.18,.15]:[.73,.75,.64];
const spottedYellow=(x,y,z)=>Math.sin(x*115+y*41)*Math.cos(y*117+x*22)>.63?[.14,.16,.12]:[.67,.60,.26];
function sweetlips(root){
  part(root,'deep adult body with horizontal stripes',()=>shape(b=>b.body(profile(-.30,.43,91,.213,.102),sweetTint,70)));
  part(root,'fleshy upper and lower lips and dark mouth',()=>shape(b=>{
    b.ellipsoid([.469,.024,0],[.031,.031,.042],[.70,.61,.27],24,12);
    b.ellipsoid([.474,-.021,0],[.026,.026,.042],[.70,.61,.27],24,12);
    b.ellipsoid([.499,.001,0],[.001,.005,.032],[.13,.16,.12]);
  }));eyes(root,.343,.082,.080,.018);
  part(root,'continuous adult dorsal and anal and paired pelvic fins',()=>shape(b=>{
    b.sheet([[.28,.152,0],[.19,.258,0],[.01,.278,0],[-.13,.251,0],[-.30,.034,0]],spottedYellow);
    b.sheet([[.02,-.206,0],[-.09,-.273,0],[-.23,-.188,0],[-.30,-.029,0]],spottedYellow);
    for(const s of [-1,1])b.sheet([[.12,-.178,s*.024],[-.04,-.240,s*.062],[.00,-.153,s*.024]],spottedYellow);
  }));
  root.userData.motion={tail:tail(root,-.30,[[0,.031,0],[-.20,.144,0],[-.20,-.144,0],[0,-.031,0]],spottedYellow),
    pectorals:pectorals(root,.20,-.023,.102,.045,spottedYellow)};
}
const rayTint=(x,y,z)=>{
  if(y<-.006)return [.72,.74,.64];
  const a=Math.sin(x*157+Math.sin(z*63)),c=Math.cos(z*127+x*19);
  return a>.77&&c>.50?[.76,.79,.69]:[.25,.31,.27];
};
function eagleRay(root){
  part(root,'flattened spotted central disc',()=>shape(b=>{
    b.ellipsoid([-.005,0,0],[.34,.054,.155],rayTint,62,28);
    b.ellipsoid([.295,.013,0],[.115,.055,.087],rayTint,32,16);
    b.ellipsoid([.416,-.008,0],[.074,.023,.073],rayTint,30,12);
  }));
  const wings=[-1,1].map(s=>{
    const pivot=new THREE.Group();pivot.name=`diamond pectoral wing ${s}`;root.add(pivot);
    part(root,`complete spotted wing ${s}`,()=>shape(b=>{
      // A grid retains actual spots and smooth thickness across the whole disc.
      for(let i=0;i<40;i++)for(let j=0;j<40;j++){
        const point=(u,v)=>{
          const x=.19-u*.54,z=s*(.10+v*.40*Math.sin(Math.PI*(.08+.84*u))),y=.011*Math.sin(Math.PI*v);
          return [x,y,z];
        };
        const u=i/40,v=j/40;
        b.sheet([point(u,v),point((i+1)/40,v),point((i+1)/40,(j+1)/40),point(u,(j+1)/40)],rayTint);
      }
      b.sheet([[.19,.0,s*.10],[-.08,.003,s*.5],[-.35,0,s*.10]],rayTint);
    }),pivot);return pivot;
  });
  eyes(root,.342,.047,.067,.013);
  part(root,'ventral mouth nostrils and five paired gill slits',()=>shape(b=>{
    b.tube([[.335,-.045,-.043],[.353,-.048,0],[.335,-.045,.043]],[.003,.003,.003],[.11,.15,.12]);
    for(const s of [-1,1]){
      b.ellipsoid([.374,-.032,s*.024],[.008,.003,.006],[.13,.18,.14]);
      for(let i=0;i<5;i++)b.tube([[.13-i*.040,-.052,s*.064],[.126-i*.040,-.049,s*.113]],[.002,.002],[.12,.16,.13]);
    }
  }));
  const tailPivot=new THREE.Group();tailPivot.position.x=-.30;root.add(tailPivot);
  part(root,'complete two-disc-width whip tail',()=>shape(b=>b.tube([[0,0,0],[-.22,.012,0],[-.70,.015,.013],[-1.20,.010,.032],[-2.02,0,.044]],
    [.023,.014,.007,.0035,.0008],[.23,.28,.24],10)),tailPivot);
  part(root,'small dorsal and proximal tail spine',()=>shape(b=>{
    b.sheet([[-.24,.030,0],[-.295,.096,0],[-.35,.025,0]],[.29,.34,.29]);
    b.tube([[-.40,.028,0],[-.48,.041,0]],[.003,.0003],[.34,.37,.30]);
  }));root.userData.motion={tail:tailPivot,wings,pectorals:[]};
}
const builds={'great-barracuda':barracuda,'bluefin-trevally':trevally,'oriental-sweetlips':sweetlips,'spotted-eagle-ray':eagleRay};
export function createReefVisitor(speciesOrId){
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id;
  if(!isReefVisitor(id))throw new RangeError('Unknown reef visitor species.');
  const descriptor=oceanReefVisitorsSpeciesById[id],root=new THREE.Group();root.name=descriptor.commonName;
  Object.assign(root.userData,{speciesId:id,reefVisitorResources:new Set(),reefVisitorDisposed:false,independentAnimal:true,
    sizeMeasure:descriptor.sizeMeasure,normalizedEnvelope:descriptor.normalizedEnvelope,morphology:descriptor.morphology,
    emissionEnabled:false,sourceLinks:descriptor.sourceLinks.map(s=>({...s})),axes:descriptor.normalizedEnvelope.axes});
  try{builds[id](root);instances.add(root);animateReefVisitor(root,null,0);return root;}
  catch(error){disposeReefVisitor(root);throw error;}
}
export function animateReefVisitor(root,agent=null,timeSec=0){
  if(!root?.userData||root.userData.reefVisitorDisposed)return false;
  const descriptor=oceanReefVisitorsSpeciesById[root.userData.speciesId],m=root.userData.motion,
    clock=Number.isFinite(timeSec)?timeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0,
    alive=agent?.alive!==false,resting=agent?.state==='resting',moving=alive&&Math.hypot(agent?.velocity?.x??0,agent?.velocity?.y??0,agent?.velocity?.z??0)>.0001;
  m.tail.rotation.y=alive?Math.sin(clock*(moving?3.2:1.1)+phase)*descriptor.animationBounds.tailYawRad*(resting?.15:moving?1:.3):0;
  m.pectorals.forEach((p,i)=>{p.rotation.x=alive?Math.sin(clock*1.7+phase+i*Math.PI)*descriptor.animationBounds.pectoralRollRad*(resting?.2:1):0;});
  m.wings?.forEach((p,i)=>{p.rotation.x=alive?Math.sin(clock*1.5+phase)*descriptor.animationBounds.wingRollRad*(i===0?-1:1):0;});
  return true;
}
export function disposeReefVisitor(root){
  if(!root?.userData||root.userData.reefVisitorDisposed)return false;
  root.userData.reefVisitorDisposed=true;
  for(const key of root.userData.reefVisitorResources??[]){const r=resources.get(key);if(r&&--r.refs===0){r.value.dispose();resources.delete(key);}}
  root.userData.reefVisitorResources?.clear();instances.delete(root);root.removeFromParent();return true;
}
export const reefVisitorAssetStats=()=>({resources:resources.size,instances:instances.size});
