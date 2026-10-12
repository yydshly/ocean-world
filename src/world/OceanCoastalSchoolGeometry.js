import * as THREE from 'three';
// Whole authored TL is x=-.5..+.5; each kit belongs to one actual saved fish.
export function buildOceanCoastalSchoolFish(root, parts, id, builder, mesh) {
  const mackerel=id==='indian-mackerel',finColor=mackerel?[.60,.63,.46]:[.77,.70,.43];
  const profile=mackerel?[[-.35,.009,.009],[-.25,.04,.033],[-.11,.092,.054],[.08,.109,.061],[.25,.088,.051],[.39,.052,.036],[.47,.020,.019],[.50,.008,.010]]:
    [[-.35,.008,.007],[-.24,.045,.017],[-.10,.089,.030],[.06,.102,.036],[.24,.090,.035],[.38,.062,.028],[.47,.028,.018],[.50,.005,.003]];
  const body=mesh(root,`${id}:whole-body`,()=>{const b=builder(),dense=[];
    for(let i=0;i<profile.length-1;i++)for(let j=0;j<4;j++){const t=j/4;dense.push(profile[i].map((v,k)=>v+(profile[i+1][k]-v)*t));}dense.push(profile.at(-1));
    b.body(dense,(x,y,z)=>{
      if(!mackerel){if((x-.23)**2+(y-.048)**2<.0005&&Math.abs(z)>.01)return[.08,.11,.10];if(Math.abs(y-.016)<.014&&x<.35)return[.84,.71,.30];return y>.04?[.40,.57,.52]:[.78,.83,.78];}
      if(x>.17&&x<.23&&y<-.026&&Math.abs(z)>.025)return[.11,.15,.13];
      if(y>.063&&Math.sin(x*127)> .90)return[.15,.24,.21];
      if(y>.015&&y<.058&&Math.sin(y*330)> .60)return[.45,.46,.30];
      return y>.04?[.29,.47,.43]:y<-.025?[.77,.81,.77]:[.62,.70,.66];
    },36);
    for(const side of [-1,1]){
      const x=mackerel?.365:.376,y=mackerel?.027:.026,z=side*(mackerel?.033:.026);
      b.ellipsoid([x,y,z],[.025,.024,.008],[.70,.74,.65]);b.ellipsoid([x+.003,y,z+side*.006],[.014,.014,.004],[.05,.08,.07]);
      if(!mackerel)b.fin([[x-.020,y-.022,z+side*.008],[x-.017,y+.022,z+side*.008],[x-.030,y+.009,z+side*.008]],[.67,.73,.67],.001);
      b.fin([[.28,.048,side*.031],[.265,-.03,side*.035],[.260,-.015,side*.035]],[.28,.37,.32],.001);
    }
    b.fin([[.489,-.004,0],[.499,-.004,0],[.491,-.007,0]],[.13,.19,.15],.004);
    return b.finish();
  });root.add(body);parts.body=body;
  const fixed=mesh(root,`${id}:paired-dorsals-anal-pelvics${mackerel?'-ten-finlets':''}`,()=>{const b=builder();
    b.fin([[.22,.087,0],[.16,mackerel?.185:.17,0],[-.016,.10,0]],finColor);
    b.fin([[-.10,.090,0],[-.16,.155,0],[-.29,.030,0]],finColor);
    b.fin([[-.10,-.075,0],[-.18,-.14,0],[-.29,-.027,0]],finColor);
    if(mackerel)for(let i=0;i<5;i++)for(const side of [-1,1]){const x=-.235-i*.022,y=side*(.017+(4-i)*.006);b.fin([[x+.014,y,0],[x,side*(Math.abs(y)+.020),0],[x-.011,side*(Math.abs(y)-.004),0]],finColor,.0015);}
    for(const side of [-1,1])b.fin([[.08,-.067,side*.015],[-.02,-.115,side*.033],[-.052,-.079,side*.011]],finColor);
    return b.finish();
  });root.add(fixed);parts.fixedFins=fixed;
  const tail=new THREE.Group();tail.position.x=-.34;root.add(tail);
  tail.add(mesh(root,`${id}:forked-tail`,()=>{const b=builder();b.fin([[0,.014,0],[-.16,.14,0],[-.105,.085,0],[-.066,0,0],[-.105,-.085,0],[-.16,-.14,0],[0,-.014,0]],finColor);return b.finish();}));parts.tail=tail;
  parts.pectoralFins=[-1,1].map(side=>{const pivot=new THREE.Group();pivot.position.set(.21,-.024,side*(mackerel?.048:.029));pivot.userData.side=side;
    const fin=mesh(root,`${id}:pectoral`,()=>{const b=builder();b.fin([[0,0,0],[mackerel?-.08:-.15,-.028,mackerel?.036:.069],[mackerel?-.05:-.10,.01,.016]],finColor);return b.finish();});fin.scale.z=side;pivot.add(fin);root.add(pivot);return pivot;});
  root.userData.anatomy={bodyForm:mackerel?'fusiform-plankton-feeder':'compressed-yellowstripe-scad',eyes:2,dorsalFins:2,analFins:1,pectoralFins:2,pelvicFins:2,tail:'forked',dorsalFinlets:mackerel?5:0,analFinlets:mackerel?5:0};
}
