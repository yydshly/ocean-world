import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EXPERIENCE_GROUPS, EXPERIENCE_ENTRIES, experienceHref, currentExperience } from '../src/experienceNavigation.js';
import { initialLivingEntry } from '../src/initialLivingEntry.js';
import { DEMO_LIVING_STOPS, DEMO_KELP_STOPS, DEMO_DEEP_STOPS } from '../src/demoCapabilities.js';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
async function loadingComponents() {
  const result = await build({ stdin: {
    contents: "export { SceneLoading } from './src/SceneLoading.jsx'; export { ShallowSampleApp } from './src/ShallowSampleApp.jsx';",
    resolveDir: process.cwd(), loader: 'jsx',
  }, bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external',
  loader: { '.css': 'empty' }, logLevel: 'silent', define: {
    'import.meta.env': JSON.stringify({ BASE_URL: '/ocean-world/' }),
    'import.meta.url': JSON.stringify(new URL('../src/App.jsx', import.meta.url).href),
  } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'window', 'document', result.outputFiles[0].text)(
    require, module, module.exports,
    { location: new URL('https://example.org/ocean-world/?demo=shallow-journey&seed=55') }, { hidden: false });
  return module.exports;
}

test('the shared navigation distinguishes the three playback entries from existing exploration routes', () => {
  assert.deepEqual(EXPERIENCE_GROUPS.map(group => group.id), ['watch', 'explore']);
  assert.deepEqual(EXPERIENCE_GROUPS[0].entries.map(entry => entry.id), ['journey', 'school', 'sample']);
  assert.deepEqual(EXPERIENCE_GROUPS[1].entries.map(entry => entry.id), ['all', 'director', 'life', 'reef', 'meadow', 'kelp', 'deep']);
  for (const id of ['reef', 'meadow']) {
    const url = new URL(experienceHref(id), 'https://example.org');
    const stop = DEMO_LIVING_STOPS.find(entry => entry.id === initialLivingEntry(url.search));
    assert.ok(stop, `The ${id} shortcut must map to an existing living-world destination`);
  }
  assert.ok(DEMO_KELP_STOPS.some(entry => entry.id === 'kelp-bottom-life'));
  assert.ok(DEMO_DEEP_STOPS.some(entry => entry.id === 'deep-bottom-life'));
});

test('navigation keeps the seed while selecting only the destination-specific query parameters', () => {
  const previous = new URL('https://example.org/ocean-world/?demo=shallow-journey&seed=55&school=1&world=whole-seabed&chapter=16');
  const parameters = { base: previous.pathname, seed: previous.searchParams.get('seed') };
  const main = new URL(experienceHref('journey', parameters), previous);
  assert.deepEqual([...main.searchParams], [['demo', 'shallow-journey'], ['seed', '55']]);
  const director = new URL(experienceHref('director', parameters), previous);
  assert.deepEqual([...director.searchParams], [['demo', 'director'], ['seed', '55']]);
  const school = new URL(experienceHref('school', parameters), previous);
  assert.equal(school.searchParams.get('school'), '1');
  assert.equal(school.searchParams.has('world'), false);
  for (const id of ['life', 'reef', 'meadow']) {
    const destination = new URL(experienceHref(id, parameters), previous);
    assert.equal(destination.searchParams.get('world'), 'whole-seabed');
    assert.equal(destination.searchParams.has('school'), false);
  }
});

test('root and repository-prefixed builds share the same entry identity and encode saved seeds safely', () => {
  const seed = '55 & another=seed';
  for (const base of ['/', '/ocean-world', '/ocean-world/', '../']) {
    for (const entry of EXPERIENCE_ENTRIES) {
      const url = new URL(experienceHref(entry.id, { base, seed }), 'https://example.org/ocean-world/overview/');
      assert.equal(url.searchParams.get('seed'), seed);
      assert.equal(currentExperience(url.search), entry.id);
      assert.equal(url.searchParams.has('another'), false);
      assert.equal(url.pathname, base.startsWith('/ocean-world') || base === '../' ? '/ocean-world/' : '/');
    }
  }
  assert.equal(currentExperience('?demo=unknown'), null);
  assert.throws(() => experienceHref('unknown'), RangeError);
});

test('both applications expose navigation outside scene readiness and the focused viewer hiding rules', async () => {
  const read = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const [sample, ocean, menu, css, sampleCss] = await Promise.all([
    read('ShallowSampleApp.jsx'), read('OceanApp.jsx'), read('ExperienceNavigation.jsx'),
    read('experienceNavigation.css'), read('shallowSample.css'),
  ]);
  assert.ok(sample.indexOf('<ExperienceNavigation/>') < sample.indexOf('inert={!ready||!!error}'));
  assert.match(ocean, /<ExperienceNavigation research disabled=\{recording\}/);
  assert.doesNotMatch(menu, /worldReady|\bready\b|is-focused/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /aria-current=\{entry\.id === current \? 'page' : undefined\}/);
  assert.match(menu, /返回4分钟浅海主线/);
  assert.match(css, /max-height:calc\(100dvh - 145px\)/);
  for (const rule of sampleCss.split('}').filter(rule => rule.includes('.is-focused'))) {
    assert.doesNotMatch(rule, /experience-navigation/);
  }
});

test('actual initial download and error shells expose navigation, with one menu during shallow construction', async () => {
  const { SceneLoading, ShallowSampleApp } = await loadingComponents();
  for (const experience of ['journey', 'school', 'sample', 'world']) {
    for (const error of ['', '资源未能载入']) {
      const html = renderToStaticMarkup(React.createElement(SceneLoading, { experience, error }));
      assert.match(html, /更多体验/);
      assert.match(html, /<output id="scene-loading-diagnostics" hidden="">/);
      assert.equal((html.match(/class="experience-navigation(?: experience-navigation--research)?"/g) || []).length, 1);
      if (experience === 'world') assert.match(html, /返回4分钟浅海主线/);
      if (error) assert.match(html, /场景加载错误/);
    }
  }
  for (const journey of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(ShallowSampleApp, { journey }));
    assert.match(html, /场景加载/);
    assert.match(html, /inert=""/);
    assert.equal((html.match(/class="experience-navigation"/g) || []).length, 1,
      'The building scene has its own outer menu; its loading overlay must not add a second one');
    assert.ok(html.indexOf('class="experience-navigation"') < html.indexOf('inert=""'));
  }
  const [navigationCss, loadingCss] = await Promise.all([
    fs.readFile(new URL('../src/experienceNavigation.css', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/sceneLoading.css', import.meta.url), 'utf8'),
  ]);
  const layer = css => Number(css.match(/z-index:(\d+)/)[1]);
  assert.ok(layer(navigationCss) > layer(loadingCss), 'The actual full-screen loading overlay must not cover the menu');
});

test('the published guide shares entry URLs and exposes the previously missing capability overview', async () => {
  const [build, guide, overview] = await Promise.all([
    fs.readFile(new URL('../scripts/build-product-overview.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/overview/index.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/DemoOverview.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(build, /experienceHref\(item\.id,\{base:app,seed:'55'\}\)/);
  for (const entry of EXPERIENCE_ENTRIES) {
    assert.ok(guide.includes(experienceHref(entry.id, { base: '../' }).replaceAll('&', '&amp;')),
      `Published guide must contain ${entry.id}`);
  }
  assert.match(guide, /研究与范围探索/);
  assert.match(guide, /更多体验/);
  assert.doesNotMatch(overview, /约\s*8\s*分钟/);
  assert.match(overview, /67个观察章节/);
});
