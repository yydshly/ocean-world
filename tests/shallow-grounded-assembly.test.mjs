import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShallowSampleScene} from '../src/world/ShallowSampleScene.js';
import {nearReefFoundationGeometry} from '../src/world/ShallowNearCommunity.js';
import {oceanRockHeight} from '../src/oceanRockShape.js';

test('whole community uses tapered real aprons and one authored main fish family without changing population identities',()=>{
  const world=new ShallowSampleScene(),g=nearReefFoundationGeometry(),p=g.attributes.position;
  try{
    assert.equal(world.model.agents.length,293);assert.equal(new Set(world.model.agents.map(a=>a.speciesId)).size,38);
    const added=['unidentified-reef-fish','blue-tang','yellow-tang','moorish-idol'];let changed=0;
    for(const id of added){const b=world.animals.batches.find(b=>b.id===id);assert.equal(b.assetFamily,['unidentified-reef-fish','yellow-tang'].includes(id)?'source-reef-fish':'cohesive-fish');changed+=b.agents.length;
      assert.ok(!world.animals.artists.models.has(id));assert.equal(world.nearCommunity.models.has(id),['unidentified-reef-fish','yellow-tang'].includes(id));
      for(const a of b.agents)assert.ok(a.clearance.radius>0&&a.sizeM>0);
    }assert.equal(changed,49);
    assert.equal(world.model.rocks.filter(r=>r.id.startsWith('sample-field-toe-')).length,0,'obsolete toe overlays must be removed');
    assert.equal(world.model.rocks.filter(r=>r.fieldAsset==='habitat-bank').length,12);
    // No vertical curtain: every triangle in the whole foundation has a
    // nonzero horizontal footprint. The exact same apron supplies support.
    let outer=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<g.index.count;i+=3){a.fromBufferAttribute(p,g.index.getX(i));b.fromBufferAttribute(p,g.index.getX(i+1));c.fromBufferAttribute(p,g.index.getX(i+2));
      assert.ok(Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))>1e-10,'vertical foundation curtain returned');}
    const rock=world.model.rocks.find(r=>r.fieldAsset==='reefscan'&&r.communityVariant===undefined),co=Math.cos(rock.rotation),si=Math.sin(rock.rotation);
    for(let i=0;i<p.count;i++)if(Math.hypot(p.getX(i),p.getZ(i))>.50&&p.getY(i)>0){
      const x=rock.x+p.getX(i)*rock.scale.x*co+p.getZ(i)*rock.scale.z*si,z=rock.z-p.getX(i)*rock.scale.x*si+p.getZ(i)*rock.scale.z*co;
      assert.ok(oceanRockHeight(rock,x,z)>=rock.y+p.getY(i)*rock.scale.y-2e-6,'expanded apron lost its physical support');outer++;}
    assert.ok(outer>0,'apron has no sloping spread outside source base');
  }finally{g.dispose();world.dispose();}
});
