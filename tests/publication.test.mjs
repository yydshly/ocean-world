import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { livingShallowsSpeciesCatalog, sceneCatalogs } from '../src/sceneCatalog.js';
import { DIRECTOR_STEPS } from '../src/directorTour.js';

test('published guide uses portable entries and ships every local page/image/evidence link', () => {
  for (const mount of ['/ocean-world/', '/']) {
    const base = new URL(mount, 'https://example.test');
    for (const page of ['overview/index.html', 'overview/poster.html', 'overview/evidence/review.html']) {
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

test('published counts and the complete catalogue agree with the shipped product', () => {
  const guide = JSON.parse(fs.readFileSync('public/overview/inventory.json', 'utf8'));
  const catalogs = [livingShallowsSpeciesCatalog, sceneCatalogs.kelp, sceneCatalogs.deep];
  assert.deepEqual(guide.catalogs.map(c => c.count), catalogs.map(c => c.length));
  for (let i = 0; i < catalogs.length; i++) assert.deepEqual(guide.catalogs[i].entries.map(s => s.id), catalogs[i].map(s => s.id));
  assert.equal(guide.director.chapters, DIRECTOR_STEPS.length);
  assert.equal(guide.director.nominalSeconds, DIRECTOR_STEPS.reduce((n, s) => n + s.durationMs, 0) / 1000);
  assert.equal(guide.validation.counts.animals, 293);
  assert.equal(guide.validation.counts.displayClasses, 38);
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
  const files = fs.readdirSync(`${root}/assets`);
  assert.ok(files.some(f => /^ShallowSampleApp-.*\.js$/.test(f)));
  assert.ok(files.some(f => /^oceanPreparation\.worker-.*\.js$/.test(f)));
  assert.ok(files.some(f => /^oceanTerrain\.worker-.*\.js$/.test(f)));
});
