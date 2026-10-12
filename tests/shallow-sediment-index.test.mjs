import test from 'node:test';
import assert from 'node:assert/strict';
import {createShallowSample} from '../src/shallowSample.js';
import {sampleSedimentTints} from '../src/shallowSampleSediment.js';

// Independent all-rock reference keeps the old field equations. This checks
// that indexing removes work without changing any displayed terrain colour.
function reference(model,x,z){
  let grass=0,reef=0;
  for(const root of model.grass)grass=Math.max(grass,Math.max(0,1-Math.hypot(root.x-x,root.z-z)/1.7));
  for(const rock of model.rocks){
    const co=Math.cos(rock.rotation),si=Math.sin(rock.rotation),dx=x-rock.x,dz=z-rock.z;
    const nx=(dx*co-dz*si)/rock.scale.x,nz=(dx*si+dz*co)/rock.scale.z,r=Math.hypot(nx,nz);
    if(r>.45&&r<.7)reef=Math.max(reef,Math.max(0,1-Math.abs(r-.52)/.18));
  }
  return {grass:grass*grass*(3-2*grass),reef};
}

test('sediment spatial lookup retains exact fields across the whole terrain and rotated ellipse boundaries',()=>{
  const model=createShallowSample(55),sample=sampleSedimentTints(model);
  const check=(x,z)=>assert.deepEqual(sample(x,z),reference(model,x,z),`field changed at ${x},${z}`);
  const {min,step,cells}=model.bed;
  for(let z=0;z<=cells;z++)for(let x=0;x<=cells;x++)check(min+x*step,min+z*step);
  for(const r of model.rocks)for(let i=0;i<16;i++)for(const radius of [.449999999,.450000001,.519999999,.699999999,.700000001]){
    const a=i*Math.PI/8,dx=radius*r.scale.x*Math.cos(a),dz=radius*r.scale.z*Math.sin(a);
    check(r.x+dx*Math.cos(r.rotation)+dz*Math.sin(r.rotation),r.z-dx*Math.sin(r.rotation)+dz*Math.cos(r.rotation));
  }
  for(let i=0;i<2000;i++)check(-130+(i*13.711)%280,-130+(i*23.937)%280);
});
