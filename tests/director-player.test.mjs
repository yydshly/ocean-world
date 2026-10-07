import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import React from 'react';
import { DIRECTOR_STEPS, DIRECTOR_PLAYBACK_RATES, createDirectorState, directorReducer } from '../src/directorTour.js';
import { directorTourProgress } from '../src/directorTourProgress.js';

// Exercise the shipped JSX component and its actual event handlers without a
// browser. This verifies React output, not layout or rendered camera motion.
const source = await readFile(new URL('../src/DirectorPlayer.jsx', import.meta.url), 'utf8');
const componentSource = source.replace(/^import .*;\r?\n/gm, '')
  .replace('export function DirectorPlayer', 'function DirectorPlayer');
const compiled = await transform(componentSource, { loader: 'jsx', jsx: 'transform', target: 'es2022' });
const DirectorPlayer = new Function('React', 'DIRECTOR_PLAYBACK_RATES', 'directorTourProgress', `${compiled.code}\nreturn DirectorPlayer;`)(React, DIRECTOR_PLAYBACK_RATES, directorTourProgress);

const send = (state, type, data = {}) => directorReducer(state, { type, ...data });
const enter = state => send(state, 'entered', { token: state.token });
const render = (state, callbacks = {}) => DirectorPlayer({ state, steps: DIRECTOR_STEPS, ...callbacks });

function elements(value) {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!React.isValidElement(value)) return [];
  return [value, ...elements(value.props.children)];
}

function content(value) {
  if (Array.isArray(value)) return value.map(content).join('');
  if (React.isValidElement(value)) return content(value.props.children);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function byLabel(tree, label) {
  const element = elements(tree).find(item => item.props['aria-label'] === label);
  assert.ok(element, `Actual player output contains ${label}`);
  return element;
}

test('the actual player exposes working camera-rate choices while loading or paused', () => {
  let state = send(createDirectorState(), 'start');
  state = send(state, 'set-rate', { playbackRate: 1.5 });
  const chosen = [];
  for (const phaseState of [state, send(enter(state), 'pause')]) {
    const selector = byLabel(render(phaseState, { onPlaybackRateChange: rate => chosen.push(rate) }), '巡游速度');
    assert.equal(selector.type, 'select');
    assert.equal(selector.props.value, 1.5);
    assert.notEqual(selector.props.disabled, true, 'rate selection remains available without resuming the shot');
    const options = elements(selector.props.children).filter(item => item.type === 'option');
    assert.deepEqual(options.map(item => item.props.value), DIRECTOR_PLAYBACK_RATES);
    assert.deepEqual(options.map(content), ['0.5×', '1×', '1.5×', '2×', '4×']);
    selector.props.onChange({ target: { value: '2' } });
  }
  assert.deepEqual(chosen, [2, 2], 'the shipped handler passes numeric camera rates to the controller');
});

test('the actual countdown scales with rate while progress retains rendered shot time', () => {
  let state = enter(send(createDirectorState(), 'start'));
  state = send(state, 'tick', { token: state.token, deltaMs: 3000 });
  state = send(state, 'set-rate', { playbackRate: 4 });
  const tree = render(state);
  const progress = byLabel(tree, '当前章节巡游进度');
  assert.equal(progress.props['aria-valuenow'], 21);
  assert.equal(progress.props['aria-valuetext'], '21%，剩余 3 秒');
  assert.ok(elements(tree).some(item => content(item) === '3 秒后继续'));
  state = send(state, 'pause');
  state = send(state, 'set-rate', { playbackRate: 0.5 });
  const pausedTree = render(state);
  assert.equal(byLabel(pausedTree, '当前章节巡游进度').props['aria-valuetext'], '21%，剩余 22 秒');
  assert.ok(elements(pausedTree).some(item => content(item) === '暂停中'));
  assert.equal(byLabel(pausedTree, '继续导演演示').type, 'button');
});

test('a completed player can select the last chapter again through its real seek handler', () => {
  const lastIndex = DIRECTOR_STEPS.length - 1;
  let state = enter(send(createDirectorState(), 'start', { index: lastIndex }));
  state = send(state, 'tick', { token: state.token, deltaMs: DIRECTOR_STEPS[lastIndex].durationMs });
  assert.equal(state.phase, 'complete');
  const sought = [];
  const selector = byLabel(render(state, { onSeek: index => sought.push(index) }), '导演演示章节');
  assert.equal(selector.props.value, '', 'completion leaves no chapter preselected, so the last chapter can trigger a change');
  assert.equal(selector.props.disabled, false);
  const options = elements(selector.props.children).filter(item => item.type === 'option');
  assert.equal(options[0].props.value, '');
  assert.equal(options[0].props.disabled, true);
  assert.equal(options.at(-1).props.value, DIRECTOR_STEPS[lastIndex].id);
  selector.props.onChange({ target: { value: DIRECTOR_STEPS[lastIndex].id } });
  assert.deepEqual(sought, [lastIndex]);
});

test('route estimates respond to camera rate without changing completed coverage or paused wording', () => {
  let state = enter(send(createDirectorState(), 'start'));
  state = send(state, 'tick', { token: state.token, deltaMs: 3000 });
  const normal = byLabel(render(state), '导演路线进度');
  assert.equal(normal.props['aria-valuenow'], 0);
  assert.equal(normal.props['aria-valuetext'], '路线位置 0% · 完整播放 0/63 · 剩余约 12:55（另加转场和加载）');

  state = send(state, 'set-rate', { playbackRate: 4 });
  const fast = byLabel(render(state), '导演路线进度');
  assert.equal(fast.props['aria-valuenow'], normal.props['aria-valuenow']);
  assert.equal(fast.props['aria-valuetext'], '路线位置 0% · 完整播放 0/63 · 剩余约 3:14（另加转场和加载）');

  state = send(send(state, 'pause'), 'set-rate', { playbackRate: 0.5 });
  assert.equal(byLabel(render(state), '导演路线进度').props['aria-valuetext'],
    '路线位置 0% · 完整播放 0/63 · 继续播放约 25:50（另加转场和加载）');
});

test('manual last-chapter skips and ending cannot claim that all chapters were played', () => {
  const lastIndex = DIRECTOR_STEPS.length - 1;
  let skipped = enter(send(createDirectorState(), 'start'));
  skipped = send(skipped, 'tick', { token: skipped.token, deltaMs: DIRECTOR_STEPS[0].durationMs });
  skipped = send(skipped, 'seek', { index: lastIndex });
  const seekingTree = render(skipped);
  assert.match(byLabel(seekingTree, '导演路线进度').props['aria-valuetext'], /完整播放 1\/63/);
  assert.ok(content(seekingTree).includes('加载中…'));

  skipped = send(enter(skipped), 'next');
  const manualEnd = render(skipped);
  assert.ok(content(manualEnd).includes('完整播放 1/63 · 尚有 62 章未完整播放'));
  assert.equal(byLabel(manualEnd, '当前章节巡游进度').props['aria-valuenow'], 0,
    'ending the tour does not fill an unseen final chapter');
  assert.ok(!content(manualEnd).includes('全部 63 章已完整播放'));

  let lastOnly = enter(send(createDirectorState(), 'start', { index: lastIndex }));
  lastOnly = send(lastOnly, 'tick', { token: lastOnly.token, deltaMs: DIRECTOR_STEPS[lastIndex].durationMs });
  assert.ok(content(render(lastOnly)).includes('完整播放 1/63 · 尚有 62 章未完整播放'));
  assert.ok(!content(render(lastOnly)).includes('全部 63 章已完整播放'));
});

test('the shipped player claims full completion only after every actual chapter clock completes', () => {
  let state = send(createDirectorState(), 'start');
  for (const step of DIRECTOR_STEPS) {
    state = enter(state);
    state = send(state, 'tick', { token: state.token, deltaMs: step.durationMs });
  }
  assert.equal(state.phase, 'complete');
  const tree = render(state);
  assert.ok(content(tree).includes('全部 63 章已完整播放'));
  assert.ok(content(tree).includes('完整播放 63/63'));
  assert.ok(!content(tree).includes('尚有'));
  assert.equal(byLabel(tree, '当前章节巡游进度').props['aria-valuenow'], 100);
});

test('a scene-only sibling mask follows exact director opacity while pause, skip and seek stay usable', () => {
  const loading = { ...createDirectorState(), active: true, playing: true, phase: 'loading', index: 1 };
  const calls = [];
  const callbacks = { onPause: () => calls.push('pause'), onResume: () => calls.push('resume'),
    onNext: () => calls.push('next'), onStop: () => calls.push('stop'), onSeek: index => calls.push(index) };
  for (const [phase, opacity] of [['out', .17], ['covered', 1], ['in', .33]]) {
    const tree = render({ ...loading, transition: { phase, opacity, kind: 'cross-world' } }, callbacks);
    assert.equal(tree.type, React.Fragment);
    const mask = elements(tree).find(item => item.props.className === 'director-scene-transition');
    const player = byLabel(tree, '导演演示播放器');
    assert.ok(mask); assert.equal(mask.props['aria-hidden'], 'true');
    assert.equal(mask.props.style.opacity, opacity, 'the hook numeric value reaches the mask without another animation clock');
    assert.equal(mask.props['data-transition-phase'], phase);
    assert.equal(mask.props['data-transition-kind'], 'cross-world');
    assert.ok(!elements(mask).includes(player), 'the player is a sibling rather than inside the obscured scenery');
    assert.ok(content(tree).includes('自然转场中')); assert.ok(content(tree).includes('转往另一海域'));
    assert.ok(content(tree).includes('加载中…'), 'loading remains distinct from a rendered chapter countdown');
    byLabel(tree, '暂停导演演示').props.onClick();
    const next = elements(player).find(item => item.type === 'button' && content(item) === '下一章');
    assert.notEqual(next.props.disabled, true); next.props.onClick();
    const chapters = byLabel(tree, '导演演示章节'); assert.equal(chapters.props.disabled, false);
    chapters.props.onChange({ target: { value: DIRECTOR_STEPS[2].id } });
    byLabel(tree, '退出导演演示').props.onClick();
  }
  assert.deepEqual(calls, ['pause', 'next', 2, 'stop', 'pause', 'next', 2, 'stop', 'pause', 'next', 2, 'stop']);
  const paused = render({ ...loading, playing: false, error: '当前海域尚未就绪',
    transition: { phase: 'covered', opacity: 1, kind: 'reposition' } }, callbacks);
  assert.ok(content(paused).includes('已暂停 · 自然转场中'));
  assert.ok(content(paused).includes('转往另一观察点'));
  assert.ok(elements(paused).some(item => item.props.role === 'alert' && content(item) === '当前海域尚未就绪'));
  byLabel(paused, '继续导演演示').props.onClick(); assert.equal(calls.at(-1), 'resume');
});

test('nearby shot linking stays visible and completion or idle cannot retain a stale mask', () => {
  const loading = { ...createDirectorState(), active: true, playing: true, phase: 'loading' };
  for (const phase of ['none', 'move']) {
    const tree = render({ ...loading, transition: { phase, opacity: 1, kind: 'nearby' } });
    assert.equal(elements(tree).some(item => item.props.className === 'director-scene-transition'), false);
    assert.ok(content(tree).includes('镜头衔接中'));
    assert.ok(!content(tree).includes('转往另一海域'));
    assert.ok(!content(tree).includes('自然转场中'));
  }
  const stale = { phase: 'covered', opacity: 1, kind: 'cross-world' };
  assert.equal(render({ ...createDirectorState(), transition: stale }), null);
  const completed = render({ ...createDirectorState(), phase: 'complete', transition: stale });
  assert.equal(elements(completed).some(item => item.props.className === 'director-scene-transition'), false);
});

test('shipped mask styling sits below controls and adds no asynchronous opacity animation', async () => {
  const css = await readFile(new URL('../src/directorPlayer.css', import.meta.url), 'utf8');
  const rule = className => css.match(new RegExp(`\\.${className}\\{([^}]*)\\}`))?.[1];
  const mask = rule('director-scene-transition'), player = rule('director-player');
  assert.ok(mask); assert.match(mask, /position:absolute/); assert.match(mask, /inset:0/);
  assert.match(mask, /pointer-events:none/); assert.match(mask, /background:#061f28/);
  assert.equal(Number(mask.match(/z-index:(\d+)/)?.[1]), 2);
  assert.ok(Number(player.match(/z-index:(\d+)/)?.[1]) > 2);
  assert.match(mask, /transition:none/); assert.ok(!mask.includes('animation:'));
  assert.match(css, /prefers-reduced-motion:reduce/);
});
