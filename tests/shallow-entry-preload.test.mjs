import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {compressedModelDataPlugin} from '../scripts/compressed-model-data.mjs';
import shallowGeometryManifest from '../src/world/shallowGeometryManifest.js';
import {loadPreparedShallowGeometry} from '../src/world/preparedShallowGeometry.js';

const bundle = {
  near: {type:'asset',fileName:'assets/shallowNearCommunityData-hash.bin'},
  fish: {type:'asset',fileName:'assets/shallowOpenCommunityData-hash.bin'},
  app: {type:'chunk',fileName:'assets/ShallowSampleApp-hash.js'},
  style: {type:'asset',fileName:'assets/shallow-style.css'},
};

function runHints(base,search,assets=bundle) {
  const plugin=compressedModelDataPlugin();plugin.configResolved({base});
  const tags=plugin.transformIndexHtml.handler('',{bundle:assets}),links=[];
  for(const tag of tags){
    assert.equal(tag.tag,'script');assert.equal(tag.injectTo,'head-prepend');
    runInNewContext(tag.children,{URLSearchParams,location:{search},document:{
      createElement(name){assert.equal(name,'link');return {};},
      head:{appendChild(link){links.push(link);}},
    }});
  }
  return links;
}

for(const base of ['/','/ocean-world/','./','https://example.test/sea/'])
test(`both shallow entries start the same anonymous model fetch preloads at ${base}`,()=>{
  const staticUrl=`${base}assets/${shallowGeometryManifest.transport?.file ?? shallowGeometryManifest.file}?v=${shallowGeometryManifest.sha256.slice(0,16)}`;
  const expected=[staticUrl,...Object.values(bundle).filter(row=>row.fileName.endsWith('.bin')).map(row=>base+row.fileName)].map(href=>({
    rel:'preload',as:'fetch',crossOrigin:'anonymous',href,
  }));
  for(const demo of ['shallow-sample','shallow-journey']){
    assert.deepEqual(runHints(base,`?seed=55&demo=${demo}`),expected);
  }
});

test('other entrances do not start shallow downloads and builds without model data add no hints',()=>{
  for(const search of ['','?demo=director','?demo=life-expedition','?demo=all','?demo=shallow-journey-extra','?demo=reef-valley-region']){
    assert.deepEqual(runHints('/ocean-world/',search),[]);
  }
  assert.deepEqual(runHints('/ocean-world/','?demo=shallow-journey',{}),[]);
});

test('the first geometry preload matches the real later runtime fetch including its content version',async()=>{
  for(const base of ['/','/ocean-world/','./','https://example.test/sea/']){
    let requested;
    await assert.rejects(loadPreparedShallowGeometry({base,fetcher:async url=>{
      requested=url;return {ok:false};
    }}),/Prepared reef buffers unavailable/);
    const first=runHints(base,'?demo=shallow-journey')[0];
    assert.equal(first.href,requested);
    assert.equal(first.as,'fetch');assert.equal(first.crossOrigin,'anonymous');
  }
});
