import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { oceanKeyboardTargetConsumesInput } from '../src/oceanKeyboardInput.js';

// Execute the real handlers installed by ReefWorld, without constructing a
// WebGL renderer or replacing the production keyboard logic with a test copy.
const source = readFileSync(new URL('../src/world/ReefWorld.js', import.meta.url), 'utf8');
const start = source.indexOf('      this.onKeyDown = ');
const end = source.indexOf("      window.addEventListener('keydown'", start);
assert.ok(start >= 0 && end > start);
const installHandlers = new Function('oceanKeyboardTargetConsumesInput',
  `return function(){${source.slice(start, end)}}`)(oceanKeyboardTargetConsumesInput);
const worldFixture = () => {
  const world = { keys: new Set(), directorStops: 0, stopDirectorMotion() { this.directorStops++; } };
  installHandlers.call(world);
  return world;
};
const element = (tagName, parentElement = null, attributes = {}, isContentEditable = false) => ({
  tagName, parentElement, isContentEditable,
  getAttribute: name => Object.hasOwn(attributes, name) ? attributes[name] : null,
});
const key = (target, code) => ({ target, code, defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true; } });

test('production handlers preserve Space activation on buttons, links and other native controls', () => {
  for (const tag of ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'SELECT', 'TEXTAREA']) {
    const world = worldFixture(), event = key(element(tag), 'Space');
    world.onKeyDown(event);
    assert.equal(event.defaultPrevented, false, `${tag} retains its default activation/editing behavior`);
    assert.equal(world.directorStops, 0);
    assert.equal(world.keys.size, 0);
  }
});

test('nested labels, SVG icons and text nodes retain their enclosing control keyboard behavior', () => {
  for (const parent of [element('BUTTON'), element('A'), element('DIV', null, { role: 'button' })]) {
    const world = worldFixture(), icon = element('path', element('svg', parent));
    for (const target of [element('SPAN', parent), icon, { nodeType: 3, parentElement: parent }]) {
      const event = key(target, 'KeyW');
      world.onKeyDown(event);
      assert.equal(event.defaultPrevented, false);
      assert.equal(world.directorStops, 0, 'a UI key must not take over the moving camera');
      assert.equal(world.keys.size, 0);
    }
  }
});

test('contenteditable regions and ARIA input controls keep editing and navigation keys', () => {
  const targets = ['', 'true', 'plaintext-only'].map(value =>
    element('SPAN', element('DIV', null, { contenteditable: value })));
  targets.push(element('DIV', null, {}, true));
  for (const role of ['textbox', 'combobox', 'slider', 'spinbutton', 'listbox', 'menuitem', 'checkbox', 'radio', 'switch', 'tab']) {
    targets.push(element('SPAN', element('DIV', null, { role })));
  }
  for (const target of targets) {
    const world = worldFixture(), event = key(target, 'KeyE');
    world.onKeyDown(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(world.directorStops, 0);
    assert.equal(world.keys.size, 0);
  }
});

test('scene WASDQE still take over the director, suppress page defaults and release on keyup', () => {
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']) {
    const world = worldFixture(), event = key(element('CANVAS'), code);
    world.onKeyDown(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(world.directorStops, 1);
    assert.equal(world.keys.has(code), true);
    world.onKeyUp(event);
    assert.equal(world.keys.size, 0);
  }
  const world = worldFixture(), shift = key(element('BODY'), 'ShiftLeft');
  world.onKeyDown(shift);
  assert.equal(world.keys.has('ShiftLeft'), true, 'the existing travel speed modifier is retained');
  assert.equal(shift.defaultPrevented, false);
  assert.equal(world.directorStops, 0);
});

test('changing focus while a movement key is held cannot leave a camera key stuck', () => {
  const world = worldFixture();
  world.onKeyDown(key(element('CANVAS'), 'KeyW'));
  const uiRepeat = key(element('SPAN', element('BUTTON')), 'KeyW');
  world.onKeyDown(uiRepeat);
  assert.equal(world.keys.has('KeyW'), false);
  assert.equal(world.directorStops, 1, 'the UI repeat must not issue another camera takeover');
  assert.equal(uiRepeat.defaultPrevented, false);
  world.keys.add('KeyQ');
  world.onKeyUp(key(element('TEXTAREA'), 'KeyQ'));
  assert.equal(world.keys.size, 0, 'keyup releases regardless of the new focus target');
  world.keys.add('KeyD'); world.keys.add('ShiftLeft'); world.onBlur();
  assert.equal(world.keys.size, 0, 'window blur retains the existing emergency release');
});
