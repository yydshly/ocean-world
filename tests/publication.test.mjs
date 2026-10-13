import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { DIRECTOR_STEPS } from '../src/directorTour.js';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { PassThrough } from 'node:stream';

const guidePages = ['overview/index.html', 'overview/poster.html', 'overview/evidence/review.html', 'overview/stage-04/index.html'];
const require = createRequire(import.meta.url);
// The browser-only loading store has no server snapshot. Supply its current
// snapshot for this shell check, retaining App's actual lazy route selection.
const shellReact = {...React, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot()};
const renderShell = element => new Promise((resolve, reject) => {
  const sink = new PassThrough(); let html = '';
  sink.on('data', chunk => { html += chunk.toString(); });
  sink.on('end', () => resolve(html)); sink.on('error', reject);
  const stream = renderToPipeableStream(element, {
    onAllReady: () => stream.pipe(sink), onError: reject,
  });
});
function imageSize(bytes, file) {
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
    assert.equal(path.extname(file), '.png', `PNG extension: ${file}`);
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  assert.equal(bytes.readUInt16BE(0), 0xffd8, `PNG or JPEG required: ${file}`);
  assert.match(path.extname(file), /^\.jpe?g$/, `JPEG extension: ${file}`);
  for (let offset = 2; offset < bytes.length;) {
    assert.equal(bytes[offset++], 0xff, `JPEG marker: ${file}`);
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = bytes.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= bytes.length, `JPEG segment: ${file}`);
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    }
    offset += length;
  }
  assert.fail(`JPEG dimensions missing: ${file}`);
}

test('every published world entry renders its initial shell before the first world snapshot', async () => {
  const result = await build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'cjs',platform:'node',
    packages:'external',loader:{'.css':'empty'},logLevel:'silent',define:{
      'import.meta.env':JSON.stringify({BASE_URL:'/ocean-world/'}),
      'import.meta.url':JSON.stringify(new URL('../src/App.jsx',import.meta.url).href),
    }});
  const urls = [...new Set([...fs.readFileSync('public/overview/index.html','utf8').matchAll(/href="([^"]*\?demo=[^"]+)"/g)]
    .map(match => new URL(match[1].replaceAll('&amp;','&'),'https://example.test/ocean-world/overview/').search))];
  assert.ok(urls.length >= 18);
  for (const demo of ['shallow-sample', 'shallow-journey']) assert.ok(urls.some(search => new URLSearchParams(search).get('demo') === demo), `Guide omits ${demo}`);
  urls.push('?demo=shallow-journey&seed=55&school=1');
  for (const search of urls) {
    const module={exports:{}},storage={getItem:()=>null,setItem:()=>{}};
    new Function('require','module','exports','window','localStorage','document',result.outputFiles[0].text)(
      name => name === 'react' ? shellReact : require(name),module,module.exports,{location:new URL(search,'https://example.test/ocean-world/')},storage,{hidden:false});
    const html=await renderShell(React.createElement(module.exports.App));
    assert.match(html,/TIDAL/,search);
    assert.match(html,/产品导览/,search);
    const demo = new URLSearchParams(search).get('demo');
    if (demo === 'shallow-journey' && new URLSearchParams(search).get('school') === '1'){
      assert.match(html,/乌尾鮗协同观察 · 连续60秒/,search);
      assert.match(html,/aria-label="鱼群协同阶段"/,search);
      assert.match(html,/观看完整4分钟/,search);
    }else if (demo === 'shallow-journey') assert.match(html,/三个完整栖息地 · 4分钟/,search);
    else if (demo === 'shallow-sample') assert.match(html,/浅海样板 · 连续巡游 75 秒/,search);
    else assert.doesNotMatch(html,/class="sample-title"/,search);
  }
});

test('published guide uses portable entries and ships every local page/image/evidence link', () => {
  for (const mount of ['/ocean-world/', '/']) {
    const base = new URL(mount, 'https://example.test');
    for (const page of guidePages) {
      const html = fs.readFileSync(path.join('public', page), 'utf8');
      assert.doesNotMatch(html, /https?:\/\/(?:127\.0\.0\.1|localhost)/);
      for (const [, raw] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const url = new URL(raw.replaceAll('&amp;', '&'), new URL(page, base));
        if (url.origin !== base.origin) continue;
        assert.ok(url.pathname.startsWith(mount), `Escaped mount: ${raw}`);
        const relative = decodeURIComponent(url.pathname.slice(mount.length));
        if (relative === '') continue; // Vite's application entry with query parameters.
        assert.ok(fs.existsSync(path.join('public', relative)), `Missing ${page} → ${relative}`);
      }
    }
  }
});

test('README points readers to the deployed guide, primary journey and stage evidence', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  const links = [...readme.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map(match => new URL(match[1]));
  assert.ok(links.some(url => url.pathname.endsWith('/ocean-world/overview/')), 'README lacks the published guide');
  assert.ok(links.some(url => url.searchParams.get('demo') === 'shallow-journey'), 'README lacks the primary four-minute entry');
  assert.ok(links.some(url => url.pathname.endsWith('/ocean-world/overview/stage-04/')), 'README lacks the published Stage04 evidence');
  assert.ok(links.every(url => !['localhost', '127.0.0.1'].includes(url.hostname)), 'README sends readers to a local preview');
});

test('published counts and the complete catalogue agree with the shipped product', () => {
  const guide = JSON.parse(fs.readFileSync('public/overview/inventory.json', 'utf8'));
  const catalogs = [livingShallowsSpeciesCatalog, sceneCatalogs.kelp, sceneCatalogs.deep];
  assert.deepEqual(guide.catalogs.map(c => c.count), catalogs.map(c => c.length));
  for (let i = 0; i < catalogs.length; i++) assert.deepEqual(guide.catalogs[i].entries.map(s => s.id), catalogs[i].map(s => s.id));
  assert.equal(guide.director.chapters, DIRECTOR_STEPS.length);
  assert.equal(guide.director.nominalSeconds, DIRECTOR_STEPS.reduce((n, s) => n + s.durationMs, 0) / 1000);
  assert.equal(guide.validation.counts.animals, 293);
  assert.equal(guide.validation.counts.displayClasses, 38);
  const stage = JSON.parse(fs.readFileSync('public/overview/stage-04/summary.json', 'utf8'));
  assert.deepEqual(guide.currentStage, stage, 'overview and evidence disagree about the current stage');
  assert.equal(stage.route.durationSeconds, 240);
  assert.equal(stage.population.individuals, 293);
  assert.equal(stage.population.displayCategories, 38);
  assert.deepEqual(stage.screenshots.times, [24, 96, 144, 168, 192]);
  assert.deepEqual(stage.screenshots.files.map(frame => frame.time), stage.screenshots.times);
  for (const frame of stage.screenshots.files) for (const phase of ['before', 'after']) {
    const file = frame[phase];
    assert.match(file, new RegExp(`^${phase}-${frame.time}\\.(png|jpe?g)$`));
    assert.deepEqual(imageSize(fs.readFileSync(`public/overview/stage-04/${file}`), file), stage.screenshots.viewport, `Incorrect evidence dimensions ${file}`);
  }
  assert.ok(fs.statSync('public/overview/ocean-world-product-atlas.png').size > 100000);
});

test('production output includes the guide, query application and prefixed workers/assets', () => {
  const root = 'dist/client';
  const html = fs.readFileSync(`${root}/index.html`, 'utf8');
  const expectedBase = process.env.VITE_BASE_PATH || '/ocean-world/';
  for (const [, src] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!src.includes('/assets/')) continue;
    assert.ok(src.startsWith(expectedBase), `Incorrect build base: ${src}`);
    assert.ok(fs.existsSync(path.join(root, src.slice(expectedBase.length))));
  }
  for (const file of ['index.html', 'atlas.css', 'inventory.json', 'ocean-world-product-atlas.png', 'evidence/stage.json', 'images/reef.png']) {
    assert.deepEqual(fs.readFileSync(`${root}/overview/${file}`), fs.readFileSync(`public/overview/${file}`));
  }
  const stageRoot = 'public/overview/stage-04';
  for (const file of fs.readdirSync(stageRoot, {recursive:true})) {
    if (!fs.statSync(path.join(stageRoot, file)).isFile()) continue;
    assert.deepEqual(fs.readFileSync(path.join(root, 'overview/stage-04', file)), fs.readFileSync(path.join(stageRoot, file)), `Stage04 file was not shipped: ${file}`);
  }
  const files = fs.readdirSync(`${root}/assets`);
  assert.ok(files.some(f => /^ShallowSampleApp-.*\.js$/.test(f)));
  assert.ok(files.some(f => /^oceanPreparation\.worker-.*\.js$/.test(f)));
  assert.ok(files.some(f => /^oceanTerrain\.worker-.*\.js$/.test(f)));
});
