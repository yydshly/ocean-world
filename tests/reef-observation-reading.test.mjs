import test from 'node:test';
import assert from 'node:assert/strict';
import { reefObservationReading as read } from '../src/reefObservationReading.js';

const snapshot = Object.freeze({biomeId:'reef',paused:false,environment:Object.freeze({currentMps:.15}),metrics:Object.freeze({timeSec:20,algae:.7,plankton:0,detritus:.4})});
const agent = (speciesId,state,extra={}) => Object.freeze({speciesId,state,alive:true,lastFeedAt:null,...extra});

test('zero food and a grazing or schooling state do not claim successful intake',()=>{
  const school=read(agent('green-chromis','schooling'),snapshot);
  assert.match(school.explanation,/不等于每次摄食成功/);
  assert.match(school.context,/全礁共享浮游食物参考量 0.00/);
  assert.match(school.context,/尚无有效采食记录/);
  const grazer=read(agent('lined-tang','grazing'),{...snapshot,metrics:{...snapshot.metrics,algae:0}});
  assert.match(grazer.explanation,/不保证每次/);
  assert.doesNotMatch(read(agent('lined-tang','foraging',{energy:.95}),snapshot).explanation,/浮游/);
});
test('feeding history uses simulation time, accepts a real zero timestamp, and rejects future records',()=>{
  assert.match(read(agent('black-cucumber','deposit-feeding',{lastFeedAt:0}),snapshot).context,/20模拟秒前/);
  assert.match(read(agent('black-cucumber','deposit-feeding',{lastFeedAt:21}),snapshot).context,/尚无有效/);
  const paused={...snapshot,paused:true};
  assert.match(read(agent('black-cucumber','deposit-feeding',{lastFeedAt:12}),paused).context,/8模拟秒前.*模拟暂停/);
});
test('cleaning is not algae feeding, and shrimp hiding is not attributed to nighttime',()=>{
  for(const id of ['cleaner-wrasse','cleaner-shrimp']) {
    const reading=read(agent(id,'cleaning'),snapshot);
    assert.match(reading.explanation,/客户.*寄生/);
    assert.doesNotMatch(reading.context,/上次记录采食/);
  }
  assert.match(read(agent('cleaner-shrimp','hiding'),snapshot).explanation,/捕食者/);
  assert.doesNotMatch(read(agent('cleaner-shrimp','hiding'),snapshot).explanation,/日照/);
  assert.match(read(agent('green-chromis','fleeing'),snapshot).explanation,/短暂延续/);
});
test('global resources, tiny positive amounts, death and unsupported scenes preserve their meaning',()=>{
  assert.match(read(agent('black-cucumber','deposit-feeding'),snapshot).explanation,/没有局部食物斑块寻路/);
  assert.match(read(agent('black-cucumber','deposit-feeding'),{...snapshot,metrics:{...snapshot.metrics,detritus:.0004}}).context,/4.0e-4/);
  const dead=read(agent('green-chromis','dead',{alive:false}),snapshot);
  assert.match(dead.explanation,/不能确定死亡原因/);
  assert.equal(dead.experiment,null);
  assert.equal(read(agent('blue-tang','foraging'),snapshot),null);
  assert.equal(read(agent('green-chromis','schooling'),{...snapshot,biomeId:'kelp'}),null);
  assert.equal(read(null,snapshot),null);
});
