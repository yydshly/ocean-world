import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import React from 'react';

// Compile the shipped component and App callback. Invoke the real rendered
// button handler; this checks navigation ownership without claiming browser QA.
const source = await readFile(new URL('../src/OceanApp.jsx', import.meta.url), 'utf8');
const start = source.indexOf('function LivingDiscoveries(');
const end = source.indexOf('export function OceanApp', start);
assert.ok(start >= 0 && end > start);
const compiled = await transform(source.slice(start, end), { loader: 'jsx', jsx: 'transform', target: 'es2022' });
const LivingDiscoveries = new Function('React', `${compiled.code}\nreturn LivingDiscoveries;`)(React);
const callbackSource = source.match(/  const travelDiscovery=[^\r\n]+/);
assert.ok(callbackSource, 'the real App provides a discovery navigation callback');
const makeTravel = (director, setPendingDemo, world) => new Function('director', 'setPendingDemo', 'world',
  `${callbackSource[0]}\nreturn travelDiscovery;`)(director, setPendingDemo, world);

const discoveries = () => ({ recorded: 0, status: 'saved', nearby: [
  { id: 'bottle-real-17', title: '沉底瓶', distanceM: 14.3, recorded: false },
  { id: 'driftwood-real-9', title: '沉木', distanceM: 26.8, recorded: false },
] });

function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!React.isValidElement(value)) return [];
  return [value, ...elements(value.props.children)];
}

const buttons = props => elements(LivingDiscoveries(props)).filter(item => item.type === 'button');

test('the real discovery button releases the director and pending entry before native travel', () => {
  const calls = [];
  let active = true, pending = { directorToken: 12 }, motion = { elapsedSec: 3 };
  const director = { stop() { calls.push('stop'); active = false; motion = null; } };
  const setPendingDemo = value => { calls.push(['pending', value]); pending = value; };
  const world = { current: { travelLivingDiscovery(id) {
    assert.equal(active, false);
    assert.equal(motion, null, 'native travel acquires a camera already released by the director');
    assert.equal(pending, null, 'an old chapter cannot reapply after manual navigation');
    calls.push(['travel', id]); return true;
  } } };
  const onTravel = makeTravel(director, setPendingDemo, world);
  const tree = buttons({ discoveries: discoveries(), world, ready: true, onTravel });
  assert.equal(tree.length, 2);
  assert.equal(tree[0].props.disabled, false);
  assert.equal(tree[0].props.onClick(), true);
  assert.deepEqual(calls, ['stop', ['pending', null], ['travel', 'bottle-real-17']]);
  const instances = source.match(/<LivingDiscoveries\b[^>]*\/>/g);
  assert.equal(instances?.length, 2);
  assert.ok(instances.every(instance => instance.includes('onTravel={travelDiscovery}')),
    'both the chapter panel and ordinary discovery listing share camera ownership');
});

test('a refused discovery trip preserves the actual discovery records and does not substitute another trip', () => {
  const calls = [], records = discoveries(), before = structuredClone(records);
  const world = { current: { travelLivingDiscovery(id) { calls.push(['travel', id]); return false; } } };
  const onTravel = makeTravel({ stop() { calls.push('stop'); } }, value => calls.push(['pending', value]), world);
  const tree = buttons({ discoveries: records, world, ready: true, onTravel });
  assert.equal(tree[1].props.onClick(), false);
  assert.deepEqual(calls, ['stop', ['pending', null], ['travel', 'driftwood-real-9']]);
  assert.deepEqual(records, before, 'refused travel cannot manufacture a discovery record');
});

test('manual component use retains native travel and only exposes supplied discoveries', () => {
  const visited = [];
  const world = { current: { travelLivingDiscovery(id) { visited.push(id); return true; } } };
  const tree = buttons({ discoveries: discoveries(), world, ready: true });
  assert.equal(tree[0].props.onClick(), true);
  assert.deepEqual(visited, ['bottle-real-17']);
  assert.equal(buttons({ discoveries: { recorded: 0, status: 'saved', nearby: [] }, world, ready: true }).length, 0);
  assert.equal(LivingDiscoveries({ discoveries: null, world, ready: true }), null);
});

test('loading keeps discovery buttons disabled and a disappeared world makes no navigation request', () => {
  const world = { current: null }, calls = [];
  const onTravel = makeTravel({ stop() { calls.push('stop'); } }, value => calls.push(['pending', value]), world);
  const tree = buttons({ discoveries: discoveries(), world, ready: false, onTravel });
  assert.ok(tree.every(button => button.props.disabled));
  // A stale event may settle after the world is disposed; it must not invent
  // another renderer, discovery or path even if called programmatically.
  assert.equal(tree[0].props.onClick(), false);
  assert.deepEqual(calls, ['stop', ['pending', null]]);
});
