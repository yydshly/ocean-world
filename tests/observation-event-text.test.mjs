import test from 'node:test';
import assert from 'node:assert/strict';
import { ReefSimulation } from '../src/simulation.js';
import { speciesById } from '../src/species.js';
import { observationEventCause } from '../src/observationEventText.js';

test('a real ordinary reef predation event keeps its cause and cannot become a sea-spider event', () => {
  const sim = new ReefSimulation(42);
  const predator = sim.agents.find(agent => agent.speciesId === 'honeycomb-grouper');
  const prey = sim.agents.find(agent => agent.speciesId === 'green-chromis');
  // Put an existing predator and prey into an exposed contact pose, then let
  // the actual Simulation producer decide whether and how to emit predation.
  const position = { x: 0, y: sim.supportHeight(0, 0) + 1, z: 0 };
  predator.position = { ...position }; predator.home = { ...position }; predator.energy = .5;
  prey.position = { ...position, x: .05 };
  sim._updateFish(predator, speciesById[predator.speciesId], [predator, prey], [predator], [prey], position, .1, 1);
  const event = sim.events.find(item => item.type === 'predation');
  assert.ok(event, 'the actual reef producer must emit the event used by the regression');
  assert.equal(prey.alive, false);
  assert.equal(event.removedUnits, undefined);
  assert.equal(event.gainUnits, undefined);
  let text;
  assert.doesNotThrow(() => { text = observationEventCause(event); });
  assert.equal(text, event.cause);
  assert.doesNotMatch(text, /海蜘蛛|海葵|0\.00000/);
});

test('the deep predation schema preserves its finite condition-transfer values and units', () => {
  // Fields and unit are the schema emitted by feedDeepPredator; condition
  // transfer is distinct from the ordinary reef fish predation above.
  const event = { type: 'predation', unit: 'dimensionless-condition-index', removedUnits: .00003,
    gainUnits: .000024, cause: '接触已有活海葵触手后转移少量体况指数。' };
  const text = observationEventCause(event);
  assert.match(text, /海葵体况减少 0\.00003/);
  assert.match(text, /海蜘蛛获得 0\.00002/);
  assert.match(text, /无量纲条件能量转移/);
  assert.equal(event.removedUnits, .00003);
  assert.equal(event.gainUnits, .000024);
});

test('missing, nonfinite or differently measured predation values retain the real cause without fabricated zeroes', () => {
  const base = { type: 'predation', unit: 'dimensionless-condition-index', removedUnits: .00003, gainUnits: .000024, cause: '实际捕食原因' };
  const cases = [
    { ...base, removedUnits: undefined }, { ...base, gainUnits: undefined },
    { ...base, removedUnits: NaN }, { ...base, gainUnits: Infinity },
    { ...base, removedUnits: '.00003' }, { ...base, unit: undefined },
    { ...base, unit: 'organic-carbon' },
  ];
  for (const event of cases) assert.equal(observationEventCause(event), event.cause);
  assert.equal(observationEventCause({ type: 'predation' }), undefined);
});

test('kelp drift uses finite real intake values and never substitutes missing stock with zero', () => {
  const cause = '已有落料的实际摄食';
  assert.match(observationEventCause({ type: 'kelp-drift-feeding', removedUnits: .012345678, cause }), /0\.012346 相对藻料/);
  assert.match(observationEventCause({ type: 'kelp-drift-feeding', removedUnits: 2e-8, cause }), /2\.00e-8 相对藻料/);
  for (const removedUnits of [undefined, null, NaN, Infinity, '0.1', 0, -1]) {
    assert.equal(observationEventCause({ type: 'kelp-drift-feeding', removedUnits, cause }), cause);
  }
});

test('other native feeding explanations keep resource names, finite intake and source causes', () => {
  const resourceNames = { plankton: '浮游食物' };
  assert.match(observationEventCause({ type: 'feeding', actualIntake: .123456, foodPool: 'plankton' }, resourceNames), /浮游食物后摄入 0\.12346/);
  assert.match(observationEventCause({ type: 'feeding', cause: '接近局部 plankton 斑块后移出 0.004' }, resourceNames), /附近找到浮游食物.*0\.004/);
  assert.equal(observationEventCause({ type: 'death', cause: '能量耗尽' }, resourceNames), '能量耗尽');
  assert.equal(observationEventCause({ type: 'feeding', actualIntake: Infinity, cause: '未有有效摄食记录' }), '未有有效摄食记录');
});
