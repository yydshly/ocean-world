import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Authored sample representatives, not scans or measured anatomical models.
// Whole-body reference kit: v4 turtle surface, retained oval ribbontail ray,
// and existing reef shark. IDs and catalogue length measures stay unchanged.
// Turtle/shark use total length; the ray retains catalogue disc-width units.
export const SAMPLE_HERO_IDS=Object.freeze(['green-turtle','blue-spotted-ray','blacktip-reef-shark']);
const TAU=Math.PI*2,clamp=THREE.MathUtils.clamp;

export function sampleHeroDeform(x,y,z,role,time,phase,kind){
  if(kind===1){
    const weight=clamp(Math.abs(z)/.62,0,1);
    return {y:y+(role===1?.15:role===2?.045:0)*weight*Math.sin(time*.95+phase-x*2),z};
  }
  if(kind===2){
    const wing=clamp(Math.abs(z)/.5,0,1),tail=clamp((-x-.35)/1.85,0,1);
    return {y:y+.045*wing*wing*Math.sin(time*2.1+phase-x*4),z:z+.028*tail*tail*Math.sin(time*1.2+phase-x*2)};
  }
  const rear=clamp((.18-x)/.68,0,1);
  return {y,z:z+.034*rear*rear*Math.sin(time*2.8+phase-x*5)};
}

function paint(g,colour,role=0){
  const p=g.attributes.position,c=new Float32Array(p.count*3),roles=new Float32Array(p.count);
  for(let i=0;i<p.count;i++){const rgb=colour(p.getX(i),p.getY(i),p.getZ(i));c.set(rgb.toArray(),i*3);roles[i]=role;}
  g.setAttribute('color',new THREE.BufferAttribute(c,3));g.setAttribute('heroRole',new THREE.BufferAttribute(roles,1));
  g.deleteAttribute('uv');return g;
}
function egg(center,scale,colour,segments=24,rows=16){
  const g=new THREE.SphereGeometry(1,segments,rows);g.scale(...scale);g.translate(...center);return paint(g,colour);
}
function solidFin(outline,thickness,colour,role=0){
  const curve=new THREE.CatmullRomCurve3(outline.map(p=>new THREE.Vector3(...p)),true,'centripetal');
  const edge=curve.getPoints(outline.length*5).slice(0,-1),center=new THREE.Vector3();edge.forEach(p=>center.add(p));center.multiplyScalar(1/edge.length);
  const normal=new THREE.Vector3().crossVectors(new THREE.Vector3(...outline[1]).sub(new THREE.Vector3(...outline[0])),new THREE.Vector3(...outline[2]).sub(new THREE.Vector3(...outline[0]))).normalize();
  const vertices=[],indices=[],n=edge.length+1,rings=4;
  for(const side of [1,-1])for(let r=0;r<=rings;r++){
    const u=r/rings,hub=center.clone().addScaledVector(normal,side*thickness);vertices.push(hub.x,hub.y,hub.z);
    for(const e of edge){const p=center.clone().lerp(e,u).addScaledVector(normal,side*thickness*(1-u*u));vertices.push(p.x,p.y,p.z);}
  }
  const half=(rings+1)*n;
  for(const offset of [0,half])for(let r=0;r<rings;r++)for(let i=0;i<edge.length;i++){
    const a=offset+r*n+1+i,b=offset+r*n+1+(i+1)%edge.length,c=a+n,d=b+n;
    if(offset===0)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
  }
  // Coincident perimeter vertices join the two surfaces without an open edge.
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
  return paint(g,colour,role);
}
function tubular(stations,colour,rows=72,sides=32){
  const vertices=[],indices=[];
  for(let i=0;i<=rows;i++){
    const x=THREE.MathUtils.lerp(stations[0][0],stations.at(-1)[0],i/rows);let k=0;
    while(k<stations.length-2&&x>stations[k+1][0])k++;
    const a=stations[k],b=stations[k+1],u=(x-a[0])/(b[0]-a[0]),t=u*u*(3-2*u);
    const ry=THREE.MathUtils.lerp(a[1],b[1],t),rz=THREE.MathUtils.lerp(a[2],b[2],t),cy=THREE.MathUtils.lerp(a[3]??0,b[3]??0,t);
    for(let j=0;j<=sides;j++){
      const angle=j/sides*TAU;vertices.push(x,cy+Math.sin(angle)*ry,Math.cos(angle)*rz);
      if(i<rows&&j<sides){const p=i*(sides+1)+j,q=p+sides+1;indices.push(p,q,p+1,p+1,q,q+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return paint(g,colour);
}
const colour=(hex)=>()=>new THREE.Color(hex);
function turtleParts(){
  // Five vertebral / four paired costal scutes form a broad, low carapace.
  // Their grooves are part of the surface rather than dark rings on an egg.
  const scutes=[];
  for(let i=0;i<5;i++)scutes.push({x:-.31+i*.13,z:0,band:0});
  for(const side of [-1,1])for(let i=0;i<4;i++)scutes.push({x:-.25+i*.145,z:side*(.142-.018*Math.abs(i-1.5)),band:1});
  for(let i=0;i<26;i++){const a=i/26*TAU;scutes.push({x:-.045+Math.cos(a)*.346,z:Math.sin(a)*.241,band:2});}
  const shellAt=(x,z)=>{
    let a=Infinity,b=Infinity,nearest=0;
    for(let i=0;i<scutes.length;i++){const s=scutes[i],d=(x-s.x)**2+(z-s.z)**2*1.45;if(d<a){b=a;a=d;nearest=i;}else if(d<b)b=d;}
    const edge=Math.sqrt(b)-Math.sqrt(a),s=scutes[nearest];
    const seam=1-THREE.MathUtils.smoothstep(edge,0,.008);
    const radial=Math.atan2(z-s.z,x-s.x),dist=Math.hypot(x-s.x,(z-s.z)*1.3);
    const marbling=.5+.5*Math.sin(radial*9+dist*95+Math.sin(x*43-z*38));
    const c=new THREE.Color(['#3e4936','#54543a','#77724b'][s.band]);
    c.lerp(new THREE.Color('#b8a06a'),marbling*.40).multiplyScalar(.83+.17*Math.sin(nearest*2.1)**2);
    c.lerp(new THREE.Color('#d1bb83'),seam*.72);
    return {c,groove:seam*.004};
  };
  const shellPos=[],shellIndices=[],rings=32,sectors=96;
  for(const lower of [false,true])for(let r=0;r<=rings;r++)for(let i=0;i<=sectors;i++){
    const u=r/rings,a=i/sectors*TAU,x=-.045+.366*u*Math.cos(a),z=.278*u*Math.sin(a)*(1+.045*Math.cos(a)),s=shellAt(x,z);
    const y=lower?-.019-.029*(1-u*u):.016+.168*(1-u*u)**.70*(1-.08*Math.cos(a)*u)-s.groove;
    shellPos.push(x,y,z);
    if(r<rings&&i<sectors){const k=(lower? (rings+1)*(sectors+1):0)+r*(sectors+1)+i,n=k+sectors+1;
      if(lower)shellIndices.push(k,n,k+1,k+1,n,n+1);else shellIndices.push(k,k+1,n,k+1,n+1,n);}
  }
  const carapace=new THREE.BufferGeometry();carapace.setAttribute('position',new THREE.Float32BufferAttribute(shellPos,3));carapace.setIndex(shellIndices);carapace.computeVertexNormals();
  paint(carapace,(x,y,z)=>y<0?new THREE.Color('#c3bc96'):shellAt(x,z).c);
  const skin=(x,y,z)=>{
    const row=Math.floor((x+.52)*32),cellX=(x+.52)*32,cellZ=Math.abs(z)*39+(row%2)*.5;
    const fx=cellX-Math.floor(cellX),fz=cellZ-Math.floor(cellZ),edge=Math.min(fx,1-fx,fz,1-fz);
    const upper=THREE.MathUtils.smoothstep(y,-.065,.01);
    const c=new THREE.Color('#a49b77').lerp(new THREE.Color('#536044'),upper);
    return c.lerp(new THREE.Color('#cec39a'),(1-THREE.MathUtils.smoothstep(edge,.015,.09))*.76);
  };
  const parts=[carapace,
    tubular([[.22,.022,.033,-.015],[.30,.028,.034,.002],[.365,.040,.046,.019],[.43,.044,.052,.023],[.485,.033,.040,.020],[.50,.023,.018,.016]],skin,38,24)];
  for(const side of [-1,1]){
    parts.push(egg([.18,-.017,side*.18],[.083,.035,.086],skin,20,12));
    const outline=[[.22,-.005,side*.18],[.26,-.024,side*.26],[.20,-.047,side*.39],[.04,-.062,side*.57],[-.13,-.076,side*.62],[-.18,-.070,side*.585],[-.08,-.054,side*.41],[.095,-.025,side*.25]];
    const fin=solidFin(outline,.016,skin,1);if(side===1)fin.setIndex(Array.from(fin.index.array).map((v,i,a)=>i%3===1?a[i+1]:i%3===2?a[i-1]:v));parts.push(fin);
    const rear=solidFin([[-.25,-.025,side*.19],[-.28,-.04,side*.29],[-.39,-.044,side*.36],[-.47,-.046,side*.32],[-.41,-.033,side*.21]],.010,skin,2);
    if(side===1)rear.setIndex(Array.from(rear.index.array).map((v,i,a)=>i%3===1?a[i+1]:i%3===2?a[i-1]:v));parts.push(rear);
    // Small lateral eyes lie in the head contour, unlike a spherical toy eye.
    parts.push(egg([.431,.047,side*.047],[.010,.009,.005],colour('#382f21'),18,10));
    parts.push(egg([.433,.047,side*.050],[.0055,.006,.0025],colour('#111b19'),16,8));
    parts.push(tubular([[.465,.001,.001,.003],[.490,.0018,.024,.003],[.499,.001,.006,.003]],colour('#4d4936'),8,12));
  }
  parts.push(tubular([[-.5,.001,.001,-.028],[-.43,.008,.010,-.025],[-.33,.018,.025,-.016]],skin,12,12));return parts;
}
function rayParts(){
  const spots=[];for(let i=0;i<31;i++){const a=i*2.39996+.37,r=.425*Math.sqrt((i+.6)/31);spots.push([.035+Math.cos(a)*r*1.08,Math.sin(a)*r,.021+.012*(.5+.5*Math.sin(i*8))]);}
  const skin=(x,y,z)=>{
    if(y<.014)return new THREE.Color('#d9d7c4');
    const c=new THREE.Color('#989266').multiplyScalar(.94+.055*Math.sin(x*31+z*19));
    for(const [sx,sz,r]of spots){const d=Math.hypot(x-sx,z-sz)/r;if(d<1.10){c.lerp(new THREE.Color('#328fc0'),1-THREE.MathUtils.smoothstep(d,.72,1.10));break;}}return c;
  };
  // Two continuous radial surfaces form a thin oval pectoral disc. Central
  // muscular relief fades toward the rounded margin, which can undulate.
  const vertices=[],indices=[],rings=32,sectors=112;
  for(const lower of [false,true])for(let i=0;i<=rings;i++)for(let j=0;j<=sectors;j++){
    const r=i/rings,a=j/sectors*TAU,ca=Math.cos(a),sa=Math.sin(a),x=.035+.555*r*ca,z=.5*r*sa;
    const lift=.052*(1-r*r)**.75+.037*Math.exp(-(((x-.05)/.33)**2)-(z/.17)**2);
    const y=lower?.011-.019*(1-r*r):.015+lift;
    vertices.push(x,y,z);
    if(i<rings&&j<sectors){const k=(lower?(rings+1)*(sectors+1):0)+i*(sectors+1)+j,n=k+sectors+1;
      if(lower)indices.push(k,n,k+1,k+1,n,n+1);else indices.push(k,k+1,n,k+1,n+1,n);}
  }
  const disc=new THREE.BufferGeometry();disc.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));disc.setIndex(indices);disc.computeVertexNormals();paint(disc,skin);
  const parts=[disc,
    tubular([[-2.2,.001,.001,.034],[-1.86,.012,.014,.034],[-1.18,.021,.025,.036],[-.62,.033,.038,.039],[-.38,.038,.044,.039]],(x,y,z)=>new THREE.Color(Math.abs(z)>.011?'#438ca8':'#85885f'),60,16)];
  parts.push(solidFin([[-.42,.029,0],[-.8,.006,0],[-1.65,-.010,0],[-2.2,.034,0],[-1.65,.029,0],[-.8,.033,0]],.002,colour('#8d8c66')));
  for(const side of [-1,1]){
    parts.push(egg([.275,.092,side*.08],[.069,.035,.041],skin,28,16));
    parts.push(egg([.294,.119,side*.109],[.019,.012,.010],colour('#172b2b'),18,10));
    parts.push(egg([.194,.101,side*.092],[.042,.004,.023],colour('#4c5740'),24,10));
    const pelvic=solidFin([[-.35,.011,side*.085],[-.50,.008,side*.195],[-.66,.010,side*.157],[-.57,.023,side*.062]],.006,skin);
    if(side===1)pelvic.setIndex(Array.from(pelvic.index.array).map((v,i,a)=>i%3===1?a[i+1]:i%3===2?a[i-1]:v));parts.push(pelvic);
  }
  parts.push(solidFin([[-.78,.059,0],[-1.1,.079,0],[-1.15,.071,0],[-.80,.049,0]],.002,colour('#696d53')));
  return parts;
}
function sharkParts(){
  const skin=(x,y,z)=>new THREE.Color('#738e8c').lerp(new THREE.Color('#d2d4c1'),THREE.MathUtils.smoothstep(-y,-.01,.045));
  const parts=[tubular([[-.40,.010,.012],[-.30,.029,.023],[-.17,.059,.048],[.04,.089,.068],[.19,.08,.068],[.31,.055,.055],[.405,.031,.049],[.46,.015,.036],[.49,.002,.015]],skin)];
  const dorsal=(x,y,z)=>new THREE.Color(y>.19?'#263b3b':'#7a9390');
  parts.push(solidFin([[.09,.065,0],[.02,.245,0],[-.10,.088,0],[-.13,.071,0]],.004,dorsal));
  parts.push(solidFin([[-.24,.027,0],[-.26,.079,0],[-.32,.027,0]],.002,skin));
  // Fins are swept surfaces with thickness; their broad span belongs in support.
  for(const side of [-1,1]){
    const fin=solidFin([[.13,-.025,side*.048],[-.06,-.042,side*.26],[-.15,-.04,side*.23],[-.06,-.018,side*.052]],.003,
      (x,y,z)=>new THREE.Color(Math.abs(z)>.22?'#253b3b':'#788f8d'));if(side===1)fin.setIndex(Array.from(fin.index.array).map((v,i,a)=>i%3===1?a[i+1]:i%3===2?a[i-1]:v));parts.push(fin);
    parts.push(egg([.351,.017,side*.048],[.009,.009,.004],colour('#182c2d'),16,10));
    for(let i=0;i<5;i++)parts.push(egg([.14-i*.015,.0,side*.064],[.002,.032,.0018],colour('#536c69'),8,8));
  }
  // A vertical asymmetric caudal fork. Its X bounds keep total length 1 m.
  const tail=solidFin([[-.39,0,0],[-.49,.14,0],[-.50,.13,0],[-.45,.0,0],[-.485,-.077,0],[-.42,-.041,0]],.003,(x,y)=>new THREE.Color(y>.12?'#253b3b':'#788f8d'));
  parts.push(tail);return parts;
}

export class ShallowHeroAnimals{
  constructor(){this.resources=new Set();this.models=new Map();this.clock={value:0};}
  own(r){this.resources.add(r);return r;}
  create(id){
    if(!SAMPLE_HERO_IDS.includes(id))return null;
    const kind=SAMPLE_HERO_IDS.indexOf(id)+1,parts=kind===1?turtleParts():kind===2?rayParts():sharkParts();
    const g=this.own(mergeGeometries(parts));parts.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();
    const material=this.own(new THREE.MeshStandardMaterial({vertexColors:true,roughness:kind===1?.72:.48,metalness:0,side:THREE.DoubleSide}));
    material.onBeforeCompile=shader=>{
      shader.uniforms.heroTime=this.clock;
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec2 sampleHero;attribute float heroRole;uniform float heroTime;`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
float phase=sampleHero.x,kind=sampleHero.y;
if(kind<1.5){float w=clamp(abs(position.z)/.62,0.0,1.0);transformed.y+=(heroRole<.5?0.0:heroRole<1.5?.15:.045)*w*sin(heroTime*.95+phase-position.x*2.0);}
else if(kind<2.5){float w=clamp(abs(position.z)/.5,0.0,1.0),tail=clamp((-position.x-.35)/1.85,0.0,1.0);transformed.y+=.045*w*w*sin(heroTime*2.1+phase-position.x*4.0);transformed.z+=.028*tail*tail*sin(heroTime*1.2+phase-position.x*2.0);}
else{float rear=clamp((.18-position.x)/.68,0.0,1.0);transformed.z+=.034*rear*rear*sin(heroTime*2.8+phase-position.x*5.0);}`);
    };
    material.customProgramCacheKey=()=> 'shallow-hero-motion-v2';
    const root=new THREE.Group(),mesh=new THREE.Mesh(g,material);mesh.name=`${id} continuous body`;root.add(mesh);root.updateMatrixWorld(true);
    g.userData={assetFamily:kind===1?'shallow-body-kit-v4':'shallow-body-kit-v2',authored:true,calibrated:false,
      sizeMeasure:kind===2?'disc-width':'total-length',referenceKit:'public/assets/shallow-body-kit/provenance.json'};
    const model={root,kind};this.models.set(id,model);return model;
  }
  update(time){this.clock.value=time;}
  dispose(){for(const r of this.resources)r.dispose();this.resources.clear();this.models.clear();}
}
