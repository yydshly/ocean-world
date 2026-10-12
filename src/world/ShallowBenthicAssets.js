import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {shallowSpongeSourceGeometry} from './ShallowBenthicCorals.js';

// Whole benthic family: attributed live sponge scan, authored crab and clam.
// Catalogue units and the complete moving footprint are retained; no measured
// reconstruction claim is made for the authored animals.
export const SHALLOW_BENTHIC_IDS=['tube-sponge','fluted-giant-clam','spotted-reef-crab'];
const TAU=Math.PI*2;
const color=s=>new THREE.Color(s);
function finish(g,paint){
  const p=g.attributes.position,c=[];
  for(let i=0;i<p.count;i++)c.push(...paint(p.getX(i),p.getY(i),p.getZ(i)).toArray());
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.deleteAttribute('uv');g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function surface(rows,sides,fn,paint){
  const p=[],ix=[];for(let i=0;i<=rows;i++)for(let j=0;j<=sides;j++){
    p.push(...fn(i/rows,j/sides));if(i<rows&&j<sides){const a=i*(sides+1)+j,b=a+sides+1;ix.push(a,b,a+1,a+1,b,b+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);return finish(g,paint);
}
function egg(center,scale,paint,rows=16){const g=new THREE.SphereGeometry(1,28,rows);g.scale(...scale);g.translate(...center);return finish(g,paint);}
function merge(parts){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();return g;}
function limb(points,radii,paint){
  const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),frames=path.computeFrenetFrames(18,false);
  return surface(18,10,(t,v)=>{
    const i=Math.min(radii.length-2,Math.floor(t*(radii.length-1))),u=t*(radii.length-1)-i,r=THREE.MathUtils.lerp(radii[i],radii[i+1],u),k=Math.round(t*18),a=TAU*v;
    return path.getPoint(t).addScaledVector(frames.normals[k],r*Math.cos(a)).addScaledVector(frames.binormals[k],r*Math.sin(a)).toArray();
  },paint);
}
const crabSpots=[[-.21,-.29],[-.21,.29],[-.25,0],[-.03,-.36],[-.03,.36],[.10,-.22],[.10,.22],[.23,0],[.26,-.34],[.26,.34],[0,0]];
const shellPaint=(x,y,z)=>{
  const d=Math.min(...crabSpots.map(([a,b])=>Math.hypot(x-a,z-b))),ink=y>.21?1-THREE.MathUtils.smoothstep(d,.067,.094):0;
  return color('#bbaa8c').lerp(color('#793b32'),ink*.92);
};
const legPaint=(x,y,z)=>color('#ab8066').lerp(color('#c4b391'),.3+.2*Math.sin(z*8+x*6)**2);
function crab(){
  const body=[egg([-.03,.225,0],[.35,.143,.5],shellPaint,22),egg([.0,.10,0],[.30,.08,.38],()=>color('#9d917a'))],legs=[];
  for(const side of [-1,1]){
    body.push(limb([[.22,.23,side*.20],[.285,.295,side*.215],[.305,.30,side*.215]],[.022,.016,.013],legPaint));
    body.push(egg([.307,.30,side*.215],[.017,.019,.015],()=>color('#292820'),10));
    body.push(limb([[.16,.16,side*.31],[.39,.19,side*.51],[.57,.13,side*.40]],[.08,.10,.08],legPaint));
    body.push(egg([.62,.13,side*.39],[side<0?.145:.125,.09,.095],legPaint));
    body.push(limb([[.67,.12,side*.34],[.80,.085,side*.26],[.84,.095,side*.31]],[.044,.028,.004],legPaint));
    body.push(limb([[.68,.13,side*.435],[.84,.12,side*.415],[.865,.11,side*.34]],[.044,.026,.004],legPaint));
    for(let k=0;k<4;k++){
      const x=.18-k*.14,tip=[.38,.10,-.23,-.48][k];
      legs.push(limb([[x,.13,side*.36],[x-.025,.14,side*.63],[tip,.075,side*.86],[tip-.055,.012,side*.96]],[.037,.035,.023,.009],legPaint));
    }
  }
  return {body:merge(body),legs};
}
function clam(){
  const shells=[],mantles=[],shellColor=(x,y,z)=>color('#928979').lerp(color('#d2c3a3'),.36+.17*Math.sin(y*129+x*13)**2);
  for(const sign of [-1,1]){
    shells.push(surface(48,28,(u,v)=>{
      const a=Math.PI*u,fold=Math.cos(a*12),r=Math.sin(a),t=v;
      const fluting=1+.15*fold,scales=.016*Math.max(0,Math.sin(t*39+a*4))**5*r;
      return [.5*Math.cos(a),.04+r*(.29*t+.036*fold*t*t),sign*(.018+.215*Math.sin(t*Math.PI*.53)*r*fluting+scales)];
    },shellColor));
    // Two frilled living lobes leave the inhalant opening between them.
    mantles.push(surface(48,12,(u,v)=>{
      const a=Math.PI*u,r=Math.sin(a),fold=Math.cos(a*12),edge=.18*r*(1+.15*fold),inner=.018*r;
      return [.472*Math.cos(a),.055+r*(.263+.039*fold+.043*Math.sin(v*Math.PI)),sign*THREE.MathUtils.lerp(inner,edge,v)];
    },(x,y,z)=>{
      const waves=Math.sin(x*91+Math.sin(z*68)*2.2),patch=Math.sin(x*26-z*43)+.5*Math.sin(x*67+z*18);
      return color('#2c5850').lerp(color('#91a597'),THREE.MathUtils.smoothstep(waves,.55,.94)*.48).lerp(color('#77624f'),THREE.MathUtils.smoothstep(patch,.55,1.2)*.42);
    }));
  }
  shells.push(egg([0,.035,0],[.25,.035,.08],()=>color('#746d5c'),10));
  return {shell:merge(shells),mantle:merge(mantles)};
}

export class ShallowBenthicAssets{
  constructor(spongeMaterial=null){this.resources=new Set();this.models=new Map();this.disposed=false;this.material=this.own(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83,side:THREE.DoubleSide}));this.material.userData.biologicalSkin=true;this.spongeMaterial=spongeMaterial??this.own(new THREE.MeshStandardMaterial({color:'#8b7b9a',roughness:.88,side:THREE.DoubleSide}));}
  own(r){this.resources.add(r);return r;}
  part(root,g,name){const m=new THREE.Mesh(this.own(g),this.material);m.name=name;root.add(m);return m;}
  create(id){
    if(this.disposed||!SHALLOW_BENTHIC_IDS.includes(id))return null;if(this.models.has(id))return this.models.get(id);
    const root=new THREE.Group(),moving=[];root.name=`${id} / complete benthic body`;
    if(id==='tube-sponge'){const m=this.part(root,shallowSpongeSourceGeometry(),'attributed live sponge cluster with original photographic surface');m.material=this.spongeMaterial;}
    if(id==='fluted-giant-clam'){const g=clam();this.part(root,g.shell,'fluted overlapping shell valves');moving.push(this.part(root,g.mantle,'paired living mantle lobes and open inhalant slit'));}
    if(id==='spotted-reef-crab'){const g=crab();this.part(root,g.body,'spotted carapace eye stalks and unequal complete chelae');for(const leg of g.legs)moving.push(this.part(root,leg,'jointed tapering walking leg'));}
    root.userData={assetFamily:'shallow-benthic-v1',authored:id!=='tube-sponge',source:id==='tube-sponge'?'Patric Lengacher / CC BY 4.0':null,calibrated:false,speciesId:id};root.updateMatrixWorld(true);
    let motionRadius=0;root.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++)motionRadius=Math.max(motionRadius,Math.hypot(p.getX(i),p.getZ(i)));});
    const result={id,root,moving,motionRadius};this.models.set(id,result);return result;
  }
  update(time,speeds=new Map()){
    for(const [id,m]of this.models){
      if(id==='spotted-reef-crab')m.moving.forEach((p,i)=>p.rotation.y=Math.sin(time*3.2+i*1.3)*.022*Math.min(1,(speeds.get(id)??0)/.012));
      if(id==='fluted-giant-clam')m.moving[0].scale.y=1+.018*Math.sin(time*.65);
      m.root.updateMatrixWorld(true);
    }
  }
  dispose(){if(this.disposed)return;this.disposed=true;for(const r of this.resources)r.dispose();this.resources.clear();this.models.clear();}
}
