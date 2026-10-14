import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { DIRECTOR_STEPS } from '../src/directorTour.js';
import { EXPERIENCE_ENTRIES, experienceHref } from '../src/experienceNavigation.js';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { PassThrough } from 'node:stream';
import { shallowNarrationTimeline } from '../src/shallowNarrationTimeline.js';

const guidePages = ['overview/index.html', 'overview/poster.html', 'overview/evidence/review.html', 'overview/stage-04/index.html', 'overview/stage-05/index.html', 'overview/stage-06/index.html', 'overview/stage-07/index.html', 'overview/roadmap/index.html', 'overview/project-map/index.html', 'overview/project-map/poster.html'];
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
  assert.ok(urls.some(search => {
    const params = new URLSearchParams(search);
    return params.get('demo') === 'shallow-journey' && params.get('school') === '1';
  }), 'Guide omits the actual sixty-second schooling entry');
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
    if (demo === 'shallow-journey') {
      assert.match(html,/<audio[^>]+preload="none"[^>]+aria-label="浅海中文旁白"/,search);
      assert.match(html,/开启讲解/,search);
      assert.match(html,/讲解音量/,search);
      assert.match(html,/&quot;enabled&quot;:false/,`${search}: speech must be opt-in`);
    }
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

test('homepage index exposes every published HTML page, experience and archive document without escaping either mount', () => {
  const map = JSON.parse(fs.readFileSync('public/overview/site-map.json', 'utf8'));
  const inventory = JSON.parse(fs.readFileSync('public/overview/inventory.json', 'utf8'));
  assert.deepEqual(inventory.siteMap, map, 'homepage inventory and downloadable entry index disagree');
  const groups = new Map(map.groups.map(group => [group.id, group.entries]));
  assert.equal(groups.size, map.groups.length, 'duplicate entry groups');
  const entries = map.groups.flatMap(group => {
    for (const entry of group.entries) assert.equal(entry.category, group.id, entry.id);
    return group.entries;
  });
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length, 'duplicate entry identities');
  assert.equal(map.counts.indexCards, entries.length);
  assert.equal(map.counts.mainEntries, groups.get('main').length);
  assert.equal(map.counts.topicEntries, groups.get('topics').length);
  assert.deepEqual(groups.get('main').map(entry => entry.href), EXPERIENCE_ENTRIES.map(entry => experienceHref(entry.id, {base:'../', seed:'55'})),
    'homepage omitted or changed a preserved application entry');
  const experienceUrls = [...groups.get('main'), ...groups.get('topics')].map(entry => new URL(entry.href, 'https://example.test/ocean-world/overview/').href);
  assert.equal(map.counts.distinctExperienceUrls, new Set(experienceUrls).size);
  const publicHtml = fs.readdirSync('public', {recursive:true}).filter(file => file.endsWith('.html') && fs.statSync(path.join('public', file)).isFile())
    .map(file => file.replaceAll('\\', '/')).sort();
  assert.deepEqual(groups.get('pages').map(entry => entry.file).sort(), publicHtml,
    'a copied public webpage is missing from the homepage');
  assert.equal(map.counts.publicHtmlPages, publicHtml.length);
  for (const [directory, count] of [['stages', 'stageDocuments'], ['releases', 'releaseDocuments']]) {
    const documents = fs.readdirSync(`docs/${directory}`).filter(file => file.endsWith('.md')).map(file => `docs/${directory}/${file}`).sort();
    assert.deepEqual(entries.filter(entry => entry.file?.startsWith(`docs/${directory}/`)).map(entry => entry.file).sort(), documents,
      `homepage omitted a ${directory} document`);
    assert.equal(map.counts[count], documents.length);
  }
  const homepage = fs.readFileSync('public/overview/index.html', 'utf8');
  const cards = [...homepage.matchAll(/<article\b[^>]*\bdata-page-card\b[^>]*>([\s\S]*?)<\/article>/g)];
  assert.equal(cards.length, entries.length, 'downloadable index entries are not all displayed on the homepage');
  const displayedHrefs = cards.map(([, html]) => html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&')).sort();
  assert.deepEqual(displayedHrefs, entries.map(entry => entry.href).sort());
  for (const mount of ['/ocean-world/', '/']) {
    const base = new URL(mount, 'https://example.test');
    for (const entry of entries) {
      const url = new URL(entry.href, new URL('overview/', base));
      assert.ok(!['localhost', '127.0.0.1'].includes(url.hostname), `Local-only index link: ${entry.href}`);
      if (url.origin !== base.origin) {
        assert.equal(url.origin, 'https://github.com', entry.href);
        if (entry.file) {
          assert.equal(decodeURIComponent(url.pathname), `/yydshly/ocean-world/blob/main/${entry.file}`, entry.href);
          assert.ok(fs.statSync(entry.file).isFile(), `Missing linked document: ${entry.file}`);
        } else assert.equal(url.pathname, '/yydshly/ocean-world', entry.href);
        continue;
      }
      assert.ok(url.pathname.startsWith(mount), `Index escaped mount: ${entry.href}`);
      const relative = decodeURIComponent(url.pathname.slice(mount.length));
      if (!relative) {
        assert.ok(url.searchParams.has('demo'), `Index lacks a specific experience: ${entry.href}`);
        continue;
      }
      assert.equal(relative, entry.file, `Index points to a different webpage: ${entry.href}`);
      assert.ok(fs.statSync(path.join('public', relative)).isFile(), `Missing indexed page: ${relative}`);
    }
  }
});

test('new README overview image is visible outside history and matches its actual poster and archived screenshot sources', () => {
  const folder = 'public/overview/project-map';
  const provenance = JSON.parse(fs.readFileSync(`${folder}/provenance.json`, 'utf8'));
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  const image = fs.readFileSync(path.join(folder, provenance.image.file));
  assert.equal(image.readUInt16BE(0), 0xffd8, 'README overview must be the actual JPEG capture');
  assert.equal(path.extname(provenance.image.file), '.jpg');
  assert.deepEqual(imageSize(image, provenance.image.file), [provenance.image.width, provenance.image.height]);
  assert.deepEqual([provenance.image.width, provenance.image.height], [1600, 3884]);
  assert.equal(sha256(image), provenance.image.sha256, 'poster raster changed without updating its capture evidence');
  assert.equal(provenance.source.file, 'poster.html');
  const source = fs.readFileSync(path.join(folder, provenance.source.file));
  assert.equal(sha256(source), provenance.source.sha256, 'poster source changed after the actual raster capture');
  const references = [...source.toString().matchAll(/(?:src="([^"]+)"|url\(['"]?([^)'"\s]+))/g)]
    .map(match => new URL(match[1] || match[2], 'https://example.test/overview/project-map/poster.html'))
    .filter(url => url.origin === 'https://example.test')
    .map(url => decodeURIComponent(url.pathname.slice(1)));
  assert.deepEqual([...new Set(references)].sort(), provenance.screenshots.map(frame => frame.file).sort(),
    'poster image backgrounds are not the documented project screenshots');
  for (const frame of [...provenance.screenshots, provenance.historicalImage]) {
    assert.equal(sha256(fs.readFileSync(path.join('public', frame.file))), frame.sha256,
      `archived guide image changed: ${frame.file}`);
  }
  const readme = fs.readFileSync('README.md', 'utf8');
  const currentImage = `public/overview/project-map/${provenance.image.file}`;
  const imagePosition = readme.indexOf(currentImage);
  assert.ok(imagePosition >= 0 && imagePosition < readme.indexOf('<details'), 'new project image is hidden inside historical details');
  assert.ok([...readme.matchAll(/<details\b[^>]*>[\s\S]*?<\/details>/g)].some(([section]) => section.includes(`public/${provenance.historicalImage.file}`)),
    'README no longer retains the historical guide image');
});

test('README points readers to the deployed guide, primary journey and stage evidence', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  const links = [...readme.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map(match => new URL(match[1]));
  assert.ok(links.some(url => url.pathname.endsWith('/ocean-world/overview/')), 'README lacks the published guide');
  assert.ok(links.some(url => url.searchParams.get('demo') === 'shallow-journey'), 'README lacks the primary four-minute entry');
  assert.ok(links.some(url => url.pathname.endsWith('/ocean-world/overview/stage-04/')), 'README lacks the published Stage04 evidence');
  assert.ok(links.some(url => url.searchParams.get('demo') === 'shallow-journey' && url.searchParams.get('school') === '1'), 'README lacks the sixty-second schooling entry');
  assert.ok(links.some(url => url.pathname.endsWith('/ocean-world/overview/stage-05/')), 'README lacks the published Stage05 evidence');
  assert.ok(links.some(url => url.searchParams.get('demo') === 'ocean-primer'), 'README lacks the published ocean primer');
  assert.ok(links.some(url => url.pathname.endsWith('/ocean-world/overview/roadmap/')), 'README lacks the future expansion roadmap');
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
  assert.deepEqual(guide.historicalHabitatStage, stage, 'overview changed the archived habitat evidence');
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

test('current school guide separates new narration from archived local playback and retains portable observation entries', () => {
  const guide = JSON.parse(fs.readFileSync('public/overview/inventory.json', 'utf8'));
  const stage = JSON.parse(fs.readFileSync('public/overview/stage-05/summary.json', 'utf8'));
  assert.deepEqual(guide.currentStage, stage, 'overview and school evidence disagree about the current stage');
  assert.equal(stage.stage, '05');
  assert.deepEqual(stage.population, {animals:293,categories:38,coordinated:38,unchangedOtherAnimals:255});
  assert.equal(stage.route.seconds, 240);assert.equal(stage.route.all961PositionsUnchanged, true);
  assert.deepEqual(stage.phases.map(phase => phase.slice(1)), [[0,8],[8,28],[28,36],[36,46],[46,60]]);
  assert.equal(stage.narration.schoolClips, shallowNarrationTimeline({schoolingOnly:true}).clips.length);
  assert.equal(stage.narration.journeyClips, shallowNarrationTimeline().clips.length);
  assert.equal(stage.narration.defaultEnabled, false);
  assert.equal(stage.narration.newAudioIncludedInLocalBaseline, false, 'the old local playback did not verify this new narration');
  const archived = JSON.parse(fs.readFileSync('docs/validation/stage-05-schooling-20261013.json','utf8'));
  assert.deepEqual(JSON.parse(fs.readFileSync('public/overview/stage-05/local-summary.json','utf8')), archived,
    'publication must retain the original local evidence exactly');
  assert.equal(stage.screenshots.files.length, 4);
  const phases = new Set();
  for (const frame of stage.screenshots.files) {
    assert.ok(Number.isFinite(frame.time) && frame.time >= 0 && frame.time <= 60);
    assert.deepEqual(imageSize(fs.readFileSync(`public/overview/stage-05/${frame.file}`), frame.file),stage.screenshots.viewport,
      `Incorrect school screenshot dimensions: ${frame.file}`);
    phases.add(frame.phase);
  }
  assert.equal(phases.size, 4, 'the guide needs four distinct observed behaviours, rather than duplicate frames');
  const schoolUrl = new URL(guide.links.school, 'https://example.test/ocean-world/overview/');
  assert.equal(schoolUrl.pathname, '/ocean-world/');assert.equal(schoolUrl.searchParams.get('demo'), 'shallow-journey');
  assert.equal(schoolUrl.searchParams.get('school'), '1');assert.equal(schoolUrl.searchParams.get('seed'), '55');
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
  for (const file of ['index.html', 'atlas.css', 'inventory.json', 'site-map.json', 'ocean-world-product-atlas.png', 'evidence/stage.json', 'images/reef.png']) {
    assert.deepEqual(fs.readFileSync(`${root}/overview/${file}`), fs.readFileSync(`public/overview/${file}`));
  }
  for (const folder of ['overview/stage-04','overview/stage-05','overview/stage-06','overview/stage-07','overview/roadmap','overview/project-map','audio/ocean-primer','audio/shallow-schooling','audio/shallow-journey']) {
    const sourceRoot = path.join('public',folder);
    for (const file of fs.readdirSync(sourceRoot, {recursive:true})) {
      if (!fs.statSync(path.join(sourceRoot, file)).isFile()) continue;
      assert.deepEqual(fs.readFileSync(path.join(root,folder,file)), fs.readFileSync(path.join(sourceRoot,file)), `Published media/evidence was not shipped: ${folder}/${file}`);
    }
  }
  assert.deepEqual(fs.readFileSync(`${root}/overview/stage-07-publication.json`), fs.readFileSync('public/overview/stage-07-publication.json'));
  const files = fs.readdirSync(`${root}/assets`);
  assert.ok(files.some(f => /^ShallowSampleApp-.*\.js$/.test(f)));
  assert.ok(files.some(f => /^oceanPreparation\.worker-.*\.js$/.test(f)));
  assert.ok(files.some(f => /^oceanTerrain\.worker-.*\.js$/.test(f)));
});
