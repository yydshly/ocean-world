import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createKelpOceanGenerator } from '../src/kelpOceanGeneration.js';
const root = new URL('../output/validation/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(`kelp-visitor-browser-${name}.json`, root), 'utf8'));
const sort = rows => structuredClone(rows).sort((a, b) => a.id.localeCompare(b.id));
const before = read('before'), upgraded = read('upgrade');
const old = before.ocean.ecology, current = upgraded.ocean.ecology;
const generator = createKelpOceanGenerator('42');
assert.equal(before.paused, true); assert.equal(upgraded.paused, true); assert.equal(upgraded.speed, 1);
assert.deepEqual(sort(current.agents.filter(a => a.speciesId !== 'leopard-shark')), sort(old.agents));
assert.ok(current.agents.some(a => a.speciesId === 'leopard-shark'));
for (const region of current.regions) {
  const expected = old.regions.find(r => r.id === region.id), copy = structuredClone(region);
  assert.ok(expected); assert.equal(copy.visitorCommunityVersion, 1);
  const added = current.agents.filter(a => a.regionId === copy.id && a.speciesId === 'leopard-shark');
  assert.equal(copy.visitorAgentCount, added.length); assert.ok(added.length <= 1); assert.ok(copy.agentCount <= 20);
  copy.agentCount -= added.length; copy.alive -= added.filter(a => a.alive).length;
  for (const key of ['visitorCommunityVersion', 'visitorInitializedAtSec', 'visitorAgentCount']) delete copy[key];
  assert.deepEqual(copy, expected, `${region.id}: all old public regional fields retained`);
}
let checks = 4 + old.agents.length + old.regions.length;
let traveledM = null, patrolSeconds = null, patrolDisplacementM = null;
if (process.argv.length > 2) {
  const arrival = read('arrival'), start = read('patrol-start'), end = read('patrol-end'), departure = read('departure'), away = read('away');
  assert.equal(arrival.speed, 1); assert.equal(arrival.paused, false);
  traveledM = Math.hypot(...arrival.ocean.worldPosition.map((v, i) => v - upgraded.ocean.worldPosition[i]));
  assert.ok(traveledM > 60); assert.equal(arrival.ocean.ecology.regions.length, 9);
  assert.equal(start.speed, 1); assert.equal(end.speed, 1);
  const shark = start.ocean.ecology.agents.find(a => a.id === start.selectedAgentId), finished = end.ocean.ecology.agents.find(a => a.id === shark.id);
  assert.equal(shark.speciesId, 'leopard-shark'); assert.equal(finished.alive, true);
  patrolSeconds = finished.timeSec - shark.timeSec;
  patrolDisplacementM = Math.hypot(...['x', 'y', 'z'].map(axis => finished.position[axis] - shark.position[axis]));
  assert.ok(patrolSeconds > 5 && patrolDisplacementM > .3 && patrolDisplacementM <= .28 * patrolSeconds + 1e-8);
  assert.equal(away.ocean.ecology.regions.length, 9); assert.equal(away.paused, true);
  assert.ok(departure.ocean.ecology.regions.every(r => !away.ocean.ecology.regions.some(n => n.id === r.id)), 'all nine old owners genuinely unloaded');
  checks += 12;
  for (const phase of ['upgrade', 'arrival', 'patrol-start', 'patrol-end', 'departure', 'away', ...process.argv.slice(2)]) {
    const receipt = read(phase); assert.deepEqual(receipt.errors, []);
    for (const a of receipt.ocean.ecology.agents.filter(a => a.speciesId === 'leopard-shark')) {
      assert.equal(Object.hasOwn(a, 'energy'), false); assert.equal(Object.hasOwn(a, 'lastFeedAt'), false);
      assert.equal(a.regionId, `${Math.floor(a.position.x / 64)},${Math.floor(a.position.z / 64)}`);
      assert.ok(a.position.y + .33 * a.sizeM <= 11.5);
      for (let i = 0; i < 9; i++) {
        const angle = (i - 1) * Math.PI / 4, radius = i ? .58 * a.sizeM + .12 : 0;
        assert.ok(a.position.y - .33 * a.sizeM >= generator.heightAt(a.position.x + Math.cos(angle) * radius, a.position.z + Math.sin(angle) * radius) + .25 - 1e-9);
        checks++;
      }
    }
  }
}
for (const phase of process.argv.slice(2)) {
  const rows = read(phase);
  if (phase === 'pause' || phase === 'revisit' || phase === 'refresh') {
    const reference = read(phase === 'pause' ? 'patrol-end' : phase === 'revisit' ? 'departure' : 'refresh-before');
    assert.equal(rows.paused, true); assert.equal(rows.speed, 1);
    assert.deepEqual(sort(rows.ocean.ecology.agents), sort(reference.ocean.ecology.agents));
    assert.deepEqual(sort(rows.ocean.ecology.regions), sort(reference.ocean.ecology.regions));
    assert.deepEqual(rows.explorationMemory.points, reference.explorationMemory.points);
    checks += rows.ocean.ecology.agents.length + rows.ocean.ecology.regions.length + 3;
  }
}
const receipt = { schema: 'kelp-visitor-public-browser-checks-v1', checks,
  oldAnimals: old.agents.length, oldRegions: old.regions.length,
  newVisitors: current.agents.filter(a => a.speciesId === 'leopard-shark').length,
  traveledM, patrolSeconds, patrolDisplacementM,
  phases: process.argv.slice(2), scope: 'Complete published records only. Hidden state, actual support and body references have independent model/renderer tests.' };
writeFileSync(new URL('kelp-visitor-browser-check-result.json', root), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
