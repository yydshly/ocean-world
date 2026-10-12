import * as THREE from 'three';
import { OCEAN_REEF_MOBILE_BENTHOS_IDS, oceanReefMobileBenthosSpeciesById } from '../oceanReefMobileBenthosSpecies.js';
const resources = new Map(), instances = new Set(), TAU = Math.PI * 2;
export const isReefMobileBenthosAnimal = id => OCEAN_REEF_MOBILE_BENTHOS_IDS.includes(id);
function share(root, key, make) {
  let r = resources.get(key); if (!r) { r = { value: make(), refs: 0 }; resources.set(key, r); }
  if (!root.userData.reefMobileBenthosResources.has(key)) { root.userData.reefMobileBenthosResources.add(key); r.refs++; }
  return r.value;
}
// Tube strips merge each fan sector into one geometry. No mesh per pinnule.
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

function brittleStar(root) {
  part(root, 'distinct patterned central disc', () => coloredEllipsoid([0,.10,0],[.5,.085,.5],(x,y,z)=> {
    const a=Math.atan2(z,x),r=Math.hypot(x,z),dark=r<.17||Math.cos(a*5)>.62;
    return dark?[.28,.24,.19]:Math.sin(x*35+z*21)>.55?[.67,.59,.43]:[.76,.69,.54];
  }));
  const arms=Array.from({length:5},(_,i)=>{
    const h=i*TAU/5,c=Math.cos(h),z=Math.sin(h);
    part(root,`proximal arm ventral supports ${i}`,()=>{const b=builder();b.tube([.48,.66,.86,1].map(r=>[r*c,.04,r*z]),[.04,.04,.04,.04],[.65,.56,.40]);return b.finish();});
    const pivot=new THREE.Group();pivot.name=`distal segmented arm ${i}`;pivot.position.set(c,0,z);pivot.rotation.y=-h;root.add(pivot);
    part(root,`banded arm and small side spines ${i}`,()=>{const b=builder(),n=32;
      // Separate plate-like short strips retain bands without changing geometry.
      for(let j=0;j<n;j++){
        const x=j*2.27/n,next=(j+1)*2.27/n,r=.038*(1-j/n)+.004,rr=.038*(1-(j+1)/n)+.004;
        b.tube([[x,.048,0],[next,.048,0]],[r,rr],Math.floor(j/3)%2?[.37,.30,.22]:[.75,.65,.47]);
        if(j%2===0)for(const side of[-1,1])b.tube([[x,.045,side*r],[x+.012,.044,side*(r+.025)]],[.004,.002],[.65,.56,.40],4);
      }return b.finish();},pivot);
    return {pivot,heading:-h};
  });root.userData.motion={arms};
}
function seaBiscuit(root) {
  part(root,'flattened living sea-biscuit test',()=>coloredEllipsoid([0,.077,0],[.5,.069,.425],(x,y,z)=>{
    if(y<.04)return[.47,.43,.31];
    const a=Math.atan2(z,x),r=Math.hypot(x,z),sector=Math.round(a/(TAU/5)),delta=a-sector*TAU/5;
    const petal=Math.abs(Math.abs(Math.sin(delta))*r-.028*Math.sin(Math.min(1,r/.38)*Math.PI));
    return r>.07&&r<.38&&petal<.009?[.40,.35,.23]:[.59,.52,.34];
  }));
  part(root,'oral tube feet with six true contact tips',()=>{const b=builder();for(const p of oceanReefMobileBenthosSpeciesById['humble-sea-biscuit'].support.footContacts)
    b.tube([[p.x,.024,p.z],[p.x,0,p.z]],[.005,.004],[.63,.54,.34]);return b.finish();});
  const spines=part(root,'merged short spine covering',()=>{const b=builder();
    for(let row=1;row<=9;row++)for(let j=0;j<40;j++){
      const r=row/10,h=(j+.5*(row%2))*TAU/40,x=.49*r*Math.cos(h),z=.415*r*Math.sin(h),y=.077+.069*Math.sqrt(1-r*r);
      b.tube([[x,y,z],[x+Math.cos(h)*.012,y+.014,z+Math.sin(h)*.012]],[.0026,.001],[.54,.46,.29],4);
    }return b.finish();});root.userData.motion={spines};
}
export function createReefMobileBenthosAnimal(speciesOrId) {
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id;if(!isReefMobileBenthosAnimal(id))throw new RangeError('Unknown mobile reef benthos.');
  const s=oceanReefMobileBenthosSpeciesById[id],root=new THREE.Group();root.name=s.commonName;
  Object.assign(root.userData,{speciesId:id,reefMobileBenthosResources:new Set(),reefMobileBenthosDisposed:false,independentAnimal:true,
    sizeMeasure:s.sizeMeasure,normalizedEnvelope:s.normalizedEnvelope,morphology:s.morphology,emissionEnabled:false,sourceLinks:s.sourceLinks.map(v=>({...v})),axes:s.normalizedEnvelope.axes});
  try{(id==='banded-brittle-star'?brittleStar:seaBiscuit)(root);instances.add(root);animateReefMobileBenthosAnimal(root,null,0);return root;}
  catch(e){disposeReefMobileBenthosAnimal(root);throw e;}
}
export function animateReefMobileBenthosAnimal(root,agent=null,timeSec=0){
  if(!root?.userData||root.userData.reefMobileBenthosDisposed)return false;
  const clock=Number.isFinite(timeSec)?timeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0,m=root.userData.motion;
  const alive=agent?.alive!==false,speed=Math.hypot(agent?.velocity?.x??0,agent?.velocity?.y??0,agent?.velocity?.z??0);
  const gait=alive&&speed>1e-7?1:0,feed=alive&&Number.isFinite(agent?.lastFeedAt)&&clock>=agent.lastFeedAt?Math.exp(-(clock-agent.lastFeedAt)*2):0;
  if(m.arms)m.arms.forEach(({pivot,heading},i)=>{pivot.rotation.y=heading+(gait*.025+feed*.008)*Math.sin(clock*2.1+phase+i*1.3);});
  if(m.spines)m.spines.rotation.y=gait*.006*Math.sin(clock*1.8+phase);
  root.userData.motionDrivenBy='actual-saved-velocity-and-recent-owner-intake';return true;
}
export function disposeReefMobileBenthosAnimal(root){
  if(!root?.userData||root.userData.reefMobileBenthosDisposed)return false;root.userData.reefMobileBenthosDisposed=true;
  for(const key of root.userData.reefMobileBenthosResources??[]){const r=resources.get(key);if(r&&--r.refs===0){r.value.dispose();resources.delete(key);}}
  root.userData.reefMobileBenthosResources?.clear();instances.delete(root);root.removeFromParent();return true;
}
export const reefMobileBenthosAssetStats=()=>({resources:resources.size,instances:instances.size});
