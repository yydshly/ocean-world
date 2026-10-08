import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OceanEcology } from '../src/oceanEcology.js';
import { createLivingShallowsGenerator } from '../src/livingShallowsGeneration.js';
import { createLivingRidgeGenerator } from '../src/livingRidgeGeology.js';
import { livingShallowsSeed, LIVING_SHALLOWS_PROFILE } from '../src/livingShallows.js';
import { DIRECTOR_STEPS } from '../src/directorTour.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function closingParenthesis(source, opening) {
  let depth=1,quote=null,escaped=false;
  for(let i=opening+1;i<source.length;i++) {
    const c=source[i];
    if(quote) { if(escaped) escaped=false;else if(c==='\\') escaped=true;else if(c===quote) quote=null;continue; }
    if(c==="'"||c==='"'||c==='`') { quote=c;continue; }
    if(c==='(') depth++;else if(c===')'&&--depth===0) return i;
  }
  throw Error('Unclosed shipped expression');
}
function options(living,generator) {
  const source=read('src/world/ReefWorld.js'),start=source.indexOf('new OceanEcology(seed,this.oceanChunks.generator,'),opening=source.indexOf('(',start);
  assert.ok(start>=0);
  class Capture { constructor(seed,generator,options) { this.options=options; } }
  return new Function('OceanEcology','seed',`return ${source.slice(start,closingParenthesis(source,opening)+1)};`)
    .call({isLivingShallows:living,oceanChunks:{generator}},Capture,livingShallowsSeed('56')).options;
}

test('shipped living-shallows constructor enables the meadow community and reset retains the authorized recipe', async () => {
  const seed=livingShallowsSeed('56'),g=createLivingRidgeGenerator(createLivingShallowsGenerator(seed));
  const store={load:async()=>null,save:async()=>{},saveMany:async()=>{},clear:async()=>{}};
  for(const living of [true,false]) {
    const shipped=options(living,g);assert.equal(shipped.meadowHabitatCommunity,living);
    const m=new OceanEcology(seed,g,{...shipped,store});
    try {
      assert.equal(m.meadowHabitatCommunityEnabled,living);assert.equal(m._active.size,0);
      await m.reset(seed,g);assert.equal(m.meadowHabitatCommunityEnabled,living);
    } finally { await m.dispose(); }
  }
  const missing=new OceanEcology(seed,g,{store,meadowHabitatCommunity:true});
  try { assert.equal(missing.meadowHabitatCommunityEnabled,false); } finally { await missing.dispose(); }
});

test('actual URL selection retains the explicit new world and the existing moving meadow director chapter', () => {
  const app=read('src/OceanApp.jsx'),prefix='const [pendingDemo,setPendingDemo]=useState(',start=app.indexOf(prefix),opening=start+prefix.length-1;
  assert.ok(start>=0);
  const select=new Function('window','localStorage','URLSearchParams','LIVING_SHALLOWS_PROFILE',`return (${app.slice(opening+1,closingParenthesis(app,opening))});`);
  const selected=select({location:{search:'?demo=seagrass-meadow-region&seed=56'}},{getItem:()=>null},URLSearchParams,LIVING_SHALLOWS_PROFILE)();
  assert.equal(selected.seagrassMeadowRegionEntry,true);assert.equal(selected.profile,LIVING_SHALLOWS_PROFILE);
  const seedPrefix='const livingSeedRef=useRef(',seedStart=app.indexOf(seedPrefix),seedOpening=seedStart+seedPrefix.length-1;
  assert.ok(seedStart>=0);
  const chooseSeed=new Function('window','URLSearchParams','loadLivingInputSeed',`return (${app.slice(seedOpening+1,closingParenthesis(app,seedOpening))});`);
  assert.equal(chooseSeed({location:{search:'?demo=seagrass-meadow-region&seed=56'}},URLSearchParams,()=> 'old-world'),'56');
  const chapter=DIRECTOR_STEPS.find(s=>s.id==='seagrass-meadow-region');
  assert.ok(chapter);assert.equal(chapter.motion.routeId,'seagrass-meadow-region');assert.equal(chapter.motion.durationSec,200);
});
