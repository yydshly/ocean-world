import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../output/validation/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const old = read('kelp-macro-landscape-browser-before.json'), upgraded = read('kelp-macro-landscape-browser-after-upgrade.json');
const beforeRefresh = read('kelp-macro-landscape-browser-before-refresh.json'), afterRefresh = read('kelp-macro-landscape-browser-after-refresh.json');
const start = read('kelp-macro-landscape-browser-travel-start.json'), end = read('kelp-macro-landscape-browser-travel-end.json');
const sorted = rows => [...rows].sort((a,b) => a.id.localeCompare(b.id));
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} versus ${b}`);
const eraseY = (a,b) => { assert.equal(a.x,b.x); assert.equal(a.z,b.z); delete a.y; delete b.y; };
const oldAgents = sorted(structuredClone(old.ocean.ecology.agents)), newAgents = sorted(structuredClone(upgraded.ocean.ecology.agents));
assert.equal(oldAgents.length,140); assert.equal(newAgents.length,140);
let movedAnimals=0;
oldAgents.forEach((previous,index) => {
  const current=newAgents[index]; assert.equal(current.id,previous.id);
  if (current.position.y !== previous.position.y) movedAnimals++;
  if (previous.alive) {
    if (previous.speciesId==='blue-rockfish') eraseY(current.position,previous.position);
    else if (previous.speciesId==='brown-turban-snail') {
      for (const key of ['position','home','target','supportNormal']) { delete current[key]; delete previous[key]; }
    } else {
      for (const key of ['position','home','target']) eraseY(current[key],previous[key]);
      if (['purple-urchin','gumboot-chiton','bat-star'].includes(previous.speciesId)) { delete current.supportNormal; delete previous.supportNormal; }
    }
    if (previous.hostAnchor) {
      eraseY(current.hostAnchor,previous.hostAnchor); delete current.hostAnchor.lengthM; delete previous.hostAnchor.lengthM;
    }
    if (previous.lastDriftIntake) { assert.equal(current.lastDriftIntake.supportGeometryVersion,1); delete current.lastDriftIntake.supportGeometryVersion; }
  }
  assert.deepEqual(current,previous,`public ${previous.id} outside declared support references`);
});
const oldRegions=sorted(structuredClone(old.ocean.ecology.regions)), newRegions=sorted(structuredClone(upgraded.ocean.ecology.regions));
assert.equal(newRegions.length,9);
oldRegions.forEach((previous,index) => {
  const current=newRegions[index]; assert.equal(current.id,previous.id); assert.equal(current.supportGeometryVersion,2); delete current.supportGeometryVersion;
  current.driftPatches.forEach((patch,i) => { eraseY(patch.position,previous.driftPatches[i].position); delete patch.supportNormal; delete previous.driftPatches[i].supportNormal; });
  assert.deepEqual(current,previous,`whole public region ${previous.id}`);
});
assert.deepEqual(upgraded.ocean.worldPosition,old.ocean.worldPosition);
assert.deepEqual(upgraded.camera,old.camera);
assert.deepEqual(upgraded.explorationMemory.points,old.explorationMemory.points);
assert.deepEqual(sorted(afterRefresh.ocean.ecology.agents),sorted(beforeRefresh.ocean.ecology.agents));
assert.deepEqual(sorted(afterRefresh.ocean.ecology.regions),sorted(beforeRefresh.ocean.ecology.regions));
// The render origin may differ after reload. Compare logical coordinates,
// rather than requiring equal local Three.js coordinates after rebasing.
let cameraRounding=0;
for (const key of ['position','target']) for (let axis=0;axis<3;axis++) {
  const offset=receipt=>axis===0?receipt.ocean.renderOrigin.x:axis===2?receipt.ocean.renderOrigin.z:0;
  const a=afterRefresh.camera[key][axis]+offset(afterRefresh), b=beforeRefresh.camera[key][axis]+offset(beforeRefresh);
  close(a,b); cameraRounding=Math.max(cameraRounding,Math.abs(a-b));
}
afterRefresh.ocean.worldPosition.forEach((value,index)=>close(value,beforeRefresh.ocean.worldPosition[index]));
assert.deepEqual(afterRefresh.explorationMemory.points,beforeRefresh.explorationMemory.points);
let aggregateRounding=0;
for(const [key,value] of Object.entries(beforeRefresh.ocean.ecology.resources)) {
  close(afterRefresh.ocean.ecology.resources[key],value);
  aggregateRounding=Math.max(aggregateRounding,Math.abs(afterRefresh.ocean.ecology.resources[key]-value));
}
for(const receipt of [upgraded,beforeRefresh,afterRefresh,start,end]) {
  assert.equal(receipt.speed,1); assert.deepEqual(receipt.errors,[]);
  assert.equal(receipt.ocean.ecology.metrics.activeRegions,9); assert.equal(receipt.ocean.streaming.activeChunks,9);
  assert.equal(receipt.ocean.ecology.metrics.storageError,null); assert.equal(receipt.ocean.streaming.supportGeometryVersion,2);
}
assert.equal(start.paused,false); assert.equal(end.paused,true); assert.equal(end.ocean.cruising,false);
assert.equal(end.ocean.streaming.loadedChunks.some(id=>start.ocean.streaming.loadedChunks.includes(id)),false);
const distance=Math.hypot(...end.ocean.worldPosition.map((v,i)=>v-start.ocean.worldPosition[i]));
assert.ok(distance>300); assert.equal(end.ocean.localHabitat.status,'ready');
const report={upgrade:{animals:140,regions:9,changedAnimalY:movedAnimals,cameraExact:true,foodClocksIdsAndNonGeometryFieldsExact:true},
  travel:{distanceM:distance,startCell:start.ocean.chunkId,endCell:end.ocean.chunkId,allOldOwnersUnloaded:true,wallSeconds:end.wallSeconds-start.wallSeconds},
  refresh:{animals:afterRefresh.ocean.ecology.agents.length,completeAnimalAndRegionFieldsExact:true,aggregateRounding,cameraRounding,oldNotes:afterRefresh.explorationMemory.points.length},
  limits:'public DOM receipts do not expose hidden RNG/state; independent original-source migration tests cover those. No promise of long-run FPS, measured density or surveyed geology.'};
writeFileSync(new URL('kelp-macro-landscape-browser-verification.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
