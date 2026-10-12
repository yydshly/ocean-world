import * as THREE from 'three';

// Uses the established indexed vertex-colour builder and shared mesh ownership.
// Whole authored TL spans x=-.5..+.5; no decorative school copies.
export function buildOceanMeadowWaterFish(root, parts, id, builder, mesh) {
  const rabbit = id === 'white-spotted-rabbitfish';
  const h = rabbit ? .13 : .072, width = rabbit ? .044 : .035;
  const finColor = rabbit ? [.55, .62, .48] : [.64, .76, .73];
  const profile = rabbit ? [[-.33,.016,.012],[-.24,.07,.027],[-.10,.12,.04],[.07,.13,.044],[.23,.109,.038],[.37,.061,.028],[.46,.026,.015],[.5,.004,.004]] :
    [[-.33,.012,.009],[-.23,.039,.022],[-.07,.062,.030],[.12,.072,.035],[.29,.062,.033],[.40,.040,.025],[.47,.016,.012],[.5,.003,.004]];
  const body = mesh(root, `${id}:body`, () => { const b = builder();
    const shade = (x,y,z) => {
      if (!rabbit) return Math.abs(y)<.025 && Math.abs(z)>.012 ? [.80,.87,.86] : y>.025 && y<.037 && Math.abs(z)>.012 ? [.28,.53,.62] : y<0 ? [.70,.78,.76] : [.36,.51,.47];
      return y<-.035 ? [.73,.78,.73] : [.45,.53,.44];
    };
    // Dense body rings make the broad silver band readable without textures.
    const dense=[];
    for(let i=0;i<profile.length-1;i++)for(let n=0;n<4;n++){const t=n/4;dense.push(profile[i].map((v,k)=>v+(profile[i+1][k]-v)*t));}dense.push(profile.at(-1));
    b.body(dense,shade,40);
    for(const side of [-1,1]){
      const eye = rabbit ? [.371,.045,side*.031] : [.387,.023,side*.029];
      b.ellipsoid(eye,[rabbit?.019:.026,rabbit?.019:.026,.008],[.76,.79,.67]);
      b.ellipsoid([eye[0]+.002,eye[1],eye[2]+side*.005],[rabbit?.011:.016,rabbit?.011:.016,.005],[.07,.11,.10]);
      b.fin([[.269,h*.62,side*.033],[.244,-h*.55,side*.034],[.237,-h*.5,side*.034]],[.30,.38,.32],.001);
      if(rabbit)for(let row=0;row<5;row++)for(let col=0;col<12;col++){
        const x=-.20+col*.044+(row%2)*.014,y=-.065+row*.03;
        let k=profile.findIndex(p=>p[0]>=x);k=Math.max(1,k);const t=(x-profile[k-1][0])/(profile[k][0]-profile[k-1][0]);
        const ry=profile[k-1][1]+(profile[k][1]-profile[k-1][1])*t,rz=profile[k-1][2]+(profile[k][2]-profile[k-1][2])*t;
        if(Math.abs(y)<ry*.9)b.ellipsoid([x,y,side*(rz*Math.sqrt(1-(y/ry)**2)+.001)],[.0045,.0045,.0015],[.80,.87,.84],6,4);
      }
    }
    b.fin([[.481,-.006,0],[.499,-.006,0],[.486,-.009,0]],[.18,.23,.18],.004);
    return b.finish();
  });root.add(body);parts.body=body;
  const fixed=mesh(root,`${id}:fixed-fins`,()=>{const b=builder();
    if(rabbit){
      b.fin([[.27,.09,0],[.18,.19,0],[-.05,.22,0],[-.27,.09,0]],finColor);
      b.fin([[.05,-.12,0],[-.12,-.20,0],[-.28,-.07,0]],finColor);
      for(let i=0;i<13;i++){const x=.26-i*.038,y=.12+Math.sin(i/12*Math.PI)*.08;b.fin([[x,.08,0],[x-.018,y+.019,0],[x-.025,.085,0]],[.66,.69,.48],.0015);}
      for(let i=0;i<7;i++){const x=.03-i*.04;b.fin([[x,-.075,0],[x-.024,-.18+Math.abs(i-3)*.008,0],[x-.03,-.085,0]],[.65,.69,.49],.0015);}
    }else{
      b.fin([[.13,.068,0],[.055,.128,0],[-.05,.062,0]],finColor);
      b.fin([[-.10,.055,0],[-.175,.123,0],[-.30,.018,0]],finColor);
      b.fin([[-.045,-.061,0],[-.15,-.12,0],[-.30,-.018,0]],finColor);
    }
    for(const side of [-1,1])b.fin([[.055,-h*.7,side*.012],[-.045,-h*.97,side*.053],[-.085,-h*.6,side*.012]],finColor);
    return b.finish();},!rabbit);root.add(fixed);parts.fixedFins=fixed;
  const tail=new THREE.Group();tail.position.x=-.31;root.add(tail);
  tail.add(mesh(root,`${id}:tail`,()=>{const b=builder();b.fin([[0,.013,0],[-.19,rabbit?.115:.10,0],[rabbit?-.13:-.06,0,0],[-.19,rabbit?-.115:-.10,0],[0,-.013,0]],finColor);return b.finish();},!rabbit));parts.tail=tail;
  parts.pectoralFins=[-1,1].map(side=>{const pivot=new THREE.Group();pivot.position.set(.20,-h*.20,side*width*.85);pivot.userData.side=side;
    const f=mesh(root,`${id}:pectoral`,()=>{const b=builder();b.fin([[0,0,0],[-.17,-.045,.09],[-.10,.008,.023]],finColor);return b.finish();},!rabbit);
    f.scale.z=side;pivot.add(f);root.add(pivot);return pivot;});
  root.userData.anatomy={bodyForm:rabbit?'compressed-oval-white-spotted-spinefoot':'slender-silver-band-large-eye',eyes:2,dorsalFins:rabbit?1:2,analFins:1,pelvicFins:2,pectoralFins:2,tail:rabbit?'shallow-forked':'forked',...(rabbit?{dorsalSpines:13,analSpines:7}: {})};
}
