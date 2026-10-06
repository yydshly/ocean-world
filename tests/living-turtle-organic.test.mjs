import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeLivingNetwork, initializeLivingTurtleOrganic, recordLivingSeagrassGrazing,
  livingNetworkBalance, validateLivingNetworkRecord, tickLivingNetwork, summarizeLivingNetwork } from '../src/livingEcologyNetwork.js';

const noSupply = { lightAtDepth: 0, foodSupply: 0, currentMps: 0 };
const species = { grazer: { guild: 'grazer' } };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
function fixture() {
  const region = { id: '5,7', timeSec: 40,
    resources: { algae: .1, plankton: .2, detritus: .1 },
    ledger: { initial: .4, input: 0, ingested: 0, exported: 0 },
    agents: [{ id: 'grazer:5,7', speciesId: 'grazer', alive: true, energy: .5 }],
    turtleAgents: [
      { id: 'turtle:5,7:a', alive: true, energy: .5, state: 'patrolling', position: { x: 340, y: -3, z: 470 } },
      { id: 'turtle:5,7:b', alive: true, energy: .8, state: 'surfacing', position: { x: 345, y: 4, z: 475 } },
      { id: 'turtle:5,7:dead', alive: false, energy: 0, state: 'dead', position: { x: 348, y: -4, z: 472 } },
    ],
  };
  initializeLivingNetwork(region, { elements: Array.from({ length: 24 }, () => ({ kind: 'seagrass' })) });
  return region;
}
function balanced(region) {
  near(livingNetworkBalance(region), 0);
  assert.ok(validateLivingNetworkRecord(region));
}

test('legacy turtle records remain outside the existing material boundary until an explicit admission', () => {
  const region = fixture(), before = structuredClone(region.turtleAgents);
  balanced(region);
  const summary = summarizeLivingNetwork([region], species);
  assert.equal(summary.turtleGrazing, undefined);
  assert.equal(summary.coverage.seagrassGrazing, undefined);
  assert.equal(summary.consumerOrganicUnits, .004);
  tickLivingNetwork(region, noSupply, 1);
  assert.deepEqual(region.turtleAgents, before);
  balanced(region);
  const noTurtles = fixture(); delete noTurtles.turtleAgents;
  assert.equal(initializeLivingTurtleOrganic(noTurtles), false);
  assert.equal(initializeLivingTurtleOrganic({ turtleAgents: [] }), false);
});

test('admission records live turtle stocks once without recomputing history or reviving a death', () => {
  const region = fixture(), before = structuredClone(region);
  assert.equal(initializeLivingTurtleOrganic(region), true);
  assert.equal(region.turtleOrganicVersion, 1);
  assert.equal(region.turtleOrganicInitializedAtSec, 40);
  assert.equal(region.turtleOrganic.initialInputUnits, .008);
  assert.equal(region.basicNetwork.ledger.initial, before.basicNetwork.ledger.initial);
  assert.equal(region.basicNetwork.ledger.externalInput, .008);
  assert.equal(region.basicNetwork.processTotals.externalInput, .008);
  assert.deepEqual(region.resources, before.resources);
  assert.deepEqual(region.ledger, before.ledger);
  assert.deepEqual(region.agents, before.agents);
  for (let index = 0; index < region.turtleAgents.length; index++) {
    const { organicUnits, organicDeathRecorded, ...oldFields } = region.turtleAgents[index];
    assert.deepEqual(oldFields, before.turtleAgents[index]);
    assert.equal(organicUnits, before.turtleAgents[index].alive ? .004 : 0);
    assert.equal(organicDeathRecorded, !before.turtleAgents[index].alive);
  }
  balanced(region);
  const admitted = structuredClone(region);
  assert.equal(initializeLivingTurtleOrganic(region), false);
  assert.deepEqual(region, admitted);
  assert.equal(initializeLivingTurtleOrganic(admitted), false);
  assert.deepEqual(admitted, region);
});

test('a real plant debit transfers 60 percent to the turtle, 25 to residues and 15 to output', () => {
  const region = fixture(); initializeLivingTurtleOrganic(region);
  const turtle = region.turtleAgents[0], before = structuredClone(region);
  assert.equal(recordLivingSeagrassGrazing(region, turtle, .01), .01);
  near(region.basicNetwork.plantOrganicUnits, before.basicNetwork.plantOrganicUnits - .01);
  near(turtle.organicUnits, .01);
  near(region.resources.detritus, before.resources.detritus + .0025);
  near(region.ledger.networkAdded, before.ledger.networkAdded + .0025);
  assert.equal(region.ledger.ingested, before.ledger.ingested);
  near(region.basicNetwork.ledger.output, .0015);
  near(region.basicNetwork.processTotals.systemOutput, .0015);
  near(region.basicNetwork.processTotals.ingestion, .01);
  near(region.basicNetwork.processTotals.feedingDetritus, .0025);
  near(region.turtleOrganic.counters.seagrassGrazedUnits, .01);
  balanced(region);
  const restored = structuredClone(region), saved = structuredClone(region);
  assert.equal(initializeLivingTurtleOrganic(restored), false);
  assert.deepEqual(restored, saved);
  balanced(restored);
});

test('grazing is bounded by actual plant stocks and body capacity; excess retention becomes output', () => {
  const region = fixture(); initializeLivingTurtleOrganic(region);
  const turtle = region.turtleAgents[0];
  assert.equal(recordLivingSeagrassGrazing(region, turtle, 1), .06);
  near(turtle.organicUnits, .04);
  assert.equal(region.basicNetwork.plantOrganicUnits, 0);
  const empty = structuredClone(region);
  assert.equal(recordLivingSeagrassGrazing(region, turtle, .01), 0);
  assert.deepEqual(region, empty);
  // Transfer existing nutrients to plants solely to test a full body, keeping
  // the boundary closed instead of inventing an unrecorded food refill.
  region.basicNetwork.nutrients -= .02; region.basicNetwork.plantOrganicUnits += .02;
  const outputBefore = region.basicNetwork.ledger.output;
  assert.equal(recordLivingSeagrassGrazing(region, turtle, .02), .02);
  near(turtle.organicUnits, .04);
  near(region.basicNetwork.ledger.output - outputBefore, .015);
  near(region.turtleOrganic.counters.seagrassGrazedUnits, .08);
  balanced(region);
});

test('only an admitted living turtle can receive plant material and invalid quantities cannot change stocks', () => {
  const region = fixture(), original = structuredClone(region);
  assert.equal(recordLivingSeagrassGrazing(region, region.turtleAgents[0], .01), 0);
  assert.deepEqual(region, original);
  initializeLivingTurtleOrganic(region);
  const before = structuredClone(region);
  assert.equal(recordLivingSeagrassGrazing(region, region.turtleAgents[2], .01), 0);
  assert.equal(recordLivingSeagrassGrazing(region, structuredClone(region.turtleAgents[0]), .01), 0);
  assert.equal(recordLivingSeagrassGrazing(region, region.turtleAgents[0], 0), 0);
  for (const quantity of [-1, NaN, Infinity])
    assert.throws(() => recordLivingSeagrassGrazing(region, region.turtleAgents[0], quantity), RangeError);
  assert.deepEqual(region, before);
  balanced(region);
});

test('registered turtle metabolism and a real death preserve balance without repeating carcass material', () => {
  const region = fixture(); initializeLivingTurtleOrganic(region);
  const turtle = region.turtleAgents[0], bodyBefore = turtle.organicUnits;
  tickLivingNetwork(region, noSupply, 1);
  near(bodyBefore - turtle.organicUnits, bodyBefore * .0001);
  balanced(region);
  const bodyAtDeath = turtle.organicUnits, detritusBefore = region.resources.detritus;
  turtle.alive = false; turtle.state = 'dead'; turtle.energy = 0;
  tickLivingNetwork(region, noSupply, 0);
  assert.equal(turtle.organicUnits, 0);
  assert.equal(turtle.organicDeathRecorded, true);
  near(region.resources.detritus - detritusBefore, bodyAtDeath);
  near(region.basicNetwork.processTotals.deathDetritus, bodyAtDeath);
  balanced(region);
  const accounted = structuredClone(region);
  tickLivingNetwork(region, noSupply, 0);
  assert.deepEqual(region, accounted);
});

test('partial, invalid or unbalanced turtle extensions fail validation rather than being repaired', () => {
  const old = fixture();
  const partial = structuredClone(old); partial.turtleAgents[0].organicUnits = .004;
  assert.equal(validateLivingNetworkRecord(partial), false);
  const partialBefore = structuredClone(partial);
  assert.equal(initializeLivingTurtleOrganic(partial), false);
  assert.deepEqual(partial, partialBefore);
  const admitted = fixture(); initializeLivingTurtleOrganic(admitted);
  const corruptions = [
    row => { delete row.turtleOrganicVersion; },
    row => { delete row.turtleOrganicInitializedAtSec; },
    row => { row.turtleOrganicInitializedAtSec = row.timeSec + 1; },
    row => { row.turtleOrganicVersion = 2; },
    row => { row.turtleAgents = {}; },
    row => { row.turtleAgents[0] = null; },
    row => { row.turtleOrganic.initialInputUnits = -.1; },
    row => { row.turtleOrganic.counters.seagrassGrazedUnits = NaN; },
    row => { row.turtleOrganic.counters.seagrassGrazedUnits = .1; },
    row => { row.turtleAgents[0].organicUnits = -.1; },
    row => { row.turtleAgents[0].organicUnits += .1; },
    row => { row.turtleAgents[0].organicDeathRecorded = true; },
    row => { delete row.turtleAgents[1].organicDeathRecorded; },
  ];
  for (const corrupt of corruptions) {
    const row = structuredClone(admitted); corrupt(row);
    assert.equal(validateLivingNetworkRecord(row), false);
    const unchanged = structuredClone(row);
    assert.equal(initializeLivingTurtleOrganic(row), false);
    assert.deepEqual(row, unchanged);
  }
  balanced(old); balanced(admitted);
});

test('summary includes registered stocks and distinguishes the grazer role from actual observed plant consumption', () => {
  const region = fixture(); region.agents = [];
  // Keep the old material boundary valid while removing this fixture's fish.
  region.basicNetwork.ledger.output += .004; region.basicNetwork.processTotals.systemOutput += .004;
  initializeLivingTurtleOrganic(region);
  const before = summarizeLivingNetwork([region], {});
  assert.equal(before.coverage.grazing, true);
  assert.equal(before.coverage.seagrassGrazing, false);
  assert.equal(before.turtleGrazing.registeredCount, 3);
  assert.equal(before.turtleGrazing.aliveCount, 2);
  near(before.consumerOrganicUnits, .008);
  near(before.turtleGrazing.initialInputUnits, .008);
  near(before.turtleGrazing.seagrassGrazedUnits, 0);
  recordLivingSeagrassGrazing(region, region.turtleAgents[0], .01);
  const after = summarizeLivingNetwork([region], {});
  assert.equal(after.coverage.seagrassGrazing, true);
  near(after.consumerOrganicUnits, .014);
  near(after.turtleGrazing.seagrassGrazedUnits, .01);
  balanced(region);
});
