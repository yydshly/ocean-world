import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const captureSource=(await readFile('src/capture.js','utf8'))
  .replace(/export const localCaptureEnabled=.*;\r?\n/, 'const localCaptureEnabled=false;\n')
  .replaceAll('export ', '');
const worldSource=await readFile('src/world/ReefWorld.js','utf8');
const methodStart=worldSource.indexOf('  async downloadScreenshot()');
const nextMethod=/\n  (?:async )?[A-Za-z_]\w*\(/.exec(worldSource.slice(methodStart+2));
const screenshotMethod=worldSource.slice(methodStart,methodStart+2+nextMethod.index);

function fixture({encoded=true,clickFails=false}={}){
  const calls=[],blob=new Blob(['png-encoded-frame'],{type:'image/png'});
  const a={click(){calls.push(['click',this.href,this.download]);if(clickFails)throw new Error('download refused');},remove(){calls.push(['remove']);}};
  const context=vm.createContext({Blob,Date,Promise,setTimeout(fn){calls.push(['scheduled-revoke']);fn();},
    URL:{createObjectURL(value){calls.push(['blob',value]);return 'blob:test-frame';},revokeObjectURL(value){calls.push(['revoke',value]);}},
    document:{createElement(){return a;},body:{appendChild(value){assert.equal(value,a);calls.push(['append']);}}}});
  vm.runInContext(captureSource+'\nthis.ScreenshotWorld=class {'+screenshotMethod+'};',context);
  const world=new context.ScreenshotWorld();world.biomeId='kelp';world.scene={};world.camera={};
  world.renderer={render(){calls.push(['render']);},domElement:{
    toDataURL(){assert.fail('published screenshot should use a downloadable Blob');},
    toBlob(done,type){assert.equal(type,'image/png');calls.push(['encode']);done(encoded?blob:null);}}};
  return {world,calls,blob};
}

test('published screenshot renders and encodes the current frame before requesting a PNG download',async()=>{
  const {world,calls,blob}=fixture();const name=await world.downloadScreenshot();
  assert.match(name,/^kelp-\d+\.png$/);
  assert.deepEqual(calls.map(row=>row[0]),['render','encode','blob','append','click','remove','scheduled-revoke','revoke']);
  assert.equal(calls.find(row=>row[0]==='blob')[1],blob);
  assert.equal(calls.find(row=>row[0]==='click')[1],'blob:test-frame');
  assert.equal(calls.find(row=>row[0]==='click')[2],name);
});

test('failed screenshot encoding reports failure without requesting an empty download',async()=>{
  const {world,calls}=fixture({encoded:false});await assert.rejects(world.downloadScreenshot(),/截图编码失败/);
  assert.deepEqual(calls.map(row=>row[0]),['render','encode']);
});

test('a rejected browser download still removes its temporary link and releases the image URL',async()=>{
  const {world,calls}=fixture({clickFails:true});await assert.rejects(world.downloadScreenshot(),/download refused/);
  assert.deepEqual(calls.slice(-3).map(row=>row[0]),['remove','scheduled-revoke','revoke']);
});
