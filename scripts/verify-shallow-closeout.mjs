// One finite source comparison against the pre-closeout snapshot. CPU evidence
// only; the browser's exported complete tour is the playback acceptance record.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ShallowSampleScene as After} from '../src/world/ShallowSampleScene.js';
import {ShallowSampleScene as Before} from '../output/validation/shallow-final-closeout/before-src/src/world/ShallowSampleScene.js';
const folder='output/validation/shallow-final-closeout';
function measure(Scene){
  const start=performance.now(),w=new Scene(55),buildMs=performance.now()-start;
  const layout={agents:w.model.agents.map(a=>[a.id,a.speciesId,a.sizeM,a.home,a.host]),rocks:w.model.rocks,
    corals:w.model.corals,grass:w.model.grass,rubble:w.model.rubble,bed:[...w.model.bed.heights]};
  const frames=[],cost=[];
  for(let i=0;i<=450;i++){
    const start=performance.now();w.update(i/6);cost.push(performance.now()-start);
    if(i%3===0)frames.push({time:i/6,camera:w.camera.position.toArray(),rotation:w.camera.quaternion.toArray(),
      agents:w.model.agents.map(a=>[a.position,a.heading,a.pitch])});
  }
  cost.sort((a,b)=>a-b);w.dispose();
  return {layout,frames,cost:{buildMs,updateMeanMs:cost.reduce((a,b)=>a+b,0)/cost.length,updateP95Ms:cost[Math.floor(cost.length*.95)],updateMaxMs:cost.at(-1)}};
}
const before=measure(Before),after=measure(After);
assert.deepEqual(after.layout,before.layout,'closeout must preserve assets, identities, placement and bed');
assert.deepEqual(after.frames,before.frames,'all sampled animal poses and camera positions must remain exact');
const result={kind:'same-process CPU comparison, not WebGL FPS',layoutExact:true,all293PosesExactAt151Times:true,cameraExact:true,before:before.cost,after:after.cost};
fs.writeFileSync(`${folder}/preservation.json`,JSON.stringify(result,null,2));console.log(result);
