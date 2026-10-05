import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const dir = 'output/validation/';
const bytes = await readFile(`${dir}plankton-transport-browser-receipts.json`);
const receipts = JSON.parse(bytes), byLabel = new Map(receipts.map(r => [r.label, r.diagnostic]));
const hash = value => createHash('sha256').update(value).digest('hex');
const sum = values => values.reduce((a,b) => a+b,0);
const near = (a,b,label) => assert.ok(Math.abs(a-b)<1e-8, `${label}: ${a} vs ${b}`);
const ecology = d => d.ocean.ecology;
const regionFields = ['timeSec','resources','ledger','counters','agentCount','alive','transport'];
let regionChecks = 0;
for (const {label,diagnostic:d} of receipts) {
  const e = ecology(d);
  assert.deepEqual(d.errors, [], label);
  assert.equal(e.metrics.persistenceErrors, 0, label);
  assert.equal(e.metrics.loadingRegions, 0, label);
  assert.ok(e.regions.length<=9, label);
  assert.equal(new Set(e.agents.map(a=>a.id)).size,e.agents.length,label);
  for (const r of e.regions) {
    assert.ok(r.agentCount<=20, `${label} ${r.id}: dead records also count`);
    assert.equal(e.agents.filter(a=>a.regionId===r.id).length,r.agentCount);
    assert.ok(Object.values(r.resources).every(v=>v>=-1e-12&&v<=1+1e-12),label);
    const l=r.ledger;
    near(l.initial+l.input+(l.transferredIn||0)-(l.transferredOut||0)-l.ingested-l.exported,
      sum(Object.values(r.resources)), `${label} ${r.id}: independent regional ledger`);
    near(r.balanceError,0,`${label} ${r.id}: reported budget`);
    regionChecks++;
  }
}
const legacy=ecology(byLabel.get('legacy-paused-before-upgrade'));
const upgraded=ecology(byLabel.get('upgraded-paused'));
assert.equal(legacy.agents.length,upgraded.agents.length);
for(const old of legacy.agents) {
  const next=upgraded.agents.find(a=>a.id===old.id); assert.ok(next);
  for(const [key,value] of Object.entries(old)) assert.deepEqual(next[key],value,`${old.id}: old ${key}`);
}
for(const old of legacy.regions) {
  const next=upgraded.regions.find(r=>r.id===old.id); assert.ok(next);
  for(const key of ['timeSec','resources','counters','agentCount','alive']) assert.deepEqual(next[key],old[key]);
  for(const [key,value] of Object.entries(old.ledger)) assert.deepEqual(next.ledger[key],value);
  assert.deepEqual(next.ledger,old.ledger,'upgrade preserves the complete old ledger object');
  assert.equal(next.ledger.transferredIn??0,0); assert.equal(next.ledger.transferredOut??0,0);
}
const before=byLabel.get('normal-before'), after=byLabel.get('normal-after-paused');
assert.equal(before.speed,1); assert.equal(after.speed,1);
assert.equal(before.environment.foodSupply,0); assert.equal(after.environment.foodSupply,0);
const a=ecology(before), b=ecology(after);
assert.deepEqual(a.regions.map(r=>r.id).sort(),b.regions.map(r=>r.id).sort());
const flowIn=sum(b.regions.map(r=>r.ledger.transferredIn??0))-sum(a.regions.map(r=>r.ledger.transferredIn??0));
const flowOut=sum(b.regions.map(r=>r.ledger.transferredOut??0))-sum(a.regions.map(r=>r.ledger.transferredOut??0));
assert.ok(flowIn>0); near(flowIn,flowOut,'whole-window paired internal transfer');
const fed=b.agents.filter(next=> {
  if(!['green-chromis','yellowtail-fusilier','lyretail-anthias','reef-manta'].includes(next.speciesId)) return false;
  const old=a.agents.find(p=>p.id===next.id);
  return old && next.lastFeedAt!==null && next.lastFeedAt>(old.lastFeedAt??-1);
});
assert.ok(fed.length>0,'actual successful feeding histories advance alongside shared-pool arrivals');
function sameRegions(leftLabel,rightLabel,ids) {
  const left=ecology(byLabel.get(leftLabel)),right=ecology(byLabel.get(rightLabel));
  const selected=ids??left.regions.map(r=>r.id);
  for(const id of selected) {
    const l=left.regions.find(r=>r.id===id),r=right.regions.find(r=>r.id===id); assert.ok(l&&r,id);
    for(const key of regionFields) assert.deepEqual(r[key],l[key],`${leftLabel} → ${rightLabel} ${id} ${key}`);
    const agents=e=>e.agents.filter(a=>a.regionId===id).sort((x,y)=>x.id.localeCompare(y.id));
    assert.deepEqual(agents(right),agents(left),`${id}: full public animal records`);
  }
}
sameRegions('normal-after-paused','pause-after');
const zeroBefore=ecology(byLabel.get('zero-flow-before')),zeroAfter=ecology(byLabel.get('zero-flow-after-paused'));
assert.equal(byLabel.get('zero-flow-after-paused').environment.currentMps,0);
for(const r of zeroAfter.regions) {
  const old=zeroBefore.regions.find(p=>p.id===r.id); assert.ok(old);
  assert.equal(r.ledger.transferredIn,old.ledger.transferredIn);
  assert.equal(r.ledger.transferredOut,old.ledger.transferredOut);
  assert.equal(r.transport.lastImportedUnits,0);
  assert.equal(r.transport.lastTransferredOutUnits,0);
  assert.equal(r.transport.lastBoundaryExportedUnits,0);
}
const unloaded=ecology(byLabel.get('unloaded-away'));
const revisit=byLabel.get('revisit-after'), target=byLabel.get('unload-before').ocean.chunkId;
assert.ok(!unloaded.regions.some(r=>r.id===target),'named target really unloads');
assert.equal(revisit.ocean.chunkId,target);
sameRegions('unload-before','revisit-after',[target]);
sameRegions('refresh-before','refreshed-after');
assert.notEqual(byLabel.get('refresh-before').runId,byLabel.get('refreshed-after').runId);
const final=byLabel.get('final-running'); assert.equal(final.paused,false); assert.equal(final.speed,1);
assert.equal(ecology(final).metrics.planktonTransport.enabled,true);
const baseline=JSON.parse((await readFile(`${dir}plankton-transport-before-hashes.json`,'utf8')).replace(/^\uFEFF/,''));
const production=[];
async function walk(path) {
  for(const item of await readdir(path,{withFileTypes:true})) {
    const file=`${path}/${item.name}`;
    if(item.isDirectory()) await walk(file); else production.push({file,sha256:hash(await readFile(file))});
  }
}
await walk('src'); production.sort((a,b)=>a.file.localeCompare(b.file));
const changed=production.filter(p=>baseline.find(o=>o.file===p.file)?.sha256!==p.sha256).map(p=>p.file);
assert.deepEqual(changed.slice().sort(),['src/OceanApp.jsx','src/oceanEcology.js','src/oceanPlanktonTransport.js'].sort());
const focused=await readFile(`${dir}plankton-transport-focused-tests.tap`,'utf8');
const related=await readFile(`${dir}plankton-transport-related-tests.tap`,'utf8');
for(const log of [focused,related]) { assert.match(log,/# fail 0\b/); assert.match(log,/# pass \d+/); }
const build=await readFile(`${dir}plankton-transport-build.log`,'utf8'); assert.match(build,/built in/);
const report={status:'passed-bounded-reef-plankton-transport',recordedAt:new Date().toISOString(),
  receipts:receipts.length,regionChecks,legacyAnimalsPreserved:legacy.agents.length,
  normalObservationSec:b.regions[0].timeSec-a.regions.find(r=>r.id===b.regions[0].id).timeSec,
  actualWindowInternalTransferUnits:flowIn,actualUpdatedFeedingHistories:fed.length,
  zeroFlowVerified:true,pauseVerified:true,unloadRevisitTarget:target,refreshVerified:true,
  productionFiles:production.length,changedProductionFiles:changed,
  focusedTests:Number(focused.match(/# tests (\d+)/)[1]),relatedTests:Number(related.match(/# tests (\d+)/)[1]),
  productionBuild:true,receiptSha256:hash(bytes),limitations:[
    'Equal-area cells use normalized relative stocks, not measured concentrations or water volumes.',
    'Shared-face finite support probes and current proxies do not solve full hydrodynamics.',
    'Actual observations establish shared-pool arrivals and feeding; controlled tests isolate food origin causality.',
    'Unloaded state is frozen; missing downstream boundary outflow is exported from the loaded model.',
    'Window cumulative histories belong to currently loaded owners, not a permanent global ocean total.',
    'Eleven historical failures outside the related subset remain separately recorded.']};
await writeFile(`${dir}plankton-transport-source-hashes.json`,JSON.stringify(production,null,2));
await writeFile(`${dir}plankton-transport-validation.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
