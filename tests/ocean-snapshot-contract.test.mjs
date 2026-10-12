import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/world/ReefWorld.js',import.meta.url),'utf8');
const start=source.indexOf('  observationStateSnapshot('),end=source.indexOf('  async downloadScreenshot()',start);
const methods=new Function('return class {'+source.slice(start,end)+'}')().prototype;

test('actual World display call forwards light terrain while explicit exports default to full terrain',()=>{
  const options=[],point={toArray:()=>[0,0,0]};
  const fixture={observationStateSnapshot:methods.observationStateSnapshot,snapshot:methods.snapshot,emitSnapshot:methods.emitSnapshot,definition:{},isLivingShallows:false,isKelp:false,elapsed:2,environmentAssets:[],errors:[],
    frameTimingSnapshot:()=>({}),findAgent:()=>null,directorMotionSnapshot:()=>null,resourceInventorySnapshot:()=>null,
    oceanSnapshot:option=>{options.push(option);return {detailedTerrain:option.detailedTerrain};},
    sim:{agents:[],metrics:{},environment:{},events:[]},camera:{position:point},controls:{target:point},
    container:{clientWidth:1280,clientHeight:720},renderer:{getPixelRatio:()=>1,info:{render:{calls:0,triangles:0}}},
    oceanEcology:{snapshot:()=>({agents:[]})}};
  let display;fixture.onSnapshot=value=>{display=value;};
  fixture.emitSnapshot();
  assert.equal(display.ocean.detailedTerrain,false);
  assert.equal(fixture.snapshot().ocean.detailedTerrain,true);
  assert.deepEqual(options,[{detailedTerrain:false},{detailedTerrain:true}]);
});
