import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PRIMER_TRAVEL_WINDOWS, primerTravelState, createPrimerPassage, createPrimerCompositor } from '../src/oceanPrimerTravel.js';

test('four bounded journeys fit the unchanged programme without overlap, blackout or depth discontinuity', () => {
  for (const [index, w] of PRIMER_TRAVEL_WINDOWS.entries()) {
    assert.ok(w.start < w.boundary && w.end > w.boundary && w.end <= 450);
    if (index) assert.ok(w.start > PRIMER_TRAVEL_WINDOWS[index - 1].end);
    let previous = primerTravelState(w.start);
    for (let time = w.start; time < w.end; time += .1) {
      const current = primerTravelState(time);
      assert.ok(current.depthM >= 0 && current.depthM <= 3500);
      assert.ok(Math.abs(current.depthM - previous.depthM) < 70);
      assert.ok(current.blend >= 0 && current.blend <= 1);
      assert.ok(['departure', 'travel', 'arrival'].includes(current.leg));
      previous = current;
    }
    assert.equal(primerTravelState(w.end), null);
  }
  assert.equal(primerTravelState(95), null);
  assert.throws(() => primerTravelState(NaN));
});

test('observation travel has finite moving-particle geometry, deterministic seeks and disposal', () => {
  const scene = new THREE.Scene(), passage = createPrimerPassage(scene, { seed: 55 });
  for (const time of [365, 355, 374, 45, 430, 365]) {
    const travel = primerTravelState(time); passage.update(time, travel);
    const pose = passage.cameraPose(time, travel);
    assert.ok(Object.values(pose.position).every(Number.isFinite));
    assert.ok(Object.values(pose.target).every(Number.isFinite));
    assert.equal(passage.diagnostics().travel.depthM, travel.depthM);
  }
  const points = passage.root.children[0];
  assert.equal(points.geometry.attributes.position.count, 700);
  assert.ok([...points.geometry.attributes.position.array].every(Number.isFinite));
  passage.dispose(); passage.dispose(); assert.equal(scene.children.length, 0);
});

test('chapter compositor uses bounded HDR buffers and restores the ordinary screen target', () => {
  const compositor = createPrimerCompositor(), calls = [], a = { scene: new THREE.Scene(), camera: new THREE.Camera() }, b = { ...a };
  compositor.resize(928, 871, 1.5);
  compositor.render({ setRenderTarget: target => calls.push(target), render: () => {} }, a, b, .5);
  assert.equal(calls.length, 3); assert.equal(calls[2], null);
  assert.equal(calls[0].width, 1392); assert.equal(calls[0].height, 1307);
  assert.equal(calls[0].texture.type, THREE.HalfFloatType);
  compositor.dispose();
});
