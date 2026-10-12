import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OCEAN_REEF_GRAZERS_IDS, oceanReefGrazersSpeciesById } from '../oceanReefGrazersSpecies.js';
const resources = new Map(), instances = new Set(), TAU = Math.PI * 2;
export const isReefGrazerAnimal = id => OCEAN_REEF_GRAZERS_IDS.includes(id);
function share(root, key, make) {
  let r = resources.get(key); if (!r) { r = { value: make(), refs: 0 }; resources.set(key, r); }
  if (!root.userData.reefGrazersResources.has(key)) { root.userData.reefGrazersResources.add(key); r.refs++; }
  return r.value;
}
// Merge each whole animal section, including spines or chaetae, into one geometry.
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, c) => { const n = positions.length / 3; positions.push(p[0], Math.max(0, p[1]), p[2]); colors.push(...c); return n; };
  function tube(points, radius, tint, sides = 8) {
    const start = positions.length / 3;
    points.forEach((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      const v = new THREE.Vector3().crossVectors(axis, u), r = Array.isArray(radius) ? radius[i] : radius * (1 - .55 * i / Math.max(1, points.length - 1));
      for (let j = 0; j < sides; j++) { const h = TAU * j / sides; vertex([p[0] + r * (u.x * Math.cos(h) + v.x * Math.sin(h)),
        p[1] + r * (u.y * Math.cos(h) + v.y * Math.sin(h)), p[2] + r * (u.z * Math.cos(h) + v.z * Math.sin(h))], tint); }
    });
    for (let i = 0; i < points.length - 1; i++) for (let j = 0; j < sides; j++) {
      const a = start + i * sides + j, b = start + i * sides + (j + 1) % sides, c = a + sides, d = b + sides;
      indices.push(a, b, c, b, d, c);
    }
  }
  return { tube, finish() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g; } };
}
function coloredEllipsoid(center, scale, tint, flat = false) {
  const g = new THREE.SphereGeometry(1, 32, 24), p = g.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) { const x = center[0] + p.getX(i) * scale[0], y = center[1] + p.getY(i) * scale[1], z = center[2] + p.getZ(i) * scale[2];
    p.setXYZ(i, x, flat ? Math.max(0, y) : y, z); c.push(...(typeof tint === 'function' ? tint(x, y, z) : tint)); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
function part(root, name, make, parent = root) {
  const mesh = new THREE.Mesh(share(root, `${root.userData.speciesId}/${name}`, make), share(root, 'non-emissive-tissue', () =>
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: 0, side: THREE.DoubleSide, emissiveIntensity: 0 })));
  mesh.name = name; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

function fireworm(root) {
  const sections=Array.from({length:6},(_,i)=>{
    const pivot=new THREE.Group();pivot.name=`segmented crawling section ${i}`;pivot.position.x=-.5+(i+.5)/6;root.add(pivot);
    part(root,`body, paired chaetae and gills ${i}`,()=>{
      const meshes=[],b=builder();
      for(let j=0;j<4;j++){
        const x=(j-1.5)/24,g=coloredEllipsoid([x,.056,0],[1/48,.029,.049],[.59+.025*(j%2),.34,.29]);g.deleteAttribute('uv');meshes.push(g);
        for(const side of[-1,1]){
          b.tube([[x,.033,side*.035],[x,.009,side*.073]],[.009,.005],[.58,.36,.31],5);
          for(let k=0;k<4;k++)b.tube([[x,.040,side*.062],[x+(k-1.5)*.007,.07+k*.006,side*(.095+k*.006)]],[.0018,.0004],[.84,.81,.69],4);
          b.tube([[x,.079,side*.024],[x,.102,side*.039],[x+.009,.117,side*.045]],[.0025,.002,.0006],[.61,.35,.30],4);
        }
      }
      meshes.push(b.finish());const merged=mergeGeometries(meshes);meshes.forEach(g=>g.dispose());merged.computeBoundingBox();merged.computeBoundingSphere();return merged;
    },pivot);return pivot;
  });
  part(root,'six real parapodial contact patches',()=>{const b=builder();for(const p of oceanReefGrazersSpeciesById['reef-fireworm'].support.footContacts)
    b.tube([[p.x,.021,p.z],[p.x,0,p.z]],[.006,.004],[.58,.34,.28],6);return b.finish();});
  part(root,'anterior sensory appendages and eyes',()=>{const b=builder();
    for(const z of[-.022,.022])b.tube([[.47,.074,z],[.515,.09,z*1.5],[.548,.095,z*1.8]],[.003,.002,.001],[.74,.49,.36],6);
    const eyes=[-.014,.014].map(z=>{const g=coloredEllipsoid([.481,.082,z],[.005,.004,.005],[.12,.10,.09]);g.deleteAttribute('uv');return g;});
    eyes.push(b.finish());const merged=mergeGeometries(eyes);eyes.forEach(g=>g.dispose());return merged;
  });root.userData.motion={sections};
}
function diadem(root) {
  part(root,'living dark test with five pale spots and blue dots',()=>coloredEllipsoid([0,.34,0],[.5,.27,.5],(x,y,z)=>{
    const a=Math.atan2(z,x),r=Math.hypot(x,z),h=TAU/5,near=Math.abs(Math.atan2(Math.sin(a-Math.round(a/h)*h),Math.cos(a-Math.round(a/h)*h)));
    if(y>.43&&r>.20&&r<.34&&near<.20)return[.73,.77,.71];
    if(y>.31&&near<.06&&Math.floor(y*85)%3===0)return[.19,.39,.52];return[.055,.068,.08];
  }));
  const spines=part(root,'merged long needle and short spine fields',()=>{const b=builder();
    for(let row=0;row<5;row++)for(let j=0;j<32;j++){
      const h=(j+.5*(row%2))*TAU/32,polar=.26+row*.29,s=Math.sin(polar),c=Math.cos(polar),r=.48;
      const length=1.75+.75*((j*7+row*3)%11)/10;
      b.tube([[r*s*Math.cos(h),.34+.26*c,r*s*Math.sin(h)],[(r+length)*s*Math.cos(h),.34+(.26+length)*c,(r+length)*s*Math.sin(h)]],[.0055,.0004],[.06,.075,.09],5);
      if(row>0)b.tube([[r*s*Math.cos(h),.34+.26*c,r*s*Math.sin(h)],[(r+.20)*s*Math.cos(h),.34+(.26+.20)*c,(r+.20)*s*Math.sin(h)]],[.007,.001],[.09,.10,.11],5);
    }return b.finish();});
  part(root,'orange anal ring and cone',()=>{const b=builder(),points=Array.from({length:25},(_,i)=>{const a=i*TAU/24;return[.070*Math.cos(a),.665,.070*Math.sin(a)];});
    b.tube([[0,.585,0],[0,.65,0]],[.078,.069],[.13,.16,.16],16);b.tube(points,.009,[.78,.40,.16],6);return b.finish();});
  part(root,'six oral tube feet and actual contact tips',()=>{const b=builder();for(const p of oceanReefGrazersSpeciesById['long-spined-diadem-urchin'].support.footContacts)
    b.tube([[p.x,.09,p.z],[p.x,0,p.z]],[.013,.004],[.10,.14,.14],6);return b.finish();});root.userData.motion={spines};
}
export function createReefGrazerAnimal(speciesOrId){
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id;if(!isReefGrazerAnimal(id))throw new RangeError('Unknown reef grazer.');
  const s=oceanReefGrazersSpeciesById[id],root=new THREE.Group();root.name=s.commonName;
  Object.assign(root.userData,{speciesId:id,reefGrazersResources:new Set(),reefGrazersDisposed:false,independentAnimal:true,
    sizeMeasure:s.sizeMeasure,normalizedEnvelope:s.normalizedEnvelope,morphology:s.morphology,emissionEnabled:false,sourceLinks:s.sourceLinks.map(v=>({...v})),axes:s.normalizedEnvelope.axes});
  try{(id==='reef-fireworm'?fireworm:diadem)(root);instances.add(root);animateReefGrazerAnimal(root,null,0);return root;}catch(e){disposeReefGrazerAnimal(root);throw e;}
}
export function animateReefGrazerAnimal(root,agent=null,timeSec=0){
  if(!root?.userData||root.userData.reefGrazersDisposed)return false;
  const clock=Number.isFinite(timeSec)?timeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0,m=root.userData.motion;
  const alive=agent?.alive!==false,speed=Math.hypot(agent?.velocity?.x??0,agent?.velocity?.y??0,agent?.velocity?.z??0);
  const gait=alive&&speed>1e-7?1:0,feed=alive&&Number.isFinite(agent?.lastFeedAt)&&clock>=agent.lastFeedAt?Math.exp(-(clock-agent.lastFeedAt)*2):0;
  if(m.sections)m.sections.forEach((p,i)=>{p.rotation.y=(gait*.016+feed*.006)*Math.sin(clock*2.0+phase-i*.9);});
  if(m.spines)m.spines.rotation.y=gait*.006*Math.sin(clock*1.6+phase);
  root.userData.motionDrivenBy='actual-saved-velocity-and-owner-intake';return true;
}
export function disposeReefGrazerAnimal(root){
  if(!root?.userData||root.userData.reefGrazersDisposed)return false;root.userData.reefGrazersDisposed=true;
  for(const key of root.userData.reefGrazersResources??[]){const r=resources.get(key);if(r&&--r.refs===0){r.value.dispose();resources.delete(key);}}
  root.userData.reefGrazersResources?.clear();instances.delete(root);root.removeFromParent();return true;
}
export const reefGrazersAssetStats=()=>({resources:resources.size,instances:instances.size});
