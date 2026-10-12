import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {oceanRockMesh} from '../oceanRockShape.js';

// Authored, generic growth forms. No taxonomic or measured cover claim.
// These colours describe a thin attached surface, not additional collider volume.
export function reefAttachedColour(x,y,z,up,target=new THREE.Color()){
  const large=Math.sin(x*.67+Math.sin(z*.61)*1.8)+.63*Math.cos(z*1.06-x*.24)+.28*Math.sin(x*2.4+z*1.9);
  const crust=THREE.MathUtils.smoothstep(large,-.55,.95);
  const turf=THREE.MathUtils.smoothstep(Math.sin(x*.93-z*.73)+.46*Math.cos(x*.31+z*1.5),.2,1.1)*(1-crust*.65);
  target.set('#ccc4ac').lerp(new THREE.Color('#aa8184'),crust*.80).lerp(new THREE.Color('#7f886b'),turf*.66);
  target.multiplyScalar(.86+.14*Math.max(0,up));return target;
}

// Bake world-varying attached cover onto the SAME rock triangles. This avoids
// texture clones on every repeated rock, floating decals and hidden collisions.
export function shallowCoveredRockPatches(rocks){
  const groups=new Map(),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),c=new THREE.Color();
  for(const rock of rocks){
    const data=oceanRockMesh(rock.profile),g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);g.computeVertexNormals();
    matrix.compose(new THREE.Vector3(rock.x,rock.y,rock.z),rotation.setFromAxisAngle(up,rock.rotation),new THREE.Vector3(rock.scale.x,rock.scale.y,rock.scale.z));g.applyMatrix4(matrix);
    const p=g.attributes.position,n=g.attributes.normal,colors=[],uv=[];
    for(let i=0;i<p.count;i++){
      reefAttachedColour(p.getX(i),p.getY(i),p.getZ(i),n.getY(i),c);colors.push(c.r,c.g,c.b);uv.push(p.getX(i)*.5,p.getZ(i)*.5);
    }
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const key=`${Math.floor(rock.x/24)},${Math.floor(rock.z/24)}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(g);
  }
  return [...groups].map(([key,parts])=>{const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();g.userData={role:'original-rock-triangles-with-attached-cover',patch:key};return g;});
}

// Asymmetric open laminae share a compact attachment. Partial fans with
// staggered reach replace complete circular dishes; this is an authored
// growth-form family, not an added taxon or a scan of live tissue.
export function shallowFolioseGeometries(detail='near'){
  const far=detail==='distant',result={};
  for(const variant of [0,1,2,3]){
    const p=[],index=[],colors=[],uv=[];const sectors=far?14:34,rings=far?3:7;
    const low=new THREE.Color(variant?'#8c7968':'#897b88'),high=new THREE.Color('#c3b59d'),c=new THREE.Color();
    for(let leaf=0;leaf<[6,6,3,4][variant];leaf++){
      const start=p.length/3,bearing=leaf*2.39996+variant*.8,reach=.31+.10*Math.sin(leaf*2.1+variant)**2,height=.025+leaf*.022;
      for(let row=0;row<=rings;row++)for(let k=0;k<=sectors;k++){
        const r=row/rings,u=k/sectors,a=bearing+(u-.5)*((variant===2?3.2:variant===3?1.8:2.2)+.35*Math.sin(leaf)),outline=1+.085*Math.sin(a*5+leaf)+.05*Math.cos(a*3-leaf);
        const x=Math.cos(a)*reach*outline*r,z=Math.sin(a)*reach*outline*r;
        const y=.008+height*THREE.MathUtils.smoothstep(r,0,.7)+.015*r*r*(1+Math.sin(a*5+leaf))+.012*r*Math.sin(Math.PI*u);
        p.push(x,y,z);uv.push(x+.5,z+.5);
        c.copy(low).lerp(high,THREE.MathUtils.smoothstep(r,.94,1)*.30+.045*leaf);colors.push(c.r,c.g,c.b);
        if(row<rings&&k<sectors){const i=start+row*(sectors+1)+k,j=i+sectors+1;index.push(i,i+1,j,i+1,j+1,j);}
      }
    }
    // Compact attachment foot is explicit geometry; crown root remains y=0.
    const start=p.length/3;p.push(0,0,0);colors.push(low.r,low.g,low.b);uv.push(.5,.5);
    for(let i=0;i<=12;i++){const a=i/12*Math.PI*2;p.push(.045*Math.cos(a),.018,.045*Math.sin(a));colors.push(low.r,low.g,low.b);uv.push(.5,.5);if(i<12)index.push(start,start+i+1,start+i+2);}
    let radius=0,height=0;for(let i=0;i<p.length;i+=3){radius=Math.max(radius,Math.hypot(p[i],p[i+2]));height=Math.max(height,p[i+1]);}
    for(let i=0;i<p.length;i+=3){p[i]*=.489/radius;p[i+1]/=height;p[i+2]*=.489/radius;}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
    g.userData={role:'living-colony-display-not-biomass',sourceKind:'authored-foliose-growth-form',form:'table',variant,detail,sourceAspect:height/(radius/.489),rootRadius:.05,license:'project-authored-no-third-party-mesh'};
    result[`table-${variant}`]=g;
  }
  return result;
}
