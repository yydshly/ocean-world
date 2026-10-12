import * as THREE from 'three';
import {NATURAL_SAMPLE_FISH} from './ShallowNaturalAssets.js';
import {communityFishShape as shape, communityFishEyes as eyes, ShallowCommunityFishAssets} from './ShallowCommunityFishAssets.js';
import {deformMaterial} from './ShallowSourcedFishAssets.js';

// One complete, authored swimming-body family for the principal and reef fish.
// Existing species, catalogue lengths and behaviour remain separate. These are
// anatomy interpretations, not photogrammetry or a biological calibration.
const configurations={...NATURAL_SAMPLE_FISH,
  'blacktail-snapper':{height:.181,width:.086,body:'#ac9570',belly:'#d0c9ae',fin:'#b2a16d',type:'blacktail'},
  'giant-trevally':{height:.194,width:.112,body:'#809591',belly:'#c5ccbc',fin:'#526865',type:'giant'},
  'unidentified-reef-fish':{height:.205,width:.078,body:'#889b94',belly:'#c4c8b6',fin:'#858b74',type:'unidentified'},
  'blue-tang':{height:.265,width:.065,body:'#3d607f',belly:'#768c99',fin:'#b8aa58',type:'blue-tang',disc:true},
  'yellow-tang':{height:.285,width:.054,body:'#b7a453',belly:'#cdc48c',fin:'#bbaa65',type:'yellow-tang',disc:true},
};
export const COHESIVE_FISH_IDS=Object.freeze(Object.keys(configurations));
const smooth=THREE.MathUtils.smoothstep;
const col=x=>new THREE.Color(x);

function surface(p,x,y,z){
  const v=y/p.height,head=smooth(x,.26,.46),c=col(p.body).lerp(col(p.belly),smooth(-v,-.05,.93)*.85);
  c.multiplyScalar(1-.20*smooth(v,.05,.9));
  if(p.type==='teres')c.lerp(col('#bfa74d'),smooth(v,.2-.9*(x+.12),.36-.9*(x+.12))*(1-head));
  if(p.type==='doubleline')for(const b of [.53,-.05])c.lerp(col('#b5a24f'),(1-smooth(Math.abs(v-b),.02,.08))*(1-head));
  if(p.type==='snapper')for(const b of [.63,.28,-.08,-.42])c.lerp(col('#397986'),(1-smooth(Math.abs(v-b),.025,.065))*(1-head));
  if(p.type==='blacktail'){
    c.lerp(col('#b2a975'),(1-head)*.25);
    c.multiplyScalar(.94+.06*Math.cos(v*45+x*3));
  }
  if(p.type==='giant'||p.type==='trevally'){
    c.lerp(col('#405b63'),smooth(v,.02,.95)*.55);
    const spot=((x-.25)/.027)**2+((v-.40)/.12)**2;
    if(p.type==='trevally')c.lerp(col('#293d3e'),(1-smooth(spot,.3,1))*.75);
  }
  if(p.type==='parrotfish'){
    c.lerp(col('#82866e'),head*.60);
    c.lerp(col('#477e73'),(1-head)*.30);
  }
  if(p.type==='rabbitfish'){
    const r=Math.floor(v*11),u=x*36+(r%2)*.5,d=Math.hypot(u-Math.floor(u)-.5,v*11-r-.5);
    c.lerp(col('#c9c9a5'),(1-smooth(d,.10,.23))*.75);
  }
  if(p.type==='copperband'){
    for(const k of [-.23,-.045,.13,.285])c.lerp(col('#ac804d'),1-smooth(Math.abs(x-k),.025,.052));
    c.lerp(col('#263b39'),1-smooth(((x+.19)/.045)**2+((v-.70)/.16)**2,.5,1));
  }
  if(p.type==='emperor'){
    c.lerp(col('#b4aa53'),smooth(Math.sin((v-x*.42)*30),-.2,.4)*(1-head));
    c.lerp(col('#263f43'),(1-smooth(Math.abs(x-.28+v*.023),.025,.07))*.9);
  }
  if(p.type==='idol'){
    for(const k of [-.17,.21])c.lerp(col('#263b3b'),1-smooth(Math.abs(x-k+.05*v),.048,.080));
    c.lerp(col('#b5a957'),(1-smooth(Math.abs(x+.01),.05,.12))*smooth(v,-.3,.8));
  }
  if(p.type==='blue-tang'){
    const band=Math.abs(v-.17-.55*Math.sin((x+.32)*4.2));
    c.lerp(col('#263843'),(1-smooth(band,.14,.30))*(1-head));
  }
  if(p.type==='sailfin')c.lerp(col('#c9bc85'),smooth(Math.sin(x*52+v*2),-.12,.30)*.65);
  if(p.type==='anthias')c.lerp(col('#b78354'),smooth(x,-.1,.38)*.25);
  if(p.type==='goatfish')c.lerp(col('#ad8880'),(1-smooth(Math.abs(v-.1),.05,.18))*.6);
  const gill=.257+.04*(1-v*v);
  c.multiplyScalar(1-.13*(1-smooth(Math.abs(x-gill),.003,.012))*(1-smooth(Math.abs(v),.4,.8)));
  // All authored fish use the same restrained surface contrast. No photograph
  // or specimen shadow is baked into this material.
  return c.multiplyScalar(.965+.025*Math.sin(x*147+Math.sin(v*31))*Math.cos(v*53));
}

function partsFor(id){
  const p=configurations[id],disc=!!p.disc,giant=p.type==='giant'||p.type==='trevally',slender=['teres','doubleline','goatfish','anthias'].includes(p.type),h=p.height,w=p.width;
  const contour=giant?
    [[-.34,.085,.085,.12],[-.23,.27,.23,.30],[-.08,.65,.58,.67],[.10,.88,.76,.93],[.25,.94,.75,1],[.35,.75,.58,.78],[.44,.40,.28,.44],[.485,.17,.14,.22],[.50,.11,.09,.10]]:
    disc?[[ -.34,.12,.10,.15],[-.23,.66,.61,.61],[-.06,1,.94,.97],[.12,.98,.87,1],[.29,.77,.62,.71],[.40,.38,.28,.37],[.47,.16,.10,.17],[.50,.06,.05,.06]]:
    slender?[[-.34,.09,.08,.12],[-.22,.34,.28,.39],[-.06,.70,.61,.78],[.13,.87,.77,1],[.28,.73,.62,.84],[.40,.40,.31,.52],[.48,.12,.09,.20],[.50,.055,.05,.07]]:
    [[-.34,.12,.11,.17],[-.23,.36,.33,.45],[-.07,.83,.72,.86],[.12,1,.80,1],[.29,.91,.70,.92],[.40,.59,.43,.62],[.475,.24,.19,.30],[.50,.10,.085,.10]];
  const stations=contour.map(([x,u,l,z])=>[x,u*h,l*h,z*w,-.007]);
  const tint=(x,y,z)=>surface(p,x,y,z),fin=(x,y)=>col(p.fin).multiplyScalar(.83+.13*smooth(Math.abs(y),0,h));
  const main={name:'coherent continuous fish body, inset eyes and complete median fins',role:'body',g:shape(b=>{
    b.body(stations,tint,58,40);
    const eyeX=disc?.365:giant?.390:.395,eyeY=h*(disc?.31:.29),eyeZ=w*(disc?.52:giant?.60:.55),eyeR=p.type==='trevally'?.024:giant?.013:disc?.017:.013;
    eyes(b,eyeX,eyeY,eyeZ,eyeR,'#a0a18a');
    for(const s of [-1,1])b.tube([[.498,-.010,s*w*.10],[.475,-.012,s*w*.26],[.445,-.018,s*w*.36]],.0018,.0007,()=>col('#52605a'),4,5);
    b.membrane(p.type==='idol'?[[.24,h*.82,0],[.05,h*1.55,0],[-.24,h*1.83,0],[-.17,h*1.64,0],[-.06,h*1.02,0],[-.29,h*.32,0]]:giant?[[.24,h*.82,0],[.16,h*1.22,0],[.02,h*.92,0],[.03,h*.79,0]]:
      [[.23,h*.79,0],[.12,h*(disc?1.27:1.22),0],[-.10,h*(disc?1.32:1.07),0],[-.30,h*.33,0],[-.10,h*.71,0]],fin,3,30);
    if(giant)b.membrane([[.025,h*.76,0],[-.065,h*1.42,0],[-.17,h*1.26,0],[-.105,h*.84,0],[-.31,h*.20,0],[-.12,h*.61,0]],fin,3,28);
    b.membrane([[.035,-h*.68,0],[-.065,-h*(disc?1.27:giant?1.18:1.06),0],[-.24,-h*.68,0],[-.32,-h*.22,0],[-.12,-h*.57,0]],fin,3,28);
    for(const s of [-1,1])b.membrane([[.17,-h*.61,s*w*.34],[.04,-h*1.0,s*w*.74],[-.01,-h*.70,s*w*.62],[.09,-h*.55,s*w*.29]],fin,2,18);
    if(p.type==='unicorn')b.tube([[.30,h*.71,0],[.36,h*.9,0],[.44,h*1.1,0]],.022,.002,tint,5,8);
    if(p.type==='goatfish')for(const s of [-1,1])b.tube([[.45,-.033,s*.017],[.36,-.12,s*.020],[.28,-.14,s*.029]],.0035,.001,()=>col('#b1b0a1'),5,7);
  })};
  const spread=giant?.207:disc?.15:.159;
  const tail={name:'whole forked caudal membrane',role:'fin',pivot:[-.34,0,0],motion:'tail',g:shape(b=>{
    const shade=p.type==='blacktail'?()=>col('#44504b'):p.type==='blue-tang'?()=>col('#c5b85e'):fin;
    b.ruledFin(u=>{
      const v=u*2-1,a=Math.abs(v),leading=-.16*a**1.35,trailing=-.065-.095*a**.63;
      return [[leading,v*spread,0],[trailing,v*spread,.002*(1-a)]];
    },shade,40,5);
  })};
  return [main,tail,...[-1,1].map(s=>({name:`complete curved pectoral ${s}`,role:'fin',pivot:[.23,-h*.07,s*w*.83],motion:'fin',g:shape(b=>b.membrane([[0,0,0],[-.13,-.04,s*.09],[-(giant?.29:.20),-.07,s*.11],[-.16,.014,s*.048],[-.025,.018,s*.013]],fin,3,28,.003))}))];
}

export class ShallowCohesiveFish extends ShallowCommunityFishAssets{
  constructor(){
    super(Object.fromEntries(COHESIVE_FISH_IDS.map(id=>[id,()=>partsFor(id)])));
    this.bodyMaterial=this.own(new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.40,metalness:0,clearcoat:.32,clearcoatRoughness:.26,specularIntensity:.65}));
    this.bodyMaterial.userData.biologicalSkin=true;
    this.clock={value:0};this.bodyMaterial.side=THREE.DoubleSide;
    for(const m of [this.bodyMaterial,this.finMaterial]){m.metalness=0;deformMaterial(m,this.clock);}
    this.depthMaterial=this.own(deformMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide}),this.clock));
  }
  create(id){
    const model=super.create(id);if(!model)return null;
    model.root.traverse(m=>{if(m.isMesh){m.customDepthMaterial=this.depthMaterial;m.geometry.userData={...m.geometry.userData,assetFamily:'cohesive-reef-swimmers-v3',referenceKit:'public/assets/shallow-cohesive-life/provenance.json'};}});
    return model;
  }
  update(time,speeds){this.clock.value=time;super.update(time,speeds);}
}
