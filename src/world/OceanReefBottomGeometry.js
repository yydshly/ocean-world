const TAU=Math.PI*2;
function blueStar(builder){
 const b=builder(),blue=[.19,.38,.62];b.ellipsoid([0,.053,0],[.096,.053,.096],blue,24,10);
 for(let arm=0;arm<5;arm++){
  const angle=arm*TAU/5,c=Math.cos(angle),s=Math.sin(angle),p=(x,y,z)=>[x*c-z*s,y,x*s+z*c];
  const radius=(1-.04)/(2*Math.sin(2*Math.PI/5)),points=[],radii=[];
  for(let j=0;j<=12;j++){const x=.035+j*(radius-.035)/12,r=.053*(1-.65*j/12);points.push(p(x,.057,0));radii.push(r);}
  b.tube(points,radii,blue,14);b.ellipsoid(p(radius,.057,0),[.02,.02,.02],blue,10,6);
  for(let j=0;j<10;j++)for(const side of[-1,1]){
   const x=.09+j*.038;b.tube([p(x,.038,side*.012),p(x,.003,side*.014)],[.0045,.003],[.50,.63,.68],5);
  }
 }return b.finish();
}
function redfish(builder){
 const b=builder();b.ellipsoid([0,.14,0],[.5,.14,.18],[.58,.30,.19],36,14,(x,y,z)=>y<.045?[.72,.47,.42]:[.53+.04*Math.cos(x*83+z*44),.27,.17]);
 for(let j=0;j<13;j++){
  const x=-.38+j*.063,round=Math.sqrt(1-(x/.5)**2);
  for(const a of[-1.02,-.52,0,.52,1.02]){
   const y=.14+Math.cos(a)*.14*round,z=Math.sin(a)*.18*round,h=.045+.02*((j%3)/2);
   b.tube([[x,y,z],[x+.005,y+h,z*1.05]],[.018,.002],[.66,.35,.20],7);
   if(j%2===0)b.tube([[x,y+h*.55,z*1.03],[x+.021,y+h*.75,z*1.14]],[.008,.001],[.65,.34,.21],5);
  }
  for(const z of[-.05,0,.05])b.ellipsoid([x,.007,z],[.008,.007,.008],[.72,.46,.42],6,4);
 }return b.finish();
}
function triton(builder){
 const b=builder();
 b.ellipsoid([.17,.245,0],[.33,.21,.19],[.71,.62,.48],40,18,(x,y,z)=>{
  const spot=Math.sin(x*91+Math.atan2(z,y-.245)*5);return spot>.25?[.42,.30,.23]:[.77,.68,.53];
 },pts=>pts.every(p=>p[1]<.16&&p[0]>-.08&&p[0]<.46&&p[2]>-.075));
 // A tapered whorled spire rather than a separate decorative cone.
 for(let j=0;j<6;j++){
  const x=-.445+j*.09,r=.055+j*.017,y=.30+(5-j)*.023;
  b.ellipsoid([x,y,0],[.055,r,r*.82],[.70,.60,.45],20,10,(x,y,z)=>Math.sin(x*115+z*44)>.45?[.42,.30,.22]:[.74,.64,.47]);
 }
 b.ellipsoid([.19,.13,.045],[.245,.068,.115],[.20,.16,.12],24,10);
 const lip=Array.from({length:23},(_,i)=>{const a=i/22*TAU;return[.19+.25*Math.cos(a),.105+.025*Math.cos(a),.04+.12*Math.sin(a)];});
 b.tube(lip,lip.map(()=>.009),[.85,.77,.61],7);
 b.ellipsoid([.13,.026,0],[.44,.026,.135],[.67,.48,.30],30,10);
 b.ellipsoid([.48,.052,0],[.07,.04,.065],[.68,.49,.31],16,8);
 return b.finish();
}
export function reefBottomBody(builder,id){return id==='blue-linckia-star'?blueStar(builder):id==='prickly-redfish'?redfish(builder):triton(builder);}
export function reefBottomAppendages(builder,id){
 const b=builder();
 if(id==='prickly-redfish')for(let j=0;j<20;j++){
  const a=j*TAU/20,z=Math.sin(a)*.029,y=.045+Math.cos(a)*.014;
  b.tube([[.45,.046,0],[.476,y,z],[.495,.022,z*1.35]],[.004,.003,.001],[.39,.24,.17],5);
 }else if(id==='giant-triton'){
  for(const side of[-1,1]){
   b.tube([[.51,.064,side*.043],[.60,.085,side*.083],[.67,.091,side*.11]],[.006,.004,.0015],[.72,.52,.32],7);
   b.ellipsoid([.525,.074,side*.047],[.008,.008,.008],[.12,.10,.08],8,6);
  }
  b.tube([[.42,.09,.02],[.52,.13,.04],[.61,.13,.06]],[.012,.012,.008],[.62,.44,.28],8);
 }
 return b.finish();
}
export function animateReefBottomParts(parts,id,time,agent,phase){
 if(agent.alive===false||!parts.appendages)return;
 parts.appendages.rotation.y=agent.state==='benthic-proxy-feeding'?Math.sin(time*1.8+phase)*.009:0;
}
