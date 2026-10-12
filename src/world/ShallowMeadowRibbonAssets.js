import * as THREE from 'three';

// Whole-patch authored ribbon grass for the finite sample. The exploration
// asset stays unchanged. Each blade carries its real, immobile sediment root.
export function shallowMeadowRibbonGeometry(){
  const positions=[],indices=[],colors=[],roots=[],uv=[];
  for(let shoot=0;shoot<32;shoot++){
    const angle=shoot*2.399963,r=.255*Math.sqrt((shoot+.5)/32);
    const rx=Math.cos(angle)*r,rz=Math.sin(angle)*r;
    const flow=.65+.28*Math.sin(shoot*1.7);
    for(let leaf=0;leaf<3;leaf++){
      const offset=positions.length/3,direction=flow+(leaf-1)*.90+.25*Math.sin(angle);
      const length=.58+.42*(.5+.5*Math.sin(shoot*1.73+leaf*2.1));
      const bend=1.25+.70*(.5+.5*Math.cos(shoot*1.1+leaf));
      const reach=.13+.11*(.5+.5*Math.sin(shoot*.93+leaf*1.7));
      for(let level=0;level<=4;level++){
        const t=level/4,lean=reach*(1-Math.cos(t*bend))/(1-Math.cos(bend));
        const h=length*Math.sin(t*bend)/Math.sin(Math.min(bend,Math.PI/2));
        const width=(level===0||level===4)?0:(.018+.007*Math.sin(shoot+leaf)**2)*Math.sin(t*Math.PI)*(.9-.35*t);
        const twist=direction+.36*t*Math.sin(shoot+leaf*1.4);
        for(const side of [-1,1]){
          positions.push(rx+Math.cos(direction)*lean-Math.sin(twist)*width*side,h,rz+Math.sin(direction)*lean+Math.cos(twist)*width*side);
          colors.push(.56+.26*t,.66+.30*t,.41+.20*t);roots.push(rx,rz);uv.push((side+1)/2,t);
        }
        if(level<4){const a=offset+level*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
      }
    }
  }
  const g=new THREE.BufferGeometry();
  for(const [name,data,size]of [['position',positions,3],['color',colors,3],['rootXZ',roots,2],['uv',uv,2]])g.setAttribute(name,new THREE.Float32BufferAttribute(data,size));
  g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  g.userData={role:'authored-sample-seagrass-not-biological-stock',shootCount:32,bladeCount:96,bladeSegments:4,indicesPerShoot:72,license:'project-authored-no-third-party-mesh'};
  return g;
}
