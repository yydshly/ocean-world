import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU=Math.PI*2,lerp=THREE.MathUtils.lerp;
// Sample-only art assets: metre-scaled, authored from the catalogue's named
// representatives. These are procedural models, not scans or calibrated anatomy.
export const NATURAL_SAMPLE_FISH={
  'blue-and-gold-fusilier':{height:.128,width:.060,body:'#688eaa',belly:'#cbd5d2',fin:'#d6bd52',type:'teres'},
  'doubleline-fusilier':{height:.118,width:.055,body:'#668e99',belly:'#c9d5cf',fin:'#80999b',type:'doubleline'},
  'bluestripe-snapper':{height:.195,width:.069,body:'#d8bb45',belly:'#d6d1ad',fin:'#ceb447',type:'snapper'},
  'white-spotted-rabbitfish':{height:.23,width:.062,body:'#767e50',belly:'#c1c2a0',fin:'#9c9b60',type:'rabbitfish'},
  'bigeye-trevally':{height:.178,width:.096,body:'#799ca5',belly:'#d0d9d2',fin:'#7d9695',type:'trevally'},
  'reef-parrotfish':{height:.215,width:.112,body:'#468b7c',belly:'#88b099',fin:'#4c9881',type:'parrotfish'},
  'lyretail-anthias':{height:.16,width:.049,body:'#c88633',belly:'#e0b66a',fin:'#bc7332',type:'anthias'},
  'copperband-butterflyfish':{height:.30,width:.055,body:'#d9d6ba',belly:'#dedecb',fin:'#c5a55f',type:'copperband',disc:true},
  'emperor-angelfish':{height:.30,width:.075,body:'#47788f',belly:'#9ebfbd',fin:'#c7b954',type:'emperor',disc:true},
  'moorish-idol':{height:.32,width:.055,body:'#ddd6b3',belly:'#dedbc4',fin:'#d7cfb0',type:'idol',disc:true},
  'sailfin-tang':{height:.29,width:.057,body:'#868562',belly:'#a8a585',fin:'#7d7d56',type:'sailfin',disc:true},
  'bluespine-unicornfish':{height:.22,width:.074,body:'#78866f',belly:'#babbaa',fin:'#8e966e',type:'unicorn'},
  'reef-goatfish':{height:.14,width:.063,body:'#b8b191',belly:'#d1cdb8',fin:'#b6b191',type:'goatfish'},
};

// One replacement school-body family; species share the construction quality,
// while keeping separate head, belly, shoulder and caudal-peduncle contours.
// These outlines are authored against the named whole-form museum references,
// not digitised measurements. X is the catalogue's total-length metre unit.
export const SHALLOW_SCHOOL_BODY_IDS=Object.freeze(['blue-and-gold-fusilier','doubleline-fusilier','bluestripe-snapper','bigeye-trevally']);
const schoolSections={
  teres:[[-.33,.105,.10,.19],[-.24,.29,.30,.37],[-.09,.69,.60,.74],[.085,.86,.77,.98],[.235,.72,.62,.88],[.34,.43,.35,.63],[.415,.235,.20,.32],[.475,.115,.085,.17],[.50,.035,.033,.046]],
  doubleline:[[-.33,.095,.09,.17],[-.235,.27,.29,.35],[-.075,.63,.58,.72],[.10,.82,.74,.96],[.25,.68,.59,.86],[.355,.40,.33,.59],[.43,.22,.18,.28],[.478,.10,.074,.14],[.50,.030,.028,.040]],
  snapper:[[-.33,.09,.10,.18],[-.235,.35,.31,.43],[-.085,.82,.70,.81],[.08,.91,.80,1],[.235,.83,.73,.91],[.35,.61,.57,.69],[.43,.38,.36,.41],[.476,.23,.22,.26],[.50,.090,.083,.12]],
  trevally:[[-.33,.070,.067,.15],[-.235,.28,.24,.35],[-.08,.74,.64,.77],[.09,.91,.78,1],[.23,.87,.69,.94],[.34,.65,.51,.71],[.425,.36,.29,.43],[.477,.19,.16,.23],[.50,.070,.064,.10]],
};
// Redistribute the same 28 cross-section intervals onto complete colour bands.
// Uniform circular rows missed narrow stripes and interpolated the whole side
// toward its pale belly. This retains the old body triangle budget.
const schoolFlankLevels=Object.freeze([-1,-.96,-.86,-.66,-.43,-.25,-.10,.05,.24,.42,.60,.75,.88,.96,1]);
function schoolSkin(p,x,v){
  const head=THREE.MathUtils.smoothstep(x,.31,.48),underside=THREE.MathUtils.smoothstep(-v,.54,.98);
  let c;
  if(p.type==='teres'){
    c=new THREE.Color('#50859c').lerp(new THREE.Color('#91aaa7'),underside*.84);
    const boundary=.20-.90*(x+.12),yellow=THREE.MathUtils.smoothstep(v,boundary-.05,boundary+.05)*(1-head);
    c.lerp(new THREE.Color('#c8b443'),yellow);
  }else if(p.type==='doubleline'){
    c=new THREE.Color('#4f828c').lerp(new THREE.Color('#b0bdb1'),underside*.78);
    if(Math.abs(v-.60)<.055||Math.abs(v+.10)<.055)c.lerp(new THREE.Color('#cab747'),1-head*.25);
  }else if(p.type==='snapper'){
    c=new THREE.Color('#cfad3c').lerp(new THREE.Color('#bcbda6'),underside*.86);
    if([.60,.24,-.10,-.43].some(b=>Math.abs(v-b)<.045))c.lerp(new THREE.Color('#337c9e'),1-head*.22);
    // The underside has faint grey lines, not a fifth bright-blue flank stripe.
    if(v<-.64&&Math.sin((v+1)*38)>.45)c.multiplyScalar(.92);
  }else{
    c=new THREE.Color('#8dacae').lerp(new THREE.Color('#304e5a'),THREE.MathUtils.smoothstep(v,-.04,.97)*.88);
    c.lerp(new THREE.Color('#c9d0c1'),underside*.84);
    const spotX=(x-.254)/.014,spotY=(v-.43)/.065;
    if(spotX*spotX+spotY*spotY<1)c.set('#273d42');
    const lateral=.10+.29*Math.exp(-((x-.12)**2)/.042);
    if(x<.24&&Math.abs(v-lateral)<.027)c.multiplyScalar(.78);
    if(x<-.04&&Math.abs(v-.10)<.05&&Math.sin((x+.33)*165)>.5)c.multiplyScalar(.81);
  }
  const gill=.232+.064*(1-v*v);
  if(Math.abs(x-gill)<.008&&v>-.54&&v<.65)c.multiplyScalar(.71);
  // Restrained continuous surface tone; large species colour fields carry the
  // silhouette at viewing distance rather than dense noise or pale highlights.
  const flank=.91+.065*Math.cos((x+.13)*5-v*2)+.035*Math.cos(x*93+v*27)*Math.cos(v*42);
  return c.multiplyScalar(flank);
}
function smoothSection(stations,x,k){
  let i=0;while(i<stations.length-2&&x>stations[i+1][0])i++;
  const a=stations[i],b=stations[i+1],dx=b[0]-a[0],t=THREE.MathUtils.clamp((x-a[0])/dx,0,1);
  const tangent=j=>j===0?(stations[1][k]-stations[0][k])/(stations[1][0]-stations[0][0]):j===stations.length-1?
    (stations[j][k]-stations[j-1][k])/(stations[j][0]-stations[j-1][0]):(stations[j+1][k]-stations[j-1][k])/(stations[j+1][0]-stations[j-1][0]);
  return Math.max(.015,(2*t*t*t-3*t*t+1)*a[k]+(t*t*t-2*t*t+t)*dx*tangent(i)+(-2*t*t*t+3*t*t)*b[k]+(t*t*t-t*t)*dx*tangent(i+1));
}
function schoolBody(p){
  const stations=schoolSections[p.type],pos=[],uv=[],idx=[],rows=52,sides=28;
  for(let i=0;i<=rows;i++){
    const x=lerp(stations[0][0],stations.at(-1)[0],i/rows),upper=smoothSection(stations,x,1)*p.height,
      lower=smoothSection(stations,x,2)*p.height,width=smoothSection(stations,x,3)*p.width;
    for(let j=0;j<=sides;j++){
      const s=schoolFlankLevels[j<=14?j:28-j],side=j<=14?1:-1,y=(s<0?lower:upper)*s-.009;
      const z=width*side*Math.max(0,1-s*s)**.46;
      pos.push(x,y,z);uv.push(x+.5,(s+1)/2);
      if(i<rows&&j<sides){const k=i*(sides+1)+j,n=k+sides+1;idx.push(k,n,k+1,k+1,n,n+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  const normal=g.attributes.normal,v=new THREE.Vector3(),w=new THREE.Vector3();
  for(let i=0;i<=rows;i++){const a=i*(sides+1),b=a+sides;v.fromBufferAttribute(normal,a).add(w.fromBufferAttribute(normal,b)).normalize();normal.setXYZ(a,v.x,v.y,v.z);normal.setXYZ(b,v.x,v.y,v.z);}
  coloured(g,(x,y,z,i)=>schoolSkin(p,x,g.attributes.uv.getY(i)*2-1));
  g.userData={assetFamily:'shallow-school-body-kit-v4',authored:true,calibrated:false};return g;
}

function schoolFinColour(g,p,name){
  const pos=g.attributes.position,center=new THREE.Vector3();for(let i=0;i<pos.count;i++)center.add(new THREE.Vector3().fromBufferAttribute(pos,i));center.multiplyScalar(1/pos.count);
  return coloured(g,(x,y,z)=>{
    let c=new THREE.Color(p.type==='snapper'?'#c7a83b':p.type==='trevally'?'#526c70':p.type==='teres'&&name.includes('caudal')?'#cdb83f':'#7d9690');
    const radius=Math.hypot(x-center.x,y-center.y,z-center.z);
    c.multiplyScalar(.90+.085*Math.cos(radius*37));
    if(p.type==='doubleline'&&name.includes('caudal')&&Math.abs(y)>.108)c.lerp(new THREE.Color('#283c40'),THREE.MathUtils.smoothstep(Math.abs(y),.108,.15));
    if(p.type==='trevally'&&((name==='second dorsal fin'&&y>p.height*1.39)||(name==='anal fin'&&y<-p.height*1.13)))c.lerp(new THREE.Color('#b9c4b7'),.82);
    return c;
  });
}

// Shared by the actual WebGL deformation and the honest offline mesh preview.
// Values are display motion choices, not calibrated biomechanical frequencies.
export function sampleBodyWave(x,time,phase,rate,amplitude){
  const u=THREE.MathUtils.clamp((.26-x)/.6,0,1),angle=time*rate-x*6+phase;
  return {offset:Math.sin(angle)*u*u*amplitude,
    slope:amplitude*((u>0&&u<1?-2*u/.6:0)*Math.sin(angle)-6*u*u*Math.cos(angle))};
}
function swimMaterial(material,clock){
  material.onBeforeCompile=shader=>{
    shader.uniforms.sampleSwimTime=clock;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec3 sampleSwim;attribute float sampleSwimX;uniform float sampleSwimTime;
float sampleWave(){float u=clamp((.26-sampleSwimX)/.6,0.0,1.0);return sin(sampleSwimTime*sampleSwim.y-sampleSwimX*6.0+sampleSwim.x)*u*u*sampleSwim.z;}
float sampleWaveSlope(){float u=clamp((.26-sampleSwimX)/.6,0.0,1.0),a=sampleSwimTime*sampleSwim.y-sampleSwimX*6.0+sampleSwim.x;
return sampleSwim.z*((u>0.0&&u<1.0?-2.0*u/.6:0.0)*sin(a)-6.0*u*u*cos(a));}`)
      .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z+=sampleWave();')
      .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal.x-=objectNormal.z*sampleWaveSlope();objectNormal=normalize(objectNormal);');
  };
  material.customProgramCacheKey=()=> 'shallow-individual-spine-wave-v1';return material;
}

function coloured(g,at){
  const p=g.attributes.position,c=new Float32Array(p.count*3),color=new THREE.Color();
  for(let i=0;i<p.count;i++){const value=at(p.getX(i),p.getY(i),p.getZ(i),i);color.copy(value);c.set(color.toArray(),i*3);}
  g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;
}
function merge(parts){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();return g;}
function ellipsoid(center,size,color){const g=new THREE.SphereGeometry(1,12,8);g.scale(...size);g.translate(...center);return coloured(g,()=>new THREE.Color(color));}
function skinAt(p,x,y,z){
  const base=new THREE.Color(p.body),belly=new THREE.Color(p.belly),v=y/p.height;
  base.lerp(belly,THREE.MathUtils.smoothstep(-v,-.15,.88)*.9);
  if(p.type==='teres'&&x<.22&&v>.32)base.lerp(new THREE.Color('#d5be4f'),THREE.MathUtils.smoothstep(v,.32,.55));
  if(p.type==='doubleline'&&[.44,-.02].some(k=>Math.abs(v-k)<.11))base.set('#d3ba55');
  if(p.type==='snapper'&&x<.32&&[.64,.28,-.06,-.40].some(k=>Math.abs(v-k)<.075))base.set('#4b97b1');
  if(p.type==='rabbitfish'){
    const row=Math.floor(v*10),cell=x*34+(row%2)*.45;
    if(Math.hypot(cell-Math.floor(cell)-.5,v*10-row-.5)<.19)base.lerp(new THREE.Color('#dedcca'),.8);
  }
  if(p.type==='trevally'&&x>.20&&x<.26&&v>.18)base.lerp(new THREE.Color('#394c50'),.8);
  if(p.type==='parrotfish'){
    if(x>.27)base.lerp(new THREE.Color('#876583'),.46);
    if(x<-.18)base.lerp(new THREE.Color('#a7b895'),.55);
    if(x<-.05&&x>-.2&&v>.12)base.lerp(new THREE.Color('#c79a60'),.38);
    const row=Math.floor((v+1)*9),u=x*27+(row%2)*.5;
    base.multiplyScalar(.88+.12*THREE.MathUtils.smoothstep(u-Math.floor(u),.05,.35));
  }
  if(p.type==='copperband'){
    if([-.20,-.025,.14,.28].some(k=>Math.abs(x-k)<.045))base.set('#b77d3f');
    if(Math.hypot((x+.19)/.045,(v-.70)/.16)<1)base.set('#263231');
  }
  if(p.type==='emperor'){
    if(x<.25&&Math.sin((v-x*.7)*30)>.08)base.set('#d0c15c');
    if(x>.22&&x<.34)base.set('#253d42');
  }
  if(p.type==='idol'){
    if((x>.10&&x<.21)||(x<-.12&&x>-.25))base.set('#273533');
    if(x>.35)base.set('#ceb650');
  }
  if(p.type==='sailfin'&&Math.sin(x*52+v*1.2)>.45)base.set('#c6b85b');
  if(p.type==='unicorn'&&x<-.25)base.lerp(new THREE.Color('#457b96'),.6);
  if(p.type==='goatfish'&&((x>.10&&Math.abs(v-.2)<.11)||Math.hypot((x+.26)/.043,(v-.22)/.32)<1))base.set('#424c42');
  return base.multiplyScalar(.88+.11*THREE.MathUtils.smoothstep(v,-.7,.8));
}
function fishBody(p){
  if(schoolSections[p.type])return schoolBody(p);
  const stations=p.disc?
    [[-.34,.12,.18],[-.25,.58,.57],[-.10,.98,.94],[.07,1,1],[.22,.85,.83],[.30,.59,.52],[.37,.17,.17],[.45,.055,.075],[.485,.035,.05]]:p.type==='parrotfish'?
    [[-.34,.13,.18],[-.25,.52,.55],[-.08,.95,.94],[.12,1,1],[.27,.83,.83],[.38,.65,.6],[.455,.42,.33],[.485,.10,.08]]:
    [[-.34,.10,.14],[-.24,.42,.45],[-.08,.84,.83],[.10,1,1],[.24,.82,.85],[.35,.53,.59],[.44,.22,.25],[.485,.025,.025]];
  // Interpolate by X through monotone section locations, preserving a blunt
  // forehead or a streamlined shoulder rather than attaching separate blobs.
  const section=(x,k)=>{let i=0;while(i<stations.length-2&&x>stations[i+1][0])i++;
    const a=stations[i],b=stations[i+1],t=(x-a[0])/(b[0]-a[0]);return lerp(a[k],b[k],t*t*(3-2*t));};
  const pos=[],uv=[],idx=[],rows=40,sides=20;
  for(let i=0;i<=rows;i++){
    const x=lerp(-.34,.485,i/rows),h=section(x,1)*p.height,w=section(x,2)*p.width;
    for(let j=0;j<=sides;j++){
      const angle=j/sides*TAU;pos.push(x,Math.sin(angle)*h*(Math.sin(angle)<0?.9:1)-.008,Math.cos(angle)*w);
      uv.push(i/rows,j/sides);
      if(i<rows&&j<sides){const a=i*(sides+1)+j,b=a+sides+1;idx.push(a,b,a+1,a+1,b,b+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  // Share the normals of the duplicated circumference seam.
  const normal=g.attributes.normal,v=new THREE.Vector3(),u=new THREE.Vector3();
  for(let i=0;i<=rows;i++){const a=i*(sides+1),b=a+sides;v.fromBufferAttribute(normal,a).add(u.fromBufferAttribute(normal,b)).normalize();normal.setXYZ(a,v.x,v.y,v.z);normal.setXYZ(b,v.x,v.y,v.z);}
  return coloured(g,(x,y,z)=>skinAt(p,x,y,z));
}
function membrane(points,color){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),true,'centripetal'),edge=curve.getPoints(points.length*3).slice(0,-1),center=new THREE.Vector3();edge.forEach(p=>center.add(p));center.multiplyScalar(1/edge.length);
  // Fin rays fan continuously into a bowed surface with root camber. The old
  // single flat triangle fan left a dark central pinwheel.
  const normal=new THREE.Vector3().crossVectors(new THREE.Vector3(...points[1]).sub(new THREE.Vector3(...points[0])),new THREE.Vector3(...points[2]).sub(new THREE.Vector3(...points[0]))).normalize();
  const pos=[],uv=[],idx=[],rings=4,n=edge.length;
  for(let r=0;r<=rings;r++)for(let i=0;i<=n;i++){
    const u=r/rings,e=edge[i%n],p=center.clone().lerp(e,u).addScaledVector(normal,.006*(1-u*u));
    pos.push(...p.toArray());uv.push((p.x+.5),p.y+.5);
    if(r<rings&&i<n){const k=r*(n+1)+i,b=k+n+1;idx.push(k,k+1,b,k+1,b+1,b);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  return coloured(g,(x,y,z,i)=>{
    const ring=Math.floor(i/(n+1))/rings,sector=i%(n+1),ray=.035*Math.cos(sector*TAU*.5);
    return new THREE.Color(color).multiplyScalar(.84+.14*ring+ray);
  });
}

export class ShallowNaturalFishAssets{
  constructor(){this.models=new Map();this.resources=new Set();this.clock={value:0};
    this.bodyMaterial=this.own(swimMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.48,metalness:.04}),this.clock));
    this.finMaterial=this.own(swimMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.57,side:THREE.DoubleSide,metalness:0}),this.clock));
  }
  own(r){this.resources.add(r);return r;}
  create(id){
    const p=NATURAL_SAMPLE_FISH[id];if(!p)return null;
    const root=new THREE.Group();root.name=`Natural sample / ${id}`;
    const school=!!schoolSections[p.type],bodyParts=[fishBody(p)],eyeX=p.disc?.27:p.type==='parrotfish'?.335:school?.365:.34,eyeY=p.height*.30,
      eyeZ=school?Math.max(.007,smoothSection(schoolSections[p.type],eyeX,3)*p.width-.004):p.width*(p.disc?.72:.74),eyeRadius=school?(p.type==='trevally'?.021:.016):.024;
    for(const side of [-1,1]){
      bodyParts.push(ellipsoid([eyeX,eyeY,eyeZ*side],[eyeRadius,eyeRadius,school?.007:.011],'#a3a68a'));
      bodyParts.push(ellipsoid([eyeX+.002,eyeY,(eyeZ+(school?.004:.009))*side],[eyeRadius*.54,eyeRadius*.58,school?.003:.006],'#17272a'));
      if(school)bodyParts.push(ellipsoid([.465,-.012,p.width*.19*side],[.023,.0018,.003],'#666a54'));
    }
    if(p.type==='unicorn')bodyParts.push(coloured(branch([.27,p.height*.72,0],[.34,p.height*.88,0],[.42,p.height*1.08,0],.021,.004,4),()=>new THREE.Color('#7f896d')));
    if(p.type==='goatfish')for(const side of [-1,1])bodyParts.push(coloured(branch([.43,-.045,side*.014],[.37,-.14,side*.025],[.25,-.17,side*.035],.004,.0015,4),()=>new THREE.Color('#bebea3')));
    const body=new THREE.Mesh(this.own(merge(bodyParts)),this.bodyMaterial);body.name='continuous body and inset eyes';root.add(body);
    if(school)body.geometry.userData={assetFamily:'shallow-school-body-kit-v4',representativeId:id,authored:true,calibrated:false,measuredSize:'neutral total length X=1'};
    const fins=[];
    const add=(name,points,parent=root)=>{const g=membrane(points,p.fin);if(school)schoolFinColour(g,p,name);const m=new THREE.Mesh(this.own(g),this.finMaterial);m.name=name;parent.add(m);return m;};
    const h=p.height;
    if(p.type==='trevally'){
      add('first dorsal fin',[[.25,h*.66,0],[.16,h*1.28,0],[.04,h*.94,0],[.04,h*.78,0]]);
      add('second dorsal fin',[[.01,h*.85,0],[-.045,h*1.49,0],[-.13,h*.97,0],[-.30,h*.31,0],[-.11,h*.71,0]]);
    }else if(p.type==='idol')add('sickle banner dorsal fin',[[.20,h*.79,0],[.12,h*1.6,0],[-.19,h*2.05,0],[-.12,h*1.62,0],[-.3,h*.45,0],[-.1,h*.86,0]]);
    else if(p.type==='sailfin')add('broad sail dorsal fin',[[.25,h*.63,0],[.16,h*1.60,0],[-.09,h*1.88,0],[-.29,h*1.05,0],[-.31,h*.40,0],[-.1,h*.85,0]]);
    else add('continuous dorsal fin',school?[[.235,h*.65,0],[.12,h*1.18,0],[-.12,h*.95,0],[-.29,h*.26,0],[-.11,h*.67,0]]:[[.25,h*.66,0],[.12,h*1.30,0],[-.11,h*1.38,0],[-.30,h*.39,0],[-.1,h*.82,0]]);
    add('anal fin',school?[[.01,-h*.62,0],[-.08,-h*(p.type==='trevally'?1.17:.95),0],[-.225,-h*.52,0],[-.30,-h*.25,0],[-.11,-h*.62,0]]:[[.06,-h*.70,0],[-.07,-h*(p.type==='sailfin'?1.85:1.28),0],[-.25,-h*(p.disc?.95:.6),0],[-.30,-h*.32,0],[-.11,-h*.72,0]]);
    for(const side of [-1,1]){
      const pivot=new THREE.Group();pivot.position.set(.14,-h*.05,side*p.width*.85);root.add(pivot);
      add(`pectoral membrane ${side}`,p.type==='trevally'?[[0,0,0],[-.19,-.021,side*.112],[-.32,-.044,side*.096],[-.16,.011,side*.043],[-.025,.022,side*.014]]:school?[[0,0,0],[-.12,-.038,side*.077],[-.19,-.052,side*.043],[-.07,.010,side*.021]]:[[0,0,0],[-.10,-.05,side*.082],[-.17,-.025,side*.075],[-.08,.022,side*.025]],pivot);fins.push(pivot);
    }
    const tail=new THREE.Group();tail.position.x=-.33;root.add(tail);
    const spread=p.disc?.16:p.type==='parrotfish'?.18:p.type==='trevally'?.22:school?.16:.19;
    const caudal=add('flexible forked caudal fin',p.disc?[[0,0,0],[-.17,spread,0],[-.16,0,0],[-.17,-spread,0]]:school?[[0,0,0],[-.087,spread*.74,0],[-.17,spread,0],[-.088,0,0],[-.17,-spread,0],[-.087,-spread*.74,0]]:[[0,0,0],[-.095,spread*.8,0],[-.17,spread,0],[-.145,.025,0],[-.17,-spread,0],[-.095,-spread*.8,0]],tail);
    if(school){
      // The authored curve must not extend the measured distal tail tip beyond
      // X=-.5 after the root's -.33 translation.
      const position=caudal.geometry.attributes.position;for(let i=0;i<position.count;i++)position.setX(i,Math.max(-.17,position.getX(i)));caudal.geometry.computeVertexNormals();
    }
    if(p.type==='emperor')coloured(caudal.geometry,()=>new THREE.Color('#d4c455'));
    if(p.type==='doubleline'&&!school)coloured(caudal.geometry,(x,y)=>new THREE.Color(p.fin).lerp(new THREE.Color('#364b51'),THREE.MathUtils.smoothstep(Math.abs(y)/spread,.63,.94)));
    // Static dorsal/anal membranes share material and root coordinates. Merge
    // their unchanged vertices once; moving pectorals and tail keep pivots.
    const staticFins=root.children.filter(child=>child.isMesh&&child.material===this.finMaterial);
    if(staticFins.length>1){
      for(const mesh of staticFins){this.resources.delete(mesh.geometry);root.remove(mesh);}
      const combined=new THREE.Mesh(this.own(merge(staticFins.map(mesh=>mesh.geometry))),this.finMaterial);
      combined.name='shared static dorsal and anal membranes';root.add(combined);
    }
    root.updateMatrixWorld(true);const model={id,root,tail,fins};this.models.set(id,model);return model;
  }
  update(time,speeds){this.clock.value=time;for(const [id,m]of this.models){const speed=Math.min(1,speeds.get(id)??0);
    m.tail.rotation.y=Math.sin(time*(3.2+speed*4))*(.07+speed*.15);
    m.fins.forEach((fin,i)=>fin.rotation.x=Math.sin(time*2.1+i*Math.PI)*.1);m.root.updateMatrixWorld(true);
  }}
  dispose(){for(const r of this.resources)r.dispose();this.resources.clear();this.models.clear();}
}

function branch(a,b,end,r0,r1,segments=4){
  const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a),new THREE.Vector3(...b),new THREE.Vector3(...end));
  const g=new THREE.TubeGeometry(curve,segments,1,7,false),position=g.attributes.position;
  for(let i=0;i<position.count;i++){const t=Math.floor(i/8)/segments,center=curve.getPoint(t),r=lerp(r0,r1,t);
    position.setXYZ(i,center.x+(position.getX(i)-center.x)*r,center.y+(position.getY(i)-center.y)*r,center.z+(position.getZ(i)-center.z)*r);}
  g.computeVertexNormals();return g;
}
function colony(form,variant,detail='near'){
  const parts=[],phase=variant*1.17,far=detail==='distant';
  if(form==='branching'){
    parts.push(ellipsoid([0,.07,0],[.19,.075,.19],'#b09b77'));
    for(let i=0;i<(far?9:24);i++){
      const a=i*2.39996+phase,x=Math.cos(a),z=Math.sin(a),r=Math.sqrt((i+.5)/(far?9:24)),h=.37+.24*(1-r*r)+.055*Math.sin(i*1.9+phase),base=[x*r*.30,.045,z*r*.30],tip=[x*r*.33,h,z*r*.33];
      parts.push(branch(base,[x*.12,h*.65,z*.12],tip,.045,.022));
      for(const side of (far?[-1,1]:[-1,0,1])){const b=a+side*.24,end=[Math.cos(b)*(.27*r+.09),h+.15+side*.025,Math.sin(b)*(.27*r+.09)];
        parts.push(branch(tip,[lerp(tip[0],end[0],.65),h+.16,lerp(tip[2],end[2],.65)],end,.025,.011,3));
      }
      if(!far&&i%2===0)parts.push(branch([x*.16,h*.66,z*.16],[x*.26,h*.86,z*.26],[x*.38,h+.035,z*.38],.025,.010,3));
    }
  }else if(form==='table'){
    parts.push(branch([0,0,0],[.02,.25,.02],[.04,.65,0],.075,.04));
    // A single broad, bowed living canopy, rather than a stack of discs.
    const sectors=far?20:52,rings=far?3:7,pos=[],idx=[],uv=[];
    for(let j=0;j<=rings;j++)for(let i=0;i<=sectors;i++){
      const a=i/sectors*TAU,r=j/rings*(.43+.03*Math.sin(a*5+phase));
      pos.push(Math.cos(a)*r,.68+.12*(1-(j/rings)**2)+.026*Math.sin(a*3+phase)*(j/rings),Math.sin(a)*r);
      uv.push(i/sectors,j/rings);
      if(j<rings&&i<sectors){const k=j*(sectors+1)+i;idx.push(k,k+sectors+1,k+1,k+1,k+sectors+1,k+sectors+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();parts.push(g);
    for(let i=0;i<(far?5:12);i++){const a=i*TAU/(far?5:12),r=.35;parts.push(branch([.04,.28,0],[Math.cos(a)*.19,.5,Math.sin(a)*.19],[Math.cos(a)*r,.71,Math.sin(a)*r],.035,.01,4));}
    for(let i=0;i<(far?0:32);i++){const a=i*2.39996+phase,r=.40*Math.sqrt((i+.5)/32),x=Math.cos(a)*r,z=Math.sin(a)*r;
      parts.push(branch([x,.71,z],[x*1.02,.78,z*1.02],[x+.012*Math.sin(i),.83+.035*Math.sin(i*1.3),z],.012,.008,3));}
  }else if(form==='massive'){
    const g=new THREE.SphereGeometry(1,far?16:40,far?8:20,0,TAU,0,Math.PI/2),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),bump=1+.045*Math.sin(x*15+phase)*Math.cos(z*13)+.025*Math.sin(z*29+y*18);
      p.setXYZ(i,x*.46*bump,Math.max(0,y*.78*bump),z*.46*bump);}
    g.computeVertexNormals();parts.push(g);
  }else{
    parts.push(branch([0,0,0],[0,.2,0],[0,.5,0],.027,.014));
    for(let i=0;i<(far?6:11);i++){const side=i<(far?3:5)?-1:1,u=(i%(far?3:6))/(far?2:5),tip=[side*(.14+.27*u),.85-.16*u,.025*Math.sin(i+phase)];
      parts.push(branch([0,.16+i*.028,0],[side*.12,.65,.015],tip,.014,.005,5));
      for(let j=1;j<(far?2:5);j++){const t=j/(far?2:5);parts.push(branch([tip[0]*t,.3+t*.48,0],[tip[0]*t+side*.025,.45+t*.38,.01],[tip[0]*t+side*.07,.54+t*.36,.02],.005,.002,2));}
    }
  }
  for(const g of parts){if(!g.hasAttribute('color'))coloured(g,()=>new THREE.Color('#ffffff'));}
  const g=merge(parts),p=g.attributes.position;let maxRadius=0,top=0,minY=Infinity;
  for(let i=0;i<p.count;i++){maxRadius=Math.max(maxRadius,Math.hypot(p.getX(i),p.getZ(i)));top=Math.max(top,p.getY(i));minY=Math.min(minY,p.getY(i));}
  const scale=.49/maxRadius;
  for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)*scale,Math.max(0,(p.getY(i)-minY)/(top-minY)),p.getZ(i)*scale);
  const low=new THREE.Color('#667b6b'),high=new THREE.Color(form==='branching'?'#c7d0b5':form==='massive'?'#b9b79a':form==='fan'?'#bf9a96':'#b8b6c0');
  coloured(g,(x,y,z)=>{const grain=.06*Math.sin(x*48+z*43)*Math.cos(y*41),bright=THREE.MathUtils.clamp(y*.58+.24+grain,0,1);return low.clone().lerp(high,bright);});
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.userData={role:'living-colony-display-not-biomass',form,variant,unitEnvelope:'y 0..1; XZ radius <= .5'};return g;
}
export function shallowNaturalCoralGeometries(detail='near'){
  const result={};for(const form of ['branching','table','massive','fan'])for(let variant=0;variant<(form==='fan'?1:2);variant++)result[`${form}-${variant}`]=colony(form,variant,detail);
  return result;
}
